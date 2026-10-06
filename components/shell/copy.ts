// Every word the app shell shows (G03, docs/design/map.md). Checked against the
// D-12 word lists in tests/shell.test.ts.
export const SHELL_COPY = {
  brand: "The Project SKIN",
  skip: "Skip to content",
  navLabel: "Main",
  nav: {
    home: "Home",
    checks: "Checks",
    newCheck: "New check",
    routine: "Routine",
    echo: "Echo",
    account: "Account",
  },
  phoneEnding: (last4: string) => `Phone ending ${last4}`,
  signIn: "Sign in",
  loading: "Loading…",
  notFoundTitle: "This page could not be found",
  notFoundBody: "The address may be mistyped, or the page has moved.",
  errorTitle: "Something went wrong",
  errorBody: "This page could not be shown just now. Nothing you saved is lost.",
  tryAgain: "Try again",
  goHome: "Go to Home",
  startCheck: "Start a check",
} as const;
