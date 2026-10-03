// D02/D03 change-against-noise engine (LONGITUDINAL_METHOD §3; D-13, D-24).
// Spec: docs/lanes/longitudinal-design.md §2.4.
//
// One quantity in one region: the latest comparable scan against the baseline
// window, as a LongitudinalResult. Pure and computed on read; nothing stored.
// Two evidence levels only. With the production tables (both empty) every
// answer is "not enough evidence": no pair is comparable and no noise floor
// is known, and the result type refuses a pairwise answer without one.

import {
  comparabilityKey, compareKeys, compareStates, NOT_COMPARABLE_REASONS,
  type ComparabilityKey, type ComparabilityVerdict, type ComparableQuantity,
} from "@/lib/comparability";
import type {
  BaselineWindow, ComparableKey, Comparability, ConfounderCode, LongitudinalDetail, LongitudinalReason,
  LongitudinalReasonCode, LongitudinalResult, NoiseFloor, NoiseTableEntry, NotComparableReason,
  NotEnoughEvidenceReasonCode, QuantityPath,
} from "@/lib/contracts/longitudinal-result";
import type { SkinStateRegionKey } from "@/lib/skin-state";
import { SKIN_STATE_2_CONTRACT_VERSION, type SkinState2, type SkinState2Result } from "@/lib/skin-state-2";
import { pickBaseline } from "./baseline";
import { BASELINE_RULE, CONFOUNDERS, NOISE_TABLE } from "./settings";

/** One plain sentence per reason. No digits, no percentages, no direction words; change is only "within" or "beyond". */
export const REASON_TEXT: Readonly<Record<LongitudinalReasonCode, string>> = Object.freeze({
  identical_scan: "This is the same photo as your starting checks.",
  within_noise: "Within photo-to-photo variation compared with your starting checks.",
  beyond_noise: "Beyond photo-to-photo variation compared with your starting checks.",
  noise_table_empty: "There is no validated photo-to-photo variation for this reading yet.",
  not_comparable: "These checks cannot be compared for this reading.",
  engine_boundary: "The analysis software is not the same across these checks, so they are not compared.",
  legacy_record: "Readings from an earlier version of the app are kept as they were and are not compared.",
  bad_raw_data: "A stored reading could not be read, so nothing is compared.",
  too_few_scans_for_baseline: "There are not enough checks yet to form a starting point.",
  conflicting_scans: "Your starting checks do not agree with each other closely enough to compare against.",
  persistence_not_available: "Whether this lasts over time cannot be judged yet.",
});

/** Declaration order of LongitudinalReasonCode: the fixed output order. */
const ORDER = Object.keys(REASON_TEXT) as LongitudinalReasonCode[];

const reason = <C extends LongitudinalReasonCode>(code: C): LongitudinalReason<C> => ({ code, text: REASON_TEXT[code] });

export interface Tables {
  noise?: readonly NoiseTableEntry[];
  comparable?: readonly ComparableQuantity[];
}

/** Reasons a single state has on its own account. Skipping on these cannot cross an engine change. */
const SELF_UNUSABLE: readonly NotComparableReason[] = ["region_absent", "region_low_pixel_count", "native_stats_missing", "capture_method_unknown"];

const isHistogram = (q: QuantityPath) => q.endsWith("Hist");

/** LONGITUDINAL_METHOD §3: the most conservative MDC95 across tone bands. Exactly one valid row, else unknown. */
function lookupNoise(table: readonly NoiseTableEntry[], quantity: QuantityPath, region: SkinStateRegionKey, pipelineVersion: string) {
  const unknown = { floor: { status: "unknown", calibrationId: null } as NoiseFloor, value: null };
  if (isHistogram(quantity)) return unknown; // no scalar difference exists
  const rows = table.filter((r) => r.quantity === quantity && r.region === region && r.pipelineVersion === pipelineVersion);
  if (rows.length !== 1) return unknown;
  const row = rows[0]!;
  const bands = [row.mdc95ByToneBand.mst_1_4, row.mdc95ByToneBand.mst_5_6, row.mdc95ByToneBand.mst_7_10];
  if (!bands.every((v) => Number.isFinite(v) && v > 0) || !row.calibrationId || !row.noiseTableVersion) return unknown;
  return {
    floor: { status: "known", calibrationId: row.calibrationId, noiseTableVersion: row.noiseTableVersion, toneBandPolicy: "most_conservative" } as const,
    value: Math.max(...bands),
  };
}

function readValue(state: SkinState2, quantity: QuantityPath, region: SkinStateRegionKey): number | null {
  let v: unknown = state.regions[region];
  if (!v || (v as { status: string }).status !== "available") return null;
  for (const part of quantity.split(".")) v = v == null ? undefined : (v as Record<string, unknown>)[part];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const median3 = (xs: number[]) => [...xs].sort((a, b) => a - b)[1]!;

/** A comparable verdict has no null key part (D-13); copied to the shared shape's fields only. */
function toComparableKey(k: ComparabilityKey): ComparableKey {
  const { pipelineVersion, engineBuild, inputVariant, captureMethod } = k;
  if (pipelineVersion === null || engineBuild === null || inputVariant === null || captureMethod === null) {
    throw new Error("comparable verdict with a null key part");
  }
  return { contractVersion: k.contractVersion, fieldPath: k.fieldPath, region: k.region, pipelineVersion, engineBuild, inputVariant, captureMethod, captureMethodAssertedBy: "client" };
}

/** With no SkinState at all, every key part is unknown. */
function unknownKey(quantity: QuantityPath, region: SkinStateRegionKey): ComparabilityKey {
  return {
    contractVersion: SKIN_STATE_2_CONTRACT_VERSION, fieldPath: quantity, region, pipelineVersion: null, engineBuild: null,
    colourPath: null, statsPath: "corrected", inputVariant: null, captureMethod: null, captureMethodAssertedBy: "client",
    regionStatus: "absent_region", lowPixelCount: false,
  };
}

const emptyDetail = (): LongitudinalDetail => ({
  baselineValue: null, latestValue: null, difference: null, noiseFloorValue: null, unit: null,
  baselineAnalysisRefs: [], latestAnalysisRef: null, windowFrom: null, windowTo: null, engineBuilds: [],
});

/**
 * The answer for one quantity in one region of one user's series (any order).
 * Only tests pass `tables`; production uses NOISE_TABLE and COMPARABLE_QUANTITIES, both empty.
 */
export function longitudinalResult(
  series: readonly SkinState2Result[],
  quantity: QuantityPath,
  region: SkinStateRegionKey,
  tables: Tables = {},
): LongitudinalResult {
  // Own properties only: a polluted Object.prototype can never supply a table.
  const own = <K extends keyof Tables>(k: K): Tables[K] | undefined => (Object.prototype.hasOwnProperty.call(tables, k) ? tables[k] : undefined);
  const noiseTable = own("noise") ?? NOISE_TABLE;
  // ponytail: tests/comparability.test.ts lets no file outside tests/ hand a table to compareStates/compareKeys,
  // so the engine always calls them with the production default and applies a TEST-ONLY comparable table
  // here: it can only lift quantity_not_validated, by the same rule as lib/comparability.ts. Request to main:
  // allow this file to forward `tables.comparable`, then delete `reasonsOf`'s table check.
  const testComparable = own("comparable") ?? [];
  const reasonsOf = (v: ComparabilityVerdict, a: ComparabilityKey, b: ComparabilityKey): NotComparableReason[] => {
    const reasons = v.verdict === "comparable" ? [] : v.reasons;
    const validated = a.pipelineVersion !== null && a.pipelineVersion === b.pipelineVersion &&
      testComparable.some((q) => q.fieldPath === a.fieldPath && q.region === a.region && q.pipelineVersion === a.pipelineVersion);
    return validated ? reasons.filter((r) => r !== "quantity_not_validated") : reasons;
  };
  const pairReasons = (x: SkinState2, y: SkinState2) =>
    reasonsOf(compareStates(x, y, quantity, region), comparabilityKey(x, quantity, region), comparabilityKey(y, quantity, region));
  const asComparability = (reasons: NotComparableReason[], key: ComparabilityKey): Comparability =>
    reasons.length
      ? { verdict: "not_comparable", reasons: NOT_COMPARABLE_REASONS.filter((r) => reasons.includes(r)) as [NotComparableReason, ...NotComparableReason[]] }
      : { verdict: "comparable", key: toComparableKey(key) };
  const measured = { quantity, region };
  const common = { contractVersion: SKIN_STATE_2_CONTRACT_VERSION, measured };
  const unknownFloor: NoiseFloor = { status: "unknown", calibrationId: null };
  const insufficient = (scans: number): BaselineWindow => ({ rule: BASELINE_RULE.rule, status: "insufficient", scans });

  // Legacy readings are never used, and never block: they are named only on a "not enough evidence" answer.
  const hasLegacy = series.some((e) => e.kind === "legacy_display");
  const notEnough = (codes: Set<NotEnoughEvidenceReasonCode>, baseline: BaselineWindow, comparability: Comparability, noiseFloor: NoiseFloor, detail: LongitudinalDetail): LongitudinalResult => {
    if (hasLegacy && !codes.has("bad_raw_data")) codes.add("legacy_record");
    const ordered = ORDER.filter((c): c is NotEnoughEvidenceReasonCode => codes.has(c as NotEnoughEvidenceReasonCode)).map(reason);
    if (!ordered.length) throw new Error("not enough evidence needs a reason");
    return {
      ...common, evidence: "not_enough_evidence", reasons: ordered as [LongitudinalReason<NotEnoughEvidenceReasonCode>, ...LongitudinalReason<NotEnoughEvidenceReasonCode>[]],
      detail, compared: { baseline, latest: "latest_comparable_scan" }, comparability, noiseFloor, change: "not_evaluated", passedNoiseFloor: null,
    };
  };

  // 1. Bad raw data: no partial answer.
  const noPair = (k: ComparabilityKey): Comparability => asComparability(reasonsOf(compareKeys(k, k), k, k), k);
  // The same record twice would let one physical scan fill the baseline: refuse it as bad input.
  const refs = series.flatMap((e) => (e.kind === "skinstate" ? [e.state.identity.analysisRef] : []));
  if (series.some((e) => e.kind === "invalid") || new Set(refs).size !== refs.length) {
    return notEnough(new Set<NotEnoughEvidenceReasonCode>(["bad_raw_data"]), insufficient(0), noPair(unknownKey(quantity, region)), unknownFloor, emptyDetail());
  }

  // 2-5. Baseline candidates by time and known build; engine boundary over the window.
  const codes = new Set<NotEnoughEvidenceReasonCode>();
  const states = series.flatMap((e) => (e.kind === "skinstate" ? [e.state] : []));
  // D01 "first 3 comparable scans": a scan that cannot be compared on its own account is skipped. Engine identity never skips one.
  const usable = (s: SkinState2) => {
    return !pairReasons(s, s).some((r) => SELF_UNUSABLE.includes(r));
  };
  const { latest, candidates, window, engineBoundary } = pickBaseline(states, usable);
  if (engineBoundary) codes.add("engine_boundary");
  if (candidates.length < BASELINE_RULE.scans) codes.add("too_few_scans_for_baseline");

  const detail: LongitudinalDetail = {
    ...emptyDetail(),
    baselineAnalysisRefs: candidates.map((s) => s.identity.analysisRef),
    latestAnalysisRef: latest?.identity.analysisRef ?? null,
    windowFrom: window[0]?.provenance.analyzedAt ?? null,
    windowTo: latest?.provenance.analyzedAt ?? null,
    engineBuilds: Array.from(new Set(window.map((s) => s.engine.build).filter((b): b is string => b !== null))),
  };
  if (!latest) return notEnough(codes, insufficient(0), noPair(unknownKey(quantity, region)), unknownFloor, detail);

  // 6. Each candidate against the latest. With no candidate, the latest against itself names what stops it pairing at all.
  const pairs = candidates.map((c) => pairReasons(c, latest));
  const comparableCount = pairs.filter((r) => !r.length).length;
  const comparability = candidates.length
    ? asComparability(pairs.flat(), comparabilityKey(latest, quantity, region))
    : noPair(comparabilityKey(latest, quantity, region));
  if (comparability.verdict === "not_comparable") codes.add("not_comparable");
  const established = candidates.length === BASELINE_RULE.scans && comparableCount === BASELINE_RULE.scans;
  const baseline: BaselineWindow = established ? { rule: BASELINE_RULE.rule, status: "established", scans: 3 } : insufficient(comparableCount);

  // 7. Noise floor for the latest's pipeline version.
  const noise = lookupNoise(noiseTable, quantity, region, latest.engine.pipelineVersion);
  if (noise.floor.status === "unknown") codes.add("noise_table_empty");
  else detail.noiseFloorValue = noise.value;

  // 8-10. Values (internal), identical input, conflicting baseline.
  const latestValue = readValue(latest, quantity, region);
  const baseValues = candidates.map((c) => readValue(c, quantity, region));
  const allValues = baseValues.every((v): v is number => v !== null) && latestValue !== null && candidates.length === BASELINE_RULE.scans;
  if (allValues && candidates.every((c) => c.input.analysedImageSha256 === latest.input.analysedImageSha256) &&
      (baseValues as number[]).every((v) => v === latestValue)) {
    codes.add("identical_scan");
  }
  if (established && allValues) {
    const base = median3(baseValues as number[]);
    Object.assign(detail, { baselineValue: base, latestValue, difference: latestValue - base });
    if (noise.value !== null && Math.max(...(baseValues as number[])) - Math.min(...(baseValues as number[])) > noise.value) codes.add("conflicting_scans");
  } else if (established && !isHistogram(quantity)) {
    // Comparable states with an unreadable scalar: refuse rather than guess.
    return notEnough(new Set<NotEnoughEvidenceReasonCode>(["bad_raw_data"]), insufficient(0), noPair(unknownKey(quantity, region)), unknownFloor, emptyDetail());
  }

  // 11. Pairwise only when nothing above stood in the way.
  const blocking = Array.from(codes).some((c) => c !== "identical_scan");
  if (blocking || !established || comparability.verdict !== "comparable" || noise.floor.status !== "known" || noise.value === null || detail.difference === null) {
    return notEnough(codes, baseline, comparability, noise.floor, detail);
  }
  const baselineRefs = detail.baselineAnalysisRefs as [string, string, ...string[]];
  const pairwise = {
    ...common, evidence: "pairwise" as const, confounders: [...CONFOUNDERS] as [ConfounderCode, ...ConfounderCode[]],
    detail: { ...detail, baselineAnalysisRefs: baselineRefs },
    compared: { baseline: { rule: "first_3_comparable_scans" as const, status: "established" as const, scans: 3 as const }, latest: "latest_comparable_scan" as const },
    comparability, noiseFloor: noise.floor,
  };
  if (Math.abs(detail.difference) > noise.value) {
    return { ...pairwise, change: "beyond_noise", passedNoiseFloor: true, reasons: [reason("beyond_noise"), reason("persistence_not_available")] };
  }
  return {
    ...pairwise, change: "within_noise", passedNoiseFloor: false,
    reasons: [codes.has("identical_scan") ? reason("identical_scan") : reason("within_noise"), reason("persistence_not_available")],
  };
}
