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


def _asset_type_map(pf: Portfolio) -> dict[str, str]:
    return {p.ticker: p.asset_type for p in pf.positions}


def _buy_two_level(
    *,
    cash: float,
    deltas: dict[str, float],
    target_values: dict[str, float],
    current_values: dict[str, float],
    prices: Mapping[str, float],
    asset_type_by_ticker: Mapping[str, str],
    allow_fractional: bool,
    min_trade_notional: float,
) -> tuple[list[Trade], float]:
    """
    BUY allocation:
    1) budget per asset_type proportional to positive delta (in value, R$)
    2) within asset_type, budget per ticker proportional to positive delta
    3) top-up using leftover cash (discrete lots) buying 1 unit of the most underweight
    """

    def _need_price(ticker: str) -> float:
        if ticker not in prices:
            raise ValueError(f"missing price for ticker: {ticker}")
        px = float(prices[ticker])
        if px <= 0:
            raise ValueError(f"price must be > 0 for ticker: {ticker}")
        return px

    def _atype(t: str) -> str:
        return asset_type_by_ticker.get(t, "UNKNOWN")

    # only tickers that actually need buying (positive delta in R$)
    buy_tickers = [t for t, d in deltas.items() if d > 0]
    if cash <= 0 or not buy_tickers:
        return [], cash

    # group by asset_type
    by_type: dict[str, list[str]] = {}
    for t in buy_tickers:
        by_type.setdefault(_atype(t), []).append(t)

    need_by_type: dict[str, float] = {}
    for at, ts in by_type.items():
        need = 0.0
        for t in ts:
            need += max(0.0, float(deltas[t]))  # delta already in R$
        need_by_type[at] = need

    total_need = sum(need_by_type.values())
    if total_need <= 0:
        return [], cash

    # planned buys accumulation
    qty_acc: dict[str, float] = {}
    bought_value: dict[str, float] = {}  # in R$

    def _add_buy(t: str, qty: float) -> float:
        if qty <= 0:
            return 0.0
        px = _need_price(t)
        notional = float(qty) * px
        if notional < min_trade_notional:
            return 0.0
        qty_acc[t] = qty_acc.get(t, 0.0) + float(qty)
        bought_value[t] = bought_value.get(t, 0.0) + notional
        return notional

    # ---------- 1) budget per type ----------
    spent_total = 0.0
    budgets_by_type: dict[str, float] = {
        at: cash * (need_by_type[at] / total_need) for at in by_type.keys()
    }

    # ---------- 2) within each type, budget per ticker ----------
    for at, ts in by_type.items():
        budget_type = budgets_by_type[at]
        if budget_type <= 0:
            continue

        need_type = sum(max(0.0, float(deltas[t])) for t in ts)
        if need_type <= 0:
            continue

        for t in ts:
            d = max(0.0, float(deltas[t]))
            if d <= 0:
                continue

            px = _need_price(t)
            budget_t = budget_type * (d / need_type)

            # don't buy beyond what is missing in value (helps stay closer to target)
            max_value_to_fill = d
            budget_eff = min(budget_t, max_value_to_fill)

            if allow_fractional:
                qty = budget_eff / px
            else:
                qty = _floor_shares(budget_eff / px)

            if qty <= 0:
                continue

            notional = _add_buy(t, qty)
            if notional > 0:
                spent_total += notional

    cash_left = cash - spent_total

    # ---------- 3) top-up pass with leftover cash (discrete lots) ----------
    # buy 1 unit at a time of the most underweight (relative) ticker we can afford
    if not allow_fractional and cash_left > 0:

        def _relative_gap(t: str) -> float:
            tv = float(target_values.get(t, 0.0))
            if tv <= 0:
                return 0.0
            cv = float(current_values.get(t, 0.0)) + float(bought_value.get(t, 0.0))
            missing = max(0.0, tv - cv)
            return missing / tv  # 0..1

        # keep trying while we can afford at least one unit of something useful
        while True:
            best_t = None
            best_score = 0.0

            for t in buy_tickers:
                px = _need_price(t)
                if px > cash_left:
                    continue

                tv = float(target_values.get(t, 0.0))
                if tv <= 0:
                    continue

                cv = float(current_values.get(t, 0.0)) + float(bought_value.get(t, 0.0))
                missing = tv - cv
                if missing <= 0:
                    continue

                score = _relative_gap(t)
                if score > best_score:
                    best_score = score
                    best_t = t

            if best_t is None:
                break

            px = _need_price(best_t)
            if px > cash_left:
                break

            notional = _add_buy(best_t, 1.0)
            if notional <= 0:
                break
            cash_left -= notional

    # build trades list
    trades: list[Trade] = []
    for t, qty in qty_acc.items():
        px = _need_price(t)
        trades.append(Trade(ticker=t, side="BUY", quantity=qty, price=px))

    return trades, cash_left


def rebalance(
    portfolio: Portfolio,
    target: TargetAllocation,
    prices: Mapping[str, float],
    *,
    mode: str = "TRADE",  # BUY | TRADE | SELL
    allow_fractional: bool = False,
    min_trade_notional: float = 0.0,
) -> RebalanceResult:
    mode_norm = str(mode).strip().upper()
    if mode_norm not in {"BUY", "TRADE", "SELL"}:
        raise ValueError("mode must be one of: BUY, TRADE, SELL")

    def _need_price(ticker: str) -> float:
        if ticker not in prices:
            raise ValueError(f"missing price for ticker: {ticker}")
        px = float(prices[ticker])
        if px <= 0:
            raise ValueError(f"price must be > 0 for ticker: {ticker}")
        return px

    cash = float(portfolio.cash)

    # quantities
    qty_by_ticker = {p.ticker: float(p.quantity) for p in portfolio.positions}

    # ✅ current values computed using *provided* prices
    current_values: dict[str, float] = {}
    for t, qty in qty_by_ticker.items():
        if qty <= 0:
            continue
        px = _need_price(t)
        current_values[t] = qty * px

    # ✅ total value consistent with prices
    total_value = float(sum(current_values.values()) + cash)

    universe = set(current_values.keys()) | set(target.weights_by_ticker.keys())

    target_values: dict[str, float] = {
        t: total_value * float(target.weight(t)) for t in universe
    }
    deltas: dict[str, float] = {
        t: target_values[t] - float(current_values.get(t, 0.0)) for t in universe
    }

    trades: list[Trade] = []
    asset_type_by_ticker = _asset_type_map(portfolio)

    # ---------- SELL leg (SELL or TRADE) ----------
    if mode_norm in {"SELL", "TRADE"}:
        sell_items = [(t, d) for t, d in deltas.items() if d < 0]
        sell_items.sort(key=lambda x: x[1])  # mais negativo primeiro (mais overweight)

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
            if notional < float(min_trade_notional):
                continue

            trades.append(Trade(ticker=t, side="SELL", quantity=qty, price=price))
            cash += notional

            # ✅ update state so BUY leg (in TRADE) sees the sell
            current_values[t] = float(current_values.get(t, 0.0)) - notional
            qty_by_ticker[t] = current_qty - qty
            deltas[t] = target_values[t] - current_values.get(t, 0.0)

    # ---------- BUY leg (BUY or TRADE) ----------
    if mode_norm in {"BUY", "TRADE"}:
        buy_trades, cash = _buy_two_level(
            cash=cash,
            deltas=deltas,
            target_values=target_values,
            current_values=current_values,
            prices=prices,
            asset_type_by_ticker=asset_type_by_ticker,
            allow_fractional=allow_fractional,
            min_trade_notional=float(min_trade_notional),
        )
        trades.extend(buy_trades)

    return RebalanceResult(
        trades=trades,
        cash_before=float(portfolio.cash),
        cash_after=float(cash),
    )
