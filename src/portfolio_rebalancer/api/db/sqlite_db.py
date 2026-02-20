# .../api/db/sqlite_db.py
from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterable


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@contextmanager
def connect(db_path: str):
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        yield conn
        conn.commit()
    finally:
        conn.close()


def _has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(r["name"] == column for r in rows)


def init_db(db_path: str) -> None:
    """Cria/migra o schema do SQLite.

    - Adiciona tabela de usuários.
    - Adiciona coluna portfolio.user_id (migração leve via ALTER TABLE).
    """
    with connect(db_path) as conn:
        # Base tables (as-is)
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS portfolio (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS position (
                portfolio_id INTEGER NOT NULL,
                ticker TEXT NOT NULL,
                quantity REAL NOT NULL,
                price REAL,
                cls TEXT,
                note INTEGER,
                source TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (portfolio_id, ticker),
                FOREIGN KEY (portfolio_id) REFERENCES portfolio(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS import_run (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                portfolio_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (portfolio_id) REFERENCES portfolio(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_position_portfolio ON position(portfolio_id);
            CREATE INDEX IF NOT EXISTS idx_import_run_portfolio ON import_run(portfolio_id);
            """)

        # Users
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS user (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_user_email ON user(email);
            """)

        # Migration: portfolio.user_id
        if not _has_column(conn, "portfolio", "user_id"):
            conn.execute("ALTER TABLE portfolio ADD COLUMN user_id INTEGER;")
            # existing portfolios (antes de auth) ficam sem owner e não aparecerão em prod
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_portfolio_user ON portfolio(user_id);"
            )


# ---------- Users ----------


def create_user(db_path: str, email: str, password_hash: str) -> dict[str, Any]:
    now = _utc_now_iso()
    with connect(db_path) as conn:
        try:
            cur = conn.execute(
                "INSERT INTO user (email, password_hash, created_at) VALUES (?, ?, ?)",
                (email.strip().lower(), password_hash, now),
            )
        except sqlite3.IntegrityError as e:
            raise ValueError("E-mail já cadastrado.") from e

        user_id = int(cur.lastrowid)
        return {"id": user_id, "email": email.strip().lower(), "created_at": now}


def get_user_by_email(db_path: str, email: str) -> dict[str, Any] | None:
    with connect(db_path) as conn:
        row = conn.execute(
            "SELECT id, email, password_hash, created_at FROM user WHERE email = ?",
            (email.strip().lower(),),
        ).fetchone()
        return dict(row) if row else None


def get_user_by_id(db_path: str, user_id: int) -> dict[str, Any] | None:
    with connect(db_path) as conn:
        row = conn.execute(
            "SELECT id, email, password_hash, created_at FROM user WHERE id = ?",
            (user_id,),
        ).fetchone()
        return dict(row) if row else None


# ---------- Portfolio CRUD (multi-tenant) ----------


def list_portfolios(db_path: str, user_id: int) -> list[dict[str, Any]]:
    with connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT id, name, created_at
            FROM portfolio
            WHERE user_id = ?
            ORDER BY id DESC
            """,
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def create_portfolio(db_path: str, user_id: int, name: str) -> dict[str, Any]:
    now = _utc_now_iso()
    with connect(db_path) as conn:
        cur = conn.execute(
            "INSERT INTO portfolio (name, created_at, user_id) VALUES (?, ?, ?)",
            (name, now, user_id),
        )
        pid = int(cur.lastrowid)
        return {"id": pid, "name": name, "created_at": now}


def get_portfolio(
    db_path: str, user_id: int, portfolio_id: int
) -> dict[str, Any] | None:
    with connect(db_path) as conn:
        row = conn.execute(
            """
            SELECT id, name, created_at
            FROM portfolio
            WHERE id = ? AND user_id = ?
            """,
            (portfolio_id, user_id),
        ).fetchone()
        return dict(row) if row else None


def rename_portfolio(
    db_path: str, user_id: int, portfolio_id: int, new_name: str
) -> dict[str, Any] | None:
    with connect(db_path) as conn:
        cur = conn.execute(
            """
            UPDATE portfolio
            SET name = ?
            WHERE id = ? AND user_id = ?
            """,
            (new_name, portfolio_id, user_id),
        )
        if cur.rowcount == 0:
            return None
        return {"id": portfolio_id, "name": new_name}


def delete_portfolio(db_path: str, user_id: int, portfolio_id: int) -> None:
    with connect(db_path) as conn:
        conn.execute(
            "DELETE FROM portfolio WHERE id = ? AND user_id = ?",
            (portfolio_id, user_id),
        )


# ---------- Positions ----------


def list_positions(
    db_path: str, user_id: int, portfolio_id: int
) -> list[dict[str, Any]]:
    with connect(db_path) as conn:
        # ownership check
        ok = conn.execute(
            "SELECT 1 FROM portfolio WHERE id = ? AND user_id = ?",
            (portfolio_id, user_id),
        ).fetchone()
        if not ok:
            return []

        rows = conn.execute(
            """
            SELECT ticker, quantity, price, cls, note, source, updated_at
            FROM position
            WHERE portfolio_id = ?
            ORDER BY ticker ASC
            """,
            (portfolio_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def replace_positions(
    db_path: str,
    user_id: int,
    portfolio_id: int,
    positions: Iterable[dict[str, Any]],
) -> None:
    now = _utc_now_iso()
    with connect(db_path) as conn:
        # ownership check
        ok = conn.execute(
            "SELECT 1 FROM portfolio WHERE id = ? AND user_id = ?",
            (portfolio_id, user_id),
        ).fetchone()
        if not ok:
            raise ValueError("Portfolio não encontrado.")

        conn.execute("DELETE FROM position WHERE portfolio_id = ?", (portfolio_id,))

        rows_to_insert: list[tuple[Any, ...]] = []
        for p in positions:
            ticker = str(p.get("ticker") or "").strip().upper()
            if not ticker:
                continue
            rows_to_insert.append(
                (
                    portfolio_id,
                    ticker,
                    float(p.get("quantity") or 0.0),
                    p.get("price"),
                    p.get("cls"),
                    p.get("note"),
                    str(p.get("source") or "manual"),
                    now,
                )
            )

        if rows_to_insert:
            conn.executemany(
                """
                INSERT INTO position (
                    portfolio_id, ticker, quantity, price, cls, note, source, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows_to_insert,
            )


# ---------- Import runs ----------


def list_import_runs(
    db_path: str, user_id: int, portfolio_id: int
) -> list[dict[str, Any]]:
    with connect(db_path) as conn:
        ok = conn.execute(
            "SELECT 1 FROM portfolio WHERE id = ? AND user_id = ?",
            (portfolio_id, user_id),
        ).fetchone()
        if not ok:
            return []

        rows = conn.execute(
            """
            SELECT id, portfolio_id, filename, created_at
            FROM import_run
            WHERE portfolio_id = ?
            ORDER BY id DESC
            """,
            (portfolio_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def add_import_run(
    db_path: str, user_id: int, portfolio_id: int, filename: str
) -> dict[str, Any]:
    now = _utc_now_iso()
    with connect(db_path) as conn:
        ok = conn.execute(
            "SELECT 1 FROM portfolio WHERE id = ? AND user_id = ?",
            (portfolio_id, user_id),
        ).fetchone()
        if not ok:
            raise ValueError("Portfolio não encontrado.")

        cur = conn.execute(
            "INSERT INTO import_run (portfolio_id, filename, created_at) VALUES (?, ?, ?)",
            (portfolio_id, filename, now),
        )
        rid = int(cur.lastrowid)
        return {
            "id": rid,
            "portfolio_id": portfolio_id,
            "filename": filename,
            "created_at": now,
        }
