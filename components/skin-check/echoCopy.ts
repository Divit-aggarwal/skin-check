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
  // TD-50 (mockup 18): what Echo does. It talks through your checks; it never decides.
  meet: "Meet",
  tagline: "Talks you through your checks",
  does: ["Goes through your readings", "Answers in plain words", "Never decides for you"],
  doesLabel: "What Echo does",
  // G37 (mockup 18): Echo's hello beside its avatar, and quick actions to pages that exist.
  hello: "Hi, I'm Echo.",
  helloLine: "Here to talk you through your checks.",
  quickTitle: "Quick actions",
  quick: {
    check: { title: "New skin check", body: "Take a new photo" },
    routine: { title: "My routine", body: "Today's steps" },
    checks: { title: "My checks", body: "Your past checks" },
  },
  areaHint: "Each area has its own conversation.",
  areaPicker: "Ask about one area of your face",
  openCheck: "Open this check",
  placeholder: (area: string) => `Ask Echo about your ${area}`,
  send: "Send",
  startersLabel: "Questions to ask Echo",
  newCheck: "Take a new Skin Check",
  signIn: "Sign in",
  signedOut: "Sign in to talk with Echo about your newest check.",
  loadFailed: "Echo could not load your checks just now.",
  tryAgain: "Try again",
  // TD-29 (5): the off switch and the per-user daily limit.
  off: ECHO_OFF_COPY,
  dailyLimit: ECHO_DAILY_LIMIT_COPY,
  limitUnavailable: "Echo can't check your settings right now. Please try again.",
  // TD-34: Echo's suggested routine and the product cards.
  openingLoading: "Echo is putting together a suggested routine…",
  openingFailed: "Echo could not put together a suggested routine just now.",
  productsLabel: "Suggested products",
  keyIngredient: "Key ingredient",
  howToUse: "How to use",
  echoNote: "Echo's note",
  onStore: "See it on the store",
  opensNewTab: "(opens in a new tab)",
} as const;
