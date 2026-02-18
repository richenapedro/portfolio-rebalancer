// frontend/i18n/lang.ts
import type { Lang } from "./dictionaries";

export const DEFAULT_LANG: Lang = "pt-BR";
export const LANG_COOKIE = "portfolio_rebalancer_lang";

export function isLang(v: unknown): v is Lang {
  return v === "pt-BR" || v === "en";
}

export function parseLang(v: unknown): Lang | null {
  return isLang(v) ? v : null;
}
