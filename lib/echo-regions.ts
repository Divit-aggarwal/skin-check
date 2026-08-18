// The 4 regions the skin-scan pipeline actually masks (face_mesh.py,
// confirmed against the real code in Step 4a) — forehead, cheeks (single
// combined zone; the pipeline doesn't produce a real L/R split), nose, chin.
// Do not add more zones here without confirming the pipeline masks them.
export const ECHO_REGIONS = ["forehead", "cheeks", "nose", "chin"] as const;

export type EchoRegion = (typeof ECHO_REGIONS)[number];

export const ECHO_REGION_LABELS: Record<EchoRegion, string> = {
  forehead: "Forehead",
  cheeks: "Cheeks",
  nose: "Nose",
  chin: "Chin",
};

export function isEchoRegion(value: string | null): value is EchoRegion {
  return value !== null && (ECHO_REGIONS as readonly string[]).includes(value);
}
