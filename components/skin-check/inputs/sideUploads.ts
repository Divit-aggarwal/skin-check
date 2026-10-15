import { uploadOriginalImage } from "@/lib/api";
import { SIDE_ANGLES, sideImageKey, type SideAngle } from "@/lib/feature-contracts/check-photos";
import type { SideImages } from "@/types/skin-scan";

/**
 * C10: the two cheek photos go to private storage only with the same
 * image-retention consent as the front, and are never analysed. A side is
 * `stored: true` only when this tab watched its upload land; a failure is
 * `stored: false` and never blocks the check.
 */
export async function uploadSides(
  uid: string,
  scanId: string,
  sides: Record<SideAngle, Blob>,
  retentionConsent: boolean,
  upload: (scanId: string, blob: Blob, angle: SideAngle) => Promise<void> = uploadOriginalImage
): Promise<SideImages> {
  const one = async (angle: SideAngle) => {
    if (!retentionConsent) return { stored: false } as const;
    try {
      await upload(scanId, sides[angle], angle);
      return { stored: true, storage: "s3", key: sideImageKey(uid, scanId, angle) } as const;
    } catch {
      return { stored: false } as const;
    }
  };
  const [left, right] = await Promise.all(SIDE_ANGLES.map(one));
  return { left: left!, right: right! };
}
