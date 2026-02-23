from __future__ import annotations
import requests
import re

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from ..db.sqlite_db import create_user, get_user_by_email, init_db
from ..services.auth import (
    COOKIE_NAME,
    CurrentUser,
    create_session_token,
    get_current_user,
    hash_password,
    verify_password,
)
from ..settings import PORTFOLIO_DB_PATH

router = APIRouter(prefix="/api/auth", tags=["auth"])


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _norm_email(email: str) -> str:
    e = (email or "").strip().lower()
    if not _EMAIL_RE.match(e):
        raise ValueError("E-mail inválido.")
    return e


class SignupBody(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=200)


class LoginBody(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=200)


@router.post("/signup")
def signup(body: SignupBody, request: Request, response: Response):
    init_db(PORTFOLIO_DB_PATH)

    try:
        email = _norm_email(body.email)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    existing = get_user_by_email(PORTFOLIO_DB_PATH, email)
    if existing:
        raise HTTPException(status_code=409, detail="E-mail já cadastrado.")

    password_hash = hash_password(body.password)
    u = create_user(PORTFOLIO_DB_PATH, email, password_hash)

    token = create_session_token(int(u["id"]), str(u["email"]))
    _set_session_cookie(request, response, token)

    return {"id": int(u["id"]), "email": str(u["email"])}


@router.post("/login")
def login(body: LoginBody, request: Request, response: Response):
    init_db(PORTFOLIO_DB_PATH)

    try:
        email = _norm_email(body.email)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    u = get_user_by_email(PORTFOLIO_DB_PATH, email)
    if not u or not verify_password(body.password, str(u["password_hash"])):
        raise HTTPException(status_code=401, detail="Credenciais inválidas.")

    token = create_session_token(int(u["id"]), str(u["email"]))
    _set_session_cookie(request, response, token)

    return {"id": int(u["id"]), "email": str(u["email"])}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: CurrentUser = Depends(get_current_user)):
    return {"id": user.id, "email": user.email}


def _set_session_cookie(request: Request, response: Response, token: str) -> None:
    secure = request.url.scheme == "https"
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
        max_age=14 * 24 * 60 * 60,
    )


class OAuthExchangeIn(BaseModel):
    provider: str
    id_token: str | None = None
    access_token: str | None = None


@router.post("/oauth/exchange")
def oauth_exchange(payload: OAuthExchangeIn, request: Request, response: Response):
    init_db(PORTFOLIO_DB_PATH)

    provider = (payload.provider or "").strip().lower()

    if provider != "google":
        raise HTTPException(status_code=400, detail="invalid provider")

    if not payload.id_token:
        raise HTTPException(status_code=400, detail="missing id_token")

    # valida id_token no Google
    try:
        r = requests.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": payload.id_token},
            timeout=8,
        )
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"google tokeninfo error: {e}"
        ) from e

    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="invalid google token")

    data = r.json()
    email = str(data.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="google token missing email")

    # (opcional, mas recomendado) confere se o token é do seu app:
    # aud = str(data.get("aud") or "")
    # if aud != os.environ.get("GOOGLE_CLIENT_ID"):
    #     raise HTTPException(status_code=401, detail="invalid aud")

    # cria/pega usuário
    existing = get_user_by_email(PORTFOLIO_DB_PATH, email)
    if existing:
        u = existing
    else:
        # cria com senha aleatória (não será usada)
        password_hash = hash_password("oauth:" + str(data.get("sub") or ""))
        u = create_user(PORTFOLIO_DB_PATH, email, password_hash)

    token = create_session_token(int(u["id"]), str(u["email"]))
    _set_session_cookie(request, response, token)

    return {"id": int(u["id"]), "email": str(u["email"])}
    provider = (payload.provider or "").strip().lower()

    if provider == "google":
        if not payload.id_token:
            raise HTTPException(status_code=400, detail="missing id_token")
        # TODO: validar id_token e extrair email/sub
        # e então criar/obter user e SETAR COOKIE/SESSION igual seu login normal
        # return me()

    if provider == "facebook":
        if not payload.access_token:
            raise HTTPException(status_code=400, detail="missing access_token")
        # TODO: validar access_token, pegar email/id
        # criar/obter user e setar cookie/session igual login
        # return me()

    raise HTTPException(status_code=400, detail="invalid provider")
