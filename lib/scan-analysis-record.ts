import type { CaptureMethod, SkinScanResult } from "@/types/skin-scan";

// Pure, SDK-free: builds the server-written `users/{uid}/scanAnalyses/{id}`
// record (C2). Lives apart from the route so the allowlist is testable
// without Firebase, and so nothing here can reach the browser bundle.

export const SCAN_ANALYSIS_SCHEMA_VERSION = 1;

// Firestore's hard doc limit is 1 MiB; stay clear of it including field
// names/index overhead. A real scan is ~10 KB without overlays.
export const MAX_RECORD_BYTES = 900_000;

// Explicit allowlist — never the parsed object. `overlays` (base64 PNG
// heatmaps) is the field this exists to keep out; any passthrough key the
// pipeline adds later is dropped until someone lists it here on purpose.
// The *_corrected keys arrive via .passthrough() (not zod-validated), which
// is why every field still goes through the nested-array check below.
const ANALYSIS_FIELDS = [
  "scores",
  "region_scores",
  "regions",
  "score_types",
  "region_low_confidence",
  "pipeline_version",
  "region_raw",
  "region_raw_corrected",
  "region_hist",
  "region_hist_corrected",
  "region_hist_bin_edges",
  "region_hist_bin_edges_corrected",
  // Colour-measurement candidates: the route requests stats=both (gate 04).
  // Absent on records written before that.
  "region_raw_native",
  "region_hist_native",
  "region_hist_bin_edges_native",
] as const;

export interface ScanAnalysisMeta {
  scanId: string;
  inputSha256: string;
  requestId: string;
  captureMethod?: CaptureMethod | undefined;
  // Set only by the client's one background re-request after persisted:false
  // — the record then comes from a second CV run, not the one the user saw.
  persistAttempt?: "recovery" | undefined;
}

function hasNestedArray(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((v) => Array.isArray(v) || hasNestedArray(v));
  if (value && typeof value === "object") return Object.values(value).some(hasNestedArray);
  return false;
}

/** Deterministic per (scanId, input bytes): a retry of the same photo is the same doc, a retake is a new one. */
export function scanAnalysisDocId(scanId: string, inputSha256: string): string {
  return `${scanId}_${inputSha256.slice(0, 16)}`;
}

/**
 * The record body, minus `createdAt` (the route adds the server timestamp so
 * this stays plain data). Undefined keys are omitted — Firestore rejects them.
 * A field containing an array-of-arrays (which Firestore also rejects) is
 * stored as a JSON string under `<field>_json` instead.
 */
export function buildScanAnalysisRecord(result: SkinScanResult, meta: ScanAnalysisMeta): Record<string, unknown> {
  const source = result as Record<string, unknown>;
  const record: Record<string, unknown> = {
    schemaVersion: SCAN_ANALYSIS_SCHEMA_VERSION,
    source: "server",
    scanId: meta.scanId,
    inputSha256: meta.inputSha256,
    requestId: meta.requestId,
  };
  if (meta.captureMethod) record.captureMethod = meta.captureMethod;
  if (meta.persistAttempt) record.persistAttempt = meta.persistAttempt;
  // Exact CV build (skin-scan `engine_build`, the immutable image tag). Kept
  // only as a non-empty string; anything else is absent, never guessed.
  const engineBuild = source.engine_build;
  if (typeof engineBuild === "string" && engineBuild) record.engine_build = engineBuild;

  for (const field of ANALYSIS_FIELDS) {
    const value = source[field];
    if (value === undefined) continue;
    if (hasNestedArray(value)) record[`${field}_json`] = JSON.stringify(value);
    else record[field] = value;
  }
  return record;
}

export function recordByteSize(record: Record<string, unknown>): number {
  return Buffer.byteLength(JSON.stringify(record));
}
