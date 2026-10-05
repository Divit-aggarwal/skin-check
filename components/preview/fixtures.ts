// PREVIEW ONLY (G03 step 2): seeded data for the two design directions under
// /preview. Shaped like the dashboard seed users (tests/browser/seed-users.ts)
// and run through the real deriveDashboard / pastCheck / currentRoutine /
// adherence, so the screens show real structures. Removed with /preview.
import { deriveDashboard, pastCheck, type Doc } from "@/components/dashboard/state";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import { bandScores, type BandableMetric } from "@/lib/skin-check-rules";
import { METRIC_LABELS } from "@/lib/skin-check-skus";
import { ECHO_REGIONS, ECHO_REGION_LABELS } from "@/lib/echo-regions";
import { CATALOGUE } from "@/lib/catalog/catalogue";
import { addDays, currentRoutine, type RoutineEvent } from "@/lib/routine/events";
import { adherence } from "@/lib/routine/adherence";
import { syntheticAnalysis, syntheticNative } from "@/tests/synthetic-scan";
import type { SkinScanResult } from "@/types/skin-scan";

const UID = "preview-user";
const DAY = 86_400_000;
const NOW = Date.parse("2026-10-05T09:00:00+05:30");
export const TODAY = "2026-10-05";

type Kind = "measured" | "legacy" | "questions" | "failed";
const SET: { days: number; kind: Kind; verdict?: string; kept?: boolean }[] = [
  { days: 40, kind: "measured" },
  { days: 30, kind: "measured", kept: true },
  { days: 20, kind: "measured", verdict: "override" },
  { days: 12, kind: "questions" },
  { days: 10, kind: "measured" },
  { days: 1, kind: "measured", verdict: "pass", kept: true },
];

function regionScores(i: number) {
  const s = (o: number) => ({ redness: 0.3 + o, oiliness: 0.5, texture: 0.4 + o / 2, pores: 0, blemishes: 0.2 + o, hydration: 0.6, pigment: 0.5 });
  return { forehead: s(0.05 * (i % 3)), cheeks: s(0.2), nose: s(0.35), chin: s(0.1) };
}

const scoresFor = (i: number) => ({ redness: 0.3 + 0.1 * (i % 3), oiliness: 0.5, texture: 0.4, pores: 0, blemishes: 0.2, hydration: 0.6, pigment: 0.5 });

function build(checks: typeof SET) {
  const skinChecks: Doc[] = [];
  const analyses: Doc[] = [];
  checks.forEach((c, i) => {
    const scanId = `preview-${i + 1}`;
    const createdAt = new Date(NOW - c.days * DAY);
    const result = {
      ...syntheticAnalysis(),
      ...syntheticNative(),
      scores: scoresFor(i),
      region_scores: regionScores(i),
      region_low_confidence: { forehead: i === 0, nose: false, chin: false, cheeks: false },
      pipeline_version: "scan-0.1.6-provisional",
      engine_build: "sha-8dc37dc501ea974825427c665acd7019120c20ec",
    } as unknown as SkinScanResult;
    skinChecks.push({
      id: scanId,
      data: {
        scanId,
        status: c.kind === "failed" ? "analysis_failed" : c.kind === "questions" ? "questionnaire_only" : "completed",
        image: c.kind === "questions" ? null : { stored: c.kept === true, captureMethod: "native" },
        result: c.kind === "legacy" ? { scores: result.scores } : null,
        createdAt,
      },
    });
    if (c.kind !== "measured") return;
    const sha = scanId.padEnd(64, "0").replace(/[^0-9a-f]/g, "a").slice(0, 64);
    const record = buildScanAnalysisRecord(result, { scanId, inputSha256: sha, requestId: `preview-${scanId}`, captureMethod: "native" });
    const captureQuality = c.verdict ? { schemaVersion: 1, producer: "capture-quality-web", producerVersion: "cq-1", assertedBy: "client", verdict: c.verdict } : undefined;
    analyses.push({ id: scanAnalysisDocId(scanId, sha), data: { ...record, ...(captureQuality ? { captureQuality } : {}), createdAt } });
  });
  return { checks: skinChecks, analyses };
}

/** A user with several checks (starting point set), and a new user with none. */
export const DATA = { set: build(SET), building: build(SET.slice(-3)), empty: build([]) };
export const DASHBOARDS = {
  set: deriveDashboard(UID, DATA.set.checks, DATA.set.analyses),
  building: deriveDashboard(UID, DATA.building.checks, DATA.building.analyses),
  empty: deriveDashboard(UID, [], []),
};
export const openCheck = (scanId: string) => pastCheck(UID, scanId, DATA.set.checks, DATA.set.analyses);

// The dashboard's metric list: no hydration ("Dryness") row, a photo cannot measure it.
const METRICS = (Object.keys(METRIC_LABELS) as BandableMetric[]).filter((m) => m !== "hydration");

/** Readings by face region for one check: band words only (Low, Moderate, Elevated), never a score. */
export function regionReadings(scanId: string) {
  const i = Number(scanId.split("-")[1]) - 1;
  const rs = regionScores(i);
  return ECHO_REGIONS.map((r) => {
    const { bands } = bandScores(rs[r] as never);
    return { region: r, label: ECHO_REGION_LABELS[r], readings: METRICS.map((m) => ({ metric: m, label: METRIC_LABELS[m], band: bands[m] })) };
  });
}

/** TD-24 (1): an opened past check shows its own readings, always with this line. */
export const PAST_CHECK_LINE = "Photos differ in light and angle. Differences between checks are not yet a measured change.";

/** One opened check: the dashboard's row plus its own readings (whole face and by region). */
export function openCheckWithReadings(scanId: string) {
  const row = openCheck(scanId);
  if (!row) return null;
  const { bands } = bandScores(scoresFor(Number(scanId.split("-")[1]) - 1) as never);
  const wholeFace = METRICS.map((m) => ({ metric: m, label: METRIC_LABELS[m], band: bands[m] }));
  return { ...row, wholeFace: row.kind === "reading" ? wholeFace : null, regions: row.kind === "reading" ? regionReadings(scanId) : null, photoKept: photoKept(scanId) };
}

/** Whether the user chose to keep the photo of this check (a thumbnail is shown only then). */
export const photoKept = (scanId: string) => DATA.set.checks.find((c) => c.id === scanId)?.data.image instanceof Object && (DATA.set.checks.find((c) => c.id === scanId)!.data.image as { stored: boolean }).stored;

// Routine: two catalogue products and the "other product", with usage logs.
const p1 = CATALOGUE.products[0]!.id;
const p2 = CATALOGUE.products[1]!.id;
let n = 0;
const ev = (e: Partial<RoutineEvent> & Pick<RoutineEvent, "type" | "productId" | "effectiveDate">): RoutineEvent =>
  ({ eventId: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, timeZone: "Asia/Kolkata", schemaVersion: 1, catalogVersion: "catalog-0-synthetic", recordedAt: `${e.effectiveDate}T08:00:00.000Z`, source: "user", ...e }) as RoutineEvent;
const ALL = [0, 1, 2, 3, 4, 5, 6];
export const ROUTINE_EVENTS: RoutineEvent[] = [
  ev({ type: "start", productId: p1, effectiveDate: addDays(TODAY, -21), schedule: { slot: "AM_PM", days: ALL } } as never),
  ev({ type: "start", productId: p2, effectiveDate: addDays(TODAY, -9), schedule: { slot: "PM", days: [1, 3, 5] } } as never),
  ...[-6, -5, -4, -3, -2, -1].flatMap((d) => [
    ev({ type: "usage", productId: p1, effectiveDate: addDays(TODAY, d), slot: "AM", status: d === -3 ? "skipped" : "used" } as never),
  ]),
  ev({ type: "usage", productId: p2, effectiveDate: addDays(TODAY, -2), slot: "PM", status: "used" } as never),
];
export const ROUTINE_TODAY = currentRoutine(ROUTINE_EVENTS, TODAY);
export const ROUTINE_WEEK = adherence(ROUTINE_EVENTS, { from: addDays(TODAY, -6), to: TODAY, today: TODAY });
export const productName = (id: string) => CATALOGUE.products.find((p) => p.id === id)?.name ?? "Other product (not ours)";

/** Echo sample thread. Neutral text only: no change, no cause, no product advice. */
export const ECHO_THREAD = [
  { id: "1", role: "echo" as const, text: "Hi. I can talk through your newest photo reading. Pick an area or ask a question." },
  { id: "2", role: "user" as const, text: "What does Elevated mean for my cheeks?" },
  { id: "3", role: "echo" as const, text: "In this one photo, your cheeks showed more redness than the other areas. It is a reading of this photo only, shaped by light and angle, and it is not a medical opinion." },
];
