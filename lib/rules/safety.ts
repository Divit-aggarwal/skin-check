import type { CautionAnswer, SafetyState } from "@/lib/contracts/safety-state";
import { matches, normalisedValues, readInput, type Readings, type RulesInput } from "./input";
import { EXTRA_CAUTION_TRIGGERS, RED_FLAG_RULES, REVIEW_STATUS, RULES_ENABLED, RULESET_VERSION, RulesDisabledError } from "./settings";

// E05 red-flag interlock (rules-design §4.1). Quiz answers only. A reused,
// unreadable or contradicted answer still raises a flag: it can add caution,
// never remove it. Gender is never checked here.

/** Every (field, normalised value) that matches an extra-caution trigger. The one matcher for the one list. */
function cautionAnswers(valuesOf: (field: string) => readonly string[]): CautionAnswer[] {
  return EXTRA_CAUTION_TRIGGERS.flatMap((c) => c.anyOf.filter((v) => valuesOf(c.field).includes(v)).map((value) => ({ field: c.field, value })));
}

/**
 * The extra-caution answers evaluateSafety would name, from the same list and
 * matcher, but switch-independent and never throwing: today's Echo prompt
 * (lib/gemini.ts) runs in production builds, where evaluateSafety throws by
 * design (RULES_ENABLED). Privacy decision 8 must hold there too.
 */
export function extraCautionAnswers(answers: unknown): CautionAnswer[] {
  if (answers === null || typeof answers !== "object" || Array.isArray(answers)) return [];
  const own = answers as Record<string, unknown>;
  return cautionAnswers((field) => normalisedValues(Object.hasOwn(own, field) ? own[field] : undefined));
}

export function safetyFrom(readings: Readings): SafetyState {
  const raisedBy = RED_FLAG_RULES.filter((r) => r.when.every((c) => matches(readings, c))).map((r) => r.id);
  const [firstCaution, ...moreCaution] = cautionAnswers((field) => readings[field as keyof Readings]?.values ?? []);
  const common = {
    rulesetVersion: RULESET_VERSION,
    reviewStatus: REVIEW_STATUS,
    ...(firstCaution === undefined
      ? { extraCaution: false as const, extraCautionRaisedBy: [] as [] }
      : { extraCaution: true as const, extraCautionRaisedBy: [firstCaution, ...moreCaution] as [CautionAnswer, ...CautionAnswer[]] }),
  };
  const [first, ...rest] = raisedBy;
  return first === undefined ? { ...common, redFlag: false } : { ...common, redFlag: true, raisedBy: [first, ...rest] };
}

export function evaluateSafety(input: RulesInput): SafetyState {
  if (!RULES_ENABLED) throw new RulesDisabledError();
  return safetyFrom(readInput(input));
}
