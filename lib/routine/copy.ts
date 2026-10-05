// Every user-facing routine string, in one place so tests/routine-copy.test.ts
// can check them all against the D-12 word list (lib/catalog/wording.ts).
// The routine page shows the user's own record only: no skin data, no product
// claims (R-4 A).
import { ROUTINE_PURPOSE_COPY } from "@/lib/consent";

export const ROUTINE_COPY = {
  title: "My routine",
  // R-1 A purpose; the text lives with the other purposes in lib/consent.ts (D-16).
  purpose: ROUTINE_PURPOSE_COPY,
  signIn: "Sign in to see your routine.",
  signInButton: "Sign in",
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
  swapPlaceholder: "Choose a product",
  productPlaceholder: "Choose a product",
  addHint: "Choose a product and at least one day to add it.",
  yourProducts: "Your products",
  stopLabel: (name: string) => `Stop using ${name}`,
  swapLabel: (name: string) => `Swap ${name} for another product`,
  tryAgain: "Try again",
  today: "Today",
  used: "Used",
  skipped: "Skipped",
  status: { used: "Used", skipped: "Skipped", unknown: "Not logged" },
  todayTitle: "Today's routine",
  nothingToday: "Nothing on your routine for today.",
  open: "Open your routine",
  logAs: (status: string, name: string, slot: string) => `${status}: ${name}, ${slot}`,
  last7: "Your last 7 days",
  note: "A day you did not log shows as not logged.",
  since: (date: string) => `Since ${date}`,
  counts: (c: { used: number; skipped: number; unknown: number }) =>
    `${c.used} used · ${c.skipped} skipped · ${c.unknown} not logged`,
} as const;
