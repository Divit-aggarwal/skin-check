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
    <div className="flex flex-col items-end gap-2">
      <div className="relative w-full max-w-[85%]">
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
            "w-full rounded-2xl rounded-tr-sm border bg-white px-4 py-3 pr-11 text-[1.0625rem] text-[#1A1A1A] shadow-sm outline-none placeholder:text-[#1A1A1A]/35 focus-visible:ring-2 focus-visible:ring-[#98415A]/50 focus-visible:ring-offset-2",
            valid ? "border-[#98415A]/40" : "border-[#1A1A1A]/10 focus:border-[#98415A]/40"
          )}
        />
        {valid && (
          <button
            type="button"
            onClick={onCommit}
            aria-label="Confirm answer"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-[#98415A] text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#98415A]/50 focus-visible:ring-offset-2"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </button>
        )}
      </div>
      <p className="max-w-[85%] text-right text-xs text-[#1A1A1A]/45">{step.note}</p>
    </div>
  );
}
