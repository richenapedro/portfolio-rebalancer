"use client";

import { ThemeProvider } from "next-themes";
import { I18nProvider } from "@/i18n/I18nProvider";

export function Providers(props: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <I18nProvider>{props.children}</I18nProvider>
    </ThemeProvider>
  );
}
