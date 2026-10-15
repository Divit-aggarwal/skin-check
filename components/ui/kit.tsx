"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ArrowRight, Dot, Hand, Package, Pipette, ShowerHead, Sun, ArrowUp, Check, ChevronLeft, ChevronRight, CircleDot, Contrast, Droplet, Flame, Waves, Angry, Droplets, Frown, Laugh, Meh, Smile, Zap, type LucideIcon } from "lucide-react";
import type { ChangeSlot as ChangeSlotData } from "@/lib/feature-contracts/readings-series";
import type { CheckinQuestion } from "@/lib/feature-contracts/checkin";
import { cn } from "@/lib/utils";
import { card, heroCard, tintCard } from "./classes";

// The redesign kit (TD-50, docs/lanes/redesign-report.md). Pieces that page.tsx
// does not already have. Every piece here renders only what it is given: no
// sample numbers, no change words, no better/worse colours. Over time (TD-54):
// LevelTimeline draws the stored level of each check, PhotoStrip the user's own
// photos, and ChangeSlot a change value only when the comparability gate has
// opened it (lib/contracts/readings-series.ts); otherwise "needs more checks".

/* ─── Header ─────────────────────────────────────────────────────────── */

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn("text-[13px] font-medium uppercase tracking-[0.35em] text-brand-text", className)}>Project Skin</span>;
}

/** Back (link or history), centred wordmark, optional right action. */
export function AppHeader({ back, right, backLabel = "Back", backDisabled }: { back?: string | true | (() => void) | undefined; right?: React.ReactNode | undefined; backLabel?: string; backDisabled?: boolean | undefined }) {
  // back: a link, true (browser history) or a function (kit request B1). backDisabled keeps the
  // button in the tree, disabled and invisible, so nothing shifts (B1).
  const router = useRouter();
  const cls = "grid size-11 place-items-center rounded-full text-brand-text hover:bg-brand-50";
  const icon = <ChevronLeft aria-hidden size={22} />;
  return (
    <header className="grid h-14 grid-cols-[44px_1fr_44px] items-center">
      {back === true || typeof back === "function" ? (
        <button type="button" aria-label={backLabel} disabled={backDisabled} onClick={() => (back === true ? router.back() : back())} className={cn(cls, backDisabled && "invisible")}>{icon}</button>
      ) : back ? (
        <Link href={back} aria-label={backLabel} className={cls}>{icon}</Link>
      ) : (
        <span />
      )}
      {/* The trailing letter-space would push the word off centre. */}
      <Wordmark className="justify-self-center pl-[0.35em]" />
      <div className="justify-self-end">{right}</div>
    </header>
  );
}

/* ─── Cards ──────────────────────────────────────────────────────────── */

export function IconWell({ icon: Icon, className, size = 40 }: { icon: LucideIcon; className?: string | undefined; size?: number }) {
  return (
    <span aria-hidden style={{ width: size, height: size }} className={cn("grid shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700", className)}>
      <Icon size={Math.round(size / 2)} />
    </span>
  );
}

/** Row card: icon well, title, body, chevron. A link when href is given. */
export function TintCard({ icon, title, body, href, tinted = true, className }: { icon?: LucideIcon | undefined; title: React.ReactNode; body?: React.ReactNode | undefined; href?: string | undefined; tinted?: boolean | undefined; className?: string }) {
  const inner = (
    <>
      {icon && <IconWell icon={icon} className={tinted ? "bg-brand-surface" : undefined} />}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-brand-text">{title}</span>
        {body && <span className="mt-0.5 block text-sm text-brand-text-muted">{body}</span>}
      </span>
      {href && <ChevronRight aria-hidden size={20} className="shrink-0 text-brand-text-muted" />}
    </>
  );
  const cls = cn(tinted ? tintCard : card, "flex items-center gap-3", href && "transition-colors duration-fast hover:bg-brand-50", className);
  return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

/** Dark hero: eyebrow, title, meta line, one action; media (real product photo only) on the right. */
export function HeroCard({ eyebrow, title, meta, action, media }: { eyebrow?: string | undefined; title: React.ReactNode; meta?: React.ReactNode | undefined; action?: React.ReactNode | undefined; media?: React.ReactNode }) {
  return (
    <div className={cn(heroCard, "flex items-end gap-3")}>
      <div className="relative z-10 min-w-0 flex-1">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/80">{eyebrow}</p>}
        <p className="mt-2 text-2xl font-semibold leading-tight">{title}</p>
        {meta && <p className="mt-1 text-[15px] text-white/85">{meta}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
      {media && <div className="w-[38%] shrink-0">{media}</div>}
    </div>
  );
}

/** The white pill used on a dark hero. */
export const btnOnDark =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-base font-semibold text-brand-700 transition-colors duration-fast hover:bg-brand-50";

/** Trailing arrow for primary pills. */
export const Arrow = () => <ArrowRight aria-hidden size={18} />;

/* ─── Readings ───────────────────────────────────────────────────────── */

/** The five shown readings (METRIC_LABELS keys in lib/skin-check-skus.ts; Dryness is never shown). */
export type Reading = "redness" | "oiliness" | "texture" | "blemishes" | "pigment";

/** TD-50 (c): identity colour on the icon only. Class names written out for Tailwind. */
export const READING_ICON: Record<Reading, { icon: LucideIcon; well: string }> = {
  redness: { icon: Flame, well: "bg-concern-redness-soft text-concern-redness" },
  oiliness: { icon: Droplet, well: "bg-concern-oiliness-soft text-concern-oiliness" },
  texture: { icon: Waves, well: "bg-concern-texture-soft text-concern-texture" },
  blemishes: { icon: CircleDot, well: "bg-concern-blemishes-soft text-concern-blemishes" },
  pigment: { icon: Contrast, well: "bg-concern-pigment-soft text-concern-pigment" },
};

/**
 * One reading: icon in its identity well, label, the level word as plain text,
 * optional tag ("early estimate") and context line (area, date). `footer` is
 * the slot for anything a later decision allows; nothing fills it today.
 */
export function MetricTile({ reading, label, level, tag, context, footer, href }: { reading: Reading; label: string; level: string; tag?: string | undefined; context?: string | undefined; footer?: React.ReactNode ; href?: string | undefined }) {
  // href: the whole tile opens that page (kit request A2).
  const { icon, well } = READING_ICON[reading];
  const tile = (
    <div className={cn(card, "flex h-full flex-col gap-2 p-4 sm:p-4", href && "transition-colors duration-fast hover:bg-brand-50")}>
      <div className="flex items-center gap-2">
        <IconWell icon={icon} size={32} className={well} />
        <span className="text-sm font-medium text-brand-text-muted">{label}</span>
      </div>
      <p className="text-xl font-semibold text-brand-text">{level}</p>
      {(tag || context) && (
        <p className="text-xs text-brand-text-muted">
          {tag && <span className="mr-2 rounded-full bg-brand-50 px-2 py-0.5">{tag}</span>}
          {context}
        </p>
      )}
      {footer}
    </div>
  );
  return href ? <Link href={href} className="block h-full rounded-card">{tile}</Link> : tile;
}

/** Icon, title, description, optional trailing slot. No status pill (TD-47(4)). */
export function InsightRow({ icon, title, body, trailing }: { icon: LucideIcon; title: string; body?: string | undefined; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <IconWell icon={icon} size={36} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-brand-text">{title}</p>
        {body && <p className="mt-0.5 text-sm text-brand-text-muted">{body}</p>}
      </div>
      {trailing}
    </div>
  );
}

/* ─── Choices and navigation within a page ───────────────────────────── */

/** A toggle chip. Selected = brand tint and brand text, not colour alone (a check is shown). */
export function Chip({ selected, onClick, children }: { selected?: boolean | undefined; onClick?: () => void | undefined; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-brand-border bg-brand-surface px-4 text-sm font-medium text-brand-text transition-colors duration-fast aria-pressed:border-transparent aria-pressed:bg-brand-100 aria-pressed:text-brand-700"
    >
      {selected && <Check aria-hidden size={16} />}
      {children}
    </button>
  );
}

/** Pill-filled single choice (4W / 8W …, Morning / Evening). */
export function SegmentedControl<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-brand-50 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className="min-h-11 flex-1 rounded-full px-3 text-sm font-semibold text-brand-text-muted transition-colors duration-fast aria-checked:bg-brand-700 aria-checked:text-white"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Page tabs as links (each tab is a URL, so Back works). Scrolls sideways on narrow phones. */
export function TabBar({ label, tabs, current }: { label: string; tabs: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
      <ul className="flex gap-2">
        {tabs.map((t) => (
          <li key={t.key}>
            <Link
              href={t.href}
              aria-current={t.key === current ? "page" : undefined}
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold text-brand-text-muted transition-colors duration-fast hover:bg-brand-50 aria-[current=page]:bg-brand-700 aria-[current=page]:text-white"
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Check-in options as a grid of large tiles (emoji or a real image). */
export function ChoiceGrid<T extends string>({ label, options, value, onChange, multiple = false, columns = 2 }: { label: string; options: { value: T; label: string; emoji?: string | undefined; image?: string }[]; value: T[]; onChange: (v: T[]) => void; multiple?: boolean | undefined; columns?: 2 | 3 }) {
  const toggle = (v: T) => onChange(multiple ? (value.includes(v) ? value.filter((x) => x !== v) : [...value, v]) : [v]);
  return (
    <div role={multiple ? "group" : "radiogroup"} aria-label={label} className={cn("grid gap-3", columns === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={on}
            onClick={() => toggle(o.value)}
            className="relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-card border border-brand-border bg-brand-surface p-3 text-center text-sm font-medium text-brand-text transition-colors duration-fast aria-checked:border-brand-700 aria-checked:bg-brand-50"
          >
            {o.image ? <img src={o.image} alt="" className="size-12 rounded-tile object-cover" /> : o.emoji ? <span aria-hidden className="text-2xl">{o.emoji}</span> : null}
            {o.label}
            {on && (
              <span aria-hidden className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-brand-700 text-white">
                <Check size={12} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Numbered steps joined by a line; done steps show a check. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-start">
      {steps.map((s, i) => {
        const done = i < current;
        return (
          <li key={s} aria-current={i === current ? "step" : undefined} className="relative flex flex-1 flex-col items-center gap-1 text-xs font-medium text-brand-text-muted aria-[current=step]:text-brand-700">
            {i > 0 && <span aria-hidden className={cn("absolute right-1/2 top-4 h-0.5 w-full -translate-x-4", i <= current ? "bg-brand-700" : "bg-brand-border")} />}
            <span className={cn("relative z-10 grid size-8 place-items-center rounded-full border-2 text-sm font-semibold", done ? "border-brand-700 bg-brand-700 text-white" : i === current ? "border-brand-700 bg-brand-surface text-brand-700" : "border-brand-border bg-brand-surface")}>
              {done ? <Check aria-hidden size={16} /> : i + 1}
            </span>
            <span>
              {s}
              {done && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ─── Rows ───────────────────────────────────────────────────────────── */

/** Routine step status. "unknown" (Not logged) and "skipped" are different states and look different. */
export type StepStatus = "used" | "skipped" | "unknown";

/** Number badge, optional product photo, name, subtitle, optional chip, description, status, chevron. */
export function StepRow({ n, name, subtitle, chip, description, image, media, status, statusLabel, href, action }: { n: number; name: string; subtitle?: string | undefined; chip?: string | undefined; description?: string | undefined; image?: string | undefined; media?: React.ReactNode; status?: StepStatus | undefined; statusLabel?: string | undefined; href?: string | undefined; action?: React.ReactNode }) {
  const body = (
    <>
      <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">{n}</span>
      {media ?? (image && <img src={image} alt="" className="size-14 shrink-0 rounded-tile bg-brand-50 object-cover" />)}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-brand-text">{name}</span>
          {chip && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-text-muted">{chip}</span>}
        </span>
        {subtitle && <span className="block text-sm text-brand-text-muted">{subtitle}</span>}
        {description && <span className="mt-1 block text-sm text-brand-text">{description}</span>}
      </span>
      {status && <StatusMark status={status} label={statusLabel} />}
      {href && <ChevronRight aria-hidden size={20} className="shrink-0 text-brand-text-muted" />}
    </>
  );
  const cls = cn(card, "flex items-center gap-3 p-4 sm:p-4");
  return (
    <div className="flex flex-col gap-2">
      {href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}
      {action}
    </div>
  );
}

/** Done: filled check. Skipped: outlined with a dash. Not logged: empty dashed circle. Each has words for screen readers. */
export function StatusMark({ status, label }: { status: StepStatus; label?: string | undefined }) {
  const words = label ?? { used: "Done", skipped: "Skipped", unknown: "Not logged" }[status];
  return (
    <span className="flex shrink-0 items-center" title={words}>
      <span className="sr-only">{words}</span>
      {status === "used" ? (
        <span aria-hidden className="grid size-7 place-items-center rounded-full bg-brand-700 text-white"><Check size={16} /></span>
      ) : status === "skipped" ? (
        <span aria-hidden className="grid size-7 place-items-center rounded-full border-2 border-brand-text-muted text-brand-text-muted"><span className="h-0.5 w-3 bg-current" /></span>
      ) : (
        <span aria-hidden className="size-7 rounded-full border-2 border-dashed border-brand-border" />
      )}
    </span>
  );
}

/** A switch. Busy keeps it focusable (aria-disabled), as the rest of the app does. */
export function ToggleRow({ label, description, checked, onChange, busy, disabled, icon, iconClassName, trailing }: { label: string; description?: string | undefined; checked: boolean; onChange: (v: boolean) => void; busy?: boolean; disabled?: boolean; icon?: LucideIcon | undefined; iconClassName?: string | undefined; trailing?: React.ReactNode }) {
  // icon, trailing (G37): screens 20 and 22 put an icon well before the text and a time chip before the switch.
  // disabled: a switch whose backend does not exist yet (kit request E1). Focusable, never changes.
  const id = useId();
  const off = busy || disabled;
  return (
    <div className="flex items-start gap-3 py-3">
      {icon && <IconWell icon={icon} size={36} className={iconClassName} />}
      <div className="min-w-0 flex-1">
        <p id={`${id}-l`} className="font-medium text-brand-text">{label}</p>
        {description && <p id={`${id}-d`} className="mt-0.5 text-sm text-brand-text-muted">{description}</p>}
      </div>
      {trailing}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={description ? `${id}-d` : undefined}
        aria-disabled={off || undefined}
        onClick={() => !off && onChange(!checked)}
        className="relative h-11 w-14 shrink-0"
      >
        <span aria-hidden className={cn("absolute inset-x-0 top-1/2 h-7 -translate-y-1/2 rounded-full transition-colors duration-fast", checked ? "bg-brand-700" : "bg-brand-border", off && "opacity-60")} />
        <span aria-hidden className={cn("absolute top-1/2 size-6 -translate-y-1/2 rounded-full bg-white shadow-card transition-[left] duration-fast", checked ? "left-[calc(100%-1.625rem)]" : "left-0.5")} />
      </button>
    </div>
  );
}

/** Icon, label, value, chevron. A link, a button, or plain. */
export function SettingsRow({ icon, label, value, href, onClick, danger, disabled }: { icon?: LucideIcon | undefined; label: string; value?: string | undefined; href?: string | undefined; onClick?: () => void | undefined; danger?: boolean; disabled?: boolean }) {
  // disabled: a row that is not available yet (kit request E2): dimmed, not a link or button.
  if (disabled) ({ href, onClick } = { href: undefined, onClick: undefined });
  const inner = (
    <>
      {icon && <IconWell icon={icon} size={36} className={danger ? "bg-brand-error-soft text-brand-error" : undefined} />}
      <span className={cn("min-w-0 flex-1 text-left font-medium", danger ? "text-brand-error" : "text-brand-text")}>{label}</span>
      {value && <span className="text-sm text-brand-text-muted">{value}</span>}
      {(href || onClick) && <ChevronRight aria-hidden size={20} className="shrink-0 text-brand-text-muted" />}
    </>
  );
  const cls = cn("flex min-h-14 w-full items-center gap-3 py-2", disabled && "opacity-60");
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

/* ─── Media ──────────────────────────────────────────────────────────── */

// E20: the catalogue has no product photos, so a product shows as a neutral
// 12px tile with its step's icon, never a stock image (kit request C1, from
// lane C). Step icons are not the reading icons. Keys cover the routine's step
// names ("serum") and Echo's ("treat", "spot").
const STEP_ICON: Record<string, LucideIcon> = { cleanse: ShowerHead, serum: Pipette, treat: Pipette, moisturise: Hand, protect: Sun, spot: Dot };

export function ProductTile({ step, size = 56, className }: { step: string | null | undefined; size?: number; className?: string | undefined }) {
  const Icon = (step && STEP_ICON[step]) || Package;
  return (
    <span aria-hidden style={{ width: size, height: size }} className={cn("grid shrink-0 place-items-center rounded-tile bg-brand-50 text-brand-700", className)}>
      <Icon size={Math.round(size * 0.42)} strokeWidth={1.75} />
    </span>
  );
}

/** The user's own photo with a label pill ("Today", a date) and an optional check. */
export function PhotoTile({ src, alt, label, checked, className, fallback }: { src: string; alt: string; label?: string | undefined; checked?: boolean | undefined; className?: string ; fallback?: string | undefined }) {
  // Kit request A1: never sends a referrer (kept photos are short-lived signed links) and shows
  // the fallback text when the image cannot be loaded.
  const [failed, setFailed] = useState(false);
  return (
    <figure className={cn("relative overflow-hidden rounded-tile bg-brand-50", className)}>
      {failed ? (
        <div role="img" aria-label={alt} className="grid aspect-[3/4] w-full place-items-center p-3 text-center text-sm text-brand-text-muted">{fallback ?? alt}</div>
      ) : (
        <img src={src} alt={alt} referrerPolicy="no-referrer" onError={() => setFailed(true)} className="aspect-[3/4] w-full object-cover" />
      )}
      {label && <figcaption className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-brand-text">{label}</figcaption>}
      {checked && (
        <span aria-hidden className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-brand-700 text-white">
          <Check size={14} />
        </span>
      )}
    </figure>
  );
}

/** done / total as a ring, with the numbers as text next to it (the ring is decoration). */
export function ProgressRing({ done, total, label, size = 72 }: { done: number; total: number; label: string; size?: number }) {
  const r = 15.5;
  const c = 2 * Math.PI * r;
  const part = total > 0 ? Math.min(done / total, 1) : 0;
  return (
    <div className="flex items-center gap-3">
      <svg aria-hidden width={size} height={size} viewBox="0 0 36 36" className="-rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" className="stroke-brand-100" />
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${part * c} ${c}`} className="stroke-brand-700 transition-[stroke-dasharray] duration-base" />
      </svg>
      <p>
        <span className="block text-2xl font-semibold text-brand-text">
          {done} / {total}
        </span>
        <span className="text-sm text-brand-text-muted">{label}</span>
      </p>
    </div>
  );
}

/* ─── Echo ───────────────────────────────────────────────────────────── */

/** User: green, right. Echo: white, left, with its mark. */
export function ChatBubble({ from, avatar, children }: { from: "user" | "echo"; avatar?: React.ReactNode | undefined; children: React.ReactNode }) {
  return from === "user" ? (
    <div className="ml-auto max-w-[85%] whitespace-pre-line rounded-card rounded-br-md bg-brand-700 px-4 py-3 leading-relaxed text-white">{children}</div>
  ) : (
    <div className="flex max-w-[92%] items-end gap-2">
      {avatar}
      <div className="min-w-0 whitespace-pre-line rounded-card rounded-bl-md border border-brand-border bg-brand-surface px-4 py-3 leading-relaxed text-brand-text">{children}</div>
    </div>
  );
}

export function SuggestionChips({ label, items, onPick, disabled }: { label: string; items: string[]; onPick: (q: string) => void; disabled?: boolean }) {
  return (
    <ul aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {items.map((q) => (
        <li key={q} className="shrink-0">
          <button type="button" disabled={disabled} onClick={() => onPick(q)} className="min-h-11 max-w-[16rem] rounded-full border border-brand-border bg-brand-surface px-4 py-2 text-left text-sm font-medium text-brand-700 transition-colors duration-fast hover:bg-brand-50 disabled:opacity-50">
            {q}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ChatInput({ label, sendLabel, value, onChange, onSend, disabled, maxLength }: { label: string; sendLabel: string; value: string; onChange: (v: string) => void; onSend: () => void; disabled?: boolean | undefined; maxLength?: number }) {
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled && value.trim()) onSend();
      }}
    >
      <input aria-label={label} placeholder={label} value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="h-12 min-w-0 flex-1 rounded-full border border-brand-border bg-brand-surface px-4 text-base text-brand-text placeholder:text-brand-text-subtle disabled:opacity-60" />
      <button type="submit" aria-label={sendLabel} disabled={disabled || !value.trim()} className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-700 text-white transition-colors duration-fast hover:bg-brand-900 disabled:bg-brand-50 disabled:text-brand-text-subtle">
        <ArrowUp aria-hidden size={20} />
      </button>
    </form>
  );
}

/* ─── Skeletons for the data pieces above ───────────────────────────── */

const block = "animate-pulse rounded-card bg-brand-50 motion-reduce:animate-none";
export const Skel = {
  Tile: () => <div aria-hidden className={cn(block, "h-[120px]")} />,
  Row: () => <div aria-hidden className={cn(block, "h-[76px]")} />,
  Hero: () => <div aria-hidden className={cn(block, "h-[180px]")} />,
  Photo: () => <div aria-hidden className={cn(block, "aspect-[3/4] rounded-tile")} />,
};

/* ─── Over time (TD-54) ──────────────────────────────────────────────── */

const LEVELS = ["Low", "Moderate", "Elevated"] as const;
type Level = (typeof LEVELS)[number];

/** Stroke colour per reading for the timeline line (identity colour, never good/bad). */
const READING_STROKE: Record<Reading, string> = {
  redness: "text-concern-redness",
  oiliness: "text-concern-oiliness",
  texture: "text-concern-texture",
  blemishes: "text-concern-blemishes",
  pigment: "text-concern-pigment",
};

/**
 * The stored level of one reading at each check, oldest first, on three level
 * rows. Only real checks; a check with no level is a gap. A hidden table gives
 * the same points to screen readers.
 */
export function LevelTimeline({ reading, label, points }: { reading: Reading; label: string; points: { key: string; dateLabel: string; band: Level | null }[] }) {
  const w = 320;
  const h = 132;
  const left = 72;
  const rowY = (l: Level) => 16 + (2 - LEVELS.indexOf(l)) * 40;
  const x = (i: number) => (points.length < 2 ? (left + w) / 2 : left + 8 + (i * (w - left - 16)) / (points.length - 1));
  const drawn = points.map((p, i) => (p.band ? { x: x(i), y: rowY(p.band) } : null));
  const segments: string[] = [];
  drawn.forEach((p, i) => {
    const prev = drawn[i - 1];
    if (p && prev) segments.push(`M${prev.x},${prev.y}L${p.x},${p.y}`);
  });
  return (
    <figure className="w-full">
      <svg aria-hidden viewBox={`0 0 ${w} ${h + 20}`} className={cn("w-full", READING_STROKE[reading])}>
        {LEVELS.map((l) => (
          <g key={l}>
            <line x1={left} x2={w} y1={rowY(l)} y2={rowY(l)} className="stroke-brand-border" strokeDasharray="3 4" />
            <text x={0} y={rowY(l) + 4} className="fill-brand-text-muted text-[11px]">{l}</text>
          </g>
        ))}
        <path d={segments.join("")} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        {drawn.map((p, i) => p && <circle key={points[i]!.key} cx={p.x} cy={p.y} r={4.5} fill="currentColor" className="stroke-white" strokeWidth={1.5} />)}
        {points.map((p, i) => (
          <text key={p.key} x={x(i)} y={h + 14} textAnchor="middle" className="fill-brand-text-muted text-[10px]">{p.dateLabel}</text>
        ))}
      </svg>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}><th scope="row">{p.dateLabel}</th><td>{p.band ?? "No reading"}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** The user's own photos in a row of four, each with its label ("Today", a date). Never stock images. */
export function PhotoStrip({ photos, action }: { photos: { key: string; src: string; alt: string; label: string }[]; action?: React.ReactNode }) {
  return (
    <div>
      <ul className="grid grid-cols-4 gap-2">
        {photos.slice(-4).map((p) => (
          <li key={p.key}><PhotoTile src={p.src} alt={p.alt} label={p.label} fallback="Photo not kept" /></li>
        ))}
      </ul>
      {action}
    </div>
  );
}

/**
 * A change value, only when the comparability gate opened it; otherwise the
 * "needs more checks" state with how many comparable checks there are.
 */
export function ChangeSlot({ slot }: { slot: ChangeSlotData }) {
  if (slot.status === "needs_more_checks") {
    return (
      <p className="text-xs text-brand-text-muted">
        <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium">Needs more checks</span>{" "}
        {slot.comparableCount} of {slot.needed} comparable
      </p>
    );
  }
  const sign = slot.change > 0 ? "+" : slot.change < 0 ? "−" : "";
  return (
    <p className="text-sm text-brand-text">
      <span className="font-semibold">{sign}{Math.abs(slot.change).toFixed(1)} {slot.unit}</span>
      <span className="ml-1 text-xs text-brand-text-muted">{slot.label}</span>
    </p>
  );
}

/* ─── Store (TD-52) ──────────────────────────────────────────────────── */

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** Live store price; the was-price only when the data gives one (higher than the price). */
export function PriceBlock({ price, wasPrice, available, className }: { price: number; wasPrice: number | null; available: boolean; className?: string | undefined }) {
  return (
    <p className={cn("flex items-baseline gap-2", className)}>
      <span className="text-lg font-semibold text-brand-text">{inr.format(price)}</span>
      {wasPrice !== null && <s className="text-sm text-brand-text-muted"><span className="sr-only">Was </span>{inr.format(wasPrice)}</s>}
      {!available && <span className="text-sm font-medium text-brand-text-muted">Out of stock</span>}
    </p>
  );
}

/* ─── Weekly check-in (E19) ──────────────────────────────────────────── */

const CHECKIN_ICON: Record<string, LucideIcon> = { Laugh, Smile, Meh, Frown, Angry, Droplet, Waves, Droplets, Zap };

/** One numbered check-in question, single choice, drawn from the contract (faces, pills or icon tiles). */
export function CheckinQuestionCard({ n, question, value, onChange }: { n: number; question: CheckinQuestion; value: string | undefined; onChange: (id: string) => void }) {
  const id = useId();
  const cols = question.layout === "faces" ? "grid-cols-5" : question.options.length === 2 ? "grid-cols-2" : "grid-cols-4";
  return (
    <section className={cn(card, "p-4 sm:p-4")} aria-labelledby={id}>
      <h2 id={id} className="flex items-center gap-3 font-semibold text-brand-text">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">{n}</span>
        {question.text}
      </h2>
      <div role="radiogroup" aria-labelledby={id} className={cn("mt-3 grid gap-2", cols)}>
        {question.options.map((o) => {
          const Icon = o.icon ? CHECKIN_ICON[o.icon] : undefined;
          const on = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.id)}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-1 border text-sm font-medium transition-colors duration-fast",
                question.layout === "pills" ? "rounded-full px-2" : "rounded-tile px-1 py-2",
                on ? "border-brand-700 bg-brand-100 text-brand-700" : "border-brand-border bg-brand-surface text-brand-text",
              )}
            >
              {Icon && question.layout === "tiles" && <Icon aria-hidden size={22} />}
              <span className="text-center leading-tight">{o.label}</span>
              {Icon && question.layout === "faces" && <Icon aria-hidden size={24} />}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ─── Echo avatar ────────────────────────────────────────────────────── */

/** Echo's mark (mockup 18): a soft mint sphere with a pale ring and two eyes. Our own SVG (docs/ASSETS.md). */
export function EchoAvatar({ size = 40, className }: { size?: number; className?: string | undefined }) {
  const gid = useId().replace(/:/g, "");
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 100 100" className={className}>
      <defs>
        <radialGradient id={`${gid}-f`} cx="42%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#E3F5EA" />
          <stop offset="100%" stopColor="#BFE6CF" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill={`url(#${gid}-f)`} stroke="#CFE4E8" strokeWidth="5" />
      <ellipse cx="38" cy="52" rx="4.2" ry="6.8" fill="#0B4A3E" />
      <ellipse cx="62" cy="52" rx="4.2" ry="6.8" fill="#0B4A3E" />
    </svg>
  );
}
