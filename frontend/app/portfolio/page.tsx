/* page.tsx */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { importB3, type ImportResponse } from "@/lib/api";

type AssetClass = "stocks" | "fiis" | "bonds" | "other";
type Position = ImportResponse["positions"][number];

type Holding = Position & {
  value: number;
  cls: AssetClass;
};

type AssetSearchItem = {
  id: string; // ticker
  ticker: string;
  name: string;
  asset_class: AssetClass; // vem do BD (fonte da verdade)
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
    stocks: {
      label: "Ações",
      classes: "bg-[color:var(--sell)]/15 text-[color:var(--sell)] border-[color:var(--sell)]/30",
    },
    fiis: {
      label: "FIIs",
      classes: "bg-[color:var(--buy)]/15 text-[color:var(--buy)] border-[color:var(--buy)]/30",
    },
    bonds: {
      label: "RF",
      classes: "bg-[var(--surface-alt)] text-[var(--text-muted)] border-[var(--border)]",
    },
    other: {
      label: "Outro",
      classes: "bg-[var(--surface-alt)] text-[var(--text-muted)] border-[var(--border)]",
    },
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

// MOCK (trocar por API depois)
const MOCK_ASSETS: AssetSearchItem[] = [
  { id: "HGLG11", ticker: "HGLG11", name: "CSHG Logística", asset_class: "fiis", currency: "BRL", price: 156.71 },
  { id: "KNRI11", ticker: "KNRI11", name: "Kinea Renda Imobiliária", asset_class: "fiis", currency: "BRL", price: 159.01 },
  { id: "XPML11", ticker: "XPML11", name: "XP Malls", asset_class: "fiis", currency: "BRL", price: 110.52 },
  { id: "VALE3", ticker: "VALE3", name: "Vale", asset_class: "stocks", currency: "BRL", price: 68.2 },
  { id: "ITUB4", ticker: "ITUB4", name: "Itaú Unibanco", asset_class: "stocks", currency: "BRL", price: 32.1 },
  { id: "BRSTNCNTB4W2", ticker: "BRSTNCNTB4W2", name: "Tesouro (exemplo)", asset_class: "bonds", currency: "BRL", price: 4338.0 },
];

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

export default function PortfolioPage() {
  const [file, setFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<ImportResponse | null>(null);
  const [portfolioName, setPortfolioName] = useState<string>("");

  // manual
  const [manualPositions, setManualPositions] = useState<Position[]>([]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<AssetSearchItem | null>(null);
  const [qty, setQty] = useState<string>("");
  const [manualPrice, setManualPrice] = useState<string>("");
  const [showSug, setShowSug] = useState(false);
  const blurTimer = useRef<number | null>(null);

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  // restore last import + name + manual
  useEffect(() => {
    try {
      const rawImport = localStorage.getItem(LS_IMPORT_KEY);
      if (rawImport) setData(JSON.parse(rawImport) as ImportResponse);

      const rawName = localStorage.getItem(LS_NAME_KEY);
      if (rawName) setPortfolioName(rawName);

      const rawManual = localStorage.getItem(LS_MANUAL_KEY);
      if (rawManual) setManualPositions(JSON.parse(rawManual) as Position[]);
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
    } catch {
      // ignore
    }
  }, [portfolioName]);

  // persist manual
  useEffect(() => {
    try {
      localStorage.setItem(LS_MANUAL_KEY, JSON.stringify(manualPositions));
    } catch {
      // ignore
    }
  }, [manualPositions]);

  const suggestions = useMemo(() => {
    const query = q.trim().toUpperCase();
    if (!query) return [];
    return MOCK_ASSETS.filter((a) => `${a.ticker} ${a.name}`.toUpperCase().includes(query)).slice(0, 8);
  }, [q]);

  // positions = import + manual
  const allPositions: Position[] = useMemo(() => {
    return [...(data?.positions ?? []), ...manualPositions];
  }, [data?.positions, manualPositions]);

  const holdings: Holding[] = useMemo(() => {
    return allPositions
      .map((p) => {
        const value = (p.quantity ?? 0) * (p.price ?? 0);
        const cls = mapAssetTypeToClass(p.asset_type);
        return { ...p, value, cls };
      })
      .sort((a, b) => b.value - a.value);
  }, [allPositions]);

  const totals = useMemo(() => {
    const by: Record<AssetClass, number> = { stocks: 0, fiis: 0, bonds: 0, other: 0 };
    let total = 0;

    for (const h of holdings) {
      by[h.cls] += h.value;
      total += h.value;
    }

    const pct: Record<AssetClass, number> = {
      stocks: total ? (by.stocks / total) * 100 : 0,
      fiis: total ? (by.fiis / total) * 100 : 0,
      bonds: total ? (by.bonds / total) * 100 : 0,
      other: total ? (by.other / total) * 100 : 0,
    };

    return { by, pct, total };
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

  // se o tab atual sumir, volta pra "all"
  useEffect(() => {
    if (!availableTabs.includes(tab)) setTab("all");
  }, [availableTabs, tab]);

  const filtered = useMemo(() => {
    if (tab === "all") return holdings;
    return holdings.filter((h) => h.cls === tab);
  }, [holdings, tab]);

  // ✅ se existir manual, não usar weights_current (é “congelado” do import)
  const useDynamicWeights = manualPositions.length > 0 || !data?.weights_current;

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

    localStorage.removeItem(LS_IMPORT_KEY);
    localStorage.removeItem(LS_MANUAL_KEY);
    // (nome mantém)
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
      asset_type: mapAssetClassToAssetType(picked.asset_class), // fonte: BD
      quantity: qn,
      price: priceCandidate,
    };

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
  }

  function onPickAsset(a: AssetSearchItem) {
    setPicked(a);
    setQ(`${a.ticker} — ${a.name}`);
    setShowSug(false);
    if (a.price != null && Number.isFinite(a.price)) setManualPrice(String(a.price));
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

      {/* Top section */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left panel */}
        <div className="lg:col-span-3 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          {/* Header row */}
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

              <div className="mt-2 text-xs text-[var(--text-muted)]">
                Sugestão automática baseada no arquivo importado. Você pode editar.
              </div>
            </div>

            {/* (opcional) deixa as 3 colunas vazias no desktop pra manter a mesma largura de layout */}
            <div className="hidden md:block md:col-span-3" />
          </div>

          {/* Import + Manual side-by-side */}
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
                {/* Search */}
                <div className="relative">
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Ativo</label>
                  <input
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setPicked(null);
                      setShowSug(true);
                    }}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholder="Digite ticker ou nome (ex.: HGLG11, VALE3...)"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm
                               text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                  />

                  {showSug && suggestions.length > 0 ? (
                    <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg">
                      {suggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => onPickAsset(s)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-alt)]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-semibold text-[var(--text-primary)]">{s.ticker}</div>
                            <div className="text-xs text-[var(--text-muted)] truncate">{s.name}</div>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <Badge cls={s.asset_class} />
                            {s.price != null ? <span className="text-xs text-[var(--text-muted)]">{fmtMoney(s.price)}</span> : null}
                          </div>
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

                <div className="text-xs text-[var(--text-muted)]">O tipo (Ações/FIIs/RF) vem do seu BD. Aqui é só um mock.</div>
              </div>
            </div>
          </div>

          {error ? <div className="text-sm text-[color:var(--sell)]">{error}</div> : null}
        </div>

        {/* Right summary */}
        <div className="lg:col-span-2 space-y-4">
          {/* ✅ removidos cards "Ações" e "FIIs" */}
          <div className="grid grid-cols-2 gap-4">
            <StatCard title="Total investido" value={fmtMoney(totals.total)} hint="Somente posições (sem caixa)" />
            <StatCard title="Ativos" value={String(holdings.length)} hint="Linhas na carteira" />
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-2">
            <div className="text-sm font-semibold text-[var(--text-primary)]">Alocação atual</div>

            {/* ✅ se tiver manual, usa totals (dinâmico). se não tiver, pode usar weights_current */}
            {useDynamicWeights ? (
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3">
                  <div className="text-xs text-[var(--text-muted)]">Ações</div>
                  <div className="mt-1 font-semibold">{fmtPct(totals.pct.stocks)}</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3">
                  <div className="text-xs text-[var(--text-muted)]">FIIs</div>
                  <div className="mt-1 font-semibold">{fmtPct(totals.pct.fiis)}</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3">
                  <div className="text-xs text-[var(--text-muted)]">RF</div>
                  <div className="mt-1 font-semibold">{fmtPct(totals.pct.bonds)}</div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3">
                  <div className="text-xs text-[var(--text-muted)]">Ações</div>
                  <div className="mt-1 font-semibold">{fmtPct(data!.weights_current!.stocks)}</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3">
                  <div className="text-xs text-[var(--text-muted)]">FIIs</div>
                  <div className="mt-1 font-semibold">{fmtPct(data!.weights_current!.fiis)}</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3">
                  <div className="text-xs text-[var(--text-muted)]">RF</div>
                  <div className="mt-1 font-semibold">{fmtPct(data!.weights_current!.bonds)}</div>
                </div>
              </div>
            )}
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
                </tr>
              </thead>

              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-[var(--text-muted)]">
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
