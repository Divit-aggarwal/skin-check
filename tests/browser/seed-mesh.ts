// TD-37 browser test users (scripts/seed-lane-mesh.ts writes them).
// Phone numbers +9199999011xx. One user per width for every test that saves.
import { WIDTHS, type Width } from "./seed-questionnaire";

// TD-39: every screen with a photo is tested on a darker and a lighter skin tone.
// Dark: the engine's own test face (LOCAL_STACK_FACE). Light: FACE_LIGHT, a crop
// of the public-domain US Navy portrait of Grace Hopper (Wikimedia Commons
// File:Grace_Hopper.jpg, as shipped in matplotlib's sample data).
export const FACE_DARK = process.env.LOCAL_STACK_FACE ?? "../skin-scan/fixtures/input_face.png";
export const FACE_LIGHT = "tests/browser/fixtures/face-light.jpg";

export type MeshUser = { uid: string; phoneNumber: string; check: "answered" | "skipped"; kept: boolean; face?: "dark" | "light" };
const u = (n: number, uid: string, check: MeshUser["check"], kept = false, face: MeshUser["face"] = "dark"): MeshUser => ({ uid: `seed-mesh-${uid}`, phoneNumber: `+9199999011${String(n).padStart(2, "0")}`, check, kept, face });
const perWidth = (n: number, name: string, check: MeshUser["check"]) => Object.fromEntries(WIDTHS.map((w, i) => [w, u(n + i, `${name}-${w}`, check)])) as Record<Width, MeshUser>;

export const MESH_SEED = {
  // Returning, answered: a new check goes photo, one re-confirm, results.
  answered: perWidth(1, "answered", "answered"),
  // Returning, skipped: a new check skips the questions again.
  skipped: perWidth(11, "skipped", "skipped"),
  // One measured, answered check with a kept photo: the mesh on Home and the opened check.
  kept: u(21, "kept", "answered", true),
  keptLight: u(24, "kept-light", "answered", true, "light"),
  // Returning, answered, a new check with the light-skin photo.
  answeredLight: perWidth(31, "answered-light", "answered"),
  // One measured, answered check, no photo kept: the face drawing.
  noPhoto: u(22, "no-photo", "answered"),
  // One measured check whose questions were skipped, no photo kept.
  noPhotoSkipped: u(23, "no-photo-skipped", "skipped"),
} as const;

export const allMeshUsers = (): MeshUser[] => [...Object.values(MESH_SEED.answered), ...Object.values(MESH_SEED.skipped), MESH_SEED.kept, MESH_SEED.keptLight, ...Object.values(MESH_SEED.answeredLight), MESH_SEED.noPhoto, MESH_SEED.noPhotoSkipped];

/** Male, so one question (current products) is asked again on a new check. Breakouts and dark marks named; texture not. */
export const MESH_ANSWERS = {
  name: "Seed",
  age: "25-34",
  gender: "male",
  primary_concerns: ["blemishes", "pigment", "redness"],
  skin_type: "combination",
  breakout_pattern: ["red_inflamed"],
  acne_areas: ["chin_jawline", "forehead"],
  pih_scar_tendency: "dark_mark_lingers",
  skin_tone: "fitz_4",
  current_products: ["cleanser_moisturizer"],
  male_skin_context: ["none_not_sure"],
  skin_factors: ["stress"],
  diet: ["none"],
  water_intake: "2to3",
  sunscreen_habit: "most_days",
};
