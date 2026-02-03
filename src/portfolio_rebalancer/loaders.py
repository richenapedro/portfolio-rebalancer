from __future__ import annotations

import csv
import io
import re
from pathlib import Path
from typing import Union
from urllib.error import URLError
from urllib.request import urlopen

from .models import Position
from .targets import TargetAllocation

PathLike = Union[str, Path]


def _normalize_source(source: str) -> str:
    s = source.strip()
    low = s.lower()

    # caso o user cole URL com barras invertidas (Windows)
    if low.startswith("https:\\"):
        s = "https://" + s[6:].lstrip("\\/")  # remove "https:\"
    elif low.startswith("http:\\"):
        s = "http://" + s[5:].lstrip("\\/")

    return s.replace("\\", "/")


def _is_url(s: str) -> bool:
    low = s.strip().lower()
    return low.startswith("http://") or low.startswith("https://")


def _parse_float_any_locale(raw: str) -> float:
    s = (raw or "").strip()
    if not s:
        raise ValueError("empty")

    # mantém só dígitos, separadores e sinal
    s = re.sub(r"[^0-9,.\-]", "", s)

    if not s or s in {"-", ".", ","}:
        raise ValueError("empty")

    has_comma = "," in s
    has_dot = "." in s

    if has_comma and has_dot:
        # último separador costuma ser o decimal
        if s.rfind(",") > s.rfind("."):
            # 1.234,56 -> 1234.56
            s = s.replace(".", "").replace(",", ".")
        else:
            # 1,234.56 -> 1234.56
            s = s.replace(",", "")
    elif has_comma:
        # 1234,56 -> 1234.56  (e também 1.234 -> 1234)
        s = s.replace(".", "").replace(",", ".")
    else:
        # 1234.56 ou 1234
        s = s.replace(",", "")

    return float(s)


def load_positions_csv(path: PathLike) -> list[Position]:
    p = Path(path)
    with p.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        required = {"ticker", "asset_type", "quantity", "price"}
        if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
            raise ValueError(f"positions csv must have columns: {sorted(required)}")

        out: list[Position] = []
        for row in reader:
            ticker = (row.get("ticker") or "").strip().upper()
            asset_type = (row.get("asset_type") or "").strip().upper()

            if not ticker:
                raise ValueError("positions csv: empty ticker")

            qty = _parse_float_any_locale(row.get("quantity") or "")
            price = _parse_float_any_locale(row.get("price") or "")

            out.append(
                Position(
                    ticker=ticker,
                    asset_type=asset_type,
                    quantity=float(qty),
                    price=float(price),
                )
            )
        return out


def load_prices_csv(path_or_url: PathLike) -> dict[str, float]:
    source = _normalize_source(str(path_or_url))

    if _is_url(source):
        with urlopen(source) as resp:
            text = resp.read().decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        return _parse_prices_reader(reader)

    p = Path(source)
    with p.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        return _parse_prices_reader(reader)


def _parse_prices_reader(reader: csv.DictReader) -> dict[str, float]:
    if not reader.fieldnames:
        raise ValueError("prices csv must have a header row")

    fields = {h.strip() for h in reader.fieldnames if h}

    if "ticker" not in fields:
        raise ValueError("prices csv must have column: ticker")

    # aceita:
    # - ticker,price
    # - ticker,price,previous_close
    if "price" not in fields and "previous_close" not in fields:
        raise ValueError(
            "prices csv must have column: price (optional: previous_close)"
        )

    out: dict[str, float] = {}

    for row in reader:
        ticker = (row.get("ticker") or "").strip().upper()
        if not ticker:
            continue

        price_raw = (row.get("price") or "").strip() if "price" in fields else ""
        prev_raw = (
            (row.get("previous_close") or "").strip()
            if "previous_close" in fields
            else ""
        )

        chosen = price_raw if price_raw else prev_raw
        if not chosen:
            continue

        try:
            px = _parse_float_any_locale(chosen)
        except ValueError:
            raise ValueError(f"invalid price for ticker {ticker}: {chosen!r}") from None

        if px > 0:
            out[ticker] = float(px)

    return out


def load_prices_for_positions(
    positions: list[Position],
    prices_path_or_url: PathLike,
    *,
    fallback_csv: PathLike | None = None,  # ex: "out/prices.csv"
    fallback_used: set[str] | None = None,  # tickers que caíram no fallback
) -> dict[str, float]:
    # tenta planilha/URL primeiro
    try:
        sheet_prices = load_prices_csv(prices_path_or_url)
    except (URLError, OSError):
        sheet_prices = {}

    # fallback secundário: um prices.csv local gerado pelo import-b3
    fallback_prices: dict[str, float] = {}
    if fallback_csv is not None:
        try:
            fallback_prices = load_prices_csv(fallback_csv)
        except (OSError, URLError):
            fallback_prices = {}

    out: dict[str, float] = {}

    for p in positions:
        t = (p.ticker or "").strip().upper()
        if not t:
            continue

        if t in sheet_prices:
            px = float(sheet_prices[t])
        elif t in fallback_prices:
            px = float(fallback_prices[t])
            if fallback_used is not None:
                fallback_used.add(t)
        else:
            # fallback final: preço vindo do XLSX (via positions.csv)
            px = float(p.price)
            if fallback_used is not None:
                fallback_used.add(t)

        if px <= 0:
            raise ValueError(f"resolved price must be > 0 for ticker: {t}")

        out[t] = px

    return out


def load_targets_csv(path: PathLike) -> TargetAllocation:
    p = Path(path)
    with p.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        required = {"ticker", "weight"}
        if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
            raise ValueError(f"targets csv must have columns: {sorted(required)}")

        weights: dict[str, float] = {}
        for row in reader:
            t = (row.get("ticker") or "").strip().upper()
            if not t:
                continue
            weights[t] = float(_parse_float_any_locale(row.get("weight") or "0"))

        return TargetAllocation(weights)
