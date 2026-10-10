import type { EchoRegion } from "@/lib/echo-regions";

// TD-37 (2): the outline of each face area on the mesh, built from the SAME
// landmark groups the engine builds its region masks from
// (skin-scan src/pipeline/face_mesh.py make_region_masks, mediapipe 0.10.21
// FACEMESH_* groups, the same 468-point topology the browser library returns).
// So the highlighted area is the area the engine read.
// ponytail: convex hulls with the mouth, eyes and nose cut out; the engine's
// pixel dilation margins are not copied. Copy them if the outline must match
// the mask pixel for pixel.

export const OVAL = [10, 21, 54, 58, 67, 93, 103, 109, 127, 132, 136, 148, 149, 150, 152, 162, 172, 176, 234, 251, 284, 288, 297, 323, 332, 338, 356, 361, 365, 377, 378, 379, 389, 397, 400, 454];
export const LEFT_EYE = [249, 263, 362, 373, 374, 380, 381, 382, 384, 385, 386, 387, 388, 390, 398, 466];
export const RIGHT_EYE = [7, 33, 133, 144, 145, 153, 154, 155, 157, 158, 159, 160, 161, 163, 173, 246];
export const LEFT_EYEBROW = [276, 282, 283, 285, 293, 295, 296, 300, 334, 336];
export const RIGHT_EYEBROW = [46, 52, 53, 55, 63, 65, 66, 70, 105, 107];
export const LIPS = [0, 13, 14, 17, 37, 39, 40, 61, 78, 80, 81, 82, 84, 87, 88, 91, 95, 146, 178, 181, 185, 191, 267, 269, 270, 291, 308, 310, 311, 312, 314, 317, 318, 321, 324, 375, 402, 405, 409, 415];
export const NOSE = [1, 2, 4, 5, 6, 19, 45, 48, 64, 94, 97, 98, 115, 168, 195, 197, 220, 275, 278, 294, 326, 327, 344, 440];

/** The topology needs index 467; the refined model returns 478 points. */
export const MIN_POINTS = 468;

export type Pt = [number, number];

/** One area: the shapes to fill and the holes cut out of them, in image pixels. */
export interface AreaOutline {
  fill: Pt[][];
  holes: Pt[][];
  /** Where the label sits. */
  label: Pt[];
}

const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Andrew's monotone chain. */
export function hull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

const centre = (pts: Pt[]): Pt => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

/**
 * The four areas from landmarks in image pixels (x right, y down), as the
 * engine splits them: forehead above the brows, chin below the lips' top,
 * cheeks the band between, split at the nose. null for too few points.
 */
export function areaOutlines(pts: readonly Pt[]): Record<EchoRegion, AreaOutline> | null {
  if (pts.length < MIN_POINTS) return null;
  const at = (ids: number[]) => ids.map((i) => pts[i]!);
  const browMaxY = Math.max(...at([...LEFT_EYEBROW, ...RIGHT_EYEBROW]).map((p) => p[1]));
  const lipMinY = Math.min(...at(LIPS).map((p) => p[1]));
  const noseX = centre(at(NOSE))[0];
  const lips = hull(at(LIPS));
  const nose = hull(at(NOSE));

  const forehead = hull(at([...OVAL.filter((i) => pts[i]![1] < browMaxY), ...LEFT_EYEBROW, ...RIGHT_EYEBROW]));
  const chin = hull(at([...OVAL.filter((i) => pts[i]![1] > lipMinY), ...LIPS]));
  const band = OVAL.filter((i) => pts[i]![1] >= browMaxY && pts[i]![1] <= lipMinY);
  // Image-left is the subject's right (the engine's note on mirrored naming).
  // The engine's hull takes the whole nose and mouth; for drawing, each cheek
  // takes only its own side of them, so its outline never crosses the other cheek.
  const cheek = (side: number[], brow: number[], eye: number[], onSide: (i: number) => boolean) => ({
    shape: hull(at([...side, ...brow, ...[...NOSE, ...LIPS].filter(onSide)])),
    eye: hull(at([...brow, ...eye])),
  });
  const left = cheek(band.filter((i) => pts[i]![0] < noseX), RIGHT_EYEBROW, RIGHT_EYE, (i) => pts[i]![0] <= noseX);
  const right = cheek(band.filter((i) => pts[i]![0] >= noseX), LEFT_EYEBROW, LEFT_EYE, (i) => pts[i]![0] >= noseX);
  const leftOval = at(band.filter((i) => pts[i]![0] < noseX));
  const rightOval = at(band.filter((i) => pts[i]![0] >= noseX));
  // Cheek labels halfway between the side of the face and the nose, at mid-band height.
  const cheekLabel = (side: Pt[]): Pt => {
    const x = side.length ? centre(side)[0] : noseX;
    return [(x + noseX) / 2, (browMaxY + lipMinY) / 2 + (lipMinY - browMaxY) * 0.15];
  };

  return {
    forehead: { fill: [forehead], holes: [], label: [centre(forehead)] },
    nose: { fill: [nose], holes: [], label: [centre(nose)] },
    // The engine cuts the mouth out of the chin, and the eyes, nose and mouth out of the cheeks.
    chin: { fill: [chin], holes: [lips], label: [[centre(chin)[0], (lipMinY + Math.max(...chin.map((p) => p[1]))) / 2 + (Math.max(...chin.map((p) => p[1])) - lipMinY) * 0.15]] },
    cheeks: { fill: [left.shape, right.shape], holes: [left.eye, right.eye, nose, lips, forehead, chin], label: [cheekLabel(leftOval), cheekLabel(rightOval)] },
  };
}

/** An SVG path for closed polygons. */
export const polygonPath = (polys: Pt[][]) => polys.map((p) => (p.length ? `M${p.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z` : "")).join("");

/** The mesh as one SVG path: every edge once, one stroke. No point is drawn (TD-37: a map, not a finding). */
export function meshPath(pts: readonly Pt[], edges: readonly { start: number; end: number }[]): string {
  let d = "";
  for (const { start, end } of edges) {
    const a = pts[start];
    const b = pts[end];
    if (a && b) d += `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  }
  return d;
}
