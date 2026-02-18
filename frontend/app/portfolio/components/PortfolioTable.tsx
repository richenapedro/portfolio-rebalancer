"use client";

import { Minus, Plus, Trash2 } from "lucide-react";

export type AssetClass = "stocks" | "fiis" | "bonds" | "other";

export type HoldingRow = {
  ticker: string;
  quantity: number;
  price: number;
  value: number;
  cls: AssetClass;
};

function Badge(props: { cls: AssetClass; label: string }) {
  const map: Record<AssetClass, { classes: string }> = {
    stocks: { classes: "bg-[color:var(--sell)]/15 text-[color:var(--sell)] border-[color:var(--sell)]/30" },
    fiis: { classes: "bg-[color:var(--buy)]/15 text-[color:var(--buy)] border-[color:var(--buy)]/30" },
    bonds: { classes: "bg-[var(--surface-alt)] text-[var(--text-muted)] border-[var(--border)]" },
    other: { classes: "bg-[var(--surface-alt)] text-[var(--text-muted)] border-[var(--border)]" },
  };
  const s = map[props.cls];
  return (
    <span className={["inline-flex items-center px-2 py-0.5 rounded-full text-xs border", s.classes].join(" ")}>
      {props.label}
    </span>
  );
}

type Props = {
  rows: HoldingRow[];
  lang: string;

  fmtMoney: (n: number) => string;
  fmtQty: (n: number) => string;

  badgeLabel: (cls: AssetClass) => string;

  notesByTicker: Record<string, number>;
  clampNote: (v: number) => number;
  onSetNote: (ticker: string, note: number) => void;

  onRemove: (ticker: string) => void;

  emptyText: string;
};

export default function PortfolioTable(props: Props) {
  const { rows, lang, fmtMoney, fmtQty, badgeLabel, notesByTicker, clampNote, onSetNote, onRemove, emptyText } = props;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)]">
      <div className="max-h-[540px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--surface)]/95 backdrop-blur border-b border-[var(--border)]">
            <tr className="text-left">
              <th className="p-3 font-semibold text-[var(--text-muted)]">Asset</th>
              <th className="p-3 font-semibold text-[var(--text-muted)] text-center">Type</th>
              <th className="p-3 font-semibold text-[var(--text-muted)] text-right">Qty</th>
              <th className="p-3 font-semibold text-[var(--text-muted)] text-right">Price</th>
              <th className="p-3 font-semibold text-[var(--text-muted)] text-right">Value</th>
              <th className="p-3 font-semibold text-[var(--text-muted)] text-center">Note</th>
              <th className="p-3 font-semibold text-[var(--text-muted)] text-center"></th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-[var(--text-muted)]">
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((h, idx) => {
                const tk = (h.ticker ?? "").toUpperCase();
                const v = notesByTicker[tk] ?? 10;

                return (
                  <tr key={`${h.ticker}-${idx}`} className="border-t border-[var(--border)] hover:bg-[var(--surface-alt)]/40">
                    <td className="p-3 font-semibold text-[var(--text-primary)]">{h.ticker}</td>

                    <td className="p-3 align-middle">
                      <div className="flex items-center justify-center">
                        <Badge cls={h.cls} label={badgeLabel(h.cls)} />
                      </div>
                    </td>

                    <td className="p-3 text-right text-[var(--text-primary)]">{fmtQty(h.quantity)}</td>
                    <td className="p-3 text-right text-[var(--text-primary)]">{fmtMoney(h.price)}</td>
                    <td className="p-3 text-right font-semibold text-[var(--text-primary)]">{fmtMoney(h.value)}</td>

                    <td className="p-3 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onSetNote(tk, clampNote((notesByTicker[tk] ?? 10) - 1))}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]
                                     text-[var(--text-primary)] hover:bg-[var(--surface-alt)]"
                          aria-label={lang === "pt-BR" ? "Diminuir nota" : "Decrease note"}
                          title={lang === "pt-BR" ? "Diminuir" : "Decrease"}
                        >
                          <Minus size={14} />
                        </button>

                        <input
                          type="number"
                          min={0}
                          max={10}
                          step={1}
                          value={v}
                          onChange={(e) => onSetNote(tk, clampNote(Number(e.target.value)))}
                          className="w-14 h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-center
                                     text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary)]/30
                                     [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />

                        <button
                          type="button"
                          onClick={() => onSetNote(tk, clampNote((notesByTicker[tk] ?? 10) + 1))}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]
                                     text-[var(--text-primary)] hover:bg-[var(--surface-alt)]"
                          aria-label={lang === "pt-BR" ? "Aumentar nota" : "Increase note"}
                          title={lang === "pt-BR" ? "Aumentar" : "Increase"}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </td>

                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => onRemove(h.ticker)}
                        title={lang === "pt-BR" ? "Remover" : "Remove"}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]
                                   text-[var(--text-muted)] hover:text-[color:var(--sell)] hover:border-[color:var(--sell)]/40 hover:bg-[var(--surface-alt)]"
                      >
                        <Trash2 size={16} />
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
  );
}
