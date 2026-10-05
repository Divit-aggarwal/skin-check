// PREVIEW ONLY (direction A). Presentational pieces shared by the /preview/a
// pages. No hooks and no server imports, so client components may use them too.
import Link from "next/link";
import { ChevronRight, ImageIcon, ShieldCheck, UserRound } from "lucide-react";
import { A_COPY as A } from "./copy";

export const btnPrimary =
  "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-[var(--a-action)] px-6 font-medium text-white hover:bg-[var(--a-action-hover)] sm:min-h-[44px]";
export const btnSecondary =
  "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-[var(--a-ink)] px-6 font-medium text-[var(--a-ink)] hover:bg-[var(--a-linen)] sm:min-h-[44px]";
export const textLink =
  "inline-flex min-h-[44px] items-center gap-1 font-medium text-[var(--a-forest)] underline-offset-4 hover:underline focus-visible:underline";
export const card = "rounded-2xl bg-[var(--a-linen)] p-5 sm:p-6";
export const eyebrow = "text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--a-muted)]";
export const h2 = "a-head text-[20px] font-semibold leading-tight sm:text-[22px]";

/** Page title block. On phones, Account sits as a round button in the top right (system.md §6). */
export function PageHeader({ title, kicker, intro, wide }: { title: string; kicker?: string; intro?: string; wide?: boolean }) {
  return (
    <header className={`mx-auto flex items-start justify-between gap-4 pb-6 pt-8 sm:pt-12 ${wide === false ? "max-w-2xl" : ""}`}>
      <div className="min-w-0">
        {kicker && <p className={`${eyebrow} mb-2`}>{kicker}</p>}
        <h1 className="a-head text-[28px] font-semibold leading-[1.15] tracking-tight sm:text-[36px]">{title}</h1>
        {intro && <p className="mt-3 max-w-prose text-[var(--a-muted)]">{intro}</p>}
      </div>
      <Link
        href="#"
        aria-label={A.nav.account}
        className="grid size-11 shrink-0 place-items-center rounded-full border bg-[var(--a-paper)] sm:hidden"
      >
        <UserRound aria-hidden size={20} />
      </Link>
    </header>
  );
}

/** Metric on the left, band word on the right, both in ink. Every band looks the same. */
export function ReadingRows({ rows }: { rows: { metric: string; label: string; band: string }[] }) {
  return (
    <dl className="divide-y divide-[var(--a-border)]">
      {rows.map((r) => (
        <div key={r.metric} className="flex min-h-[48px] items-center justify-between gap-4 py-2">
          <dt>{r.label}</dt>
          <dd className="font-medium">{r.band}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PhotoCheckLine({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 text-[14px] leading-[1.45] text-[var(--a-muted)]">
      <ShieldCheck aria-hidden size={16} className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </p>
  );
}

/** TD-24 (1): on every opened past check, never behind a toggle. */
export function FixedLine({ text }: { text: string }) {
  return <p className="rounded-2xl bg-[var(--a-mist)] px-5 py-4 text-[var(--a-ink)]">{text}</p>;
}

export function Thumb() {
  return (
    <span
      role="img"
      aria-label={A.photoKept}
      className="grid size-12 shrink-0 place-items-center rounded-lg border bg-[var(--a-linen-2)] text-[var(--a-muted)]"
    >
      <ImageIcon aria-hidden size={18} />
    </span>
  );
}

type Region = "forehead" | "cheeks" | "nose" | "chin";

/**
 * An abstract face in neutral ink with the four areas marked. The selected area
 * gets a solid outline; nothing is filled or coloured to mean anything.
 */
export function FaceDrawing({ selected, labels }: { selected?: Region | null; labels: Record<Region, string> }) {
  const zone = (r: Region) => ({
    fill: "none",
    stroke: "var(--a-ink)",
    strokeWidth: selected === r ? 2 : 1,
    strokeDasharray: selected === r ? undefined : "4 4",
    opacity: selected && selected !== r ? 0.45 : 1,
  });
  const text = (r: Region) => ({
    fontSize: 13,
    fontWeight: selected === r ? 700 : 500,
    fill: "var(--a-ink)",
    textAnchor: "middle" as const,
    fontFamily: "var(--a-font-body)",
  });
  const lead = (r: Region) => ({ stroke: "var(--a-ink)", strokeWidth: 1, opacity: selected && selected !== r ? 0.45 : 1 });
  return (
    <svg width="300" height="292" viewBox="0 0 300 292" aria-hidden className="mx-auto block max-w-full shrink-0">
      <g transform="translate(30 0)">
        {/* face, hair line, ears */}
        <path d="M120 22c-50 0-80 38-80 92 0 72 36 144 80 144s80-72 80-144c0-54-30-92-80-92Z" fill="var(--a-paper)" stroke="var(--a-ink)" strokeWidth="1.5" />
        <path d="M48 92c14-30 40-44 72-44s58 14 72 44" fill="none" stroke="var(--a-taupe)" strokeWidth="1.5" />
        <path d="M40 132c-10-2-12 26 2 30M200 132c10-2 12 26-2 30" fill="none" stroke="var(--a-ink)" strokeWidth="1.2" />
        {/* features */}
        <path d="M82 134q12-8 24 0M134 134q12-8 24 0" fill="none" stroke="var(--a-ink)" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M120 140v30q-8 6 0 10" fill="none" stroke="var(--a-ink)" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M100 212q20 12 40 0" fill="none" stroke="var(--a-ink)" strokeWidth="1.5" strokeLinecap="round" />
        {/* areas */}
        <rect x="70" y="60" width="100" height="50" rx="18" {...zone("forehead")} />
        <ellipse cx="74" cy="180" rx="22" ry="24" {...zone("cheeks")} />
        <ellipse cx="166" cy="180" rx="22" ry="24" {...zone("cheeks")} />
        <rect x="106" y="122" width="28" height="64" rx="14" {...zone("nose")} />
        <ellipse cx="120" cy="238" rx="28" ry="13" {...zone("chin")} />
      </g>
      {/* labels and leader lines, outside the face */}
      <text x="150" y="90" {...text("forehead")}>{labels.forehead}</text>
      <line x1="164" y1="140" x2="252" y2="112" {...lead("nose")} />
      <text x="256" y="117" {...text("nose")} textAnchor="start">{labels.nose}</text>
      <line x1="90" y1="198" x2="36" y2="236" {...lead("cheeks")} />
      <text x="2" y="252" {...text("cheeks")} textAnchor="start">{labels.cheeks}</text>
      <line x1="210" y1="198" x2="264" y2="236" {...lead("cheeks")} />
      <text x="298" y="252" {...text("cheeks")} textAnchor="end">{labels.cheeks}</text>
      <text x="150" y="284" {...text("chin")}>{labels.chin}</text>
    </svg>
  );
}

/** Checks list and timeline rows: date, kind, photo check (or routine entry) and thumbnail. Never a reading. */
export type RowItem = { key: string; date: string; kind: string; detail: string | null; href: string; label: string; thumb: boolean; routine: boolean };

export function ItemList({ items, roomy }: { items: RowItem[]; roomy?: boolean }) {
  return (
    <ul className={roomy ? "flex flex-col gap-3 sm:gap-4" : "divide-y divide-[var(--a-border)]"}>
      {items.map((i) => (
        <li key={i.key}>
          <Link
            href={i.href}
            aria-label={i.label}
            className={`group flex min-h-[56px] items-center gap-4 ${
              !roomy
                ? "rounded-lg py-3"
                : i.routine
                  ? "rounded-2xl border bg-[var(--a-paper)] p-4 hover:bg-[var(--a-linen)] sm:px-6 sm:py-4"
                  : "rounded-2xl bg-[var(--a-linen)] p-4 hover:bg-[var(--a-linen-2)] sm:px-6 sm:py-5"
            }`}
          >
            {i.thumb ? (
              <Thumb />
            ) : (
              <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-lg text-[var(--a-muted)]">
                {i.routine && <span className="size-2 rounded-full bg-[var(--a-taupe)]" />}
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-semibold">{i.date}</span>
                <span className="text-[14px] text-[var(--a-muted)]">{i.kind}</span>
              </span>
              {i.detail && <span className="mt-0.5 text-[14px] leading-[1.45] text-[var(--a-muted)]">{i.detail}</span>}
            </span>
            <ChevronRight aria-hidden size={18} className="shrink-0 text-[var(--a-muted)] group-hover:text-[var(--a-ink)]" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
