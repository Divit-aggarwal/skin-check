// Redesign 05 and 08 (TD-50): the sentences on the start of a check and on the
// weekly check-in preview, in one place for tests/ui-wording.test.ts.

export const START_COPY = {
  title: "Take your skin check",
  // One photo per check (C10 parked); the questions stay optional (TD-33, TD-44).
  intro: "One photo of your face, then a few questions if you choose to answer them.",
  lastTitle: "Last check",
  firstTitle: "No check yet",
  tipLabel: "Tip",
  checkinOpen: "Weekly check-in",
} as const;

// E19 (TD-51 (2)): the check-in's own sentences. The questions and answer
// labels come from lib/feature-contracts/checkin.ts (the user's own words
// about their week; the app never says them about the user).
export const CHECKIN_COPY = {
  title: "Weekly check-in",
  intro: "A few quick questions about your skin this week.",
  back: "Back",
  skip: "Skip",
  steps: ["Photos", "Weekly check-in", "Complete"],
  save: "Continue",
  saving: "Saving…",
  pickOne: "Answer at least one question to save.",
  signedOut: "Sign in to save your check-in.",
  savedTitle: "Check-in saved",
  savedBody: "Thanks. Your answers are kept with this week's check.",
  alreadyTitle: "Already done this week",
  alreadyBody: "You have saved a check-in for this week. You can answer again from Monday.",
  done: "Done",
  outcome: {
    signed_out: "Your session has ended. Sign in again, then save.",
    not_allowed: "This account cannot save a check-in.",
    too_many: "Too many tries just now. Wait a minute, then save again.",
    failed: "We couldn't save your answers. Check your connection and try again.",
  },
} as const;
