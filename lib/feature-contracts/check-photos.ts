// C10 (TD-54 (2)): three-angle capture. BE3 implements storage, lane B draws
// 05/07. The FRONT photo is unchanged: same key (lib/s3-key.ts scanImageKey),
// same `image` block, the only one sent to the engine. Left and right are
// stored only (photo strips, export), never analysed.
//
// S3 layout (new keys, owner review):
//   users/{uid}/scans/{scanId}/original.jpg   front (unchanged)
//   users/{uid}/scans/{scanId}/left.jpg       new
//   users/{uid}/scans/{scanId}/right.jpg      new
// Same bucket, same image-retention consent, same erase prefix (users/{uid}/).
//
// skinChecks gains one optional field (create-only like the rest; rules change, owner review):
//   sideImages?: { left: SideImage; right: SideImage }

export type CaptureAngle = "front" | "left" | "right";
export const SIDE_ANGLES = ["left", "right"] as const;
export type SideAngle = (typeof SIDE_ANGLES)[number];

export type SideImage = { stored: true; storage: "s3"; key: string } | { stored: false };

/** The one place a side key is built (mirrors scanImageKey). */
export function sideImageKey(uid: string, scanId: string, angle: SideAngle): string {
  return `users/${uid}/scans/${scanId}/${angle}.jpg`;
}

/**
 * Upload: POST /api/skin-scan/upload gains an optional body field `angle`
 * ("front" default | "left" | "right"); same consent and size checks.
 * Read:   GET /api/checks/photo?scanId=…&angle=left|right (front when absent).
 */
export const PHOTO_ROUTE = "/api/checks/photo";

/** Live capture checks (C11), computed in the browser per video frame. */
export type LiveCheckId = "lighting" | "position" | "distance" | "face_clear";
export type LiveCheckState = "ok" | "adjust" | "unknown";
export interface LiveChecks {
  angle: CaptureAngle;
  checks: Record<LiveCheckId, LiveCheckState>;
  /** Short instruction for the first check that is not ok, or null. */
  hint: string | null;
  ready: boolean;
}
