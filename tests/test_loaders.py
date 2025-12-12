from pathlib import Path

import pytest

from portfolio_rebalancer.loaders import (
    load_positions_csv,
    load_prices_csv,
    load_targets_csv,
)


def test_load_positions_csv(tmp_path: Path):
    p = tmp_path / "positions.csv"
    p.write_text(
        "ticker,asset_type,quantity,price\n" "aapl,stock,2,150\n",
        encoding="utf-8",
    )
    positions = load_positions_csv(p)
    assert len(positions) == 1
    assert positions[0].ticker == "AAPL"
    assert positions[0].asset_type == "STOCK"
    assert positions[0].quantity == 2.0
    assert positions[0].price == 150.0


def test_load_prices_csv(tmp_path: Path):
    p = tmp_path / "prices.csv"
    p.write_text(
        "ticker,price\n" "aapl,155\n",
        encoding="utf-8",
    )
    prices = load_prices_csv(p)
    assert prices == {"AAPL": 155.0}


def test_load_targets_csv(tmp_path: Path):
    p = tmp_path / "targets.csv"
    p.write_text(
        "ticker,weight\n" "aapl,0.6\n" "msft,0.4\n",
        encoding="utf-8",
    )
    target = load_targets_csv(p)
    assert target.weights_by_ticker == {"AAPL": 0.6, "MSFT": 0.4}


def test_load_positions_csv_missing_columns_raises(tmp_path: Path):
    p = tmp_path / "positions.csv"
    p.write_text("ticker,quantity,price\nAAPL,1,10\n", encoding="utf-8")
    with pytest.raises(ValueError, match="positions csv must have columns"):
        load_positions_csv(p)
