from __future__ import annotations

from fastapi import APIRouter, Query

from ..services.prices_sheet import get_assets_index, get_price_map

router = APIRouter(prefix="/api/bd_remote", tags=["bd_remote"])


@router.get("/prices/ping")
def prices_ping():
    # confirma leitura do CSV remoto
    items = get_assets_index()
    total = len(items)
    priced = sum(
        1 for it in items if isinstance(it.get("price"), (int, float)) and it["price"]
    )
    tickers = [it["ticker"] for it in items[:5]]
    return {"ok": True, "tickers": tickers, "total": total, "priced": priced}


@router.get("/symbols")
def symbols(q: str = Query("", min_length=0), limit: int = 8):
    q = q.strip().upper()

    # ✅ inclui todos os tickers (mesmo sem preço)
    tickers = [it["ticker"] for it in get_assets_index()]

    if not q:
        return tickers[:limit]

    starts = [t for t in tickers if t.startswith(q)]
    contains = [t for t in tickers if q in t and not t.startswith(q)]
    return (starts + contains)[:limit]


@router.get("/prices")
def prices(tickers: str = Query(..., description="CSV: ITUB4,VALE3")):
    """
    Retorna preços para os tickers informados.
    """
    wanted = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    price_map = get_price_map()

    out = {}
    for t in wanted:
        out[t] = price_map.get(t)  # None se não existir
    return out


@router.get("/assets")
def assets():
    """
    Retorna o 'index' completo para uso no front:
    [{ ticker, price, cls }, ...]
    ✅ cls vem 100% da tabela, sem inferência
    ✅ inclui tickers mesmo com price=None
    """
    items = get_assets_index()
    return {"items": items, "total": len(items)}
