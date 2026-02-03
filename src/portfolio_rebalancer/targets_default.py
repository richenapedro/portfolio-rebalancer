from __future__ import annotations

import csv
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from .models import Position
from .targets import TargetAllocation


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
    x = (x or "").strip().upper()
    return x if x else "UNKNOWN"


def build_default_targets(positions: Iterable[Position]) -> DefaultTargets:
    # unique tickers per type
    tickers_by_type: dict[str, list[str]] = defaultdict(list)
    asset_type_by_ticker: dict[str, str] = {}

    for p in positions:
        tkr = _norm_ticker(p.ticker)
        at = _norm_type(p.asset_type)

        # detect conflicting types for same ticker
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

    # deterministic order
    for at in types:
        tickers = sorted(tickers_by_type[at])
        w_within = 1.0 / float(len(tickers))
        for tkr in tickers:
            weights_within[tkr] = w_within
            weights_total[tkr] = type_weight * w_within

    # Make sum exactly 1.0 (avoid tiny float drift)
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
