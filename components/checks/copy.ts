// Every new word on the Checks screens (G03 3.3, 3.4; TD-50 screens 09–13).
// Dates, kinds, photo checks and kept photos in lists; readings as level words
// only, always with DASHBOARD_COPY.history.pastLine (TD-24 (1)). Checked by
// tests/ui-wording.test.ts.
export const CHECKS_COPY = {
  title: "Checks",
  kicker: "History",
  views: "Show checks as",
  overview: "Overview",
  readings: "Readings",
  photos: "Photos",
  timeline: "Timeline",
  count: (n: number) => (n === 1 ? "1 check" : `${n} checks`),
  opened: "Opened check",
  back: "Back to all checks",
  photoAlt: (date: string) => `Your kept photo from ${date}`,
  photoLoading: "Loading your photo",
  photoNone: "Photo not available",
  askEcho: "Ask Echo about this check",
  echoNewestOnly: "Echo talks about your newest check only.",
  noReadings: "This check has no photo reading.",
  pick: "Pick a check to open it here.",
  notFoundBody: "It may have been deleted, or the address is mistyped. Your checks are in the list.",

  // 10: the newest reading on the Overview.
  latest: "Latest check",
  areasHint: "Tap an area of the face to ask Echo about it.",
  routineDays: (n: number) => `${n} of 7 days`,
  routineDaysNote: "routine days logged",

  // 12 Readings, and 11: one reading at each check.
  readingsIntro: "Your newest whole-face reading. Tap one to see its level at each check.",
  allReadings: "All readings",
  pickReading: "Pick a reading",
  readingIntro: "Whole face, at each check, newest first. Open a check to see each area.",
  readingAt: (date: string) => `Latest check, ${date}`,

  // 12 Photos.
  photosIntro: "Photos you chose to keep, newest first. Tap one to open its check.",
  photosNone: "No kept photos. A photo is kept only when you agree to it at a check.",
} as const;
