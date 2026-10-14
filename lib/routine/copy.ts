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
  // TD-49: an undo shows as "Undone" on the timeline; the slot then reads "Not logged".
  status: { used: "Used", skipped: "Skipped", unknown: "Not logged", cleared: "Undone" },
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
  otherNote: "Products outside the four steps are listed here.",
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
  // Redesign Phase 2 (TD-50): the slot switch, the one-step-at-a-time mode and
  // the logged state. Counts and names only; no time estimates (none are stored).
  slotSwitch: "Time of day",
  slotTitle: { AM: "Morning routine", PM: "Evening routine" },
  dueCount: (n: number) => (n === 1 ? "1 step today" : `${n} steps today`),
  nothingInSlot: "Nothing on this part of your routine today.",
  start: "Start routine",
  continue: "Continue routine",
  stepOfTotal: (n: number, total: number) => `Step ${n} of ${total}`,
  exit: "Show all steps",
  // Routine Complete (screen 04, no mockup): what was logged, then the next useful action. No streak.
  logged: { AM: "Morning routine logged", PM: "Evening routine logged" },
  usedList: "Used",
  skippedList: "Skipped",
  nextEvening: "Your evening steps start from 3 pm.",
  seeEvening: "See evening steps",
  nextNone: "Nothing else on your routine is due today.",
  backToday: "Back to Today",
  // Redesign lane C (screen 06): the routine set-up cards.
  everyDay: "Every day",
  addIntro: "Pick a step, then one of our products or your own.",
} as const;
