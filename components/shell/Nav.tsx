"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, Home, Layers, MessageCircle, Repeat, UserRound, type LucideIcon } from "lucide-react";
import { SHELL_COPY as S } from "./copy";
import { Wordmark } from "@/components/ui/kit";

// The app shell's navigation (docs/design/system.md §6): a bottom bar under
// 640px, an 88px rail from 640px, a 240px side bar from 1024px. Exactly one of
// the three is displayed at a time; each is its own <nav aria-label="Main">.

type Key = keyof typeof S.nav;
type Place = { key: Key; href: string; icon: LucideIcon; match: (path: string) => boolean };

const PLACES: Place[] = [
  { key: "home", href: "/dashboard", icon: Home, match: (p) => p === "/dashboard" },
  { key: "checks", href: "/checks", icon: Layers, match: (p) => p.startsWith("/checks") },
  { key: "newCheck", href: "/skin-check", icon: Camera, match: (p) => p.startsWith("/skin-check") },
  { key: "routine", href: "/routine", icon: Repeat, match: (p) => p.startsWith("/routine") },
  { key: "echo", href: "/echo", icon: MessageCircle, match: (p) => p.startsWith("/echo") },
];
const ACCOUNT: Place = { key: "account", href: "/account", icon: UserRound, match: (p) => p.startsWith("/account") };

export function Nav({ phoneLast4 }: { phoneLast4: string | null }) {
  const path = usePathname() ?? "";
  const current = (p: Place) => (p.match(path) ? ("page" as const) : undefined);
  const main = PLACES.filter((p) => p.key !== "newCheck");
  const newCheck = PLACES.find((p) => p.key === "newCheck")!;

  return (
    <>
      {/* Desktop side bar */}
      <nav aria-label={S.navLabel} className="fixed inset-y-0 left-0 z-30 hidden w-[240px] flex-col border-r border-brand-line bg-brand-paper px-4 py-6 lg:flex">
        <Link href="/dashboard" aria-label={S.brand} className="mb-8 flex min-h-11 items-center px-3">
          <Wordmark />
        </Link>
        <Link
          href={newCheck.href}
          aria-current={current(newCheck)}
          className="mb-6 flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand-action px-6 font-medium text-white hover:bg-brand-action-hover aria-[current=page]:ring-2 aria-[current=page]:ring-brand-forest aria-[current=page]:ring-offset-2"
        >
          <Camera aria-hidden size={18} />
          {S.nav.newCheck}
        </Link>
        <ul className="flex flex-col gap-1">
          {main.map((p) => (
            <li key={p.key}>
              <Link
                href={p.href}
                aria-current={current(p)}
                className="flex min-h-11 items-center gap-3 rounded-full px-4 font-medium text-brand-ink hover:bg-brand-linen aria-[current=page]:bg-brand-mist aria-[current=page]:text-brand-forest"
              >
                <p.icon aria-hidden size={20} />
                {S.nav[p.key]}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-auto border-t border-brand-line pt-4">
          <Link
            href={ACCOUNT.href}
            aria-current={current(ACCOUNT)}
            className="flex min-h-14 items-center gap-3 rounded-full px-3 hover:bg-brand-linen aria-[current=page]:bg-brand-mist"
          >
            <span className="grid size-9 place-items-center rounded-full bg-brand-linen">
              <UserRound aria-hidden size={18} />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-medium">{S.nav.account}</span>
              {phoneLast4 && <span className="text-sm text-brand-muted">{S.phoneEnding(phoneLast4)}</span>}
            </span>
          </Link>
        </div>
      </nav>

      {/* Tablet rail */}
      <nav aria-label={S.navLabel} className="fixed inset-y-0 left-0 z-30 hidden w-[88px] flex-col items-center gap-2 border-r border-brand-line bg-brand-paper py-6 sm:flex lg:hidden">
        {PLACES.map((p) => (
          <RailLink key={p.key} place={p} current={current(p)} primary={p.key === "newCheck"} />
        ))}
        <div className="mt-auto">
          <RailLink place={ACCOUNT} current={current(ACCOUNT)} />
        </div>
      </nav>

      {/* Phone bottom bar. Account is the round button in each page header. */}
      <nav
        aria-label={S.navLabel}
        data-bottom-nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-brand-border bg-brand-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        <ul className="mx-auto grid h-[68px] max-w-md grid-cols-5">
          {PLACES.map((p) => (
            <li key={p.key} className="flex">
              <Link
                href={p.href}
                aria-current={current(p)}
                className="group flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium text-brand-text-muted aria-[current=page]:font-semibold aria-[current=page]:text-brand-700"
              >
                {p.key === "newCheck" ? (
                  <>
                    {/* TD-50 (b): a raised camera circle; its name stays "New check" for screen readers. */}
                    <span className="-mt-7 grid size-16 place-items-center rounded-full border-4 border-brand-surface bg-brand-700 text-white shadow-card-md transition-colors duration-fast group-hover:bg-brand-900 group-aria-[current=page]:ring-2 group-aria-[current=page]:ring-brand-700 group-aria-[current=page]:ring-offset-2">
                      <p.icon aria-hidden size={26} />
                    </span>
                    <span className="sr-only">{S.nav[p.key]}</span>
                  </>
                ) : (
                  <>
                    <span className="grid h-7 w-12 place-items-center rounded-full">
                      <p.icon aria-hidden size={22} strokeWidth={2} className="group-aria-[current=page]:fill-brand-100" />
                    </span>
                    {S.nav[p.key]}
                  </>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

function RailLink({ place: p, current, primary }: { place: Place; current: "page" | undefined; primary?: boolean }) {
  return (
    <Link
      href={p.href}
      aria-current={current}
      className="group flex min-h-14 w-[76px] flex-col items-center justify-center gap-1 text-xs font-medium text-brand-muted aria-[current=page]:text-brand-forest"
    >
      <span
        className={
          primary
            ? "grid h-8 w-14 place-items-center rounded-full bg-brand-action text-white group-aria-[current=page]:ring-2 group-aria-[current=page]:ring-brand-forest group-aria-[current=page]:ring-offset-2"
            : "grid h-8 w-14 place-items-center rounded-full group-hover:bg-brand-linen group-aria-[current=page]:bg-brand-mist"
        }
      >
        <p.icon aria-hidden size={20} />
      </span>
      <span className={primary ? "text-brand-ink" : undefined}>{S.nav[p.key]}</span>
    </Link>
  );
}
