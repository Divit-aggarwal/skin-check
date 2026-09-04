"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { isValidPhone } from "@/lib/skin-check-validation";
import type { PhoneStep } from "@/types/skin-check";

interface PhoneInputProps {
  step: PhoneStep;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}

export function PhoneInput({ step, value, onChange, onCommit }: PhoneInputProps) {
  const valid = isValidPhone(value);
  return (
    <div className="flex flex-col gap-2">
      <div className="relative max-w-sm">
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) {
              e.preventDefault();
              onCommit();
            }
          }}
          placeholder="10-digit mobile number"
          className={cn(
            "w-full rounded-lg border bg-white px-4 py-3 pr-11 text-[1.0625rem] text-text shadow-sm outline-none placeholder:text-text/35 focus-visible:ring-2 focus-visible:ring-blush/50 focus-visible:ring-offset-2",
            valid ? "border-blush/50" : "border-text/10 focus:border-blush/50"
          )}
        />
        {valid && (
          <button
            type="button"
            onClick={onCommit}
            aria-label="Confirm answer"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-blush text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush/50 focus-visible:ring-offset-2"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </button>
        )}
      </div>
      <p className="max-w-sm text-xs text-text/45">{step.note}</p>
    </div>
  );
}
