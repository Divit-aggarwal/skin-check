import { isAuthError, isUploadError, runSkinScan } from "@/lib/api";
import { isRetakeError, RETAKE_COPY, retakeReasonFromServerCode } from "@/lib/capture-quality/retake";
import { OVERLAY_CATEGORIES } from "@/lib/skin-check-skus";
import type { SkinScanState } from "@/types/skin-scan";

type ErrorScan = Extract<SkinScanState, { status: "error" }>;

/**
 * The engine refused this photo (retakeReason set): sending the same bytes
 * again can only be refused again, so the only offer is a new photo.
 */
export function canRetrySamePhoto(scan: ErrorScan): boolean {
  return !scan.retakeReason;
}

/**
 * The dashboard's retry of a failed scan, as the next scan state. The capture
 * quality result travels with the photo it describes: it is re-sent so the
 * retried record carries `captureQuality`, and kept on both outcomes so the
 * draft does not lose it.
 */
export async function retrySkinScan(scan: ErrorScan, scanId: string, run = runSkinScan): Promise<SkinScanState> {
  const { message, photo, original, captureMethod, originalStored, retentionConsentVersion, quality, processingConsentVersion } = scan;
  try {
    // Same sequence as the capture step: store the original first (unless
    // it's already up, or the bytes didn't survive a draft restore), then
    // analyze.
    const retried = await run({
      scanId,
      photo,
      captureMethod,
      original,
      // Carried from the capture step, never re-asserted here: the dashboard
      // shows no consent control, so a retry can only ever store what the
      // user already agreed to store.
      retentionConsent: Boolean(retentionConsentVersion),
      alreadyStored: originalStored ?? false,
      overlays: OVERLAY_CATEGORIES,
      captureQuality: quality,
      // The consent this photo was taken under; absent after a draft restore.
      processingConsentVersion,
    });
    return {
      status: "success",
      result: retried.result,
      photo,
      original,
      captureMethod,
      originalStored: retried.originalStored,
      retentionConsentVersion,
      quality,
      processingConsentVersion,
    };
  } catch (err) {
    console.error("Skin scan retry failed:", err);
    const retakeReason = isRetakeError(err) ? retakeReasonFromServerCode(err.code) ?? undefined : undefined;
    return {
      status: "error",
      // Reusing the previous `message` would misreport a fresh auth failure
      // as whatever went wrong the first time.
      message: retakeReason
        ? RETAKE_COPY[retakeReason]
        : isAuthError(err)
        ? "Your session expired. Refresh the page to sign in again, then retry."
        : isUploadError(err)
          ? "We couldn't save your photo just now. Check your connection and retry."
          : message,
      photo,
      original,
      captureMethod,
      // An upload failure leaves nothing stored. Anything else means the
      // upload phase completed (or was skipped because it was already
      // stored), so a CV failure must not un-claim an object that is up.
      originalStored: isUploadError(err)
        ? false
        : (originalStored || (Boolean(original) && Boolean(retentionConsentVersion))),
      retentionConsentVersion,
      quality,
      retakeReason,
      processingConsentVersion,
    };
  }
}
