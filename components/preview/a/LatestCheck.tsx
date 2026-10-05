"use client";
// PREVIEW ONLY (direction A). Home's latest-check card: whole face or one area
// at a time, chosen with chips; the face drawing marks the chosen area.
import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { A_COPY as A } from "./copy";
import { eyebrow, FaceDrawing, PhotoCheckLine, ReadingRows } from "./ui";

type Rows = { metric: string; label: string; band: string }[];
type Region = "forehead" | "cheeks" | "nose" | "chin";
export type LatestProps = {
  date: string;
  href: string;
  photoCheck: string | null;
  notes: string[];
  wholeFace: Rows;
  regions: { region: Region; label: string; readings: Rows }[];
};

export function LatestCheck({ date, href, photoCheck, notes, wholeFace, regions }: LatestProps) {
  const [sel, setSel] = useState<Region | null>(null);
  const labels = Object.fromEntries(regions.map((r) => [r.region, r.label])) as Record<Region, string>;
  const rows = sel ? regions.find((r) => r.region === sel)!.readings : wholeFace;
  const chips: { id: Region | null; label: string }[] = [{ id: null, label: A.home.wholeFace }, ...regions.map((r) => ({ id: r.region, label: r.label }))];

  return (
    <section aria-labelledby="a-latest" className="a-fade rounded-2xl bg-[var(--a-linen)] p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <p className={eyebrow}>{A.home.latestEyebrow}</p>
          <h2 id="a-latest" className="a-head mt-2 text-[20px] font-semibold leading-tight sm:text-[22px]">
            {C.current.title}
          </h2>
          <p className="mt-1 text-[14px] text-[var(--a-muted)]">{C.current.checkedOn(date)}</p>
        </div>
        <Link
          href={href}
          className="inline-flex min-h-[44px] items-center gap-1 font-medium text-[var(--a-forest)] underline-offset-4 hover:underline"
        >
          {A.home.openCheck}
          <ChevronRight aria-hidden size={16} />
        </Link>
      </div>

      <div role="group" aria-label={A.home.view} className="-mx-1 mt-6 flex flex-wrap gap-2 px-1">
        {chips.map((c) => (
          <button
            key={c.label}
            type="button"
            aria-pressed={sel === c.id}
            onClick={() => setSel(c.id)}
            className="min-h-[44px] rounded-full border bg-[var(--a-paper)] px-4 text-[14px] font-medium aria-pressed:border-[var(--a-ink)] aria-pressed:bg-[var(--a-ink)] aria-pressed:text-white"
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid items-center gap-6 md:grid-cols-[300px_1fr] md:gap-10">
        <div className="rounded-2xl bg-[var(--a-paper)] py-4">
          <FaceDrawing selected={sel} labels={labels} />
        </div>
        <div aria-live="polite" className="order-first md:order-none">
          <h3 className="mb-1 font-semibold">{sel ? labels[sel] : A.home.wholeFace}</h3>
          <ReadingRows rows={rows} />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2 border-t pt-4">
        {photoCheck && <PhotoCheckLine text={photoCheck} />}
        {notes.map((n) => (
          <p key={n} className="text-[14px] leading-[1.45] text-[var(--a-muted)]">
            {n}
          </p>
        ))}
        <p className="text-[14px] leading-[1.45] text-[var(--a-muted)]">{A.home.regionNote}</p>
      </div>
    </section>
  );
}
