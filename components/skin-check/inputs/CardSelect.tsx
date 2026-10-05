"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SingleSelectCardsStep } from "@/types/skin-check";

interface CardSelectProps {
  step: SingleSelectCardsStep;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}

export function CardSelect({ step, value, onChange, onCommit }: CardSelectProps) {
  return (
    <div className="flex flex-col gap-2.5">
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
              "flex items-center justify-between gap-3 rounded-lg border px-4 py-3.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush/50 focus-visible:ring-offset-2",
              selected ? "border-brand-action bg-brand-linen" : "border-brand-line bg-white hover:border-brand-ink/40"
            )}
          >
            <span>
              <span className="block text-[0.9375rem] font-medium text-text">{opt.label}</span>
              <span className="mt-0.5 block text-sm text-brand-muted">{opt.description}</span>
            </span>
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                selected ? "border-brand-action bg-brand-action text-white" : "border-brand-line"
              )}
            >
              {selected && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
