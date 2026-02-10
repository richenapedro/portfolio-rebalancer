from __future__ import annotations

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def value_error_handler(_: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "VALUE_ERROR", "message": str(exc)}},
    )


def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "error": {"code": "VALIDATION_ERROR", "message": "Invalid request"},
            "details": exc.errors(),
        },
    )
