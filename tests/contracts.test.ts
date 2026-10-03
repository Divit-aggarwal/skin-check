import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { ComparableKey, ComparedKey, LongitudinalResult, NotComparableReason, QuantityPath } from "@/lib/contracts/longitudinal-result";
import type { ContextLongitudinal, ContextMetric, ContextPackage, ContextRegion, ContextSafety, GeminiAnswerField } from "@/lib/contracts/context-package";
import type { RuleTrigger } from "@/lib/contracts/recommendation-result";
import type { SafetyState } from "@/lib/contracts/safety-state";
import { NOT_COMPARABLE_REASONS, SKINSTATE_FIELD_PATHS, type ComparabilityKey } from "@/lib/comparability";
import { GEMINI_FIELD_INVENTORY } from "@/lib/gemini";
import { ECHO_REGIONS } from "@/lib/echo-regions";

// Wave 2 shared shapes (lib/contracts/, TD-13). Types only. The type checks
// below (expectTypeOf, @ts-expect-error) are enforced by `npm run typecheck`
// (tsc covers tests/); vitest runs the runtime checks.
const DIR = "lib/contracts";

/** Every property name anywhere inside T, through arrays, tuples and unions. */
type DeepKeys<T> = T extends readonly (infer U)[]
  ? DeepKeys<U>
  : T extends object
    ? { [K in keyof T]-?: K | DeepKeys<T[K]> }[keyof T]
    : never;

describe("lib/contracts holds types only", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".ts"));

  it("has the four shapes", () => {
    expect(files.sort()).toEqual(["context-package.ts", "longitudinal-result.ts", "recommendation-result.ts", "safety-state.ts"]);
  });

  it.each(files)("%s exports no runtime value and imports types only, from the folder or frozen files", (f) => {
    const src = readFileSync(`${DIR}/${f}`, "utf8");
    expect(src).not.toMatch(/^export\s+(const|let|var|function|class|enum|default|async)\b/m);
    expect(src).not.toMatch(/as const/);
    for (const line of src.split("\n").filter((l) => l.startsWith("import "))) {
      expect(line).toMatch(/^import type .* from "(\.\/[a-z-]+|@\/lib\/skin-state)";$/);
    }
  });
});

describe("shapes stay in step with the code (a lane editing lib/comparability.ts or lib/gemini.ts breaks these)", () => {
  it("NotComparableReason has the same names as lib/comparability.ts", () => {
    expectTypeOf<NotComparableReason>().toEqualTypeOf<(typeof NOT_COMPARABLE_REASONS)[number]>();
  });

  it("QuantityPath is the comparability field list, and none is a pores or hydration quantity", () => {
    expectTypeOf<QuantityPath>().toEqualTypeOf<(typeof SKINSTATE_FIELD_PATHS)[number]>();
    for (const p of SKINSTATE_FIELD_PATHS) expect(p).not.toMatch(/pore|hydrat|dry/i);
  });

  it("the live ComparabilityKey still fits ComparedKey", () => {
    expectTypeOf<ComparabilityKey>().toMatchTypeOf<ComparedKey>();
  });

  it("GeminiAnswerField is exactly the inventory's sent ids", () => {
    const fields: Record<GeminiAnswerField, true> = {
      primary_concerns: true, skin_type: true, breakout_pattern: true, acne_areas: true, pih_scar_tendency: true, skin_tone: true,
      current_products: true, male_skin_context: true, skin_factors: true, diet: true, water_intake: true, sunscreen_habit: true,
    };
    const sent = Object.entries(GEMINI_FIELD_INVENTORY).filter(([, v]) => v === "sent").map(([k]) => k);
    expect(Object.keys(fields).sort()).toEqual(sent.sort());
  });

  it("ContextRegion is the Echo regions plus the whole face; ContextMetric is exactly five, no pores or dryness", () => {
    expectTypeOf<ContextRegion>().toEqualTypeOf<"all" | (typeof ECHO_REGIONS)[number]>();
    expectTypeOf<ContextMetric>().toEqualTypeOf<"redness" | "oiliness" | "texture" | "blemishes" | "pigment">();
  });
});

const detail = {
  baselineValue: null, latestValue: null, difference: null, noiseFloorValue: null, unit: null,
  baselineAnalysisRefs: ["a1", "a2", "a3"] as [string, string, ...string[]], latestAnalysisRef: "a4", windowFrom: null, windowTo: null, engineBuilds: [],
};
const key: ComparableKey = {
  contractVersion: "skinstate-2", fieldPath: "colour.native.lStarMean", region: "forehead", pipelineVersion: "scan-0.1.6-provisional",
  engineBuild: "sha-x", inputVariant: "live", captureMethod: "native", captureMethodAssertedBy: "client",
};
const measured = { quantity: "colour.native.lStarMean" as const, region: "forehead" as const };
const known = { status: "known", calibrationId: "cal-test", noiseTableVersion: "noise-test", toneBandPolicy: "most_conservative" } as const;
const latest = "latest_comparable_scan" as const;
const three = { rule: "first_3_comparable_scans" as const, status: "established" as const, scans: 3 as const };
const pairwise = {
  contractVersion: "skinstate-2", measured, evidence: "pairwise" as const, detail,
  compared: { baseline: three, latest }, comparability: { verdict: "comparable" as const, key }, noiseFloor: known,
  reasons: [{ code: "beyond_noise" as const, text: "Different from your starting checks." }] as [{ code: "beyond_noise"; text: string }],
  confounders: ["lighting_or_background"] as ["lighting_or_background"],
  change: "beyond_noise" as const, passedNoiseFloor: true as const,
};

const nee = {
  contractVersion: "skinstate-2", measured, evidence: "not_enough_evidence" as const, detail,
  compared: { baseline: { rule: "first_3_comparable_scans" as const, status: "insufficient" as const, scans: 1 }, latest },
  comparability: { verdict: "not_comparable" as const, reasons: ["quantity_not_validated"] as ["quantity_not_validated"] },
  noiseFloor: { status: "unknown" as const, calibrationId: null }, change: "not_evaluated" as const, passedNoiseFloor: null,
  reasons: [{ code: "noise_table_empty" as const, text: "There is no validated photo-to-photo variation for this reading yet." }] as [{ code: "noise_table_empty"; text: string }],
};

describe("longitudinal result: forbidden states do not type-check", () => {
  it("a valid 'not enough evidence' and a valid pairwise answer", () => {
    const pw: LongitudinalResult = pairwise;
    const ok: LongitudinalResult = nee;
    expect([ok.evidence, pw.evidence]).toEqual(["not_enough_evidence", "pairwise"]);
  });

  it("each broken condition is a type error", () => {
    const bad: unknown[] = [
      // @ts-expect-error pairwise needs a known noise floor
      ((): LongitudinalResult => ({ ...pairwise, noiseFloor: { status: "unknown", calibrationId: null } }))(),
      // @ts-expect-error an established 3-scan window has exactly 3 scans (never scan one)
      ((): LongitudinalResult => ({ ...pairwise, compared: { baseline: { ...three, scans: 1 }, latest } }))(),
      // @ts-expect-error a 14-day window needs at least two baseline scans in a pairwise answer
      ((): LongitudinalResult => ({ ...pairwise, compared: { baseline: { rule: "first_14_days", status: "established" }, latest }, detail: { ...detail, baselineAnalysisRefs: ["a1"] } }))(),
      // @ts-expect-error a comparable verdict has no null key part (D-13)
      ((): LongitudinalResult => ({ ...pairwise, comparability: { verdict: "comparable", key: { ...key, engineBuild: null } } }))(),
      // @ts-expect-error "not enough evidence" never carries a change reason
      ((): LongitudinalResult => ({ ...nee, reasons: [{ code: "noise_table_empty", text: "x" }, { code: "beyond_noise", text: "x" }] }))(),
      // @ts-expect-error a beyond-noise change cannot rest on a within-noise reason
      ((): LongitudinalResult => ({ ...pairwise, reasons: [{ code: "within_noise", text: "x" }] }))(),
      // @ts-expect-error change and passedNoiseFloor cannot disagree
      ((): LongitudinalResult => ({ ...pairwise, change: "within_noise", reasons: [{ code: "within_noise", text: "x" }] }))(),
      // @ts-expect-error a pairwise answer cannot carry an engine boundary
      ((): LongitudinalResult => ({ ...pairwise, reasons: [{ code: "engine_boundary", text: "x" }] }))(),
      // @ts-expect-error a pairwise answer names at least one confounder
      ((): LongitudinalResult => ({ ...pairwise, confounders: [] }))(),
      // @ts-expect-error not_comparable needs at least one reason
      ((): LongitudinalResult => ({ ...nee, comparability: { verdict: "not_comparable", reasons: [] } }))(),
    ];
    expect(bad).toHaveLength(10);
  });
});

describe("Gemini-facing shapes", () => {
  const fact = { id: "long.forehead.pigment", text: "Not enough evidence yet.", source: "measured" as const, measured: { metric: "pigment" as const, region: "forehead" as const } };
  const why = { code: "noise_table_empty" as const, text: "No validated photo-to-photo variation yet." };

  it("the context longitudinal view has the same two arms", () => {
    const ok: ContextLongitudinal = { ...fact, evidence: "not_enough_evidence", comparable: false, change: "not_evaluated", reasons: [why] };
    const bad: unknown[] = [
      // @ts-expect-error pairwise cannot be "not evaluated"
      ((): ContextLongitudinal => ({ ...fact, evidence: "pairwise", comparable: true, change: "not_evaluated", reasons: [{ code: "within_noise", text: "x" }], confounders: [{ id: "c", text: "c", code: "makeup" }] }))(),
      // @ts-expect-error not enough evidence cannot report a change
      ((): ContextLongitudinal => ({ ...fact, evidence: "not_enough_evidence", comparable: true, change: "beyond_noise", reasons: [why] }))(),
      // @ts-expect-error pairwise needs a comparable pair
      ((): ContextLongitudinal => ({ ...fact, evidence: "pairwise", comparable: false, change: "within_noise", reasons: [{ code: "within_noise", text: "x" }], confounders: [{ id: "c", text: "c", code: "makeup" }] }))(),
      // @ts-expect-error not enough evidence needs a reason
      ((): ContextLongitudinal => ({ ...fact, evidence: "not_enough_evidence", comparable: false, change: "not_evaluated", reasons: [] }))(),
      // @ts-expect-error not enough evidence never carries a change reason, first or later
      ((): ContextLongitudinal => ({ ...fact, evidence: "not_enough_evidence", comparable: false, change: "not_evaluated", reasons: [why, { code: "within_noise", text: "x" }] }))(),
      // @ts-expect-error a beyond-noise change cannot rest on a within-noise reason
      ((): ContextLongitudinal => ({ ...fact, evidence: "pairwise", comparable: true, change: "beyond_noise", reasons: [{ code: "within_noise", text: "x" }], confounders: [{ id: "c", text: "c", code: "makeup" }] }))(),
    ];
    expect([ok, ...bad]).toHaveLength(7);
  });

  it("recommendation triggers are self-reported only (R-1 A, D-09)", () => {
    expectTypeOf<RuleTrigger["source"]>().toEqualTypeOf<"self_reported">();
  });

  it("no key anywhere in ContextPackage is identity, raw data, an internal audit field or a red-flag signal", () => {
    type Banned =
      | "uid" | "scanId" | "analysisRef" | "name" | "age" | "gender" | "female_skin_context" | "phone_verify" | "final_phone"
      | "skin_photo" | "scores" | "raw" | "detail" | "quantity" | "fired" | "triggeredBy" | "raisedBy" | "redFlag" | "excluded"
      | "limits" | "notices" | "consent" | "difference" | "baselineValue" | "baselineAnalysisRefs" | "windowFrom" | "inputSha256"
      | "ruleId" | "latestAnalysisRef" | "latestValue" | "windowTo" | "engineBuilds" | "noiseFloorValue" | "calibrationId";
    expectTypeOf<Extract<DeepKeys<ContextPackage>, Banned>>().toEqualTypeOf<never>();
    // Positive control: DeepKeys does reach nested keys, so the check above can fail.
    expectTypeOf<Extract<DeepKeys<ContextPackage>, "lowConfidence" | "confounders" | "code">>().toEqualTypeOf<"lowConfidence" | "confounders" | "code">();
    expectTypeOf<keyof ContextSafety>().toEqualTypeOf<"extraCaution">();
  });

  it("routine can only be 'not shared' (R-1 A); uncertainty is never empty; regionFocus is a real region", () => {
    const base: ContextPackage = {
      packageVersion: "ctx-2", regionFocus: "cheeks", safety: { extraCaution: false },
      uncertainty: [{ id: "uncert.all", text: "These readings compare areas within one photo.", source: "uncertainty" }],
      missing: [], allowedClaims: ["descriptive"], forbiddenClaims: ["made_up_number"],
    };
    const bad: unknown[] = [
      // @ts-expect-error no shared routine variant exists until the owner reopens R-1 A
      ((): ContextPackage => ({ ...base, routine: { status: "shared", items: [] } }))(),
      // @ts-expect-error uncertainty always carries at least one statement
      ((): ContextPackage => ({ ...base, uncertainty: [] }))(),
      // @ts-expect-error the whole face is not a focus region
      ((): ContextPackage => ({ ...base, regionFocus: "all" }))(),
    ];
    expect([base, ...bad]).toHaveLength(4);
  });

  it("a full package fixture type-checks", () => {
    const safety: SafetyState = { redFlag: true, rulesetVersion: "s-1", reviewStatus: "provisional", extraCaution: true, raisedBy: ["hormonal_pattern"] };
    const full: ContextPackage = {
      packageVersion: "ctx-2", regionFocus: "cheeks",
      skin: { contractVersion: "skinstate-1", scoringVersion: "scoring-1", pipelineVersion: "scan-0.1.6-provisional", readings: [{ id: "state.all.redness", text: "Redness, photo-based estimate: Moderate", source: "measured", region: "all", metric: "redness", band: "Moderate", lowConfidence: false }] },
      longitudinal: [{ ...fact, evidence: "not_enough_evidence", comparable: false, change: "not_evaluated", reasons: [why] }],
      routine: { status: "not_shared", decision: "R-1 A" },
      recommendation: { rulesetVersion: "r-1", items: [{ id: "rec.cleanser", text: "Cleanses without a tight feel.", productId: "cleanser", productName: "Cleanser" }] },
      // Only the extra-caution flag crosses; the red flag and its rule stay internal.
      safety: { extraCaution: safety.extraCaution },
      selfReported: [{ id: "self.all.skin_type", text: "You told us: combination skin", source: "self_reported", field: "skin_type", fresh: true }],
      uncertainty: [{ id: "uncert.all", text: "These readings compare areas within one photo.", source: "uncertainty" }],
      missing: [{ id: "unk.hydration", text: "Photos cannot measure skin hydration.", about: "hydration" }],
      allowedClaims: ["descriptive", "uncertainty"], forbiddenClaims: ["made_up_number", "comparative_or_change", "medical_or_efficacy_term"],
    };
    expect(JSON.stringify(full)).not.toMatch(/redFlag|hormonal/);
  });
});
