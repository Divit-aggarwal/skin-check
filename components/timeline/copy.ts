// Every word the timeline shows (TD-24 (2): checks and routine events on one
// timeline). Dates, kinds and what the user logged only: never a reading, never
// a link between a routine entry and a check (D-12). tests/timeline.test.ts runs
// each string through every banned-word check.
export const TIMELINE_COPY = {
  title: "Timeline",
  recent: "Recently",
  seeAll: "See full timeline",
  empty: "Nothing here yet. Your checks and your routine entries will show here by date.",
  routineKind: "Routine",
  routine: {
    start: (name: string) => `Added to your routine: ${name}`,
    stop: (name: string) => `Stopped using: ${name}`,
    substitute: (name: string, to: string) => `Swapped ${name} for ${to}`,
    schedule_change: (name: string) => `New schedule for ${name}`,
    usage: (name: string, slot: string, status: string) => `${status}: ${name}, ${slot}`,
  },
  openCheck: (date: string) => `Open the check from ${date}`,
  openRoutine: "Open your routine",
} as const;
