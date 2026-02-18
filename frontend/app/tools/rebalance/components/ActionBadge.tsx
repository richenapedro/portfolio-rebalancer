export default function ActionBadge(props: { action: "BUY" | "SELL" | "—" }) {
  const a = props.action;

  if (a === "—") return <span className="text-xs text-[var(--text-muted)]">—</span>;

  const cls =
    a === "BUY"
      ? "bg-[color:var(--buy)]/20 text-[color:var(--buy)] border-[color:var(--buy)]/30"
      : "bg-[color:var(--sell)]/20 text-[color:var(--sell)] border-[color:var(--sell)]/30";

  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${cls}`}>{a}</span>;
}
