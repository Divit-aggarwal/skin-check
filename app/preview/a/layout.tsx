import { notFound } from "next/navigation";
import { Bai_Jamjuree, Plus_Jakarta_Sans } from "next/font/google";
import type { Viewport } from "next";
import { Nav } from "@/components/preview/a/Nav";
import { A_COPY as A } from "@/components/preview/a/copy";
import "./a.css";

const head = Bai_Jamjuree({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--a-font-head", display: "swap" });
const body = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--a-font-body", display: "swap" });

export const metadata = { robots: { index: false } };
export const viewport: Viewport = { viewportFit: "cover", themeColor: "#ffffff" };

export default function PreviewALayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className={`a-root ${head.variable} ${body.variable} min-h-dvh`}>
      <a
        href="#a-main"
        className="sr-only z-50 rounded-full bg-[var(--a-action)] px-6 py-3 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {A.skip}
      </a>
      <Nav />
      <main id="a-main" tabIndex={-1} className="pb-[var(--a-bar)] outline-none sm:pb-0 sm:pl-[88px] lg:pl-[240px]">
        {children}
      </main>
    </div>
  );
}
