/* page.tsx */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  importB3,
  type ImportResponse,
  searchSymbols,
  getRemotePrices,
  getRemoteAssets,
  type RemoteAsset,
  type ApiAssetClass,
} from "@/lib/api";
import { useI18n } from "@/i18n/I18nProvider";

type AssetClass = "stocks" | "fiis" | "bonds" | "other";
type Position = ImportResponse["positions"][number];

type Holding = Position & {
  value: number;
  cls: AssetClass;
  note: number; // 0..10
};

type PickedAsset = {
  ticker: string;
  name?: string;
  asset_class: AssetClass;
  currency: "BRL";
  price?: number;
};

/* ------------------------- DB endpoints (portfolios) ------------------------ */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type DbPortfolio = { id: number; name: string };
type DbPositionRow = {
  ticker: string;
  quantity: number;
  price: number | null;
  cls: string | null;
  note: number | null;
  source?: string | null;
};

async function dbListPortfolios(): Promise<DbPortfolio[]> {
  const r = await fetch(`${API_BASE}/api/db/portfolios`, { cache: "no-store" });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`list portfolios failed: ${r.status} ${txt}`);
  }
  const j = (await r.json()) as { items: DbPortfolio[] };
  return j.items ?? [];
}

async function dbGetPositions(portfolioId: number): Promise<DbPositionRow[]> {
  const r = await fetch(`${API_BASE}/api/db/portfolios/${portfolioId}/positions`, { cache: "no-store" });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`get positions failed: ${r.status} ${txt}`);
  }
  const j = (await r.json()) as { items: DbPositionRow[] };
  return j.items ?? [];
}

async function dbRenamePortfolio(portfolioId: number, name: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/db/portfolios/${portfolioId}`, {
    method: "PUT",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`rename portfolio failed: ${r.status} ${txt}`);
  }
}

async function dbCreatePortfolio(name: string): Promise<{ id: number; name: string }> {
  const r = await fetch(`${API_BASE}/api/db/portfolios`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`create portfolio failed: ${r.status} ${txt}`);
  }
  return (await r.json()) as { id: number; name: string };
}

async function dbReplacePositions(
  portfolioId: number,
  positions: Array<{
    ticker: string;
    quantity: number;
    price: number;
    cls: ApiAssetClass;
    note: number;
    source: "manual" | "import";
  }>,
): Promise<void> {
  const r = await fetch(`${API_BASE}/api/db/portfolios/${portfolioId}/positions/replace`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ positions }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`replace positions failed: ${r.status} ${txt}`);
  }
}

async function dbDeletePortfolio(portfolioId: number): Promise<void> {
  const r = await fetch(`${API_BASE}/api/db/portfolios/${portfolioId}`, {
    method: "DELETE",
    headers: { accept: "application/json" },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`delete portfolio failed: ${r.status} ${txt}`);
  }
}

/* -------------------------------- helpers --------------------------------- */

function mapAssetClassToAssetType(assetClass: AssetClass): Position["asset_type"] {
  if (assetClass === "fiis") return "FII";
  if (assetClass === "stocks") return "STOCK";
  if (assetClass === "bonds") return "BOND";
  return "OTHER";
}

function mapAssetTypeToClass(assetType?: string): AssetClass {
  const at = (assetType ?? "").trim().toLowerCase();
  if (!at) return "other";
  if (at.includes("fii") || at.includes("fundo imobili")) return "fiis";
  if (at.includes("bond") || at.includes("tesouro") || at.includes("renda fixa") || at === "rf" || at.includes("fixed"))
    return "bonds";
  if (at.includes("stock") || at.includes("acao") || at.includes("ação") || at.includes("equity")) return "stocks";
  return "other";
}

function mapDbClsToAssetType(cls?: string | null, ticker?: string | null): Position["asset_type"] {
  const c = (cls ?? "").trim().toLowerCase();
  const t = (ticker ?? "").trim().toUpperCase();

  if (c === "fiis" || c === "fii") return "FII";
  if (c === "bonds" || c === "bond" || c === "tesouro" || c === "rf") return "BOND";
  if (c === "stocks" || c === "stock" || c === "acoes" || c === "ação") return "STOCK";

  if (t.endsWith("11")) return "FII";
  if (t.startsWith("BRSTN")) return "BOND";
  return "STOCK";
}

function clampNote(v: number) {
  if (!Number.isFinite(v)) return 10;
  if (v < 0) return 0;
  if (v > 10) return 10;
  return Math.round(v);
}

function toApiAssetClass(cls: AssetClass): ApiAssetClass {
  return cls;
}

function toAssetClass(v: unknown): AssetClass {
  return v === "stocks" || v === "fiis" || v === "bonds" || v === "other" ? v : "other";
}

function Badge(props: { cls: AssetClass; label: string }) {
  const map: Record<AssetClass, { classes: string }> = {
    stocks: { classes: "bg-[color:var(--sell)]/15 text-[color:var(--sell)] border-[color:var(--sell)]/30" },
    fiis: { classes: "bg-[color:var(--buy)]/15 text-[color:var(--buy)] border-[color:var(--buy)]/30" },
    bonds: { classes: "bg-[var(--surface-alt)] text-[var(--text-muted)] border-[var(--border)]" },
    other: { classes: "bg-[var(--surface-alt)] text-[var(--text-muted)] border-[var(--border)]" },
  };
  const s = map[props.cls];
  return (
    <span className={["inline-flex items-center px-2 py-0.5 rounded-full text-xs border", s.classes].join(" ")}>
      {props.label}
    </span>
  );
}

function StatCard(props: { title: string; value: string; hint?: string; className?: string }) {
  return (
    <div className={["bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4", props.className ?? ""].join(" ")}>
      <div className="text-xs text-[var(--text-muted)]">{props.title}</div>
      <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{props.value}</div>
      {props.hint ? <div className="mt-1 text-xs text-[var(--text-muted)]">{props.hint}</div> : null}
    </div>
  );
}

function ConfirmModal(props: {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={props.onClose} aria-hidden="true" />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
          <div className="p-5">
            <div className="text-lg font-semibold text-[var(--text-primary)]">{props.title}</div>
            {props.description ? <div className="mt-2 text-sm text-[var(--text-muted)]">{props.description}</div> : null}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={props.onClose}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-2 text-sm font-semibold
                           text-[var(--text-primary)] hover:bg-[var(--surface)]"
              >
                {props.cancelText ?? "Cancel"}
              </button>
              <button
                onClick={() => {
                  props.onConfirm();
                  props.onClose();
                }}
                className="rounded-xl bg-[var(--primary)] text-[var(--on-primary)] px-4 py-2 text-sm font-semibold
                           hover:bg-[var(--primary-hover)]"
              >
                {props.confirmText ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function clampNote(v: number) {
  if (!Number.isFinite(v)) return 10;
  if (v < 0) return 0;
  if (v > 10) return 10;
  return Math.round(v);
}

function toApiAssetClass(cls: AssetClass): ApiAssetClass {
  return cls;
}

function toAssetClass(v: unknown): AssetClass {
  return v === "stocks" || v === "fiis" || v === "bonds" || v === "other" ? v : "other";
}

/* --------------------------------- page ----------------------------------- */

export default function PortfolioPage() {
  const { lang, t } = useI18n();

  const fmtMoney = useCallback(
    (n: number) => new Intl.NumberFormat(lang, { style: "currency", currency: "BRL" }).format(n),
    [lang],
  );
  const fmtQty = useCallback((n: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 8 }).format(n), [lang]);
  const fmtPct = useCallback(
    (n: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(n) + "%",
    [lang],
  );

  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<ImportResponse | null>(null);
  const [portfolioName, setPortfolioName] = useState<string>("");

  // DB portfolios
  const [dbPortfolios, setDbPortfolios] = useState<DbPortfolio[]>([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | "">("");

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // manual
  const [manualPositions, setManualPositions] = useState<Position[]>([]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<PickedAsset | null>(null);
  const [qty, setQty] = useState<string>("");
  const [manualPrice, setManualPrice] = useState<string>("");

  const [showSug, setShowSug] = useState(false);
  const blurTimer = useRef<number | null>(null);

  // sugestões remotas
  const [remoteSug, setRemoteSug] = useState<string[]>([]);
  const [sugLoading, setSugLoading] = useState(false);

  // loading do preço (somente overlay no input do ticker)
  const [priceLoading, setPriceLoading] = useState(false);

  const [assetIndex, setAssetIndex] = useState<RemoteAsset[] | null>(null);
  const [assetIndexLoading, setAssetIndexLoading] = useState(false);

  // notas + removidos
  const [notesByTicker, setNotesByTicker] = useState<Record<string, number>>({});
  const [removedTickers, setRemovedTickers] = useState<string[]>([]);

  // salvar no banco (status)
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const assetByTicker = useMemo(() => {
    const m = new Map<string, RemoteAsset>();
    for (const it of assetIndex ?? []) m.set(it.ticker.toUpperCase(), it);
    return m;
  }, [assetIndex]);

  const removedSet = useMemo(() => new Set(removedTickers.map((tk) => tk.toUpperCase())), [removedTickers]);

  function removeTicker(ticker: string) {
    const tk = ticker.trim().toUpperCase();
    setRemovedTickers((prev) => (prev.includes(tk) ? prev : [...prev, tk]));
  }
  function restoreTicker(ticker: string) {
    const tk = ticker.trim().toUpperCase();
    setRemovedTickers((prev) => prev.filter((x) => x !== tk));
  }

  const refreshDbPortfolios = useCallback(async () => {
    try {
      setDbLoading(true);
      const items = await dbListPortfolios();
      setDbPortfolios(items);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setDbLoading(false);
    }
  }, []);

  // (1) carrega ao abrir a página
  useEffect(() => {
    void refreshDbPortfolios();
  }, [refreshDbPortfolios]);

  // (2) recarrega ao voltar pra aba do browser / voltar foco na janela
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshDbPortfolios();
    };
    const onFocus = () => {
      void refreshDbPortfolios();
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshDbPortfolios]);

  // assets index (1 call)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setAssetIndexLoading(true);
        const res = await getRemoteAssets();
        if (!alive) return;
        setAssetIndex(res.items);
      } catch (e) {
        console.error("Failed to load assets index:", e);
        if (!alive) return;
        setAssetIndex(null);
      } finally {
        if (alive) setAssetIndexLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // uniqueness check (case-insensitive)
  const nameTakenByOther = useMemo(() => {
    const name = portfolioName.trim().toLowerCase();
    if (!name) return false;

    const found = dbPortfolios.find((p: DbPortfolio) => p.name.trim().toLowerCase() === name);
    if (!found) return false;

    if (selectedPortfolioId === "") return true; // creating a new one -> taken
    return found.id !== selectedPortfolioId; // editing -> taken if it's not the same id
  }, [portfolioName, dbPortfolios, selectedPortfolioId]);

  // Load a portfolio from DB when selected
  async function loadFromDb(portfolioId: number) {
    setError(null);
    setSaveMsg(null);

    try {
      setLoading(true);

      const p = dbPortfolios.find((x) => x.id === portfolioId);
      setPortfolioName(p?.name ?? `Carteira #${portfolioId}`);

      const rows = await dbGetPositions(portfolioId);

      const positions: Position[] = rows.map((r) => ({
        ticker: String(r.ticker ?? "").toUpperCase(),
        quantity: Number(r.quantity ?? 0),
        price: r.price == null ? 0 : Number(r.price),
        asset_type: mapDbClsToAssetType(r.cls, r.ticker),
      }));

      setData({
        positions,
        prices: {},
        targets: {},
        warnings: [],
        meta: {
          filename: "Imported from DB",
          n_positions: positions.length,
          n_prices: 0,
          n_targets: 0,
        },
      } as ImportResponse);

      setManualPositions([]);
      setPicked(null);
      setQ("");
      setQty("");
      setManualPrice("");
      setShowSug(false);

      setNotesByTicker(() => {
        const next: Record<string, number> = {};
        for (const r of rows) {
          const tk = String(r.ticker ?? "").toUpperCase();
          const note = r.note == null ? 10 : clampNote(Number(r.note));
          next[tk] = note;
        }
        return next;
      });

      setRemovedTickers([]);

      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function newPortfolioLocal() {
    setSelectedPortfolioId("");
    setPortfolioName(t("portfolio.db.unsavedNew")); // texto visível? -> vamos usar placeholder default abaixo

    // melhor: default do campo (não a label)
    setPortfolioName(lang === "pt-BR" ? "Minha carteira" : "My portfolio");

    setData(null);
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    setManualPositions([]);
    setPicked(null);
    setQ("");
    setQty("");
    setManualPrice("");
    setShowSug(false);

    setNotesByTicker({});
    setRemovedTickers([]);

    setSaveMsg(null);
    setError(null);
  }

  function clearEverythingLocalOnly() {
    setData(null);
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setError(null);

    setManualPositions([]);
    setPicked(null);
    setQ("");
    setQty("");
    setManualPrice("");
    setShowSug(false);

    setNotesByTicker({});
    setRemovedTickers([]);

    setSaveMsg(null);
  }

  // buscar sugestões conforme digita (debounce)
  useEffect(() => {
    const query = q.trim().toUpperCase();
    if (picked && q.includes("—")) return;

    const timer = window.setTimeout(async () => {
      try {
        setSugLoading(true);

        if (assetIndex && assetIndex.length > 0) {
          if (!query) {
            setRemoteSug(assetIndex.slice(0, 8).map((x) => x.ticker));
            return;
          }

          const starts: string[] = [];
          const contains: string[] = [];

          for (const it of assetIndex) {
            const tk = it.ticker;
            if (tk.startsWith(query)) starts.push(tk);
            else if (tk.includes(query)) contains.push(tk);

            if (starts.length + contains.length >= 8) break;
          }

          setRemoteSug([...starts, ...contains].slice(0, 8));
          return;
        }

        const items = await searchSymbols(query, 8);
        setRemoteSug(items);
      } catch {
        setRemoteSug([]);
      } finally {
        setSugLoading(false);
      }
    }, 80);

    return () => window.clearTimeout(timer);
  }, [q, picked, assetIndex]);

  // positions = base(import/db) + manual, removendo tickers deletados
  const allPositions: Position[] = useMemo(() => {
    const merged = [...(data?.positions ?? []), ...manualPositions];
    return merged.filter((p: Position) => !removedSet.has((p.ticker ?? "").toUpperCase()));
  }, [data?.positions, manualPositions, removedSet]);

  const holdings: Holding[] = useMemo(() => {
    return allPositions
      .map((p: Position) => {
        const value = (p.quantity ?? 0) * (p.price ?? 0);
        const cls = mapAssetTypeToClass(p.asset_type);

        const tk = (p.ticker ?? "").toUpperCase();
        const note = clampNote(notesByTicker[tk] ?? 10);

        return { ...p, value, cls, note };
      })
      .sort((a: Holding, b: Holding) => b.value - a.value);
  }, [allPositions, notesByTicker]);

  const totals = useMemo(() => {
    const byValue: Record<AssetClass, number> = { stocks: 0, fiis: 0, bonds: 0, other: 0 };
    const count: Record<AssetClass, number> = { stocks: 0, fiis: 0, bonds: 0, other: 0 };

    let totalValue = 0;

    for (const h of holdings) {
      byValue[h.cls] += h.value;
      totalValue += h.value;
      count[h.cls] += 1;
    }

    const pctValue: Record<AssetClass, number> = {
      stocks: totalValue ? (byValue.stocks / totalValue) * 100 : 0,
      fiis: totalValue ? (byValue.fiis / totalValue) * 100 : 0,
      bonds: totalValue ? (byValue.bonds / totalValue) * 100 : 0,
      other: totalValue ? (byValue.other / totalValue) * 100 : 0,
    };

    return { byValue, totalValue, pctValue, count };
  }, [holdings]);

  const [tab, setTab] = useState<"all" | AssetClass>("all");

  const availableTabs = useMemo(() => {
    const has: Record<AssetClass, boolean> = { stocks: false, fiis: false, bonds: false, other: false };
    for (const h of holdings) has[h.cls] = true;
    const tabs: Array<"all" | AssetClass> = ["all"];
    (["stocks", "fiis", "bonds", "other"] as const).forEach((k) => {
      if (has[k]) tabs.push(k);
    });
    return tabs;
  }, [holdings]);

  useEffect(() => {
    if (!availableTabs.includes(tab)) setTab("all");
  }, [availableTabs, tab]);

  const filtered = useMemo(() => {
    if (tab === "all") return holdings;
    return holdings.filter((h) => h.cls === tab);
  }, [holdings, tab]);

  async function onImport() {
    setError(null);
    setSaveMsg(null);

    if (!file) {
      setError(lang === "pt-BR" ? "Selecione um arquivo B3 (XLSX) para importar." : "Select a B3 XLSX file to import.");
      return;
    }

    try {
      setLoading(true);
      const res = await importB3({ file, noTesouro: false });
      setData(res);

      setRemovedTickers([]);

      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : (lang === "pt-BR" ? "Falha ao importar arquivo." : "Failed to import file.");
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function addManual() {
    setError(null);
    setSaveMsg(null);

    if (!picked) {
      setError(lang === "pt-BR" ? "Selecione um ativo válido na lista." : "Pick a valid asset from the list.");
      return;
    }

    const qn = Number(String(qty).replace(",", "."));
    if (!Number.isFinite(qn) || qn <= 0) {
      setError(lang === "pt-BR" ? "Quantidade inválida." : "Invalid quantity.");
      return;
    }

    const priceFromInput = manualPrice.trim() ? Number(manualPrice.replace(",", ".")) : undefined;
    const prices = data?.prices as Record<string, number> | undefined;
    const priceCandidate = priceFromInput ?? picked.price ?? prices?.[picked.ticker] ?? 0;

    if (!Number.isFinite(priceCandidate) || priceCandidate <= 0) {
      setError(lang === "pt-BR" ? "Preço inválido. Digite um preço ou garanta que exista no BD." : "Invalid price. Enter a price or ensure it exists in the DB.");
      return;
    }

    const pos: Position = {
      ticker: picked.ticker,
      asset_type: mapAssetClassToAssetType(picked.asset_class),
      quantity: qn,
      price: priceCandidate,
    };

    restoreTicker(pos.ticker);

    setManualPositions((prev) => {
      const i = prev.findIndex((p) => p.ticker === pos.ticker);
      if (i === -1) return [...prev, pos];

      const copy = [...prev];
      copy[i] = {
        ...copy[i],
        quantity: (copy[i].quantity ?? 0) + pos.quantity,
        price: pos.price,
        asset_type: pos.asset_type,
      };
      return copy;
    });

    setPicked(null);
    setQ("");
    setQty("");
    setManualPrice("");
    setShowSug(false);
    setRemoteSug([]);
  }

  async function onPickTicker(tickerRaw: string) {
    const ticker = tickerRaw.trim().toUpperCase();
    const meta = assetByTicker.get(ticker);

    setShowSug(false);
    setRemoteSug([]);
    setQ(ticker);

    setManualPrice("");

    setPicked({
      ticker,
      name: ticker,
      asset_class: toAssetClass(meta?.cls),
      currency: "BRL",
      price: meta?.price ?? undefined,
    });

    if (meta?.price != null && Number.isFinite(meta.price)) setManualPrice(String(meta.price));

    try {
      setPriceLoading(true);
      const prices = (await getRemotePrices([ticker])) as Record<string, number>;
      const px = prices[ticker];
      if (px != null && Number.isFinite(px)) {
        setManualPrice(String(px));
        setPicked((prev) => (prev ? { ...prev, price: px } : prev));
      }
    } catch (e) {
      console.error("Failed to fetch price:", e);
    } finally {
      setPriceLoading(false);
    }
  }

  function handleBlur() {
    blurTimer.current = window.setTimeout(() => setShowSug(false), 120);
  }
  function handleFocus() {
    if (blurTimer.current) window.clearTimeout(blurTimer.current);
    setShowSug(true);
  }

  async function onSaveToDb() {
    setError(null);
    setSaveMsg(null);

    const name = portfolioName.trim();
    if (!name) {
      setError(lang === "pt-BR" ? "Digite um nome para a carteira." : "Enter a portfolio name.");
      return;
    }
    if (nameTakenByOther) {
      setError(lang === "pt-BR" ? "Já existe uma carteira com esse nome. Escolha outro nome." : "A portfolio with this name already exists. Choose another name.");
      return;
    }
    if (holdings.length === 0) {
      setError(lang === "pt-BR" ? "Nada para salvar: a carteira está vazia." : "Nothing to save: the portfolio is empty.");
      return;
    }

    const manualSet = new Set(manualPositions.map((p) => (p.ticker ?? "").toUpperCase()));

    const positionsPayload = holdings.map((h) => ({
      ticker: (h.ticker ?? "").toUpperCase(),
      quantity: Number(h.quantity),
      price: Number(h.price),
      cls: toApiAssetClass(h.cls),
      note: clampNote(notesByTicker[(h.ticker ?? "").toUpperCase()] ?? 10),
      source: manualSet.has((h.ticker ?? "").toUpperCase()) ? ("manual" as const) : ("import" as const),
    }));

    try {
      setSaveLoading(true);

      if (selectedPortfolioId !== "") {
        await dbRenamePortfolio(selectedPortfolioId, name);
        await dbReplacePositions(selectedPortfolioId, positionsPayload);
        await refreshDbPortfolios();
        setSaveMsg(`Atualizado! portfolio_id=${selectedPortfolioId}`);
      } else {
        const created = await dbCreatePortfolio(name);
        await dbReplacePositions(created.id, positionsPayload);
        setSelectedPortfolioId(created.id);
        await refreshDbPortfolios();
        setSaveMsg(`Created! portfolio_id=${created.id}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (lang === "pt-BR" ? "Falha ao salvar no banco." : "Failed to save to DB.");
      setError(msg);
    } finally {
      setSaveLoading(false);
    }
  }

  async function onDeleteSelectedPortfolio() {
    setError(null);
    setSaveMsg(null);

    if (selectedPortfolioId === "") {
      setError(lang === "pt-BR" ? "Selecione uma carteira do banco para excluir." : "Select a portfolio from the DB to delete.");
      return;
    }

    try {
      setSaveLoading(true);
      await dbDeletePortfolio(selectedPortfolioId);
      await refreshDbPortfolios();
      newPortfolio();
      setSaveMsg("Carteira excluída.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setSaveLoading(false);
    }
  }

  const labelStocks = t("portfolio.allocation.stocks");
  const labelFiis = t("portfolio.allocation.fiis");
  const labelBonds = t("portfolio.allocation.bonds");
  const labelOther = t("portfolio.allocation.other");

  const tabLabel = (k: "all" | AssetClass) => {
    if (k === "all") return t("portfolio.holdings.tabs.all");
    if (k === "stocks") return t("portfolio.holdings.tabs.stocks");
    if (k === "fiis") return t("portfolio.holdings.tabs.fiis");
    if (k === "bonds") return t("portfolio.holdings.tabs.bonds");
    return t("portfolio.holdings.tabs.other");
  };

  const badgeLabel = (cls: AssetClass) => {
    if (cls === "stocks") return labelStocks;
    if (cls === "fiis") return labelFiis;
    if (cls === "bonds") return labelBonds;
    return labelOther;
  };

  return (
    <main className="space-y-6">
      <ConfirmModal
        open={confirmClearOpen}
        title={t("portfolio.confirm.clearTitle")}
        description={t("portfolio.confirm.clearDesc")}
        confirmText={t("common.clear")}
        cancelText={t("common.cancel")}
        onConfirm={clearEverythingLocalOnly}
        onClose={() => setConfirmClearOpen(false)}
      />

      <ConfirmModal
        open={confirmDeleteOpen}
        title={t("portfolio.confirm.deleteTitle")}
        description={t("portfolio.confirm.deleteDesc")}
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        onConfirm={onDeleteSelectedPortfolio}
        onClose={() => setConfirmDeleteOpen(false)}
      />

      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{t("portfolio.title")}</h1>
        <div className="text-sm text-[var(--text-muted)]">{t("portfolio.subtitle")}</div>
      </div>

      {/* TOP ROW: selector + stats (alinhado na mesma grid 5 colunas) */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-stretch">
        {/* Selector (mesma largura da coluna esquerda do bloco abaixo) */}
        <div className="lg:col-span-3">
          <div className="h-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
            <div className="flex flex-col gap-3 h-full">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">Carteiras (banco)</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    A lista atualiza ao abrir/voltar pra aba e ao salvar/criar/excluir.
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={newPortfolio}
                    className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] px-4 text-sm font-semibold
                              text-[var(--text-primary)] hover:bg-[var(--surface)]"
                  >
                    Nova
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmDeleteOpen(true)}
                    disabled={saveLoading || selectedPortfolioId === ""}
                    className="h-10 rounded-xl border border-[color:var(--sell)]/40 bg-[var(--surface)] px-4 text-sm font-semibold
                              text-[color:var(--sell)] hover:bg-[color:var(--sell)]/10
                              disabled:opacity-60 disabled:cursor-not-allowed"
                    title={selectedPortfolioId === "" ? "Selecione uma carteira do banco" : "Excluir carteira"}
                  >
                    Excluir
                  </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col justify-end">
                <select
                  value={selectedPortfolioId}
                  onChange={async (e) => {
                    const v = e.target.value ? Number(e.target.value) : "";
                    setSelectedPortfolioId(v);
                    if (v !== "") await loadFromDb(v);
                  }}
                  disabled={dbLoading}
                  className="w-full h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-alt)]
                            px-3 text-sm text-[var(--text-primary)] outline-none
                            disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="">(Nova carteira — ainda não salva)</option>
                  {/* SEM ID: mostra só o nome */}
                  {dbPortfolios.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                {dbLoading ? <div className="mt-2 text-xs text-[var(--text-muted)]">Atualizando lista…</div> : null}
              </div>
            </div>
          </div>
        </div>

        {/* Stats (mesma coluna direita do bloco abaixo) e mesma altura do selector */}
        <div className="lg:col-span-2">
          <div className="h-full grid grid-cols-2 gap-4">
            <StatCard
              className="h-full flex flex-col justify-between"
              title="Total investido"
              value={fmtMoney(totals.totalValue)}
              hint="Somente posições (sem caixa)"
            />
            <StatCard
              className="h-full flex flex-col justify-between"
              title="Ativos"
              value={String(holdings.length)}
              hint="Linhas na carteira"
            />
          </div>
        </div>
      </section>

      {/* MAIN ROW: editor + summary */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-9">
              <label className="block text-sm font-medium text-[var(--text-primary)]">{t("portfolio.form.nameLabel")}</label>

              <div className="mt-2 flex items-center gap-3">
                <input
                  value={portfolioName}
                  onChange={(e) => setPortfolioName(e.target.value)}
                  placeholder={lang === "pt-BR" ? "Minha carteira" : "My portfolio"}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 text-sm
                            text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                />

                <button
                  onClick={() => setConfirmClearOpen(true)}
                  className="shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-2 text-sm font-semibold
                            text-[var(--text-primary)] hover:bg-[var(--surface)]"
                >
                  {t("portfolio.form.clearBtn")}
                </button>
              </div>

              {nameTakenByOther ? (
                <div className="mt-2 text-xs text-[color:var(--sell)]">
                  {lang === "pt-BR"
                    ? "Já existe uma carteira com esse nome (o nome é o identificador). Troque para salvar."
                    : "A portfolio with this name already exists (name is the identifier). Change it to save."}
                </div>
              ) : (
                <div className="mt-2 text-xs text-[var(--text-muted)]">O nome é único e identifica a carteira no banco.</div>
              )}
            </div>

            <div className="hidden md:block md:col-span-3" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Import card */}
            <div className="bg-[var(--surface-alt)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
              <div className="text-sm font-semibold text-[var(--text-primary)]">{t("portfolio.importCard.title")}</div>

              <div className="space-y-2">
                <label className="block text-xs text-[var(--text-muted)]">{t("portfolio.importCard.fileLabel")}</label>

                <div className="flex items-center gap-2 flex-wrap">
                  <label
                    className="max-w-full inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]
                              px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-alt)] cursor-pointer"
                  >
                    <span className="font-medium shrink-0">{t("common.select")}</span>

                    <span className="min-w-0 flex-1 text-[var(--text-muted)] truncate">
                      {file ? file.name : data?.meta?.filename ?? t("portfolio.importCard.noneFile")}
                    </span>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </label>

                  <button
                    onClick={onImport}
                    disabled={loading}
                    className="rounded-xl bg-[var(--primary)] text-[var(--on-primary)] px-4 py-2 text-sm font-semibold
                               hover:bg-[var(--primary-hover)] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? t("portfolio.importCard.importing") : t("portfolio.importCard.importBtn")}
                  </button>
                </div>

                <div className="text-xs text-[var(--text-muted)]">{t("portfolio.importCard.hint")}</div>
              </div>
            </div>

            {/* Manual card */}
            <div className="bg-[var(--surface-alt)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
              <div className="text-sm font-semibold text-[var(--text-primary)]">{t("portfolio.manualCard.title")}</div>

              <div className="grid grid-cols-1 gap-3">
                <div className="relative">
                  <label className="block text-xs text-[var(--text-muted)] mb-1">{t("portfolio.manualCard.asset")}</label>

                  <div className="relative group">
                    <input
                      value={q}
                      onChange={(e) => {
                        setQ(e.target.value);
                        setPicked(null);
                        setShowSug(true);
                      }}
                      onFocus={handleFocus}
                      onBlur={handleBlur}
                      placeholder={lang === "pt-BR" ? "Digite ticker (ex.: HGLG11, VALE3...)" : "Type ticker (e.g., HGLG11, VALE3...)"}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 pr-10 text-sm
                                 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                    />

                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                      {sugLoading || priceLoading || assetIndexLoading ? (
                        <span
                          title={
                            assetIndexLoading
                              ? lang === "pt-BR"
                                ? "Carregando ativos..."
                                : "Loading assets..."
                              : priceLoading
                                ? lang === "pt-BR"
                                  ? "Buscando preço..."
                                  : "Fetching price..."
                                : lang === "pt-BR"
                                  ? "Buscando sugestões..."
                                  : "Searching..."
                          }
                          className="h-2 w-2 rounded-full bg-[var(--text-muted)]/60 group-hover:bg-[var(--text-primary)]/60"
                        />
                      ) : null}
                    </div>
                  </div>

                  {showSug && !sugLoading && remoteSug.length > 0 ? (
                    <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg">
                      {remoteSug.map((ticker: string) => (
                        <button
                          key={ticker}
                          type="button"
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => onPickTicker(ticker)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-alt)]"
                        >
                          <div className="font-semibold text-[var(--text-primary)]">{ticker}</div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">{t("portfolio.manualCard.quantity")}</label>
                    <input
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      placeholder={lang === "pt-BR" ? "ex.: 10" : "e.g. 10"}
                      inputMode="decimal"
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm
                                 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">{t("portfolio.manualCard.priceOpt")}</label>
                    <input
                      value={manualPrice}
                      onChange={(e) => setManualPrice(e.target.value)}
                      placeholder={lang === "pt-BR" ? "usa BD/Prices se vazio" : "uses DB/Prices if empty"}
                      inputMode="decimal"
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm
                                 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={addManual}
                    className="rounded-xl bg-[var(--primary)] text-[var(--on-primary)] px-4 py-2 text-sm font-semibold
                               hover:bg-[var(--primary-hover)]"
                  >
                    {t("common.add")}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {error ? <div className="text-sm text-[color:var(--sell)]">{error}</div> : null}
          {saveMsg ? <div className="text-sm text-[var(--text-muted)]">{saveMsg}</div> : null}
        </div>

        {/* Right summary */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-[var(--text-primary)]">{t("portfolio.allocation.title")}</div>
              <div className="text-xs text-[var(--text-muted)]">
                {holdings.length ? t("portfolio.holdings.items", { count: holdings.length }) : (lang === "pt-BR" ? "sem ativos" : "no assets")}
              </div>
            </div>

            {holdings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-alt)] p-4 text-sm text-[var(--text-muted)]">
                {t("portfolio.allocation.emptyHint")}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="relative rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3 transition">
                  <div className="absolute right-2 top-2 text-[10px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-muted)] bg-[var(--surface)]/60">
                    {totals.count.stocks}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">{labelStocks}</div>
                  <div className="mt-1 font-semibold text-[var(--text-primary)]">{fmtPct(totals.pctValue.stocks)}</div>
                </div>

                <div className="relative rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3 transition">
                  <div className="absolute right-2 top-2 text-[10px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-muted)] bg-[var(--surface)]/60">
                    {totals.count.fiis}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">{labelFiis}</div>
                  <div className="mt-1 font-semibold text-[var(--text-primary)]">{fmtPct(totals.pctValue.fiis)}</div>
                </div>

                <div className="relative rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3 transition">
                  <div className="absolute right-2 top-2 text-[10px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-muted)] bg-[var(--surface)]/60">
                    {totals.count.bonds}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">{labelBonds}</div>
                  <div className="mt-1 font-semibold text-[var(--text-primary)]">{fmtPct(totals.pctValue.bonds)}</div>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onSaveToDb}
            disabled={saveLoading || nameTakenByOther}
            className="w-full rounded-2xl bg-[var(--primary)] text-[var(--on-primary)] px-4 py-3 text-sm font-semibold
                       hover:bg-[var(--primary-hover)] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saveLoading ? t("portfolio.save.saving") : selectedPortfolioId === "" ? t("portfolio.save.create") : t("portfolio.save.update")}
          </button>
        </div>
      </section>

      {/* Holdings */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="text-lg font-semibold text-[var(--text-primary)]">{t("portfolio.holdings.title")}</div>
            <div className="text-sm text-[var(--text-muted)]">
              {(data?.meta?.filename ? t("portfolio.holdings.baseWith", { filename: data.meta.filename }) : t("portfolio.holdings.baseNone"))} •{" "}
              {t("portfolio.holdings.items", { count: holdings.length })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {availableTabs.map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={[
                  "px-3 py-1.5 rounded-xl text-sm font-semibold border transition-colors",
                  tab === k
                    ? "bg-[var(--surface-alt)] border-[var(--border)] text-[var(--text-primary)]"
                    : "bg-transparent border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border)]",
                ].join(" ")}
              >
                {tabLabel(k)}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <div className="max-h-[540px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--surface)]/95 backdrop-blur border-b border-[var(--border)]">
                <tr className="text-left">
                  <th className="p-3 font-semibold text-[var(--text-muted)]">{t("portfolio.holdings.table.asset")}</th>
                  <th className="p-3 font-semibold text-[var(--text-muted)] text-center">{t("portfolio.holdings.table.type")}</th>
                  <th className="p-3 font-semibold text-[var(--text-muted)] text-right">{t("portfolio.holdings.table.qty")}</th>
                  <th className="p-3 font-semibold text-[var(--text-muted)] text-right">{t("portfolio.holdings.table.price")}</th>
                  <th className="p-3 font-semibold text-[var(--text-muted)] text-right">{t("portfolio.holdings.table.value")}</th>
                  <th className="p-3 font-semibold text-[var(--text-muted)] text-center">{t("portfolio.holdings.table.note")}</th>
                  <th className="p-3 font-semibold text-[var(--text-muted)] text-center"></th>
                </tr>
              </thead>

              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-[var(--text-muted)]">
                      {data || manualPositions.length
                        ? "Nenhuma posição nesse filtro."
                        : "Sem dados ainda — importe, selecione do banco ou adicione manualmente."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((h, idx) => {
                    const tk = (h.ticker ?? "").toUpperCase();
                    const v = notesByTicker[tk] ?? 10;

                    return (
                      <tr key={`${h.ticker}-${idx}`} className="border-t border-[var(--border)] hover:bg-[var(--surface-alt)]/40">
                        <td className="p-3 font-semibold text-[var(--text-primary)]">{h.ticker}</td>

                        <td className="p-3 align-middle">
                          <div className="flex items-center justify-center">
                            <Badge cls={h.cls} label={badgeLabel(h.cls)} />
                          </div>
                        </td>

                        <td className="p-3 text-right text-[var(--text-primary)]">{fmtQty(h.quantity)}</td>
                        <td className="p-3 text-right text-[var(--text-primary)]">{fmtMoney(h.price)}</td>
                        <td className="p-3 text-right font-semibold text-[var(--text-primary)]">{fmtMoney(h.value)}</td>

                        <td className="p-3 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setNotesByTicker((prev) => ({ ...prev, [tk]: clampNote((prev[tk] ?? 10) - 1) }))}
                              className="h-8 w-8 rounded-lg border border-[var(--border)] bg-[var(--surface)]
                                         text-[var(--text-primary)] hover:bg-[var(--surface-alt)]"
                              aria-label={lang === "pt-BR" ? "Diminuir nota" : "Decrease note"}
                              title={lang === "pt-BR" ? "Diminuir" : "Decrease"}
                            >
                              −
                            </button>

                            <input
                              type="number"
                              min={0}
                              max={10}
                              step={1}
                              value={v}
                              onChange={(e) => setNotesByTicker((prev) => ({ ...prev, [tk]: clampNote(Number(e.target.value)) }))}
                              className="w-14 h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-center
                                         text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary)]/30
                                         [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />

                            <button
                              type="button"
                              onClick={() => setNotesByTicker((prev) => ({ ...prev, [tk]: clampNote((prev[tk] ?? 10) + 1) }))}
                              className="h-8 w-8 rounded-lg border border-[var(--border)] bg-[var(--surface)]
                                         text-[var(--text-primary)] hover:bg-[var(--surface-alt)]"
                              aria-label={lang === "pt-BR" ? "Aumentar nota" : "Increase note"}
                              title={lang === "pt-BR" ? "Aumentar" : "Increase"}
                            >
                              +
                            </button>
                          </div>
                        </td>

                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => removeTicker(h.ticker)}
                            title={lang === "pt-BR" ? "Remover" : "Remove"}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]
                                       text-[var(--text-muted)] hover:text-[color:var(--sell)] hover:border-[color:var(--sell)]/40 hover:bg-[var(--surface-alt)]"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
