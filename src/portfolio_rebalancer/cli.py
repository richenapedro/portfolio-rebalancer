from __future__ import annotations

import argparse
from pathlib import Path

from .execution import apply_trades
from .loaders import load_positions_csv, load_prices_for_positions, load_targets_csv
from .models import Portfolio
from .rebalance import rebalance


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="portfolio-rebalancer")
    sub = p.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("rebalance")
    r.add_argument("--positions", required=True, help="Path to positions.csv")
    r.add_argument("--targets", required=True, help="Path to targets.csv")
    r.add_argument("--prices", required=True, help="Path to prices.csv")
    r.add_argument("--cash", type=float, required=True)
    r.add_argument("--mode", default="TRADE", choices=["BUY", "TRADE", "SELL"])
    r.add_argument("--fractional", action="store_true")
    r.add_argument("--min-notional", type=float, default=0.0)
    r.add_argument(
        "--show-post", action="store_true", help="Print post-trade portfolio snapshot"
    )
    r.add_argument(
    "--strict-prices",
    action="store_true",
    help="Fail if any ticker price is missing from prices.csv (no fallback to positions.csv)",
)

    i = sub.add_parser("import-b3")
    i.add_argument("--input", required=True, help="Path to B3 XLSX file")
    i.add_argument("--out", default="out", help="Output directory for generated CSVs")
    i.add_argument("--user-id", default="default", help="User id (future storage key)")
    i.add_argument("--no-tesouro", action="store_true", help="Skip 'Tesouro Direto'")

    return p


def find_project_root(start: Path) -> Path:
    """Walk up from `start` looking for pyproject.toml to define project root."""
    for p in [start, *start.parents]:
        if (p / "pyproject.toml").exists():
            return p
    return start


def resolve_path(raw: str) -> Path:
    """
    Resolve a user-provided path.
    Strategy:
      1) expanduser + use as-is relative to cwd
      2) if missing, try relative to project root (pyproject.toml)
    """
    p = Path(raw).expanduser()

    # Try as provided (relative to cwd)
    if p.exists():
        return p.resolve()

    # Try relative to project root
    root = find_project_root(Path.cwd())
    candidate = (root / p).resolve()
    if candidate.exists():
        return candidate

    raise FileNotFoundError(
        f"Arquivo não encontrado: {raw}\n"
        f"Testado em (cwd): {(Path.cwd() / p).resolve()}\n"
        f"Testado em (project root): {candidate}"
    )


def resolve_out_dir(raw: str) -> Path:
    """
    Resolve output directory similarly to resolve_path, but create it if needed.
    """
    p = Path(raw).expanduser()

    # If it's absolute or exists relative to cwd, use it
    if p.is_absolute():
        out_dir = p
    else:
        # Prefer cwd-relative
        out_dir = p
        # But if you run from a subfolder and want "out" at project root,
        # you can still pass "..\\out" explicitly. We won't guess it here
        # unless cwd-relative doesn't exist AND project-root one is intended.
        if not out_dir.exists():
            root = find_project_root(Path.cwd())
            root_candidate = root / p
            # If root_candidate exists, use it. Otherwise keep cwd-relative (and create).
            if root_candidate.exists():
                out_dir = root_candidate

    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir.resolve()


def main(argv: list[str] | None = None) -> int:
    try:
        args = build_parser().parse_args(argv)

        if args.cmd == "import-b3":
            from .importers.b3_xlsx import import_b3_xlsx
            from .importers.csv_export import write_positions_csv, write_prices_csv

            input_path = resolve_path(args.input)
            out_dir = resolve_out_dir(args.out)

            res = import_b3_xlsx(
                input_path,
                user_id=str(args.user_id),
                include_tesouro=not bool(args.no_tesouro),
            )

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
            positions_path = resolve_path(args.positions)
            targets_path = resolve_path(args.targets)
            prices_path = resolve_path(args.prices)

            positions = load_positions_csv(positions_path)
            fallback_used: set[str] = set()
            prices = load_prices_for_positions(positions, prices_path, fallback_used=fallback_used)

            if fallback_used:
                msg = "Missing prices in prices.csv for: " + ", ".join(sorted(fallback_used))
                if args.strict_prices:
                    raise ValueError(msg)
                else:
                    print(f"WARNING,{msg} (using fallback from positions.csv)")

            targets = load_targets_csv(targets_path)

            pf = Portfolio(positions=positions, cash=float(args.cash))
            res = rebalance(
                pf,
                targets,
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
                    px = float(prices[p.ticker])
                    mv = float(p.quantity) * px
                    total_positions_value += mv
                    print(f"POST_POSITION,{p.ticker},{p.asset_type},{p.quantity},{px},{mv}")

                print(f"POST_TOTAL_VALUE,{total_positions_value + float(post_pf.cash)}")

            return 0

        return 2
    
    except ValueError as e:
        print(f"ERROR,{e}")
        return 2
    except FileNotFoundError as e:
        print(f"ERROR,{e}")
        return 2