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

export function ImageCardMultiSelect({ step, value, onChange, onCommit }: ImageCardMultiSelectProps) {
  function toggle(optValue: string) {
    if (step.exclusiveValue === optValue) {
      onChange(value.includes(optValue) ? [] : [optValue]);
      return;
    }
    const withoutExclusive = step.exclusiveValue
      ? value.filter((v) => v !== step.exclusiveValue)
      : value;
    onChange(
      withoutExclusive.includes(optValue)
        ? withoutExclusive.filter((v) => v !== optValue)
        : [...withoutExclusive, optValue]
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {step.note && <p className="max-w-md text-xs text-text/55">{step.note}</p>}
      <div className="grid grid-cols-2 gap-2.5 sm:max-w-md">
        {step.options.map((opt) => {
          const selected = value.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={cn(
                "relative flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush/50 focus-visible:ring-offset-2",
                selected ? "border-blush bg-blush-soft" : "border-text/10 bg-white hover:border-blush/40"
              )}
            >
              {opt.imagePlaceholder && (
                <span className="flex h-16 w-full items-center justify-center rounded-md border border-dashed border-blush/30 bg-canvas px-2 text-center text-[0.625rem] font-medium leading-tight text-blush/70">
                  ⟨{opt.imagePlaceholder}⟩
                </span>
              )}
              <span className="text-sm font-medium leading-snug text-text">{opt.label}</span>
              {opt.description && (
                <span className="text-xs leading-snug text-text/55">{opt.description}</span>
              )}
              {selected && (
                <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-blush text-white">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
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
          className="flex h-9 w-9 items-center justify-center rounded-full bg-blush text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush/50 focus-visible:ring-offset-2"
        >
          <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
