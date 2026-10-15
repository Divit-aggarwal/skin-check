// Screen 12 (G37, lane mm/a): every word on /progress. Level words and
// timelines of levels only; a change value only through the kit ChangeSlot.
// No claim of change or cause (D-12). Checked by tests/mm-a-copy.test.ts.
import type { SeriesWindow } from "@/lib/feature-contracts/readings-series";

export const PROGRESS_COPY = {
  title: "Your Progress",
  intro: "Your readings at each check, by date.",
  views: "Show this page as",
  overview: "Overview",
  concerns: "Concerns",
  photos: "Photos",
  windowLabel: "Weeks shown",
  window: { "4w": "Last 4 weeks", "8w": "Last 8 weeks", "12w": "Last 12 weeks", all: "All checks" } satisfies Record<SeriesWindow, string>,
  latestIn: "Level at your newest check in these weeks",
  yourPhotos: "Your photos",
  photosIntro: "Photos you chose to keep, by date.",
  viewAllPhotos: "View all photos",
  noPhotos: "No kept photos in these weeks. A photo is kept only when you agree to it at a check.",
  overTime: "Levels by date",
  overTimeIntro: "Your level at each check, oldest first.",
  noChecksInWindow: "No checks in these weeks. Pick more weeks to see older checks.",
  openReading: (label: string) => `Open ${label}`,
  photoAlt: (date: string) => `Your kept photo from ${date}`,
  photoMissing: "Photo not available",
} as const;
