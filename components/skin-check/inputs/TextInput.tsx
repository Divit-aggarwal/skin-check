"use client";

import { ArrowRight } from "lucide-react";
import type { TextStep } from "@/types/skin-check";

interface TextInputProps {
  step: TextStep;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}

export function TextInput({ step, value, onChange, onCommit }: TextInputProps) {
  const valid = Boolean(value.trim());
  return (
    <div className="flex justify-end">
      <div className="relative w-full max-w-[85%]">
        <input
          type="text"
          autoComplete="name"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) {
              e.preventDefault();
              onCommit();
            }
          }}
          placeholder={step.placeholder}
          className="w-full rounded-2xl rounded-tr-sm border border-[#1A1A1A]/10 bg-white px-4 py-3 pr-11 text-[1.0625rem] text-[#1A1A1A] shadow-sm outline-none placeholder:text-[#1A1A1A]/35 focus:border-[#98415A]/40 focus-visible:ring-2 focus-visible:ring-[#98415A]/50 focus-visible:ring-offset-2"
        />
        {valid && (
          <button
            type="button"
            onClick={onCommit}
            aria-label="Confirm answer"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-[#98415A] text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#98415A]/50 focus-visible:ring-offset-2"
          >
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}
