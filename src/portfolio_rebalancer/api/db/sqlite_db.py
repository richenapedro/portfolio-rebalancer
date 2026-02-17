# .../api/db/sqlite_db.py
from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any


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


def init_db(db_path: str) -> None:
    with connect(db_path) as conn:
        conn.executescript(
            """
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
            """
        )


# ---------- Portfolio CRUD ----------


def list_portfolios(db_path: str) -> list[dict[str, Any]]:
    with connect(db_path) as conn:
        rows = conn.execute(
            "SELECT id, name, created_at FROM portfolio ORDER BY id DESC"
        ).fetchall()
        return [dict(r) for r in rows]


def create_portfolio(db_path: str, name: str) -> dict[str, Any]:
    now = _utc_now_iso()
    with connect(db_path) as conn:
        cur = conn.execute(
            "INSERT INTO portfolio(name, created_at) VALUES (?, ?)",
            (name.strip(), now),
        )
        pid = cur.lastrowid
        row = conn.execute(
            "SELECT id, name, created_at FROM portfolio WHERE id = ?",
            (pid,),
        ).fetchone()
        if not row:
            raise RuntimeError("Falha ao criar portfolio.")
        return dict(row)


def get_portfolio(db_path: str, portfolio_id: int) -> dict[str, Any] | None:
    with connect(db_path) as conn:
        row = conn.execute(
            "SELECT id, name, created_at FROM portfolio WHERE id = ?",
            (portfolio_id,),
        ).fetchone()
        return dict(row) if row else None


def rename_portfolio(
    db_path: str, portfolio_id: int, name: str
) -> dict[str, Any] | None:
    with connect(db_path) as conn:
        conn.execute(
            "UPDATE portfolio SET name = ? WHERE id = ?",
            (name.strip(), portfolio_id),
        )
        row = conn.execute(
            "SELECT id, name, created_at FROM portfolio WHERE id = ?",
            (portfolio_id,),
        ).fetchone()
        return dict(row) if row else None


# ---------- Positions ----------


def list_positions(db_path: str, portfolio_id: int) -> list[dict[str, Any]]:
    with connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT portfolio_id, ticker, quantity, price, cls, note, source, updated_at
            FROM position
            WHERE portfolio_id = ?
            ORDER BY ticker ASC
            """,
            (portfolio_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def replace_positions(
    db_path: str, portfolio_id: int, positions: list[dict[str, Any]]
) -> None:
    """
    Substitui 100% das posições do portfolio (estado final).
    - remove tudo e insere o que veio.
    """
    now = _utc_now_iso()

    normalized: list[tuple[Any, ...]] = []
    for p in positions:
        ticker = str(p.get("ticker") or "").strip().upper()
        if not ticker:
            continue

        quantity = p.get("quantity")
        if quantity is None:
            continue
        try:
            quantity_f = float(quantity)
        except Exception:
            continue

        price = p.get("price", None)
        if price is not None:
            try:
                price = float(price)
            except Exception:
                price = None

        cls = p.get("cls", None)
        cls = str(cls).strip().lower() if cls is not None and str(cls).strip() else None

        note = p.get("note", None)
        if note is not None:
            try:
                note_i = int(note)
            except Exception:
                note_i = None
        else:
            note_i = None

        source = str(p.get("source") or "manual").strip().lower()
        if source not in {"import", "manual"}:
            source = "manual"

        normalized.append(
            (portfolio_id, ticker, quantity_f, price, cls, note_i, source, now)
        )

    with connect(db_path) as conn:
        conn.execute("DELETE FROM position WHERE portfolio_id = ?", (portfolio_id,))
        if normalized:
            conn.executemany(
                """
                INSERT INTO position(
                    portfolio_id, ticker, quantity, price, cls, note, source, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                normalized,
            )


# ---------- Import run (opcional) ----------


def add_import_run(db_path: str, portfolio_id: int, filename: str) -> dict[str, Any]:
    now = _utc_now_iso()
    with connect(db_path) as conn:
        cur = conn.execute(
            "INSERT INTO import_run(portfolio_id, filename, created_at) VALUES (?, ?, ?)",
            (portfolio_id, filename.strip(), now),
        )
        rid = cur.lastrowid
        row = conn.execute(
            "SELECT id, portfolio_id, filename, created_at FROM import_run WHERE id = ?",
            (rid,),
        ).fetchone()
        if not row:
            raise RuntimeError("Falha ao criar import_run.")
        return dict(row)


def list_import_runs(db_path: str, portfolio_id: int) -> list[dict[str, Any]]:
    with connect(db_path) as conn:
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


def delete_portfolio(db_path: str, portfolio_id: int) -> None:
    with connect(db_path) as conn:
        conn.execute("DELETE FROM portfolio WHERE id = ?", (portfolio_id,))
    # con = sqlite3.connect(db_path)
    # try:
    #     cur = con.cursor()
    #     cur.execute("DELETE FROM positions WHERE portfolio_id = ?", (portfolio_id,))
    #     cur.execute("DELETE FROM import_runs WHERE portfolio_id = ?", (portfolio_id,))
    #     cur.execute("DELETE FROM portfolios WHERE id = ?", (portfolio_id,))
    #     con.commit()
    # finally:
    #     con.close()
