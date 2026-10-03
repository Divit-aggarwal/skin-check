import type { SafetyState } from "@/lib/contracts/safety-state";
import { matches, readInput, type Readings, type RulesInput } from "./input";
import { EXTRA_CAUTION_TRIGGERS, RED_FLAG_RULES, REVIEW_STATUS, RULES_ENABLED, RULESET_VERSION, RulesDisabledError } from "./settings";

// E05 red-flag interlock (rules-design §4.1). Quiz answers only. A reused,
// unreadable or contradicted answer still raises a flag: it can add caution,
// never remove it. Gender is never checked here.

export function safetyFrom(readings: Readings): SafetyState {
  const raisedBy = RED_FLAG_RULES.filter((r) => r.when.every((c) => matches(readings, c))).map((r) => r.id);
  const common = {
    rulesetVersion: RULESET_VERSION,
    reviewStatus: REVIEW_STATUS,
    extraCaution: EXTRA_CAUTION_TRIGGERS.some((c) => matches(readings, c)),
  };
  const [first, ...rest] = raisedBy;
  return first === undefined ? { ...common, redFlag: false } : { ...common, redFlag: true, raisedBy: [first, ...rest] };
}

export function evaluateSafety(input: RulesInput): SafetyState {
  if (!RULES_ENABLED) throw new RulesDisabledError();
  return safetyFrom(readInput(input));
}
