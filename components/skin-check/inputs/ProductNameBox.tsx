"use client";

import { useId } from "react";
import { PRODUCT_NAME_MAX } from "@/lib/skin-check-validation";

/**
 * TD-33 (2): legal review pending (tracker H31). True today: owner-only reads
 * in the app (firestore.rules), no path to Gemini (tests/privacy-gemini-
 * inventory), and the account erase deletes users/{uid}.
 */
export const PRODUCT_NAME_PRIVACY_LINE = "Only you can see this, in this check. It is never sent to Echo or any AI, and is deleted with your account.";

interface ProductNameBoxProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/** One optional, plain-text box under a picked option, with a visible counter. */
export function ProductNameBox({ label, value, onChange }: ProductNameBoxProps) {
  const id = useId();
  const atLimit = value.length >= PRODUCT_NAME_MAX;
  return (
    <div className="col-span-2 flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-brand-ink">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        maxLength={PRODUCT_NAME_MAX}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-line ${id}-count`}
        // Plain text only; nothing here is autocompleted, checked or sent anywhere while typing.
        autoComplete="off"
        spellCheck={false}
        className="min-h-12 w-full resize-y rounded-lg border border-brand-line bg-white px-3 py-2.5 text-base text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:ring-offset-2"
      />
      <div className="flex items-start justify-between gap-3 text-sm text-brand-muted">
        <p id={`${id}-line`}>{PRODUCT_NAME_PRIVACY_LINE}</p>
        {/* The count is read out only at the limit, not on every key. */}
        <p id={`${id}-count`} aria-live={atLimit ? "polite" : "off"} className="shrink-0 tabular-nums">
          {value.length} / {PRODUCT_NAME_MAX}
        </p>
      </div>
    </div>
  );
}
