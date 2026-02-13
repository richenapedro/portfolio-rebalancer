/* page.tsx */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
// /mnt/data/page.tsx
import {
  importB3,
  type ImportResponse,
  searchSymbols,
  getRemotePrices,
  getRemoteAssets,
  type RemoteAsset,
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

function StatCard(props: { title: string; value: string; hint?: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
      <div className="text-xs text-[var(--text-muted)]">{props.title}</div>
      <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{props.value}</div>
      {props.hint ? <div className="mt-1 text-xs text-[var(--text-muted)]">{props.hint}</div> : null}
    </div>
  );
}

const LS_IMPORT_KEY = "portfolio:lastImport";
const LS_NAME_KEY = "portfolio:portfolioName";
const LS_MANUAL_KEY = "portfolio:manualPositions";
const LS_NOTES_KEY = "portfolio:notesByTicker";
const LS_REMOVED_KEY = "portfolio:removedTickers";

function pickDefaultName(metaFilename?: string, fileName?: string) {
  const raw = (metaFilename || fileName || "Minha carteira").trim();
  return raw.replace(/\.[^.]+$/, "");
}

function summarizeMeta(meta?: ImportResponse["meta"] | null, manualCount?: number) {
  const m = manualCount ?? 0;
  if (!meta) return m ? `${m} itens adicionados manualmente` : "Importe um XLSX da B3 ou adicione manualmente";

  const a = meta.n_positions ?? 0;
  const b = meta.n_prices ?? 0;
  const c = meta.n_targets ?? 0;

  if (a === b && b === c) return `${a + m} itens na carteira`;

  const parts: string[] = [];
  if (a) parts.push(`Posições: ${a}`);
  if (b) parts.push(`Preços: ${b}`);
  if (c) parts.push(`Targets: ${c}`);
  if (m) parts.push(`Manual: ${m}`);

  return parts.length ? parts.join(" • ") : "Dados importados";
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

export default function PortfolioPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<ImportResponse | null>(null);
  const [portfolioName, setPortfolioName] = useState<string>("");

  // manual
  const [manualPositions, setManualPositions] = useState<Position[]>([]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<PickedAsset | null>(null);
  const [qty, setQty] = useState<string>("");
  const [manualPrice, setManualPrice] = useState<string>("");

  const [showSug, setShowSug] = useState(false);
  const blurTimer = useRef<number | null>(null);

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  // sugestões remotas
  const [remoteSug, setRemoteSug] = useState<string[]>([]);
  const [sugLoading, setSugLoading] = useState(false);

  // loading do preço (somente overlay no input do ticker)
  const [priceLoading, setPriceLoading] = useState(false);

  const [assetIndex, setAssetIndex] = useState<RemoteAsset[] | null>(null);
  const [assetIndexLoading, setAssetIndexLoading] = useState(false);

  // notas/pesos + removidos
  const [notesByTicker, setNotesByTicker] = useState<Record<string, number>>({});
  const [removedTickers, setRemovedTickers] = useState<string[]>([]);

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

  // /mnt/data/page.tsx
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setAssetIndexLoading(true);
        const res = await getRemoteAssets(); // ✅ 1 chamada só
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

  // restore last import + name + manual + notes + removed
  useEffect(() => {
    try {
      const rawImport = localStorage.getItem(LS_IMPORT_KEY);
      if (rawImport) setData(JSON.parse(rawImport) as ImportResponse);

      const rawName = localStorage.getItem(LS_NAME_KEY);
      if (rawName) setPortfolioName(rawName);

      const rawManual = localStorage.getItem(LS_MANUAL_KEY);
      if (rawManual) setManualPositions(JSON.parse(rawManual) as Position[]);

      const rawNotes = localStorage.getItem(LS_NOTES_KEY);
      if (rawNotes) setNotesByTicker(JSON.parse(rawNotes) as Record<string, number>);

      const rawRemoved = localStorage.getItem(LS_REMOVED_KEY);
      if (rawRemoved) setRemovedTickers(JSON.parse(rawRemoved) as string[]);
    } catch {
      // ignore
    }
  }, []);

  // default portfolio name
  useEffect(() => {
    if (portfolioName.trim()) return;
    const candidate = pickDefaultName(data?.meta?.filename, file?.name);
    setPortfolioName(candidate);
  }, [data?.meta?.filename, file?.name, portfolioName]);

  // persist name
  useEffect(() => {
    const v = portfolioName.trim();
    if (!v) return;
    try {
      localStorage.setItem(LS_NAME_KEY, v);
    } catch {}
  }, [portfolioName]);

  // persist manual
  useEffect(() => {
    try {
      localStorage.setItem(LS_MANUAL_KEY, JSON.stringify(manualPositions));
    } catch {}
  }, [manualPositions]);

  // persist notes
  useEffect(() => {
    try {
      localStorage.setItem(LS_NOTES_KEY, JSON.stringify(notesByTicker));
    } catch {}
  }, [notesByTicker]);

  // persist removed
  useEffect(() => {
    try {
      localStorage.setItem(LS_REMOVED_KEY, JSON.stringify(removedTickers));
    } catch {}
  }, [removedTickers]);

  // ✅ buscar sugestões conforme digita (debounce)
  useEffect(() => {
    const query = q.trim().toUpperCase();
    if (picked && q.includes("—")) return;

    const t = window.setTimeout(async () => {
      try {
        setSugLoading(true);

        // ✅ se já temos o index, autocomplete é local (zero lag)
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

        // fallback remoto (se index não carregou)
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

  // positions = import + manual, removendo tickers deletados
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

  // /mnt/data/page.tsx
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

    if (!file) {
      setError("Selecione um arquivo B3 (XLSX) para importar.");
      return;
    }

    try {
      setLoading(true);
      const res = await importB3({ file, noTesouro: false });
      setData(res);
      setRemovedTickers([]);
      localStorage.removeItem(LS_REMOVED_KEY);
      localStorage.setItem(LS_IMPORT_KEY, JSON.stringify(res));

      const nextDefault = pickDefaultName(res.meta?.filename, file.name);
      setPortfolioName((prev) => (prev.trim() ? prev : nextDefault));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "Falha ao importar arquivo.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function clearEverything() {
    setData(null);
    setFile(null);
    setError(null);

    setManualPositions([]);
    setPicked(null);
    setQ("");
    setQty("");
    setManualPrice("");
    setShowSug(false);

    setNotesByTicker({});
    setRemovedTickers([]);

    localStorage.removeItem(LS_IMPORT_KEY);
    localStorage.removeItem(LS_MANUAL_KEY);
    localStorage.removeItem(LS_NOTES_KEY);
    localStorage.removeItem(LS_REMOVED_KEY);
  }

  function addManual() {
    setError(null);

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
    const priceCandidate = priceFromInput ?? picked.price ?? data?.prices?.[picked.ticker] ?? 0;

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

    // se estava removido, restaura
    restoreTicker(pos.ticker);

    setManualPositions((prev) => {
      const i = prev.findIndex((p) => p.ticker === pos.ticker);
      if (i === -1) return [...prev, pos];

      const copy = [...prev];
      copy[i] = {
        ...copy[i],
        quantity: copy[i].quantity + pos.quantity,
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

    // reset do preço ao trocar de ativo (mas vamos preencher pelo cache se existir)
    setManualPrice("");

    // preenche instantâneo do cache (class + price)
    setPicked({
      ticker,
      name: ticker,
      asset_class: meta?.cls ?? "other",
      currency: "BRL",
      price: meta?.price ?? undefined,
    });

    if (meta?.price != null && Number.isFinite(meta.price)) {
      setManualPrice(String(meta.price));
    }

    // busca preço remoto pra confirmar/atualizar
    try {
      setPriceLoading(true);

      const prices = await getRemotePrices([ticker]);
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

  return (
    <main className="space-y-6">
      <ConfirmModal
        open={confirmClearOpen}
        title="Tem certeza que deseja limpar a carteira?"
        description="Isso removerá as posições importadas e os ativos adicionados manualmente neste navegador. Essa ação não pode ser desfeita."
        confirmText="Limpar"
        cancelText="Cancelar"
        onConfirm={clearEverything}
        onClose={() => setConfirmClearOpen(false)}
      />

      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Carteira</h1>
        <div className="text-sm text-[var(--text-muted)]">Importe sua posição e acompanhe alocação</div>
      </div>

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

              <div className="mt-2 text-xs text-[var(--text-muted)]">Sugestão automática baseada no arquivo importado. Você pode editar.</div>
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

                    <input type="file" accept=".xlsx" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
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

                {data?.warnings?.length ? (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <div className="text-sm font-semibold text-[var(--text-primary)]">Avisos</div>
                    <ul className="mt-2 space-y-1 text-sm text-[var(--text-muted)]">
                      {data.warnings.slice(0, 4).map((w, i) => (
                        <li key={i}>• {w}</li>
                      ))}
                      {data.warnings.length > 4 ? <li className="text-xs">+ {data.warnings.length - 4} outros…</li> : null}
                    </ul>
                  </div>
                ) : (
                  <div className="text-xs text-[var(--text-muted)]">Se o arquivo não for compatível, use o modo manual ao lado.</div>
                )}
              </div>
            </div>

            {/* Manual card */}
            <div className="bg-[var(--surface-alt)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
              <div className="text-sm font-semibold text-[var(--text-primary)]">Adicionar manualmente</div>

              <div className="grid grid-cols-1 gap-3">
                <div className="relative">
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Ativo</label>

                  {/* wrapper relative pra overlay dentro do input */}
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

                    {/* indicador discreto no canto direito, sem mexer layout */}
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                      {sugLoading || priceLoading || assetIndexLoading ? (
                        <span
                          title={assetIndexLoading ? "Carregando ativos..." : priceLoading ? "Buscando preço..." : "Buscando sugestões..."}
                          className="h-2 w-2 rounded-full bg-[var(--text-muted)]/60 group-hover:bg-[var(--text-primary)]/60"
                        />
                      ) : null}
                    </div>

                    {/* tooltip no hover (não altera layout) */}
                    {sugLoading || priceLoading || assetIndexLoading ? (
                      <div className="pointer-events-none absolute right-2 -top-8 hidden group-hover:block">
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-muted)] shadow-lg">
                          {assetIndexLoading ? "Carregando ativos..." : priceLoading ? "Buscando preço..." : "Buscando sugestões..."}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* dropdown sugestões */}
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

                <div className="text-xs text-[var(--text-muted)]">Sugestões vêm do backend (/api/bd_remote/symbols).</div>
              </div>
            </div>
          </div>

          {error ? <div className="text-sm text-[color:var(--sell)]">{error}</div> : null}
        </div>

        {/* Right summary */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <StatCard title="Total investido" value={fmtMoney(totals.totalValue)} hint="Somente posições (sem caixa)" />
            <StatCard title="Ativos" value={String(holdings.length)} hint="Linhas na carteira" />
          </div>


          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-2">
            <div className="text-sm font-semibold text-[var(--text-primary)]">Alocação atual</div>

            <div className="grid grid-cols-3 gap-3 text-sm">
              {totals.count.stocks > 0 ? (
                <div className="relative rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3">
                  <div className="absolute right-2 top-2 text-[10px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-muted)]">
                    {totals.count.stocks}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">Ações</div>
                  <div className="mt-1 font-semibold">{fmtPct(totals.pctValue.stocks)}</div>
                </div>
              ) : null}

              {totals.count.fiis > 0 ? (
                <div className="relative rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3">
                  <div className="absolute right-2 top-2 text-[10px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-muted)]">
                    {totals.count.fiis}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">FIIs</div>
                  <div className="mt-1 font-semibold">{fmtPct(totals.pctValue.fiis)}</div>
                </div>
              ) : null}

              {totals.count.bonds > 0 ? (
                <div className="relative rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3">
                  <div className="absolute right-2 top-2 text-[10px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-muted)]">
                    {totals.count.bonds}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">RF</div>
                  <div className="mt-1 font-semibold">{fmtPct(totals.pctValue.bonds)}</div>
                </div>
              ) : null}
            </div>
          </div>

        </div>
      </section>

      {/* Holdings */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="text-lg font-semibold text-[var(--text-primary)]">Posições</div>
            <div className="text-sm text-[var(--text-muted)]">{summarizeMeta(data?.meta ?? null, manualPositions.length)}</div>
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
                      {data || manualPositions.length ? "Nenhuma posição nesse filtro." : "Sem dados ainda — importe ou adicione manualmente."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((h, idx) => (
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
                        <input
                          type="number"
                          min={0}
                          max={10}
                          step={1}
                          value={notesByTicker[(h.ticker ?? "").toUpperCase()] ?? 10}
                          onChange={(e) => {
                            const tk = (h.ticker ?? "").toUpperCase();
                            const v = clampNote(Number(e.target.value));
                            setNotesByTicker((prev) => ({ ...prev, [tk]: v }));
                          }}
                          className="w-16 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-center
                                     text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                        />
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
