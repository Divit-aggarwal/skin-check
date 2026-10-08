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
  // The store's four steps (theprojectskin.com). "Treat" is allowed as this
  // exact label only (owner decision TD-26 (1), lib/catalog/wording.ts
  // STEP_LABEL_EXCEPTIONS); the key stays "serum", the catalogue category.
  steps: { cleanse: "Cleanse", serum: "Treat", moisturise: "Moisturise", protect: "Protect" },
  stepNumber: (n: number) => `Step ${n}`,
  emptyStep: "Nothing in this step yet.",
  emptySlot: "No products yet.",
  addToSlotLabel: (slot: string) => `Add a product, ${slot}`,
  addToStep: "Add a product",
  addToStepLabel: (step: string, slot: string) => `Add a product to ${step}, ${slot}`,
  eveningProtect: "Sunscreen is a morning step.",
  otherGroup: "Other products",
  // TD-29 (1): two of our own products (Clear Seal, Active Boba) are not one of the four steps either.
  otherNote: "Products that are not one of the four steps are listed here.",
  todayStatus: (status: string) => `Today: ${status}`,
  notToday: "Not on today's days",
  noProductForStep: "No other product of ours fits this step right now. You can add a product that is not ours.",
  addFor: (step: string) => `Adding to ${step}`,
  allSteps: "Any step",
  stepLabel: "Step",
  manage: "Change or stop",
  stepOf: (step: string) => `Step: ${step}`,
  nothingToday: "Nothing on your routine for today.",
  open: "Open your routine",
  logAs: (status: string, name: string, slot: string) => `${status}: ${name}, ${slot}`,
  last7: "Your last 7 days",
  note: "A day you did not log shows as not logged.",
  since: (date: string) => `Since ${date}`,
  counts: (c: { used: number; skipped: number; unknown: number }) =>
    `${c.used} used · ${c.skipped} skipped · ${c.unknown} not logged`,
} as const;
