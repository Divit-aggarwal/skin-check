// TD-33 (1): every sentence about the optional questions, in one place, so the
// D-12 wording test (tests/ui-wording.test.ts) checks them all.

export const QUESTIONS_COPY = {
  title: "About the questions",
  // Count and minutes come from the real list for this user (questionSteps).
  // TD-44: "up to" on the first screen, before gender is known.
  howMany: (count: number, minutes: number, upTo = false) =>
    `There are ${upTo ? "up to " : ""}${count} questions about your skin, the products you use and your habits. They take about ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
  whyTitle: "Why we ask",
  why: "A photo shows how your skin looks today. It cannot show what you use on it or what else is going on. With your answers, Echo can talk you through your readings.",
  // TD-29 (5): when Echo is switched off, nothing on screen promises it.
  whyNoEcho: "A photo shows how your skin looks today. It cannot show what you use on it or what else is going on. Your answers are kept with this check.",
  skipTitle: "If you skip for now",
  skip: [
    "You still get your photo check and your readings.",
    "Echo cannot answer questions about this check until the questions are done.",
    "You can answer them later from Home or Account.",
  ],
  skipNoEcho: ["You still get your photo check and your readings.", "You can answer them later from Home or Account."],
  answerNow: "Answer the questions now",
  skipAsk: "Skip the questions",
  skipNow: "Skip for now",

  // TD-44: "are you sure?" before a skip. Every line is checked against the
  // code (H03 field list, consent copy, asia-south1); legal review in TD-44.
  confirmTitle: "Skip the questions?",
  confirmWhy: "Echo can talk you through your readings and suggest a routine only if you answer them.",
  confirmWhyNoEcho: "A photo cannot show what you use on your skin. Your answers add that to your check.",
  confirmStored: "Your answers are stored with your account on Google Cloud servers in India.",
  confirmEcho: "When you use Echo, the answers it needs are sent to Google, outside India, to write its replies.",
  confirmHidden: "Echo never receives some of your answers, such as those about periods or pregnancy.",
  confirmLater: "You can answer the questions later from Home or Account, update them at your next check, and delete your account and data at any time from Account.",

  // Results screen, after a skip.
  skippedNote: "You skipped the questions. Echo can answer questions about this check once they are done.",
  skippedNoteNoEcho: "You skipped the questions. You can answer them later from Home or Account.",
  answerLink: "Answer the questions",

  // Home card and Account.
  cardTitle: "Your Skin Check questions",
  // Named by date, not "newest": the waiting check is Echo's check when that one waits (flow review M3).
  cardFor: (date: string | null) => (date ? `You skipped the questions for your check from ${date}.` : "You skipped the questions for one of your checks."),
  cardEcho: "Answer them so Echo can help with your questions.",
  cardNoEcho: "You can answer them now.",

  // Echo, for a check with no answers.
  echoNotice: "Echo can answer questions about this check once its Skin Check questions are done.",

  // The answer-later page.
  pageTitle: "Skin Check questions",
  pageIntro: (date: string) => `For your check from ${date}.`,
  pageIntroNoDate: "For your newest check.",
  continue: "Continue",
  answerAll: "Answer every question in this part to go on.",
  notNow: "Not now, go to Home",
  home: "Go to Home",
  back: "Back",
  save: "Save my answers",
  saving: "Saving…",
  saved: "Your answers are saved with this check.",
  savedEcho: "Echo can now help with your questions about it.",
  goEcho: "Ask Echo",
  saveFailed: "We couldn't save your answers just now. Check your connection and try again.",
  nothing: "There are no questions waiting. Your newest check already has its answers, or you have no checks yet.",
  signedOut: "Sign in to answer your Skin Check questions.",
  loadFailed: "We couldn't load your checks just now. Refresh the page to try again.",

  // An opened check.
  checkSkipped: "The questions were skipped for this check.",
  checkSkippedClosed: "Only the questions of your newest check can be answered later.",
  // The two headings under it are the options' own labels (productNameLabel).
  namedTitle: "Products you named",
} as const;
