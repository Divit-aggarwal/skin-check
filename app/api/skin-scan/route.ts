import { NextResponse, type NextRequest } from "next/server";
import { checkRequestRate, consumeDailyQuota, SKIN_SCAN_ROUTE_LIMITS } from "@/lib/rate-limit";
import { SkinScanResultSchema } from "@/types/skin-scan";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 30_000;

// Matches SkinScanScoresSchema's 7 categories (types/skin-scan.ts). Allowlist,
// not passthrough — the value lands in an upstream query string, and
// validating against the known 7 keeps a malformed client from shaping it.
const VALID_OVERLAYS = new Set([
  "redness", "oiliness", "texture", "pores", "blemishes", "hydration", "pigment",
]);

// Pre-login, unauthenticated by design — same as the rest of the /skin-check
// route (CLAUDE.md). Proxies to the self-hosted skin-scan service (OpenCV +
// MediaPipe FastAPI, DurtyDhiana/skin-scan) so the client never talks to it
// directly.
const SKIN_SCAN_API_URL = process.env.SKIN_SCAN_API_URL;

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

  const rateLimited = checkRequestRate(request, SKIN_SCAN_ROUTE_LIMITS);
  if (rateLimited) return rateLimited;

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
    return NextResponse.json({ error: "Image too large. Maximum 5MB." }, { status: 400 });
  }

  const quotaLimited = consumeDailyQuota(request, SKIN_SCAN_ROUTE_LIMITS);
  if (quotaLimited) return quotaLimited;

  const upstreamForm = new FormData();
  upstreamForm.append("image", image, "scan.jpg");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  // No overlay requested means no overlay returned — the cheapest path, not
  // the most expensive one.
  const scanUrl = overlay
    ? `${SKIN_SCAN_API_URL}/scan?overlays=${encodeURIComponent(overlay)}`
    : `${SKIN_SCAN_API_URL}/scan`;

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

  return NextResponse.json({ ok: true, result: parsed.data });
}
