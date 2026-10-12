import type { Metadata, Viewport } from "next";
import { Bai_Jamjuree, Plus_Jakarta_Sans } from "next/font/google";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

// The store theme's fonts (docs/design/system.md §1): Bai Jamjuree headings,
// Plus Jakarta Sans body.
const display = Bai_Jamjuree({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700"],
});

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
  themeColor: "#1f473e", // the live site's theme-color
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${jakarta.variable}`}
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
