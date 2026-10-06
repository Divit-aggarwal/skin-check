// Every new word on /account (G03 3.7). Checked by tests/ui-wording.test.ts.
export const ACCOUNT_COPY = {
  title: "Your account",
  signedOutIntro: "Sign in with your phone number to keep your checks, your routine and your chats with Echo across visits.",
  signedInIntro: "Your sign-in, what you share, and deleting your data.",
  signedIn: "Signed in",
  signedInAs: "Signed in as",
  signOut: "Sign out",
  deleteTitle: "Delete your account",
  deleteButton: "Delete my account and data",
  typeToConfirm: (phrase: string) => `Type ${phrase} to confirm.`,
  deletePermanently: "Delete permanently",
  cancel: "Cancel",
  deleting: "Deleting…",
  startCheck: "Start a new check",
} as const;
