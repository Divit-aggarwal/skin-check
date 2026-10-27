// Firebase needs E.164 (+<country><national>). The product is India-only
// today, but the country is data here rather than a literal in the auth code
// so adding one is an entry in this array, not a rewrite: `usePhoneAuth`,
// `PhoneAuthForm` and `toE164` all read it off the Country.
export interface Country {
  iso: string;
  dialCode: string;
  label: string;
  /** Digits expected after the dial code — also what the input caps at. */
  nationalDigits: number;
}

export const COUNTRIES: Country[] = [
  { iso: "IN", dialCode: "+91", label: "India", nationalDigits: 10 },
];

export const DEFAULT_COUNTRY = COUNTRIES[0]!;

/**
 * Normalizes what the user typed into E.164, or null if it can't be one.
 * Tolerates a leading country code the user pasted in themselves (a stored
 * "+91 98765 43210" round-trips) rather than rejecting it as too long.
 */
export function toE164(input: string, country: Country = DEFAULT_COUNTRY): string | null {
  const cc = country.dialCode.replace(/\D/g, "");
  let digits = input.replace(/\D/g, "");
  if (digits.length === country.nationalDigits + cc.length && digits.startsWith(cc)) {
    digits = digits.slice(cc.length);
  }
  return digits.length === country.nationalDigits ? `${country.dialCode}${digits}` : null;
}
