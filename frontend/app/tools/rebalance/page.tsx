/* page.tsx */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AllocationSliders, type AllocationWeights } from "../../components/AllocationSliders";
import {
  createRebalanceB3Job,
  getJob,
  type JobStatusResponse,
  type RebalanceResult,
  importB3,
} from "@/lib/api";
import { SummaryCards } from "../../components/SummaryCards";
import { TradesTable } from "../../components/TradesTable";
import { useI18n } from "@/i18n/I18nProvider";

/* ------------------------- API base (DB endpoints) ------------------------- */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

/* ------------------------- scroll sync (Before/After) ------------------------- */

type SyncBus = {
  isSyncing: boolean;
  a?: HTMLDivElement | null;
  b?: HTMLDivElement | null;
};

const syncBus: Record<string, SyncBus> = {};

function bindSyncScroll(id: string, el: HTMLDivElement | null, side: "a" | "b") {
  if (!syncBus[id]) syncBus[id] = { isSyncing: false };
  syncBus[id][side] = el;
}

function syncScroll(id: string, source: "a" | "b") {
  const bus = syncBus[id];
  if (!bus || bus.isSyncing) return;

  const from = source === "a" ? bus.a : bus.b;
  const to = source === "a" ? bus.b : bus.a;
  if (!from || !to) return;

  bus.isSyncing = true;
  to.scrollTop = from.scrollTop;

  requestAnimationFrame(() => {
    bus.isSyncing = false;
  });
}

/* --------------------------------- types ---------------------------------- */

type Mode = "BUY" | "SELL" | "TRADE";

type HoldingRow = {
  ticker: string;
  quantity: number;
  price?: number;
  value?: number;
};

type Summary = RebalanceResult["summary"];
type Trade = RebalanceResult["trades"][number];

type UnifiedRow = {
  ticker: string;
  before: HoldingRow;
  after: HoldingRow;
  deltaQty: number;
  action: "BUY" | "SELL" | "—";
};

type AssetClass = "stocks" | "fiis" | "bonds";

type ImportSource = "file" | "db" | null;

/* -------------------------------- helpers --------------------------------- */

function classifyTicker(ticker: string): AssetClass {
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

function readHoldingRows(obj: unknown, key: string): HoldingRow[] {
  if (!isObject(obj)) return [];
  const v = obj[key];
  if (!Array.isArray(v)) return [];
  const out: HoldingRow[] = [];
  for (const item of v) if (isHoldingRow(item)) out.push(item);
  return out;
}

function readSummary(obj: unknown): Summary | null {
  if (!isObject(obj)) return null;
  const s = obj.summary;
  if (!isObject(s)) return null;

  const required = ["cash_before", "cash_after", "total_value_before", "total_value_after", "n_trades"] as const;
  for (const k of required) if (typeof s[k] !== "number") return null;

  return s as Summary;
}

function readTrades(obj: unknown): Trade[] {
  if (!isObject(obj)) return [];
  const t = obj.trades;
  if (!Array.isArray(t)) return [];
  return t as Trade[];
}

function allocationFromHoldings(rows: HoldingRow[]) {
  const totals = { stocks: 0, fiis: 0, bonds: 0 };
  let total = 0;

  for (const r of rows) {
    const value =
      typeof r.value === "number" ? r.value : typeof r.price === "number" ? r.quantity * r.price : 0;

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

/* ------------------------------- components -------------------------------- */

function ActionBadge(props: { action: "BUY" | "SELL" | "—" }) {
  const a = props.action;

  if (a === "—") return <span className="text-xs text-[var(--text-muted)]">—</span>;

  const cls =
    a === "BUY"
      ? "bg-[color:var(--buy)]/20 text-[color:var(--buy)] border-[color:var(--buy)]/30"
      : "bg-[color:var(--sell)]/20 text-[color:var(--sell)] border-[color:var(--sell)]/30";

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${cls}`}>{a}</span>
  );
}

function AllocationBreakdownCard(props: {
  title: string;
  rows: HoldingRow[];
  fmtMoney: (n: number) => string;
  fmtPct: (n: number) => string;
  labels: { stocks: string; fiis: string; bonds: string; total: string };
}) {
  const data = useMemo(() => allocationFromHoldings(props.rows), [props.rows]);

  const items: Array<{ key: keyof typeof data.pct; label: string }> = [
    { key: "stocks", label: props.labels.stocks },
    { key: "fiis", label: props.labels.fiis },
    { key: "bonds", label: props.labels.bonds },
  ];

  return (
    <div className="bg-[var(--surface-alt)] border border-[var(--border)] rounded-xl p-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-xs font-semibold text-[var(--text-primary)]">{props.title}</div>
        <div className="text-[11px] text-[var(--text-muted)]">
          {props.labels.total}:{" "}
          <span className="font-mono text-[var(--text-primary)]">{props.fmtMoney(data.total)}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {items.map((it) => (
          <div
            key={it.key}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2"
          >
            <div className="text-[11px] text-[var(--text-muted)]">{it.label}</div>
            <div className="font-mono text-sm text-[var(--text-primary)]">{props.fmtPct(data.pct[it.key])}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HoldingsBeforeTable(props: {
  rows: UnifiedRow[];
  title: string;
  holdings: HoldingRow[];
  syncId: string;
  fmtMoney: (n: number) => string;
  fmtQty: (n: number) => string;
  fmtPct: (n: number) => string;
  labels: {
    total: string;
    ticker: string;
    qty: string;
    price: string;
    value: string;
    empty: string;
    dash: string;
    breakdownBefore: string;
    allocStocks: string;
    allocFiis: string;
    allocBonds: string;
  };
}) {
  const total = useMemo(
    () => props.rows.reduce((acc: number, r: UnifiedRow) => acc + (r.before.value ?? 0), 0),
    [props.rows],
  );

  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bindSyncScroll(props.syncId, bodyRef.current, "a");
  }, [props.syncId]);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 flex flex-col h-full">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-semibold text-[var(--text-primary)]">{props.title}</h3>
        <div className="text-xs text-[var(--text-muted)]">
          {props.labels.total}:{" "}
          <span className="font-mono text-[var(--text-primary)]">{props.fmtMoney(total)}</span>
        </div>
      </div>

      <div
        ref={bodyRef}
        onScroll={() => syncScroll(props.syncId, "a")}
        className="overflow-x-auto overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] h-[520px]"
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--surface-alt)]">
            <tr className="text-left border-b border-[var(--border)]">
              <th className="py-2 pr-3">{props.labels.ticker}</th>
              <th className="py-2 pr-3">{props.labels.qty}</th>
              <th className="py-2 pr-3">{props.labels.price}</th>
              <th className="py-2 pr-3">{props.labels.value}</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.ticker} className="border-b border-[var(--border)] last:border-b-0">
                <td className="py-2 pr-3 font-mono text-[var(--text-primary)]">{r.ticker}</td>
                <td className="py-2 pr-3 font-mono text-[var(--text-primary)]">{props.fmtQty(r.before.quantity)}</td>
                <td className="py-2 pr-3 font-mono text-[var(--text-primary)]">
                  {typeof r.before.price === "number" ? props.fmtMoney(r.before.price) : props.labels.dash}
                </td>
                <td className="py-2 pr-3 font-mono text-[var(--text-primary)]">
                  {typeof r.before.value === "number" ? props.fmtMoney(r.before.value) : props.labels.dash}
                </td>
              </tr>
            ))}

            {props.rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-[var(--text-muted)]">
                  {props.labels.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <AllocationBreakdownCard
          title={props.labels.breakdownBefore}
          rows={props.holdings}
          fmtMoney={props.fmtMoney}
          fmtPct={props.fmtPct}
          labels={{
            stocks: props.labels.allocStocks,
            fiis: props.labels.allocFiis,
            bonds: props.labels.allocBonds,
            total: props.labels.total,
          }}
        />
      </div>
    </div>
  );
}

function HoldingsAfterTable(props: {
  rows: UnifiedRow[];
  title: string;
  holdings: HoldingRow[];
  syncId: string;
  fmtMoney: (n: number) => string;
  fmtQty: (n: number) => string;
  fmtPct: (n: number) => string;
  labels: {
    total: string;
    ticker: string;
    action: string;
    qty: string;
    price: string;
    value: string;
    empty: string;
    dash: string;
    breakdownAfter: string;
    allocStocks: string;
    allocFiis: string;
    allocBonds: string;
  };
}) {
  const total = useMemo(
    () => props.rows.reduce((acc: number, r: UnifiedRow) => acc + (r.after.value ?? 0), 0),
    [props.rows],
  );

  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bindSyncScroll(props.syncId, bodyRef.current, "b");
  }, [props.syncId]);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 flex flex-col h-full">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-semibold text-[var(--text-primary)]">{props.title}</h3>
        <div className="text-xs text-[var(--text-muted)]">
          {props.labels.total}:{" "}
          <span className="font-mono text-[var(--text-primary)]">{props.fmtMoney(total)}</span>
        </div>
      </div>

      <div
        ref={bodyRef}
        onScroll={() => syncScroll(props.syncId, "b")}
        className="overflow-x-auto overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] h-[520px]"
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--surface-alt)]">
            <tr className="text-left border-b border-[var(--border)]">
              <th className="py-2 pr-3">{props.labels.ticker}</th>
              <th className="py-2 pr-3">{props.labels.action}</th>
              <th className="py-2 pr-3">{props.labels.qty}</th>
              <th className="py-2 pr-3">{props.labels.price}</th>
              <th className="py-2 pr-3">{props.labels.value}</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.ticker} className="border-b border-[var(--border)] last:border-b-0">
                <td className="py-2 pr-3 font-mono text-[var(--text-primary)]">{r.ticker}</td>
                <td className="py-2 pr-3">
                  <ActionBadge action={r.action} />
                </td>
                <td className="py-2 pr-3 font-mono text-[var(--text-primary)]">{props.fmtQty(r.after.quantity)}</td>
                <td className="py-2 pr-3 font-mono text-[var(--text-primary)]">
                  {typeof r.after.price === "number" ? props.fmtMoney(r.after.price) : props.labels.dash}
                </td>
                <td className="py-2 pr-3 font-mono text-[var(--text-primary)]">
                  {typeof r.after.value === "number" ? props.fmtMoney(r.after.value) : props.labels.dash}
                </td>
              </tr>
            ))}

            {props.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-[var(--text-muted)]">
                  {props.labels.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <AllocationBreakdownCard
          title={props.labels.breakdownAfter}
          rows={props.holdings}
          fmtMoney={props.fmtMoney}
          fmtPct={props.fmtPct}
          labels={{
            stocks: props.labels.allocStocks,
            fiis: props.labels.allocFiis,
            bonds: props.labels.allocBonds,
            total: props.labels.total,
          }}
        />
      </div>
    </div>
  );
}

/* --------------------------------- page ----------------------------------- */

export default function RebalancePage() {
  const { lang, t } = useI18n();

  const fmtMoney = useMemo(
    () => (n: number) => new Intl.NumberFormat(lang, { style: "currency", currency: "BRL" }).format(n),
    [lang],
  );
  const fmtQty = useMemo(
    () => (n: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 8 }).format(n),
    [lang],
  );
  const fmtPct = useMemo(
    () => (n: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(n) + "%",
    [lang],
  );

  const [file, setFile] = useState<File | null>(null);

  // DB portfolios
  const [dbPortfolios, setDbPortfolios] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedDbId, setSelectedDbId] = useState<number | "">("");
  const [loadingDb, setLoadingDb] = useState(false);

  // UI clarity for source
  const [importSource, setImportSource] = useState<ImportSource>(null);

  async function loadDbPortfolios() {
    try {
      setLoadingDb(true);
      const r = await fetch(`${API_BASE}/api/db/portfolios`);
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`list portfolios failed: ${r.status} ${txt}`);
      }
      const j = (await r.json()) as { items: Array<{ id: number; name: string }> };
      setDbPortfolios(j.items ?? []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
    } finally {
      setLoadingDb(false);
    }
  }

  async function importFromDbPortfolio(portfolioId: number) {
    const r = await fetch(`${API_BASE}/api/db/portfolios/${portfolioId}/export_b3_xlsx`);
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`export xlsx failed: ${r.status} ${txt}`);
    }

    const blob = await r.blob();
    const f = new File([blob], `portfolio_${portfolioId}.xlsx`, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    setImportSource("db");
    setFile(f);

    // limpa estado anterior
    setErr(null);
    setJob(null);
    setJobId(null);

    const data = await importB3({ file: f, noTesouro: false });

    if (data.weights_current) {
      const s = Number(data.weights_current.stocks ?? 0);
      const fi = Number(data.weights_current.fiis ?? 0);
      const b = Number(data.weights_current.bonds ?? 0);
      const sum = s + fi + b;

      if (sum > 0) {
        const ns = Math.round((s / sum) * 100);
        const nfi = Math.round((fi / sum) * 100);
        let nb = 100 - ns - nfi;
        if (nb < 0) nb = 0;

        setWeights({ stocks: ns, fiis: nfi, bonds: nb });
      }
    }
  }

  // Load on mount and when user returns to tab
  useEffect(() => {
    const safeReload = () => void loadDbPortfolios();
    safeReload();

    const onFocus = () => safeReload();
    const onVisibility = () => {
      if (document.visibilityState === "visible") safeReload();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Cash: só faz sentido em BUY. Em SELL/TRADE vira 0 automaticamente.
  const [cash, setCash] = useState<number>(100);
  const [lastBuyCash, setLastBuyCash] = useState<number>(100);

  const [mode, setMode] = useState<Mode>("BUY");

  const [weights, setWeights] = useState<AllocationWeights>({
    stocks: 40,
    fiis: 30,
    bonds: 30,
  });

  const weightsSum = weights.stocks + weights.fiis + weights.bonds;
  const canSubmit = weightsSum === 100;

  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onRun() {
    if (!file) return;
    if (!canSubmit) {
      setErr(t("rebalance.errors.weightsMustBe100"));
      return;
    }

    setErr(null);
    setLoading(true);
    setJob(null);
    setJobId(null);

    try {
      const created = await createRebalanceB3Job({
        file,
        cash: mode === "BUY" ? cash : 0,
        mode,
        noTesouro: false,
        weights,
      });
      setJobId(created.job_id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!jobId) return;
    const id = jobId;
    let cancelled = false;

    async function tick() {
      try {
        const data = await getJob(id);
        if (cancelled) return;

        setJob(data);

        if (data.status === "done" || data.status === "error") {
          setLoading(false);
          return;
        }
        setTimeout(tick, 1000);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setErr(msg);
        setLoading(false);
      }
    }

    tick();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const resultUnknown: unknown = job?.result ?? null;

  const holdingsBefore = useMemo(() => readHoldingRows(resultUnknown, "holdings_before"), [resultUnknown]);
  const holdingsAfter = useMemo(() => readHoldingRows(resultUnknown, "holdings_after"), [resultUnknown]);

  const holdingsTotalBefore = useMemo(() => {
    return holdingsBefore.reduce((acc: number, r: HoldingRow) => acc + (typeof r.value === "number" ? r.value : 0), 0);
  }, [holdingsBefore]);

  const holdingsTotalAfter = useMemo(() => {
    return holdingsAfter.reduce((acc: number, r: HoldingRow) => acc + (typeof r.value === "number" ? r.value : 0), 0);
  }, [holdingsAfter]);

  const trades = useMemo(() => readTrades(resultUnknown), [resultUnknown]);
  const summaryFromApi = useMemo(() => readSummary(resultUnknown), [resultUnknown]);

  const unifiedRows: UnifiedRow[] = useMemo(() => {
    const eps = 1e-9;

    const mapBefore = new Map<string, HoldingRow>();
    const mapAfter = new Map<string, HoldingRow>();

    for (const r of holdingsBefore) mapBefore.set(r.ticker, r);
    for (const r of holdingsAfter) mapAfter.set(r.ticker, r);

    const tickers = new Set<string>();
    for (const k of mapBefore.keys()) tickers.add(k);
    for (const k of mapAfter.keys()) tickers.add(k);

    const sorted = Array.from(tickers).sort((a, b) => a.localeCompare(b));

    return sorted.map((ticker) => {
      const b = mapBefore.get(ticker) ?? { ticker, quantity: 0, value: 0 };
      const a = mapAfter.get(ticker) ?? { ticker, quantity: 0, value: 0 };

      const deltaQty = a.quantity - b.quantity;

      let action: "BUY" | "SELL" | "—" = "—";
      if (deltaQty > eps) action = "BUY";
      else if (deltaQty < -eps) action = "SELL";

      const before: HoldingRow = {
        ticker,
        quantity: b.quantity,
        price: typeof b.price === "number" ? b.price : a.price,
        value: typeof b.value === "number" ? b.value : 0,
      };
      const after: HoldingRow = {
        ticker,
        quantity: a.quantity,
        price: typeof a.price === "number" ? a.price : b.price,
        value: typeof a.value === "number" ? a.value : 0,
      };

      return { ticker, before, after, deltaQty, action };
    });
  }, [holdingsBefore, holdingsAfter]);

  const hasHoldings = holdingsBefore.length > 0 || holdingsAfter.length > 0;

  // ✅ CHANGED: only show the portfolio name (no id)
  const selectedDbLabel = useMemo(() => {
    if (selectedDbId === "") return null;
    const p = dbPortfolios.find((x) => x.id === selectedDbId);
    return p ? p.name : null;
  }, [selectedDbId, dbPortfolios]);

  const sourceLabel =
    importSource === "file"
      ? t("rebalance.import.sourceFile")
      : importSource === "db"
        ? t("rebalance.import.sourceDb")
        : "—";

  const allocLabels = {
    stocks: t("rebalance.allocation.stocks"),
    fiis: t("rebalance.allocation.fiis"),
    bonds: t("rebalance.allocation.bonds"),
    total: t("rebalance.common.total"),
  };

  return (
    <main className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{t("rebalance.title")}</h1>
        <div className="text-sm text-[var(--text-muted)]">{t("rebalance.subtitle")}</div>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          {/* Unified import row */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--text-primary)]">{t("rebalance.import.label")}</label>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-stretch">
              <select
                value={importSource === "file" ? "__file__" : selectedDbId}
                onChange={async (e) => {
                  const v = e.target.value;
                  if (v === "__file__") return;

                  const nextId = v ? Number(v) : "";
                  setSelectedDbId(nextId);
                  if (nextId === "") return;

                  try {
                    setErr(null);
                    await importFromDbPortfolio(nextId);
                  } catch (err2: unknown) {
                    const msg = err2 instanceof Error ? err2.message : String(err2);
                    setErr(msg);
                  }
                }}
                disabled={loading || loadingDb}
                title={importSource === "file" ? t("rebalance.import.titleWhenFile") : t("rebalance.import.titleWhenDb")}
                className={`w-full h-10 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)]
                           px-3 text-sm text-[var(--text-primary)] outline-none
                           ${importSource === "file" ? "cursor-help" : ""}`}
              >
                {importSource === "file" ? (
                  <option value="__file__">{t("rebalance.import.importedFromFile")}</option>
                ) : (
                  <option value="">{t("rebalance.import.selectDbPlaceholder")}</option>
                )}

                {dbPortfolios.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              {/* Button that opens file picker and imports immediately */}
              <label
                className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl
                           border border-[var(--border)] bg-[var(--surface-alt)] px-4 text-sm font-semibold
                           text-[var(--text-primary)] hover:bg-[var(--surface-alt)]/70 transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
                title={t("rebalance.import.fileBtnTitle")}
              >
                {t("rebalance.import.fileBtn")}
                <input
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (!f) return;

                    setImportSource("file");
                    setSelectedDbId("");
                    setFile(f);

                    setErr(null);
                    setJob(null);
                    setJobId(null);

                    try {
                      const data = await importB3({ file: f, noTesouro: false });

                      if (data.weights_current) {
                        const s = Number(data.weights_current.stocks ?? 0);
                        const fi = Number(data.weights_current.fiis ?? 0);
                        const b = Number(data.weights_current.bonds ?? 0);
                        const sum = s + fi + b;

                        if (sum > 0) {
                          const ns = Math.round((s / sum) * 100);
                          const nfi = Math.round((fi / sum) * 100);
                          let nb = 100 - ns - nfi;
                          if (nb < 0) nb = 0;

                          setWeights({ stocks: ns, fiis: nfi, bonds: nb });
                        }
                      }
                    } catch (err2: unknown) {
                      const msg = err2 instanceof Error ? err2.message : String(err2);
                      setErr(msg);
                    } finally {
                      e.currentTarget.value = "";
                    }
                  }}
                />
              </label>
            </div>

            {/* Source + current file indicator */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">{t("rebalance.import.source")}:</span>

              {importSource === "file" ? (
                <span
                  className="inline-flex items-center rounded-full border border-[var(--border)]
                             bg-[var(--surface-alt)] px-2.5 py-1 text-xs text-[var(--text-primary)]
                             cursor-help"
                  title={t("rebalance.import.fileChipTitle")}
                >
                  {sourceLabel}
                </span>
              ) : importSource === "db" ? (
                <span
                  className="inline-flex items-center rounded-full border border-[var(--border)]
                             bg-[var(--surface-alt)] px-2.5 py-1 text-xs text-[var(--text-primary)]"
                >
                  {sourceLabel} {selectedDbLabel ? `(${selectedDbLabel})` : ""}
                </span>
              ) : (
                <span
                  className="inline-flex items-center rounded-full border border-[var(--border)]
                             bg-[var(--surface-alt)] px-2.5 py-1 text-xs text-[var(--text-muted)]"
                >
                  —
                </span>
              )}

              <span className="text-xs text-[var(--text-muted)]">{t("rebalance.import.file")}:</span>
              <span className="text-xs font-mono text-[var(--text-primary)]">{file ? file.name : "—"}</span>

              {file && (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setImportSource(null);
                    setSelectedDbId("");
                  }}
                  className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  {t("common.remove")}
                </button>
              )}
            </div>

            <div className="text-xs text-[var(--text-muted)]">{t("rebalance.import.hint")}</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[var(--text-primary)]">{t("rebalance.controls.cash")}</label>
              <input
                type="number"
                value={cash}
                disabled={mode !== "BUY"}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setCash(v);
                  if (mode === "BUY") setLastBuyCash(v);
                }}
                className="w-full h-10 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)]
                           px-3 text-sm text-[var(--text-primary)] outline-none
                           focus:ring-2 focus:ring-[var(--border)]
                           disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[var(--text-primary)]">{t("rebalance.controls.mode")}</label>
              <select
                value={mode}
                onChange={(e) => {
                  const next = e.target.value as Mode;
                  setMode(next);

                  if (next === "BUY") setCash(lastBuyCash);
                  else setCash(0);
                }}
                className="w-full h-10 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)]
                           px-3 text-sm text-[var(--text-primary)] outline-none"
              >
                <option value="TRADE">{t("rebalance.modes.trade")}</option>
                <option value="BUY">{t("rebalance.modes.buy")}</option>
                <option value="SELL">{t("rebalance.modes.sell")}</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={onRun}
              disabled={!file || loading || !canSubmit}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--primary)] px-4
                         text-sm font-semibold text-[var(--on-primary)]
                         hover:bg-[var(--primary-hover)] transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading && (
                <span
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--on-primary)]/30 border-t-[color:var(--on-primary)]"
                  aria-hidden
                />
              )}
              {loading ? t("rebalance.run.running") : t("rebalance.run.run")}
            </button>

            {err && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                <span className="font-mono">{err}</span>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
          <div className="mb-3">
            <div className="text-sm font-semibold text-[var(--text-primary)]">{t("rebalance.target.title")}</div>
          </div>
          <AllocationSliders value={weights} onChange={setWeights} />
        </div>
      </section>

      {job?.status === "error" && job.error && (
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
          <h2 className="font-semibold text-[var(--text-primary)] mb-2">{t("rebalance.errorBlock.title")}</h2>
          <pre className="text-xs whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3 text-[var(--text-muted)] overflow-x-auto">
            {JSON.stringify(job.error, null, 2)}
          </pre>
        </section>
      )}

      {job?.status === "done" && summaryFromApi && (
        <section className="space-y-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
            <h2 className="font-semibold text-[var(--text-primary)] mb-3">{t("rebalance.summary.title")}</h2>
            <div className="grid items-stretch">
              <SummaryCards summary={summaryFromApi} holdingsTotalBefore={holdingsTotalBefore} holdingsTotalAfter={holdingsTotalAfter} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            <HoldingsBeforeTable
              title={t("rebalance.tables.beforeTitle")}
              rows={unifiedRows}
              holdings={holdingsBefore}
              syncId="holdings"
              fmtMoney={fmtMoney}
              fmtQty={fmtQty}
              fmtPct={fmtPct}
              labels={{
                total: t("rebalance.common.total"),
                ticker: t("rebalance.tables.ticker"),
                qty: t("rebalance.tables.qty"),
                price: t("rebalance.tables.price"),
                value: t("rebalance.tables.value"),
                empty: t("rebalance.tables.empty"),
                dash: t("common.dash"),
                breakdownBefore: t("rebalance.breakdown.before"),
                allocStocks: allocLabels.stocks,
                allocFiis: allocLabels.fiis,
                allocBonds: allocLabels.bonds,
              }}
            />
            <HoldingsAfterTable
              title={t("rebalance.tables.afterTitle")}
              rows={unifiedRows}
              holdings={holdingsAfter}
              syncId="holdings"
              fmtMoney={fmtMoney}
              fmtQty={fmtQty}
              fmtPct={fmtPct}
              labels={{
                total: t("rebalance.common.total"),
                ticker: t("rebalance.tables.ticker"),
                action: t("rebalance.tables.action"),
                qty: t("rebalance.tables.qty"),
                price: t("rebalance.tables.price"),
                value: t("rebalance.tables.value"),
                empty: t("rebalance.tables.empty"),
                dash: t("common.dash"),
                breakdownAfter: t("rebalance.breakdown.after"),
                allocStocks: allocLabels.stocks,
                allocFiis: allocLabels.fiis,
                allocBonds: allocLabels.bonds,
              }}
            />
          </div>

          {!hasHoldings && (
            <div className="text-xs text-[var(--text-muted)]">
              {t("rebalance.warning.noHoldingsPrefix")}{" "}
              <span className="font-mono text-[var(--text-primary)]">holdings_before</span>{" "}
              {t("rebalance.warning.noHoldingsAnd")}{" "}
              <span className="font-mono text-[var(--text-primary)]">holdings_after</span>.
            </div>
          )}

          <TradesTable trades={trades} />
        </section>
      )}
    </main>
  );
}
