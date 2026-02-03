from __future__ import annotations

import csv
from pathlib import Path

from .b3_xlsx import B3ImportResult
from ..targets import TargetAllocation
from ..models import Position


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


# ---------------- NEW: targets ----------------


def build_default_targets(positions: list[Position]) -> TargetAllocation:
    """
    Regra:
      - divide igualmente entre asset_types presentes
      - dentro de cada asset_type, divide igualmente entre tickers únicos
      - total sempre 1.0 (100%)
    """
    by_type: dict[str, set[str]] = {}

    for p in positions:
        asset_type = (p.asset_type or "").strip() or "UNKNOWN"
        ticker = (p.ticker or "").strip().upper()
        if not ticker:
            continue
        by_type.setdefault(asset_type, set()).add(ticker)

    by_type = {k: v for k, v in by_type.items() if v}
    if not by_type:
        return TargetAllocation({})

    n_types = len(by_type)
    w_type = 1.0 / n_types

    weights: dict[str, float] = {}
    for asset_type, tickers in sorted(by_type.items()):
        n = len(tickers)
        w_each = w_type / n
        for t in sorted(tickers):
            weights[t] = weights.get(t, 0.0) + w_each

    s = sum(weights.values())
    if s > 0:
        weights = {k: v / s for k, v in weights.items()}

    return TargetAllocation(weights)


def write_targets_csv(target: TargetAllocation, out_path: str | Path) -> Path:
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["ticker", "weight"])
        for ticker, weight in sorted(target.weights_by_ticker.items()):
            w.writerow([ticker, _fmt_weight(float(weight))])

    return out


def _fmt_weight(x: float) -> str:
    return f"{x:.10f}".rstrip("0").rstrip(".")


# ---------------- helpers ----------------


def _fmt_qty(x: float) -> str:
    # quantidade: mantém até 6 casas (cobre Tesouro e evita lixo de float)
    return f"{x:.6f}".rstrip("0").rstrip(".")


def _fmt_price(asset_type: str, x: float) -> str:
    dec = 6 if asset_type == "BOND" else 2
    return f"{x:.{dec}f}".rstrip("0").rstrip(".")
