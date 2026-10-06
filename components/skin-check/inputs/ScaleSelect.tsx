"use client";

import { cn } from "@/lib/utils";
import type { Scale1to5Step } from "@/types/skin-check";

const LEVELS = ["1", "2", "3", "4", "5"];

interface ScaleSelectProps {
  step: Scale1to5Step;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}

export function ScaleSelect({ step, value, onChange, onCommit }: ScaleSelectProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex max-w-sm flex-col gap-2">
        <div className="flex justify-between gap-2">
          {LEVELS.map((level) => {
            const selected = value === level;
            return (
              <button
                key={level}
                type="button"
                onClick={() => {
                  onChange(level);
                  onCommit();
                }}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:ring-offset-2",
                  selected
                    ? "border-brand-action bg-brand-action text-white"
                    : "border-brand-line bg-white text-text hover:border-brand-ink/40"
                )}
              >
                {level}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between text-xs font-bold uppercase tracking-[0.08em] text-brand-muted">
          <span>{step.minLabel}</span>
          <span>{step.maxLabel}</span>
        </div>
      </div>
      {value && <p className="max-w-sm text-sm text-brand-muted">{step.reflections[value]}</p>}
    </div>
  );
}
