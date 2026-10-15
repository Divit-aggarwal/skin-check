import { uploadOriginalImage } from "@/lib/api";
import { SIDE_ANGLES, type SideAngle } from "@/lib/feature-contracts/check-photos";
import type { SidesStored } from "@/types/skin-scan";

/**
 * C10: the two cheek photos go to private storage only with the same
 * image-retention consent as the front, and are never analysed. A side is
 * true only when this tab watched its upload land; a failure is false and
 * never blocks the check.
 */
export async function uploadSides(
  scanId: string,
  sides: Record<SideAngle, Blob>,
  retentionConsent: boolean,
  upload: (scanId: string, blob: Blob, angle: SideAngle) => Promise<void> = uploadOriginalImage
): Promise<SidesStored> {
  const one = async (angle: SideAngle) => {
    if (!retentionConsent) return false;
    try {
      await upload(scanId, sides[angle], angle);
      return true;
    } catch {
      return false;
    }
  };
  const [left, right] = await Promise.all(SIDE_ANGLES.map(one));
  return { left: left!, right: right! };
}
