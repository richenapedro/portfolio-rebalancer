from __future__ import annotations

import argparse
from pathlib import Path

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

    i = sub.add_parser("import-b3")
    i.add_argument("--input", required=True, help="Path to B3 XLSX file")
    i.add_argument("--out", default="out", help="Output directory for generated CSVs")
    i.add_argument("--user-id", default="default", help="User id (future storage key)")
    i.add_argument("--no-tesouro", action="store_true", help="Skip 'Tesouro Direto'")

    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.cmd == "import-b3":
        from .importers.b3_xlsx import import_b3_xlsx
        from .importers.csv_export import write_positions_csv, write_prices_csv

        res = import_b3_xlsx(
            Path(args.input),
            user_id=str(args.user_id),
            include_tesouro=not bool(args.no_tesouro),
        )

        out_dir = Path(args.out)
        pos_path = write_positions_csv(res, out_dir / "positions.csv")
        prices_path = write_prices_csv(res, out_dir / "prices.csv")

        print(f"OK: wrote {pos_path}")
        print(f"OK: wrote {prices_path}")

        if res.warnings:
            print("WARNINGS:")
            for w in res.warnings:
                print(f"- {w}")

        return 0

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
