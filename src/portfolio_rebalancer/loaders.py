from __future__ import annotations

import csv
from pathlib import Path

from .models import Position
from .targets import TargetAllocation


def load_positions_csv(path: str | Path) -> list[Position]:
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


def load_prices_csv(path: str | Path) -> dict[str, float]:
    p = Path(path)
    with p.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        required = {"ticker", "price"}
        if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
            raise ValueError(f"prices csv must have columns: {sorted(required)}")

        out: dict[str, float] = {}
        for row in reader:
            out[row["ticker"].strip().upper()] = float(row["price"])
        return out


def load_targets_csv(path: str | Path) -> TargetAllocation:
    p = Path(path)
    with p.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        required = {"ticker", "weight"}
        if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
            raise ValueError(f"targets csv must have columns: {sorted(required)}")

        weights: dict[str, float] = {}
        for row in reader:
            weights[row["ticker"]] = float(row["weight"])
        return TargetAllocation(weights)
