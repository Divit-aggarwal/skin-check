import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { meshPath, type Pt } from "@/lib/face-mesh/regions";

// TD-37 (2), (5): the face mesh. Files from our own site, one pinned version,
// a map of the face that is never drawn as a finding.

describe("mesh files: pinned and served from our own site", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const loader = readFileSync("components/mesh/landmarks.ts", "utf8");

  it("one exact library version, the same in package.json, the loader and the lockfile", () => {
    expect(pkg.dependencies["@mediapipe/tasks-vision"]).toBe("0.10.35");
    expect(loader).toMatch(/MEDIAPIPE_VERSION = "0\.10\.35"/);
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
    expect(lock.packages["node_modules/@mediapipe/tasks-vision"].version).toBe("0.10.35");
  });

  // Privacy review 2026-10-11: @mediapipe/tasks-vision 1.0.0 and 1.0.1 POST usage
  // logs to odml.pa.googleapis.com every 60 seconds, with no off switch. 0.10.35
  // has no such code. This fails if a version change brings it back.
  it("the shipped library code sends nothing to Google (no usage logging)", () => {
    for (const f of ["vision_bundle.mjs", "wasm/vision_wasm_internal.js", "wasm/vision_wasm_nosimd_internal.js"]) {
      const src = readFileSync(join("node_modules/@mediapipe/tasks-vision", f), "utf8");
      expect(src, f).not.toMatch(/odml\.pa\.googleapis|googleapis\.com\/v1\/log|x-goog-api-key/);
    }
  });

  it("the model file is the one recorded, by sha256", () => {
    const readme = readFileSync("docs/design/face-mesh.md", "utf8");
    const sha = createHash("sha256").update(readFileSync("public/mediapipe/face_landmarker-64184e22.task")).digest("hex");
    expect(sha).toBe("64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff");
    expect(readme).toContain(sha);
  });

  it("wasm and model paths are on our own origin; the mesh code names no outside address", () => {
    expect(loader).toMatch(/WASM_PATH = `\/mediapipe\//);
    expect(loader).toMatch(/MODEL_PATH = "\/mediapipe\/face_landmarker-64184e22\.task"/);
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
    for (const f of ["landmarks.ts", "MeshLayer.tsx", "FacePhoto.tsx", "ScanningPhoto.tsx"]) {
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

  it("TD-39: nothing on the mesh is filled or can be chosen", () => {
    expect(layer).not.toMatch(/fill-brand-mist|role="button"|tabIndex|onClick|aria-pressed/);
    expect(layer).toMatch(/fill="none"/);
    expect(layer).toMatch(/aria-hidden\n/);
  });

  it("the sweep moves by transform and stops under reduced motion", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/@keyframes mesh-scan \{\s*from \{ transform: translateY\(-100%\); \}/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.mesh-scan \{ animation: none; display: none; \}/);
    expect(layer).toMatch(/motion-reduce:hidden/);
  });
});

describe("mesh path", () => {
  const syntheticFace = (): Pt[] => Array.from({ length: 478 }, (_, i) => [i, i] as Pt);
  it("the mesh path is one move-and-line per edge, nothing else", () => {
    const d = meshPath(syntheticFace(), [{ start: 0, end: 1 }, { start: 1, end: 2 }, { start: 999, end: 1 }]);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/L/g)).toHaveLength(2);
    expect(d).not.toMatch(/[AaCcQqZz]/);
  });
});
