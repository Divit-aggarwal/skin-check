// Supabase's phone auth requires E.164 (+<countrycode><number>). The
// existing quiz phone field (lib/skin-check-validation.ts) already assumes
// India-only 10-digit numbers, optionally already prefixed with "91" — this
// mirrors that same assumption rather than inventing a general E.164 parser
// the product doesn't need yet.
export function toE164India(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return null;
}
