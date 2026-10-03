// Wave 2 shared shape. Types only. No lane edits lib/contracts/ (docs/lanes/README.md, TD-13).
//
// The longitudinal engine's answer for one quantity in one region
// (LONGITUDINAL_METHOD §3; D-13, D-23, D-24). Internal: it carries numbers,
// dates and scan references, so it never reaches Gemini as it is. The context
// package has its own number-free view (ContextLongitudinal).

import type { SkinStateRegionKey } from "@/lib/skin-state";

/**
 * A per-region skinstate quantity. Written out here, not derived from
 * lib/comparability.ts (a lane may edit that file); tests/contracts.test.ts
 * pins it to SKINSTATE_FIELD_PATHS. No pores or hydration quantity exists.
 */
export type QuantityPath =
  | "colour.corrected.aStarMean" | "colour.corrected.aStarP90" | "colour.corrected.aStarSd" | "colour.corrected.bStarMean"
  | "colour.corrected.lStarMeanPostClahe" | "colour.corrected.lStarSdPostClahe" | "colour.corrected.aStarHist"
  | "colour.native.aStarMean" | "colour.native.aStarP90" | "colour.native.aStarSd" | "colour.native.bStarMean"
  | "colour.native.lStarMean" | "colour.native.lStarSd" | "colour.native.aStarHist" | "colour.native.localLContrastHist"
  | "texture.laplacianVarMean" | "texture.lbpEntropy" | "texture.gradientMean" | "texture.localLContrastHist"
  | "specular.fraction";

/** Same names as lib/comparability.ts NOT_COMPARABLE_REASONS (tests/contracts.test.ts pins it). */
export type NotComparableReason =
  | "quantity_not_validated"
  | "engine_build_unknown" | "engine_build_differs"
  | "pipeline_version_unknown" | "pipeline_version_differs"
  | "input_variant_unknown" | "input_variant_differs"
  | "capture_method_unknown" | "capture_method_differs"
  | "native_stats_missing"
  | "region_absent" // a missing region is a comparability reason, not a longitudinal one
  | "region_low_pixel_count"
  | "lr_cheek_cross_capture_method"
  | "field_not_defined"
  | "contract_version_differs"
  | "different_user";

/** Why the result says what it says. Each has a plain sentence next to it (LongitudinalReason.text). */
export type LongitudinalReasonCode =
  | "identical_scan" // the same input compared with itself: no change by construction
  | "within_noise"
  | "beyond_noise"
  | "noise_table_empty" // no validated noise floor for this quantity (true for every quantity today)
  | "not_comparable" // details, including region_absent, in comparability.reasons
  | "engine_boundary" // pipeline version or engine build changes inside the window: a visible boundary
  | "legacy_record" // legacy readings stay legacy; never upgraded (D-23)
  | "bad_raw_data"
  | "too_few_scans_for_baseline"
  | "conflicting_scans" // baseline scans disagree with each other beyond noise
  | "persistence_not_available"; // D03 persistence is research-dependent (LONGITUDINAL_METHOD §3.6)

export interface LongitudinalReason<C extends LongitudinalReasonCode = LongitudinalReasonCode> {
  code: C;
  /** Plain words, no numbers, no direction words ("better", "worse"). */
  text: string;
}

/** Reasons a pairwise answer may carry, per change. Everything else means "not enough evidence". */
export type PairwiseReasonCode = "within_noise" | "beyond_noise" | "identical_scan" | "persistence_not_available";
export type BeyondNoiseReasonCode = "beyond_noise" | "persistence_not_available";
export type WithinNoiseReasonCode = "within_noise" | "identical_scan" | "persistence_not_available";
/** A "not enough evidence" answer never carries a change reason. */
export type NotEnoughEvidenceReasonCode = Exclude<LongitudinalReasonCode, "within_noise" | "beyond_noise">;

/** A non-empty reason list whose every code is in C. */
export type Reasons<C extends LongitudinalReasonCode> = [LongitudinalReason<C>, ...LongitudinalReason<C>[]];

/** Alternative explanations named next to any pairwise statement, never adjusted away (LONGITUDINAL_METHOD §5). */
export type ConfounderCode =
  | "lighting_or_background"
  | "device_or_capture_path"
  | "camera_distance"
  | "makeup"
  | "occlusion"
  | "menstrual_cycle"
  | "season"
  | "stress_or_sleep"
  | "regression_to_the_mean"
  | "settling_after_starting";

/** D-24 tone bands (Monk Skin Tone groups). */
export type ToneBand = "mst_1_4" | "mst_5_6" | "mst_7_10";

/**
 * Tier 0 and tier 1 of LONGITUDINAL_METHOD §3. Patterns (tier 2) and any
 * association with a product are not levels: they are LATER or banned (D-12).
 */
export type EvidenceLevel = "not_enough_evidence" | "pairwise";

/** One row of a noise table (LONGITUDINAL_METHOD §2). The production table is empty until C05-C07. */
export interface NoiseTableEntry {
  quantity: QuantityPath;
  region: SkinStateRegionKey;
  pipelineVersion: string;
  calibrationId: string;
  noiseTableVersion: string;
  mdc95ByToneBand: Record<ToneBand, number>;
}

/** Same idea as noiseThreshold in lib/comparability.ts. Never a guessed constant. */
export type NoiseFloor =
  | { status: "unknown"; calibrationId: null }
  | {
      status: "known";
      calibrationId: string;
      noiseTableVersion: string;
      /** LONGITUDINAL_METHOD §3: the most conservative MDC95 across tone bands, until per-user data justifies more. */
      toneBandPolicy: "most_conservative";
    };

/**
 * LONGITUDINAL_METHOD §3.4: a window, never a single scan. An established
 * 3-scan window has exactly 3. An established 14-day window carries no count:
 * the pairwise detail's baselineAnalysisRefs (at least two) are authoritative.
 */
export type BaselineWindow =
  | { rule: "first_3_comparable_scans" | "first_14_days"; status: "insufficient"; scans: number }
  | { rule: "first_3_comparable_scans"; status: "established"; scans: 3 }
  | { rule: "first_14_days"; status: "established" };

/** Internal only. Never copied into a context package (GEMINI_BOUNDARY §4: no two scans' values side by side). */
export interface LongitudinalDetail {
  baselineValue: number | null;
  latestValue: number | null;
  difference: number | null;
  noiseFloorValue: number | null;
  unit: string | null;
  baselineAnalysisRefs: string[];
  latestAnalysisRef: string | null;
  windowFrom: string | null; // ISO date
  windowTo: string | null; // ISO date
  engineBuilds: string[];
}

/**
 * The key the pair matched on (D-13). Written out here, not imported from
 * lib/comparability.ts (a lane may edit it); tests/contracts.test.ts checks
 * the live ComparabilityKey still fits.
 */
export interface ComparedKey {
  contractVersion: string;
  fieldPath: string;
  region: string;
  pipelineVersion: string | null;
  engineBuild: string | null;
  inputVariant: string | null;
  captureMethod: "native" | "canvas" | null;
  captureMethodAssertedBy: "client";
}

/** A comparable pair matched on every key part; a null part is a not-comparable reason (D-13, D-23). */
export type ComparableKey = ComparedKey & {
  pipelineVersion: string;
  engineBuild: string;
  inputVariant: string;
  captureMethod: "native" | "canvas";
};

export type Comparability =
  | { verdict: "comparable"; key: ComparableKey }
  | { verdict: "not_comparable"; reasons: [NotComparableReason, ...NotComparableReason[]] };

interface LongitudinalCommon {
  /** SkinState contract the states were read under. Both versions may exist side by side. */
  contractVersion: string;
  /** What was measured. */
  measured: { quantity: QuantityPath; region: SkinStateRegionKey };
}

/**
 * Either "not enough evidence", or a pairwise answer that is only possible
 * with a comparable pair, an established baseline window and a known noise
 * floor. With an empty noise table only "not_enough_evidence" can be built.
 */
export type LongitudinalResult = LongitudinalCommon &
  (
    | {
        evidence: "not_enough_evidence";
        reasons: Reasons<NotEnoughEvidenceReasonCode>;
        detail: LongitudinalDetail;
        /** What was compared: the latest comparable scan against the baseline window. */
        compared: { baseline: BaselineWindow; latest: "latest_comparable_scan" };
        comparability: Comparability;
        noiseFloor: NoiseFloor;
        change: "not_evaluated";
        passedNoiseFloor: null;
      }
    | ({
        evidence: "pairwise";
        confounders: [ConfounderCode, ...ConfounderCode[]];
        detail: LongitudinalDetail & { baselineAnalysisRefs: [string, string, ...string[]] };
        compared: { baseline: Extract<BaselineWindow, { status: "established" }>; latest: "latest_comparable_scan" };
        comparability: Extract<Comparability, { verdict: "comparable" }>;
        noiseFloor: Extract<NoiseFloor, { status: "known" }>;
      } & (
        /** No direction: "different from your starting checks by more than photo-to-photo variation", or not. */
        | { change: "beyond_noise"; passedNoiseFloor: true; reasons: Reasons<BeyondNoiseReasonCode> }
        | { change: "within_noise"; passedNoiseFloor: false; reasons: Reasons<WithinNoiseReasonCode> }
      ))
  );
