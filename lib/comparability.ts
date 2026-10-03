// C02 per-scan comparability (D-13). Spec: docs/lanes/capture-design.md §2.7.
//
// Answers one question: may field F in region R of scan A be compared with
// the same field and region of scan B? The answer is "comparable" or
// "not_comparable" with named reasons. It never outputs a difference, a
// percentage or a direction, and it reads only SkinState (skinstate-1).
//
// Fails closed: a null key part is a reason, and a quantity not listed in the
// COMPARABLE table (LONGITUDINAL_METHOD §2) is a reason. The client capture
// gate result (`captureQuality`) is never read here (D-26, owner Q-2).
// skinstate-2 (A20) is accepted too: same key, with engine.build mapped.

import type { SkinState, SkinStateRegionKey } from "@/lib/skin-state";
import type { SkinState2 } from "@/lib/skin-state-2";

/** The skinstate-1 per-region quantities a comparability question can name. */
export const SKINSTATE_FIELD_PATHS = [
  "colour.corrected.aStarMean", "colour.corrected.aStarP90", "colour.corrected.aStarSd", "colour.corrected.bStarMean",
  "colour.corrected.lStarMeanPostClahe", "colour.corrected.lStarSdPostClahe", "colour.corrected.aStarHist",
  "colour.native.aStarMean", "colour.native.aStarP90", "colour.native.aStarSd", "colour.native.bStarMean",
  "colour.native.lStarMean", "colour.native.lStarSd", "colour.native.aStarHist", "colour.native.localLContrastHist",
  "texture.laplacianVarMean", "texture.lbpEntropy", "texture.gradientMean", "texture.localLContrastHist",
  "specular.fraction",
] as const;

export type ColourPath = "corrected" | "native";

export interface ComparabilityKey {
  contractVersion: "skinstate-1" | "skinstate-2";
  fieldPath: string;
  region: SkinStateRegionKey;
  pipelineVersion: string | null;
  /** Always null under skinstate-1 (engine.build is not mapped); the CV image tag or null under skinstate-2. */
  engineBuild: string | null;
  /** null for non-colour fields. */
  colourPath: ColourPath | null;
  statsPath: "corrected" | "both";
  inputVariant: string | null;
  captureMethod: "native" | "canvas" | null;
  /**
   * Owner O-1 = A (a change to D-26): captureMethod stays in the key, marked
   * client-asserted. An honest value can only split pairs; a forged one can
   * only merge the two capture paths, and every other key part plus the
   * validated-quantity table still apply.
   */
  captureMethodAssertedBy: "client";
  regionStatus: "available" | "absent_region";
  lowPixelCount: boolean;
}

/** LONGITUDINAL_METHOD §2 COMPARABLE table. Empty in production until C05-C07. */
export interface ComparableQuantity {
  fieldPath: string;
  region: SkinStateRegionKey;
  pipelineVersion: string;
  calibrationId: string | null;
}
export const COMPARABLE_QUANTITIES: readonly ComparableQuantity[] = Object.freeze([]);

/** Declaration order is the fixed output order. */
export const NOT_COMPARABLE_REASONS = [
  "quantity_not_validated",
  "engine_build_unknown", "engine_build_differs",
  "pipeline_version_unknown", "pipeline_version_differs",
  "input_variant_unknown", "input_variant_differs",
  "capture_method_unknown", "capture_method_differs",
  "native_stats_missing",
  "region_absent",
  "region_low_pixel_count",
  "lr_cheek_cross_capture_method",
  "field_not_defined",
  "contract_version_differs",
  "different_user",
] as const;
export type NotComparableReason = (typeof NOT_COMPARABLE_REASONS)[number];

export type ComparabilityVerdict =
  | { verdict: "comparable"; key: ComparabilityKey; noiseThreshold: { status: "unknown"; calibrationId: null } }
  | { verdict: "not_comparable"; reasons: NotComparableReason[] };

/** Copies key parts from the state; never infers one. A region the state lacks counts as absent. */
export function comparabilityKey(state: SkinState | SkinState2, fieldPath: string, region: SkinStateRegionKey): ComparabilityKey {
  return {
    contractVersion: state.contractVersion,
    fieldPath,
    region,
    pipelineVersion: state.engine.pipelineVersion || null,
    engineBuild: state.engine.build,
    colourPath: fieldPath.startsWith("colour.native.") ? "native" : fieldPath.startsWith("colour.corrected.") ? "corrected" : null,
    statsPath: state.engine.statsPath,
    inputVariant: state.input.variant || null,
    captureMethod: state.input.captureMethod,
    captureMethodAssertedBy: "client",
    regionStatus: state.regions[region]?.status === "available" ? "available" : "absent_region",
    lowPixelCount: state.quality.lowPixelCount[region] === true,
  };
}

function pair(reasons: Set<NotComparableReason>, a: string | null, b: string | null, unknown: NotComparableReason, differs: NotComparableReason) {
  if (a === null || b === null) reasons.add(unknown);
  else if (a !== b) reasons.add(differs);
}

const finish = (reasons: Set<NotComparableReason>, key: ComparabilityKey): ComparabilityVerdict =>
  reasons.size
    ? { verdict: "not_comparable", reasons: NOT_COMPARABLE_REASONS.filter((r) => reasons.has(r)) }
    : { verdict: "comparable", key: { ...key }, noiseThreshold: { status: "unknown", calibrationId: null } };

function keyReasons(a: ComparabilityKey, b: ComparabilityKey, table: readonly ComparableQuantity[]): Set<NotComparableReason> {
  if (a.fieldPath !== b.fieldPath || a.region !== b.region) {
    throw new Error("compareKeys: both keys must name the same field and region");
  }
  const reasons = new Set<NotComparableReason>();
  if (a.contractVersion !== b.contractVersion) reasons.add("contract_version_differs");
  if (!(SKINSTATE_FIELD_PATHS as readonly string[]).includes(a.fieldPath)) reasons.add("field_not_defined");
  const validated = a.pipelineVersion !== null && a.pipelineVersion === b.pipelineVersion &&
    table.some((q) => q.fieldPath === a.fieldPath && q.region === a.region && q.pipelineVersion === a.pipelineVersion);
  if (!validated) reasons.add("quantity_not_validated");
  pair(reasons, a.engineBuild, b.engineBuild, "engine_build_unknown", "engine_build_differs");
  pair(reasons, a.pipelineVersion, b.pipelineVersion, "pipeline_version_unknown", "pipeline_version_differs");
  pair(reasons, a.inputVariant, b.inputVariant, "input_variant_unknown", "input_variant_differs");
  pair(reasons, a.captureMethod, b.captureMethod, "capture_method_unknown", "capture_method_differs");
  if ((a.colourPath === "native" || b.colourPath === "native") && (a.statsPath !== "both" || b.statsPath !== "both")) reasons.add("native_stats_missing");
  if (a.regionStatus === "absent_region" || b.regionStatus === "absent_region") reasons.add("region_absent");
  if (a.lowPixelCount || b.lowPixelCount) reasons.add("region_low_pixel_count");
  // LONGITUDINAL_METHOD §3: image-side cheeks swap meaning across a mirrored and an unmirrored capture path.
  if ((a.region === "cheek_image_left" || a.region === "cheek_image_right") &&
      a.captureMethod !== null && b.captureMethod !== null && a.captureMethod !== b.captureMethod) {
    reasons.add("lr_cheek_cross_capture_method");
  }
  return reasons;
}

/** Pure. Only tests pass a `table`; production uses the empty COMPARABLE_QUANTITIES. */
export function compareKeys(a: ComparabilityKey, b: ComparabilityKey, table: readonly ComparableQuantity[] = COMPARABLE_QUANTITIES): ComparabilityVerdict {
  return finish(keyReasons(a, b, table), a);
}

const uidOf = (state: SkinState | SkinState2) => state.identity.analysisRef.split("/")[1] ?? "";

/** Checks both states belong to the same user (the key has no uid), then compares their keys. */
export function compareStates(
  a: SkinState | SkinState2,
  b: SkinState | SkinState2,
  fieldPath: string,
  region: SkinStateRegionKey,
  table: readonly ComparableQuantity[] = COMPARABLE_QUANTITIES
): ComparabilityVerdict {
  const ka = comparabilityKey(a, fieldPath, region);
  const reasons = keyReasons(ka, comparabilityKey(b, fieldPath, region), table);
  if (!uidOf(a) || uidOf(a) !== uidOf(b)) reasons.add("different_user");
  return finish(reasons, ka);
}
