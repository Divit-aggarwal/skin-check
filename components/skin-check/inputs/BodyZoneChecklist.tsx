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
    <div className="flex flex-col gap-4">
      <div className="flex max-w-sm flex-col gap-2">
        {step.options.map((opt) => {
          const selected = value.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush/50 focus-visible:ring-offset-2",
                selected ? "border-blush bg-blush-soft" : "border-text/10 bg-white hover:border-blush/40"
              )}
            >
              <span className="text-sm font-medium text-text">{opt.label}</span>
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                  selected ? "border-blush bg-blush text-white" : "border-text/20"
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
          className="flex h-9 w-9 items-center justify-center rounded-full bg-blush text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush/50 focus-visible:ring-offset-2"
        >
          <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
