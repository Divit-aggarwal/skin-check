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
} as const;
