// Browser only: decodes the exact blob the engine will receive into a Frame.
// Kept apart so the pure check modules never import DOM code.
import type { Frame } from "./types";

/** null when the image will not decode: the gate then reports `unchecked`, never `pass`. */
export async function frameFromBlob(blob: Blob): Promise<Frame | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0);
      const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      return { width: img.width, height: img.height, data: img.data };
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}
