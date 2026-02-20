"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";

import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "@/i18n/I18nProvider";

function Field(props: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[var(--text-muted)]">{props.label}</span>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">{props.icon}</div>
        {props.children}
      </div>
    </label>
  );
}

export default function SignupPage() {
  const { t } = useI18n();
  const { signup } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minLen = 8;
  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.length >= minLen && !busy;
  }, [email, password, busy]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await signup(email.trim(), password);
      router.push("/portfolio");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || t("auth.errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-sm dark:shadow-black/30 overflow-hidden">
        <div className="p-7 space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[var(--surface-alt)] border border-[var(--border)] grid place-items-center">
              <UserPlus className="h-5 w-5 text-[var(--text-primary)]" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--heading)]">{t("auth.signup.title")}</h1>
              <p className="text-sm text-[var(--text-muted)]">{t("auth.signup.subtitle")}</p>
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="px-7 pb-7 space-y-5">
          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <Field label={t("auth.fields.email")} icon={<Mail className="h-4 w-4" />}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              placeholder={t("auth.placeholders.email")}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] pl-10 pr-4 py-3
                         text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                         focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/35"
            />
          </Field>

          <Field label={t("auth.fields.password")} icon={<Lock className="h-4 w-4" />}>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={show ? "text" : "password"}
              autoComplete="new-password"
              placeholder={t("auth.placeholders.password")}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] pl-10 pr-11 py-3
                         text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                         focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/35"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              aria-label={show ? t("auth.aria.hidePassword") : t("auth.aria.showPassword")}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </Field>

          <div className="text-xs text-[var(--text-muted)]">
            {t("auth.signup.passwordHint", { min: minLen })}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)]
                       px-4 py-3 text-sm font-semibold text-[var(--on-primary)] hover:bg-[var(--primary-hover)] transition
                       disabled:opacity-60 disabled:hover:bg-[var(--primary)]"
          >
            {t("auth.signup.submit")}
          </button>

          <div className="text-sm text-[var(--text-muted)]">
            {t("auth.signup.haveAccount")} {" "}
            <Link href="/login" className="font-semibold text-[var(--text-primary)] hover:underline">
              {t("auth.signup.cta")}
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
