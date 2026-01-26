from __future__ import annotations

import csv
from pathlib import Path
from urllib.request import urlopen

from .models import Position
from .targets import TargetAllocation

PathLike = str | Path


def load_positions_csv(path: PathLike) -> list[Position]:
    p = Path(path)
    with p.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        required = {"ticker", "asset_type", "quantity", "price"}
        if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
            raise ValueError(f"positions csv must have columns: {sorted(required)}")

        out: list[Position] = []
        for row in reader:
            out.append(
                Position(
                    ticker=row["ticker"],
                    asset_type=row["asset_type"],
                    quantity=float(row["quantity"]),
                    price=float(row["price"]),
                )
            )
        return out


def _normalize_source(source: str) -> str:
    s = source.strip()

    # Se alguém (ou Path) transformou https:// em https:\, corrige
    low = s.lower()
    if low.startswith("https:\\"):
        s = "https://" + s[6:].lstrip("\\/")
    elif low.startswith("http:\\"):
        s = "http://" + s[5:].lstrip("\\/")

    # normaliza separador
    return s.replace("\\", "/")


def _is_url(s: str) -> bool:
    low = s.strip().lower()
    return low.startswith("http://") or low.startswith("https://")


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

    # aceita price e/ou previous_close
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

        chosen = price_raw if price_raw else prev_raw
        if not chosen:
            continue

        try:
            out[ticker] = _to_float(chosen)
        except ValueError:
            continue

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
            weights[(row["ticker"] or "").strip().upper()] = float(row["weight"])
        return TargetAllocation(weights)
