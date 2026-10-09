// TD-33 (1): every sentence about the optional questions, in one place, so the
// D-12 wording test (tests/ui-wording.test.ts) checks them all.

export const QUESTIONS_COPY = {
  title: "About the questions",
  // Count and minutes come from the real list for this user (questionSteps).
  howMany: (count: number, minutes: number) =>
    `There are ${count} questions about your skin, the products you use and your habits. They take about ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
  whyTitle: "Why we ask",
  why: "A photo shows how your skin looks today. It cannot show what you use on it or what else is going on. With your answers, Echo can talk you through your readings.",
  skipTitle: "If you skip for now",
  skip: [
    "You still get your photo check and your readings.",
    "Echo cannot answer questions about this check until the questions are done.",
    "You can answer them later from Home or Account.",
  ],
  answerNow: "Answer the questions now",
  skipNow: "Skip for now",

  // Results screen, after a skip.
  skippedNote: "You skipped the questions. Echo can answer questions about this check once they are done.",
  answerLink: "Answer the questions",

  // Home card and Account.
  cardTitle: "Your Skin Check questions",
  cardBody: "You skipped the questions for your newest check. Answer them so Echo can help with your questions.",

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
  // The two headings under it are the options' own labels (productNameLabel).
  namedTitle: "Products you named",
} as const;
