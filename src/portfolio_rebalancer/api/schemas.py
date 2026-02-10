from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

Mode = Literal["BUY", "SELL", "TRADE"]


class PositionIn(BaseModel):
    ticker: str
    asset_type: str
    quantity: float
    price: float


class TradeOut(BaseModel):
    side: Literal["BUY", "SELL"]
    ticker: str
    quantity: float
    price: float
    notional: float


class HoldingOut(BaseModel):
    ticker: str
    asset_type: str
    quantity: float
    price: float
    value: float
    weight: float


class RebalanceRequest(BaseModel):
    positions: list[PositionIn]
    prices: dict[str, float]
    targets: dict[str, float]

    cash: float = 0.0
    mode: Mode = "TRADE"
    fractional: bool = False
    min_notional: float = 0.0
    strict_prices: bool = False

    # opcional: propagar warnings do import
    warnings: list[str] = Field(default_factory=list)


class RebalanceSummary(BaseModel):
    cash_before: float
    cash_after: float
    total_value_before: float
    total_value_after: float
    n_trades: int


class WithRequestId(BaseModel):
    request_id: Optional[str] = None


class RebalanceResponse(WithRequestId):
    summary: RebalanceSummary
    trades: list[TradeOut]
    holdings_before: list[HoldingOut]
    holdings_after: list[HoldingOut]
    warnings: list[str]


class RebalanceB3Response(BaseModel):
    meta: dict[str, Any]
    warnings: list[str]
    summary: RebalanceSummary
    trades: list[TradeOut]
    holdings_before: list[HoldingOut]
    holdings_after: list[HoldingOut]


JobStatus = Literal["queued", "running", "done", "error"]


class JobCreateResponse(WithRequestId):
    job_id: str
    status: JobStatus


class JobStatusResponse(WithRequestId):
    job_id: str
    status: JobStatus
    result: dict[str, Any] | None = None
    error: dict[str, Any] | None = None
