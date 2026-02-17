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

function fmtMoney(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}
function fmtQty(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 }).format(n);
}
function fmtPct(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n) + "%";
}

function Badge(props: { cls: AssetClass }) {
  const map: Record<AssetClass, { label: string; classes: string }> = {
    stocks: { label: "Ações", classes: "bg-[color:var(--sell)]/15 text-[color:var(--sell)] border-[color:var(--sell)]/30" },
    fiis: { label: "FIIs", classes: "bg-[color:var(--buy)]/15 text-[color:var(--buy)] border-[color:var(--buy)]/30" },
    bonds: { label: "RF", classes: "bg-[var(--surface-alt)] text-[var(--text-muted)] border-[var(--border)]" },
    other: { label: "Outro", classes: "bg-[var(--surface-alt)] text-[var(--text-muted)] border-[var(--border)]" },
  };
  const s = map[props.cls];
  return (
    <span className={["inline-flex items-center px-2 py-0.5 rounded-full text-xs border", s.classes].join(" ")}>
      {s.label}
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
                {props.cancelText ?? "Cancelar"}
              </button>
              <button
                onClick={() => {
                  props.onConfirm();
                  props.onClose();
                }}
                className="rounded-xl bg-[var(--primary)] text-[var(--on-primary)] px-4 py-2 text-sm font-semibold
                           hover:bg-[var(--primary-hover)]"
              >
                {props.confirmText ?? "Confirmar"}
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

  const removedSet = useMemo(() => new Set(removedTickers.map((t) => t.toUpperCase())), [removedTickers]);

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
        console.error("Falha ao carregar assets index:", e);
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

    const found = dbPortfolios.find((p) => p.name.trim().toLowerCase() === name);
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

  function newPortfolio() {
    setSelectedPortfolioId("");
    setPortfolioName("Minha carteira");

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

    const t = window.setTimeout(async () => {
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

    return () => window.clearTimeout(t);
  }, [q, picked, assetIndex]);

  // positions = base(import/db) + manual, removendo tickers deletados
  const allPositions: Position[] = useMemo(() => {
    const merged = [...(data?.positions ?? []), ...manualPositions];
    return merged.filter((p) => !removedSet.has((p.ticker ?? "").toUpperCase()));
  }, [data?.positions, manualPositions, removedSet]);

  const holdings: Holding[] = useMemo(() => {
    return allPositions
      .map((p) => {
        const value = (p.quantity ?? 0) * (p.price ?? 0);
        const cls = mapAssetTypeToClass(p.asset_type);

        const tk = (p.ticker ?? "").toUpperCase();
        const note = clampNote(notesByTicker[tk] ?? 10);

        return { ...p, value, cls, note };
      })
      .sort((a, b) => b.value - a.value);
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
      setError("Selecione um arquivo B3 (XLSX) para importar.");
      return;
    }

    try {
      setLoading(true);
      const res = await importB3({ file, noTesouro: false });
      setData(res);

      setRemovedTickers([]);

      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "Falha ao importar arquivo.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function addManual() {
    setError(null);
    setSaveMsg(null);

    if (!picked) {
      setError("Selecione um ativo válido na lista.");
      return;
    }

    const qn = Number(String(qty).replace(",", "."));
    if (!Number.isFinite(qn) || qn <= 0) {
      setError("Quantidade inválida.");
      return;
    }

    const priceFromInput = manualPrice.trim() ? Number(manualPrice.replace(",", ".")) : undefined;
    const prices = data?.prices as Record<string, number> | undefined;
    const priceCandidate = priceFromInput ?? picked.price ?? prices?.[picked.ticker] ?? 0;

    if (!Number.isFinite(priceCandidate) || priceCandidate <= 0) {
      setError("Preço inválido. Digite um preço ou garanta que exista no BD.");
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
      console.error("Erro ao buscar preço:", e);
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
      setError("Digite um nome para a carteira.");
      return;
    }
    if (nameTakenByOther) {
      setError("Já existe uma carteira com esse nome. Escolha outro nome.");
      return;
    }
    if (holdings.length === 0) {
      setError("Nada para salvar: a carteira está vazia.");
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
        setSaveMsg(`Criado! portfolio_id=${created.id}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Falha ao salvar no banco.";
      setError(msg);
    } finally {
      setSaveLoading(false);
    }
  }

  async function onDeleteSelectedPortfolio() {
    setError(null);
    setSaveMsg(null);

    if (selectedPortfolioId === "") {
      setError("Selecione uma carteira do banco para excluir.");
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

  return (
    <main className="space-y-6">
      <ConfirmModal
        open={confirmClearOpen}
        title="Tem certeza que deseja limpar a carteira?"
        description="Isso limpa a edição atual (tela). Não exclui a carteira do banco."
        confirmText="Limpar"
        cancelText="Cancelar"
        onConfirm={clearEverythingLocalOnly}
        onClose={() => setConfirmClearOpen(false)}
      />

      <ConfirmModal
        open={confirmDeleteOpen}
        title="Excluir carteira do banco?"
        description="Essa ação remove a carteira e todas as posições/import_runs no banco. Não pode ser desfeita."
        confirmText="Excluir"
        cancelText="Cancelar"
        onConfirm={onDeleteSelectedPortfolio}
        onClose={() => setConfirmDeleteOpen(false)}
      />

      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Carteira</h1>
        <div className="text-sm text-[var(--text-muted)]">Gerencie múltiplas carteiras e acompanhe alocação</div>
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
              <label className="block text-sm font-medium text-[var(--text-primary)]">Nome da carteira</label>

              <div className="mt-2 flex items-center gap-3">
                <input
                  value={portfolioName}
                  onChange={(e) => setPortfolioName(e.target.value)}
                  placeholder="Minha carteira"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 text-sm
                            text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                />

                <button
                  onClick={() => setConfirmClearOpen(true)}
                  className="shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-2 text-sm font-semibold
                            text-[var(--text-primary)] hover:bg-[var(--surface)]"
                >
                  Limpar carteira
                </button>
              </div>

              {nameTakenByOther ? (
                <div className="mt-2 text-xs text-[color:var(--sell)]">
                  Já existe uma carteira com esse nome (o nome é o identificador). Troque para salvar.
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
              <div className="text-sm font-semibold text-[var(--text-primary)]">Importar arquivo B3</div>

              <div className="space-y-2">
                <label className="block text-xs text-[var(--text-muted)]">Arquivo (XLSX)</label>

                <div className="flex items-center gap-2 flex-wrap">
                  <label
                    className="max-w-full inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]
                              px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-alt)] cursor-pointer"
                  >
                    <span className="font-medium shrink-0">Selecionar</span>

                    <span className="min-w-0 flex-1 text-[var(--text-muted)] truncate">
                      {file ? file.name : data?.meta?.filename ?? "Nenhum arquivo"}
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
                    {loading ? "Importando..." : "Importar"}
                  </button>
                </div>

                <div className="text-xs text-[var(--text-muted)]">
                  Importar arquivo atualiza a edição da tela. Para gravar no banco, clique em “Salvar no banco”.
                </div>
              </div>
            </div>

            {/* Manual card */}
            <div className="bg-[var(--surface-alt)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
              <div className="text-sm font-semibold text-[var(--text-primary)]">Adicionar manualmente</div>

              <div className="grid grid-cols-1 gap-3">
                <div className="relative">
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Ativo</label>

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
                      placeholder="Digite ticker (ex.: HGLG11, VALE3...)"
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 pr-10 text-sm
                                 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                    />

                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                      {sugLoading || priceLoading || assetIndexLoading ? (
                        <span
                          title={assetIndexLoading ? "Carregando ativos..." : priceLoading ? "Buscando preço..." : "Buscando sugestões..."}
                          className="h-2 w-2 rounded-full bg-[var(--text-muted)]/60 group-hover:bg-[var(--text-primary)]/60"
                        />
                      ) : null}
                    </div>
                  </div>

                  {showSug && !sugLoading && remoteSug.length > 0 ? (
                    <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg">
                      {remoteSug.map((ticker) => (
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
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Quantidade</label>
                    <input
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      placeholder="ex.: 10"
                      inputMode="decimal"
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm
                                 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Preço (opcional)</label>
                    <input
                      value={manualPrice}
                      onChange={(e) => setManualPrice(e.target.value)}
                      placeholder="usa BD/Prices se vazio"
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
                    Adicionar
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
              <div className="text-sm font-semibold text-[var(--text-primary)]">Alocação atual</div>
              <div className="text-xs text-[var(--text-muted)]">{holdings.length ? `${holdings.length} ativos` : "sem ativos"}</div>
            </div>

            {holdings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-alt)] p-4 text-sm text-[var(--text-muted)]">
                Nenhum ativo ainda. Importe um XLSX da B3 ou adicione manualmente para ver a alocação.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="relative rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3 transition">
                  <div className="absolute right-2 top-2 text-[10px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-muted)] bg-[var(--surface)]/60">
                    {totals.count.stocks}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">Ações</div>
                  <div className="mt-1 font-semibold text-[var(--text-primary)]">{fmtPct(totals.pctValue.stocks)}</div>
                </div>

                <div className="relative rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3 transition">
                  <div className="absolute right-2 top-2 text-[10px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-muted)] bg-[var(--surface)]/60">
                    {totals.count.fiis}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">FIIs</div>
                  <div className="mt-1 font-semibold text-[var(--text-primary)]">{fmtPct(totals.pctValue.fiis)}</div>
                </div>

                <div className="relative rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3 transition">
                  <div className="absolute right-2 top-2 text-[10px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-muted)] bg-[var(--surface)]/60">
                    {totals.count.bonds}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">RF</div>
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
            {saveLoading ? "Salvando..." : selectedPortfolioId === "" ? "Salvar no banco (criar)" : "Salvar no banco (atualizar)"}
          </button>
        </div>
      </section>

      {/* Holdings */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="text-lg font-semibold text-[var(--text-primary)]">Posições</div>
            <div className="text-sm text-[var(--text-muted)]">
              {data?.meta?.filename ? `Base: ${data.meta.filename}` : "Base: (sem import/DB)"} • {holdings.length} itens
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
                {k === "all" ? "Tudo" : k === "stocks" ? "Ações" : k === "fiis" ? "FIIs" : k === "bonds" ? "RF" : "Outros"}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <div className="max-h-[540px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--surface)]/95 backdrop-blur border-b border-[var(--border)]">
                <tr className="text-left">
                  <th className="p-3 font-semibold text-[var(--text-muted)]">Ativo</th>
                  <th className="p-3 font-semibold text-[var(--text-muted)] text-center">Tipo</th>
                  <th className="p-3 font-semibold text-[var(--text-muted)] text-right">Qtd</th>
                  <th className="p-3 font-semibold text-[var(--text-muted)] text-right">Preço</th>
                  <th className="p-3 font-semibold text-[var(--text-muted)] text-right">Valor</th>
                  <th className="p-3 font-semibold text-[var(--text-muted)] text-center">Nota</th>
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
                            <Badge cls={h.cls} />
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
                              aria-label="Diminuir nota"
                              title="Diminuir"
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
                              aria-label="Aumentar nota"
                              title="Aumentar"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => removeTicker(h.ticker)}
                            title="Remover"
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
