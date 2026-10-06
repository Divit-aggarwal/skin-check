import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SECTIONS } from "@/lib/skin-check-steps";

// G03 quiz brief: every option picture is a small local file with a text
// description; no placeholder is left, and no photo or remote image is embedded.

const options = SECTIONS.flatMap((s) => s.steps).flatMap((step) => ("options" in step ? step.options.map((o) => ({ step: step.id, ...o })) : []));
const withImage = options.filter((o): o is typeof o & { image: { src: string; alt: string } } => "image" in o && !!o.image);

describe("quiz images", () => {
  it("no option still carries a text placeholder", () => {
    expect(options.filter((o) => "imagePlaceholder" in o)).toEqual([]);
    expect(withImage.length).toBe(5);
  });

  it.each(withImage.map((o) => [o.step, o.value, o.image] as const))("%s / %s: a small local SVG with a description", (_step, _value, image) => {
    expect(image.src).toMatch(/^\/quiz\/[a-z0-9-]+\.svg$/);
    const file = `public${image.src}`;
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeLessThan(3_000);
    const svg = readFileSync(file, "utf8");
    expect(svg).not.toMatch(/<image|data:|https?:\/\/(?!www\.w3\.org)/);
    expect(image.alt.trim().length).toBeGreaterThan(10);
  });
});
