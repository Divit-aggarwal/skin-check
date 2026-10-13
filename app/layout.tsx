import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

// One sans for the whole app (redesign 2026-10-14, docs/lanes/redesign-report.md).
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "The Project SKIN — Your Skin Digital Twin",
  description:
    // Neutral (D-12): no claim that a routine or product works.
    "Science-led skincare guidance built around your skin. Get a visual reading of your skin and keep a record of your own routine.",
  keywords: ["skincare", "skin analysis", "digital twin", "Indian skincare", "Benotia"],
  authors: [{ name: "The Project SKIN" }],
  manifest: "/manifest.json",
  // TD-47: iPhone home-screen icon (web push on iOS needs the site on the home screen).
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "The Project SKIN",
  },
  openGraph: {
    title: "The Project SKIN — Your Skin Digital Twin",
    description: "Science-led skincare guidance built around your skin.",
    type: "website",
    locale: "en_IN",
  },
};

// TD-25 (6): pinch-to-zoom stays on (WCAG 1.4.4): no zoom limit is set here.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0B4A3E", // --brand-700
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={jakarta.variable}
      suppressHydrationWarning
    >
      <body className="bg-brand-linen font-body text-text antialiased">
        {/* The store theme is light only (system.md); no dark variant is designed. */}
        <ThemeProvider attribute="class" forcedTheme="light">
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
