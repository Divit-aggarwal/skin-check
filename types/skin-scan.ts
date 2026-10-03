import { z } from "zod";
import type { CaptureQuality, RetakeReason } from "@/lib/capture-quality/types";

// Matches the skin-scan service's POST /scan response exactly — the 7th key
// is `pigment`, not `pigmentation`. Do not rename to match Gemini's vision
// category naming (types/gemini.ts) — these are separate services.
export const SkinScanScoresSchema = z.object({
  redness: z.number(),
  oiliness: z.number(),
  texture: z.number(),
  pores: z.number(),
  blemishes: z.number(),
  hydration: z.number(),
  pigment: z.number(),
});

// The service only fills these in when the request passes ?overlays= — by
// default every key is absent and this parses as {}. Every consumer that
// indexes overlays[key] must handle `undefined`.
export const SkinScanOverlaysSchema = z.object({
  redness: z.string().optional(),
  oiliness: z.string().optional(),
  texture: z.string().optional(),
  pores: z.string().optional(),
  blemishes: z.string().optional(),
  hydration: z.string().optional(),
  pigment: z.string().optional(),
});

// A histogram's clip stats, introduced in pipeline_version
// scan-0.1.1-provisional — how many samples fell outside the bin range on
// each side, and the actual min/max seen. Keyed as "<hist_name>_clip"
// alongside "<hist_name>" in the same region_hist / region_hist_corrected
// entry (see SkinScanRegionHistEntrySchema below).
export const SkinScanHistClipSchema = z.object({
  underflow: z.number(),
  overflow: z.number(),
  min: z.number(),
  max: z.number(),
});

// One region's histogram bundle: each key is either a histogram name mapping
// to its raw bucket counts (array of numbers, e.g. "lab_a_hist"), or that
// same name + "_clip" mapping to its clip stats above. A plain
// z.record(...z.array(z.number())) silently accepted neither the old
// 2-keys-per-region shape's extras nor safely distinguished the two value
// shapes — this union rejects anything that isn't one of exactly the two
// known value shapes instead of loosening to z.any()/z.unknown().
export const SkinScanRegionHistEntrySchema = z.record(
  z.string(),
  z.union([z.array(z.number()), SkinScanHistClipSchema])
);

// Confirmed against a live /scan response (2026-09-02, pipeline_version
// scan-0.1.5-provisional): every one of the 7 categories currently reports
// "image_relative" — the server-side confirmation of the same
// not-comparable-across-users/scans property lib/skin-check-rules.ts and
// CALIBRATION.md already document from the scoring math. z.string() rather
// than a fixed enum: this is a forward-compatible label the CV service owns,
// not a closed set the frontend should reject an unrecognized value from.
export const SkinScanScoreTypesSchema = z.record(z.string(), z.string());

// Per-region flag, keyed the same as `regions`/`region_scores` (forehead,
// cheeks, nose, chin today) — true means that region's measurement is less
// reliable for this photo (e.g. partially occluded, poor lighting), not that
// the metric itself is bad. The one legitimate image-quality signal the
// service actually exposes — surfaced on the results screen, unlike a
// fabricated "face detected"/"100% accurate" claim.
export const SkinScanRegionLowConfidenceSchema = z.record(z.string(), z.boolean());

export const SkinScanResultSchema = z
  .object({
    scores: SkinScanScoresSchema,
    // Defaults to {} when the whole key is missing, on top of each field
    // inside it being optional — see SkinScanOverlaysSchema above.
    overlays: SkinScanOverlaysSchema.default({}),
    regions: z.array(z.string()),
    // Both optional: older pipeline_versions (e.g. the committed
    // scan-response.json fixture, scan-0.1.1-provisional) predate these
    // fields entirely — .passthrough() below would otherwise let a caller
    // that expects them silently see undefined with no schema signal either
    // way.
    score_types: SkinScanScoreTypesSchema.optional(),
    region_low_confidence: SkinScanRegionLowConfidenceSchema.optional(),
    // Per-region breakdown of the same 7 category scores (Step 4a) — keyed by
    // whatever the pipeline's face_mesh masks actually produce (forehead,
    // cheeks, nose, chin today). Keyed by string, not the fixed EchoRegion
    // union in lib/echo-regions.ts, so this schema doesn't silently drop data
    // if the pipeline's region set ever changes.
    region_scores: z.record(z.string(), SkinScanScoresSchema),
    // Raw per-region stat dump behind `scores` — the basis for retroactive
    // rescoring (the whole reason this schema now declares these fields
    // instead of silently stripping them). Stat names vary by pipeline
    // version, so the inner map is unconstrained rather than a fixed list.
    region_raw: z.record(z.string(), z.record(z.string(), z.number())),
    // Per-region histograms, keyed by histogram name (e.g. "lab_a_hist").
    region_hist: z.record(z.string(), SkinScanRegionHistEntrySchema),
    // Bin edges shared across regions, keyed by the same histogram names.
    region_hist_bin_edges: z.record(z.string(), z.array(z.number())),
    // Structurally identical to region_hist above (same clip-stats fix
    // applies) — declared explicitly rather than left to fall through
    // .passthrough() unvalidated, per the instruction to fix both.
    region_hist_corrected: z.record(z.string(), SkinScanRegionHistEntrySchema),
    pipeline_version: z.string(),
  })
  // Preserve any field the pipeline adds later (e.g. the *_corrected keys
  // seen in scan-response.json) instead of silently stripping it — schema
  // drift silently discarding real fields is the bug being fixed here.
  .passthrough();

export type SkinScanScores = z.infer<typeof SkinScanScoresSchema>;
export type SkinScanOverlays = z.infer<typeof SkinScanOverlaysSchema>;
export type SkinScanResult = z.infer<typeof SkinScanResultSchema>;
export type SkinScanRegionLowConfidence = z.infer<typeof SkinScanRegionLowConfidenceSchema>;

// How the capture flow obtained `original`: "native" when the device file
// picker/camera (<input capture>) returned the actual camera file verbatim
// (EXIF intact, full sensor res); "canvas" when getUserMedia+canvas produced
// it (desktop fallback — EXIF-free by construction, capped by the video
// stream's negotiated resolution). Carried through so a future persistence
// layer (Step 5) can fold it into scans.capture_state and rows can be
// stratified by whether real EXIF exists.
export type CaptureMethod = "native" | "canvas";

// Held in useSkinCheckFlow, alongside quiz answers, and draft-persisted to
// IndexedDB (lib/skin-check-draft.ts) so a refresh doesn't lose the capture
// or force a second paid analysis of the same bytes.
//
// `original` is OPTIONAL because only `photo` survives a draft restore. The
// full-res camera file is what PHASE 3 PUTs to private S3 before the analysis
// runs; persisting several MB of it per draft on top of that would be the
// wrong trade. On the restore path it is simply absent, so a resumed draft
// can no longer upload an original — `originalStored` then stays false even
// if an object from the pre-refresh attempt exists (under-claiming, which is
// the safe direction). The CV service only ever sees `photo` regardless.
// `photo` on the success variant is the dashboard hero's base layer (Step
// 3.7) — the same captured blob carried through, not refetched or re-derived.
// `original` is the bytes PHASE 3 stores at users/{uid}/scans/{scanId}/original.jpg:
// on native capture it is the actual camera file (`photo` is a ~1280px
// downscale of it, for the CV call only); on canvas capture `original` and
// `photo` are the SAME blob — canvas has nothing higher-fidelity to fall back
// to. The CV service only ever sees `photo`, never `original` directly, but
// on the canvas path they happen to be identical bytes. `originalStored` is
// true once that S3 PUT has succeeded for this scan — the flag the Firestore
// record's image metadata is built from. `retentionConsentVersion` is set only
// when the user actively checked the image-retention box for THIS capture
// (lib/consent.ts); its absence is what stops the upload from happening at
// all, and it is never carried over from another scan or restored from a
// draft.
//
// `quality` is the on-device capture gate result for `photo` (C01). It is
// client-asserted (D-26): shown and stored for provenance, never used for
// comparability. `retakeReason` is set when the engine refused the photo for
// a reason a retake can fix (lib/capture-quality/retake.ts).
// `processingConsentVersion` (D-16, R3) is the processing consent this photo
// was analyzed under; the scan route writes no analysis record without it. It
// is not draft-persisted, so a restored scan's retry is not recorded (fails closed).
export type SkinScanState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: SkinScanResult; photo: Blob; original?: Blob | undefined; captureMethod: CaptureMethod; originalStored?: boolean | undefined; retentionConsentVersion?: string | undefined; quality?: CaptureQuality | undefined; processingConsentVersion?: string | undefined }
  | { status: "error"; message: string; photo: Blob; original?: Blob | undefined; captureMethod: CaptureMethod; originalStored?: boolean | undefined; retentionConsentVersion?: string | undefined; quality?: CaptureQuality | undefined; retakeReason?: RetakeReason | undefined; processingConsentVersion?: string | undefined };
