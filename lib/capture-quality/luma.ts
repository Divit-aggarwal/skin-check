import type { Frame } from "./types";

/**
 * ITU-R BT.601 luma weights (Y' = 0.299 R' + 0.587 G' + 0.114 B'), held as
 * integers per mille so a grey pixel's luma is exactly its value. A fixed
 * standard, not a threshold, so it is not a quality setting.
 */
export const LUMA_REC601 = { r: 299, g: 587, b: 114, scale: 1000 } as const;

/** Per-pixel 8-bit luma of a frame. Alpha is ignored. Caller checks the frame shape. */
export function lumaOf(frame: Frame): Float32Array {
  const n = frame.width * frame.height;
  const out = new Float32Array(n);
  const d = frame.data;
  const { r, g, b, scale } = LUMA_REC601;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    out[i] = (r * d[p]! + g * d[p + 1]! + b * d[p + 2]!) / scale;
  }
  return out;
}

/** The one frame-shape guard every check shares: null when the frame can be measured. */
export function frameProblem(frame: Frame | null): "decode_failed" | "frame_empty" | null {
  if (!frame) return "decode_failed";
  if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width <= 0 || frame.height <= 0) return "frame_empty";
  if (frame.data.length !== frame.width * frame.height * 4) return "decode_failed";
  return null;
}
