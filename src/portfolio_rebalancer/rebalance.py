from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Mapping

from .models import Portfolio, Trade
from .targets import TargetAllocation


@dataclass(frozen=True)
class RebalanceResult:
    trades: list[Trade]
    cash_before: float
    cash_after: float


def _floor_shares(x: float) -> float:
    return float(int(math.floor(x + 1e-12)))


def rebalance(
    portfolio: Portfolio,
    target: TargetAllocation,
    prices: Mapping[str, float],
    *,
    mode: str = "TRADE",  # BUY | TRADE | SELL
    allow_fractional: bool = False,
    min_trade_notional: float = 0.0,
) -> RebalanceResult:
    mode_norm = mode.strip().upper()
    if mode_norm not in {"BUY", "TRADE", "SELL"}:
        raise ValueError("mode must be one of: BUY, TRADE, SELL")

    cash = float(portfolio.cash)
    total_value = float(portfolio.total_value())

    current_values = portfolio.value_by_ticker()
    universe = set(current_values.keys()) | set(target.weights_by_ticker.keys())

    target_values: dict[str, float] = {
        t: total_value * target.weight(t) for t in universe
    }
    deltas: dict[str, float] = {
        t: target_values[t] - float(current_values.get(t, 0.0)) for t in universe
    }

    qty_by_ticker = {p.ticker: float(p.quantity) for p in portfolio.positions}
    pos_by_ticker = {p.ticker.strip().upper(): p for p in portfolio.positions}

    def _need_price(ticker: str) -> float:
        key = ticker.strip().upper()

        # 1) tenta achar no prices (do jeito que veio)
        if ticker in prices:
            px = float(prices[ticker])
        # 2) tenta achar normalizado
        elif key in prices:
            px = float(prices[key])
        else:
            # 3) fallback: se for BOND, usa o preço do positions
            p = pos_by_ticker.get(key)
            if p is not None and p.asset_type == "BOND":
                px = float(p.price)
            else:
                raise ValueError(f"missing price for ticker: {ticker}")

        if px <= 0:
            raise ValueError(f"price must be > 0 for ticker: {ticker}")
        return px

    trades: list[Trade] = []

    # ---------- SELL leg (SELL or TRADE) ----------
    if mode_norm in {"SELL", "TRADE"}:
        sell_items = [(t, d) for t, d in deltas.items() if d < 0]
        # mais overweight primeiro (mais negativo)
        sell_items.sort(key=lambda x: x[1])

        for t, delta in sell_items:
            current_qty = qty_by_ticker.get(t, 0.0)
            if current_qty <= 0:
                continue

            price = _need_price(t)
            desired_qty = (-delta) / price
            qty = desired_qty if allow_fractional else _floor_shares(desired_qty)
            qty = min(qty, current_qty)

            if qty <= 0:
                continue

            notional = qty * price
            if notional < min_trade_notional:
                continue

            trades.append(Trade(ticker=t, side="SELL", quantity=qty, price=price))
            cash += notional

    # ---------- BUY leg (BUY or TRADE) ----------
    if mode_norm in {"BUY", "TRADE"}:
        buy_items = [(t, d) for t, d in deltas.items() if d > 0]
        buy_items.sort(key=lambda x: x[1], reverse=True)

        for t, delta in buy_items:
            price = _need_price(t)
            desired_qty = delta / price
            qty = desired_qty if allow_fractional else _floor_shares(desired_qty)
            if qty <= 0:
                continue

            max_affordable = (
                (cash / price) if allow_fractional else _floor_shares(cash / price)
            )
            qty = min(qty, max_affordable)
            if qty <= 0:
                continue

            notional = qty * price
            if notional < min_trade_notional:
                continue

            trades.append(Trade(ticker=t, side="BUY", quantity=qty, price=price))
            cash -= notional

    return RebalanceResult(
        trades=trades, cash_before=float(portfolio.cash), cash_after=cash
    )
