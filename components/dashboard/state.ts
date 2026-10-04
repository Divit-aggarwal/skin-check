// The dashboard's view model (docs/lanes/dashboard-design.md §2, §3). Pure:
// raw Firestore documents in, plain view data out, so every state is a unit
// test (tests/dashboard-state.test.ts) without a DOM renderer.
//
// What it never returns: a score, a value or a difference from two checks, or
// any direction. Bands are the per-photo bands the results screen already
// shows; one view holds one check.

import { AI_SHARE_CONSENT_VERSION, IMAGE_RETENTION_CONSENT_VERSION } from "@/lib/consent";
import { startingCheckCount, startingChecks, usableForEveryQuantity } from "@/lib/longitudinal/baseline";
import { BASELINE_RULE } from "@/lib/longitudinal/settings";
import { bandScores, type Band, type BandableMetric } from "@/lib/skin-check-rules";
import { METRIC_LABELS } from "@/lib/skin-check-skus";
import { toSkinState2, type SkinState2 } from "@/lib/skin-state-2";
import { SkinScanScoresSchema } from "@/types/skin-scan";

/** One Firestore document: its id and its data, as read. */
export interface Doc {
  id: string;
  data: Record<string, unknown>;
}

export type PhotoCheck = "pass" | "override" | "unchecked" | "not_recorded";
export type HistoryKind = "reading" | "legacy" | "failed" | "questions";

export interface CheckView {
  scanId: string;
  date: Date | null;
  source: "measured" | "legacy";
  /** null when the stored scores could not be read. */
  bands: { metric: BandableMetric; label: string; band: Band }[] | null;
  hardToRead: string[];
  /** null for a legacy check: it predates the photo checks. */
  photoCheck: PhotoCheck | null;
}

export interface HistoryRow {
  scanId: string;
  date: Date | null;
  kind: HistoryKind;
}

export type Current = { kind: "reading"; view: CheckView } | { kind: "none" };

export interface Trend {
  kind: "empty" | "building" | "set";
  count: number;
  needed: number;
  engineBoundary: boolean;
  legacyPresent: boolean;
}

/** Neither a check nor a reading: the page's empty state. */
export const isEmpty = (d: Dashboard) => d.history.length === 0 && d.current.kind === "none";

export interface Dashboard {
  current: Current;
  /** A check exists that is newer than the reading shown. */
  newerCheckNotShown: boolean;
  trend: Trend;
  history: HistoryRow[];
  /** The scan Echo is opened about: the newest measured reading. */
  echoScanId: string | null;
  /**
   * The newest check that had a photo, and what its client-written record
   * claims about storage; null when none had one. Not shown as is: see
   * photoKeptFrom (H27).
   */
  photo: { scanId: string; claimsStored: boolean } | null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** A Firestore Timestamp (or Date) as a Date; null while a serverTimestamp() is pending. */
export function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (isObj(v) && typeof v.toDate === "function") return (v.toDate as () => Date)();
  return null;
}

/** Newest first; a pending timestamp is the newest of all. */
const newestFirst = (a: Date | null, b: Date | null) => (b?.getTime() ?? Infinity) - (a?.getTime() ?? Infinity);

function bandsOf(scores: unknown): CheckView["bands"] {
  const parsed = SkinScanScoresSchema.safeParse(scores);
  if (!parsed.success) return null;
  const { bands } = bandScores(parsed.data);
  // No hydration ("Dryness") row: a photo cannot measure it (D-23, LONGITUDINAL_METHOD, GEMINI_BOUNDARY §4).
  return (Object.keys(METRIC_LABELS) as BandableMetric[])
    .filter((metric) => metric !== "hydration")
    .map((metric) => ({ metric, label: METRIC_LABELS[metric], band: bands[metric] }));
}

function hardToRead(flags: unknown): string[] {
  if (!isObj(flags)) return [];
  return Object.entries(flags)
    .filter(([, low]) => low === true)
    .map(([region]) => region.charAt(0).toUpperCase() + region.slice(1));
}

function photoCheckOf(record: Obj): PhotoCheck {
  const verdict = isObj(record.captureQuality) ? record.captureQuality.verdict : undefined;
  return verdict === "pass" || verdict === "override" || verdict === "unchecked" ? verdict : "not_recorded";
}

interface Measured {
  scanId: string;
  date: Date | null;
  record: Obj;
  state: SkinState2;
}

/** Server-written analyses that read as a valid skinstate-2 for this uid (D-23, D-26). Everything else is ignored. */
function measuredOf(uid: string, analyses: readonly Doc[]): Measured[] {
  return analyses.flatMap((a) => {
    const result = toSkinState2(a.data, `users/${uid}/scanAnalyses/${a.id}`, uid);
    if (result.kind !== "skinstate" || typeof a.data.scanId !== "string") return [];
    return [{ scanId: a.data.scanId, date: toDate(a.data.createdAt), record: a.data, state: result.state }];
  });
}

/** A client-written check carrying a result: shown as saved, never a starting check (D-23). */
const legacyResultOf = (check: Doc): Obj | null => (isObj(check.data.result) && check.data.source !== "server" ? check.data.result : null);

function measuredView(m: Measured): CheckView {
  return {
    scanId: m.scanId,
    date: m.date,
    source: "measured",
    bands: bandsOf(m.record.scores),
    hardToRead: hardToRead(m.record.region_low_confidence),
    photoCheck: photoCheckOf(m.record),
  };
}

function legacyView(check: Doc, result: Obj): CheckView {
  return {
    scanId: check.id,
    date: toDate(check.data.createdAt),
    source: "legacy",
    bands: bandsOf(result.scores),
    hardToRead: hardToRead(result.region_low_confidence),
    photoCheck: null,
  };
}

/**
 * One analysis per scanId, picked exactly as Echo picks it
 * (lib/echo-trusted-context.ts): over ALL records for the scan, the primary
 * (no persistAttempt) first, then the newest. Validity is checked on the one
 * picked: if it is not a valid skinstate, the scan has no reading here, as
 * Echo then has nothing to load. A retake or a recovery run writes several
 * records for one check.
 */
function primaryPerScan(uid: string, analyses: readonly Doc[]): Map<string, Measured> {
  const sorted = analyses
    .filter((a) => typeof a.data.scanId === "string")
    .sort(
      (a, b) =>
        Number(a.data.persistAttempt !== undefined) - Number(b.data.persistAttempt !== undefined) ||
        newestFirst(toDate(a.data.createdAt), toDate(b.data.createdAt))
    );
  const picked = new Map<string, Doc>();
  for (const a of sorted) if (!picked.has(a.data.scanId as string)) picked.set(a.data.scanId as string, a);
  const out = new Map<string, Measured>();
  for (const [scanId, a] of Array.from(picked.entries())) {
    const m = measuredOf(uid, [a])[0];
    if (m) out.set(scanId, m);
  }
  return out;
}

/**
 * The scan Echo is offered about: the newest measured reading whose scores can
 * be read (red team I02, E-F4), else null. F13 (owner TD-20): the chat route
 * answers only about this scan, through lib/echo-newest-scan.ts.
 */
export function echoScanIdFrom(uid: string, analyses: readonly Doc[]): string | null {
  const newest = Array.from(primaryPerScan(uid, analyses).values()).sort((a, b) => newestFirst(a.date, b.date))[0];
  return newest && bandsOf(newest.record.scores) ? newest.scanId : null;
}

export function deriveDashboard(uid: string, checks: readonly Doc[], analyses: readonly Doc[]): Dashboard {
  const measured = measuredOf(uid, analyses);
  const byScan = primaryPerScan(uid, analyses);
  const sortedChecks = [...checks].sort((a, b) => newestFirst(toDate(a.data.createdAt), toDate(b.data.createdAt)));

  const history: HistoryRow[] = sortedChecks.map((c) => ({
    scanId: c.id,
    date: toDate(c.data.createdAt),
    kind: byScan.has(c.id) ? "reading" : legacyResultOf(c) ? "legacy" : c.data.status === "analysis_failed" ? "failed" : "questions",
  }));

  const newestMeasured = Array.from(byScan.values()).sort((a, b) => newestFirst(a.date, b.date))[0];
  const newestLegacy = sortedChecks.find((c) => !byScan.has(c.id) && legacyResultOf(c));
  const current: Current = newestMeasured
    ? { kind: "reading", view: measuredView(newestMeasured) }
    : newestLegacy
      ? { kind: "reading", view: legacyView(newestLegacy, legacyResultOf(newestLegacy)!) }
      : { kind: "none" };

  // G-1: the engine's own starting checks (lib/longitudinal/baseline.ts), over
  // the record picked above for each check: a retake or recovery record never
  // adds or takes a place. The newest check is never a candidate.
  // D07 (TD-20): a check counts only if it is usable on its own account for
  // every quantity in every measured region (no missing or low-pixel region).
  const pick = startingChecks(Array.from(byScan.values()).map((m) => m.state), usableForEveryQuantity);
  const { engineBoundary } = pick;
  const needed = BASELINE_RULE.scans;
  const count = startingCheckCount(pick);
  const trend: Trend = {
    // Red team (I02, E-F3): starting checks read by different engine versions are never "set".
    kind: measured.length === 0 ? "empty" : count < needed || engineBoundary ? "building" : "set",
    count,
    needed,
    engineBoundary,
    legacyPresent: history.some((h) => h.kind === "legacy"),
  };

  // A check newer than the reading shown (its server reading not in yet, a
  // failed save, or questions only) is named, so an older reading is never
  // taken for the check just made.
  const shownAt = current.kind === "reading" ? current.view.date : null;
  const newerCheckNotShown =
    current.kind === "reading" &&
    shownAt !== null &&
    history.some((h) => h.scanId !== current.view.scanId && (h.date === null || h.date.getTime() > shownAt.getTime()));

  const withPhoto = sortedChecks.find((c) => isObj(c.data.image));
  return {
    current,
    newerCheckNotShown,
    trend,
    history,
    echoScanId: echoScanIdFrom(uid, analyses),
    photo: withPhoto ? { scanId: withPhoto.id, claimsStored: (withPhoto.data.image as Obj).stored === true } : null,
  };
}

export interface PastCheck {
  scanId: string;
  date: Date | null;
  kind: HistoryKind;
  /** The phone's photo-check result; null when the check had no measured reading. */
  photoCheck: PhotoCheck | null;
}

/**
 * One past check: date, kind and photo check only. No readings: each band is
 * relative to its own photo, and the previous-scans list may show dates and
 * photos only (LONGITUDINAL_METHOD §1). null when the id is not one of this user's checks.
 */
export function pastCheck(uid: string, scanId: string, checks: readonly Doc[], analyses: readonly Doc[]): PastCheck | null {
  const row = deriveDashboard(uid, checks, analyses).history.find((h) => h.scanId === scanId);
  if (!row) return null;
  const m = primaryPerScan(uid, analyses).get(scanId);
  return { ...row, photoCheck: m ? photoCheckOf(m.record) : null };
}

/** The analysis record Echo will load's session: the server loads the facts from its scanId. */
export function echoRecord(uid: string, scanId: string, analyses: readonly Doc[]): Obj | null {
  return primaryPerScan(uid, analyses).get(scanId)?.record ?? null;
}

/**
 * H27 (owner TD-20, option a): "kept" needs the server's word, not only the
 * client-written record: an image_retention entry the presign route wrote for
 * that check. A claim the ledger does not back shows nothing (null), never
 * "not kept"; a record that says it was not stored shows "not kept".
 */
export function photoKeptFrom(photo: Dashboard["photo"], ledger: readonly Doc[]): boolean | null {
  if (!photo) return null;
  if (!photo.claimsStored) return false;
  const backed = ledger.some(
    (e) =>
      e.data.purpose === "image_retention" &&
      e.data.granted === true &&
      e.data.source === "presign" &&
      e.data.version === IMAGE_RETENTION_CONSENT_VERSION &&
      e.data.scanId === photo.scanId
  );
  return backed ? true : null;
}

export type AiShareStatus = "on" | "off" | "not_asked";

/** Same rule as the server's latestGrant: the newest ai_share entry at the current version wins. */
export function aiShareStatus(ledger: readonly Doc[]): AiShareStatus {
  const entries = ledger
    .map((e) => e.data)
    .filter((d) => d.purpose === "ai_share" && d.version === AI_SHARE_CONSENT_VERSION)
    .sort((a, b) => newestFirst(toDate(a.recordedAt), toDate(b.recordedAt)));
  if (!entries.length) return "not_asked";
  return entries[0]!.granted === true ? "on" : "off";
}

/** What the page does with the consent route's answer to a withdrawal. 409 is VERSION_STALE: resending cannot work. */
export function withdrawalOutcome(status: number): "saved" | "stale" | "retry" {
  return status >= 200 && status < 300 ? "saved" : status === 409 ? "stale" : "retry";
}
