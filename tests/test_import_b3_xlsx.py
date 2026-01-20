from __future__ import annotations

from pathlib import Path

import pytest

from portfolio_rebalancer.importers.b3_xlsx import import_b3_xlsx


def _fixture_xlsx_path() -> Path:
    return Path(__file__).parent / "fixtures" / "posicao-2026-01-12-13-32-18.xlsx"


def test_import_b3_xlsx_parses_positions_and_prices():
    res = import_b3_xlsx(_fixture_xlsx_path(), user_id="u1")

    assert res.user_id == "u1"
    assert not any("Missing sheet" in w for w in res.warnings)

    # 3 stocks + 33 FIIs + 5 bonds (unique tickers) = 41 positions
    assert len(res.positions) == 41
    assert len(res.prices) == 41

    by_ticker = {p.ticker: p for p in res.positions}

    # Stocks
    assert by_ticker["AURE3"].asset_type == "STOCK"
    assert by_ticker["CXSE3"].asset_type == "STOCK"
    assert by_ticker["TAEE3"].asset_type == "STOCK"

    # FIIs aggregated across institutions
    assert by_ticker["ABCP11"].asset_type == "FII"
    assert by_ticker["ABCP11"].quantity == pytest.approx(265.0)
    assert by_ticker["ABCP11"].price == pytest.approx(82.0)

    assert by_ticker["BRCR11"].quantity == pytest.approx(249.0)
    assert by_ticker["BRCR11"].price == pytest.approx(47.73)

    assert by_ticker["CNES11"].quantity == pytest.approx(249.0)
    assert by_ticker["CNES11"].price == pytest.approx(1.85)

    # Bonds: ISIN used as ticker; price is (valor atualizado / quantidade)
    assert by_ticker["BRSTNCNTB3E2"].asset_type == "BOND"
    assert by_ticker["BRSTNCNTB3E2"].quantity == pytest.approx(24.2)
    assert by_ticker["BRSTNCNTB3E2"].price == pytest.approx(56575.71 / 24.2)


def test_import_b3_xlsx_can_skip_tesouro_sheet():
    res = import_b3_xlsx(_fixture_xlsx_path(), user_id="u1", include_tesouro=False)

    # 3 stocks + 33 FIIs = 36
    assert len(res.positions) == 36
    assert all(p.asset_type != "BOND" for p in res.positions)
