from __future__ import annotations

import argparse

from .models import Portfolio
from .rebalance import rebalance
from .loaders import load_positions_csv, load_prices_csv, load_targets_csv
from .execution import apply_trades


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="portfolio-rebalancer")
    sub = p.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("rebalance")
    r.add_argument("--positions", required=True)
    r.add_argument("--targets", required=True)
    r.add_argument("--prices", required=True)
    r.add_argument("--cash", type=float, required=True)
    r.add_argument("--mode", default="TRADE", choices=["BUY", "TRADE", "SELL"])
    r.add_argument("--fractional", action="store_true")
    r.add_argument("--min-notional", type=float, default=0.0)
    r.add_argument(
        "--show-post", action="store_true", help="Print post-trade portfolio snapshot"
    )

    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.cmd == "rebalance":
        positions = load_positions_csv(args.positions)
        prices = load_prices_csv(args.prices)
        target = load_targets_csv(args.targets)

        pf = Portfolio(positions=positions, cash=float(args.cash))
        res = rebalance(
            pf,
            target,
            prices,
            mode=args.mode,
            allow_fractional=bool(args.fractional),
            min_trade_notional=float(args.min_notional),
        )

        for t in res.trades:
            print(f"{t.side},{t.ticker},{t.quantity},{t.price},{t.notional}")
        print(f"CASH_BEFORE,{res.cash_before}")
        print(f"CASH_AFTER,{res.cash_after}")

        if args.show_post:
            asset_type_by_ticker = {p.ticker: p.asset_type for p in positions}

            post_pf = apply_trades(
                pf,
                res.trades,
                asset_type_by_ticker=asset_type_by_ticker,
            )

            print("POST_PORTFOLIO")
            print(f"POST_CASH,{post_pf.cash}")

            total_positions_value = 0.0
            for p in post_pf.positions:
                px = float(prices[p.ticker])  # mark-to-market usando prices.csv
                mv = float(p.quantity) * px
                total_positions_value += mv
                print(f"POST_POSITION,{p.ticker},{p.asset_type},{p.quantity},{px},{mv}")

            print(f"POST_TOTAL_VALUE,{total_positions_value + float(post_pf.cash)}")

        return 0

    return 2
