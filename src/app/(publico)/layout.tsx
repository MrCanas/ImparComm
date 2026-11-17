import type { Metadata } from "next";
import { Lato, Libre_Baskerville } from "next/font/google";

const baskerville = Libre_Baskerville({ subsets: ["latin"], weight: ["400"], variable: "--font-titulo" });
const lato = Lato({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-cuerpo" });

export const metadata: Metadata = {
  title: { absolute: "Impar Capital" },
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

/** Páginas públicas de eventos: sin la cabecera de la app; marca Impar (Baskerville + Lato). */
export default function PublicoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${baskerville.variable} ${lato.variable} flex min-h-dvh flex-col bg-[#F5F5F5] text-[#2C2C2C]`} style={{ fontFamily: "var(--font-cuerpo), Lato, Helvetica, Arial, sans-serif" }}>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8 sm:py-12">{children}</main>
      <footer className="px-4 pb-8 text-center text-xs text-[#8A8A8A]">Impar Capital · Madrid</footer>
    </div>
  );
}
