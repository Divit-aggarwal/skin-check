import type { Catalogue, Product } from "@/lib/catalog/schema";
import type {
  AppliedLimit,
  ExcludedOption,
  FiredRule,
  Notice,
  RecommendationResult,
  RecommendedItem,
  RuleTrigger,
  UnknownInput,
} from "@/lib/contracts/recommendation-result";
import { inputSha256, matches, readInput, type Readings, type RulesInput } from "./input";
import { safetyFrom } from "./safety";
import {
  ACTIVE_PRODUCT,
  ACTIVE_TRIGGERS,
  BASE_CATEGORIES,
  CONTRAINDICATION_MATCH,
  COPY,
  EXTRA_CAUTION_TRIGGERS,
  POSITION_ORDER,
  PREGNANCY_ACTIVES_RULE,
  PRESCRIBER_RULE,
  RED_FLAG_RULES,
  REVIEW_STATUS,
  RULE_IDS,
  RULE_INPUT_FIELDS,
  RULES_ENABLED,
  RULESET_VERSION,
  RulesDisabledError,
  type Condition,
  type Rule,
} from "./settings";

// E02 deterministic recommender (rules-design §4.2). Quiz answers and the
// catalogue in, a RecommendationResult out. Builds its own SafetyState, so a
// red flag and the selection cannot disagree. No clock, no randomness.

function triggers(readings: Readings, conditions: readonly Condition[]): RuleTrigger[] {
  return conditions.flatMap((c) => {
    const r = readings[c.field as keyof Readings];
    return c.anyOf
      .filter((v) => r.values.includes(v))
      .map((value) => ({ source: "self_reported" as const, field: c.field, value, fresh: r.fresh }));
  });
}

const fires = (readings: Readings, rule: Rule) => rule.when.every((c) => matches(readings, c));

function unknownsFrom(readings: Readings): UnknownInput[] {
  const out: UnknownInput[] = [];
  for (const field of RULE_INPUT_FIELDS) {
    const r = readings[field];
    if (r.asked === false) continue;
    if (!r.present) out.push({ field, text: COPY.unknownMissing });
    else if (!r.valid) out.push({ field, text: COPY.unknownInvalid });
    else if (r.reconfirm && !r.fresh) out.push({ field, text: COPY.unknownStale });
  }
  return out;
}

export function recommend(input: RulesInput, catalogue: Catalogue): RecommendationResult {
  if (!RULES_ENABLED) throw new RulesDisabledError();
  const readings = readInput(input);
  const safety = safetyFrom(readings);
  const unknowns = unknownsFrom(readings);

  // Fired rules, in a fixed order (audit).
  const fired: FiredRule[] = [];
  for (const rule of RED_FLAG_RULES) {
    if (fires(readings, rule)) fired.push({ ruleId: rule.id, triggeredBy: triggers(readings, rule.when) });
  }
  if (safety.extraCaution) {
    const on = EXTRA_CAUTION_TRIGGERS.filter((c) => matches(readings, c));
    fired.push({ ruleId: RULE_IDS.extraCaution, triggeredBy: triggers(readings, on) });
  }
  const prescriber = fires(readings, PRESCRIBER_RULE);
  if (prescriber) fired.push({ ruleId: PRESCRIBER_RULE.id, triggeredBy: triggers(readings, PRESCRIBER_RULE.when) });
  const pregnancyActives = fires(readings, PREGNANCY_ACTIVES_RULE);
  if (pregnancyActives) {
    fired.push({ ruleId: PREGNANCY_ACTIVES_RULE.id, triggeredBy: triggers(readings, PREGNANCY_ACTIVES_RULE.when) });
  }
  const activeTriggers = ACTIVE_TRIGGERS.filter((c) => matches(readings, c));
  if (activeTriggers.length > 0) fired.push({ ruleId: RULE_IDS.active, triggeredBy: triggers(readings, activeTriggers) });
  fired.push({ ruleId: RULE_IDS.base, triggeredBy: [] });

  // The first gate the active fails, or null when it may be added.
  const needsConfirmation = RULE_INPUT_FIELDS.some((f) => {
    const r = readings[f];
    return r.reconfirm && r.asked !== false && !r.fresh;
  });
  const activeGate: { ruleId: string; reason: string } | null = safety.redFlag
    ? { ruleId: safety.raisedBy[0], reason: COPY.excluded.redFlag }
    : prescriber
      ? { ruleId: PRESCRIBER_RULE.id, reason: COPY.excluded.prescriber }
      : safety.extraCaution
        ? { ruleId: RULE_IDS.extraCaution, reason: COPY.excluded.extraCaution }
        : needsConfirmation
          ? { ruleId: RULE_IDS.needsConfirmation, reason: COPY.excluded.needsConfirmation }
          : unknowns.length > 0
            ? { ruleId: RULE_IDS.needsAnswers, reason: COPY.excluded.needsAnswers }
            : activeTriggers.length === 0
              ? { ruleId: RULE_IDS.notTriggered, reason: COPY.excluded.notTriggered }
              : null;

  // Catalogue pass: every product ends up selected or excluded.
  const selected: { product: Product; ruleId: string }[] = [];
  const excluded: ExcludedOption[] = [];
  const filled = new Set<string>();
  const exclude = (p: Product, ruleId: string, reason: string) => excluded.push({ productId: p.id, ruleId, reason });
  for (const p of catalogue.products) {
    const isBase = (BASE_CATEGORIES as readonly string[]).includes(p.category);
    const isActive = p.category === ACTIVE_PRODUCT.category && p.ingredientClasses.includes(ACTIVE_PRODUCT.ingredientClass);
    if (p.availability !== "available") exclude(p, RULE_IDS.unavailable, COPY.excluded.unavailable);
    else if (p.contraindications.some((c) => matches(readings, CONTRAINDICATION_MATCH[c]!))) {
      exclude(p, RULE_IDS.contraindicated, COPY.excluded.contraindicated);
    } else if (isBase) {
      if (filled.has(p.category)) exclude(p, RULE_IDS.onePerStep, COPY.excluded.onePerStep);
      else {
        filled.add(p.category);
        selected.push({ product: p, ruleId: RULE_IDS.base });
      }
    } else if (isActive) {
      if (activeGate) exclude(p, activeGate.ruleId, activeGate.reason);
      else if (filled.has(p.category)) exclude(p, RULE_IDS.activeOneOnly, COPY.excluded.activeOneOnly);
      else {
        filled.add(p.category);
        selected.push({ product: p, ruleId: RULE_IDS.active });
      }
    } else exclude(p, RULE_IDS.notInRuleset, COPY.excluded.notInRuleset);
  }

  const rank = (p: Product) => (POSITION_ORDER as readonly string[]).indexOf(p.category);
  const items: RecommendedItem[] = selected
    .sort((a, b) => rank(a.product) - rank(b.product))
    .map(({ product, ruleId }, i) => ({
      productId: product.id,
      productVersionId: product.versionId,
      slot: product.slot,
      position: i + 1,
      ruleId,
    }));

  const limits: AppliedLimit[] = [];
  const notices: Notice[] = [];
  if (safety.redFlag) {
    limits.push({ ruleId: RULE_IDS.baseOnly, text: COPY.baseOnly });
    notices.push({ ruleId: RULE_IDS.referral, text: COPY.referral });
  } else {
    if (prescriber) limits.push({ ruleId: PRESCRIBER_RULE.id, text: COPY.prescriber });
    if (safety.extraCaution) limits.push({ ruleId: RULE_IDS.extraCaution, text: COPY.extraCaution });
    if (needsConfirmation) limits.push({ ruleId: RULE_IDS.needsConfirmation, text: COPY.needsConfirmation });
    if (unknowns.length > 0) limits.push({ ruleId: RULE_IDS.needsAnswers, text: COPY.needsAnswers });
    if (pregnancyActives) notices.push({ ruleId: PREGNANCY_ACTIVES_RULE.id, text: COPY.pregnancyActives });
    if (selected.some((s) => s.ruleId === RULE_IDS.active)) notices.push({ ruleId: RULE_IDS.oneAtATime, text: COPY.oneAtATime });
  }
  const gap = BASE_CATEGORIES.some((c) => !filled.has(c)) || (!activeGate && !filled.has(ACTIVE_PRODUCT.category));
  if (gap) limits.push({ ruleId: RULE_IDS.gap, text: COPY.gap });

  return {
    rulesetVersion: RULESET_VERSION,
    catalogVersion: catalogue.version,
    inputSha256: inputSha256(readings, RULESET_VERSION, catalogue),
    reviewStatus: REVIEW_STATUS,
    fired,
    items,
    limits,
    notices,
    unknowns,
    excluded,
    safety,
  };
}
