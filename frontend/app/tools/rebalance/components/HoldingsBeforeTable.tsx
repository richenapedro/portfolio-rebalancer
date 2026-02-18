"use client";

import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import AllocationBreakdownCard from "./AllocationBreakdownCard";
import { bindSyncScroll, syncScroll } from "./scrollSync";
import type { HoldingRow, UnifiedRow } from "./helpers";

export default function HoldingsBeforeTable(props: {
  rows: UnifiedRow[];
  title: string;
  holdings: HoldingRow[];
  syncId: string;
  fmtMoney: (n: number) => string;
  fmtQty: (n: number) => string;
  fmtPct: (n: number) => string;
  labels: {
    total: string;
    ticker: string;
    qty: string;
    price: string;
    value: string;
    empty: string;
    dash: string;
    breakdownBefore: string;
    allocStocks: string;
    allocFiis: string;
    allocBonds: string;
  };
}) {
  const total = useMemo(() => props.rows.reduce((acc, r) => acc + (r.before.value ?? 0), 0), [props.rows]);

  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bindSyncScroll(props.syncId, bodyRef.current, "a");
  }, [props.syncId]);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 flex flex-col h-full">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <ArrowLeft className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
          {props.title}
        </h3>
        <div className="text-xs text-[var(--text-muted)]">
          {props.labels.total}: <span className="font-mono text-[var(--text-primary)]">{props.fmtMoney(total)}</span>
        </div>
      </div>

      <div
        ref={bodyRef}
        onScroll={() => syncScroll(props.syncId, "a")}
        className="overflow-x-auto overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] h-[520px]"
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--surface-alt)]">
            <tr className="text-left border-b border-[var(--border)]">
              <th className="py-2 pr-3">{props.labels.ticker}</th>
              <th className="py-2 pr-3">{props.labels.qty}</th>
              <th className="py-2 pr-3">{props.labels.price}</th>
              <th className="py-2 pr-3">{props.labels.value}</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.ticker} className="border-b border-[var(--border)] last:border-b-0">
                <td className="py-2 pr-3 font-mono text-[var(--text-primary)]">{r.ticker}</td>
                <td className="py-2 pr-3 font-mono text-[var(--text-primary)]">{props.fmtQty(r.before.quantity)}</td>
                <td className="py-2 pr-3 font-mono text-[var(--text-primary)]">
                  {typeof r.before.price === "number" ? props.fmtMoney(r.before.price) : props.labels.dash}
                </td>
                <td className="py-2 pr-3 font-mono text-[var(--text-primary)]">
                  {typeof r.before.value === "number" ? props.fmtMoney(r.before.value) : props.labels.dash}
                </td>
              </tr>
            ))}

            {props.rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-[var(--text-muted)]">
                  {props.labels.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <AllocationBreakdownCard
          title={props.labels.breakdownBefore}
          rows={props.holdings}
          fmtMoney={props.fmtMoney}
          fmtPct={props.fmtPct}
          labels={{
            stocks: props.labels.allocStocks,
            fiis: props.labels.allocFiis,
            bonds: props.labels.allocBonds,
            total: props.labels.total,
          }}
        />
      </div>
    </div>
  );
}
