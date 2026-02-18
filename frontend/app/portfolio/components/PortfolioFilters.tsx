"use client";

export type AssetClass = "stocks" | "fiis" | "bonds" | "other";
export type HoldingsTab = "all" | AssetClass;

type Props = {
  tabs: HoldingsTab[];
  active: HoldingsTab;
  onChange: (tab: HoldingsTab) => void;
  tabLabel: (k: HoldingsTab) => string;
};

export default function PortfolioFilters({ tabs, active, onChange, tabLabel }: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {tabs.map((k) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={[
            "px-3 py-1.5 rounded-xl text-sm font-semibold border transition-colors",
            active === k
              ? "bg-[var(--surface-alt)] border-[var(--border)] text-[var(--text-primary)]"
              : "bg-transparent border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border)]",
          ].join(" ")}
        >
          {tabLabel(k)}
        </button>
      ))}
    </div>
  );
}
