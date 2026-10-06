import { SkinCheckSessionProvider } from "@/lib/skin-check-session-context";
import { AppShell } from "@/components/shell/AppShell";

// Every page shares one shell (G03): navigation when signed in, a logo bar
// when signed out. Fonts and colours come from the root layout (store theme).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SkinCheckSessionProvider>
      <AppShell>{children}</AppShell>
    </SkinCheckSessionProvider>
  );
}
