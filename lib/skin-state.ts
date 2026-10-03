// SkinState contract `skinstate-1`: a pure, deterministic VIEW over one
// immutable server-written `users/{uid}/scanAnalyses/{id}` record (gate 01).
// Spec: docs/architecture/SKIN_STATE_CONTRACT_FINAL.md, frozen with amendment A1.
//
// Never stored. Never invents a value: anything the record lacks stays null.
// No proxies (scores, bands, "redness") appear here, only physically named
// photo statistics. Uncertainty is "unknown" until a calibration table exists.
// Changing ANY mapping below requires a new contract version; old mappings stay.

import { scanAnalysisDocId } from "./scan-analysis-record";

export const SKIN_STATE_CONTRACT_VERSION = "skinstate-1";

/** Region keys defined by skinstate-1 (§4). Anything else needs a new contract version. */
const DEFINED_REGIONS = ["forehead", "nose", "chin", "cheeks", "cheek_image_left", "cheek_image_right"] as const;
export type SkinStateRegionKey = (typeof DEFINED_REGIONS)[number];

/** §7.2 quality.lowPixelCount, threshold id lowpx-2000-v0 (from compose.py MIN_TRUSTWORTHY_REGION_PX). */
const LOW_PIXEL_THRESHOLD = 2000;

/**
 * §7.1 per-pipelineVersion engine metadata. Only versions whose stack was
 * verified are listed; any other version yields null (UNKNOWN), never a guess.
 * scan-0.1.5-provisional: deployed image sha-7f3695e, /health cv2 4.11.0,
 * requirements mediapipe==0.10.21 (PRODUCTION_BASELINE.md).
 */
const ENGINE_TABLE: Record<string, { landmarkModel: string; opencvVersion: string }> = {
  "scan-0.1.5-provisional": { landmarkModel: "mediapipe-0.10.21-face_mesh", opencvVersion: "4.11.0" },
};

/** §5.5: present in the record, never exposed. Order is the contract's order. */
const DEPRECATED_TOP_LEVEL = ["scores", "region_scores", "region_raw", "region_hist", "region_hist_bin_edges"] as const;
const DEPRECATED_STATS = [
  "blemish_pixel_frac", "blemish_blob_count", "lab_a_p70_value", "color_var_p60_value",
  "smoothness_raw", "evenness_raw", "pore_count", "pore_density", "pore_density_per_kpx",
  "lab_l_std", "lab_b_mean",
] as const;

// ── Output types (§3–§8) ─────────────────────────────────────────────────────

export interface Histogram { edges: number[]; counts: number[] }
export interface HistClip { underflow: number; overflow: number; min: number; max: number }

export interface CorrectedColour {
  aStarMean: number; aStarP90: number; aStarSd: number; bStarMean: number;
  lStarMeanPostClahe: number; lStarSdPostClahe: number;
  aStarHist: Histogram; aStarHistClip: HistClip;
}
export interface NativeColour {
  aStarMean: number; aStarP90: number; aStarSd: number; bStarMean: number;
  lStarMean: number; lStarSd: number;
  aStarHist: Histogram; aStarHistClip: HistClip;
  localLContrastHist: Histogram; localLContrastHistClip: HistClip;
}
export interface Texture {
  laplacianVarMean: number; lbpEntropy: number; gradientMean: number;
  localLContrastHist: Histogram; localLContrastHistClip: HistClip;
}

export type RegionState =
  | { status: "available"; pixelCount: number;
      colour: { corrected: CorrectedColour; native: NativeColour | null };
      texture: Texture; specular: { fraction: number } }
  | { status: "absent_region"; pixelCount: 0; colour: null; texture: null; specular: null };

export interface SkinState {
  contractVersion: "skinstate-1";
  identity: { analysisRef: string; scanId: string };
  provenance: {
    source: "server"; recordSchemaVersion: 1; requestId: string;
    persistAttempt: "primary" | "recovery";
    analyzedAt: string; capturedAt: null; processingConsentVersion: null;
  };
  engine: {
    pipelineVersion: string; build: null; landmarkModel: string | null; opencvVersion: string | null;
    statsPath: "corrected" | "both"; scoreTypes: Record<string, string> | null;
  };
  input: {
    variant: "cv_downscale_1280"; analysedImageSha256: string;
    captureMethod: "native" | "canvas" | null; originalRef: null;
  };
  regions: Partial<Record<SkinStateRegionKey, RegionState>>;
  uncertainty: { policy: "unknown"; calibrationId: null; fields: { "*": { status: "unknown" } } };
  quality: {
    lowPixelCount: Partial<Record<SkinStateRegionKey, boolean>>;
    blur: null; exposure: null; pose: null; faceScale: null; occlusion: null; device: null;
  };
  deprecatedSourceFields: string[];
}

/** §0 / §11.3: a legacy client-written reading. Never a SkinState, never upgraded. */
export interface LegacyReading {
  kind: "legacy_display";
  pipelineVersion: string | null;
  scores: Record<string, number> | null;
  region_scores: Record<string, Record<string, number>> | null;
  label: "client-reported legacy reading; not a SkinState";
}

export type SkinStateResult =
  | { kind: "skinstate"; state: SkinState }
  | LegacyReading
  | { kind: "invalid"; reasons: string[] };

// ── Strict readers: any shape violation is collected, never patched over ─────

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

class Reader {
  reasons: string[] = [];
  num(o: Obj, key: string, where: string): number {
    const v = o[key];
    if (!isNum(v)) { this.reasons.push(`${where}.${key}: missing or not a finite number`); return NaN; }
    return v;
  }
  str(o: Obj, key: string, where: string): string {
    const v = o[key];
    if (typeof v !== "string" || !v) { this.reasons.push(`${where}.${key}: missing or not a string`); return ""; }
    return v;
  }
  obj(o: Obj, key: string, where: string): Obj {
    const v = o[key];
    if (!isObj(v)) { this.reasons.push(`${where}.${key}: missing or not an object`); return {}; }
    return v;
  }
  hist(counts: unknown, edges: unknown, where: string): Histogram {
    const ok = (a: unknown): a is number[] => Array.isArray(a) && a.every(isNum);
    if (!ok(counts) || !ok(edges)) { this.reasons.push(`${where}: counts/edges missing or not numeric arrays`); return { edges: [], counts: [] }; }
    if (edges.length !== counts.length + 1) this.reasons.push(`${where}: ${edges.length} edges for ${counts.length} counts`);
    return { edges: [...edges], counts: [...counts] };
  }
  clip(v: unknown, where: string): HistClip {
    if (!isObj(v)) { this.reasons.push(`${where}: missing clip stats`); return { underflow: NaN, overflow: NaN, min: NaN, max: NaN }; }
    return { underflow: this.num(v, "underflow", where), overflow: this.num(v, "overflow", where), min: this.num(v, "min", where), max: this.num(v, "max", where) };
  }
}

function toIso(v: unknown): string | null {
  if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  if (isObj(v) && typeof (v as { toDate?: unknown }).toDate === "function") return toIso((v as { toDate: () => unknown }).toDate());
  return null;
}

function isLegacy(record: Obj): boolean {
  // A client-written skinChecks doc ({ result: {...} }) or any reading without
  // the server raw substrate. It is shown as a legacy display, never upgraded.
  return record.source !== "server" && (isObj(record.result) || isObj(record.scores));
}

function legacyReading(record: Obj): LegacyReading {
  const r = isObj(record.result) ? record.result : record;
  return {
    kind: "legacy_display",
    pipelineVersion: typeof r.pipeline_version === "string" ? r.pipeline_version : null,
    scores: isObj(r.scores) ? (r.scores as Record<string, number>) : null,
    region_scores: isObj(r.region_scores) ? (r.region_scores as Record<string, Record<string, number>>) : null,
    label: "client-reported legacy reading; not a SkinState",
  };
}

// One Firestore path segment: conservative charset, never "." / "..".
const SEGMENT = /^[A-Za-z0-9._-]{1,128}$/;
export const isSegment = (v: unknown): v is string => typeof v === "string" && SEGMENT.test(v) && !/^\.+$/.test(v);
const SHA256_HEX = /^[0-9a-f]{64}$/;
const invalid = (reason: string): SkinStateResult => ({ kind: "invalid", reasons: [reason] });

/**
 * skinstate-1. `analysisRef` is the document path the record was read from
 * (the record does not contain its own uid/path); `expectedUid` is the
 * authenticated owner. Trust comes from the PATH, never from `record.source`:
 * a browser-written skinChecks doc can claim anything. This function cannot
 * prove where the bytes came from — lib/skin-state-loader.ts can.
 * Pure: same input → same output.
 */
export function toSkinState(record: unknown, analysisRef: string, expectedUid: string): SkinStateResult {
  if (!isSegment(expectedUid)) return invalid("expectedUid: missing or not a valid path segment");
  const segs = typeof analysisRef === "string" ? analysisRef.split("/") : [];
  if (segs.length !== 4 || segs[0] !== "users" || !segs.every(isSegment)) {
    return invalid("analysisRef: not of the form users/{uid}/{collection}/{docId}");
  }
  const [, uid, collection, docId] = segs as [string, string, string, string];
  if (uid !== expectedUid) return invalid("analysisRef: belongs to a different user");
  if (!isObj(record)) return { kind: "invalid", reasons: ["record is not an object"] };
  if (collection === "skinChecks") {
    // Client-written: shown as a legacy display at most, never a SkinState.
    if (record.source === "server") return invalid("skinChecks record claims source \"server\" (forged)");
    return isLegacy(record) ? legacyReading(record) : invalid("skinChecks record has no legacy result");
  }
  if (collection !== "scanAnalyses") return invalid(`analysisRef: collection "${collection}" is not a SkinState source`);
  if (record.source !== "server") return { kind: "invalid", reasons: ["scanAnalyses record source is not \"server\""] };
  if (record.schemaVersion !== 1) return { kind: "invalid", reasons: [`unsupported record schemaVersion ${String(record.schemaVersion)}`] };
  // The gate-01 builder writes `<field>_json` only if a field had nested
  // arrays — never for valid engine output. Its presence means the record
  // cannot be mapped field-for-field; refuse rather than guess.
  const encoded = Object.keys(record).filter((k) => k.endsWith("_json"));
  if (encoded.length) return { kind: "invalid", reasons: encoded.map((k) => `${k}: nested-array-encoded field present`) };

  const rd = new Reader();
  const scanId = rd.str(record, "scanId", "record");
  const requestId = rd.str(record, "requestId", "record");
  const sha = rd.str(record, "inputSha256", "record");
  const pipelineVersion = rd.str(record, "pipeline_version", "record");
  if (sha && !SHA256_HEX.test(sha)) rd.reasons.push("record.inputSha256: not 64 lowercase hex");
  else if (scanId && sha && docId !== scanAnalysisDocId(scanId, sha)) {
    rd.reasons.push("analysisRef: docId does not match scanAnalysisDocId(scanId, inputSha256)");
  }
  const analyzedAt = toIso(record.createdAt);
  if (!analyzedAt) rd.reasons.push("record.createdAt: missing or not a timestamp");

  const regionKeys = record.regions;
  if (!Array.isArray(regionKeys) || !regionKeys.every((k) => typeof k === "string")) {
    return { kind: "invalid", reasons: [...rd.reasons, "record.regions: missing or not a string array"] };
  }
  const undefinedRegions = regionKeys.filter((k) => !(DEFINED_REGIONS as readonly string[]).includes(k));
  if (undefinedRegions.length) {
    return { kind: "invalid", reasons: [...rd.reasons, ...undefinedRegions.map((k) => `region "${k}" is not defined in skinstate-1`)] };
  }

  const rawC = rd.obj(record, "region_raw_corrected", "record");
  const histC = rd.obj(record, "region_hist_corrected", "record");
  const edgesC = rd.obj(record, "region_hist_bin_edges_corrected", "record");
  const nativePresent = record.region_raw_native != null;
  const rawN = nativePresent ? rd.obj(record, "region_raw_native", "record") : null;
  const histN = nativePresent ? rd.obj(record, "region_hist_native", "record") : null;
  const edgesN = nativePresent ? rd.obj(record, "region_hist_bin_edges_native", "record") : null;

  // §4: when the engine emits both image-side cheeks, `cheeks` is DERIVED and never exposed.
  const split = regionKeys.includes("cheek_image_left") && regionKeys.includes("cheek_image_right");
  const keys = regionKeys.filter((k) => !(split && k === "cheeks")) as SkinStateRegionKey[];

  const regions: Partial<Record<SkinStateRegionKey, RegionState>> = {};
  const lowPixelCount: Partial<Record<SkinStateRegionKey, boolean>> = {};
  for (const key of keys) {
    const at = `region_raw_corrected.${key}`;
    const raw = rd.obj(rawC, key, "region_raw_corrected");
    const pixelCount = rd.num(raw, "region_px", at);
    lowPixelCount[key] = pixelCount < LOW_PIXEL_THRESHOLD;
    // Every map writes 0.0 for an empty mask — indistinguishable from a real
    // zero. pixelCount 0 is the only honest signal: the region is absent.
    if (pixelCount === 0) {
      regions[key] = { status: "absent_region", pixelCount: 0, colour: null, texture: null, specular: null };
      continue;
    }
    const hc = rd.obj(histC, key, "region_hist_corrected");
    const hAt = `region_hist_corrected.${key}`;
    let native: NativeColour | null = null;
    if (rawN && histN && edgesN) {
      const rn = rd.obj(rawN, key, "region_raw_native");
      const hn = rd.obj(histN, key, "region_hist_native");
      const nAt = `region_raw_native.${key}`;
      const nhAt = `region_hist_native.${key}`;
      native = {
        aStarMean: rd.num(rn, "lab_a_mean", nAt), aStarP90: rd.num(rn, "lab_a_p90", nAt),
        aStarSd: rd.num(rn, "lab_a_std", nAt), bStarMean: rd.num(rn, "lab_b_mean_decoded", nAt),
        lStarMean: rd.num(rn, "lab_l_mean", nAt), lStarSd: rd.num(rn, "lab_l_std_decoded", nAt),
        aStarHist: rd.hist(hn.lab_a_hist, edgesN.lab_a_hist, `${nhAt}.lab_a_hist`),
        aStarHistClip: rd.clip(hn.lab_a_hist_clip, `${nhAt}.lab_a_hist_clip`),
        localLContrastHist: rd.hist(hn.color_var_hist, edgesN.color_var_hist, `${nhAt}.color_var_hist`),
        localLContrastHistClip: rd.clip(hn.color_var_hist_clip, `${nhAt}.color_var_hist_clip`),
      };
    }
    regions[key] = {
      status: "available",
      pixelCount,
      colour: {
        corrected: {
          aStarMean: rd.num(raw, "lab_a_mean", at), aStarP90: rd.num(raw, "lab_a_p90", at),
          aStarSd: rd.num(raw, "lab_a_std", at), bStarMean: rd.num(raw, "lab_b_mean_decoded", at),
          lStarMeanPostClahe: rd.num(raw, "lab_l_mean", at), lStarSdPostClahe: rd.num(raw, "lab_l_std_decoded", at),
          aStarHist: rd.hist(hc.lab_a_hist, edgesC.lab_a_hist, `${hAt}.lab_a_hist`),
          aStarHistClip: rd.clip(hc.lab_a_hist_clip, `${hAt}.lab_a_hist_clip`),
        },
        native,
      },
      texture: {
        laplacianVarMean: rd.num(raw, "lap_var_mean", at),
        lbpEntropy: rd.num(raw, "lbp_entropy", at),
        gradientMean: rd.num(raw, "grad_raw", at),
        localLContrastHist: rd.hist(hc.color_var_hist, edgesC.color_var_hist, `${hAt}.color_var_hist`),
        localLContrastHistClip: rd.clip(hc.color_var_hist_clip, `${hAt}.color_var_hist_clip`),
      },
      specular: { fraction: rd.num(raw, "specular_frac", at) },
    };
  }

  if (rd.reasons.length) return { kind: "invalid", reasons: rd.reasons };

  const deprecatedSourceFields = [
    ...DEPRECATED_TOP_LEVEL.filter((f) => f in record),
    ...DEPRECATED_STATS.filter((s) => Object.values(rawC).some((r) => isObj(r) && s in r)),
  ];
  const engineMeta = ENGINE_TABLE[pipelineVersion];
  const captureMethod = record.captureMethod === "native" || record.captureMethod === "canvas" ? record.captureMethod : null;

  return {
    kind: "skinstate",
    state: {
      contractVersion: SKIN_STATE_CONTRACT_VERSION,
      identity: { analysisRef, scanId },
      provenance: {
        source: "server", recordSchemaVersion: 1, requestId,
        persistAttempt: record.persistAttempt === "recovery" ? "recovery" : "primary",
        analyzedAt: analyzedAt!, capturedAt: null, processingConsentVersion: null,
      },
      engine: {
        pipelineVersion,
        build: null, // not returned by the CV service yet (C12); never inferred here
        landmarkModel: engineMeta?.landmarkModel ?? null,
        opencvVersion: engineMeta?.opencvVersion ?? null,
        statsPath: nativePresent ? "both" : "corrected",
        scoreTypes: isObj(record.score_types) ? (record.score_types as Record<string, string>) : null,
      },
      input: { variant: "cv_downscale_1280", analysedImageSha256: sha, captureMethod, originalRef: null },
      regions,
      uncertainty: { policy: "unknown", calibrationId: null, fields: { "*": { status: "unknown" } } },
      quality: { lowPixelCount, blur: null, exposure: null, pose: null, faceScale: null, occlusion: null, device: null },
      deprecatedSourceFields,
    },
  };
}
