// Longitudinal settings (D01, D02; LONGITUDINAL_METHOD §2, §3.4, §5).
// Spec: docs/lanes/longitudinal-design.md §2.3. Only tests pass other tables.

import type { ConfounderCode, NoiseTableEntry } from "@/lib/contracts/longitudinal-result";

/** D01, owner 2026-10-04: PROVISIONAL. LONGITUDINAL_METHOD §3.4 also names "first_14_days" (not used). */
export const BASELINE_RULE = Object.freeze({ rule: "first_3_comparable_scans", scans: 3, status: "provisional" } as const);

/** D06, owner TD-14 (3), 2026-10-04: PROVISIONAL. A baseline scan whose capture method differs from the latest is skipped, not a block. */
export const BASELINE_CAPTURE_METHOD_RULE = Object.freeze({ rule: "skip_other_capture_method", status: "provisional" } as const);

/**
 * D06, owner TD-14 (4), 2026-10-04: PROVISIONAL. At most one scan per calendar
 * day counts toward the baseline: the earliest usable one, by the server's
 * analyzedAt. The day is the India date (TD-18 (2), owner 2026-10-04).
 */
export const BASELINE_ONE_PER_DAY_RULE = Object.freeze({ rule: "one_scan_per_calendar_day", timeZone: "Asia/Kolkata", status: "provisional" } as const);

/** Production noise table. Empty until C05-C07 validate a quantity: every real pair is "not enough evidence" (D02, owner). */
export const NOISE_TABLE: readonly NoiseTableEntry[] = Object.freeze([]);

/** LONGITUDINAL_METHOD §5, in that order. Every pairwise answer names all of them. */
export const CONFOUNDERS: readonly ConfounderCode[] = Object.freeze([
  "lighting_or_background", "device_or_capture_path", "camera_distance", "makeup", "occlusion",
  "menstrual_cycle", "season", "stress_or_sleep", "regression_to_the_mean", "settling_after_starting",
]);
