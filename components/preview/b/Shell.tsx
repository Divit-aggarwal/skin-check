"use client";
// PREVIEW ONLY (direction B). One nav, three shapes (system.md §6):
// bottom bar under 640px, 88px rail from 640px, dark 240px side bar from 1024px.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, House, MessageCircle, Rows3, SquareCheckBig, UserRound, type LucideIcon } from "lucide-react";
import { clsx } from "clsx";
import { B_COPY as B } from "./copy";
import { ACCOUNT_HREF, BASE, CHECKS_HREF, ECHO_HREF, NEW_CHECK_HREF, ROUTINE_HREF } from "./links";

type Id = keyof typeof B.nav;
const ITEMS: { id: Exclude<Id, "label">; href: string; icon: LucideIcon }[] = [
  { id: "home", href: BASE, icon: House },
  { id: "checks", href: CHECKS_HREF, icon: Rows3 },
  { id: "newCheck", href: NEW_CHECK_HREF, icon: Camera },
  { id: "routine", href: ROUTINE_HREF, icon: SquareCheckBig },
  { id: "echo", href: ECHO_HREF, icon: MessageCircle },
  { id: "account", href: ACCOUNT_HREF, icon: UserRound },
];
const LAST4 = "4821";

function currentOf(path: string): Id | null {
  if (path === BASE) return "home";
  if (path.startsWith(CHECKS_HREF)) return "checks";
  if (path.startsWith(ECHO_HREF)) return "echo";
  return null;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const current = currentOf(usePathname() ?? "");
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-[var(--action)] px-5 py-3 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {B.skip}
      </a>
      <nav
        aria-label={B.nav.label}
        className="b-side fixed inset-x-0 bottom-0 z-30 border-t bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-18px_50px_rgba(20,20,15,0.06)] sm:inset-y-0 sm:left-0 sm:right-auto sm:flex sm:w-[88px] sm:flex-col sm:border-r sm:border-t-0 sm:pb-0 sm:shadow-none lg:w-60 lg:border-r-0 lg:bg-[var(--action)] lg:text-white"
      >
        <p className="b-brand hidden px-6 pb-2 pt-7 text-[18px] lg:block">{B.brand}</p>
        <ul className="grid h-16 grid-cols-5 sm:flex sm:h-auto sm:flex-1 sm:flex-col sm:gap-1 sm:px-2 sm:py-4 lg:px-3 lg:pt-4">
          {ITEMS.map(({ id, href, icon: Icon }) => {
            const active = current === id;
            const isNew = id === "newCheck";
            const isAccount = id === "account";
            return (
              <li
                key={id}
                className={clsx(isAccount && "hidden sm:mt-auto sm:block lg:border-t lg:border-white/15 lg:pt-3", isNew && "lg:order-first lg:mb-4")}
              >
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "group flex h-16 flex-col items-center justify-center gap-1 text-[12px] font-medium transition-colors duration-150",
                    "sm:mx-auto sm:h-[68px] sm:w-[72px] sm:rounded-2xl",
                    "lg:mx-0 lg:h-11 lg:w-full lg:flex-row lg:justify-start lg:gap-3 lg:rounded-full lg:px-4 lg:text-[14px]",
                    active ? "text-[var(--forest)] sm:bg-[var(--mist)]" : "text-[var(--muted)] hover:text-[var(--ink)] sm:hover:bg-[var(--surface)]",
                    active ? "lg:text-[var(--forest)]" : "lg:text-white/80 lg:hover:bg-white/10 lg:hover:text-white",
                    isNew && "lg:justify-center lg:!bg-white lg:!text-[var(--ink)] lg:hover:!bg-[var(--surface)]",
                    isAccount && "lg:h-auto lg:min-h-[52px] lg:py-2"
                  )}
                >
                  <span
                    className={clsx(
                      "flex items-center justify-center",
                      isNew
                        ? "h-9 w-9 rounded-full bg-[var(--action)] text-white sm:h-8 sm:w-8 lg:h-auto lg:w-auto lg:bg-transparent lg:text-[var(--ink)]"
                        : clsx("h-8 w-14 rounded-full sm:h-auto sm:w-auto lg:h-auto lg:w-auto", active && "bg-[var(--mist)] sm:bg-transparent")
                    )}
                    aria-hidden
                  >
                    <Icon size={isNew ? 18 : 20} strokeWidth={1.75} />
                  </span>
                  {isAccount ? (
                    <span className="flex flex-col items-center leading-tight lg:items-start">
                      <span>{B.nav.account}</span>
                      <span className="hidden text-[12px] font-normal text-white/70 lg:block">{B.account.phoneEnding(LAST4)}</span>
                    </span>
                  ) : (
                    <span className="leading-tight">{B.nav[id]}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <main
        id="main"
        tabIndex={-1}
        className={clsx(current === "echo" ? "pb-[var(--nav-h)]" : "pb-[calc(var(--nav-h)+24px)]", "focus:outline-none sm:pb-0 sm:pl-[88px] lg:pl-60")}
      >
        {children}
      </main>
    </>
  );
}

/** Phone only: Account is a round button in the page header (system.md §6). */
export function AccountButton() {
  return (
    <Link
      href={ACCOUNT_HREF}
      aria-label={B.account.open}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-white text-[var(--ink)] sm:hidden"
    >
      <UserRound size={20} strokeWidth={1.75} aria-hidden />
    </Link>
  );
}
