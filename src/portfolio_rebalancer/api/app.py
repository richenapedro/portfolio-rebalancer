from __future__ import annotations

import json
import tempfile
from contextlib import asynccontextmanager
from typing import Any

from fastapi import (
    BackgroundTasks,
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from portfolio_rebalancer.execution import apply_trades
from portfolio_rebalancer.importers.b3_xlsx import import_b3_xlsx
from portfolio_rebalancer.models import Portfolio, Position
from portfolio_rebalancer.rebalance import rebalance
from portfolio_rebalancer.targets import TargetAllocation
from portfolio_rebalancer.targets_default import build_weighted_targets
from .jobs import create_job, get_job, set_done, set_error, set_running
from .db.sqlite_db import init_db
from .errors import validation_error_handler, value_error_handler
from .middleware import request_id_middleware
from .routers.bd_remote import router as bd_remote_router
from .routers.portfolio_db import router as portfolio_db_router
from .schemas import (
    HoldingOut,
    JobCreateResponse,
    JobStatusResponse,
    PositionIn,
    RebalanceRequest,
    RebalanceResponse,
    RebalanceSummary,
    TradeOut,
)
from .settings import PORTFOLIO_DB_PATH


@asynccontextmanager
async def lifespan(app: FastAPI):
    # substitui o antigo @app.on_event("startup")
    init_db(PORTFOLIO_DB_PATH)
    yield


app = FastAPI(lifespan=lifespan, title="portfolio-rebalancer API", version="0.1.0")

app.include_router(bd_remote_router)
app.add_exception_handler(ValueError, value_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.middleware("http")(request_id_middleware)

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


app.include_router(portfolio_db_router)


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
    user_id: str = Form("default"),
    no_tesouro: bool = Form(False),
) -> dict[str, Any]:
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
    pf0 = Portfolio(positions=res.positions, cash=0.0)
    w = pf0.weights_by_asset_type()  # 0..1

    weights_current = {
        "stocks": float(w.get("STOCK", 0.0) * 100.0),
        "fiis": float(w.get("FII", 0.0) * 100.0),
        "bonds": float(w.get("BOND", 0.0) * 100.0),
    }

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
        "weights_current": weights_current,
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


def _rebalance_core(req: RebalanceRequest) -> RebalanceResponse:
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

    target_alloc = TargetAllocation(
        {k.strip().upper(): float(v) for k, v in req.targets.items()}
    )

    pf = Portfolio(positions=positions, cash=float(req.cash))
    holdings_before, total_before = _holdings_snapshot(pf.positions, pf.cash, prices)

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


@app.post("/api/rebalance", response_model=RebalanceResponse)
def api_rebalance(req: RebalanceRequest, request: Request) -> RebalanceResponse:
    resp = _rebalance_core(req)
    resp.request_id = request.state.request_id
    return resp


def _parse_notes_json(notes_json: str) -> dict[str, float] | None:
    if not notes_json:
        return None
    try:
        raw = json.loads(notes_json)
        if not isinstance(raw, dict):
            return None
        out: dict[str, float] = {}
        for k, v in raw.items():
            kk = str(k).strip().upper()
            if not kk:
                continue
            out[kk] = float(v)
        return out
    except Exception:
        return None


@app.post("/api/rebalance/b3", response_model=RebalanceResponse)
async def api_rebalance_b3(
    request: Request,
    file: UploadFile = File(...),
    user_id: str = Form("default"),
    no_tesouro: bool = Form(False),
    cash: float = Form(0.0),
    mode: str = Form("TRADE"),
    fractional: bool = Form(False),
    min_notional: float = Form(0.0),
    strict_prices: bool = Form(False),
    w_stock: float = Form(100.0),
    w_fii: float = Form(0.0),
    w_bond: float = Form(0.0),
    notes_json: str = Form(""),
) -> RebalanceResponse:
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

    positions_in = [
        PositionIn(
            ticker=(p.ticker or "").strip().upper(),
            asset_type=p.asset_type,
            quantity=float(p.quantity),
            price=float(p.price),
        )
        for p in res.positions
    ]

    prices_json = {k.strip().upper(): float(v) for k, v in res.prices.items()}

    notes_by_ticker = _parse_notes_json(str(notes_json or ""))

    targets_json = build_weighted_targets(
        res.positions,
        w_stock=w_stock,
        w_fii=w_fii,
        w_bond=w_bond,
        include_tesouro=not bool(no_tesouro),
        notes_by_ticker=notes_by_ticker,
    )

    req = RebalanceRequest(
        positions=positions_in,
        prices=prices_json,
        targets=targets_json,
        cash=float(cash),
        mode=mode,
        fractional=bool(fractional),
        min_notional=float(min_notional),
        strict_prices=bool(strict_prices),
        warnings=list(res.warnings or []),
    )

    return api_rebalance(req, request)


async def _run_rebalance_b3_job(
    job_id: str,
    file_bytes: bytes,
    user_id: str,
    no_tesouro: bool,
    cash: float,
    mode: str,
    fractional: bool,
    min_notional: float,
    strict_prices: bool,
    w_stock: float,
    w_fii: float,
    w_bond: float,
    notes_json: str,
) -> None:
    try:
        set_running(job_id)

        with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        res = import_b3_xlsx(
            tmp_path,
            user_id=str(user_id),
            include_tesouro=not bool(no_tesouro),
        )

        positions_in = [
            PositionIn(
                ticker=(p.ticker or "").strip().upper(),
                asset_type=p.asset_type,
                quantity=float(p.quantity),
                price=float(p.price),
            )
            for p in res.positions
        ]

        prices_json = {k.strip().upper(): float(v) for k, v in res.prices.items()}
        notes_by_ticker = _parse_notes_json(str(notes_json or ""))

        targets_json = build_weighted_targets(
            res.positions,
            w_stock=w_stock,
            w_fii=w_fii,
            w_bond=w_bond,
            include_tesouro=not bool(no_tesouro),
            notes_by_ticker=notes_by_ticker,
        )

        req = RebalanceRequest(
            positions=positions_in,
            prices=prices_json,
            targets=targets_json,
            cash=float(cash),
            mode=mode,
            fractional=bool(fractional),
            min_notional=float(min_notional),
            strict_prices=bool(strict_prices),
            warnings=list(res.warnings or []),
        )

        resp = _rebalance_core(req)

        job = get_job(job_id)
        if job is not None:
            resp.request_id = job.request_id

        set_done(job_id, resp.model_dump())

    except ValueError as e:
        set_error(job_id, "VALUE_ERROR", str(e))
    except Exception as e:
        set_error(job_id, "UNEXPECTED_ERROR", str(e))


@app.post("/api/rebalance/b3/jobs", response_model=JobCreateResponse, status_code=202)
async def api_rebalance_b3_job_create(
    background_tasks: BackgroundTasks,
    request: Request,
    file: UploadFile = File(...),
    user_id: str = Form("default"),
    no_tesouro: bool = Form(False),
    cash: float = Form(0.0),
    mode: str = Form("TRADE"),
    fractional: bool = Form(False),
    min_notional: float = Form(0.0),
    strict_prices: bool = Form(False),
    w_stock: float = Form(100.0),
    w_fii: float = Form(0.0),
    w_bond: float = Form(0.0),
    notes_json: str = Form(""),
) -> JobCreateResponse:
    if not file.filename:
        raise ValueError("missing filename")

    rec = create_job(request.state.request_id)
    file_bytes = await file.read()

    background_tasks.add_task(
        _run_rebalance_b3_job,
        rec.job_id,
        file_bytes,
        str(user_id),
        bool(no_tesouro),
        float(cash),
        str(mode),
        bool(fractional),
        float(min_notional),
        bool(strict_prices),
        float(w_stock),
        float(w_fii),
        float(w_bond),
        str(notes_json or ""),
    )

    return JobCreateResponse(
        job_id=rec.job_id, status=rec.status, request_id=rec.request_id
    )


@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse)
def api_job_status(job_id: str, request: Request) -> JobStatusResponse:
    rec = get_job(job_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"unknown job_id: {job_id}")

    return JobStatusResponse(
        job_id=rec.job_id,
        status=rec.status,
        result=rec.result,
        error=rec.error,
        request_id=rec.request_id,
    )
