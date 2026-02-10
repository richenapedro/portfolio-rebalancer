from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from portfolio_rebalancer.api.app import app


def test_health() -> None:
    client = TestClient(app)

    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_rebalance_endpoint_smoke() -> None:
    client = TestClient(app)

    payload = {
        "positions": [
            {"ticker": "AAA", "asset_type": "STOCK", "quantity": 10, "price": 10},
            {"ticker": "BBB", "asset_type": "STOCK", "quantity": 0, "price": 20},
        ],
        "targets": {"AAA": 0.5, "BBB": 0.5},
        "prices": {"AAA": 10, "BBB": 20},
        "cash": 100,
        "mode": "BUY",
        "fractional": False,
        "min_notional": 0,
        "strict_prices": True,
    }
    r = client.post("/api/rebalance", json=payload)
    assert r.status_code == 200

    data = r.json()
    assert "summary" in data
    assert data["summary"]["cash_before"] == 100
    assert "trades" in data


def test_import_b3_endpoint_smoke() -> None:
    client = TestClient(app)

    xlsx = Path(__file__).parent / "fixtures" / "posicao-2026-01-12-13-32-18.xlsx"
    if not xlsx.exists():
        pytest.skip("missing fixture XLSX in repository")

    with xlsx.open("rb") as f:
        files = {
            "file": (
                xlsx.name,
                f,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        }
        r = client.post("/api/import?no_tesouro=false", files=files)

    assert r.status_code == 200
    body = r.json()
    assert "positions" in body and body["positions"]
    assert "targets" in body and body["targets"]
    assert "prices" in body and body["prices"]


def test_rebalance_validation_error_returns_422() -> None:
    client = TestClient(app)
    r = client.post("/api/rebalance", json={})
    assert r.status_code == 422
    data = r.json()
    assert "error" in data


def test_rebalance_b3_endpoint_smoke() -> None:
    client = TestClient(app)

    xlsx = Path(__file__).parent / "fixtures" / "posicao-2026-01-12-13-32-18.xlsx"
    if not xlsx.exists():
        pytest.skip("missing fixture XLSX in repository")

    with xlsx.open("rb") as f:
        files = {
            "file": (
                xlsx.name,
                f,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        }
        r = client.post(
            "/api/rebalance/b3?cash=100&mode=BUY&no_tesouro=false", files=files
        )

    assert r.status_code == 200
    data = r.json()
    assert "summary" in data
    assert "trades" in data


def test_request_id_is_returned() -> None:
    client = TestClient(app)

    payload = {
        "positions": [
            {"ticker": "AAA", "asset_type": "STOCK", "quantity": 1, "price": 10},
        ],
        "prices": {"AAA": 10},
        "targets": {"AAA": 1.0},
    }

    r = client.post("/api/rebalance", json=payload)

    assert r.status_code == 200
    data = r.json()
    assert "request_id" in data
    assert r.headers.get("X-Request-Id") == data["request_id"]


def test_job_create_requires_file() -> None:
    client = TestClient(app)
    r = client.post("/api/rebalance/b3/jobs")
    assert r.status_code == 422


def test_job_status_unknown_returns_422() -> None:
    client = TestClient(app)
    r = client.get("/api/jobs/does-not-exist")
    assert r.status_code == 422
