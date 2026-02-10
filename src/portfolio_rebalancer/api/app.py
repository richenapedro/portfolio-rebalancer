from __future__ import annotations

import tempfile
from typing import Any

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from portfolio_rebalancer.execution import apply_trades
from portfolio_rebalancer.importers.b3_xlsx import import_b3_xlsx
from portfolio_rebalancer.models import Portfolio, Position
from portfolio_rebalancer.rebalance import rebalance
from portfolio_rebalancer.targets import TargetAllocation

from fastapi.exceptions import RequestValidationError

from .errors import validation_error_handler, value_error_handler

from .schemas import (
    HoldingOut,
    RebalanceRequest,
    RebalanceResponse,
    RebalanceSummary,
    TradeOut,
)

app = FastAPI(title="portfolio-rebalancer API", version="0.1.0")

app.add_exception_handler(ValueError, value_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)

# Dev: liberar Next.js local
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
    seen: set[str] = set()
    uniq: list[str] = []
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
    """
    if not file.filename:
        raise ValueError("missing filename")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    res = import_b3_xlsx(
        tmp_path,
        user_id=str(user_id),
        include_tesouro=not bool(no_tesouro),
    )

    positions_json = [_position_to_dict(p) for p in res.positions]
    prices_json = {k.strip().upper(): float(v) for k, v in res.prices.items()}
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


def _holdings_snapshot(
    positions: list[Position],
    cash: float,
    prices: dict[str, float],
) -> tuple[list[HoldingOut], float]:
    total_positions_value = 0.0
    rows: list[tuple[Position, float, float]] = []  # (pos, px, value)

    for p in positions:
        t = (p.ticker or "").strip().upper()
        px = float(prices[t])
        value = float(p.quantity) * px
        total_positions_value += value
        rows.append((p, px, value))

    total_value = total_positions_value + float(cash)

    # evita div/0
    denom = total_value if total_value > 0 else 1.0

    out: list[HoldingOut] = []
    for p, px, value in rows:
        t = (p.ticker or "").strip().upper()
        out.append(
            HoldingOut(
                ticker=t,
                asset_type=p.asset_type,
                quantity=float(p.quantity),
                price=float(px),
                value=float(value),
                weight=float(value / denom),
            )
        )

    return out, float(total_value)


@app.post("/api/rebalance", response_model=RebalanceResponse)
def api_rebalance(req: RebalanceRequest) -> RebalanceResponse:
    # positions do request
    positions = [
        Position(
            ticker=p.ticker.strip().upper(),
            asset_type=p.asset_type,
            quantity=float(p.quantity),
            price=float(p.price),
        )
        for p in req.positions
    ]

    warnings = list(req.warnings or [])

    # resolve prices por ticker (e fallback se faltar)
    prices: dict[str, float] = {}
    missing: set[str] = set()

    for p in positions:
        t = (p.ticker or "").strip().upper()
        if t in req.prices:
            prices[t] = float(req.prices[t])
        else:
            missing.add(t)

    if missing:
        msg = "Missing prices for: " + ", ".join(sorted(missing))
        if req.strict_prices:
            raise ValueError(msg)
        warnings.append("WARNING," + msg + " (using fallback from positions)")
        for p in positions:
            t = (p.ticker or "").strip().upper()
            if t not in prices:
                prices[t] = float(p.price)

    # targets
    target_alloc = TargetAllocation(
        {k.strip().upper(): float(v) for k, v in req.targets.items()}
    )

    pf = Portfolio(positions=positions, cash=float(req.cash))

    holdings_before, total_before = _holdings_snapshot(pf.positions, pf.cash, prices)

    # compute trades
    res = rebalance(
        pf,
        target_alloc,
        prices,
        mode=req.mode,
        allow_fractional=bool(req.fractional),
        min_trade_notional=float(req.min_notional),
    )

    asset_type_by_ticker = {p.ticker: p.asset_type for p in positions}
    post_pf = apply_trades(
        pf,
        res.trades,
        asset_type_by_ticker=asset_type_by_ticker,
    )

    holdings_after, total_after = _holdings_snapshot(
        post_pf.positions, post_pf.cash, prices
    )

    trades_out = [
        TradeOut(
            side=t.side,
            ticker=t.ticker,
            quantity=float(t.quantity),
            price=float(t.price),
            notional=float(t.notional),
        )
        for t in res.trades
    ]

    summary = RebalanceSummary(
        cash_before=float(res.cash_before),
        cash_after=float(res.cash_after),
        total_value_before=float(total_before),
        total_value_after=float(total_after),
        n_trades=len(trades_out),
    )

    return RebalanceResponse(
        summary=summary,
        trades=trades_out,
        holdings_before=holdings_before,
        holdings_after=holdings_after,
        warnings=warnings,
    )
