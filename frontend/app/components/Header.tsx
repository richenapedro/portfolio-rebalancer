"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { useI18n } from "@/i18n/I18nProvider";
import type { Lang } from "@/i18n/dictionaries";

function NavLink(props: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === props.href || pathname.startsWith(props.href + "/");

  return (
    <Link
      href={props.href}
      className={[
        "text-sm font-medium transition-colors",
        active ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
      ].join(" ")}
    >
      {props.label}
    </Link>
  );
}

function LangButton(props: { lang: Lang; current: Lang; onClick: (l: Lang) => void; label: string }) {
  const active = props.current === props.lang;
  return (
    <button
      type="button"
      onClick={() => props.onClick(props.lang)}
      className={[
        "text-xs font-semibold rounded-lg border px-2 py-1 transition-colors",
        active
          ? "border-[var(--border)] bg-[var(--surface-alt)] text-[var(--text-primary)]"
          : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]",
      ].join(" ")}
      aria-pressed={active}
    >
      {props.label}
    </button>
  );
}

export function Header() {
  const isLoggedIn = false;
  const { t, lang, setLang } = useI18n();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--surface)]/85 backdrop-blur">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-semibold text-base tracking-tight text-[var(--text-primary)]">
            {t("header.brand")}
          </Link>

          <nav className="hidden md:flex items-center gap-5">
            <NavLink href="/tools" label={t("header.nav.tools")} />
            <NavLink href="/portfolio" label={t("header.nav.portfolio")} />
            <NavLink href="/learn" label={t("header.nav.learn")} />
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2">
            <LangButton lang="pt-BR" current={lang} onClick={setLang} label="PT" />
            <LangButton lang="en" current={lang} onClick={setLang} label="EN" />
          </div>

          {!isLoggedIn ? (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                {t("header.auth.login")}
              </Link>

              <Link
                href="/signup"
                className="text-sm font-semibold rounded-lg bg-[var(--primary)] text-[var(--on-primary)] px-3 py-2
                           hover:bg-[var(--primary-hover)] transition-colors"
              >
                {t("header.auth.signup")}
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
        <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between gap-5">
          <div className="flex items-center gap-5">
            <NavLink href="/tools" label={t("header.nav.tools")} />
            <NavLink href="/portfolio" label={t("header.nav.portfolio")} />
            <NavLink href="/learn" label={t("header.nav.learn")} />
          </div>

          <div className="flex items-center gap-2">
            <LangButton lang="pt-BR" current={lang} onClick={setLang} label="PT" />
            <LangButton lang="en" current={lang} onClick={setLang} label="EN" />
          </div>
        </div>
      </div>
    </header>
  );
}
