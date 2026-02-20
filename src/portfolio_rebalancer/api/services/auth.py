from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request

from ..db.sqlite_db import get_user_by_id
from ..settings import PORTFOLIO_DB_PATH

# ------------------------ Password hashing (stdlib) ------------------------


_PBKDF2_ITERATIONS = int(os.getenv("AUTH_PBKDF2_ITERATIONS", "200000"))


def hash_password(password: str) -> str:
    if len(password) < 8:
        raise ValueError("Senha muito curta (mínimo: 8).")

    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS, dklen=32
    )
    # format: pbkdf2_sha256$iters$salt_b64$hash_b64
    return "pbkdf2_sha256$%d$%s$%s" % (
        _PBKDF2_ITERATIONS,
        base64.urlsafe_b64encode(salt).decode("ascii").rstrip("="),
        base64.urlsafe_b64encode(dk).decode("ascii").rstrip("="),
    )


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algo, iters_s, salt_b64, dk_b64 = password_hash.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        iters = int(iters_s)
        salt = base64.urlsafe_b64decode(_pad_b64(salt_b64))
        expected = base64.urlsafe_b64decode(_pad_b64(dk_b64))
    except Exception:
        return False

    dk = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, iters, dklen=len(expected)
    )
    return hmac.compare_digest(dk, expected)


def _pad_b64(s: str) -> str:
    return s + "=" * ((4 - (len(s) % 4)) % 4)


# ------------------------------ JWT (HS256) ------------------------------


AUTH_JWT_SECRET = os.getenv("AUTH_JWT_SECRET", "dev-secret-change-me")
AUTH_SESSION_DAYS = int(os.getenv("AUTH_SESSION_DAYS", "14"))
COOKIE_NAME = os.getenv("AUTH_COOKIE_NAME", "pr_session")


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64url_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(_pad_b64(s))


def _sign(msg: bytes) -> str:
    sig = hmac.new(AUTH_JWT_SECRET.encode("utf-8"), msg, hashlib.sha256).digest()
    return _b64url(sig)


def create_session_token(user_id: int, email: str) -> str:
    now = int(time.time())
    exp = now + AUTH_SESSION_DAYS * 24 * 60 * 60

    header = {"alg": "HS256", "typ": "JWT"}
    payload = {"sub": str(user_id), "email": email, "iat": now, "exp": exp}

    h = _b64url(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    p = _b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    msg = f"{h}.{p}".encode("ascii")
    s = _sign(msg)
    return f"{h}.{p}.{s}"


def decode_and_verify_token(token: str) -> dict[str, Any] | None:
    try:
        h, p, s = token.split(".", 2)
    except ValueError:
        return None

    msg = f"{h}.{p}".encode("ascii")
    if not hmac.compare_digest(_sign(msg), s):
        return None

    try:
        payload = json.loads(_b64url_decode(p))
    except Exception:
        return None

    now = int(time.time())
    if int(payload.get("exp") or 0) < now:
        return None

    return payload


# --------------------------- FastAPI dependency ---------------------------


@dataclass(frozen=True)
class CurrentUser:
    id: int
    email: str


def get_current_user(request: Request) -> CurrentUser:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    payload = decode_and_verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    try:
        user_id = int(payload.get("sub"))
    except Exception:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    u = get_user_by_id(PORTFOLIO_DB_PATH, user_id)
    if not u:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    return CurrentUser(id=int(u["id"]), email=str(u["email"]))
