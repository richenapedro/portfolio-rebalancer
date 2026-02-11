"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AllocationSliders, type AllocationWeights } from "../../components/AllocationSliders";
import {
  createRebalanceB3Job,
  getJob,
  type JobStatusResponse,
  type RebalanceResult,
} from "@/lib/api";
import { SummaryCards } from "../../components/SummaryCards";
import { TradesTable } from "../../components/TradesTable";

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

/* -------------------------------- helpers --------------------------------- */

function classifyTicker(ticker: string): AssetClass {
  const t = ticker.toUpperCase().trim();
  if (/11$/.test(t)) return "fiis";
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
  for (const item of v) {
    if (isHoldingRow(item)) out.push(item);
  }
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

function fmtMoney(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}
function fmtQty(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 }).format(n);
}
function fmtPct(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n) + "%";
}

function sumValues(rows: HoldingRow[]): number {
  return rows.reduce((acc, r) => {
    if (typeof r.value === "number") return acc + r.value;
    if (typeof r.price === "number") return acc + r.quantity * r.price;
    return acc;
  }, 0);
}

function allocationFromHoldings(rows: HoldingRow[]) {
  const totals = { stocks: 0, fiis: 0, bonds: 0 };
  let total = 0;

  for (const r of rows) {
    const value =
      typeof r.value === "number"
        ? r.value
        : typeof r.price === "number"
          ? r.quantity * r.price
          : 0;

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
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {a}
    </span>
  );
}

function AllocationBreakdownCard(props: { title: string; rows: HoldingRow[] }) {
  const data = useMemo(() => allocationFromHoldings(props.rows), [props.rows]);

  const items: Array<{ key: keyof typeof data.pct; label: string }> = [
    { key: "stocks", label: "Ações" },
    { key: "fiis", label: "FIIs" },
    { key: "bonds", label: "Tesouro / RF" },
  ];

  return (
    <div className="bg-[var(--surface-alt)] border border-[var(--border)] rounded-xl p-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-xs font-semibold text-[var(--text-primary)]">{props.title}</div>
        <div className="text-[11px] text-[var(--text-muted)]">
          Total: <span className="font-mono text-[var(--text-primary)]">{fmtMoney(data.total)}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {items.map((it) => (
          <div key={it.key} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2">
            <div className="text-[11px] text-[var(--text-muted)]">{it.label}</div>
            <div className="font-mono text-sm text-[var(--text-primary)]">{fmtPct(data.pct[it.key])}</div>
          </div>
        ))}
      </div>

      <div className="mt-2 text-[11px] text-[var(--text-muted)]">
        *Heurística: FIIs terminam em “11”. Ajuste quando o backend enviar o tipo.
      </div>
    </div>
  );
}

function HoldingsBeforeTable(props: {
  rows: UnifiedRow[];
  title: string;
  holdings: HoldingRow[];
  syncId: string;
}) {
  const total = useMemo(() => props.rows.reduce((acc, r) => acc + (r.before.value ?? 0), 0), [props.rows]);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bindSyncScroll(props.syncId, bodyRef.current, "a");
  }, [props.syncId]);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 flex flex-col h-full">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-semibold text-[var(--text-primary)]">{props.title}</h3>
        <div className="text-xs text-[var(--text-muted)]">
          Total: <span className="font-mono text-[var(--text-primary)]">{fmtMoney(total)}</span>
        </div>
      </div>

      <div
        ref={bodyRef}
        onScroll={() => syncScroll(props.syncId, "a")}
        className="overflow-x-auto overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-alt)]
                   h-[520px]"
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--surface-alt)]">
            <tr className="text-left border-b border-[var(--border)]">
              <th className="py-2 pr-3">Ticker</th>
              <th className="py-2 pr-3">Qty</th>
              <th className="py-2 pr-3">Price</th>
              <th className="py-2 pr-3">Value</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.ticker} className="border-b border-[var(--border)] last:border-b-0">
                <td className="py-2 pr-3 font-mono text-[var(--text-primary)]">{r.ticker}</td>
                <td className="py-2 pr-3 font-mono text-[var(--text-primary)]">{fmtQty(r.before.quantity)}</td>
                <td className="py-2 pr-3 font-mono text-[var(--text-primary)]">
                  {typeof r.before.price === "number" ? fmtMoney(r.before.price) : "—"}
                </td>
                <td className="py-2 pr-3 font-mono text-[var(--text-primary)]">
                  {typeof r.before.value === "number" ? fmtMoney(r.before.value) : "—"}
                </td>
              </tr>
            ))}

            {props.rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-[var(--text-muted)]">
                  Sem dados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <AllocationBreakdownCard title="Distribuição (antes)" rows={props.holdings} />
      </div>
    </div>
  );
}

function HoldingsAfterTable(props: {
  rows: UnifiedRow[];
  title: string;
  holdings: HoldingRow[];
  syncId: string;
}) {
  const total = useMemo(() => props.rows.reduce((acc, r) => acc + (r.after.value ?? 0), 0), [props.rows]);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bindSyncScroll(props.syncId, bodyRef.current, "b");
  }, [props.syncId]);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 flex flex-col h-full">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-semibold text-[var(--text-primary)]">{props.title}</h3>
        <div className="text-xs text-[var(--text-muted)]">
          Total: <span className="font-mono text-[var(--text-primary)]">{fmtMoney(total)}</span>
        </div>
      </div>

      <div
        ref={bodyRef}
        onScroll={() => syncScroll(props.syncId, "b")}
        className="overflow-x-auto overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-alt)]
                   h-[520px]"
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--surface-alt)]">
            <tr className="text-left border-b border-[var(--border)]">
              <th className="py-2 pr-3">Ticker</th>
              <th className="py-2 pr-3">Action</th>
              <th className="py-2 pr-3">Qty</th>
              <th className="py-2 pr-3">Price</th>
              <th className="py-2 pr-3">Value</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.ticker} className="border-b border-[var(--border)] last:border-b-0">
                <td className="py-2 pr-3 font-mono text-[var(--text-primary)]">{r.ticker}</td>
                <td className="py-2 pr-3">
                  <ActionBadge action={r.action} />
                </td>
                <td className="py-2 pr-3 font-mono text-[var(--text-primary)]">{fmtQty(r.after.quantity)}</td>
                <td className="py-2 pr-3 font-mono text-[var(--text-primary)]">
                  {typeof r.after.price === "number" ? fmtMoney(r.after.price) : "—"}
                </td>
                <td className="py-2 pr-3 font-mono text-[var(--text-primary)]">
                  {typeof r.after.value === "number" ? fmtMoney(r.after.value) : "—"}
                </td>
              </tr>
            ))}

            {props.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-[var(--text-muted)]">
                  Sem dados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <AllocationBreakdownCard title="Distribuição (depois)" rows={props.holdings} />
      </div>
    </div>
  );
}

/* --------------------------------- page ----------------------------------- */

export default function RebalancePage() {
  const [file, setFile] = useState<File | null>(null);
  const [cash, setCash] = useState<number>(100);
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
      setErr("A soma dos sliders deve ser 100% para calcular.");
      return;
    }

    setErr(null);
    setLoading(true);
    setJob(null);
    setJobId(null);

    try {
      const created = await createRebalanceB3Job({
        file,
        cash,
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

  const trades = useMemo(() => readTrades(resultUnknown), [resultUnknown]);

  const unifiedRows: UnifiedRow[] = useMemo(() => {
    const eps = 1e-9;

    const mapBefore = new Map<string, HoldingRow>();
    const mapAfter = new Map<string, HoldingRow>();

    for (const r of holdingsBefore) mapBefore.set(r.ticker, r);
    for (const r of holdingsAfter) mapAfter.set(r.ticker, r);

    const tickers = new Set<string>();
    for (const t of mapBefore.keys()) tickers.add(t);
    for (const t of mapAfter.keys()) tickers.add(t);

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

  const summaryFromApi = useMemo(() => readSummary(resultUnknown), [resultUnknown]);

  const totalsFromTables = useMemo(() => {
    const before = sumValues(holdingsBefore);
    const after = sumValues(holdingsAfter);
    return { before, after };
  }, [holdingsBefore, holdingsAfter]);

  const summaryFixed: Summary | null = useMemo(() => {
    if (!summaryFromApi) return null;

    const hasBefore = totalsFromTables.before > 0;
    const hasAfter = totalsFromTables.after > 0;

    return {
      ...summaryFromApi,
      total_value_before: hasBefore ? totalsFromTables.before : summaryFromApi.total_value_before,
      total_value_after: hasAfter ? totalsFromTables.after : summaryFromApi.total_value_after,
    };
  }, [summaryFromApi, totalsFromTables]);

  const hasHoldings = holdingsBefore.length > 0 || holdingsAfter.length > 0;

  return (
    <main className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Portfolio Rebalancer</h1>
        <div className="text-sm text-[var(--text-muted)]">B3 XLSX → trades + relatório</div>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--text-primary)]">Arquivo B3 (XLSX)</label>

            <div className="flex items-center gap-3">
              <label
                className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl
                           border border-[var(--border)] bg-[var(--surface-alt)] px-4 text-sm font-semibold
                           text-[var(--text-primary)] hover:bg-[var(--surface-alt)]/70 transition-colors"
              >
                {file ? "Trocar arquivo" : "Escolher arquivo"}
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>

              <div className="min-w-0 flex-1">
                {file ? (
                  <div className="truncate text-sm text-[var(--text-primary)]">
                    <span className="font-mono">{file.name}</span>
                  </div>
                ) : (
                  <div className="text-sm text-[var(--text-muted)]">Nenhum arquivo selecionado</div>
                )}
              </div>
            </div>

            {file && (
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Remover
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[var(--text-primary)]">Cash</label>
              <input
                type="number"
                value={cash}
                onChange={(e) => setCash(Number(e.target.value))}
                className="w-full h-10 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)]
                           px-3 text-sm text-[var(--text-primary)] outline-none
                           focus:ring-2 focus:ring-[var(--border)]"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[var(--text-primary)]">Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
                className="w-full h-10 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)]
                           px-3 text-sm text-[var(--text-primary)] outline-none"
              >
                <option value="TRADE">TRADE</option>
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
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
              {loading ? "Running" : "Run rebalance"}
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
            <div className="text-sm font-semibold text-[var(--text-primary)]">Alocação alvo</div>
          </div>
          <AllocationSliders value={weights} onChange={setWeights} />
        </div>
      </section>

      {job?.status === "error" && job.error && (
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
          <h2 className="font-semibold text-[var(--text-primary)] mb-2">Erro do cálculo</h2>
          <pre className="text-xs whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3 text-[var(--text-muted)] overflow-x-auto">
            {JSON.stringify(job.error, null, 2)}
          </pre>
        </section>
      )}

      {job?.status === "done" && summaryFixed && (
        <section className="space-y-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
            <h2 className="font-semibold text-[var(--text-primary)] mb-3">Summary</h2>
            <div className="grid items-stretch">
              <SummaryCards summary={summaryFixed} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            <HoldingsBeforeTable
              title="Antes do rebalance"
              rows={unifiedRows}
              holdings={holdingsBefore}
              syncId="holdings"
            />
            <HoldingsAfterTable
              title="Depois do rebalance"
              rows={unifiedRows}
              holdings={holdingsAfter}
              syncId="holdings"
            />
          </div>

          {!hasHoldings && (
            <div className="text-xs text-[var(--text-muted)]">
              ⚠️ As tabelas dependem do backend retornar{" "}
              <span className="font-mono text-[var(--text-primary)]">holdings_before</span> e{" "}
              <span className="font-mono text-[var(--text-primary)]">holdings_after</span>.
            </div>
          )}

          <TradesTable trades={trades} />
        </section>
      )}
    </main>
  );
}
