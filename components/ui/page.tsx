"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { SHELL_COPY } from "@/components/shell/copy";

// Shared page pieces of the design system (docs/design/system.md §4-5).

// TD-50 (redesign): primary is a filled --brand-700 pill (a trailing → is
// added by the caller where the mockup has one); secondary an outline pill;
// ghost a text pill. 150ms colour transitions.
export const btnPrimary =
  "inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-brand-action bg-brand-action px-6 text-base font-semibold text-white transition-colors duration-fast hover:bg-brand-action-hover disabled:pointer-events-none disabled:border-brand-line disabled:bg-brand-paper disabled:text-brand-muted aria-disabled:border-brand-line aria-disabled:bg-brand-paper aria-disabled:text-brand-muted";
export const btnSecondary =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-brand-line bg-brand-surface px-[22px] text-[15px] font-semibold text-brand-ink transition-colors duration-fast hover:border-brand-700 hover:text-brand-700 disabled:pointer-events-none disabled:text-brand-muted aria-disabled:text-brand-muted";
export const textLink =
  "inline-flex min-h-11 items-center gap-1 font-semibold text-brand-forest underline-offset-4 hover:underline focus-visible:underline";
export const btnGhost =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold text-brand-700 transition-colors duration-fast hover:bg-brand-50";
/** White card: 1px --border, 16px corners, almost no shadow. */
export const card = "rounded-card border border-brand-border bg-brand-surface p-4 shadow-card sm:p-5";
/** Tinted card: --brand-100, no border. */
export const tintCard = "rounded-card bg-brand-100 p-4 sm:p-5";
/** Dark hero card: --brand-900, white text. */
export const heroCard = "relative overflow-hidden rounded-card bg-brand-900 p-5 text-white";
/** Eyebrow: 12px uppercase, tracked. */
export const eyebrow = "text-xs font-semibold uppercase tracking-[0.14em] text-brand-text-muted";
/** Section heading: 18–20px weight 600, sentence case. */
export const h2 = "text-lg font-semibold leading-tight text-brand-text sm:text-xl";
/** Page width and gutters: 16 / 24 / 32px (system.md §4). */
export const page = "mx-auto w-full max-w-[1200px] px-4 pb-12 sm:px-6 lg:px-8";

/** Page title. On phones the Account button sits top right (system.md §6). */
export function PageHeader({ title, kicker, intro, children, phoneCompact = false }: { title: string; kicker?: string; intro?: string; children?: React.ReactNode; phoneCompact?: boolean }) {
  // Account comes first in the DOM so the tab order reaches it before the page
  // content; `order` keeps it top right (flow review G03). phoneCompact: a
  // phone row above already has the title context and the Account button.
  return (
    <header className={`flex items-start justify-between gap-4 pb-6 ${phoneCompact ? "pt-2 lg:pt-12" : "pt-8 sm:pt-12"}`}>
      <div className={`order-2 ${phoneCompact ? "hidden" : ""}`}>
        <AccountButton />
      </div>
      <div className="order-1 min-w-0">
        <div className={phoneCompact ? "sr-only lg:not-sr-only" : undefined}>
          {kicker && <p className={`${eyebrow} mb-2`}>{kicker}</p>}
          <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-brand-text text-balance sm:text-[32px]">{title}</h1>
        </div>
        {intro && <p className="mt-3 max-w-prose text-brand-muted">{intro}</p>}
        {children}
      </div>
    </header>
  );
}

/** Signed out on a signed-in page: Sign in, and a way into a check (docs/design/map.md). */
export function SignedOutCard({ body }: { body: string }) {
  return (
    <EmptyState
      body={body}
      action={
        <div className="flex flex-wrap gap-3">
          <Link href="/account" className={btnPrimary}>
            {SHELL_COPY.signIn}
          </Link>
          <Link href="/skin-check" className={btnSecondary}>
            {SHELL_COPY.startCheck}
          </Link>
        </div>
      }
    />
  );
}

/** The phone header's Account button (system.md §6). Hidden from 640px, where the rail and side bar have Account. */
export function AccountButton() {
  const { user } = useAuth();
  const onAccount = (usePathname() ?? "").startsWith("/account");
  if (!user) return null;
  return (
    <Link
      href="/account"
      aria-label={SHELL_COPY.nav.account}
      aria-current={onAccount ? "page" : undefined}
      className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700 aria-[current=page]:ring-2 aria-[current=page]:ring-brand-700 sm:hidden"
    >
      <UserRound aria-hidden size={20} />
    </Link>
  );
}

/** Loading: content-shaped blocks, and the words for screen readers. */
export function LoadingState({ label, blocks = ["h-56", "h-28", "h-28"] }: { label: string; blocks?: string[] }) {
  return (
    <div role="status" className="flex flex-col gap-4 sm:gap-6">
      <span className="sr-only">{label}</span>
      {blocks.map((h, i) => (
        <div key={i} aria-hidden className={`${h} w-full animate-pulse rounded-card bg-brand-50 motion-reduce:animate-none`} />
      ))}
    </div>
  );
}

/** Empty: one sentence and one way on. */
export function EmptyState({ title, body, action }: { title?: string; body: string; action?: React.ReactNode }) {
  return (
    <div className={`${card} flex max-w-2xl flex-col items-start gap-4`}>
      {title && <h2 className={h2}>{title}</h2>}
      <p className="max-w-prose">{body}</p>
      {action}
    </div>
  );
}

/** Error: a plain sentence, no code, and one way on. */
export function ErrorState({ body, action }: { body: string; action?: React.ReactNode }) {
  return (
    <div role="alert" className={`${card} flex max-w-2xl flex-col items-start gap-4`}>
      <p className="flex items-start gap-2">
        <AlertCircle aria-hidden size={20} className="mt-0.5 shrink-0 text-brand-error" />
        <span>{body}</span>
      </p>
      {action}
    </div>
  );
}

/** A reload button for error states. */
export function ReloadButton({ label }: { label: string }) {
  return (
    <button type="button" className={btnSecondary} onClick={() => window.location.reload()}>
      {label}
    </button>
  );
}
