// app/layout.tsx
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "./components/Header";
import { Providers } from "./providers";
import "./globals.css";

import { LANG_COOKIE, DEFAULT_LANG, parseLang } from "@/i18n/lang";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Portfolio App",
  description: "Web app de ferramentas para investimentos (B3), incluindo rebalanceamento.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const cookieLang = cookieStore.get(LANG_COOKIE)?.value;
  const initialLang = parseLang(cookieLang) ?? DEFAULT_LANG;

  return (
    <html lang={initialLang}suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] dark:bg-[radial-gradient(1200px_circle_at_20%_-10%,rgba(228,177,94,0.12),transparent_50%),radial-gradient(900px_circle_at_80%_0%,rgba(62,207,142,0.10),transparent_45%),var(--background)]">
        <Providers initialLang={initialLang}>
          <Header />
          <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
