from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass
from typing import Any, Literal

JobStatus = Literal["queued", "running", "done", "error"]

_TTL_SECONDS = 30 * 60  # 30 min


@dataclass
class JobRecord:
    job_id: str
    status: JobStatus
    created_at: float
    updated_at: float
    request_id: str
    result: dict[str, Any] | None = None
    error: dict[str, Any] | None = None


_lock = threading.Lock()
_jobs: dict[str, JobRecord] = {}


def _now() -> float:
    return time.time()


def _cleanup_expired() -> None:
    cutoff = _now() - _TTL_SECONDS
    to_delete: list[str] = []
    for job_id, rec in _jobs.items():
        if rec.updated_at < cutoff:
            to_delete.append(job_id)
    for job_id in to_delete:
        _jobs.pop(job_id, None)


def create_job(request_id: str) -> JobRecord:
    with _lock:
        _cleanup_expired()
        job_id = uuid.uuid4().hex
        rec = JobRecord(
            job_id=job_id,
            status="queued",
            created_at=_now(),
            updated_at=_now(),
            request_id=request_id,
        )
        _jobs[job_id] = rec
        return rec


def set_running(job_id: str) -> None:
    with _lock:
        rec = _jobs[job_id]
        rec.status = "running"
        rec.updated_at = _now()


def set_done(job_id: str, result: dict[str, Any]) -> None:
    with _lock:
        rec = _jobs[job_id]
        rec.status = "done"
        rec.result = result
        rec.updated_at = _now()


def set_error(job_id: str, code: str, message: str) -> None:
    with _lock:
        rec = _jobs[job_id]
        rec.status = "error"
        rec.error = {"code": code, "message": message}
        rec.updated_at = _now()


def get_job(job_id: str) -> JobRecord | None:
    with _lock:
        _cleanup_expired()
        return _jobs.get(job_id)
