import pytest

from portfolio_rebalancer.models import Portfolio, Position, Trade


def test_position_normalizes_ticker_and_asset_type():
    p = Position(ticker=" aapl ", asset_type="fii", quantity=2, price=10)
    assert p.ticker == "AAPL"
    assert p.asset_type == "FII"
    assert p.market_value == 20


def test_position_rejects_invalid_asset_type():
    with pytest.raises(ValueError):
        Position(ticker="AAPL", asset_type="CRYPTO", quantity=1, price=10)  # type: ignore[arg-type]


def test_trade_normalizes_side_and_ticker():
    t = Trade(ticker=" petr4 ", side="buy", quantity=3, price=10)  # type: ignore[arg-type]
    assert t.ticker == "PETR4"
    assert t.side == "BUY"
    assert t.notional == 30


def test_portfolio_total_value_and_weights():
    p1 = Position(ticker="AAA", asset_type="STOCK", quantity=1, price=100)
    p2 = Position(ticker="BBB", asset_type="FII", quantity=2, price=50)
    pf = Portfolio(positions=[p1, p2], cash=50)

    assert pf.total_positions_value() == 200
    assert pf.total_value() == 250

    w = pf.weights_by_ticker()
    assert w["AAA"] == 100 / 250
    assert w["BBB"] == 100 / 250
