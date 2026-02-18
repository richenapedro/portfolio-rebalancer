"use client";

import { useMemo } from "react";
import { allocationFromHoldings, type HoldingRow } from "./helpers";

export default function AllocationBreakdownCard(props: {
  title: string;
  rows: HoldingRow[];
  fmtMoney: (n: number) => string;
  fmtPct: (n: number) => string;
  labels: { stocks: string; fiis: string; bonds: string; total: string };
}) {
  const data = useMemo(() => allocationFromHoldings(props.rows), [props.rows]);

  const items: Array<{ key: keyof typeof data.pct; label: string }> = [
    { key: "stocks", label: props.labels.stocks },
    { key: "fiis", label: props.labels.fiis },
    { key: "bonds", label: props.labels.bonds },
  ];

  return (
    <div className="bg-[var(--surface-alt)] border border-[var(--border)] rounded-xl p-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-xs font-semibold text-[var(--text-primary)]">{props.title}</div>
        <div className="text-[11px] text-[var(--text-muted)]">
          {props.labels.total}: <span className="font-mono text-[var(--text-primary)]">{props.fmtMoney(data.total)}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {items.map((it) => (
          <div key={it.key} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2">
            <div className="text-[11px] text-[var(--text-muted)]">{it.label}</div>
            <div className="font-mono text-sm text-[var(--text-primary)]">{props.fmtPct(data.pct[it.key])}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
