import { NextResponse, type NextRequest } from "next/server";
import { checkRequestRate, consumeDailyQuota, SKIN_SCAN_ROUTE_LIMITS } from "@/lib/rate-limit";
import { SkinScanResultSchema } from "@/types/skin-scan";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Pre-login, unauthenticated by design — same as the rest of the /skin-check
// route (CLAUDE.md). Proxies to the self-hosted skin-scan service (OpenCV +
// MediaPipe FastAPI, DurtyDhiana/skin-scan) so the client never talks to it
// directly. Local-only for now; SKIN_SCAN_API_URL swaps to a deployed URL
// once that service is hosted (separate session).
const SKIN_SCAN_API_URL = process.env.SKIN_SCAN_API_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest) {
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

  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image too large. Maximum 5MB." }, { status: 400 });
  }

  const quotaLimited = consumeDailyQuota(request, SKIN_SCAN_ROUTE_LIMITS);
  if (quotaLimited) return quotaLimited;

  const upstreamForm = new FormData();
  upstreamForm.append("image", image, "scan.jpg");

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(`${SKIN_SCAN_API_URL}/scan`, {
      method: "POST",
      body: upstreamForm,
    });
  } catch (err) {
    console.error("skin-scan service unreachable:", err);
    return NextResponse.json(
      { error: "Skin scan service is unavailable right now." },
      { status: 502 }
    );
  }

  if (!upstreamResponse.ok) {
    console.error("skin-scan service error:", upstreamResponse.status);
    return NextResponse.json(
      { error: "Couldn't analyze your photo. Please try again." },
      { status: 502 }
    );
  }

  const parsed = SkinScanResultSchema.safeParse(await upstreamResponse.json());
  if (!parsed.success) {
    console.error("skin-scan response validation failed:", parsed.error);
    return NextResponse.json(
      { error: "Unexpected response from the skin scan service." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, result: parsed.data });
}
