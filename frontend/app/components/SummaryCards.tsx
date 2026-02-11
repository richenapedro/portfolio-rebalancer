"use client";

import type { RebalanceResult } from "@/lib/api";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function fmtNum(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);
}

export function SummaryCards(props: { summary: RebalanceResult["summary"] }) {
  const s = props.summary;

  const deltaCash = s.cash_after - s.cash_before;
  const deltaTotal = s.total_value_after - s.total_value_before;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <Card title="Cash before" value={fmtMoney(s.cash_before)} />
      <DeltaCard title="Cash after" value={fmtMoney(s.cash_after)} delta={deltaCash} />

      <Card title="Total value before" value={fmtMoney(s.total_value_before)} />
      <DeltaCard title="Total value after" value={fmtMoney(s.total_value_after)} delta={deltaTotal} />

      <Card title="Trades" value={fmtNum(s.n_trades)} />
    </div>
  );
}

function Card(props: { title: string; value: string; sub?: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
      <div className="text-xs font-medium tracking-wide text-[var(--text-muted)]">{props.title}</div>
      <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{props.value}</div>
      {props.sub && <div className="mt-1 text-xs text-[var(--text-muted)]">{props.sub}</div>}
    </div>
  );
}

function DeltaCard(props: { title: string; value: string; delta: number }) {
  const isZero = Math.abs(props.delta) < 0.005;
  const isPos = props.delta > 0;

  const deltaText = `Δ ${fmtMoney(props.delta)}`;

  const deltaColor = isZero
    ? "text-[var(--text-muted)]"
    : isPos
    ? "text-[var(--buy)]"
    : "text-[var(--sell)]";

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
      <div className="text-xs font-medium tracking-wide text-[var(--text-muted)]">{props.title}</div>
      <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{props.value}</div>
      <div className={`mt-1 text-xs font-medium ${deltaColor}`}>{deltaText}</div>
    </div>
  );
}
