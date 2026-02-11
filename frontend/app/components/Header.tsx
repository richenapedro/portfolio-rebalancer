"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

function NavLink(props: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === props.href || pathname.startsWith(props.href + "/");

  return (
    <Link
      href={props.href}
      className={[
        "text-sm font-medium transition-colors",
        active
          ? "text-[var(--text-primary)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
      ].join(" ")}
    >
      {props.label}
    </Link>
  );
}

export function Header() {
  const isLoggedIn = false;

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--surface)]/85 backdrop-blur">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-semibold text-base tracking-tight text-[var(--text-primary)]">
            Portfolio App
          </Link>

          <nav className="hidden md:flex items-center gap-5">
            <NavLink href="/tools" label="Ferramentas" />
            <NavLink href="/portfolio" label="Carteira" />
            <NavLink href="/learn" label="Aprender" />
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {!isLoggedIn ? (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Entrar
              </Link>

              <Link
                href="/signup"
                className="text-sm font-semibold rounded-lg bg-[var(--primary)] text-[var(--on-primary)] px-3 py-2
                           hover:bg-[var(--primary-hover)] transition-colors"
              >
                Criar conta
              </Link>

              <ThemeToggle />
            </>
          ) : (
            <button className="text-sm font-medium rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 text-[var(--text-primary)]">
              Pedro ▾
            </button>
          )}
        </div>
      </div>

      <div className="md:hidden border-t border-[var(--border)]">
        <div className="mx-auto max-w-6xl px-6 py-3 flex items-center gap-5">
          <NavLink href="/tools" label="Ferramentas" />
          <NavLink href="/portfolio" label="Carteira" />
          <NavLink href="/learn" label="Aprender" />
        </div>
      </div>
    </header>
  );
}
