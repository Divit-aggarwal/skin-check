"use client";

import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BodyMapStep } from "@/types/skin-check";

// Simplified checklist fallback for the acne-area body map — an interactive
// SVG hotspot diagram on a face/shoulders illustration is flagged as a
// follow-up rather than built in this pass (see Step 0 / Phase 1 notes).
interface BodyZoneChecklistProps {
  step: BodyMapStep;
  value: string[];
  onChange: (value: string[]) => void;
  onCommit: () => void;
}

export function BodyZoneChecklist({ step, value, onChange, onCommit }: BodyZoneChecklistProps) {
  function toggle(optValue: string) {
    onChange(value.includes(optValue) ? value.filter((v) => v !== optValue) : [...value, optValue]);
  }

  return (
    <div className="flex flex-col items-end gap-4">
      <div className="flex w-full flex-col gap-2">
        {step.options.map((opt) => {
          const selected = value.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={cn(
                "flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#98415A]/50 focus-visible:ring-offset-2",
                selected
                  ? "border-[#98415A] bg-[#F7E3E3]/60"
                  : "border-[#1A1A1A]/10 bg-white hover:border-[#98415A]/30"
              )}
            >
              <span className="text-sm font-medium text-[#1A1A1A]">{opt.label}</span>
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                  selected ? "border-[#98415A] bg-[#98415A] text-white" : "border-[#1A1A1A]/20"
                )}
              >
                {selected && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>
      {value.length > 0 && (
        <button
          type="button"
          onClick={onCommit}
          aria-label="Confirm selection"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#98415A] text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#98415A]/50 focus-visible:ring-offset-2"
        >
          <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
