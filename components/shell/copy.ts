// Every word the app shell shows (G03, docs/design/map.md). Checked against the
// D-12 word lists in tests/shell.test.ts.
export const SHELL_COPY = {
  brand: "The Project SKIN",
  skip: "Skip to content",
  navLabel: "Main",
  nav: {
    home: "Today", // TD-50 (b)
    checks: "Skin Twin", // TD-51, mockup bottom bar
    newCheck: "New check",
    progress: "Progress", // TD-51; /routine stays reachable from Today and Skin Twin
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
  goHome: "Go to Today",
  startCheck: "Start a check",
} as const;
