"use client";

import type { Pt } from "@/lib/face-mesh/regions";
import { MIN_POINTS } from "@/lib/face-mesh/regions";

// TD-37 (2), (5): face landmarks found in the browser, for drawing the mesh
// only. The engine returns no landmark points (skin-scan ScanResponse).
// - The library is @mediapipe/tasks-vision, pinned in package.json, and is
//   loaded with import() only when a screen asks for a mesh.
// - Its wasm and the model file come from our own site (/mediapipe/, see
//   next.config.js and docs/design/face-mesh.md). Nothing is fetched from
//   anywhere else, and the photo never leaves the device for this.
// - Points are never stored or sent anywhere.

export const MEDIAPIPE_VERSION = "0.10.35";
export const WASM_PATH = `/mediapipe/${MEDIAPIPE_VERSION}/wasm`;
/** Named by the first 8 hex of its sha256, so it can be cached for good (next.config.js headers). */
export const MODEL_PATH = "/mediapipe/face_landmarker-64184e22.task";
/** The photo is scaled down to this width before the search: enough for a mesh, light on a low-cost phone. */
const MAX_WIDTH = 1024;

export interface FaceMesh {
  /** Landmarks in the photo's own pixels (EXIF orientation applied). */
  points: Pt[];
  edges: { start: number; end: number }[];
  width: number;
  height: number;
}

type Landmarker = import("@mediapipe/tasks-vision").FaceLandmarker;
let landmarker: Promise<{ lm: Landmarker; edges: FaceMesh["edges"] }> | null = null;

async function load() {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
  const create = (delegate: "GPU" | "CPU") =>
    FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL_PATH, delegate }, runningMode: "IMAGE", numFaces: 1 });
  // Many low-cost phones and headless browsers have no usable GPU path.
  const lm = await create("GPU").catch(() => create("CPU"));
  return { lm, edges: FaceLandmarker.FACE_LANDMARKS_TESSELATION.map(({ start, end }) => ({ start, end })) };
}

/**
 * No mesh on a data-saver or 2G connection: about 15 MB of files is too much
 * there. The screens then show the photo alone or the face drawing.
 */
export function meshAllowed(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !(c?.saveData || c?.effectiveType === "2g" || c?.effectiveType === "slow-2g");
}

/** Starts the download early (after capture), so the mesh is ready for the scanning view. Never throws. */
export function preloadFaceMesh(): void {
  if (meshAllowed()) void getLandmarker().catch(() => {});
}

function getLandmarker() {
  landmarker ??= load().catch((err) => {
    landmarker = null; // a later screen may try again
    throw err;
  });
  return landmarker;
}

async function bitmapOf(photo: Blob): Promise<ImageBitmap> {
  // from-image: the same orientation an <img> shows, so the mesh lines up. A
  // browser that cannot apply it gets no mesh rather than one off the face.
  const full = await createImageBitmap(photo, { imageOrientation: "from-image" });
  if (full.width <= MAX_WIDTH) return full;
  const small = await createImageBitmap(full, { resizeWidth: MAX_WIDTH, resizeHeight: Math.round((full.height * MAX_WIDTH) / full.width), resizeQuality: "medium" });
  full.close();
  return small;
}

const cache = new WeakMap<Blob, Promise<FaceMesh | null>>();

/** The mesh for one photo, or null when no face was found or the library could not run. Never throws. */
export function faceMeshOf(photo: Blob): Promise<FaceMesh | null> {
  let found = cache.get(photo);
  if (!found) {
    found = (async () => {
      if (!meshAllowed()) return null;
      try {
        const [{ lm, edges }, bmp] = await Promise.all([getLandmarker(), bitmapOf(photo)]);
        try {
          const face = lm.detect(bmp).faceLandmarks[0];
          if (!face || face.length < MIN_POINTS) return null;
          const { width, height } = bmp;
          return { points: face.map((p) => [p.x * width, p.y * height] as Pt), edges, width, height };
        } finally {
          bmp.close();
        }
      } catch (err) {
        console.warn("face mesh unavailable:", err instanceof Error ? err.name : "unknown");
        return null;
      }
    })();
    cache.set(photo, found);
  }
  return found;
}

// C11 (screen 07): a second landmarker in VIDEO mode for the live capture
// checks on the camera stream. Same files and GPU→CPU fallback; the IMAGE one
// above is left as it is. Points are measured in the tab and never kept.
// ponytail: kept for the session once loaded (a few MB); close it if memory on low-end phones matters.
let videoLandmarker: Promise<Landmarker> | null = null;

/** Rejects when the library or model cannot load (the capture then falls back to one photo). */
export function getVideoLandmarker(): Promise<Landmarker> {
  videoLandmarker ??= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    const create = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL_PATH, delegate }, runningMode: "VIDEO", numFaces: 1 });
    return create("GPU").catch(() => create("CPU"));
  })().catch((err) => {
    videoLandmarker = null;
    throw err;
  });
  return videoLandmarker;
}
