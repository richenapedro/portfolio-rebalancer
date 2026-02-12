"use client";

type Summary = {
  cash_before: number;
  cash_after: number;
  total_value_before: number; // backend = holdings + cash
  total_value_after: number;  // backend = holdings + cash
  n_trades: number;
};

function fmtMoney(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

export function SummaryCards(props: {
  summary: Summary;
  holdingsTotalBefore?: number; // total das tabelas (sem cash)
  holdingsTotalAfter?: number;  // total das tabelas (sem cash)
}) {
  const s = props.summary;

  const holdingsBefore =
    typeof props.holdingsTotalBefore === "number" ? props.holdingsTotalBefore : s.total_value_before - s.cash_before;

  const holdingsAfter =
    typeof props.holdingsTotalAfter === "number" ? props.holdingsTotalAfter : s.total_value_after - s.cash_after;

  const deltaCash = s.cash_after - s.cash_before;
  const deltaHoldings = holdingsAfter - holdingsBefore;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="text-xs text-[var(--text-muted)]">Cash before</div>
        <div className="mt-1 font-mono text-lg text-[var(--text-primary)]">{fmtMoney(s.cash_before)}</div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="text-xs text-[var(--text-muted)]">Cash after</div>
        <div className="mt-1 font-mono text-lg text-[var(--text-primary)]">{fmtMoney(s.cash_after)}</div>
        <div className={`mt-1 text-xs ${deltaCash < 0 ? "text-red-400" : "text-emerald-400"}`}>
          {deltaCash < 0 ? "Δ " : "Δ "}
          {fmtMoney(deltaCash)}
        </div>
      </div>

      {/* ✅ Agora bate com o total das tabelas (holdings only) */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="text-xs text-[var(--text-muted)]">Holdings value before</div>
        <div className="mt-1 font-mono text-lg text-[var(--text-primary)]">{fmtMoney(holdingsBefore)}</div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="text-xs text-[var(--text-muted)]">Holdings value after</div>
        <div className="mt-1 font-mono text-lg text-[var(--text-primary)]">{fmtMoney(holdingsAfter)}</div>
        <div className={`mt-1 text-xs ${deltaHoldings < 0 ? "text-red-400" : "text-emerald-400"}`}>
          Δ {fmtMoney(deltaHoldings)}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="text-xs text-[var(--text-muted)]">Trades</div>
        <div className="mt-1 font-mono text-lg text-[var(--text-primary)]">{s.n_trades}</div>
      </div>
    </div>
  );
}
