from __future__ import annotations

import pandas as pd

from ..settings import PRICES_SHEET_URL


def _to_float_ptbr(x) -> float | None:
    if x is None:
        return None
    s = str(x).strip()
    if not s or s.lower() == "nan":
        return None
    # remove separador de milhar e troca vírgula decimal
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except Exception:
        return None


def _normalize_asset_class(raw: object) -> str:
    """Normalize the 'class' column into: stocks | fiis | bonds | other."""
    s = str(raw or "").strip().lower()
    if not s or s == "nan":
        return "other"

    # common variants from your sheet
    if s in {"stock", "stocks"}:
        return "stocks"
    if s in {"fii", "fiis"}:
        return "fiis"
    if s in {"bond", "bonds", "rf", "renda fixa", "tesouro", "fixed"}:
        return "bonds"

    return "other"


def _read_prices_df() -> pd.DataFrame:
    """Read the remote sheet/CSV and normalize column names."""
    df = pd.read_csv(PRICES_SHEET_URL, sep=None, engine="python")
    df.columns = [str(c).strip().lower() for c in df.columns]
    return df


def get_assets_index() -> list[dict[str, object]]:
    """Return all rows that have a ticker, even if price is missing.

    Output items: {ticker: str, price: float|None, cls: 'stocks'|'fiis'|'bonds'|'other'}
    cls is taken from the table (no inference).
    """
    df = _read_prices_df()

    if "ticker" not in df.columns:
        raise ValueError(f"prices_public: coluna 'ticker' não encontrada. colunas={df.columns.tolist()}")

    price_col = "price" if "price" in df.columns else ("current_price" if "current_price" in df.columns else None)
    class_col = "class" if "class" in df.columns else None

    by_ticker: dict[str, dict[str, object]] = {}

    for _, row in df.iterrows():
        tk = str(row.get("ticker", "")).strip().upper()
        if not tk or tk == "NAN":
            continue

        px = _to_float_ptbr(row.get(price_col)) if price_col else None
        cls = _normalize_asset_class(row.get(class_col)) if class_col else "other"

        prev = by_ticker.get(tk)
        if prev is None:
            by_ticker[tk] = {"ticker": tk, "price": px, "cls": cls}
            continue

        # se já existia sem preço e agora apareceu um preço, atualiza
        if prev.get("price") is None and px is not None and px > 0:
            prev["price"] = px

        # cls vem da tabela; se antes estava "other" e agora veio algo melhor, atualiza
        if prev.get("cls") in {None, "", "other"} and cls != "other":
            prev["cls"] = cls

    return [by_ticker[k] for k in sorted(by_ticker.keys())]


def get_price_map() -> dict[str, float]:
    """Return a {ticker -> price} map for rows with a valid price."""
    items = get_assets_index()
    out: dict[str, float] = {}
    for it in items:
        px = it.get("price")
        if isinstance(px, (int, float)) and px > 0:
            out[str(it["ticker"])] = float(px)
    return out
