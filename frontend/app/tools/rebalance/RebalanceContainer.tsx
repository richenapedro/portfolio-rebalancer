"use client";

import { useEffect, useMemo, useState } from "react";
import { AllocationSliders, type AllocationWeights } from "../../components/AllocationSliders";
import { SummaryCards } from "../../components/SummaryCards";
import { TradesTable } from "../../components/TradesTable";
import { useI18n } from "@/i18n/I18nProvider";
import { createRebalanceB3Job, getJob, type JobStatusResponse, importB3 } from "@/lib/api";

import { BarChart3, Database, FileUp, Loader2, Play, SlidersHorizontal, Upload, Wallet, X } from "lucide-react";

import HoldingsBeforeTable from "./components/HoldingsBeforeTable";
import HoldingsAfterTable from "./components/HoldingsAfterTable";
import { readHoldingRows, readSummary, readTrades, type HoldingRow, type UnifiedRow, type Mode, type ImportSource } from "./components/helpers";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export default function RebalanceContainer() {
  const { lang, t } = useI18n();

  const fmtMoney = useMemo(
    () => (n: number) => new Intl.NumberFormat(lang, { style: "currency", currency: "BRL" }).format(n),
    [lang],
  );
  const fmtQty = useMemo(() => (n: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 8 }).format(n), [lang]);
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

    setErr(null);
    setJob(null);
    setJobId(null);

    const data = await importB3({ file: f, noTesouro: false });
    const wc = data.weights_current;

    if (wc) {
      const s = Number(wc.stocks ?? 0);
      const fi = Number(wc.fiis ?? 0);
      const b = Number(wc.bonds ?? 0);
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

  const holdingsTotalBefore = useMemo(
    () => holdingsBefore.reduce((acc, r) => acc + (typeof r.value === "number" ? r.value : 0), 0),
    [holdingsBefore],
  );
  const holdingsTotalAfter = useMemo(
    () => holdingsAfter.reduce((acc, r) => acc + (typeof r.value === "number" ? r.value : 0), 0),
    [holdingsAfter],
  );

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

  const SourceIcon = importSource === "file" ? Upload : importSource === "db" ? Database : Upload;

  return (
    <main className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-[var(--text-muted)]" aria-hidden />
          {t("rebalance.title")}
        </h1>
        <div className="text-sm text-[var(--text-muted)]">{t("rebalance.subtitle")}</div>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          {/* Import */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
              <Upload className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
              {t("rebalance.import.label")}
            </label>

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

              <label
                className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl
                           border border-[var(--border)] bg-[var(--surface-alt)] px-4 text-sm font-semibold
                           text-[var(--text-primary)] hover:bg-[var(--surface-alt)]/70 transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
                title={t("rebalance.import.fileBtnTitle")}
              >
                <span className="inline-flex items-center gap-2">
                  <FileUp className="h-4 w-4" aria-hidden />
                  {t("rebalance.import.fileBtn")}
                </span>
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
                      const wc = data.weights_current;

                      if (wc) {
                        const s = Number(wc.stocks ?? 0);
                        const fi = Number(wc.fiis ?? 0);
                        const b = Number(wc.bonds ?? 0);
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

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">{t("rebalance.import.source")}:</span>

              {importSource === "file" ? (
                <span
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border)]
                             bg-[var(--surface-alt)] px-2.5 py-1 text-xs text-[var(--text-primary)] cursor-help"
                  title={t("rebalance.import.fileChipTitle")}
                >
                  <SourceIcon className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
                  {sourceLabel}
                </span>
              ) : importSource === "db" ? (
                <span
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border)]
                             bg-[var(--surface-alt)] px-2.5 py-1 text-xs text-[var(--text-primary)]"
                >
                  <SourceIcon className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
                  {sourceLabel} {selectedDbLabel ? `(${selectedDbLabel})` : ""}
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border)]
                             bg-[var(--surface-alt)] px-2.5 py-1 text-xs text-[var(--text-muted)]"
                >
                  <SourceIcon className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />—
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
                  className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-4 w-4" aria-hidden />
                  {t("common.remove")}
                </button>
              )}
            </div>

            <div className="text-xs text-[var(--text-muted)]">{t("rebalance.import.hint")}</div>
          </div>

          {/* Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
                <Wallet className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
                {t("rebalance.controls.cash")}
              </label>
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
              <label className="block text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
                {t("rebalance.controls.mode")}
              </label>
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
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
              {loading ? t("rebalance.run.running") : t("rebalance.run.run")}
            </button>

            {err && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                <span className="font-mono">{err}</span>
              </div>
            )}
          </div>
        </div>

        {/* Target */}
        <div className="lg:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
          <div className="mb-3">
            <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
              {t("rebalance.target.title")}
            </div>
          </div>
          <AllocationSliders value={weights} onChange={setWeights} />
        </div>
      </section>

      {/* Error block */}
      {job?.status === "error" && job.error && (
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
          <h2 className="font-semibold text-[var(--text-primary)] mb-2">{t("rebalance.errorBlock.title")}</h2>
          <pre className="text-xs whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3 text-[var(--text-muted)] overflow-x-auto">
            {JSON.stringify(job.error, null, 2)}
          </pre>
        </section>
      )}

      {/* Results */}
      {job?.status === "done" && summaryFromApi && (
        <section className="space-y-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
            <h2 className="font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
              {t("rebalance.summary.title")}
            </h2>

            <SummaryCards summary={summaryFromApi} holdingsTotalBefore={holdingsTotalBefore} holdingsTotalAfter={holdingsTotalAfter} />
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
