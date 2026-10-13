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
