import pytest

from portfolio_rebalancer.execution import apply_trades
from portfolio_rebalancer.models import Portfolio, Position, Trade


def test_apply_trades_sell_reduces_qty_and_increases_cash():
    pf = Portfolio(
        positions=[Position("AAA", "STOCK", 10, 100)],
        cash=0.0,
    )
    trades = [Trade("AAA", "SELL", 2, 100)]

    out = apply_trades(pf, trades)

    assert out.cash == 200.0
    assert len(out.positions) == 1
    assert out.positions[0].ticker == "AAA"
    assert out.positions[0].quantity == 8.0
    assert out.positions[0].price == 100.0


def test_apply_trades_sell_to_zero_removes_position():
    pf = Portfolio(
        positions=[Position("AAA", "STOCK", 2, 100)],
        cash=0.0,
    )
    trades = [Trade("AAA", "SELL", 2, 100)]

    out = apply_trades(pf, trades)

    assert out.cash == 200.0
    assert out.positions == []


def test_apply_trades_buy_increases_qty_and_decreases_cash():
    pf = Portfolio(
        positions=[Position("AAA", "STOCK", 1, 100)],
        cash=500.0,
    )
    trades = [Trade("AAA", "BUY", 2, 120)]

    out = apply_trades(pf, trades)

    assert out.cash == 260.0
    assert len(out.positions) == 1
    assert out.positions[0].quantity == 3.0
    assert out.positions[0].price == 120.0


def test_apply_trades_buy_new_ticker_requires_asset_type_or_default():
    pf = Portfolio(positions=[], cash=1000.0)
    trades = [Trade("BBB", "BUY", 1, 200)]

    out = apply_trades(pf, trades, asset_type_by_ticker={"BBB": "FII"})

    assert out.cash == 800.0
    assert len(out.positions) == 1
    assert out.positions[0].ticker == "BBB"
    assert out.positions[0].asset_type == "FII"


def test_apply_trades_buy_new_ticker_raises_if_no_asset_type():
    pf = Portfolio(positions=[], cash=1000.0)
    trades = [Trade("BBB", "BUY", 1, 200)]

    with pytest.raises(ValueError, match="missing asset_type"):
        apply_trades(pf, trades, default_asset_type=None)


def test_apply_trades_oversell_raises():
    pf = Portfolio(
        positions=[Position("AAA", "STOCK", 1, 100)],
        cash=0.0,
    )
    trades = [Trade("AAA", "SELL", 2, 100)]

    with pytest.raises(ValueError, match="exceeds position quantity"):
        apply_trades(pf, trades)


def test_apply_trades_insufficient_cash_raises():
    pf = Portfolio(positions=[], cash=50.0)
    trades = [Trade("AAA", "BUY", 1, 100)]

    with pytest.raises(ValueError, match="not enough cash"):
        apply_trades(pf, trades, asset_type_by_ticker={"AAA": "STOCK"})
