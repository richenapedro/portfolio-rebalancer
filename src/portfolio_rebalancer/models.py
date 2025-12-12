# src/portfolio_rebalancer/models.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Side = Literal["BUY", "SELL"]
AssetType = Literal["STOCK", "FII", "BOND", "CASH"]


@dataclass(frozen=True, slots=True)
class Position:
    """Represents a current holding in the portfolio."""

    ticker: str
    asset_type: AssetType
    quantity: float
    price: float  # price per unit/share

    def __post_init__(self) -> None:
        valid_types = ("STOCK", "FII", "BOND", "CASH")
        at = str(self.asset_type).strip().upper()
        if at not in valid_types:
            raise ValueError(f"asset_type must be one of {valid_types}")
        object.__setattr__(self, "asset_type", at)
        t = self.ticker.strip().upper()
        if not t:
            raise ValueError("ticker must be a non-empty string")
        if self.quantity < 0:
            raise ValueError("quantity must be >= 0")
        if self.price < 0:
            raise ValueError("price must be >= 0")
        # normalize ticker
        object.__setattr__(self, "ticker", t)

    @property
    def market_value(self) -> float:
        """Current market value = quantity * price."""
        return self.quantity * self.price


@dataclass(frozen=True, slots=True)
class Trade:
    """Represents a suggested order to execute."""

    ticker: str
    side: Side
    quantity: float
    price: float | None = None  # optional reference price

    def __post_init__(self) -> None:
        s = str(self.side).strip().upper()
        if s not in ("BUY", "SELL"):
            raise ValueError("side must be 'BUY' or 'SELL'")
        object.__setattr__(self, "side", s)

        t = self.ticker.strip().upper()
        if not t:
            raise ValueError("ticker must be a non-empty string")
        object.__setattr__(self, "ticker", t)

        if self.quantity <= 0:
            raise ValueError("quantity must be > 0")
        if self.price is not None and self.price < 0:
            raise ValueError("price must be >= 0 when provided")

    @property
    def notional(self) -> float | None:
        """Order value (quantity * price) if price is available."""
        if self.price is None:
            return None
        return self.quantity * self.price


@dataclass(slots=True)
class Portfolio:
    """Aggregate of positions + cash, with convenience methods."""

    positions: list[Position]
    cash: float = 0.0

    def __post_init__(self) -> None:
        if self.cash < 0:
            raise ValueError("cash must be >= 0")

    def total_positions_value(self) -> float:
        return sum(p.market_value for p in self.positions)

    def total_value(self) -> float:
        return self.total_positions_value() + self.cash

    def value_by_ticker(self) -> dict[str, float]:
        """Aggregated market value per ticker."""
        out: dict[str, float] = {}
        for p in self.positions:
            out[p.ticker] = out.get(p.ticker, 0.0) + p.market_value
        return out

    def weights_by_ticker(self) -> dict[str, float]:
        """Portfolio weights per ticker based on total portfolio value."""
        total = self.total_value()
        if total <= 0:
            return {}
        vals = self.value_by_ticker()
        return {ticker: value / total for ticker, value in vals.items()}
