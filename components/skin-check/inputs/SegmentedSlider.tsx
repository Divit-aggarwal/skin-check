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
    <div className="ml-auto flex w-full max-w-[90%] overflow-hidden rounded-2xl border border-[#1A1A1A]/10">
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
              "flex flex-1 flex-col items-center gap-0.5 px-2 py-3 text-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#98415A]/50",
              i > 0 && "border-l border-[#1A1A1A]/10",
              selected ? "bg-[#98415A] text-white" : "bg-white text-[#1A1A1A] hover:bg-[#F7E3E3]/40"
            )}
          >
            <span className="text-sm font-semibold">{opt.label}</span>
            <span className={cn("text-[0.6875rem]", selected ? "text-white/80" : "text-[#1A1A1A]/45")}>
              {opt.sublabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}
