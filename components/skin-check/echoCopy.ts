import { ECHO_DAILY_LIMIT_COPY, ECHO_OFF_COPY } from "@/lib/echo-limits";

// Every new word on the Echo screen (G03 3.6). Checked by
// tests/ui-wording.test.ts with every D-12 lexicon.
export const ECHO_COPY = {
  title: "Echo",
  intro: (date: string) => `Talk through your check from ${date}. Echo talks about one photo at a time and is not a medical opinion.`,
  loading: "Getting your newest check ready for Echo…",
  talkingAbout: "Talking about",
  checkFrom: (date: string) => `Check from ${date}`,
  readingsSummary: "The readings of this check",
  areaPicker: "Ask about one area of your face",
  wholeFace: "Whole face",
  openCheck: "Open this check",
  placeholder: (area: string) => `Ask Echo about your ${area}`,
  send: "Send",
  newCheck: "Take a new Skin Check",
  signIn: "Sign in",
  signedOut: "Sign in to talk with Echo about your newest check.",
  loadFailed: "Echo could not load your checks just now.",
  tryAgain: "Try again",
  // TD-29 (5): the off switch and the per-user daily limit.
  off: ECHO_OFF_COPY,
  dailyLimit: ECHO_DAILY_LIMIT_COPY,
} as const;
