from __future__ import annotations

import csv
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from .models import Position
from .targets import TargetAllocation


def build_weighted_targets(
    positions: list[Position],
    w_stock: float,
    w_fii: float,
    w_bond: float,
    *,
    include_tesouro: bool,
) -> dict[str, float]:
    """
    - Pesos chegam em % (0..100)
    - Divide o peso de cada classe igualmente entre os tickers daquela classe
    - Se include_tesouro=False => BOND recebe 0 e é removido da normalização
    """
    weights_by_type = {
        "STOCK": max(0.0, float(w_stock)),
        "FII": max(0.0, float(w_fii)),
        "BOND": max(0.0, float(w_bond)) if include_tesouro else 0.0,
    }

    tickers_by_type: dict[str, list[str]] = defaultdict(list)
    for p in positions:
        t = (p.ticker or "").strip().upper()
        if not t:
            continue
        at = _norm_type(p.asset_type)

        tickers_by_type[at].append(t)

    active_types = [
        k for k, v in weights_by_type.items() if v > 0 and tickers_by_type.get(k)
    ]
    if not active_types:
        # fallback: default equal por tipo/ticker
        default = build_default_targets(positions, include_tesouro=include_tesouro)
        return dict(default.by_ticker.weights_by_ticker)

    total_w = sum(weights_by_type[t] for t in active_types)

    out: dict[str, float] = {}
    for t in active_types:
        cls_w = weights_by_type[t] / total_w  # 0..1
        tickers = sorted(set(tickers_by_type[t]))
        per_ticker = cls_w / len(tickers)
        for ticker in tickers:
            out[ticker] = per_ticker

    return out


@dataclass(frozen=True)
class DefaultTargets:
    # total weight per ticker (sums to 1.0)
    by_ticker: TargetAllocation
    # weight per asset_type (sums to 1.0)
    by_type: dict[str, float]
    # within-type weight per ticker (each type sums to 1.0)
    within_type_by_ticker: dict[str, float]
    # asset_type per ticker
    asset_type_by_ticker: dict[str, str]


def _norm_ticker(x: str) -> str:
    return x.strip().upper()


def _norm_type(x: str) -> str:
    s = (x or "").strip().upper()
    s = s.replace("Ç", "C").replace("Ã", "A").replace("Á", "A").replace("Â", "A")
    s = s.replace("É", "E").replace("Ê", "E").replace("Í", "I")
    s = s.replace("Ó", "O").replace("Ô", "O").replace("Õ", "O")
    s = s.replace("Ú", "U")

    if s in {"STOCK", "ACAO", "ACOES", "EQUITY", "BR_STOCK"}:
        return "STOCK"
    if s in {"FII", "FIIS", "REIT"}:
        return "FII"
    if s in {"BOND", "TESOURO", "TESOURO DIRETO", "RF", "RENDA FIXA"}:
        return "BOND"

    return s


def build_default_targets(
    positions: Iterable[Position],
    *,
    include_tesouro: bool = True,
) -> DefaultTargets:
    # opcional: filtra Tesouro quando include_tesouro=False
    if not include_tesouro:
        positions = [p for p in positions if _norm_type(p.asset_type) != "BOND"]

    # unique tickers per type
    tickers_by_type: dict[str, list[str]] = defaultdict(list)
    asset_type_by_ticker: dict[str, str] = {}

    for p in positions:
        tkr = _norm_ticker(p.ticker)
        at = _norm_type(p.asset_type)

        prev = asset_type_by_ticker.get(tkr)
        if prev is not None and prev != at:
            raise ValueError(
                f"ticker appears in multiple asset types: {tkr} ({prev} vs {at})"
            )

        asset_type_by_ticker[tkr] = at
        if tkr not in tickers_by_type[at]:
            tickers_by_type[at].append(tkr)

    types = sorted(tickers_by_type.keys())
    if not types:
        return DefaultTargets(
            by_ticker=TargetAllocation({}),
            by_type={},
            within_type_by_ticker={},
            asset_type_by_ticker={},
        )

    type_weight = 1.0 / float(len(types))
    by_type = {at: type_weight for at in types}

    weights_total: dict[str, float] = {}
    weights_within: dict[str, float] = {}

    for at in types:
        tickers = sorted(tickers_by_type[at])
        w_within = 1.0 / float(len(tickers))
        for tkr in tickers:
            weights_within[tkr] = w_within
            weights_total[tkr] = type_weight * w_within

    s = sum(weights_total.values())
    if weights_total and abs(s - 1.0) > 1e-12:
        for k in list(weights_total.keys()):
            weights_total[k] = weights_total[k] / s

    return DefaultTargets(
        by_ticker=TargetAllocation(weights_total),
        by_type=by_type,
        within_type_by_ticker=weights_within,
        asset_type_by_ticker=asset_type_by_ticker,
    )


def write_targets_csv(target: TargetAllocation, path: str | Path) -> Path:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)

    with p.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["ticker", "weight"])
        w.writeheader()
        for tkr in sorted(target.weights_by_ticker.keys()):
            w.writerow(
                {"ticker": tkr, "weight": f"{target.weights_by_ticker[tkr]:.12f}"}
            )
    return p


def write_targets_by_type_csv(by_type: dict[str, float], path: str | Path) -> Path:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)

    with p.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["asset_type", "weight"])
        w.writeheader()
        for at in sorted(by_type.keys()):
            w.writerow({"asset_type": at, "weight": f"{by_type[at]:.12f}"})
    return p
