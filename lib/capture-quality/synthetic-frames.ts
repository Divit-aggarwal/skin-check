// Synthetic frames for the capture-quality tests. No faces, no real photos.
// Imported only by tests.
import type { Frame } from "./types";

export function frameFromLuma(width: number, height: number, value: (x: number, y: number) => number): Frame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = value(x, y);
      const p = (y * width + x) * 4;
      data[p] = v;
      data[p + 1] = v;
      data[p + 2] = v;
      data[p + 3] = 255;
    }
  }
  return { width, height, data };
}

export const flat = (width: number, height: number, v: number) => frameFromLuma(width, height, () => v);

/** Left-to-right ramp from `from` to `to`. */
export const gradient = (width: number, height: number, from = 0, to = 255) =>
  frameFromLuma(width, height, (x) => from + ((to - from) * x) / Math.max(1, width - 1));

/** Squares of `cell` px alternating `lo` / `hi`. */
export const checkerboard = (width: number, height: number, cell = 1, lo = 0, hi = 255) =>
  frameFromLuma(width, height, (x, y) => ((Math.floor(x / cell) + Math.floor(y / cell)) % 2 ? hi : lo));

/** The first `count` pixels (row-major) set to `v`, the rest `rest`. */
export function withFirstPixels(width: number, height: number, count: number, v: number, rest: number): Frame {
  return frameFromLuma(width, height, (x, y) => (y * width + x < count ? v : rest));
}

/** A 3x3 box blur applied `passes` times (edges clamp). */
export function boxBlur(frame: Frame, passes = 1): Frame {
  let cur = frame;
  for (let k = 0; k < passes; k++) {
    const { width, height, data } = cur;
    const out = new Uint8ClampedArray(data.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const xx = Math.min(width - 1, Math.max(0, x + dx));
              const yy = Math.min(height - 1, Math.max(0, y + dy));
              sum += data[(yy * width + xx) * 4 + c]!;
            }
          }
          out[(y * width + x) * 4 + c] = sum / 9;
        }
        out[(y * width + x) * 4 + 3] = 255;
      }
    }
    cur = { width, height, data: out };
  }
  return cur;
}
