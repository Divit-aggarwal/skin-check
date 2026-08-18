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
    <div className="flex flex-col items-end gap-4">
      {step.note && (
        <p className="max-w-[90%] text-right text-xs text-[#1A1A1A]/55">{step.note}</p>
      )}
      <div className="grid w-full grid-cols-2 gap-2.5">
        {step.options.map((opt) => {
          const selected = value.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={cn(
                "relative flex flex-col gap-2 rounded-2xl border p-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#98415A]/50 focus-visible:ring-offset-2",
                selected
                  ? "border-[#98415A] bg-[#F7E3E3]/60"
                  : "border-[#1A1A1A]/10 bg-white hover:border-[#98415A]/30"
              )}
            >
              {opt.imagePlaceholder && (
                <span className="flex h-16 w-full items-center justify-center rounded-xl border border-dashed border-[#98415A]/25 bg-[#FAF6F1] px-2 text-center text-[0.625rem] font-medium leading-tight text-[#98415A]/60">
                  ⟨{opt.imagePlaceholder}⟩
                </span>
              )}
              <span className="text-sm font-medium leading-snug text-[#1A1A1A]">{opt.label}</span>
              {opt.description && (
                <span className="text-xs leading-snug text-[#1A1A1A]/55">{opt.description}</span>
              )}
              {selected && (
                <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#98415A] text-white">
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
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#98415A] text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#98415A]/50 focus-visible:ring-offset-2"
        >
          <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
