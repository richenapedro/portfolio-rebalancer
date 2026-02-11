"use client";

import { useMemo, useState } from "react";
import type { RebalanceResult } from "@/lib/api";

type Trade = RebalanceResult["trades"][number];
type SideFilter = "ALL" | "BUY" | "SELL";
type SortMode = "notional_desc" | "ticker_asc";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function fmtNum(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 }).format(n);
}

function SideBadge(props: { side: "BUY" | "SELL" }) {
  const cls =
    props.side === "BUY"
      ? "bg-[color:var(--buy)]/20 text-[color:var(--buy)] border-[color:var(--buy)]/30"
      : "bg-[color:var(--sell)]/20 text-[color:var(--sell)] border-[color:var(--sell)]/30";

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {props.side}
    </span>
  );
}

export function TradesTable(props: { trades: Trade[] }) {
  const [q, setQ] = useState("");
  const [side, setSide] = useState<SideFilter>("ALL");
  const [sort, setSort] = useState<SortMode>("notional_desc");

  const filtered = useMemo(() => {
    const qq = q.trim().toUpperCase();

    let out = props.trades;

    if (side !== "ALL") out = out.filter((t) => t.side === side);
    if (qq) out = out.filter((t) => t.ticker.toUpperCase().includes(qq));

    out = [...out];
    if (sort === "notional_desc") out.sort((a, b) => b.notional - a.notional);
    if (sort === "ticker_asc") out.sort((a, b) => a.ticker.localeCompare(b.ticker));

    return out;
  }, [props.trades, q, side, sort]);

  const totalNotional = useMemo(
    () => filtered.reduce((acc, t) => acc + t.notional, 0),
    [filtered]
  );

  return (
    <div className="bg-[var(--surface-alt)] border border-[var(--border)] rounded-xl p-4 md:p-5 space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Trades</h2>
          <div className="text-sm text-[var(--text-muted)]">
            {filtered.length} items • Total:{" "}
            <span className="font-mono text-[var(--text-primary)]">{fmtMoney(totalNotional)}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar ticker (ex: VALE3)"
            className="w-full md:w-64 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm
                       text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                       focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
          />

          <select
            value={side}
            onChange={(e) => setSide(e.target.value as SideFilter)}
            className="w-full md:w-44 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm
                       text-[var(--text-primary)]
                       focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
          >
            <option value="ALL">ALL</option>
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="w-full md:w-56 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm
                       text-[var(--text-primary)]
                       focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
          >
            <option value="notional_desc">Sort: Notional ↓</option>
            <option value="ticker_asc">Sort: Ticker A→Z</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-alt)]">
            <tr className="text-left border-b border-[var(--border)]">
              <th className="py-3 px-3 font-semibold text-[var(--text-muted)]">Side</th>
              <th className="py-3 px-3 font-semibold text-[var(--text-muted)]">Ticker</th>
              <th className="py-3 px-3 font-semibold text-[var(--text-muted)] text-right">Qty</th>
              <th className="py-3 px-3 font-semibold text-[var(--text-muted)] text-right">Price</th>
              <th className="py-3 px-3 font-semibold text-[var(--text-muted)] text-right">Notional</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((t, i) => (
              <tr
                key={`${t.side}-${t.ticker}-${i}`}
                className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-alt)]/60"
              >
                <td className="py-3 px-3">
                  <SideBadge side={t.side} />
                </td>
                <td className="py-3 px-3 font-mono">{t.ticker}</td>
                <td className="py-3 px-3 font-mono text-right">{fmtNum(t.quantity)}</td>
                <td className="py-3 px-3 font-mono text-right">{fmtMoney(t.price)}</td>
                <td className="py-3 px-3 font-mono text-right">{fmtMoney(t.notional)}</td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm text-[var(--text-muted)]">
                  Nenhum trade encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
