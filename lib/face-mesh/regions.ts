// TD-37 (2): the face mesh drawn over the user's photo. TD-39 removed the
// area outlines (nothing on the photo is chosen), so only the mesh lines stay.

/** The topology needs index 467; the refined model returns 478 points. */
export const MIN_POINTS = 468;

export type Pt = [number, number];

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
