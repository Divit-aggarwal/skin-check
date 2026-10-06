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
    <div className="relative max-w-sm">
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
        aria-label={step.prompt}
        className="h-12 w-full rounded-lg border border-brand-line bg-white px-4 pr-14 text-base text-brand-ink placeholder:text-brand-muted/70"
      />
      {/* Always shown, so the way on is visible before typing (design review G03). */}
      <button
        type="button"
        onClick={() => valid && onCommit()}
        aria-disabled={!valid}
        aria-label="Confirm answer"
        className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-brand-action text-white hover:bg-brand-action-hover aria-disabled:bg-brand-linen2 aria-disabled:text-brand-muted"
      >
        <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}
