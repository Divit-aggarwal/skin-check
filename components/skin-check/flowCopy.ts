// Redesign 05 and 08 (TD-50): the sentences on the start of a check and on the
// weekly check-in preview, in one place for tests/ui-wording.test.ts.

export const START_COPY = {
  title: "Take your skin check",
  // One photo per check (C10 parked); the questions stay optional (TD-33, TD-44).
  intro: "One photo of your face, then a few questions if you choose to answer them.",
  lastTitle: "Last check",
  firstTitle: "No check yet",
  tipLabel: "Tip",
  checkinOpen: "Weekly check-in",
  checkinOpenNote: "Preview: answers are not saved yet.",
} as const;

// E19: there is no weekly check-in question set or storage yet. These three
// questions are a PLACEHOLDER for the screen only (owner to replace with E19);
// none asks the user to compare weeks (TD-47(4)). Nothing is saved.
export const CHECKIN_COPY = {
  title: "Weekly check-in",
  intro: "A few quick questions about your week.",
  back: "Back to the start of your check",
  skip: "Skip",
  save: "Save answers",
  saveLater: "Saving your answers comes later.",
  questions: [
    {
      id: "new_breakouts",
      text: "Any new breakouts this week?",
      options: [
        { value: "none", label: "None" },
        { value: "1-2", label: "1–2" },
        { value: "3-5", label: "3–5" },
        { value: "6-plus", label: "6 or more" },
      ],
    },
    {
      id: "routine_edit",
      text: "Did you start or stop a product this week?",
      options: [
        { value: "no", label: "No" },
        { value: "yes", label: "Yes" },
      ],
    },
    {
      id: "skin_feel",
      text: "How has your skin felt this week?",
      options: [
        { value: "balanced", label: "Balanced" },
        { value: "dry", label: "Dry" },
        { value: "oily", label: "Oily" },
        { value: "sensitive", label: "Sensitive" },
      ],
    },
  ],
} as const;
