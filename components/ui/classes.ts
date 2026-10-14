// Shared class strings (docs/design/system.md, TD-50). A plain module, not
// "use client": a server page that imports them gets the strings themselves
// (kit request batch 1; lane C found that client-module exports arrive in a
// server component as references, so the classes did not apply).

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
