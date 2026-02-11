"use client";

import { useMemo } from "react";

export type AllocationWeights = {
  stocks: number;
  fiis: number;
  bonds: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function AllocationSliders(props: {
  value: AllocationWeights;
  onChange: (next: AllocationWeights) => void;
}) {
  const w = props.value;

  const sum = useMemo(() => w.stocks + w.fiis + w.bonds, [w]);
  const remaining = 100 - sum;

  function setOne(key: keyof AllocationWeights, raw: number) {
    // raw já vem do range (Number(e.target.value))
    const desired = raw;

    const current = w[key];
    const others = sum - current;

    // teto global: esse slider só pode subir até consumir o restante
    const maxAllowed = 100 - others; // == current + remaining

    const nextVal = clamp(desired, 0, maxAllowed);

    props.onChange({ ...w, [key]: nextVal });
  }

  return (
    <div className="border rounded p-4 space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">Alocação (soma = 100%)</h3>
        <span className="text-sm font-mono">{sum}%</span>
      </div>

      <div className="text-sm text-gray-600">
        Restante: <span className="font-mono">{remaining}%</span>
      </div>

      <SliderRow label="Ações" value={w.stocks} onChange={(v) => setOne("stocks", v)} />
      <SliderRow label="FIIs" value={w.fiis} onChange={(v) => setOne("fiis", v)} />
      <SliderRow label="Tesouro / RF" value={w.bonds} onChange={(v) => setOne("bonds", v)} />

      <p className="text-sm text-gray-600">
        Você pode aumentar qualquer slider somente até consumir o restante (a soma nunca passa de 100).
      </p>
    </div>
  );
}

function SliderRow(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <span>{props.label}</span>
        <span className="font-mono">{props.value}%</span>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}
