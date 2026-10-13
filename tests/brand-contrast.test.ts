import { describe, expect, it } from "vitest";
import config from "../tailwind.config";

// G03 part 1: text contrast with the live-site colours (docs/design/system.md §0, §2).
// WCAG 2.1: 4.5:1 for text, 3:1 for large text and UI parts (focus ring, outlines).

const brand = (config.theme?.extend?.colors as Record<string, Record<string, string>>).brand!;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("brand contrast (WCAG 2.1)", () => {
  it("self-check: black on white is 21:1, white on white 1:1", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBe(1);
  });

  // TD-50 (2026-10-14): the mockup palette replaces the store-matched green.
  it("the green is the redesign's --brand-700", () => {
    expect(brand.forest).toBe("#0B4A3E");
    expect(brand.action).toBe("#0B4A3E");
    expect(brand["700"]).toBe("#0B4A3E");
  });

  const text: [string, string, string][] = [
    ["white on the primary button", "#FFFFFF", brand.action!],
    ["white on the primary button hover", "#FFFFFF", brand["action-hover"]!],
    ["green links on the linen page", brand.forest!, brand.linen!],
    ["green links on white cards", brand.forest!, brand.paper!],
    ["green on the selected tint", brand.forest!, brand.mist!],
    ["ink on the selected tint", brand.ink!, brand.mist!],
    ["ink on linen", brand.ink!, brand.linen!],
    ["titles on linen", brand.title!, brand.linen!],
    ["muted on linen", brand.muted!, brand.linen!],
    ["muted on white", brand.muted!, brand.paper!],
    ["eyebrow green on white", brand.eyebrow!, brand.paper!],
    ["eyebrow green on linen", brand.eyebrow!, brand.linen!],
    ["error on white", brand.error!, brand.paper!],
    ["error on linen", brand.error!, brand.linen!],
    // TD-50 tokens.
    ["white on the dark hero", "#FFFFFF", brand["900"]!],
    ["brand green on the tint", brand["700"]!, brand["100"]!],
    ["brand green on the light tint", brand["700"]!, brand["50"]!],
    ["text on the tint", brand.text!, brand["100"]!],
    ["muted on the tint", brand["text-muted"]!, brand["100"]!],
    ["muted on the page", brand["text-muted"]!, brand.bg!],
    ["subtle on white", brand["text-subtle"]!, brand.surface!],
    ["subtle on the page", brand["text-subtle"]!, brand.bg!],
  ];
  const concern = (config.theme?.extend?.colors as Record<string, Record<string, Record<string, string>>>).concern!;
  for (const [name, c] of Object.entries(concern)) {
    text.push([`${name} ink on its soft well`, c.ink!, c.soft!], [`${name} ink on white`, c.ink!, brand.surface!]);
  }
  for (const [name, fg, bg] of text) {
    it(`text: ${name} is at least 4.5:1`, () => expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5));
  }

  const ui: [string, string, string][] = [
    ["focus ring on linen", brand.forest!, brand.linen!],
    ["focus ring on white", brand.forest!, brand.paper!],
    ["selected face area outline on the tint", brand.forest!, brand.mist!],
  ];
  for (const [name, fg, bg] of ui) {
    it(`UI part: ${name} is at least 3:1`, () => expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3));
  }
});

// TD-50 (c), owner 2026-10-14: the reading colours carry no good/bad signal.
// No green, no pure red, and every pair far apart for normal and colour-blind
// vision (Machado 2009 matrices, severity 1; CIE76 ΔE in Lab).
describe("reading identity colours", () => {
  const concern = (config.theme?.extend?.colors as Record<string, Record<string, Record<string, string>>>).concern!;
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const rgb = (h: string) => [1, 3, 5].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const lab = ([r, g, b]: number[]) => {
    const x = (0.4124 * r! + 0.3576 * g! + 0.1805 * b!) / 0.95047, y = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!, z = (0.0193 * r! + 0.1192 * g! + 0.9505 * b!) / 1.08883;
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  };
  const SIM: Record<string, number[][]> = {
    normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
    tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
  };
  const sim = (c: number[], m: number[][]) => m.map((r) => Math.min(1, Math.max(0, r[0]! * c[0]! + r[1]! * c[1]! + r[2]! * c[2]!)));
  const names = Object.keys(concern);

  it("five readings, each with a colour", () => expect(names.sort()).toEqual(["blemishes", "oiliness", "pigment", "redness", "texture"]));

  for (const n of names) {
    it(`${n}: the icon colour is at least 4.5:1 on its well and on white`, () => {
      expect(contrast(concern[n]!.DEFAULT!, concern[n]!.soft!)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(concern[n]!.DEFAULT!, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    });
    it(`${n}: not green and not a pure red`, () => {
      const [, a, b] = lab(rgb(concern[n]!.DEFAULT!));
      const hue = ((Math.atan2(b!, a!) * 180) / Math.PI + 360) % 360;
      expect(hue >= 95 && hue <= 205, `hue ${hue}`).toBe(false); // greens, incl. the brand green
      expect(hue >= 10 && hue <= 45, `hue ${hue}`).toBe(false); // pure reds
    });
  }

  for (const [vision, m] of Object.entries(SIM)) {
    it(`every pair is at least 20 ΔE apart (${vision})`, () => {
      for (let i = 0; i < names.length; i++)
        for (let j = i + 1; j < names.length; j++) {
          const [p, q] = [names[i]!, names[j]!].map((n) => lab(sim(rgb(concern[n]!.DEFAULT!), m)));
          expect(Math.hypot(p![0]! - q![0]!, p![1]! - q![1]!, p![2]! - q![2]!), `${names[i]} / ${names[j]}`).toBeGreaterThanOrEqual(20);
        }
    });
  }
});

