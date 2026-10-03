// Every user-facing routine string, in one place so tests/routine-copy.test.ts
// can check them all against the D-12 word list (lib/catalog/wording.ts).
// The routine page shows the user's own record only: no skin data, no product
// claims (R-4 A).
export const ROUTINE_COPY = {
  title: "My routine",
  // R-1 A purpose. Moves to lib/consent.ts when the privacy lane takes it (D-16).
  purpose:
    "So you can keep a record of your own routine and see it back. Only you see it. It is not used for analytics, not sent to Gemini and not joined to your scans.",
  signIn: "Sign in to see your routine.",
  loading: "Loading…",
  error: "Something went wrong. Please try again.",
  empty: "No products in your routine yet.",
  otherProduct: "Other product (not ours)",
  slot: { AM: "Morning", PM: "Evening", AM_PM: "Morning and evening" },
  weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  add: "Add a product",
  addButton: "Add",
  product: "Product",
  when: "When",
  days: "Days",
  stop: "Stop",
  swapFor: "Swap for",
  swapButton: "Swap",
  today: "Today",
  used: "Used",
  skipped: "Skipped",
  status: { used: "Used", skipped: "Skipped", unknown: "Not logged" },
  last7: "Your last 7 days",
  note: "A day you did not log shows as not logged.",
  since: (date: string) => `Since ${date}`,
  counts: (c: { used: number; skipped: number; unknown: number }) =>
    `${c.used} used · ${c.skipped} skipped · ${c.unknown} not logged`,
} as const;
