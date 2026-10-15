// H37: data export. BE2 implements, lane E adds the "Download my data" row on 22.
// Vercel caps a response at 4.5 MB, so photos are never inlined: the file lists
// short-lived signed GET links to the user's own S3 objects.

export const EXPORT_FORMAT_VERSION = 1 as const;
/** Signed photo links in the export expire after this many seconds. */
export const EXPORT_LINK_SECONDS = 3600;
/** Keep the JSON well under Vercel's 4.5 MB response cap. */
export const EXPORT_MAX_BYTES = 4 * 1024 * 1024;

/** Collections under users/{uid} that the export reads, in file order. */
export const EXPORT_COLLECTIONS = [
  "skinChecks",
  "scanAnalyses",
  "laterAnswers",
  "consentLedger",
  "routineEvents",
  "checkins",
  "settings",
  "chatTurns",
] as const;
export type ExportCollection = (typeof EXPORT_COLLECTIONS)[number];

export interface ExportPhoto {
  scanId: string;
  angle: "front" | "left" | "right";
  /** Signed GET, valid EXPORT_LINK_SECONDS. */
  url: string;
}

export interface DataExport {
  formatVersion: typeof EXPORT_FORMAT_VERSION;
  exportedAt: string;
  uid: string;
  /** Firestore timestamps become ISO strings; nothing else is transformed. */
  collections: Record<ExportCollection, Array<{ id: string; data: Record<string, unknown> }>>;
  photos: ExportPhoto[];
  photoLinksExpireAt: string;
  /** Plain-language list of what is not in the file (e.g. Google's copy of Echo messages). */
  notIncluded: string[];
  /** True when a collection was cut to stay under EXPORT_MAX_BYTES. */
  truncated: boolean;
}

/**
 * GET /api/account/export → 200 application/json, Content-Disposition attachment
 *   "project-skin-data-YYYY-MM-DD.json", body DataExport.
 *   401 AUTH_REQUIRED, 403 NOT_ALLOWED (erased), 429 TOO_MANY (3 a day per uid), 500 EXPORT_FAILED.
 */
export const EXPORT_ROUTE = "/api/account/export";
