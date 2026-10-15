// E19 (TD-51 (2)): weekly check-in, questions from mockup 08. BE3 implements,
// lane B draws screen 08. Self-report only: no score, no change claim, never
// sent to Gemini (like routine data). The answer labels are the user's own
// words about their skin; the app never says them about the user (TD-51 (2)).
//
// Stored at users/{uid}/checkins/{checkinId}, written ONLY by the server
// (append-only: create, never update or delete except by account erase); the
// owner may read. checkinId = "<YYYY-Www>" (ISO week in the user's time zone),
// so one check-in per week; a second submit in the same week is 409.

export const CHECKIN_VERSION = 1 as const;

export interface CheckinOption {
  id: string;
  label: string;
  /** Lucide icon name, or null. Never a skin photo (TD-51 (2)). */
  icon: string | null;
}

export interface CheckinQuestion {
  id: "overall" | "new_breakouts" | "existing_spots" | "routine_changed" | "skin_feel";
  text: string;
  layout: "faces" | "pills" | "tiles";
  options: readonly CheckinOption[];
}

export const CHECKIN_QUESTIONS: readonly CheckinQuestion[] = [
  {
    id: "overall",
    text: "How has your skin been this week?",
    layout: "faces",
    options: [
      { id: "much_better", label: "Much better", icon: "Laugh" },
      { id: "bit_better", label: "A bit better", icon: "Smile" },
      { id: "no_change", label: "No change", icon: "Meh" },
      { id: "bit_worse", label: "A bit worse", icon: "Frown" },
      { id: "much_worse", label: "Much worse", icon: "Angry" },
    ],
  },
  {
    id: "new_breakouts",
    text: "Have you had any new breakouts this week?",
    layout: "pills",
    options: [
      { id: "none", label: "None", icon: null },
      { id: "1_2", label: "1-2", icon: null },
      { id: "3_5", label: "3-5", icon: null },
      { id: "more_5", label: "More than 5", icon: null },
    ],
  },
  {
    id: "existing_spots",
    text: "Any changes in existing spots?",
    layout: "pills",
    options: [
      { id: "fading", label: "Fading", icon: null },
      { id: "no_change", label: "No change", icon: null },
      { id: "worse", label: "Worse", icon: null },
      { id: "not_sure", label: "Not sure", icon: null },
    ],
  },
  {
    id: "routine_changed",
    text: "Did you make any changes to your routine?",
    layout: "pills",
    options: [
      { id: "no", label: "No", icon: null },
      { id: "yes", label: "Yes", icon: null },
    ],
  },
  {
    id: "skin_feel",
    text: "How has your skin felt this week?",
    layout: "tiles",
    options: [
      { id: "balanced", label: "Balanced", icon: "Droplet" },
      { id: "dry", label: "Dry", icon: "Waves" },
      { id: "oily", label: "Oily", icon: "Droplets" },
      { id: "sensitive", label: "Sensitive", icon: "Zap" },
    ],
  },
];

export type CheckinAnswers = Partial<Record<CheckinQuestion["id"], string>>;

export interface CheckinRecord {
  schemaVersion: typeof CHECKIN_VERSION;
  checkinId: string;
  answers: CheckinAnswers;
  /** The check this week's photos belong to, if the check-in followed one. */
  scanId: string | null;
  timeZone: string;
  /** Server time (ISO over the wire). */
  createdAt: string;
}

/**
 * POST /api/checkins body { answers, scanId?, timeZone } → 201 CheckinRecord
 *   400 BAD_REQUEST (unknown question or option, no answers), 401, 403 NOT_ALLOWED,
 *   409 ALREADY_THIS_WEEK, 429 TOO_MANY.
 * GET  /api/checkins?limit=12 → 200 { checkins: CheckinRecord[] } newest first.
 */
export const CHECKINS_ROUTE = "/api/checkins";
