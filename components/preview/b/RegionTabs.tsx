"use client";
// PREVIEW ONLY (direction B). Segmented tabs over face areas: tablist/tab/tabpanel,
// roving tabindex, Left/Right/Home/End. Each panel is one area's readings.
import { useId, useRef, useState } from "react";
import { clsx } from "clsx";
import { Readings } from "./ui";
import type { Area } from "./types";

export function RegionTabs({ areas, label }: { areas: Area[]; label: string }) {
  const [sel, setSel] = useState(0);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: React.KeyboardEvent) {
    const n = areas.length;
    const next = { ArrowRight: (sel + 1) % n, ArrowLeft: (sel - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setSel(next);
    refs.current[next]?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKey}
        className="grid gap-1 rounded-full border bg-[var(--surface)] p-1"
        style={{ gridTemplateColumns: `repeat(${areas.length}, minmax(0, 1fr))` }}
      >
        {areas.map((a, i) => (
          <button
            key={a.region}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${base}-tab-${i}`}
            role="tab"
            type="button"
            aria-selected={sel === i}
            aria-controls={`${base}-panel-${i}`}
            tabIndex={sel === i ? 0 : -1}
            onClick={() => setSel(i)}
            className={clsx(
              "min-h-[44px] rounded-full px-1 text-[14px] font-medium transition-colors duration-150",
              sel === i ? "bg-[var(--ink)] text-white" : "text-[var(--muted)] hover:text-[var(--ink)]"
            )}
          >
            {a.label}
          </button>
        ))}
      </div>
      {areas.map((a, i) => (
        <div
          key={a.region}
          id={`${base}-panel-${i}`}
          role="tabpanel"
          aria-labelledby={`${base}-tab-${i}`}
          tabIndex={0}
          hidden={sel !== i}
          className="b-fade mt-3"
        >
          <Readings readings={a.readings} />
        </div>
      ))}
    </div>
  );
}
