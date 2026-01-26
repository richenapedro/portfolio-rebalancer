from __future__ import annotations

import csv
from pathlib import Path
from urllib.request import urlopen

from .models import Position
from .targets import TargetAllocation

PathLike = str | Path


def _to_float(s: str) -> float:
    v = (s or "").strip().replace(" ", "")
    if not v:
        raise ValueError("empty number")

    # suporta 1.234,56 e 1234,56
    if "," in v and "." in v:
        v = v.replace(".", "").replace(",", ".")
    elif "," in v and "." not in v:
        v = v.replace(",", ".")
    return float(v)


def load_positions_csv(path: PathLike) -> list[Position]:
    p = Path(path)
    with p.open(newline="", encoding="utf-8") as f:
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

            try:
                qty = _to_float(row.get("quantity") or "")
            except ValueError as e:
                raise ValueError(f"positions csv: invalid quantity for {ticker}") from e

            try:
                price = _to_float(row.get("price") or "")
            except ValueError as e:
                raise ValueError(f"positions csv: invalid price for {ticker}") from e

            out.append(
                Position(
                    ticker=ticker,
                    asset_type=asset_type,
                    quantity=float(qty),
                    price=float(price),
                )
            )
        return out


def _normalize_source(source: str) -> str:
    s = source.strip()

    low = s.lower()
    if low.startswith("https:\\"):
        s = "https://" + s[6:].lstrip("\\/")
    elif low.startswith("http:\\"):
        s = "http://" + s[5:].lstrip("\\/")

    return s.replace("\\", "/")


def _is_url(s: str) -> bool:
    low = s.strip().lower()
    return low.startswith("http://") or low.startswith("https://")


def load_prices_csv(path_or_url: PathLike) -> dict[str, float]:
    source = _normalize_source(str(path_or_url))

    if _is_url(source):
        with urlopen(source) as resp:
            text = resp.read().decode("utf-8-sig")
        reader = csv.DictReader(text.splitlines())
        return _parse_prices_reader(reader)

    p = Path(source)
    with p.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return _parse_prices_reader(reader)


def _parse_prices_reader(reader: csv.DictReader) -> dict[str, float]:
    if not reader.fieldnames or "ticker" not in set(reader.fieldnames):
        raise ValueError("prices csv must have column: ticker")

    has_price = "price" in set(reader.fieldnames)
    has_prev = "previous_close" in set(reader.fieldnames)
    if not (has_price or has_prev):
        raise ValueError("prices csv must have column: price and/or previous_close")

    out: dict[str, float] = {}

    for row in reader:
        ticker = (row.get("ticker") or "").strip().upper()
        if not ticker:
            continue

        price_raw = (row.get("price") or "").strip()
        prev_raw = (row.get("previous_close") or "").strip()

        px: float | None = None

        if price_raw:
            try:
                v = _to_float(price_raw)
                if v > 0:
                    px = v
            except ValueError:
                pass

        if px is None and prev_raw:
            try:
                v = _to_float(prev_raw)
                if v > 0:
                    px = v
            except ValueError:
                pass

        if px is not None:
            out[ticker] = float(px)

    return out


def load_prices_for_positions(
    positions: list[Position],
    prices_path_or_url: PathLike,
    *,
    fallback_used: set[str] | None = None,  # opcional: rastrear quem caiu no fallback
) -> dict[str, float]:
    sheet_prices = load_prices_csv(prices_path_or_url)

    out: dict[str, float] = {}
    for p in positions:
        t = (p.ticker or "").strip().upper()
        if not t:
            continue

        px = sheet_prices.get(t)
        if px is None:
            px = float(p.price)
            if fallback_used is not None:
                fallback_used.add(t)

        if float(px) <= 0:
            raise ValueError(f"resolved price must be > 0 for ticker: {t}")

        out[t] = float(px)

    return out


def load_targets_csv(path: PathLike) -> TargetAllocation:
    p = Path(path)
    with p.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        required = {"ticker", "weight"}
        if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
            raise ValueError(f"targets csv must have columns: {sorted(required)}")

        weights: dict[str, float] = {}
        for row in reader:
            t = (row.get("ticker") or "").strip().upper()
            if not t:
                continue
            weights[t] = float(row.get("weight") or 0.0)

        return TargetAllocation(weights)
