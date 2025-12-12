from portfolio_rebalancer.models import Portfolio, Position
from portfolio_rebalancer.rebalance import rebalance
from portfolio_rebalancer.targets import TargetAllocation


def test_mode_trade_sells_then_buys():
    p = Portfolio(
        positions=[
            Position("AAA", "STOCK", 10, 100),  # 1000
            Position("BBB", "STOCK", 5, 200),  # 1000
        ],
        cash=100.0,
    )
    target = TargetAllocation({"AAA": 0.75, "BBB": 0.25})
    prices = {"AAA": 100.0, "BBB": 200.0}

    res = rebalance(p, target, prices, mode="TRADE")

    assert [(t.side, t.ticker, t.quantity, t.price) for t in res.trades] == [
        ("SELL", "BBB", 2.0, 200.0),
        ("BUY", "AAA", 5.0, 100.0),
    ]
    assert res.cash_after == 0.0


def test_mode_sell_only_sells():
    p = Portfolio(
        positions=[
            Position("AAA", "STOCK", 10, 100),  # 1000
            Position("BBB", "STOCK", 5, 200),  # 1000
        ],
        cash=100.0,
    )
    target = TargetAllocation({"AAA": 0.75, "BBB": 0.25})
    prices = {"AAA": 100.0, "BBB": 200.0}

    res = rebalance(p, target, prices, mode="SELL")

    assert [(t.side, t.ticker, t.quantity) for t in res.trades] == [
        ("SELL", "BBB", 2.0),
    ]
    assert res.cash_after == 500.0


def test_mode_buy_only_buys():
    p = Portfolio(
        positions=[
            Position("AAA", "STOCK", 10, 100),  # 1000
            Position("BBB", "STOCK", 5, 200),  # 1000
        ],
        cash=500.0,
    )
    # total=2500 -> target AAA=625, BBB=1875
    # BBB underweight +875 => floor(4.375)=4 shares, but cash=500 => max 2 shares
    target = TargetAllocation({"AAA": 0.25, "BBB": 0.75})
    prices = {"AAA": 100.0, "BBB": 200.0}

    res = rebalance(p, target, prices, mode="BUY")

    assert [(t.side, t.ticker, t.quantity) for t in res.trades] == [
        ("BUY", "BBB", 2.0),
    ]
    assert res.cash_after == 100.0
