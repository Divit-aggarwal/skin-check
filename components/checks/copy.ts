// Every new word on the Checks screens (G03 3.3, 3.4). Dates, kinds, photo
// checks and kept photos in lists; readings only inside one opened check,
// always with DASHBOARD_COPY.history.pastLine (TD-24 (1)). Checked by
// tests/ui-wording.test.ts.
export const CHECKS_COPY = {
  title: "Checks",
  kicker: "History",
  views: "Show checks as",
  list: "List",
  timeline: "Timeline",
  count: (n: number) => (n === 1 ? "1 check" : `${n} checks`),
  opened: "Opened check",
  back: "Back to all checks",
  photoAlt: (date: string) => `Your kept photo from ${date}`,
  photoLoading: "Loading your photo",
  askEcho: "Ask Echo about this check",
  echoNewestOnly: "Echo talks about your newest check only.",
  noReadings: "This check has no photo reading.",
  pick: "Pick a check to open it here.",
} as const;
