// Wave 2 shared shape. Types only. No lane edits lib/contracts/ (docs/lanes/README.md, TD-13).
//
// The red-flag interlock's answer (RECOMMENDATION_MODEL §4, GEMINI_BOUNDARY §6;
// tracker E05). Internal: a rule id can reveal the answer behind it (for
// example a hormonal pattern from female_skin_context), so Gemini sees only
// ContextSafety.

interface SafetyCommon {
  rulesetVersion: string;
  reviewStatus: "provisional" | "clinically_reviewed";
  /** Privacy decision 8: answers that call for extra caution (EXTRA_CAUTION_TRIGGERS), as one flag. */
  extraCaution: boolean;
}

export type SafetyState = SafetyCommon &
  (
    | { redFlag: false }
    | {
        redFlag: true;
        /** The named rules that raised it; at least one. */
        raisedBy: [string, ...string[]];
      }
  );
