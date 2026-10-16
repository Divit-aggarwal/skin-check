// Redesign 05 and 08 (TD-50): the sentences on the start of a check and on the
// weekly check-in preview, in one place for tests/ui-wording.test.ts.

export const START_COPY = {
  title: "Take your weekly skin check",
  // One photo per check unless the three-angle capture is on (C10); the questions stay optional (TD-33, TD-44).
  intro: "One photo of your face, then a few questions if you choose to answer them.",
  introThree: "Just 3 photos, then a few questions if you choose to answer them.",
  tipThree: "Use natural light and a bare face, in the same place each week.",
  anglesTitle: "The photos in this check",
  angles: [
    { id: "front", label: "Front" },
    { id: "left", label: "Left cheek" },
    { id: "right", label: "Right cheek" },
  ],
  // Mockup: "Your progress". TD-51 allows the word, but the D-12 test still applies the CHANGE lexicon here (hand-back question).
  progressTitle: "Your photos",
  history: "View history",
  noPhotos: "Photos you choose to keep show here.",
  justNow: "Just now",
  photoAlt: (date: string) => `Your photo from ${date}`,
  lastAngleAlt: (angle: string) => `${angle}, from your last kept check`,
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
