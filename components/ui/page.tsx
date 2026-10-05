"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { SHELL_COPY } from "@/components/shell/copy";
import { Skeleton } from "./skeleton";

// Shared page pieces of the design system (docs/design/system.md §4-5).

export const btnPrimary =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand-action px-6 font-medium text-white hover:bg-brand-action-hover disabled:pointer-events-none disabled:bg-brand-linen2 disabled:text-brand-muted aria-disabled:bg-brand-linen2 aria-disabled:text-brand-muted sm:min-h-11";
export const btnSecondary =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-brand-ink bg-transparent px-6 font-medium text-brand-ink hover:bg-brand-linen disabled:pointer-events-none disabled:border-brand-line disabled:text-brand-muted aria-disabled:border-brand-line aria-disabled:text-brand-muted sm:min-h-11";
export const textLink =
  "inline-flex min-h-11 items-center gap-1 font-medium text-brand-forest underline-offset-4 hover:underline focus-visible:underline";
export const card = "rounded-2xl bg-brand-linen p-5 sm:p-6";
export const eyebrow = "text-xs font-semibold uppercase tracking-[0.06em] text-brand-muted";
export const h2 = "font-display text-xl font-semibold leading-tight sm:text-[22px]";
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
          <h1 className="font-display text-[28px] font-semibold leading-[1.15] tracking-tight sm:text-4xl">{title}</h1>
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
      className="grid size-11 shrink-0 place-items-center rounded-full border border-brand-line bg-brand-paper text-brand-ink aria-[current=page]:border-brand-forest aria-[current=page]:bg-brand-mist aria-[current=page]:text-brand-forest sm:hidden"
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
        <Skeleton key={i} aria-hidden className={`${h} w-full rounded-2xl bg-brand-linen2`} />
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
    <div role="alert" className="flex max-w-2xl flex-col items-start gap-4 rounded-2xl border border-brand-line p-5 sm:p-6">
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
