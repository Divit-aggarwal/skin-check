"use client";

import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BodyMapStep } from "@/types/skin-check";
import { multiSelectHint } from "./ImageCardMultiSelect";

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
    const alreadySelected = value.includes(optValue);
    if (!alreadySelected && step.maxSelections !== undefined && value.length >= step.maxSelections) {
      return;
    }
    onChange(alreadySelected ? value.filter((v) => v !== optValue) : [...value, optValue]);
  }

  const atMax = step.maxSelections !== undefined && value.length >= step.maxSelections;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-brand-muted">{multiSelectHint(step.maxSelections, step.options.length)}</p>
      <div className="flex max-w-sm flex-col gap-2">
        {step.options.map((opt) => {
          const selected = value.includes(opt.value);
          const disabled = !selected && atMax;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              disabled={disabled}
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:ring-offset-2",
                selected
                  ? "border-brand-action bg-brand-mist"
                  : disabled
                    ? "cursor-not-allowed border-brand-line bg-white opacity-40"
                    : "border-brand-line bg-white hover:border-brand-ink/40"
              )}
            >
              <span className="text-sm font-medium text-text">{opt.label}</span>
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                  selected ? "border-brand-action bg-brand-action text-white" : "border-brand-line"
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
          className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-action text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:ring-offset-2"
        >
          <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
