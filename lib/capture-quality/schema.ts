import { z } from "zod";
import { CHECK_ORDER, RETAKE_REASONS, type CaptureQuality } from "./types";

// Server-side validation of the client-asserted capture gate result (O-2 = A).
// Strict and bounded: anything else is DROPPED, never stored and never a
// reason to reject the scan (D-03a). No DOM, no client SDK: the route imports it.

/** Larger than any real value (~2 KB), small enough to keep the record well under MAX_RECORD_BYTES. */
export const MAX_CAPTURE_QUALITY_CHARS = 8_000;

const RetakeReasonSchema = z.enum(RETAKE_REASONS);
const Dim = z.number().int().min(0).max(100_000);

const CheckSchema = z.strictObject({
  id: z.enum(CHECK_ORDER),
  status: z.enum(["pass", "fail", "not_measured"]),
  measured: z
    // Plain identifiers only: Firestore refuses reserved names such as "__x__",
    // which would lose the whole record rather than just this field.
    .record(z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,31}$/), z.number())
    .refine((m) => Object.keys(m).length <= 8)
    .nullable(),
  retakeReason: RetakeReasonSchema.nullable(),
  notMeasuredWhy: z.enum(["no_landmark_model", "decode_failed", "frame_empty"]).optional(),
});

export const CaptureQualitySchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    producer: z.literal("capture-quality-web"),
    producerVersion: z.literal("cq-1"),
    settingsVersion: z.string().min(1).max(64),
    assertedBy: z.literal("client"),
    captureMethod: z.enum(["native", "canvas"]),
    frame: z.strictObject({ width: Dim, height: Dim }),
    checks: z.array(CheckSchema).length(CHECK_ORDER.length),
    verdict: z.enum(["pass", "retake", "unchecked", "override"]),
    retakeReasons: z.array(RetakeReasonSchema).max(CHECK_ORDER.length),
    retakeCount: z.number().int().min(0).max(1_000),
  })
  .refine((q) => q.checks.every((c, i) => c.id === CHECK_ORDER[i]))
  // The gate's own rules (design §2.3, §2.5): a stored verdict agrees with its checks.
  .refine((q) => {
    const failed = q.checks.filter((c) => c.status === "fail");
    const exposureMeasured = q.checks[0]!.status !== "not_measured";
    if (!q.checks.every((c) => (c.retakeReason !== null) === (c.status === "fail"))) return false;
    if (q.verdict === "unchecked") return !exposureMeasured && q.retakeReasons.length === 0;
    if (!exposureMeasured) return false;
    if (q.verdict === "pass") return failed.length === 0 && q.retakeReasons.length === 0;
    // retake / override
    return failed.length > 0 && q.retakeReasons.length === failed.length && failed.every((c, i) => c.retakeReason === q.retakeReasons[i]);
  });

/**
 * The form field as sent by the client, or undefined when absent, oversized,
 * not JSON, invalid, or for a different capture method than the request names.
 */
export function parseCaptureQuality(raw: unknown, captureMethod: string | undefined): CaptureQuality | undefined {
  if (typeof raw !== "string" || raw.length > MAX_CAPTURE_QUALITY_CHARS) return undefined;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const parsed = CaptureQualitySchema.safeParse(json);
  if (!parsed.success || parsed.data.captureMethod !== captureMethod) return undefined;
  return parsed.data as CaptureQuality;
}
