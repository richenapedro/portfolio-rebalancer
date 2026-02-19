"use client";

import {
  Plus,
  Trash2,
  Upload,
  Save,
  BarChart3,
  Wallet,
  Database,
  UploadCloud,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";

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

import ConfirmDialog from "./components/ConfirmDialog";
import PortfolioFilters, {
  type HoldingsTab,
  type AssetClass,
} from "./components/PortfolioFilters";
import PortfolioTable, {
  type HoldingRow,
} from "./components/PortfolioTable";

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

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

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
  const r = await fetch(`${API_BASE}/api/db/portfolios/${portfolioId}/positions`, {
    cache: "no-store",
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`get positions failed: ${r.status} ${txt}`);
  }
  const j = (await r.json()) as { items: DbPositionRow[] };
  return j.items ?? [];
}

async function dbRenamePortfolio(
  portfolioId: number,
  name: string,
): Promise<void> {
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

async function dbCreatePortfolio(
  name: string,
): Promise<{ id: number; name: string }> {
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
  const r = await fetch(
    `${API_BASE}/api/db/portfolios/${portfolioId}/positions/replace`,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ positions }),
    },
  );
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
  if (
    at.includes("bond") ||
    at.includes("tesouro") ||
    at.includes("renda fixa") ||
    at === "rf" ||
    at.includes("fixed")
  )
    return "bonds";
  if (at.includes("stock") || at.includes("acao") || at.includes("ação") || at.includes("equity"))
    return "stocks";
  return "other";
}

function mapDbClsToAssetType(
  cls?: string | null,
  ticker?: string | null,
): Position["asset_type"] {
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

function StatCard(props: {
  title: React.ReactNode;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={[
        "bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4",
        props.className ?? "",
      ].join(" ")}
    >
      <div className="text-xs text-[var(--text-muted)]">{props.title}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
        {props.value}
      </div>
      {props.hint ? (
        <div className="mt-1 text-xs text-[var(--text-muted)]">{props.hint}</div>
      ) : null}
    </div>
  );
}

/* --------------------------------- container ----------------------------------- */

export default function PortfolioContainer() {
  const { lang, t } = useI18n();

  const fmtMoney = useCallback(
    (n: number) =>
      new Intl.NumberFormat(lang, { style: "currency", currency: "BRL" }).format(n),
    [lang],
  );
  const fmtQty = useCallback(
    (n: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 8 }).format(n),
    [lang],
  );
  const fmtPct = useCallback(
    (n: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(n) + "%",
    [lang],
  );

  const [addTab, setAddTab] = useState<"import" | "manual">("import");

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

  // drag state (IMPORT)
  const [isDragOver, setIsDragOver] = useState(false);

  const assetByTicker = useMemo(() => {
    const m = new Map<string, RemoteAsset>();
    for (const it of assetIndex ?? []) m.set(it.ticker.toUpperCase(), it);
    return m;
  }, [assetIndex]);

  const removedSet = useMemo(
    () => new Set(removedTickers.map((tk) => tk.toUpperCase())),
    [removedTickers],
  );

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

  // (2) recarrega ao voltar foco
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

      const p = dbPortfolios.find((x: DbPortfolio) => x.id === portfolioId);
      setPortfolioName(p?.name ?? `Portfolio #${portfolioId}`);

      const rows = await dbGetPositions(portfolioId);

      const positions: Position[] = rows.map((r: DbPositionRow) => ({
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

  const [tab, setTab] = useState<HoldingsTab>("all");

  const availableTabs = useMemo(() => {
    const has: Record<AssetClass, boolean> = { stocks: false, fiis: false, bonds: false, other: false };
    for (const h of holdings) has[h.cls] = true;
    const tabs: HoldingsTab[] = ["all"];
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

  function setPickedFile(f: File | null) {
    setError(null);
    setSaveMsg(null);

    if (!f) {
      setFile(null);
      return;
    }

    const name = f.name.toLowerCase();
    const ok = name.endsWith(".xlsx");
    if (!ok) {
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setError(lang === "pt-BR" ? "Arquivo inválido. Use .xlsx" : "Invalid file. Use .xlsx");
      return;
    }

    setFile(f);
    // mantém o input sincronizado quando o arquivo veio via drop
    if (fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(f);
      fileInputRef.current.files = dt.files;
    }
  }

  function onDropXlsx(ev: DragEvent<HTMLLabelElement>) {
    ev.preventDefault();
    ev.stopPropagation();
    setIsDragOver(false);

    const f = ev.dataTransfer?.files?.[0] ?? null;
    setPickedFile(f);
  }

  function onDragOverXlsx(ev: DragEvent<HTMLLabelElement>) {
    // sem isso o drop NÃO dispara em muitos browsers
    ev.preventDefault();
    ev.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  }

  function onDragLeaveXlsx(ev: DragEvent<HTMLLabelElement>) {
    ev.preventDefault();
    ev.stopPropagation();
    setIsDragOver(false);
  }

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
      setIsDragOver(false);
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : lang === "pt-BR"
              ? "Falha ao importar arquivo."
              : "Failed to import file.";
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
      setError(
        lang === "pt-BR"
          ? "Preço inválido. Digite um preço ou garanta que exista no BD."
          : "Invalid price. Enter a price or ensure it exists in the DB.",
      );
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
      setError(
        lang === "pt-BR"
          ? "Já existe uma carteira com esse nome. Escolha outro nome."
          : "A portfolio with this name already exists. Choose another name.",
      );
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
      } else {
        const created = await dbCreatePortfolio(name);
        await dbReplacePositions(created.id, positionsPayload);
        setSelectedPortfolioId(created.id);
        await refreshDbPortfolios();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : lang === "pt-BR" ? "Falha ao salvar no banco." : "Failed to save to DB.";
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
      newPortfolioLocal();
      setSaveMsg(lang === "pt-BR" ? "Carteira excluída." : "Portfolio deleted.");
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

  const tabLabel = (k: HoldingsTab) => {
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

  const holdingsEmptyText =
    filtered.length === 0
      ? data || manualPositions.length
        ? lang === "pt-BR"
          ? "Nenhuma posição nesse filtro."
          : "No positions in this filter."
        : lang === "pt-BR"
          ? "Sem dados ainda — importe, selecione do banco ou adicione manualmente."
          : "No data yet — import, pick from DB or add manually."
      : "";

  const tableRows: HoldingRow[] = filtered.map((h) => ({
    ticker: (h.ticker ?? "").toUpperCase(),
    quantity: Number(h.quantity ?? 0),
    price: Number(h.price ?? 0),
    value: Number(h.value ?? 0),
    cls: h.cls,
  }));

  return (
    <main className="space-y-6">
      <ConfirmDialog
        open={confirmClearOpen}
        title={t("portfolio.confirm.clearTitle")}
        description={t("portfolio.confirm.clearDesc")}
        confirmText={t("common.clear")}
        cancelText={t("common.cancel")}
        onConfirm={clearEverythingLocalOnly}
        onClose={() => setConfirmClearOpen(false)}
      />

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={t("portfolio.confirm.deleteTitle")}
        description={t("portfolio.confirm.deleteDesc")}
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        onConfirm={onDeleteSelectedPortfolio}
        onClose={() => setConfirmDeleteOpen(false)}
      />

      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Wallet size={22} />
          {t("portfolio.title")}
        </h1>
      </div>

      {/* TOP ROW */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-stretch">
        <div className="lg:col-span-3">
          <div className="h-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
            <div className="flex flex-col gap-3 h-full">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    <Database size={16} />
                    {t("portfolio.db.title")}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={newPortfolioLocal}
                    className="h-10 inline-flex items-center justify-center gap-2 rounded-xl
                              border border-[var(--border)] bg-[var(--surface-alt)] px-4 text-sm font-semibold
                              text-[var(--text-primary)] hover:bg-[var(--surface)]"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    {t("common.new")}
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmDeleteOpen(true)}
                    disabled={saveLoading || selectedPortfolioId === ""}
                    className="h-10 inline-flex items-center justify-center gap-2 rounded-xl
                              border border-[color:var(--sell)]/40 bg-[var(--surface)] px-4 text-sm font-semibold
                              text-[color:var(--sell)] hover:bg-[color:var(--sell)]/10
                              disabled:opacity-60 disabled:cursor-not-allowed"
                    title={
                      selectedPortfolioId === ""
                        ? lang === "pt-BR"
                          ? "Selecione uma carteira do banco"
                          : "Select a DB portfolio"
                        : t("common.delete")
                    }
                  >
                    <Trash2 className="h-4 w-4 shrink-0" />
                    {t("common.delete")}
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
                  <option value="">{t("portfolio.db.unsavedNew")}</option>
                  {dbPortfolios.map((p: DbPortfolio) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                {dbLoading ? (
                  <div className="mt-2 text-xs text-[var(--text-muted)]">
                    {t("portfolio.db.updating")}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="h-full grid grid-cols-2 gap-4">
            <StatCard
              className="h-full flex flex-col justify-between"
              title={
                <span className="flex items-center gap-2">
                  <BarChart3 size={16} />
                  {lang === "pt-BR" ? "Total investido" : "Total invested"}
                </span>
              }
              value={fmtMoney(totals.totalValue)}
            />
            <StatCard
              className="h-full flex flex-col justify-between"
              title={
                <span className="flex items-center gap-2">
                  <Wallet size={16} />
                  {lang === "pt-BR" ? "Ativos" : "Assets"}
                </span>
              }
              value={String(holdings.length)}
            />
          </div>
        </div>
      </section>

      {/* MAIN ROW */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-9">
              <label className="block text-sm font-medium text-[var(--text-primary)]">
                {t("portfolio.form.nameLabel")}
              </label>

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
                <div className="mt-2 text-xs text-[var(--text-muted)]">
                  {t("portfolio.form.uniqueHint")}
                </div>
              )}
            </div>

            <div className="hidden md:block md:col-span-3" />
          </div>

          <div className="bg-[var(--surface-alt)] border border-[var(--border)] rounded-2xl p-4 space-y-4">
            {/* Header + Tabs */}
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Plus size={16} />
                {lang === "pt-BR" ? "Adicionar ativos" : "Add assets"}
              </div>

              <div className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
                <button
                  type="button"
                  onClick={() => setAddTab("import")}
                  className={[
                    "px-3 py-1.5 rounded-lg text-xs font-semibold transition",
                    addTab === "import"
                      ? "bg-[var(--surface-alt)] text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                  ].join(" ")}
                >
                  {lang === "pt-BR" ? "Importar XLSX" : "Import XLSX"}
                </button>

                <button
                  type="button"
                  onClick={() => setAddTab("manual")}
                  className={[
                    "px-3 py-1.5 rounded-lg text-xs font-semibold transition",
                    addTab === "manual"
                      ? "bg-[var(--surface-alt)] text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                  ].join(" ")}
                >
                  {lang === "pt-BR" ? "Manual" : "Manual"}
                </button>
              </div>
            </div>

            {/* TAB: IMPORT */}
            {addTab === "import" ? (
              <div className="space-y-3">
                <div className="text-xs text-[var(--text-muted)]">
                  {t("portfolio.importCard.fileLabel")}
                </div>

                <label
                  onDragOver={onDragOverXlsx}
                  onDragLeave={onDragLeaveXlsx}
                  onDrop={onDropXlsx}
                  className={[
                    "block cursor-pointer rounded-2xl border border-dashed bg-[var(--surface)] p-4 transition",
                    isDragOver
                      ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/25 bg-[var(--surface-alt)]"
                      : "border-[var(--border)] hover:bg-[var(--surface-alt)]",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-2">
                      <UploadCloud className="h-5 w-5 text-[var(--text-muted)]" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-[var(--text-primary)]">
                        {lang === "pt-BR"
                          ? isDragOver
                            ? "Solte o XLSX aqui"
                            : "Clique para selecionar o XLSX"
                          : isDragOver
                            ? "Drop the XLSX here"
                            : "Click to pick the XLSX"}
                      </div>

                      <div className="mt-1 text-xs text-[var(--text-muted)] truncate">
                        {file ? file.name : data?.meta?.filename ?? t("portfolio.importCard.noneFile")}
                      </div>

                      <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                        {lang === "pt-BR"
                          ? "Dica: arraste e solte aqui também."
                          : "Tip: you can drag & drop here too."}
                      </div>
                    </div>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={(e) => setPickedFile(e.target.files?.[0] ?? null)}
                  />
                </label>

                <button
                  onClick={onImport}
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl
                            bg-[var(--primary)] text-[var(--on-primary)]
                            px-4 py-2.5 text-sm font-semibold
                            hover:bg-[var(--primary-hover)]
                            disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Upload className="h-4 w-4 shrink-0" />
                  {loading ? t("portfolio.importCard.importing") : t("portfolio.importCard.importBtn")}
                </button>
              </div>
            ) : null}

            {/* TAB: MANUAL */}
            {addTab === "manual" ? (
              <div className="grid grid-cols-1 gap-3">
                <div className="relative">
                  <label className="block text-xs text-[var(--text-muted)] mb-1">
                    {t("portfolio.manualCard.asset")}
                  </label>

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
                      placeholder={
                        lang === "pt-BR"
                          ? "Digite ticker (ex.: HGLG11, VALE3...)"
                          : "Type ticker (e.g., HGLG11, VALE3...)"
                      }
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 pr-10 text-sm
                                text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                    />

                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                      {sugLoading || priceLoading || assetIndexLoading ? (
                        <span className="h-2 w-2 rounded-full bg-[var(--text-muted)]/60 group-hover:bg-[var(--text-primary)]/60" />
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
                    <label className="block text-xs text-[var(--text-muted)] mb-1">
                      {t("portfolio.manualCard.quantity")}
                    </label>
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
                    <label className="block text-xs text-[var(--text-muted)] mb-1">
                      {t("portfolio.manualCard.priceOpt")}
                    </label>
                    <input
                      value={manualPrice}
                      onChange={(e) => setManualPrice(e.target.value)}
                      inputMode="decimal"
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm
                                text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={addManual}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl
                            bg-[var(--primary)] text-[var(--on-primary)]
                            px-4 py-2.5 text-sm font-semibold
                            hover:bg-[var(--primary-hover)]"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  {t("common.add")}
                </button>
              </div>
            ) : null}
          </div>

          {error ? <div className="text-sm text-[color:var(--sell)]">{error}</div> : null}
          {saveMsg ? <div className="text-sm text-[var(--text-muted)]">{saveMsg}</div> : null}
        </div>

        {/* Right summary */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                {t("portfolio.allocation.title")}
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                {holdings.length
                  ? t("portfolio.holdings.items", { count: holdings.length })
                  : lang === "pt-BR"
                    ? "sem ativos"
                    : "no assets"}
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
                  <div className="mt-1 font-semibold text-[var(--text-primary)]">
                    {fmtPct(totals.pctValue.stocks)}
                  </div>
                </div>

                <div className="relative rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3 transition">
                  <div className="absolute right-2 top-2 text-[10px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-muted)] bg-[var(--surface)]/60">
                    {totals.count.fiis}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">{labelFiis}</div>
                  <div className="mt-1 font-semibold text-[var(--text-primary)]">
                    {fmtPct(totals.pctValue.fiis)}
                  </div>
                </div>

                <div className="relative rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3 transition">
                  <div className="absolute right-2 top-2 text-[10px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-muted)] bg-[var(--surface)]/60">
                    {totals.count.bonds}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">{labelBonds}</div>
                  <div className="mt-1 font-semibold text-[var(--text-primary)]">
                    {fmtPct(totals.pctValue.bonds)}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onSaveToDb}
            disabled={saveLoading || nameTakenByOther}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl
                      bg-[var(--primary)] text-[var(--on-primary)]
                      px-4 py-3 text-sm font-semibold
                      hover:bg-[var(--primary-hover)]
                      disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Save className="h-5 w-5 shrink-0" />
            {saveLoading
              ? t("portfolio.save.saving")
              : selectedPortfolioId === ""
                ? t("portfolio.save.create")
                : t("portfolio.save.update")}
          </button>
        </div>
      </section>

      {/* Holdings */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <BarChart3 size={18} />
              {t("portfolio.holdings.title")}
            </div>
          </div>

          <PortfolioFilters
            tabs={availableTabs}
            active={tab}
            onChange={setTab}
            tabLabel={tabLabel}
          />
        </div>

        <PortfolioTable
          rows={tableRows}
          lang={lang}
          fmtMoney={fmtMoney}
          fmtQty={fmtQty}
          badgeLabel={badgeLabel}
          notesByTicker={notesByTicker}
          clampNote={clampNote}
          onSetNote={(ticker, note) =>
            setNotesByTicker((prev) => ({ ...prev, [ticker.toUpperCase()]: note }))
          }
          onRemove={removeTicker}
          emptyText={holdingsEmptyText}
        />
      </section>
    </main>
  );
}
