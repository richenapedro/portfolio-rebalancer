from __future__ import annotations

import csv
from pathlib import Path

from .b3_xlsx import B3ImportResult


def write_positions_csv(result: B3ImportResult, out_path: str | Path) -> Path:
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["ticker", "asset_type", "quantity", "price"])
        for p in result.positions:
            w.writerow(
                [
                    p.ticker,
                    p.asset_type,
                    _fmt_qty(p.quantity),
                    _fmt_price(p.asset_type, p.price),
                ]
            )

    return out


def write_prices_csv(result: B3ImportResult, out_path: str | Path) -> Path:
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["ticker", "price"])
        for p in result.positions:
            w.writerow([p.ticker, _fmt_price(p.asset_type, p.price)])

    return out


def _fmt_qty(x: float) -> str:
    # quantidade: mantém até 6 casas (cobre Tesouro e evita lixo de float)
    return f"{x:.6f}".rstrip("0").rstrip(".")


def _fmt_price(asset_type: str, x: float) -> str:
    dec = 6 if asset_type == "BOND" else 2
    return f"{x:.{dec}f}".rstrip("0").rstrip(".")
