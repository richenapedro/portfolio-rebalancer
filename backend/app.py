from __future__ import annotations

import tempfile
from typing import Any

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from portfolio_rebalancer.importers.b3_xlsx import import_b3_xlsx
from portfolio_rebalancer.models import Position


app = FastAPI(title="portfolio-rebalancer API", version="0.1.0")

# Dev: liberar o Next.js local (http://localhost:3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _position_to_dict(p: Position) -> dict[str, Any]:
    return {
        "ticker": (p.ticker or "").strip().upper(),
        "asset_type": p.asset_type,
        "quantity": float(p.quantity),
        "price": float(p.price),
    }


def _build_equal_weight_targets(positions: list[Position]) -> dict[str, float]:
    tickers = [
        (p.ticker or "").strip().upper() for p in positions if (p.ticker or "").strip()
    ]
    # remove duplicatas mantendo ordem
    seen: set[str] = set()
    uniq = []
    for t in tickers:
        if t not in seen:
            seen.add(t)
            uniq.append(t)

    n = len(uniq)
    if n == 0:
        return {}

    w = 1.0 / float(n)
    return {t: w for t in uniq}


@app.post("/api/import")
async def api_import(
    file: UploadFile = File(...),
    user_id: str = "default",
    no_tesouro: bool = False,
) -> dict[str, Any]:
    """
    Upload do XLSX da B3 (Posição).
    Retorna positions, prices e targets (equal weight) em JSON.

    - user_id: futuro storage key (por enquanto default)
    - no_tesouro: pula a aba Tesouro Direto
    """
    if not file.filename:
        raise ValueError("missing filename")

    # Salva temporariamente para o importer (openpyxl lê melhor de path)
    suffix = ".xlsx"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    res = import_b3_xlsx(
        tmp_path,
        user_id=str(user_id),
        include_tesouro=not bool(no_tesouro),
    )

    positions_json = [_position_to_dict(p) for p in res.positions]

    # prices: no MVP já vem do import (unit price calculado pelo importer)
    prices_json = {k.strip().upper(): float(v) for k, v in res.prices.items()}

    # targets: equal weight default
    targets_json = _build_equal_weight_targets(res.positions)

    meta = {
        "filename": file.filename,
        "n_positions": len(positions_json),
        "n_prices": len(prices_json),
        "n_targets": len(targets_json),
    }

    return {
        "meta": meta,
        "warnings": list(res.warnings or []),
        "positions": positions_json,
        "prices": prices_json,
        "targets": targets_json,
    }
