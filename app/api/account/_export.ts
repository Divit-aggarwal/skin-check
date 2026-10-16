import { NextResponse } from "next/server";
import { Timestamp, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { quotaDay, secondsToNextQuotaDay } from "@/lib/echo-quota";
import { isValidScanId, scanImageKey } from "@/lib/s3-key";
import { originalExists, presignExportRead } from "@/lib/s3";
import { SIDE_ANGLES, sideImageKey } from "@/lib/feature-contracts/check-photos";
import {
  EXPORT_COLLECTIONS,
  EXPORT_FORMAT_VERSION,
  EXPORT_LINK_SECONDS,
  type DataExport,
  type ExportCollection,
  type ExportPhoto,
} from "@/lib/feature-contracts/data-export";

// SERVER ONLY (imports lib/firebase/admin.ts and lib/s3.ts). H37: the pieces of
// GET /api/account/export, kept out of route.ts because Next.js refuses any
// route export it does not know. The `_` prefix keeps Next.js from routing it.
// Every function takes a server-VERIFIED uid; nothing here takes a path.

export const EXPORT_DAILY_PER_USER = 3;

/**
 * One document per user, users/{uid}/exportUsage/daily = { day, count }, the
 * same shape and India-time day as Echo's limit (lib/echo-quota.ts). No rule
 * matches it (deny by default), the account erase removes it with the rest of
 * users/{uid}, and the file carries it (EXPORT_COLLECTIONS), counting this
 * download. Returns null when allowed, else the 429. Throws when the store fails:
 * the route answers 500 and no export runs (fail closed).
 */
export async function consumeExport(uid: string, now: Date = new Date()): Promise<NextResponse | null> {
  const day = quotaDay(now);
  const ref = adminDb().collection("users").doc(uid).collection("exportUsage").doc("daily");
  const allowed = await adminDb().runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data() as { day?: unknown; count?: unknown } | undefined;
    const used = data?.day === day && typeof data.count === "number" ? data.count : 0;
    if (used >= EXPORT_DAILY_PER_USER) return false;
    tx.set(ref, { day, count: used + 1 });
    return true;
  });
  if (allowed) return null;
  return NextResponse.json(
    { error: "You can download your data 3 times a day. Please try again tomorrow.", code: "TOO_MANY" },
    { status: 429, headers: { "Retry-After": String(secondsToNextQuotaDay(now)), "Cache-Control": "private, no-store, max-age=0" } }
  );
}

/** Firestore Timestamps (at any depth) become ISO strings; nothing else changes. */
export function toPlain(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toPlain);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toPlain(v)]));
  }
  return value;
}

type Entry = { id: string; data: Record<string, unknown> };

/** Plain names for the size note in notIncluded. */
const PLAIN_NAME: Record<ExportCollection, string> = {
  skinChecks: "skin checks",
  scanAnalyses: "check analyses",
  laterAnswers: "answers added after a check",
  consentLedger: "consent records",
  routineEvents: "routine records",
  checkins: "check-ins",
  settings: "settings",
  chatTurns: "Echo messages",
  pushSubscriptions: "reminder devices",
  echoUsage: "daily Echo counts",
  exportUsage: "daily download counts",
};

/** Always true of the file, whatever the user has (lib/consent.ts H26 wording for Google's copy). */
export const NOT_INCLUDED = [
  "Messages you sent to Echo were processed by Google, which may keep them under its own terms. Google's copy is not ours, so it is not in this file.",
  "Your sign-in account (the sign-in records Google's Firebase Authentication keeps for your phone number) is held by Google and is not in this file. Your phone number as our app saved it is in the file.",
  `The photos themselves are not inside the file. It lists a download link for each of your kept photos, and the links expire ${EXPORT_LINK_SECONDS / 60} minutes after you download the file.`,
];

const bytes = (s: string) => Buffer.byteLength(s, "utf8");

/**
 * The file as the exact string sent, under `maxBytes`. When it is over, the
 * largest collection loses its oldest entries (each list is oldest first)
 * until it fits, recounted every pass; `truncated` is set and notIncluded
 * names each collection that was cut.
 */
export function serializeWithinLimit(file: DataExport, maxBytes: number): string {
  let body = JSON.stringify(file);
  const cut = new Set<ExportCollection>();
  while (bytes(body) > maxBytes) {
    const sizes = EXPORT_COLLECTIONS.map((name) => ({ name, size: bytes(JSON.stringify(file.collections[name])) }));
    const largest = sizes.filter((s) => file.collections[s.name].length > 0).sort((a, b) => b.size - a.size)[0];
    if (!largest) throw new Error("export over the size limit with every collection empty");
    // Drop enough of the oldest entries to cover the excess in one go
    // (estimate; the loop recounts), at least one.
    const list = file.collections[largest.name];
    let excess = bytes(body) - maxBytes;
    let n = 0;
    while (n < list.length && excess > 0) excess -= bytes(JSON.stringify(list[n++])) + 1;
    list.splice(0, Math.max(1, n));
    if (!cut.has(largest.name)) {
      cut.add(largest.name);
      file.notIncluded.push(`Your oldest ${PLAIN_NAME[largest.name]}: the file has a size limit, so only the newest ones fit.`);
    }
    file.truncated = true;
    body = JSON.stringify(file);
  }
  return body;
}

const user = (uid: string) => adminDb().collection("users").doc(uid);

const oldestFirst = (a: QueryDocumentSnapshot, b: QueryDocumentSnapshot) => a.createTime.toMillis() - b.createTime.toMillis();

/** Signed links for every kept photo the record names and storage still has. */
async function photosOf(uid: string, checks: Entry[]): Promise<ExportPhoto[]> {
  const wanted: Array<{ scanId: string; angle: ExportPhoto["angle"]; key: string }> = [];
  for (const { id, data } of checks) {
    // A check id is a plain scan id; anything else never becomes a key.
    if (!isValidScanId(id)) continue;
    if ((data.image as { stored?: unknown } | null | undefined)?.stored === true) {
      wanted.push({ scanId: id, angle: "front", key: scanImageKey(uid, id) });
    }
    const sides = data.sideImages as Record<string, { stored?: unknown } | undefined> | undefined;
    for (const angle of SIDE_ANGLES) {
      if (sides?.[angle]?.stored === true) wanted.push({ scanId: id, angle, key: sideImageKey(uid, id, angle) });
    }
  }
  const found = await Promise.all(
    wanted.map(async ({ scanId, angle, key }) => ((await originalExists(key)) ? { scanId, angle, url: await presignExportRead(key) } : null))
  );
  return found.filter((p): p is ExportPhoto => p !== null);
}

/** Reads the user's profile doc, under-18 marker, own collections and photo links into the file (before the size limit). */
export async function buildExport(uid: string, now: Date = new Date()): Promise<DataExport> {
  const [profile, under18, ...snaps] = await Promise.all([
    user(uid).get(),
    adminDb().collection("under18Accounts").doc(uid).get(),
    ...EXPORT_COLLECTIONS.map((name) => user(uid).collection(name).get()),
  ]);
  const plainDoc = (d: { exists: boolean; data: () => unknown }) => (d.exists ? (toPlain(d.data()) as Record<string, unknown>) : null);
  const collections = Object.fromEntries(
    EXPORT_COLLECTIONS.map((name, i) => [
      name,
      [...snaps[i]!.docs].sort(oldestFirst).map((d) => ({ id: d.id, data: toPlain(d.data()) as Record<string, unknown> })),
    ])
  ) as DataExport["collections"];
  // Photos come from the full check list, before any cut for size: a photo
  // link is small and the photo is still the user's.
  const photos = await photosOf(uid, collections.skinChecks);
  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    uid,
    profile: plainDoc(profile!),
    under18Marker: plainDoc(under18!),
    collections,
    photos,
    photoLinksExpireAt: new Date(now.getTime() + EXPORT_LINK_SECONDS * 1000).toISOString(),
    notIncluded: [...NOT_INCLUDED],
    truncated: false,
  };
}
