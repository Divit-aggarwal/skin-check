import { z } from "zod";

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

export const SkinScanOverlaysSchema = z.object({
  redness: z.string(),
  oiliness: z.string(),
  texture: z.string(),
  pores: z.string(),
  blemishes: z.string(),
  hydration: z.string(),
  pigment: z.string(),
});

export const SkinScanResultSchema = z.object({
  scores: SkinScanScoresSchema,
  overlays: SkinScanOverlaysSchema,
  regions: z.array(z.string()),
  // Per-region breakdown of the same 7 category scores (Step 4a) — keyed by
  // whatever the pipeline's face_mesh masks actually produce (forehead,
  // cheeks, nose, chin today). Keyed by string, not the fixed EchoRegion
  // union in lib/echo-regions.ts, so this schema doesn't silently drop data
  // if the pipeline's region set ever changes.
  region_scores: z.record(z.string(), SkinScanScoresSchema),
});

export type SkinScanScores = z.infer<typeof SkinScanScoresSchema>;
export type SkinScanOverlays = z.infer<typeof SkinScanOverlaysSchema>;
export type SkinScanResult = z.infer<typeof SkinScanResultSchema>;

// Held in useSkinCheckFlow, alongside quiz answers — not persisted (Step 5).
// `photo` on the success variant is the dashboard hero's base layer (Step
// 3.7) — the same captured blob carried through, not refetched or re-derived.
export type SkinScanState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: SkinScanResult; photo: Blob }
  | { status: "error"; message: string; photo: Blob };
