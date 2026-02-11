"use client";

import * as React from "react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="cursor-pointer select-none text-sm font-medium rounded-lg border border-[var(--border)]
                 bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)]
                 hover:bg-[var(--surface-alt)] hover:border-[var(--primary)]/40
                 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition"
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      {isDark ? "Dark" : "Light"}
    </button>
  );
}
