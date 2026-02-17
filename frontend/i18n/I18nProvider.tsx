"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { dictionaries, type Dict, type Lang, type TranslationKey } from "./dictionaries";

const STORAGE_KEY = "portfolio-rebalancer.lang";
const DEFAULT_LANG: Lang = "pt-BR";

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

function readStoredLang(): Lang {
  if (typeof window === "undefined") return DEFAULT_LANG;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "en" || v === "pt-BR" ? v : DEFAULT_LANG;
}

type I18nContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey, vars?: Vars) => string;
  dict: Dict;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider(props: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => readStoredLang());
  const dict = dictionaries[lang];

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback(
    (key: TranslationKey, vars?: Vars) => {
      const raw = getByPath(dict, key);
      const s = typeof raw === "string" ? raw : key; // fallback: show key
      return interpolate(s, vars);
    },
    [dict],
  );

  const value = useMemo<I18nContextValue>(() => ({ lang, setLang, t, dict }), [lang, t, dict]);

  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
