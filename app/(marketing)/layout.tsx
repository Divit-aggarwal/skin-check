import { Space_Grotesk, Inter } from "next/font/google";
import { SkinCheckSessionProvider } from "@/lib/skin-check-session-context";
import "./home.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-home-display",
  weight: ["500", "600", "700"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-home-body",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`skin-home ${spaceGrotesk.variable} ${inter.variable}`}>
      <SkinCheckSessionProvider>{children}</SkinCheckSessionProvider>
    </div>
  );
}
