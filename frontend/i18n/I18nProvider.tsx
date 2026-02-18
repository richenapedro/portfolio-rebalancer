"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { dictionaries, type Dict, type Lang, type TranslationKey } from "./dictionaries";
import { DEFAULT_LANG, LANG_COOKIE, parseLang } from "./lang";

type Vars = Record<string, string | number | boolean | null | undefined>;

function getByPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split(".")) {
    if (cur && typeof cur === "object" && k in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }
  return cur;
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const v = vars[name];
    return v === null || v === undefined ? "" : String(v);
  });
}

function setCookieLang(lang: Lang) {
  // 1 ano
  document.cookie = `${LANG_COOKIE}=${encodeURIComponent(lang)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

type I18nContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey, vars?: Vars) => string;
  dict: Dict;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider(props: { children: React.ReactNode; initialLang?: Lang }) {
  // ✅ SSR-safe: começa com initialLang vindo do server (cookie)
  const [lang, _setLang] = useState<Lang>(props.initialLang ?? DEFAULT_LANG);

  // opcional: se quiser respeitar localStorage legado sem causar mismatch,
  // só lê AFTER mount, e só se for diferente do initialLang.
  useEffect(() => {
    const v = window.localStorage.getItem("portfolio-rebalancer.lang");
    const stored = parseLang(v);
    if (stored && stored !== lang) _setLang(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLang = useCallback((next: Lang) => {
    _setLang(next);
    try {
      window.localStorage.setItem("portfolio-rebalancer.lang", next);
    } catch {}
    setCookieLang(next);
    document.documentElement.lang = next;
  }, []);

  const dict = dictionaries[lang];

  const t = useCallback(
    (key: TranslationKey, vars?: Vars) => {
      const raw = getByPath(dict, key);
      const s = typeof raw === "string" ? raw : key;
      return interpolate(s, vars);
    },
    [dict],
  );

  const value = useMemo<I18nContextValue>(() => ({ lang, setLang, t, dict }), [lang, setLang, t, dict]);

  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
