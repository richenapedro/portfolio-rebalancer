from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class TargetAllocation:
    """
    Target weights by ticker.

    Notes:
    - tickers are normalized to UPPER
    - weights must be >= 0
    - sum(weights) must be <= 1.0 (the remainder is implicit CASH)
    """

    weights_by_ticker: Mapping[str, float]

    def __post_init__(self) -> None:
        normalized: dict[str, float] = {}
        for t, w in self.weights_by_ticker.items():
            if not isinstance(t, str) or not t.strip():
                raise ValueError("ticker must be a non-empty string")
            if w < 0:
                raise ValueError("weight must be >= 0")
            normalized[t.strip().upper()] = float(w)

        total = sum(normalized.values())
        if total > 1.0 + 1e-9:
            raise ValueError("sum of weights must be <= 1.0 (remainder is CASH)")

        object.__setattr__(self, "weights_by_ticker", normalized)

    def weight(self, ticker: str) -> float:
        return self.weights_by_ticker.get(ticker.strip().upper(), 0.0)
