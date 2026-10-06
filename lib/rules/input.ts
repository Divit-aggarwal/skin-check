import { createHash } from "node:crypto";
import { SECTIONS } from "@/lib/skin-check-steps";
import { RECONFIRM_EACH_SCAN_IDS } from "@/lib/skin-check-validation";
import { RULE_INPUT_FIELDS, type Condition, type RuleInputField } from "./settings";

// Raw saved answers in, one reading per rule field out (rules-design §3.1).
// Answers are never trusted: own keys only, strings only, checked against the
// quiz options. A bad value makes the field invalid; it is never dropped
// silently, and a caution value next to it still counts.

export interface RulesInput {
  /** The saved questionnaire, as stored. */
  answers: Record<string, unknown>;
  /** Step ids answered or re-confirmed on this scan. Anything not listed is reused (D-19). */
  confirmedThisScan: readonly string[];
}

export interface FieldReading {
  field: RuleInputField;
  /** Sorted, unique, trimmed and lower-cased string values, including unknown ones. */
  values: string[];
  present: boolean;
  valid: boolean;
  fresh: boolean;
  /** Whether the quiz asks this step; "unknown" when that depends on a missing gender. */
  asked: boolean | "unknown";
  reconfirm: boolean;
}

export type Readings = Record<RuleInputField, FieldReading>;

const STEPS = new Map(SECTIONS.flatMap((s) => s.steps).map((step) => [step.id, step]));
const SINGLE = new Set(["single-select-chips", "single-select-cards"]);

function stepFor(field: RuleInputField) {
  const step = STEPS.get(field);
  if (!step || !("options" in step)) throw new Error(`rules: ${field} is not a select step in SECTIONS`);
  return step;
}

/** Sorted, unique, trimmed and lower-cased string values of one raw answer. Never throws. */
export function normalisedValues(raw: unknown): string[] {
  const list = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const strings = list.filter((v): v is string => typeof v === "string");
  return Array.from(new Set(strings.map((v) => v.trim().toLowerCase()).filter((v) => v !== ""))).sort();
}

export function readInput(input: RulesInput): Readings {
  if (input === null || typeof input !== "object") throw new TypeError("rules: input must be an object");
  const { answers, confirmedThisScan } = input;
  if (answers === null || typeof answers !== "object" || Array.isArray(answers)) {
    throw new TypeError("rules: answers must be an object");
  }
  if (!Array.isArray(confirmedThisScan)) throw new TypeError("rules: confirmedThisScan must be a list");
  // A saved questionnaire always has these. None at all means the caller
  // passed the wrong object (a snapshot, a wrapper), not an empty quiz.
  if (!RULE_INPUT_FIELDS.some((f) => Object.hasOwn(answers, f))) {
    throw new TypeError("rules: answers has none of the rule fields");
  }

  const partial = {} as Readings;
  for (const field of RULE_INPUT_FIELDS) {
    const step = stepFor(field);
    const raw = Object.hasOwn(answers, field) ? answers[field] : undefined;
    const list = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
    const strings = list.filter((v): v is string => typeof v === "string");
    // Matching uses trimmed, lower-cased values, so a sloppy caution value
    // still counts. Validity uses the exact strings, so a sloppy value can
    // never make an answer readable enough to unlock the active.
    const values = normalisedValues(raw);
    const exact = Array.from(new Set(strings));
    const options = new Set<string>(step.options.map((o) => o.value));
    const exclusive = "exclusiveValue" in step ? step.exclusiveValue : undefined;
    const max = "maxSelections" in step ? step.maxSelections : undefined;
    const present = values.length > 0;
    const valid =
      present &&
      strings.length === list.length &&
      exact.every((v) => options.has(v)) &&
      (!SINGLE.has(step.type) || exact.length === 1) &&
      (max === undefined || exact.length <= max) &&
      (exclusive === undefined || !exact.includes(exclusive) || exact.length === 1);
    partial[field] = {
      field,
      values,
      present,
      valid,
      fresh: confirmedThisScan.includes(field),
      asked: true,
      reconfirm: RECONFIRM_EACH_SCAN_IDS.includes(field),
    };
  }

  // ponytail: the only step condition in SECTIONS is gender (female_skin_context);
  // a second condition on another field needs its own "unknown" source here.
  const gender = partial.gender;
  const normalised = { gender: gender.valid ? gender.values[0]! : "" };
  for (const field of RULE_INPUT_FIELDS) {
    const step = stepFor(field);
    if (!step.condition) continue;
    partial[field].asked = gender.valid ? step.condition(normalised) : "unknown";
  }
  return partial;
}

/** The condition's field includes one of its values. Validity, freshness and gender are not checked, on purpose. */
export function matches(readings: Readings, c: Condition): boolean {
  const reading = readings[c.field as RuleInputField];
  return !!reading && c.anyOf.some((v) => reading.values.includes(v));
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * SHA-256 over the canonical rule input (RECOMMENDATION_MODEL §6): the ruleset
 * version, the catalogue's version and content, and each rule field's
 * normalised reading. The rules read nothing else, so equal hashes give equal
 * results. Name, phone and other answers are left out.
 */
export function inputSha256(readings: Readings, rulesetVersion: string, catalogue: { version: string; products: readonly unknown[] }): string {
  const fields = RULE_INPUT_FIELDS.map((f) => {
    const { values, present, valid, fresh, asked } = readings[f];
    return [f, values, present, valid, fresh, asked];
  });
  const catalogSha256 = sha256(JSON.stringify(catalogue));
  return sha256(JSON.stringify({ rulesetVersion, catalogVersion: catalogue.version, catalogSha256, fields }));
}
