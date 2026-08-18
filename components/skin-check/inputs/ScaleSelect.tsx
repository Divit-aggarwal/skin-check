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
    <div className="flex flex-col items-end gap-2.5">
      <div className="flex w-full max-w-[90%] flex-col gap-2">
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
                  "flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#98415A]/50 focus-visible:ring-offset-2",
                  selected
                    ? "border-[#98415A] bg-[#98415A] text-white"
                    : "border-[#1A1A1A]/10 bg-white text-[#1A1A1A] hover:border-[#98415A]/40"
                )}
              >
                {level}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between text-[0.6875rem] font-medium uppercase tracking-wide text-[#1A1A1A]/45">
          <span>{step.minLabel}</span>
          <span>{step.maxLabel}</span>
        </div>
      </div>
      {value && (
        <p className="max-w-[90%] text-right text-xs text-[#1A1A1A]/55">{step.reflections[value]}</p>
      )}
    </div>
  );
}
