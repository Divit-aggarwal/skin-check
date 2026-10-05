// PREVIEW ONLY (direction B). Plain presentational parts, safe on server and client.
// Readings are band words in ink, all in one style: no colour, bar, icon or order.
import Link from "next/link";
import { Camera, ChevronRight, ImageIcon, Smartphone, SquareCheckBig } from "lucide-react";
import { clsx } from "clsx";
import { AccountButton } from "./Shell";
import { B_COPY as B } from "./copy";
import type { Area, Reading, TimelineItem } from "./types";

export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("mx-auto w-full max-w-[1200px] px-4 pb-8 sm:px-6 lg:px-8 lg:pb-12", className)}>{children}</div>;
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-4 pb-5 pt-5 sm:pt-7 lg:pb-6 lg:pt-9">
      <div className="min-w-0">
        {eyebrow && <p className="b-eyebrow mb-1">{eyebrow}</p>}
        <h1 className="b-h1">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {children}
        <AccountButton />
      </div>
    </header>
  );
}

export function SectionHead({ id, eyebrow, title, action }: { id: string; eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 border-b px-4 pb-3 pt-4 sm:px-5">
      <div className="min-w-0">
        <p className="b-eyebrow">{eyebrow}</p>
        <h2 id={id} className="b-h2 mt-0.5">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

export function Readings({ readings, label }: { readings: Reading[]; label?: string }) {
  return (
    <dl aria-label={label} className="rounded-lg border px-4">
      {readings.map((r) => (
        <div key={r.metric} className="b-row-line flex min-h-[44px] items-center justify-between gap-4 py-2">
          <dt>{r.label}</dt>
          <dd>{r.band}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Region × metric table. Every cell has the same style. */
export function AreaTable({ caption, wholeLabel, wholeFace, regions }: { caption: string; wholeLabel: string; wholeFace: Reading[] | null; regions: Area[] }) {
  const columns = (wholeFace ?? regions[0]?.readings ?? []).map((r) => ({ metric: r.metric, label: r.label }));
  const rows = [...(wholeFace ? [{ region: "whole", label: wholeLabel, readings: wholeFace }] : []), ...regions];
  return (
    <div className="rounded-lg border">
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="b-eyebrow w-[22%] px-4 py-3 font-semibold">
              {B.home.area}
            </th>
            {columns.map((c) => (
              <th key={c.metric} scope="col" className="b-eyebrow px-3 py-3 font-semibold">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.region} className="border-t">
              <th scope="row" className="px-4 py-3 font-semibold">
                {r.label}
              </th>
              {r.readings.map((x) => (
                <td key={x.metric} className="px-3 py-3">
                  {x.band}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusLine({ children, icon = "phone" }: { children: React.ReactNode; icon?: "phone" | "none" }) {
  return (
    <p className="b-meta flex items-start gap-2">
      {icon === "phone" && <Smartphone size={16} strokeWidth={1.75} className="mt-[3px] shrink-0" aria-hidden />}
      <span>{children}</span>
    </p>
  );
}

/** TD-24 (1): on every opened check, never behind a toggle. */
export function FixedLine({ text }: { text: string }) {
  return <p className="b-fixed">{text}</p>;
}

/** Neutral placeholder: shown only where the user chose to keep the photo. */
export function Thumb() {
  return (
    <span role="img" aria-label={B.checks.photoKept} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-[var(--surface-2)] text-[var(--muted)]">
      <ImageIcon size={18} strokeWidth={1.5} aria-hidden />
    </span>
  );
}

/** A row in the checks list or the timeline: date, kind, photo check, thumbnail. Never a reading. */
export function ItemRow({ item, showDate = false }: { item: TimelineItem; showDate?: boolean }) {
  const Icon = item.type === "check" ? Camera : SquareCheckBig;
  return (
    <Link
      href={item.href}
      aria-label={item.type === "check" ? item.linkLabel : undefined}
      className="flex min-h-[56px] items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-[var(--surface)]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ink)]" aria-hidden>
        <Icon size={16} strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          {showDate && <span className="font-semibold">{item.dayLabel}</span>}
          <span className={clsx(!showDate && "font-semibold")}>{item.title}</span>
        </span>
        {item.meta && <span className="b-meta block">{item.meta}</span>}
      </span>
      {item.kept && <Thumb />}
      <ChevronRight size={18} strokeWidth={1.75} className="shrink-0 text-[var(--muted)]" aria-hidden />
    </Link>
  );
}

/** Vertical rail with date markers; checks and routine events in date order. */
export function TimelineRail({ items }: { items: TimelineItem[] }) {
  const days: { day: string; label: string; items: TimelineItem[] }[] = [];
  for (const it of items) {
    const last = days[days.length - 1];
    if (last?.day === it.day) last.items.push(it);
    else days.push({ day: it.day, label: it.dayLabel, items: [it] });
  }
  return (
    <ol className="relative">
      {days.map((d, i) => (
        <li key={d.day} className="relative grid gap-2 pb-5 pl-7 last:pb-0 md:grid-cols-[120px_1fr] md:gap-6 md:pl-0">
          {i < days.length - 1 && <span aria-hidden className="absolute bottom-0 left-[5px] top-3 w-px bg-[var(--line)] md:left-[131px]" />}
          <span aria-hidden className="absolute left-0 top-[7px] h-[11px] w-[11px] rounded-full border-2 border-[var(--ink)] bg-white md:left-[126px]" />
          <p className="pt-0.5 text-[14px] font-semibold md:text-right md:pr-6">
            <time dateTime={d.day}>{d.label}</time>
          </p>
          <ul className="b-card overflow-hidden">
            {d.items.map((it) => (
              <li key={it.key} className="b-row-line">
                <ItemRow item={it} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
