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
// Type scale for page headers (G37 kit round, 2026-10-16). Measured on the
// mockups at 393 points and converted to Plus Jakarta Sans (cap height 0.745 em);
// nothing below the 12px floor. The sm: sizes are the desktop layout (no mockup).
/** Display title, 28px: 02, 03, 05, 06 (mockup cap height 20.4-21.9 pt). */
export const titleDisplay = "text-[28px] font-semibold leading-[1.05] tracking-[-0.02em] text-brand-text text-balance sm:text-[32px]";
/** Page title, 24px: 01, 07, 08, 10, 12, 16 (cap 17.5-19.4 pt). */
export const titlePage = "text-2xl font-semibold leading-[1.05] tracking-[-0.02em] text-brand-text text-balance sm:text-[32px]";
/** Sub-page title, 22px: 09, 11, 14, 15, 20, 21, 22 (cap 15.4-17 pt). */
export const titleSub = "text-[22px] font-semibold leading-[1.05] tracking-[-0.02em] text-brand-text text-balance sm:text-[28px]";
/** Subtitle under a title, 12px (cap 8-9 pt; 15 and 20 draw it smaller, held at the floor). */
export const subtitle = "text-xs leading-[1.25] text-brand-text-muted sm:text-[15px] sm:leading-snug";
/** Lead line under a title, 14px: 01, 02, 03, 06 (cap 10.2-10.7 pt). */
export const lead = "text-sm leading-[1.3] text-brand-text-muted sm:text-[15px]";
/** The header row: 44px, the tap target (mockup header 44 pt, wordmark cap centre at its middle). */
export const appBar = "grid h-11 items-center";
/** Section heading, 14px weight 600, sentence case (cap 9-11 pt on 10, 12, 15, 20, 22). */
export const h2 = "text-sm font-semibold leading-tight text-brand-text sm:text-xl";
/** Page width and gutters: 16 / 24 / 32px (system.md §4). */
export const page = "mx-auto w-full max-w-[1200px] px-4 pb-12 sm:px-6 lg:px-8";
