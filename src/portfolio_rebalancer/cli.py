from __future__ import annotations

import argparse

from .models import Portfolio
from .rebalance import rebalance
from .loaders import load_positions_csv, load_prices_csv, load_targets_csv


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
            print(f"{t.side},{t.ticker},{t.quantity},{t.price}")
        print(f"CASH_BEFORE,{res.cash_before}")
        print(f"CASH_AFTER,{res.cash_after}")
        return 0

    return 2
