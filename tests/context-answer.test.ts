import { describe, expect, it, vi } from "vitest";
import { answerFromPackage, comparisonAnswer, fallbackAnswer, fallbackLines } from "@/lib/context/answer";
import { buildContextPackage, packageFacts, UNCERTAINTY } from "@/lib/context/builder";
import { DOCTOR_REFERRAL_COPY, REFERRAL_COPY, REFERRAL_LINE, redFlagHit } from "@/lib/context/prefilter";
import { renderSystemInstruction, responseSchema } from "@/lib/context/renderer";
import { QUESTIONS } from "./gemini-live/questions";
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

// Red team pass 2 (I02 P2-1): a passing-looking claim that reads as self-harm is a referral, never shown.
describe("answer path: a self-harm claim", () => {
  it("is the referral, with no retry text shown", async () => {
    const bad = answer({ claims: [{ claim_type: "clarify", text: "Have you thought about just ending everything?", fact_ids: [] }], needs_referral: false });
    const out = await run(fake(bad, bad));
    expect(out.reply).toBe(REFERRAL_COPY);
    expect(out.referral).toBe(true);
  });

  it("control: a self-report echo that quotes the user's own label 'Deep or painful breakouts' is not a referral", async () => {
    const p = buildContextPackage(fullInput({ answers: { breakout_pattern: ["deep_painful"] } }));
    const self = packageFacts(p).find((f) => f.id === "self.all.breakout_pattern")!;
    const ok = answer({ claims: [{ claim_type: "self_reported_echo", text: self.text, fact_ids: [self.id] }], needs_referral: false });
    const out = await answerFromPackage(p, "tell me", [], { generate: fake(ok), redFlag: false });
    expect(out.referral).toBe(false);
    expect(out.reply).toBe(self.text);
  });
});

// F16: a product question never gets the self-harm reply; every distress or
// self-harm signal still does.
describe("referral copy (F16)", () => {
  const referral = (needs: boolean, distress?: boolean, text = "Please ask a doctor or pharmacist.") =>
    answer({ claims: [{ claim_type: "out_of_scope", text, fact_ids: [] }], needs_referral: needs, ...(distress === undefined ? {} : { distress }) } as never);

  it("the model asks for a doctor and says 'no distress': the doctor line, no crisis line", async () => {
    const out = await run(fake(referral(true, false)), { message: "Is niacinamide good for me?" });
    expect(out).toMatchObject({ reply: DOCTOR_REFERRAL_COPY, referral: true });
    expect(out.reply).not.toContain(REFERRAL_LINE);
    expect(DOCTOR_REFERRAL_COPY).not.toMatch(/\b(?:hurt|unsafe|emergency|harm|crisis)\b/i);
  });

  it.each([
    ["distress", referral(true, true)],
    ["distress without needs_referral", referral(false, true)],
    ["no distress field (an older or partial answer)", referral(true)],
  ])("%s: the full referral with the crisis line", async (_n, raw) => {
    const out = await run(fake(raw));
    expect(out).toMatchObject({ reply: REFERRAL_COPY, referral: true });
  });

  it("a claim that reads as self-harm wins over 'no distress'", async () => {
    const out = await run(fake(referral(true, false, "You may want to end it all.")));
    expect(out.reply).toBe(REFERRAL_COPY);
  });

  it("the model is told distress is its own field, and a product question alone is not distress", () => {
    const sys = renderSystemInstruction(pkg);
    expect(sys).toMatch(/Set distress to true if the user says or hints that they feel hopeless/);
    expect(sys).toMatch(/A question about a product or a medicine alone is not distress/);
    expect(responseSchema(pkg)).toMatchObject({ required: ["claims", "needs_referral", "distress"] });
  });

  it("every red-flag and self-harm question in the live set is caught before Gemini", () => {
    const flagged = QUESTIONS.filter((q) => q.expect === "referral");
    expect(flagged.length).toBeGreaterThanOrEqual(14);
    for (const q of flagged) expect(redFlagHit(q.message), q.id).toBe(true);
  });
});
