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
// ===========================
// Notes/Targets (Rebalancer)
// ===========================

export type DbPositionRow = {
  ticker: string;
  quantity: number;
  price: number | null;
  cls: string | null;
  note: number | null;
};

export type RebalancePosition = {
  ticker: string;
  asset_type: "STOCK" | "FII" | "BOND";
  quantity: number;
  price: number;
};

// DB -> asset_type (mesma lógica do backend portfolio_db.py)
export function dbRowToAssetType(ticker: string, cls: string | null | undefined): "STOCK" | "FII" | "BOND" {
  const c = (cls ?? "").trim().toLowerCase();
  const t = (ticker ?? "").trim().toUpperCase();

  if (c === "fiis" || c === "fii") return "FII";
  if (c === "bonds" || c === "bond" || c === "tesouro" || c === "rf") return "BOND";
  if (c === "stocks" || c === "stock" || c === "acoes" || c === "ação" || c === "acoes") return "STOCK";

  // fallback por ticker
  if (t.endsWith("11")) return "FII";
  if (t.startsWith("BRSTN")) return "BOND";
  return "STOCK";
}

function normType(x: string): "STOCK" | "FII" | "BOND" | "OTHER" {
  const s = (x ?? "").trim().toUpperCase();
  if (["STOCK", "ACAO", "ACOES", "EQUITY", "BR_STOCK"].includes(s)) return "STOCK";
  if (["FII", "FIIS", "REIT"].includes(s)) return "FII";
  if (["BOND", "TESOURO", "TESOURO DIRETO", "RF", "RENDA FIXA"].includes(s)) return "BOND";
  return "OTHER";
}

export function buildWeightedTargetsFE(args: {
  positions: Array<{ ticker: string; asset_type: string }>;
  w_stock: number;
  w_fii: number;
  w_bond: number;
  include_tesouro: boolean;
  notesByTicker?: Record<string, number>;
}): Record<string, number> {
  const { positions, notesByTicker } = args;

  const weightsByType: Record<"STOCK" | "FII" | "BOND", number> = {
    STOCK: Math.max(0, args.w_stock),
    FII: Math.max(0, args.w_fii),
    BOND: args.include_tesouro ? Math.max(0, args.w_bond) : 0,
  };

  // unique tickers by type
  const tickersByType: Record<"STOCK" | "FII" | "BOND", string[]> = { STOCK: [], FII: [], BOND: [] };

  for (const p of positions) {
    const t = (p.ticker ?? "").trim().toUpperCase();
    if (!t) continue;
    const at = normType(p.asset_type);
    if (at === "OTHER") continue;

    const arr = tickersByType[at];
    if (!arr.includes(t)) arr.push(t);
  }

  const noteOf = (t: string): number => {
    if (!notesByTicker) return 10;
    const v = notesByTicker[t] ?? notesByTicker[t.toUpperCase()];
    const n = Number(v);
    if (!Number.isFinite(n)) return 10;
    if (n < 0) return 0;
    return n;
  };

  const eligibleByType: Partial<Record<"STOCK" | "FII" | "BOND", string[]>> = {};
  const withinByType: Partial<Record<"STOCK" | "FII" | "BOND", Record<string, number>>> = {};

  (["STOCK", "FII", "BOND"] as const).forEach((at) => {
    const uniq = Array.from(new Set(tickersByType[at])).sort();
    if (!uniq.length) return;

    if (notesByTicker) {
      const scored = uniq.map((t) => [t, noteOf(t)] as const);
      const pos = scored.filter(([, n]) => n > 0);
      const s = pos.reduce((acc, [, n]) => acc + n, 0);

      if (s > 0) {
        eligibleByType[at] = pos.map(([t]) => t);
        withinByType[at] = Object.fromEntries(pos.map(([t, n]) => [t, n / s]));
      } else {
        eligibleByType[at] = uniq;
        withinByType[at] = Object.fromEntries(uniq.map((t) => [t, 1 / uniq.length]));
      }
    } else {
      eligibleByType[at] = uniq;
      withinByType[at] = Object.fromEntries(uniq.map((t) => [t, 1 / uniq.length]));
    }
  });

  const activeTypes = (["STOCK", "FII", "BOND"] as const).filter(
    (at) => weightsByType[at] > 0 && (eligibleByType[at]?.length ?? 0) > 0,
  );

  if (!activeTypes.length) return {};

  const totalW = activeTypes.reduce((acc, at) => acc + weightsByType[at], 0);

  const out: Record<string, number> = {};
  for (const at of activeTypes) {
    const clsW = weightsByType[at] / totalW;
    const within = withinByType[at] ?? {};
    for (const [ticker, wIn] of Object.entries(within)) {
      out[ticker] = (out[ticker] ?? 0) + clsW * wIn;
    }
  }

  // renorm
  const s = Object.values(out).reduce((acc, v) => acc + v, 0);
  if (s > 0 && Math.abs(s - 1) > 1e-12) {
    for (const k of Object.keys(out)) out[k] /= s;
  }

  return out;
}

