import type { RebalanceResult } from "@/lib/api";

export type Mode = "BUY" | "SELL" | "TRADE";

export type HoldingRow = {
  ticker: string;
  quantity: number;
  price?: number;
  value?: number;
};

export type Summary = RebalanceResult["summary"];
export type Trade = RebalanceResult["trades"][number];

export type UnifiedRow = {
  ticker: string;
  before: HoldingRow;
  after: HoldingRow;
  deltaQty: number;
  action: "BUY" | "SELL" | "—";
};

export type AssetClass = "stocks" | "fiis" | "bonds";
export type ImportSource = "file" | "db" | null;

export function classifyTicker(ticker: string): AssetClass {
  const t = ticker.toUpperCase().trim();

  if (/11$/.test(t)) return "fiis";
  if (t.startsWith("BRSTN")) return "bonds";
  if (t.includes("TESOURO") || t.startsWith("LFT") || t.startsWith("LTN") || t.startsWith("NTN")) return "bonds";

  return "stocks";
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isHoldingRow(x: unknown): x is HoldingRow {
  if (!isObject(x)) return false;
  return typeof x.ticker === "string" && typeof x.quantity === "number";
}

export function readHoldingRows(obj: unknown, key: string): HoldingRow[] {
  if (!isObject(obj)) return [];
  const v = obj[key];
  if (!Array.isArray(v)) return [];
  const out: HoldingRow[] = [];
  for (const item of v) if (isHoldingRow(item)) out.push(item);
  return out;
}

export function readSummary(obj: unknown): Summary | null {
  if (!isObject(obj)) return null;
  const s = obj.summary;
  if (!isObject(s)) return null;

  const required = ["cash_before", "cash_after", "total_value_before", "total_value_after", "n_trades"] as const;
  for (const k of required) if (typeof s[k] !== "number") return null;

  return s as Summary;
}

export function readTrades(obj: unknown): Trade[] {
  if (!isObject(obj)) return [];
  const t = obj.trades;
  if (!Array.isArray(t)) return [];
  return t as Trade[];
}

export function allocationFromHoldings(rows: HoldingRow[]) {
  const totals = { stocks: 0, fiis: 0, bonds: 0 };
  let total = 0;

  for (const r of rows) {
    const value = typeof r.value === "number" ? r.value : typeof r.price === "number" ? r.quantity * r.price : 0;
    const cls = classifyTicker(r.ticker);
    totals[cls] += value;
    total += value;
  }

  const pct = {
    stocks: total > 0 ? (totals.stocks / total) * 100 : 0,
    fiis: total > 0 ? (totals.fiis / total) * 100 : 0,
    bonds: total > 0 ? (totals.bonds / total) * 100 : 0,
  };

  return { totals, total, pct };
}
