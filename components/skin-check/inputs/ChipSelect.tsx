"use client";

import { cn } from "@/lib/utils";
import type { SingleSelectChipsStep } from "@/types/skin-check";

interface ChipSelectProps {
  step: SingleSelectChipsStep;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}

export function ChipSelect({ step, value, onChange, onCommit }: ChipSelectProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2.5">
        {step.options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                onCommit();
              }}
              className={cn(
                "rounded-full px-4 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush/50 focus-visible:ring-offset-2",
                selected
                  ? "bg-blush text-white"
                  : "border border-text/10 bg-white text-text hover:border-blush/40"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {step.note && <p className="max-w-[85%] text-xs text-text/45">{step.note}</p>}
    </div>
  );
}
