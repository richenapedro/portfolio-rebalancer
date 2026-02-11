"use client";

import { useEffect, useMemo, useState } from "react";
import { AllocationSliders, type AllocationWeights } from "../../components/AllocationSliders";
import {
  createRebalanceB3Job,
  getJob,
  type JobStatusResponse,
  type RebalanceResult,
} from "@/lib/api";
import { SummaryCards } from "../../components/SummaryCards";
import { TradesTable } from "../../components/TradesTable";

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

  // valida o mínimo que o SummaryCards precisa
  const required = [
    "cash_before",
    "cash_after",
    "total_value_before",
    "total_value_after",
    "n_trades",
  ] as const;

  for (const k of required) {
    if (typeof s[k] !== "number") return null;
  }
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

function sumValues(rows: HoldingRow[]): number {
  // Preferir value; se não existir, tenta quantity * price; senão 0
  return rows.reduce((acc, r) => {
    if (typeof r.value === "number") return acc + r.value;
    if (typeof r.price === "number") return acc + r.quantity * r.price;
    return acc;
  }, 0);
}

function ActionBadge(props: { action: "BUY" | "SELL" | "—" }) {
  const a = props.action;

  if (a === "—") {
    return <span className="text-xs text-[var(--text-muted)]">—</span>;
  }

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

function HoldingsBeforeTable(props: { rows: UnifiedRow[]; title: string }) {
  const total = useMemo(() => props.rows.reduce((acc, r) => acc + (r.before.value ?? 0), 0), [props.rows]);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-semibold text-[var(--text-primary)]">{props.title}</h3>
        <div className="text-xs text-[var(--text-muted)]">
          Total: <span className="font-mono text-[var(--text-primary)]">{fmtMoney(total)}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
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
    </div>
  );
}

function HoldingsAfterTable(props: { rows: UnifiedRow[]; title: string }) {
  const total = useMemo(() => props.rows.reduce((acc, r) => acc + (r.after.value ?? 0), 0), [props.rows]);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-semibold text-[var(--text-primary)]">{props.title}</h3>
        <div className="text-xs text-[var(--text-muted)]">
          Total: <span className="font-mono text-[var(--text-primary)]">{fmtMoney(total)}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
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
    </div>
  );
}

export default function RebalancePage() {
  const [file, setFile] = useState<File | null>(null);
  const [cash, setCash] = useState<number>(100);
  const [mode, setMode] = useState<Mode>("BUY");
  const [noTesouro, setNoTesouro] = useState(false);

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
        noTesouro,
        weights,
      });

      setJobId(created.job_id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      setLoading(false);
    }
  }

  // polling do job
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

      // “alinhar” price/value se um lado não tiver
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

  // ✅ Corrigir summary usando os mesmos dados das tabelas
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

      {/* TOP AREA: 2 colunas */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* LEFT: Form */}
        <div className="lg:col-span-3 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              B3 XLSX (Posição)
            </label>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-[var(--text-muted)]
                         file:mr-4 file:rounded-lg file:border file:border-[var(--border)]
                         file:bg-[var(--surface-alt)] file:px-4 file:py-2 file:text-sm file:font-semibold
                         file:text-[var(--text-primary)] hover:file:bg-[var(--surface-alt)]"
            />
            {file && (
              <p className="text-xs text-[var(--text-muted)]">
                Selected: <span className="font-mono text-[var(--text-primary)]">{file.name}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[var(--text-primary)]">Cash</label>
              <input
                type="number"
                value={cash}
                onChange={(e) => setCash(Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-alt)]
                           px-3 py-2 text-sm text-[var(--text-primary)] outline-none
                           focus:ring-2 focus:ring-[var(--border)]"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[var(--text-primary)]">Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-alt)]
                           px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
              >
                <option value="TRADE">TRADE</option>
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[var(--text-primary)]">Tesouro</label>
              <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={noTesouro}
                  onChange={(e) => setNoTesouro(e.target.checked)}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                No Tesouro (exclude)
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap pt-1">
            <button
              onClick={onRun}
              disabled={!file || loading || !canSubmit}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold
                         text-[var(--on-primary)] hover:bg-[var(--primary-hover)] transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Running..." : "Run"}
            </button>

            {!canSubmit && (
              <div className="text-xs text-[var(--text-muted)]">
                Soma atual: <span className="font-mono text-[var(--text-primary)]">{weightsSum}%</span>{" "}
                — ajuste até <span className="font-mono text-[var(--text-primary)]">100%</span>.
              </div>
            )}

            {err && (
              <div className="text-xs text-red-600">
                Error: <span className="font-mono">{err}</span>
              </div>
            )}

            {jobId && (
              <div className="text-xs text-[var(--text-muted)]">
                Job: <span className="font-mono text-[var(--text-primary)]">{jobId}</span>{" "}
                {job?.status && (
                  <>
                    • Status:{" "}
                    <span className="font-mono text-[var(--text-primary)]">{job.status}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Sliders (mais clean) */}
        <div className="lg:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
          <div className="mb-3">
            <div className="text-sm font-semibold text-[var(--text-primary)]">Alocação alvo</div>
            <div className="text-xs text-[var(--text-muted)]">A soma precisa dar 100%.</div>
          </div>

          <AllocationSliders value={weights} onChange={setWeights} />
        </div>
      </section>

      {/* RESULTS */}
      {job?.status === "error" && job.error && (
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
          <h2 className="font-semibold text-[var(--text-primary)] mb-2">Job Error</h2>
          <pre className="text-sm whitespace-pre-wrap text-[var(--text-muted)]">
            {JSON.stringify(job.error, null, 2)}
          </pre>
        </section>
      )}

      {job?.status === "done" && summaryFixed && (
        <section className="space-y-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
            <h2 className="font-semibold text-[var(--text-primary)]">Summary</h2>
            <SummaryCards summary={summaryFixed} />
          </div>

          {/* Antes / Depois (mesma ordem + action no Depois) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <HoldingsBeforeTable title="Antes do rebalance" rows={unifiedRows} />
            <HoldingsAfterTable title="Depois do rebalance" rows={unifiedRows} />
          </div>

          {!hasHoldings && (
            <div className="text-xs text-[var(--text-muted)]">
              ⚠️ As tabelas “Antes/Depois” dependem do backend retornar{" "}
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
