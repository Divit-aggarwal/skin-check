"use client";

import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MultiSelectCardsStep } from "@/types/skin-check";

interface ImageCardMultiSelectProps {
  step: MultiSelectCardsStep;
  value: string[];
  onChange: (value: string[]) => void;
  onCommit: () => void;
}

/** Tells the user more than one answer is allowed (design review G11). */
export function multiSelectHint(maxSelections: number | undefined, optionCount: number): string {
  return maxSelections !== undefined && maxSelections < optionCount ? `Choose up to ${maxSelections}.` : "Choose all that apply.";
}

export function ImageCardMultiSelect({ step, value, onChange, onCommit }: ImageCardMultiSelectProps) {
  function toggle(optValue: string) {
    if (step.exclusiveValue === optValue) {
      onChange(value.includes(optValue) ? [] : [optValue]);
      return;
    }
    const withoutExclusive = step.exclusiveValue
      ? value.filter((v) => v !== step.exclusiveValue)
      : value;
    const alreadySelected = withoutExclusive.includes(optValue);
    if (!alreadySelected && step.maxSelections !== undefined && withoutExclusive.length >= step.maxSelections) {
      return;
    }
    onChange(alreadySelected ? withoutExclusive.filter((v) => v !== optValue) : [...withoutExclusive, optValue]);
  }

  const atMax = step.maxSelections !== undefined && value.length >= step.maxSelections;

  return (
    <div className="flex flex-col gap-4">
      {step.note && <p className="max-w-md text-sm text-brand-muted">{step.note}</p>}
      <p className="text-sm text-brand-muted">{multiSelectHint(step.maxSelections, step.options.length)}</p>
      <div className="grid grid-cols-2 gap-2.5 sm:max-w-md">
        {step.options.map((opt) => {
          const selected = value.includes(opt.value);
          const disabled = !selected && opt.value !== step.exclusiveValue && atMax;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              disabled={disabled}
              className={cn(
                "relative flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:ring-offset-2",
                selected
                  ? "border-brand-action bg-brand-mist"
                  : disabled
                    ? "cursor-not-allowed border-brand-line bg-white opacity-40"
                    : "border-brand-line bg-white hover:border-brand-ink/40"
              )}
            >
              {/* The label comes first in the DOM, so a screen reader says the
                  option before the picture; `order-first` shows the picture on top. */}
              <span className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium leading-snug text-text">{opt.label}</span>
                {selected && (
                  <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-action text-white">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
              </span>
              {opt.image && (
                // eslint-disable-next-line @next/next/no-img-element -- a 1 KB SVG; next/image adds nothing here
                <img
                  src={opt.image.src}
                  alt={opt.image.alt}
                  width={160}
                  height={64}
                  decoding="async"
                  className="order-first aspect-[5/2] h-auto w-full rounded-md border border-brand-card-line object-contain"
                />
              )}
              {opt.description && (
                <span className="text-xs leading-snug text-brand-muted">{opt.description}</span>
              )}
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
