from __future__ import annotations

from dataclasses import replace
from typing import Mapping

from .models import Portfolio, Position, Trade


def apply_trades(
    portfolio: Portfolio,
    trades: list[Trade],
    *,
    asset_type_by_ticker: Mapping[str, str] | None = None,
    default_asset_type: str | None = "STOCK",
) -> Portfolio:
    """
    Apply trades sequentially and return a new Portfolio.

    Notes:
    - Updates cash based on trade.notional
    - Updates position quantity
    - If a BUY introduces a new ticker, uses asset_type_by_ticker[ticker] if provided,
      otherwise default_asset_type (if not None). If neither available, raises.
    - Sets position.price to the trade.price for tickers that were traded.
    """
    asset_type_by_ticker = asset_type_by_ticker or {}

    # index positions by ticker
    pos_by_ticker: dict[str, Position] = {p.ticker: p for p in portfolio.positions}
    cash = float(portfolio.cash)

    for t in trades:
        ticker = t.ticker
        qty = float(t.quantity)
        price = float(t.price)
        notional = float(t.notional)

        if t.side == "SELL":
            if ticker not in pos_by_ticker:
                raise ValueError(f"cannot SELL {ticker}: position does not exist")

            p = pos_by_ticker[ticker]
            if qty > float(p.quantity) + 1e-12:
                raise ValueError(
                    f"cannot SELL {ticker}: quantity {qty} exceeds position quantity {p.quantity}"
                )

            new_qty = float(p.quantity) - qty
            cash += notional

            if new_qty <= 1e-12:
                del pos_by_ticker[ticker]
            else:
                pos_by_ticker[ticker] = replace(p, quantity=new_qty, price=price)

        elif t.side == "BUY":
            if notional > cash + 1e-12:
                raise ValueError(
                    f"cannot BUY {ticker}: not enough cash (need {notional}, have {cash})"
                )

            cash -= notional

            if ticker in pos_by_ticker:
                p = pos_by_ticker[ticker]
                pos_by_ticker[ticker] = replace(
                    p, quantity=float(p.quantity) + qty, price=price
                )
            else:
                asset_type = asset_type_by_ticker.get(ticker, default_asset_type)
                if asset_type is None:
                    raise ValueError(
                        f"cannot BUY {ticker}: missing asset_type (provide asset_type_by_ticker or default_asset_type)"
                    )
                pos_by_ticker[ticker] = Position(
                    ticker=ticker,
                    asset_type=asset_type,
                    quantity=qty,
                    price=price,
                )
        else:
            raise ValueError(f"invalid trade side: {t.side}")

    positions = sorted(pos_by_ticker.values(), key=lambda p: p.ticker)
    return Portfolio(positions=positions, cash=cash)
