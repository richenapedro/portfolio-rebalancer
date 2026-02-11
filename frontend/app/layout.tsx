import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "./components/Header";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Portfolio App",
  description: "Web app de ferramentas para investimentos (B3), incluindo rebalanceamento.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] dark:bg-[radial-gradient(1200px_circle_at_20%_-10%,rgba(228,177,94,0.12),transparent_50%),radial-gradient(900px_circle_at_80%_0%,rgba(62,207,142,0.10),transparent_45%),var(--background)]">
        <Providers>
          <Header />
          <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
