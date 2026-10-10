import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { areaOutlines, hull, LEFT_EYE, LEFT_EYEBROW, LIPS, meshPath, MIN_POINTS, NOSE, OVAL, RIGHT_EYE, RIGHT_EYEBROW, type Pt } from "@/lib/face-mesh/regions";

// TD-37 (2), (5): the face mesh. Files from our own site, one pinned version,
// a map of the face that is never drawn as a finding.

describe("mesh files: pinned and served from our own site", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const loader = readFileSync("components/mesh/landmarks.ts", "utf8");

  it("one exact library version, the same in package.json, the loader and the lockfile", () => {
    expect(pkg.dependencies["@mediapipe/tasks-vision"]).toBe("1.0.1");
    expect(loader).toMatch(/MEDIAPIPE_VERSION = "1\.0\.1"/);
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
    expect(lock.packages["node_modules/@mediapipe/tasks-vision"].version).toBe("1.0.1");
  });

  it("the model file is the one recorded, by sha256", () => {
    const readme = readFileSync("public/mediapipe/README.md", "utf8");
    const sha = createHash("sha256").update(readFileSync("public/mediapipe/face_landmarker.task")).digest("hex");
    expect(sha).toBe("64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff");
    expect(readme).toContain(sha);
  });

  it("wasm and model paths are on our own origin; the mesh code names no outside address", () => {
    expect(loader).toMatch(/WASM_PATH = `\/mediapipe\//);
    expect(loader).toMatch(/MODEL_PATH = "\/mediapipe\/face_landmarker\.task"/);
    for (const f of readdirSync("components/mesh")) {
      const src = readFileSync(join("components/mesh", f), "utf8");
      expect(src, f).not.toMatch(/https?:\/\/|storage\.googleapis|cdn\.jsdelivr|unpkg/);
    }
  });

  it("the library is loaded with import() only, and only by the mesh code", () => {
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
      });
    const users = ["app", "components", "lib"].flatMap(files).filter((f) => readFileSync(f, "utf8").includes("@mediapipe/tasks-vision"));
    expect(users).toEqual([join("components", "mesh", "landmarks.ts")]);
    expect(loader).not.toMatch(/^import .*@mediapipe\/tasks-vision/m);
    expect(loader).toMatch(/await import\("@mediapipe\/tasks-vision"\)/);
  });

  it("the points are never stored or sent: no write, no fetch, no storage in the mesh code", () => {
    for (const f of ["landmarks.ts", "MeshLayer.tsx", "MeshPicker.tsx", "ScanningPhoto.tsx"]) {
      const src = readFileSync(join("components/mesh", f), "utf8");
      expect(src, f).not.toMatch(/fetch\(|setDoc|addDoc|updateDoc|localStorage|indexedDB|sendBeacon|XMLHttpRequest/);
    }
  });
});

describe("mesh drawing: a map, never a finding", () => {
  const layer = readFileSync("components/mesh/MeshLayer.tsx", "utf8");
  it("lines only: no points, dots or colours by place", () => {
    expect(layer).not.toMatch(/<circle|<ellipse|<rect|marker|heat|\bred\b|amber|#[Ff]{2}0000/);
    // One stroke colour for the whole mesh.
    expect(layer.match(/stroke="#FFFFFF" strokeOpacity/g)).toHaveLength(1);
  });

  it("only the area the user chose is filled", () => {
    expect(layer).toMatch(/on\s*\?\s*"fill-brand-mist\/60 stroke-brand-forest/);
    expect(layer).toMatch(/: "fill-white\/0 /);
  });

  it("the sweep moves by transform and stops under reduced motion", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/@keyframes mesh-scan \{\s*from \{ transform: translateY\(-100%\); \}/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.mesh-scan \{ animation: none; display: none; \}/);
    expect(layer).toMatch(/motion-reduce:hidden/);
  });
});

// A synthetic face: every index of each group placed where that part of a
// face sits (x right, y down). Not anyone's face.
function syntheticFace(): Pt[] {
  const pts: Pt[] = Array.from({ length: 478 }, () => [500, 500] as Pt);
  const ring = (ids: number[], cx: number, cy: number, rx: number, ry: number) =>
    ids.forEach((id, k) => (pts[id] = [cx + rx * Math.cos((2 * Math.PI * k) / ids.length), cy + ry * Math.sin((2 * Math.PI * k) / ids.length)]));
  ring(OVAL, 500, 520, 300, 400);
  ring(RIGHT_EYEBROW, 380, 380, 70, 12); // image-left
  ring(LEFT_EYEBROW, 620, 380, 70, 12);
  ring(RIGHT_EYE, 380, 430, 50, 18);
  ring(LEFT_EYE, 620, 430, 50, 18);
  ring(NOSE, 500, 520, 40, 90);
  ring(LIPS, 500, 700, 90, 30);
  return pts;
}

describe("area outlines from the engine's own landmark groups", () => {
  const areas = areaOutlines(syntheticFace())!;
  const ys = (poly: Pt[]) => poly.map((p) => p[1]);

  it("four areas; too few points gives none", () => {
    expect(Object.keys(areas).sort()).toEqual(["cheeks", "chin", "forehead", "nose"]);
    expect(areaOutlines(syntheticFace().slice(0, MIN_POINTS - 1))).toBeNull();
  });

  it("forehead ends at the brows, chin starts at the lips, cheeks are two shapes either side of the nose", () => {
    expect(Math.max(...ys(areas.forehead.fill[0]!))).toBeLessThanOrEqual(392 + 1e-6);
    expect(Math.min(...ys(areas.chin.fill[0]!))).toBeGreaterThanOrEqual(670 - 1e-6);
    expect(areas.cheeks.fill).toHaveLength(2);
    expect(areas.cheeks.label[0]![0]).toBeLessThan(500);
    expect(areas.cheeks.label[1]![0]).toBeGreaterThan(500);
    // The mouth is cut out of the chin, and eyes, nose and mouth out of the cheeks.
    expect(areas.chin.holes).toHaveLength(1);
    expect(areas.cheeks.holes.length).toBeGreaterThanOrEqual(4);
  });

  it("hull: a square with a point inside is the square", () => {
    const h = hull([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5]]);
    expect(h).toHaveLength(4);
    expect(h).not.toContainEqual([5, 5]);
  });

  it("the mesh path is one move-and-line per edge, nothing else", () => {
    const d = meshPath(syntheticFace(), [{ start: 0, end: 1 }, { start: 1, end: 2 }, { start: 999, end: 1 }]);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/L/g)).toHaveLength(2);
    expect(d).not.toMatch(/[AaCcQqZz]/);
  });
});
