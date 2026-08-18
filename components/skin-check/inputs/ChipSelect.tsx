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
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2.5">
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
                "rounded-full px-4 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#98415A]/50 focus-visible:ring-offset-2",
                selected
                  ? "bg-[#98415A] text-white"
                  : "border border-[#1A1A1A]/10 bg-white text-[#1A1A1A] hover:border-[#98415A]/40"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {step.note && (
        <p className="max-w-[85%] text-right text-xs text-[#1A1A1A]/45">{step.note}</p>
      )}
    </div>
  );
}
