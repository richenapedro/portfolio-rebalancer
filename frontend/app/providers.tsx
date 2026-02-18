"use client";

import { ThemeProvider } from "next-themes";
import { I18nProvider } from "@/i18n/I18nProvider";
import type { Lang } from "@/i18n/dictionaries";

export function Providers(props: { children: React.ReactNode; initialLang: Lang }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <I18nProvider initialLang={props.initialLang}>{props.children}</I18nProvider>
    </ThemeProvider>
  );
}
