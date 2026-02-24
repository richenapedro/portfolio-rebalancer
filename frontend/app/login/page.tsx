"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Eye, EyeOff, Lock, LogIn, Mail } from "lucide-react";

import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { authOauthExchange } from "@/lib/api";

function GoogleIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={props.className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303C33.65 32.658 29.19 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.843 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.272 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917Z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691 12.88 19.51C14.659 15.108 18.977 12 24 12c3.059 0 5.843 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.272 4 24 4c-7.682 0-14.35 4.334-17.694 10.691Z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.17 0 9.86-1.977 13.409-5.197l-6.19-5.238C29.188 35.09 26.715 36 24 36c-5.169 0-9.615-3.318-11.283-7.946l-6.52 5.023C9.505 39.556 16.227 44 24 44Z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.05 12.05 0 0 1-4.084 5.565l.003-.002 6.19 5.238C36.97 39.201 44 34 44 24c0-1.341-.138-2.65-.389-3.917Z"
      />
    </svg>
  );
}

function FacebookIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={props.className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#1877F2"
        d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.413c0-3.025 1.792-4.699 4.533-4.699 1.312 0 2.686.236 2.686.236v2.97h-1.514c-1.492 0-1.957.93-1.957 1.887v2.266h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073Z"
      />
    </svg>
  );
}

function Field(props: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[var(--text-muted)]">
        {props.label}
      </span>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
          {props.icon}
        </div>
        {props.children}
      </div>
    </label>
  );
}

type OAuthSession = {
  provider?: "google" | "facebook";
  id_token?: string;
  access_token?: string;
};

export default function LoginPage() {
  const { t } = useI18n();
  const { login, refresh } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();

  const { data: session, status } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextUrl = sp.get("next") ?? "/portfolio";

  // depois do Google, volta pra /login (pra fazermos exchange + cookie do backend)
  const oauthCallbackUrl = `/login?next=${encodeURIComponent(nextUrl)}`;

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.length > 0 && !busy;
  }, [email, password, busy]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setError(null);

    try {
      await login(email.trim(), password);
      router.replace(nextUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || t("auth.errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  // ✅ Bridge: NextAuth (Google) -> FastAPI cookie session -> redirect pro next
  // ✅ Bridge: NextAuth (Google/Facebook) -> FastAPI cookie session -> redirect pro next
  useEffect(() => {
    if (status !== "authenticated") return;

    const s = session as unknown as OAuthSession | null;

    const payload =
      s?.provider === "google" && typeof s.id_token === "string" && s.id_token
        ? { provider: "google" as const, id_token: s.id_token }
        : s?.provider === "facebook" && typeof s.access_token === "string" && s.access_token
          ? { provider: "facebook" as const, access_token: s.access_token }
          : null;

    if (!payload) return;

    let cancelled = false;

    (async () => {
      try {
        setBusy(true);
        setError(null);

        await authOauthExchange(payload);
        await refresh();

        if (!cancelled) router.replace(nextUrl);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled) setError(msg || "OAuth exchange failed");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, session, refresh, router, nextUrl]);

  return (
    <main className="mx-auto max-w-md">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-sm dark:shadow-black/30 overflow-hidden">
        <div className="p-7 space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[var(--surface-alt)] border border-[var(--border)] grid place-items-center">
              <LogIn className="h-5 w-5 text-[var(--text-primary)]" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--heading)]">
                {t("auth.login.title")}
              </h1>
              <p className="text-sm text-[var(--text-muted)]">
                {t("auth.login.subtitle")}
              </p>
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
              autoComplete="current-password"
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

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)]
                       px-4 py-3 text-sm font-semibold text-[var(--on-primary)] hover:bg-[var(--primary-hover)] transition
                       disabled:opacity-60 disabled:hover:bg-[var(--primary)]"
          >
            {busy ? "..." : t("auth.login.submit")}
          </button>

          <div className="pt-2 space-y-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => signIn("google", { callbackUrl: oauthCallbackUrl })}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)]
                         bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)]
                         hover:bg-[var(--surface-alt)] transition disabled:opacity-60"
            >
              <GoogleIcon className="h-5 w-5" />
              Entrar com Google
            </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => signIn("facebook", { callbackUrl: oauthCallbackUrl })}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)]
                      bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)]
                      hover:bg-[var(--surface-alt)] transition disabled:opacity-60"
          >
            <FacebookIcon className="h-5 w-5" />
            Entrar com Facebook
          </button>
          </div>

          <div className="text-sm text-[var(--text-muted)]">
            {t("auth.login.noAccount")}{" "}
            <Link href="/signup" className="font-semibold text-[var(--text-primary)] hover:underline">
              {t("auth.login.cta")}
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}