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
                  "flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush/50 focus-visible:ring-offset-2",
                  selected
                    ? "border-blush bg-blush text-white"
                    : "border-text/10 bg-white text-text hover:border-blush/40"
                )}
              >
                {level}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between text-[0.6875rem] font-medium uppercase tracking-wide text-text/45">
          <span>{step.minLabel}</span>
          <span>{step.maxLabel}</span>
        </div>
      </div>
      {value && <p className="max-w-sm text-xs text-text/55">{step.reflections[value]}</p>}
    </div>
  );
}
