"use client";

import { useMemo } from "react";

export type AllocationWeights = {
  stocks: number;
  fiis: number;
  bonds: number;
};

type Key = keyof AllocationWeights;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function sumW(w: AllocationWeights) {
  return w.stocks + w.fiis + w.bonds;
}

function ValuePill({ v }: { v: number }) {
  return (
    <span className="rounded-md border border-[var(--border)] bg-[var(--surface-alt)] px-2 py-0.5 text-xs font-mono text-[var(--text-primary)]">
      {v}%
    </span>
  );
}

function SliderRow(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  // preenchimento do track via background inline (funciona bem em webkit e fica ok no firefox com o CSS abaixo)
  const pct = clamp(props.value, 0, 100);
  const bg = `linear-gradient(to right,
    var(--range-fill) 0%,
    var(--range-fill) ${pct}%,
    var(--range-track) ${pct}%,
    var(--range-track) 100%)`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--text-primary)]">{props.label}</span>
        <ValuePill v={props.value} />
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        onInput={(e) => props.onChange(Number((e.target as HTMLInputElement).value))}
        className="pr-range w-full"
        style={{ background: bg }}
      />
    </div>
  );
}

export function AllocationSliders(props: {
  value: AllocationWeights;
  onChange: (next: AllocationWeights) => void;
}) {
  const w = props.value;

  const sum = useMemo(() => sumW(w), [w]);
  const remaining = 100 - sum;

  function setOne(key: Key, raw: number) {
    const desired = clamp(Math.round(raw), 0, 100);
    const current = w[key];
    const inc = desired - current;

    if (inc > 0 && inc > remaining) {
      props.onChange({ ...w, [key]: current + remaining });
      return;
    }
    props.onChange({ ...w, [key]: desired });
  }

  const remainingCls =
    remaining > 0 ? "text-[color:var(--ok)]" : "text-[color:var(--danger)]";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      {/* ✅ Sem título duplicado + sem “100%” */}
      <div className="mb-3 text-xs text-[var(--text-muted)]">
        Restante: <span className={`font-mono ${remainingCls}`}>{remaining}%</span>
      </div>

      <div className="space-y-3">
        <SliderRow label="Ações" value={w.stocks} onChange={(v) => setOne("stocks", v)} />
        <SliderRow label="FIIs" value={w.fiis} onChange={(v) => setOne("fiis", v)} />
        <SliderRow label="Tesouro / RF" value={w.bonds} onChange={(v) => setOne("bonds", v)} />
      </div>
    </div>
  );
}

