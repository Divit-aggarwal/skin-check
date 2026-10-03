import { createHash, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { checkRequestRate, consumeDailyQuota, SKIN_SCAN_ROUTE_LIMITS } from "@/lib/rate-limit";
import { AdminNotConfiguredError, adminDb, bearerToken, verifyFirebaseIdToken } from "@/lib/firebase/admin";
import { isValidScanId } from "@/lib/s3-key";
import {
  buildScanAnalysisRecord,
  MAX_RECORD_BYTES,
  recordByteSize,
  scanAnalysisDocId,
} from "@/lib/scan-analysis-record";
import { SkinScanResultSchema, type CaptureMethod, type SkinScanResult } from "@/types/skin-scan";
import { parseCaptureQuality } from "@/lib/capture-quality/schema";
import type { CaptureQuality } from "@/lib/capture-quality/types";

// firebase-admin needs Node APIs and hard-fails on the Edge runtime. This is
// already the App Router default; stated explicitly so a future edge opt-in
// can't silently break token verification.
export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 30_000;
// Hard ceiling on the C2 analysis write (both attempts together). The scan
// result is already in hand; a hung Firestore must never hold it hostage.
const PERSIST_TIMEOUT_MS = 3_000;

// Matches SkinScanScoresSchema's 7 categories (types/skin-scan.ts). Allowlist,
// not passthrough — the value lands in an upstream query string, and
// validating against the known 7 keeps a malformed client from shaping it.
const VALID_OVERLAYS = new Set([
  "redness", "oiliness", "texture", "pores", "blemishes", "hydration", "pigment",
]);

// PHASE 2: authenticated. Every request must carry a Firebase ID token that
// this server verifies itself (see lib/firebase/admin.ts) — the browser's own
// claim to be signed in, and Phase 1's client-side ordering, are no longer
// part of the security decision. Proxies to the self-hosted skin-scan service
// (OpenCV + MediaPipe FastAPI, DurtyDhiana/skin-scan) so the client never
// talks to it directly.
const SKIN_SCAN_API_URL = process.env.SKIN_SCAN_API_URL;

// A function, not a shared constant: a Response body can only be consumed
// once, so a module-level instance would work for exactly one request and
// then start failing.
//
// One message and one code for every failure mode — missing, malformed,
// invalid, expired, revoked. Which of those it was stays in the server log:
// telling a caller *why* their token failed is free reconnaissance.
const unauthorized = () =>
  NextResponse.json({ error: "Authentication required.", code: "AUTH_REQUIRED" }, { status: 401 });

export async function POST(request: NextRequest) {
  // Fails loudly rather than silently falling back to localhost:8000, which
  // would otherwise make an unset env var in production look like an
  // unreachable-service error (502) instead of a misconfiguration (500) —
  // same reasoning as the SCAN_API_SECRET check below.
  if (!SKIN_SCAN_API_URL) {
    console.error("SKIN_SCAN_API_URL is not set — refusing to call the skin-scan service.");
    return NextResponse.json(
      { error: "Skin scan service is misconfigured.", code: "SCAN_MISCONFIGURED" },
      { status: 500 }
    );
  }

  const scanApiSecret = process.env.SCAN_API_SECRET;
  if (!scanApiSecret) {
    console.error("SCAN_API_SECRET is not set — refusing to call the skin-scan service.");
    return NextResponse.json(
      { error: "Skin scan service is misconfigured.", code: "SCAN_MISCONFIGURED" },
      { status: 500 }
    );
  }

  // Stays first: IP burst protection is payload-agnostic and purely in-memory,
  // so it shields the token verification below (which does touch the network)
  // rather than sitting behind it.
  const rateLimited = checkRequestRate(request, SKIN_SCAN_ROUTE_LIMITS);
  if (rateLimited) return rateLimited;

  // ── Trust boundary ───────────────────────────────────────────────────────
  // Everything below this block — reading the body, the daily quota, the
  // upstream call — is unreachable without a Firebase ID token this server
  // verified. Header shape is checked BEFORE any credential is touched, so a
  // missing or malformed token is a 401 even on a box with no service account
  // configured; only a genuine verification attempt can surface a 500.
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) {
    console.warn("skin-scan: rejected request with no usable Bearer token.");
    return unauthorized();
  }

  let uid: string;
  try {
    // The ONLY source of identity for this request. There is no uid in the
    // body, the query, or any other header, and if one were ever added it
    // would be client-asserted data, never this. C2 uses it for exactly one
    // thing: the users/{uid}/scanAnalyses path of the server-written record.
    uid = await verifyFirebaseIdToken(token);
  } catch (err) {
    if (err instanceof AdminNotConfiguredError) {
      // Names of unset env vars only — never a credential value.
      console.error("skin-scan:", err.message);
      return NextResponse.json(
        { error: "Authentication is misconfigured.", code: "AUTH_MISCONFIGURED" },
        { status: 500 }
      );
    }
    // Deliberately not forwarded to the client: the Firebase error code
    // distinguishes expired from revoked from wrong-signature, which is
    // exactly the feedback an attacker wants.
    console.warn(
      "skin-scan: ID token verification failed:",
      (err as { code?: string })?.code ?? "unknown"
    );
    return unauthorized();
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const image = formData.get("image");
  if (!image || !(image instanceof Blob)) {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }

  // Comma-separated (skin-scan's `overlays` query param takes a list, per
  // main.py's `Query(...)` — a single combined request generates every
  // requested category's heatmap rather than one round trip per category).
  // Still an allowlist, not passthrough: each piece is checked individually
  // before being rejoined into the upstream query string.
  const requested = formData.get("overlay");
  const overlay =
    typeof requested === "string"
      ? Array.from(new Set(requested.split(",").map((s) => s.trim()).filter((s) => VALID_OVERLAYS.has(s)))).join(",")
      : "";

  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "Image too large. Maximum 5MB.", code: "IMAGE_TOO_LARGE" },
      { status: 413 }
    );
  }

  // Reached only by an authenticated caller now, so anonymous traffic can no
  // longer burn the shared daily budget. Still keyed by IP, not by `uid` —
  // rate limiting is explicitly out of scope for this phase (see the report's
  // limitations); the verified uid is available here whenever that changes.
  const quotaLimited = consumeDailyQuota(request, SKIN_SCAN_ROUTE_LIMITS);
  if (quotaLimited) return quotaLimited;

  const upstreamForm = new FormData();
  upstreamForm.append("image", image, "scan.jpg");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  // No overlay requested means no overlay returned — the cheapest path, not
  // the most expensive one. stats=both (D-07, gate 04) adds the uncorrected
  // "native" colour statistics the measurement-validation protocol needs;
  // every corrected field the UI reads is unchanged by it.
  const query = new URLSearchParams({ stats: "both" });
  if (overlay) query.set("overlays", overlay);
  const scanUrl = `${SKIN_SCAN_API_URL}/scan?${query}`;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(scanUrl, {
      method: "POST",
      headers: { "X-Scan-Secret": scanApiSecret },
      body: upstreamForm,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error(`skin-scan service timed out after ${UPSTREAM_TIMEOUT_MS}ms`);
      return NextResponse.json(
        { error: "Skin scan service took too long to respond. Please try again.", code: "SCAN_TIMEOUT" },
        { status: 504 }
      );
    }
    console.error("skin-scan service unreachable:", err);
    return NextResponse.json(
      { error: "Skin scan service is unavailable right now.", code: "SCAN_SERVICE_UNREACHABLE" },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!upstreamResponse.ok) {
    const status = upstreamResponse.status;
    const bodyText = await upstreamResponse.text().catch(() => "<unreadable>");

    // The service now sends a stable `error_code` alongside `detail` on every
    // error response — prefer that over guessing from the HTTP status alone,
    // since status collapses distinct failures (e.g. a corrupt upload and a
    // missing face both used to arrive as plain 400s).
    let errorCode: string | null = null;
    let upstreamDetail = bodyText;
    try {
      const bodyJson: unknown = JSON.parse(bodyText);
      if (bodyJson && typeof bodyJson === "object") {
        const obj = bodyJson as Record<string, unknown>;
        if (typeof obj.error_code === "string") errorCode = obj.error_code;
        if (typeof obj.detail === "string") upstreamDetail = obj.detail;
      }
    } catch {
      // Not JSON — fall through to status-based branching below.
    }

    if (errorCode) {
      switch (errorCode) {
        case "NO_FACE_DETECTED":
          console.error("skin-scan service: no face detected:", upstreamDetail);
          return NextResponse.json(
            {
              error: "We couldn't detect a face in that photo. Try again with your face centered and well-lit.",
              code: "NO_FACE_DETECTED",
            },
            { status: 400 }
          );

        case "IMAGE_UNPARSEABLE":
          console.error("skin-scan service: image unparseable:", upstreamDetail);
          return NextResponse.json(
            { error: "We couldn't read that photo. Try taking a new one.", code: "IMAGE_UNPARSEABLE" },
            { status: 400 }
          );

        case "IMAGE_TOO_LARGE":
          console.error("skin-scan service: image too large:", upstreamDetail);
          return NextResponse.json(
            { error: "That photo was too large for the scan service. Try again with a smaller image.", code: "IMAGE_TOO_LARGE" },
            { status: 413 }
          );

        case "IMAGE_DIMENSIONS_TOO_LARGE":
          console.error("skin-scan service: image dimensions too large:", upstreamDetail);
          return NextResponse.json(
            { error: "That photo's resolution is too large. Try again with a smaller image.", code: "IMAGE_DIMENSIONS_TOO_LARGE" },
            { status: 400 }
          );

        case "IMAGE_TOO_SMALL":
          console.error("skin-scan service: image dimensions too small:", upstreamDetail);
          return NextResponse.json(
            { error: "That photo's resolution is too small to analyze. Try again with a higher-resolution image.", code: "IMAGE_TOO_SMALL" },
            { status: 400 }
          );

        // Transient, not the user's fault — retrying (later) can succeed.
        case "SCAN_CAPACITY_EXCEEDED":
          console.error("skin-scan service at capacity:", upstreamDetail);
          return NextResponse.json(
            { error: "The scan service is at capacity right now. Please try again in a moment.", code: "SCAN_CAPACITY_EXCEEDED" },
            { status: 503 }
          );

        // Same status/code the route already uses for its own 30s abort
        // (UPSTREAM_TIMEOUT_MS) above — this is the service reporting the
        // same condition from its side (scan_timeout_seconds) instead.
        case "SCAN_TIMEOUT":
          console.error("skin-scan service timed out processing the scan:", upstreamDetail);
          return NextResponse.json(
            { error: "Skin scan service took too long to respond. Please try again.", code: "SCAN_TIMEOUT" },
            { status: 504 }
          );

        // AUTH_FAILED means SCAN_API_SECRET is wrong/missing on our side —
        // never the user's fault, never surfaced as an auth error to them.
        case "AUTH_FAILED":
          console.error("skin-scan service rejected SCAN_API_SECRET (AUTH_FAILED) — check the credential, not the photo:", upstreamDetail);
          return NextResponse.json(
            { error: "Skin scan service is unavailable right now.", code: "SCAN_AUTH_MISCONFIGURED" },
            { status: 502 }
          );

        // BAD_STATS_PARAM means our proxy sent the service a malformed
        // request param — a bug on our side, not the user's photo.
        case "BAD_STATS_PARAM":
          console.error("skin-scan service: rejected our request (BAD_STATS_PARAM) — this is our bug, not the photo:", upstreamDetail);
          return NextResponse.json(
            { error: "Couldn't analyze your photo. Please try again.", code: "SCAN_SERVICE_ERROR" },
            { status: 502 }
          );

        // SCAN_ERROR / INTERNAL_ERROR, plus any future code this frontend
        // doesn't know about yet: generic "our problem" bucket.
        case "SCAN_ERROR":
        case "INTERNAL_ERROR":
        default:
          console.error(`skin-scan service error (${errorCode}):`, upstreamDetail);
          return NextResponse.json(
            { error: "Couldn't analyze your photo. Please try again.", code: "SCAN_SERVICE_ERROR" },
            { status: 502 }
          );
      }
    }

    // No error_code on the body (older upstream build, or an unparseable
    // body) — fall back to the previous status-only branching.
    if (status === 401) {
      console.error("skin-scan service rejected SCAN_API_SECRET (401) — check the credential, not the photo:", upstreamDetail);
      return NextResponse.json(
        { error: "Skin scan service is unavailable right now.", code: "SCAN_AUTH_MISCONFIGURED" },
        { status: 502 }
      );
    }

    if (status === 400) {
      console.error("skin-scan service: no face detected:", upstreamDetail);
      return NextResponse.json(
        {
          error: "We couldn't detect a face in that photo. Try again with your face centered and well-lit.",
          code: "NO_FACE_DETECTED",
        },
        { status: 400 }
      );
    }

    if (status === 413) {
      console.error("skin-scan service: image too large:", upstreamDetail);
      return NextResponse.json(
        { error: "That photo was too large for the scan service. Try again with a smaller image.", code: "IMAGE_TOO_LARGE" },
        { status: 413 }
      );
    }

    if (status >= 500) {
      console.error(`skin-scan service internal error (${status}):`, upstreamDetail);
      return NextResponse.json(
        { error: "Couldn't analyze your photo. Please try again.", code: "SCAN_SERVICE_ERROR" },
        { status: 502 }
      );
    }

    // Any other 4xx from upstream: pass the status through instead of
    // collapsing to 502, but keep the upstream detail string server-side.
    console.error(`skin-scan service error (${status}):`, upstreamDetail);
    return NextResponse.json(
      { error: "Couldn't analyze your photo. Please try again.", code: "SCAN_SERVICE_ERROR" },
      { status }
    );
  }

  const rawJson: unknown = await upstreamResponse.json();
  const parsed = SkinScanResultSchema.safeParse(rawJson);
  if (!parsed.success) {
    console.error("skin-scan response validation failed:", parsed.error);
    return NextResponse.json(
      { error: "Unexpected response from the skin scan service." },
      { status: 502 }
    );
  }

  // Loud-by-design: this schema used to silently drop region_raw/region_hist/
  // region_hist_bin_edges/pipeline_version because z.object() strips
  // undeclared keys. Comparing raw vs. parsed top-level keys turns the next
  // instance of that into a visible warning instead of silent data loss.
  const rawKeys = rawJson && typeof rawJson === "object" ? Object.keys(rawJson as Record<string, unknown>) : [];
  const parsedKeys = Object.keys(parsed.data);
  const droppedKeys = rawKeys.filter((key) => !parsedKeys.includes(key));
  // Only logs when a field is actually dropped — was unconditional on every
  // successful request, which is production log noise for a case that's
  // fine (no key names are sensitive either way, but there's no reason to
  // emit this on the hot path when nothing is wrong).
  if (droppedKeys.length > 0) {
    console.warn("skin-scan response fields dropped by schema:", droppedKeys);
  }

  // C2: persist the full analysis (incl. region_raw/region_hist, which the
  // client-side skinChecks write drops) — only when the client names the
  // scan. No scanId (old bundles) → response is byte-identical to before.
  const scanId = formData.get("scanId");
  if (!isValidScanId(scanId)) {
    return NextResponse.json({ ok: true, result: parsed.data });
  }
  const capture = formData.get("captureMethod");
  const captureMethod: CaptureMethod | undefined =
    capture === "native" || capture === "canvas" ? capture : undefined;
  const persistAttempt = formData.get("persistAttempt") === "recovery" ? "recovery" : undefined;
  // C01, client-asserted: an invalid value is dropped, never a reason to refuse the scan.
  const captureQuality = parseCaptureQuality(formData.get("captureQuality"), captureMethod);
  const persisted = await persistScanAnalysis(uid, scanId, image, parsed.data, captureMethod, persistAttempt, captureQuality);
  return NextResponse.json({ ok: true, result: parsed.data, persisted });
}

const isAlreadyExists = (err: unknown) => {
  const code = (err as { code?: unknown })?.code;
  return code === 6 || code === "already-exists";
};

/**
 * Writes users/{uid}/scanAnalyses/{scanId}_{sha16} with `.create()` — never
 * an update. Same bytes → same doc (ALREADY_EXISTS is success); a retake
 * under a reused scanId → a different doc. Never throws: any failure is
 * `false`, and the user's scan proceeds regardless.
 */
async function persistScanAnalysis(
  uid: string,
  scanId: string,
  image: Blob,
  result: SkinScanResult,
  captureMethod: CaptureMethod | undefined,
  persistAttempt: "recovery" | undefined,
  captureQuality: CaptureQuality | undefined
): Promise<boolean> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const inputSha256 = createHash("sha256").update(Buffer.from(await image.arrayBuffer())).digest("hex");
    const record = buildScanAnalysisRecord(result, { scanId, inputSha256, requestId: randomUUID(), captureMethod, persistAttempt, captureQuality });
    const bytes = recordByteSize(record);
    if (bytes > MAX_RECORD_BYTES) {
      console.error(`skin-scan: analysis record too large (${bytes} bytes) — not persisted.`);
      return false;
    }
    const ref = adminDb().collection("users").doc(uid).collection("scanAnalyses").doc(scanAnalysisDocId(scanId, inputSha256));
    const data = { ...record, createdAt: FieldValue.serverTimestamp() };

    const write = async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          await ref.create(data);
          return true;
        } catch (err) {
          if (isAlreadyExists(err)) return true;
          if (attempt >= 1) throw err;
        }
      }
    };
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("persist timeout")), PERSIST_TIMEOUT_MS);
    });
    return await Promise.race([write(), timeout]);
  } catch (err) {
    // name/code only: Firestore messages embed the doc path, i.e. the uid.
    const e = err as { name?: string; code?: unknown };
    console.error("skin-scan: analysis record not persisted:", e?.name ?? "unknown", e?.code ?? "");
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}
