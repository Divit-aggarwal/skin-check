// C01 capture quality gate: shapes. Spec: docs/lanes/capture-design.md §2.
// Pure types, no DOM. The gate result is CLIENT-ASSERTED (D-26): it is shown
// to the user and stored for provenance, never used for comparability (Q-2)
// and never copied into skinstate-1's `quality` block.

import type { CaptureMethod } from "@/types/skin-scan";
import type { RetakeReason } from "./retake";

export type { RetakeReason };

/** One decoded image, RGBA in ImageData layout: data.length === width * height * 4. */
export interface Frame {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type CheckId = "exposure" | "blur" | "resolution" | "pose" | "expression" | "distance" | "framing";
export type CheckStatus = "pass" | "fail" | "not_measured";
export type NotMeasuredWhy = "no_landmark_model" | "decode_failed" | "frame_empty";

/** The fixed order used everywhere: the result list and the choice of primary reason. */
export const CHECK_ORDER = ["exposure", "blur", "resolution", "distance", "framing", "pose", "expression"] as const satisfies readonly CheckId[];

export interface CheckResult {
  id: CheckId;
  status: CheckStatus;
  /** null when not_measured. */
  measured: Record<string, number> | null;
  /** Non-null exactly when status === "fail". */
  retakeReason: RetakeReason | null;
  notMeasuredWhy?: NotMeasuredWhy | undefined;
}

export type CaptureVerdict = "pass" | "retake" | "unchecked" | "override";

export interface CaptureQuality {
  /** Owner O-2: numeric shape version. The server drops any other value. */
  schemaVersion: 1;
  producer: "capture-quality-web";
  producerVersion: "cq-1";
  settingsVersion: string;
  assertedBy: "client";
  captureMethod: CaptureMethod;
  frame: { width: number; height: number };
  /** Always all seven ids, in CHECK_ORDER. */
  checks: CheckResult[];
  verdict: CaptureVerdict;
  /** Empty unless verdict is "retake" or "override"; the first is the primary reason. */
  retakeReasons: RetakeReason[];
  /** Retakes in this attempt before this photo. */
  retakeCount: number;
}
