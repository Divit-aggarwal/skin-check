import { describe, expect, it, vi } from "vitest";
import { answerFromPackage, comparisonAnswer, fallbackAnswer, fallbackLines } from "@/lib/context/answer";
import { buildContextPackage, packageFacts, UNCERTAINTY } from "@/lib/context/builder";
import { REFERRAL_COPY } from "@/lib/context/prefilter";
import { answer, fullInput } from "./context-fixtures";

// Reject, retry and fallback (docs/lanes/context-design.md §3.7): one test per row.

const pkg = buildContextPackage(fullInput());
const RED = pkg.skin!.readings.find((r) => r.id === "state.cheeks.redness")!;
const UNC = { claim_type: "uncertainty" as const, text: UNCERTAINTY.text, fact_ids: [UNCERTAINTY.id] };
const GOOD = answer({ claims: [{ claim_type: "descriptive", text: `Redness on the cheeks is ${RED.band}.`, fact_ids: [RED.id] }, UNC], needs_referral: false });
// clarify: free text with no citation, so only the word check named in each test fails.
const BAD = answer({ claims: [{ claim_type: "clarify", text: "This is caused by stress.", fact_ids: [] }], needs_referral: false });
const REFER = answer({ claims: [{ claim_type: "out_of_scope", text: "Please see a doctor.", fact_ids: [] }], needs_referral: true });

function fake(...texts: string[]) {
  const generate = vi.fn();
  for (const t of texts) generate.mockResolvedValueOnce({ text: t, modelId: "model-x" });
  return generate;
}
const run = (generate: ReturnType<typeof fake>, opts: { redFlag?: boolean; message?: string } = {}) =>
  answerFromPackage(pkg, opts.message ?? "tell me about my cheeks", [], { generate, redFlag: opts.redFlag ?? false });

describe("answer path", () => {
  it("first answer passes: rendered claims, one call", async () => {
    const g = fake(GOOD);
    const out = await run(g);
    expect(out.reply).toBe(`Redness on the cheeks is ${RED.band}. ${UNCERTAINTY.text}`);
    expect(out.validator).toEqual({ passed: true, failures: [], regenerated: false, fallback: false });
    expect(g).toHaveBeenCalledTimes(1);
  });

  it("first fails, safe: one retry naming the failed checks, never the terms", async () => {
    const g = fake(BAD, GOOD);
    const out = await run(g);
    expect(g).toHaveBeenCalledTimes(2);
    const note = g.mock.calls[1]![0] as string;
    expect(note).toContain("rejected by these checks: cause");
    expect(note).not.toContain("caused by stress");
    expect(out.validator).toEqual({ passed: true, failures: ["cause"], regenerated: true, fallback: false });
  });

  it("retry fails too: fallback, never a third call", async () => {
    const g = fake(BAD, BAD, GOOD);
    const out = await run(g);
    expect(g).toHaveBeenCalledTimes(2);
    expect(out.reply).toBe(fallbackAnswer(pkg));
    expect(out.validator).toMatchObject({ passed: false, regenerated: true, fallback: true });
  });

  it("needs_referral on either attempt: referral copy, no retry", async () => {
    const g1 = fake(REFER);
    expect(await run(g1)).toMatchObject({ reply: REFERRAL_COPY, referral: true });
    expect(g1).toHaveBeenCalledTimes(1);
    const g2 = fake(BAD, REFER);
    expect(await run(g2)).toMatchObject({ reply: REFERRAL_COPY, referral: true });
  });

  it("a red flag in the safety state: no retry", async () => {
    const g = fake(BAD, GOOD);
    const out = await run(g, { redFlag: true });
    expect(g).toHaveBeenCalledTimes(1);
    expect(out.validator.fallback).toBe(true);
  });

  it("a failure from the user's own premise: no retry", async () => {
    const premise = answer({ claims: [{ claim_type: "clarify", text: "Yes, it is better now.", fact_ids: [] }], needs_referral: false });
    const g = fake(premise, GOOD);
    const out = await run(g, { message: "is it better now?" });
    expect(g).toHaveBeenCalledTimes(1);
    expect(out.validator).toMatchObject({ fallback: true, failures: ["comparative_or_change"] });
  });

  it.each([
    ["non-Latin output", answer({ claims: [{ ...UNC, text: "आपकी त्वचा" }], needs_referral: false })],
    ["unparseable JSON", "{not json"],
    ["an empty answer", ""],
  ])("%s: straight to the fallback", async (_name, raw) => {
    const g = fake(raw, GOOD);
    const out = await run(g);
    expect(g).toHaveBeenCalledTimes(1);
    expect(out.reply).toBe(fallbackAnswer(pkg));
  });

  it("a transport error propagates (the route answers 502, as today)", async () => {
    const g = vi.fn().mockRejectedValue(new Error("down"));
    await expect(run(g)).rejects.toThrow("down");
  });

  it("the fallback and the comparison template use package text only", () => {
    const texts = new Set(packageFacts(pkg).map((f) => f.text));
    for (const line of fallbackAnswer(pkg).split("\n")) expect(texts.has(line), line).toBe(true);
    expect(comparisonAnswer(pkg).split("\n").slice(1)).toEqual(fallbackLines(pkg));
    const noSkin = buildContextPackage(fullInput({ skin: null }));
    expect(fallbackAnswer(noSkin)).toBe(UNCERTAINTY.text);
  });
});
