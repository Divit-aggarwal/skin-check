"use client";
// PREVIEW ONLY (direction A). The app shell's navigation (system.md §6):
// bottom bar under 640px, 88px rail from 640px, 240px side bar from 1024px.
// Only one of the three is displayed at a time.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, Home, Layers, MessageCircle, Repeat, UserRound, type LucideIcon } from "lucide-react";
import { A_COPY as A } from "./copy";

type Place = { key: keyof typeof A.nav; href: string; icon: LucideIcon; match?: (p: string) => boolean };
const P = "/preview/a";
const PLACES: Place[] = [
  { key: "home", href: P, icon: Home, match: (p) => p === P },
  { key: "checks", href: `${P}/checks`, icon: Layers, match: (p) => p.startsWith(`${P}/checks`) },
  { key: "newCheck", href: "#", icon: Camera },
  { key: "routine", href: "#", icon: Repeat },
  { key: "echo", href: `${P}/echo`, icon: MessageCircle, match: (p) => p.startsWith(`${P}/echo`) },
];
const ACCOUNT: Place = { key: "account", href: "#", icon: UserRound };

function useCurrent() {
  const path = usePathname() ?? "";
  return (p: Place) => (p.match?.(path) ? ("page" as const) : undefined);
}

export function Nav() {
  const current = useCurrent();
  const main = PLACES.filter((p) => p.key !== "newCheck");
  return (
    <>
      {/* Desktop side bar */}
      <nav
        aria-label={A.nav.label}
        className="fixed inset-y-0 left-0 z-30 hidden w-[240px] flex-col border-r bg-[var(--a-paper)] px-4 py-6 lg:flex"
      >
        <Link href={P} className="a-head mb-8 px-3 text-[22px] font-semibold tracking-tight">
          {A.brand}
        </Link>
        <Link
          href="#"
          className="mb-6 flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[var(--a-action)] px-6 font-medium text-white hover:bg-[var(--a-action-hover)]"
        >
          <Camera aria-hidden size={18} />
          {A.nav.newCheck}
        </Link>
        <ul className="flex flex-col gap-1">
          {main.map((p) => (
            <li key={p.key}>
              <SideLink place={p} current={current(p)} />
            </li>
          ))}
        </ul>
        <div className="mt-auto border-t pt-4">
          <Link
            href={ACCOUNT.href}
            className="flex min-h-[56px] items-center gap-3 rounded-full px-3 hover:bg-[var(--a-linen)]"
          >
            <span className="grid size-9 place-items-center rounded-full bg-[var(--a-linen)]">
              <UserRound aria-hidden size={18} />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-medium">{A.nav.account}</span>
              <span className="text-[14px] text-[var(--a-muted)]">{A.nav.accountPhone}</span>
            </span>
          </Link>
        </div>
      </nav>

      {/* Tablet rail */}
      <nav
        aria-label={A.nav.label}
        className="fixed inset-y-0 left-0 z-30 hidden w-[88px] flex-col items-center gap-2 border-r bg-[var(--a-paper)] py-6 sm:flex lg:hidden"
      >
        {PLACES.map((p) => (
          <RailLink key={p.key} place={p} current={current(p)} primary={p.key === "newCheck"} />
        ))}
        <div className="mt-auto">
          <RailLink place={ACCOUNT} current={current(ACCOUNT)} />
        </div>
      </nav>

      {/* Phone bottom bar */}
      <nav
        aria-label={A.nav.label}
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-[var(--a-paper)] pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(20,20,15,0.06)] sm:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-md grid-cols-5">
          {PLACES.map((p) => (
            <li key={p.key} className="flex">
              {p.key === "newCheck" ? (
                <Link href={p.href} className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[12px] font-medium">
                  <span className="grid size-10 place-items-center rounded-full bg-[var(--a-action)] text-white">
                    <p.icon aria-hidden size={20} />
                  </span>
                  <span className="sr-only">{A.nav[p.key]}</span>
                </Link>
              ) : (
                <Link
                  href={p.href}
                  aria-current={current(p)}
                  className="group flex flex-1 flex-col items-center justify-center gap-1 text-[12px] font-medium text-[var(--a-muted)] aria-[current=page]:text-[var(--a-forest)]"
                >
                  <span className="grid h-7 w-12 place-items-center rounded-full group-aria-[current=page]:bg-[var(--a-mist)]">
                    <p.icon aria-hidden size={20} />
                  </span>
                  {A.nav[p.key]}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

function SideLink({ place: p, current }: { place: Place; current?: "page" | undefined }) {
  return (
    <Link
      href={p.href}
      aria-current={current}
      className="flex min-h-[44px] items-center gap-3 rounded-full px-4 font-medium text-[var(--a-ink)] hover:bg-[var(--a-linen)] aria-[current=page]:bg-[var(--a-mist)] aria-[current=page]:text-[var(--a-forest)]"
    >
      <p.icon aria-hidden size={20} />
      {A.nav[p.key]}
    </Link>
  );
}

function RailLink({ place: p, current, primary }: { place: Place; current?: "page" | undefined; primary?: boolean }) {
  return (
    <Link
      href={p.href}
      aria-current={current}
      className="group flex min-h-[56px] w-[76px] flex-col items-center justify-center gap-1 text-[12px] font-medium text-[var(--a-muted)] aria-[current=page]:text-[var(--a-forest)]"
    >
      <span
        className={
          primary
            ? "grid h-8 w-14 place-items-center rounded-full bg-[var(--a-action)] text-white"
            : "grid h-8 w-14 place-items-center rounded-full group-hover:bg-[var(--a-linen)] group-aria-[current=page]:bg-[var(--a-mist)]"
        }
      >
        <p.icon aria-hidden size={20} />
      </span>
      <span className={primary ? "text-[var(--a-ink)]" : undefined}>{A.nav[p.key]}</span>
    </Link>
  );
}
