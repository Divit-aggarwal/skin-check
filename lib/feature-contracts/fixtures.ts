// Typed fixtures for the mockup-match contracts (G37). UI lanes build and unit
// test against these until their backend lands, then switch to the real route.
// Never imported by app code: tests/, browser seeds and scripts only.

import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from "./notifications";
import { CONSENT_TEXTS, type ConsentState } from "./consents";
import { EXPORT_FORMAT_VERSION, type DataExport } from "./data-export";
import { CHECKIN_VERSION, type CheckinRecord } from "./checkin";
import { CHANGE_LABEL, MIN_COMPARABLE, type ReadingsOverTime, type SinceStarted } from "./readings-series";
import type { StoreProduct } from "./store-products";

export const notificationPrefsFixture: NotificationPrefs = {
  ...DEFAULT_NOTIFICATION_PREFS,
  types: { ...DEFAULT_NOTIFICATION_PREFS.types, routine_morning: true, weekly_checkin: true },
  products: { "refreshing-cleanser": false },
  updatedAt: "2026-10-15T08:00:00.000Z",
};

export const consentsFixture: ConsentState[] = [
  { purpose: "personalisation", granted: true, version: null, at: null },
  { purpose: "product_improvement", granted: false, version: null, at: null },
  { purpose: "research", granted: false, version: CONSENT_TEXTS.research.version, at: "2026-10-14T10:00:00.000Z" },
  { purpose: "marketing", granted: false, version: null, at: null },
  { purpose: "ai_share", granted: true, version: "ai share version 1", at: "2026-10-12T09:30:00.000Z" },
];

export const dataExportFixture: DataExport = {
  formatVersion: EXPORT_FORMAT_VERSION,
  exportedAt: "2026-10-15T08:00:00.000Z",
  uid: "fixture-uid",
  profile: { phoneNumber: "+919999900000", lastSeenAt: "2026-10-15T07:59:00.000Z" },
  under18Marker: null,
  collections: {
    skinChecks: [{ id: "scan-aaaa1111", data: { status: "completed" } }],
    scanAnalyses: [],
    laterAnswers: [],
    consentLedger: [],
    routineEvents: [],
    checkins: [],
    settings: [],
    chatTurns: [],
    pushSubscriptions: [],
    echoUsage: [],
    exportUsage: [],
  },
  photos: [{ scanId: "scan-aaaa1111", angle: "front", url: "https://example.invalid/signed" }],
  photoLinksExpireAt: "2026-10-15T09:00:00.000Z",
  notIncluded: ["Google's copy of messages you sent to Echo."],
  truncated: false,
};

export const checkinFixture: CheckinRecord = {
  schemaVersion: CHECKIN_VERSION,
  checkinId: "2026-W42",
  answers: { overall: "bit_better", new_breakouts: "none", existing_spots: "fading", routine_changed: "no", skin_feel: "balanced" },
  scanId: "scan-aaaa1111",
  timeZone: "Asia/Kolkata",
  createdAt: "2026-10-15T08:00:00.000Z",
};

const point = (scanId: string, at: string, band: "Low" | "Moderate" | "Elevated") => ({
  scanId,
  at,
  band,
  earlyEstimate: false,
  pipelineVersion: "scan-0.1.6-provisional",
  photos: { front: true, left: false, right: false },
});

/** Two checks: every change slot is closed, as it is in production today. */
export const readingsFixture: ReadingsOverTime = {
  window: "12w",
  series: (["redness", "oiliness", "blemishes", "texture", "pigment"] as const).map((metric) => ({
    metric,
    points: [point("scan-aaaa1111", "2026-09-20T08:00:00.000Z", "Moderate"), point("scan-bbbb2222", "2026-10-13T08:00:00.000Z", "Low")].map((p) => ({
      ...p,
      earlyEstimate: metric === "blemishes" || metric === "texture" || metric === "pigment",
    })),
    change: { status: "needs_more_checks" as const, comparableCount: 0, needed: MIN_COMPARABLE },
  })),
  otherVersionScanIds: [],
};

/** Only for testing the open-slot drawing; production cannot produce this until C12. */
export const openChangeSlotFixture = {
  status: "open" as const,
  change: -1.2,
  unit: "a*",
  fromScanId: "scan-aaaa1111",
  toScanId: "scan-bbbb2222",
  label: CHANGE_LABEL,
};

export const sinceStartedFixture: SinceStarted = { productId: "niacinamide-serum", startedOn: "2026-09-18", readings: readingsFixture };

export const storeProductsFixture: StoreProduct[] = [
  {
    productId: "refreshing-cleanser",
    handle: "refreshing-cleanser-acne-prone-skin",
    title: "Refreshing Cleanser",
    images: [{ src: "https://cdn.shopify.com/fixture/cleanser.jpg", width: 1000, height: 1000, alt: null }],
    variantId: 63067458535795,
    price: 399,
    wasPrice: 499,
    available: true,
    descriptionHtml: "<p>Fixture description.</p>",
  },
  {
    productId: "active-boba-cream",
    handle: "active-boba-encapsulated-cream-acne-prone-skin",
    title: "Active Boba Encapsulated Cream",
    images: [{ src: "https://cdn.shopify.com/fixture/boba.jpg", width: 1000, height: 1000, alt: null }],
    variantId: 63064409899379,
    price: 1499,
    wasPrice: null,
    available: false,
    descriptionHtml: "<p>Fixture description.</p>",
  },
];
