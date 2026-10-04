// Every sentence the dashboard shows (docs/lanes/dashboard-design.md §3, §4).
// tests/dashboard-copy.test.ts runs each one, and every JSX text in
// components/dashboard, through the D-12 word checks. The only digits the page
// shows are the starting-check count and dates.

export const DASHBOARD_COPY = {
  title: "Your skin checks",
  signedOut: "Sign in to see your skin checks.",
  signIn: "Sign in",
  loading: "Loading your checks…",
  error: "We couldn't load your checks just now. Refresh the page to try again.",
  empty: "You have no skin checks yet.",
  firstCheck: "Take your first Skin Check",
  newCheck: "Take a new Skin Check",

  current: {
    title: "Your newest photo reading",
    none: "None of your checks has a photo reading yet.",
    checkedOn: (date: string) => `Checked on ${date}`,
    newerNotShown: "Your newest check is not shown here: it has no reading from our server yet. This is the most recent reading there is.",
    unreadable: "The readings of this check could not be shown.",
    hardToRead: (areas: string) => `Hard to read in this photo: ${areas}. Those readings are uncertain.`,
    knownTitle: "What this tells you",
    known: "How each area of your face showed up in this one photo, as Low, Moderate or Elevated.",
    notKnownTitle: "What this does not tell you",
    notKnown: [
      "It is not a medical opinion.",
      "It does not measure pores or how dry your skin is.",
      "It does not set you against other people.",
      "Light, camera angle and distance shape every photo.",
    ],
  },

  photoCheck: {
    pass: "Photo checks on your phone: passed.",
    override: "Photo checks on your phone: you chose to use this photo after a retake was suggested.",
    unchecked: "Photo checks on your phone: could not run on this device.",
    not_recorded: "Photo checks on your phone: not recorded for this check.",
  },

  legacyPastNote: "This check's reading was saved by the app on your phone. Our server has no readable copy of it.",

  legacyNote: "This reading was saved by the app on your phone. Our server has no readable copy of it, so it is shown as it was saved and is not used as a starting check.",

  trend: {
    title: "Starting point",
    empty: "Nothing to show yet.",
    notEnough: "Not enough evidence yet.",
    count: (n: number, of: number) => `Starting checks: ${n} of ${of}`,
    howItForms: (of: number) => `Your first ${of} photo checks form your starting point. Your newest check is never counted as one of them.`,
    set: "Your starting point is set, but photo-to-photo variation has not been measured yet, so no trend is shown.",
    boundary: "Your checks were read by different versions of the analysis software, so they are not used together.",
    legacy: "Readings saved only by the app on your phone are not starting checks.",
  },

  history: {
    title: "Past checks",
    justNow: "Just now",
    kind: {
      reading: "Photo reading",
      legacy: "Reading saved by the app only",
      failed: "Photo could not be read",
      questions: "Questions only",
    },
    openLabel: (date: string) => `Open the check from ${date}`,
    checkFrom: (date: string) => `Check from ${date}`,
    back: "Back to your dashboard",
    notFound: "This check could not be found.",
    onlyNewest: "Readings are shown for your newest photo reading only. Each reading is relative to its own photo, so past checks are listed by date.",
  },

  chat: {
    title: "Ask Echo",
    body: "Ask Echo about your newest photo reading.",
    button: "Chat with Echo",
    needsReading: "Echo needs a check with a photo reading.",
  },

  routine: {
    title: "Your routine",
    link: "Open your routine",
  },

  privacy: {
    title: "Your privacy",
    aiOn: "Sharing with the AI assistant: on.",
    aiOff: "Sharing with the AI assistant: off. Echo will ask you again the next time you chat.",
    aiNotAsked: "Sharing with the AI assistant: not asked yet. Echo asks the first time you chat.",
    stop: "Stop sharing with the AI assistant",
    saving: "Saving…",
    loading: "Loading your sharing setting…",
    loadFailed: "Your sharing setting could not be loaded. Refresh the page to try again.",
    failed: "That did not save. Please try again.",
    stale: "This page is out of date. Please reload it and try again.",
    photoKept: "Photo of your newest photo check: kept.",
    photoNotKept: "Photo of your newest photo check: not kept.",
    delete: "Delete your account and data",
  },
} as const;
