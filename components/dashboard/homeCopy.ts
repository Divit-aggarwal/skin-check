// TD-47: every new sentence on Home, the permissions screen and Account's
// Home settings. tests/home-v2-wording.test.ts and tests/dashboard-copy.test.ts
// run each one through the D-12 word checks; the weather lines also never
// name the skin or a reading.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const HOME_COPY = {
  greeting: { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening" },
  greetingName: (hello: string, name: string) => `${hello}, ${name}`,

  next: {
    title: "Next check",
    first: "Take your first check to start.",
    noReading: "No photo reading yet.",
    noReadingNote: "Your checks so far have no photo reading. Take a new check to start the count.",
    in: (n: number) => `Next check in ${plural(n, "day", "days")}`,
    today: "Due today",
    overdue: (n: number) => `Overdue by ${plural(n, "day", "days")}`,
    every: (n: number) => `We suggest a check every ${n} days.`,
    starting: (n: number, of: number) => `${n} of ${of} starting checks`,
    tip: "Take each photo the same way: same place, same light, facing the camera, no makeup.",
    take: "Take check",
    iosHint: "On iPhone, add this site to your Home Screen (Share, then Add to Home Screen) to get reminders.",
    remindersAsk: "Get a reminder on this device when your check is due.",
    remindersOn: "Turn on reminders",
    remindersBlocked: "Reminders are blocked for this site in your browser. To get them, allow notifications in your browser's site settings, then reload.",
  },

  latest: {
    eyebrow: "Latest check",
    title: "Your latest check",
    ago: (days: number) => (days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`),
    checkedOn: (date: string, ago: string) => `Checked on ${date}, ${ago}`,
    readingsTitle: "Whole face",
    meaningTitle: "What this means",
    open: "Open full check",
    history: "Check history",
    none: "You have no skin checks yet. Your first check takes about two minutes.",
    // TD-47 design review: the empty card has no button; Next check holds the one way in.
    analysing: "Your newest check is still being read. Refresh this page in a minute.",
    analysingBelow: (date: string) => `Below: your check from ${date}.`,
    refresh: "Refresh",
    noReading: "This check has no photo reading. Take a new check in good, even light.",
    photoAlt: "Your kept photo from this check",
  },

  routine: {
    done: (n: number, of: number) => `${n} of ${of} done`,
    markDone: "Mark done",
    isDone: "Done",
    markDoneLabel: (name: string, slot: string) => `Mark done: ${name}, ${slot}`,
    streak: (n: number) => `${plural(n, "day", "days")} in a row with at least one step logged.`,
    streakNone: "Log a step today to start a run of days.",
    empty: "Set up your routine to see today's steps here.",
    setUp: "Set up your routine",
    skippedToday: "Skipped today",
  },

  weather: {
    title: "Weather and air today",
    updated: (city: string, time: string) => `${city}, updated ${time}`,
    uv: "UV index",
    uvNote: (category: string) => `${category}, today's peak`,
    humidity: "Humidity",
    humidityValue: (n: number) => `${Math.round(n)}%`,
    air: "Air",
    airNote: (category: string) => `${category} (US AQI)`,
    why: "See the UV index, humidity and air quality for your city, to plan sunscreen and time outdoors.",
    useLocation: "Use my location",
    typeCity: "Type my city",
    cityLabel: "Your city",
    search: "Search",
    noMatch: "No city found with that name. Try the nearest large city.",
    choose: (name: string, region: string) => `Use ${name}${region ? `, ${region}` : ""}`,
    blocked: "Location is blocked for this site in your browser. To use it, allow location in your browser's site settings, then reload. Or type your city.",
    unsupported: "This browser cannot share a location. Type your city instead.",
    locating: "Finding your city…",
    locateFailed: "Your location could not be read. Type your city instead.",
    loading: "Loading the weather…",
    lastKnown: (time: string) => `Not updated right now. Showing the weather from ${time}.`,
    unavailable: "The weather is not available right now.",
    change: "Change city",
    source: "Weather data by Open-Meteo.com",
    places: "Places from GeoNames.org",
  },

  record: {
    title: "Your record",
    routineDays: (n: number) => `Routine days logged in the last 7 days: ${n}`,
    checks: (n: number) => `Checks taken: ${n}`,
  },

  echo: {
    title: "Ask Echo",
    tryOne: "Tap a question to ask Echo.",
    open: "Chat with Echo",
    needsAnswers: "Answer the questions from your check, then ask Echo about it.",
  },

  banner: {
    line: "Ready for a new photo? Use good, even light and face the camera.",
    start: "Start new check",
  },

  // TD-48: the phone Home (below 1024px).
  today: {
    title: "Today",
    // "X/Y today" inside the ring, on two lines.
    ringCount: (done: number, total: number) => `${done}/${total}`,
    ringToday: "today",
    ringLabel: (done: number, total: number) => `${done} of ${total} routine steps done today`,
    streak: (n: number) => (n > 0 ? `${n} ${n === 1 ? "day" : "days"} in a row` : "Log a step to start a run"),
    nextIn: (n: number) => `Next check in ${n} ${n === 1 ? "day" : "days"}`,
    nextToday: "Check due today",
    nextOverdue: (n: number) => `Check overdue by ${n} ${n === 1 ? "day" : "days"}`,
    nextFirst: "Take your first check",
    uv: (value: number, category: string) => `UV ${value}, ${category}`,
    addCity: "Add your city for UV",
    uvDown: "UV not available right now",
    starting: (n: number, of: number) => `${n} of ${of} starting checks`,
    takeCheck: "Take your check",
    markStep: (step: string) => `Mark ${step} done`,
    allDone: "All done today",
    slotDone: { AM: "Morning steps done", PM: "Evening steps done" },
    weatherSheet: "Weather and air details",
    close: "Close",
  },
  routineRow: {
    eveningFrom: "Evening steps from 3 pm",
    morningTomorrow: "Morning steps tomorrow",
    empty: "No routine yet.",
    setUp: "Set up routine",
    undo: (name: string, slot: string) => `Undo: ${name}, ${slot}`,
  },
  latestRow: {
    first: "No check yet. Take your first check",
    more: (n: number) => `+${n} more`,
    open: (date: string) => `Open the check from ${date}`,
    noReading: "No photo reading",
    analysing: "Still being read",
  },
  tiles: {
    // "progress" is a D-12 banned word (TD-47 agent note): the tile keeps the v2 name.
    progress: "Your record",
    progressValue: (n: number) => `${n} of 7 days`,
    progressNote: "routine days logged",
    starting: "Starting checks",
    startingValue: (n: number, of: number) => `${n} of ${of}`,
  },

  permissions: {
    title: "Two quick choices",
    intro: "You can change both at any time in Account.",
    locationTitle: "Location",
    locationWhy: "For today's weather and air in your city.",
    // LEGAL REVIEW NEEDED (TD-47): consent line for location.
    locationConsent:
      "If you allow it, we keep only your city name and a position rounded to about 10 km. Your exact location is never stored or shared. Only the rounded position is sent to our weather provider, without your name or account.",
    remindersTitle: "Reminders",
    remindersWhy: "For your next check and your routine.",
    allow: "Allow",
    notNow: "Not now",
    allowed: "Allowed",
    notNowDone: "Not now",
    refused: "Blocked by your browser. You can change this in your browser's site settings.",
    unsupported: "This browser does not support this.",
    iosHint: "On iPhone, reminders work once you add this site to your Home Screen (Share, then Add to Home Screen).",
    continue: "Continue to Home",
    saveFailed: "Your choices could not be saved. You can set them later in Account.",
  },

  account: {
    title: "Location and reminders",
    location: (state: string) => `Location: ${state}`,
    reminders: (state: string) => `Reminders: ${state}`,
    city: (name: string) => `City: ${name}`,
    noCity: "City: not set",
    states: { allowed: "allowed", not_now: "not now", refused: "blocked by your browser", unsupported: "not supported on this browser", unset: "not chosen yet" },
    removeCity: "Remove city",
    remindersOn: "Turn reminders on",
    remindersOff: "Turn reminders off",
    off: "Reminders are not available yet. Home shows when your next check is due.",
    afterCheck: "You can choose this after your next check.",
    saved: "Saved.",
    failed: "That did not save. Please try again.",
  },
} as const;
