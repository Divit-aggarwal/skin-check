import { describe, expect, it } from "vitest";
import { pickStarters, STARTER_POOL } from "@/components/skin-check/echoStarters";
import { comparisonHit, redFlagHit, unsupportedScript } from "@/lib/context/prefilter";
import { productGuard } from "@/lib/context/answer";
import { evaluateSafety } from "@/lib/rules/safety";

const ALL = Object.values(STARTER_POOL).flat();
// A user with every safety question answered and nothing that raises a flag or extra caution.
const CLEAR = evaluateSafety({ answers: { primary_concerns: ["blemishes"], breakout_pattern: ["small_bumps"], pih_scar_tendency: "fades_no_trace", current_products: ["none"] }, confirmedThisScan: [] });

describe("starter pool: no filter of Echo's stops a starter question", () => {
  it.each(ALL)("%s", (q) => {
    expect(comparisonHit(q)).toBe(false);
    expect(redFlagHit(q)).toBe(false);
    expect(unsupportedScript(q)).toBe(false);
    expect(productGuard(CLEAR, q)).toBeNull();
  });
});

describe("pickStarters", () => {
  const seq = (...xs: number[]) => () => xs.shift() ?? 0;

  it("one from each group, four with products on, three with them off", () => {
    const on = pickStarters({ productsOn: true, asked: [], random: seq(0, 0, 0, 0) });
    expect(on).toEqual([STARTER_POOL.results[0], STARTER_POOL.products[0], STARTER_POOL.app[0], STARTER_POOL.hinglish[0]]);
    const off = pickStarters({ productsOn: false, asked: [] });
    expect(off).toHaveLength(3);
    for (const q of off) expect(STARTER_POOL.products).not.toContain(q);
  });

  it("never shows a question already asked in this chat", () => {
    const asked = [...STARTER_POOL.app, STARTER_POOL.hinglish[0]!.toUpperCase()];
    for (let i = 0; i < 20; i++) {
      const picked = pickStarters({ productsOn: true, asked });
      expect(picked.length).toBeGreaterThanOrEqual(3);
      for (const q of picked) expect(STARTER_POOL.app.concat(STARTER_POOL.hinglish[0]!)).not.toContain(q);
    }
  });

  it("the set changes between picks", () => {
    const sets = new Set(Array.from({ length: 20 }, () => pickStarters({ productsOn: true, asked: [] }).join("|")));
    expect(sets.size).toBeGreaterThan(1);
  });

  it("shows nothing once every question was asked", () => {
    expect(pickStarters({ productsOn: true, asked: ALL })).toEqual([]);
  });
});
