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

  // Redesign 21 (TD-50): Profile / Skin / Privacy. Goals has no data, so no tab.
  tabsLabel: "Account sections",
  tabs: { profile: "Profile", skin: "Skin", privacy: "Privacy" },
  settingsTitle: "Settings",
  cityRow: "City",
  cityNotSet: "Not set",
  notificationsRow: "Notifications",
  privacyRow: "Privacy and data",
  skinTitle: "Your Skin Check answers",
  skinBody: "Your answers are kept with the check you gave them in. You can change them at your next check.",

  // Redesign 20: notifications. Only the daily reminder exists today (TD-47).
  notifications: {
    back: "Back to your account",
    title: "Notifications",
    intro: "What we may send you, and when you get it.",
    // G31: per-type choices are shown, never saved, until the backend exists.
    typesTitle: "Reminder types",
    typesNote: "These choices come later. Nothing here is saved yet.",
    later: "Comes later",
    groups: [
      { title: "Routine", items: ["Morning routine", "Evening routine"] },
      { title: "Checks", items: ["Weekly check"] },
      { title: "Products", items: ["Product reminders"] },
      { title: "Updates", items: ["Weekly summary", "Tips from Echo"] },
      { title: "Offers (optional)", items: ["Product launches and offers"] },
    ],
  },

  // Redesign 22: privacy and data.
  privacy: {
    // H36: DRAFT wording; legal review (H29) before any of this goes live.
    choicesTitle: "More sharing choices",
    choicesTag: "Draft",
    choices: ["Processing my photos", "Personalising my routine and Echo", "Echo using my past checks", "Research without my name", "Product news and offers"],
    // H37
    exportRow: "Download my data",
  },
} as const;
