"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Nav } from "./Nav";
import { Wordmark } from "@/components/ui/kit";
import { SHELL_COPY as S } from "./copy";

// One shell for every page (G03, docs/design/map.md). Signed in: the main
// navigation. Signed out: a top bar with the logo and Sign in. While Firebase
// Auth has not answered yet, only the logo bar, so nothing jumps.
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const path = usePathname() ?? "";
  const phone = user?.phoneNumber ?? "";

  return (
    // data-nav: the side bar shows the wordmark from 1024px, so page headers hide theirs (polish lane #8).
    <div data-nav={user ? "" : undefined} className="group/shell min-h-dvh bg-brand-linen text-brand-ink">
      <a
        href="#content"
        className="sr-only z-50 rounded-full bg-brand-action px-6 py-3 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {S.skip}
      </a>
      {user ? (
        <Nav phoneLast4={phone.length >= 4 ? phone.slice(-4) : null} />
      ) : (
        <header className="border-b border-brand-line">
          <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link href="/skin-check" aria-label={S.brand} className="flex min-h-11 items-center">
              <Wordmark />
            </Link>
            {user === null && !path.startsWith("/account") && (
              <Link href="/account" className="-mr-4 flex min-h-11 items-center rounded-full px-4 font-medium text-brand-forest hover:bg-brand-mist">
                {S.signIn}
              </Link>
            )}
          </div>
        </header>
      )}
      <div
        id="content"
        tabIndex={-1}
        className={user ? "pb-[calc(68px+env(safe-area-inset-bottom))] outline-none sm:pb-0 sm:pl-[88px] lg:pl-[240px]" : "outline-none"}
      >
        {children}
      </div>
    </div>
  );
}
