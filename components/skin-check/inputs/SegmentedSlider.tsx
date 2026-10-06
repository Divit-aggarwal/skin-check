"use client";

import { cn } from "@/lib/utils";
import type { SegmentedSliderStep } from "@/types/skin-check";

interface SegmentedSliderProps {
  step: SegmentedSliderStep;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}

export function SegmentedSlider({ step, value, onChange, onCommit }: SegmentedSliderProps) {
  return (
    <div className="flex max-w-sm overflow-hidden rounded-lg border border-brand-line">
      {step.options.map((opt, i) => {
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
              "flex flex-1 flex-col items-center gap-0.5 px-2 py-3 text-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-forest",
              i > 0 && "border-l border-brand-line",
              selected ? "bg-brand-action text-white" : "bg-white text-text hover:bg-brand-linen"
            )}
          >
            <span className="text-sm font-semibold">{opt.label}</span>
            <span className={cn("text-[0.6875rem]", selected ? "text-white/80" : "text-brand-muted")}>
              {opt.sublabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}
