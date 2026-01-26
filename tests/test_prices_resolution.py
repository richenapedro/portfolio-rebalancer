from __future__ import annotations

from portfolio_rebalancer.loaders import load_prices_for_positions
from portfolio_rebalancer.models import Position


def test_prices_resolution_sheet_price_prevclose_fallback(tmp_path):
    sheet_csv = tmp_path / "sheet.csv"
    sheet_csv.write_text(
        "\n".join(
            [
                "ticker,price,previous_close",
                "VALE3,20,19",
                "PETR4,,30",
                "ITUB4,,",
            ]
        ),
        encoding="utf-8",
    )

    positions = [
        Position(ticker="VALE3", asset_type="STOCK", quantity=1, price=10),
        Position(ticker="PETR4", asset_type="STOCK", quantity=1, price=11),
        Position(ticker="ABEV3", asset_type="STOCK", quantity=1, price=12),
    ]

    fallbacks: set[str] = set()
    prices = load_prices_for_positions(positions, sheet_csv, fallback_used=fallbacks)

    assert prices["VALE3"] == 20.0
    assert prices["PETR4"] == 30.0
    assert prices["ABEV3"] == 12.0
    assert fallbacks == {"ABEV3"}


def test_prices_resolution_european_decimal(tmp_path):
    sheet_csv = tmp_path / "sheet.csv"
    sheet_csv.write_text(
        "\n".join(
            [
                "ticker,price,previous_close",
                'BOND1,"1.234,56",',
            ]
        ),
        encoding="utf-8",
    )

    positions = [Position(ticker="BOND1", asset_type="BOND", quantity=1, price=999)]

    prices = load_prices_for_positions(positions, sheet_csv)
    assert abs(prices["BOND1"] - 1234.56) < 1e-9
