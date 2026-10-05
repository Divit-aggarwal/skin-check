// PREVIEW ONLY (G03 step 2): direction B, "Focused workspace". Not linked from the app.
import type { Viewport } from "next";
import { Bai_Jamjuree, Plus_Jakarta_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { Shell } from "@/components/preview/b/Shell";
import "./b.css";

const head = Bai_Jamjuree({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-b-head", display: "swap" });
const body = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-b-body", display: "swap" });

export const metadata = { robots: { index: false } };
// viewport-fit=cover makes env(safe-area-inset-*) real on phones with a home bar.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

export default function PreviewBLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className={`pb ${head.variable} ${body.variable}`}>
      <Shell>{children}</Shell>
    </div>
  );
}
