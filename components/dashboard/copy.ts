// Every sentence the dashboard shows (docs/lanes/dashboard-design.md §3, §4).
// tests/dashboard-copy.test.ts runs each one, and every JSX text in
// components/dashboard, through the D-12 word checks. The only digits the page
// shows are the starting-check count and dates.

export const DASHBOARD_COPY = {
  title: "Your skin checks",
  // O-D3: the link to /dashboard from the results screen, /account and the signed-in start page.
  entryLink: "Go to Home",
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
    eyebrow: "Latest check",
    noneTitle: "Your photo readings",
    openCheck: "Open this check",
    wholeFace: "Whole face",
    areaPicker: "Show readings for",
    noAreaReading: (area: string) => `No reading for ${area} in this photo.`,
    areaHint: "Choose an area to see its readings. Choose it again for the whole face.",
    areaNote: "Every area is read from this one photo. Each reading belongs to this photo only.",
    newerNotShown: "Your newest check has no photo reading from our server. The reading below is from an earlier check.",
    unreadable: "The readings of this check could not be shown.",
    hardToRead: (areas: string) => `Hard to read in this photo: ${areas}. Those readings are uncertain.`,
    knownTitle: "What this tells you",
    known: "How redness and oiliness showed up in each area of your face in this one photo, as Low, Moderate or Elevated.",
    notKnownTitle: "What this does not tell you",
    notKnown: [
      "It is not a medical opinion.",
      "It does not measure breakouts, texture, dark marks, pores or how dry your skin is.",
      "It does not set you against other people.",
      "Light, camera angle and distance shape every photo.",
    ],
  },

  // TD-37 (3): Breakouts, Texture and Dark marks, from the user's own answers only.
  told: {
    sources: "Redness and oiliness are read from your photo. Breakouts, texture and dark marks show what you told us in the questions. The photo does not measure them.",
    title: "From what you told us",
    ownAnswer: "Your own answer, not a reading of your photo.",
    nothing: (topic: string) => `You did not tell us anything about ${topic} in the questions.`,
    skipped: (topic: string) => `You skipped the questions, so there is nothing here about ${topic} yet.`,
    listTitle: "Breakouts, texture and dark marks",
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
    empty: "Nothing to show.",
    notEnough: "Not enough evidence.",
    count: (n: number, of: number) => `Starting checks: ${n} of ${of}`,
    howItForms: (of: number) => `Your first ${of} photo checks form your starting point. Your newest check is never counted as one of them.`,
    set: "Your starting point is set, but photo-to-photo variation has not been measured, so no trend is shown.",
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
    // TD-24 (1): on every opened check, always visible. Fixed owner wording.
    pastLine: "Photos differ in light and angle. Differences between checks are not yet a measured change.",
    allChecks: "All checks",
    notFound: "This check could not be found.",
  },

  home: {
    newCheckTitle: "A new check",
    newCheckBody: "Take a photo check in good, even light, facing the camera.",
    tryAgain: "Try again",
  },

  chat: {
    title: "Ask Echo",
    body: "Ask Echo about your newest photo reading.",
    button: "Chat with Echo",
    needsReading: "Echo talks about a photo reading from our server. Take a new check to chat with Echo.",
    needsFirst: "Echo talks about a photo reading. Take your first check to chat with Echo.",
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
    stop: "Stop sharing",
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
