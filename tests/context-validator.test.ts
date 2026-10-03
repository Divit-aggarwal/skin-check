import { describe, expect, it } from "vitest";
import type { ForbiddenClaim } from "@/lib/contracts/context-package";
import { buildContextPackage, MISSING_TEXT, packageFacts, REASON_TEXT, UNCERTAINTY, UNCERTAINTY_BANDS } from "@/lib/context/builder";
import { validateAnswer, type GeminiAnswer } from "@/lib/context/validator";
import { CAUSE, CHANGE, CONFIDENCE, DIAGNOSIS, FORECAST, MEASUREMENT, MEDICAL, NUMBER, PAST_EVENT, PRODUCT } from "@/lib/context/lexicon";
import { SECTIONS } from "@/lib/skin-check-steps";
import { GEMINI_FIELD_INVENTORY } from "@/lib/gemini";
import { answer, fullInput, nee } from "./context-fixtures";

// F03 (docs/lanes/context-design.md §3.6). One passing and one failing answer per check.

const pkg = buildContextPackage(fullInput({ answers: { skin_type: "oily", male_skin_context: ["shaving_irritation"], pih_scar_tendency: "dark_mark_fades" } }));
const reading = (id: string) => pkg.skin!.readings.find((r) => r.id === id)!;
const RED = reading("state.all.redness");
const UNC = { claim_type: "uncertainty" as const, text: UNCERTAINTY.text, fact_ids: [UNCERTAINTY.id] };
const ok = (claims: GeminiAnswer["claims"]) => answer({ claims, needs_referral: false });
const checksOf = (raw: string, message = "tell me about my skin") => validateAnswer(raw, pkg, message).failures.map((f) => f.check);

const GOOD = ok([{ claim_type: "descriptive", text: `Your redness reads ${RED.band} for the whole face.`, fact_ids: [RED.id] }, UNC]);

describe("validator: each check has a passing and a failing answer", () => {
  it("a well-formed answer passes", () => {
    expect(validateAnswer(GOOD, pkg, "what is my redness?")).toMatchObject({ passed: true, failures: [] });
  });

  const cases: [ForbiddenClaim, GeminiAnswer["claims"], GeminiAnswer["claims"]][] = [
    ["unknown_fact_id", [UNC], [{ ...UNC, fact_ids: ["state.all.hydration"] }]],
    ["citation_rule", [{ claim_type: "smalltalk", text: "Happy to help.", fact_ids: [] }], [{ claim_type: "descriptive", text: "Your skin looks fine.", fact_ids: [] }]],
    // "one photo" passes only as a quote of the cited uncertainty fact.
    ["made_up_number", [UNC], [{ ...UNC, text: "Your redness is 42% of the scale." }]],
    ["comparative_or_change", [UNC], [{ ...UNC, text: "Your redness is lower than average." }]],
    ["non_latin_script", [UNC], [{ ...UNC, text: "आपकी त्वचा ठीक है" }]],
    ["medical_or_efficacy_term", [UNC], [{ ...UNC, text: "This can be treated easily." }]],
    ["diagnosis", [UNC], [{ ...UNC, text: "This looks like rosacea." }]],
    ["cause", [{ claim_type: "self_reported_echo", text: "You told us your patterns you notice: Shaving often causes bumps or irritation", fact_ids: ["self.all.male_skin_context"] }], [{ claim_type: "self_reported_echo", text: "Shaving causes your redness.", fact_ids: ["self.all.male_skin_context"] }]],
    ["forecast", [{ claim_type: "self_reported_echo", text: "You said: Leaves a dark mark that fades over time.", fact_ids: ["self.all.pih_scar_tendency"] }], [{ ...UNC, text: "Your redness will settle soon." }]],
    ["self_assigned_confidence", [UNC], [{ ...UNC, text: "I am confident this is accurate." }]],
    ["made_up_past_event", [UNC], [{ ...UNC, text: "Yesterday your skin was oilier." }]],
    ["product_claim", [{ claim_type: "comparability", text: "Gentle Cleanser: A mild face wash for daily use.", fact_ids: ["rec.gentle-cleanser"] }], [{ ...UNC, text: "Try a niacinamide serum." }]],
    ["band_mismatch", [{ claim_type: "descriptive", text: `Redness is ${RED.band}.`, fact_ids: [RED.id] }, UNC], [{ claim_type: "descriptive", text: "Redness is severe.", fact_ids: [RED.id] }, UNC]],
    ["contradicts_package", [UNC], [{ ...UNC, text: `Within one photo, texture is ${RED.band === "Elevated" ? "Low" : "Elevated"} and hydration is Low.` }]],
    ["missing_uncertainty", [{ claim_type: "descriptive", text: `Redness is ${RED.band}.`, fact_ids: [RED.id] }, UNC], [{ claim_type: "descriptive", text: `Redness is ${RED.band}.`, fact_ids: [RED.id] }]],
    ["self_report_as_measurement", [{ claim_type: "self_reported_echo", text: "You told us your skin type is oily.", fact_ids: ["self.all.skin_type"] }], [{ claim_type: "descriptive", text: "Your skin is oily.", fact_ids: ["self.all.skin_type"] }, UNC]],
  ];

  it("covers all 16 ForbiddenClaim checks", () => {
    expect(new Set(cases.map(([c]) => c)).size).toBe(16);
    expect(cases.map(([c]) => c).sort()).toEqual([...pkg.forbiddenClaims].sort());
  });

  it.each(cases)("%s", (check, pass, failing) => {
    expect(checksOf(ok(pass))).not.toContain(check);
    expect(checksOf(ok(failing))).toContain(check);
  });

  it("malformed JSON, an extra key, too many claims or a claim type outside the package all fail", () => {
    expect(checksOf("not json")).toEqual(["malformed_output"]);
    expect(checksOf(JSON.stringify({ claims: [UNC], needs_referral: false, extra: 1 }))).toEqual(["malformed_output"]);
    expect(checksOf(ok(Array(6).fill(UNC)))).toEqual(["malformed_output"]);
    expect(checksOf(ok([{ claim_type: "routine_as_directed", text: "Use it as directed.", fact_ids: ["missing.all.routine"] }]))).toContain("citation_rule");
  });

  it("'condition' is a medical term", () => {
    expect(checksOf(ok([{ ...UNC, text: "This skin condition is common." }]))).toContain("medical_or_efficacy_term");
  });

  it("contradicts_package reads 'whole face' as the whole-face reading, not the focus region", () => {
    const wholeRed = reading("state.all.redness").band;
    const cheekRed = reading("state.cheeks.redness").band;
    expect(wholeRed).not.toBe(cheekRed); // fixture control: the bands differ
    expect(checksOf(ok([{ ...UNC, text: `Redness for the whole face is ${cheekRed}.` }]))).toContain("contradicts_package");
    expect(checksOf(ok([{ ...UNC, text: `Redness for the whole face is ${wholeRed}.` }]))).not.toContain("contradicts_package");
  });

  it("a rec item may be named and its claim quoted, but a recommendation verb always fails (design §3.6)", () => {
    expect(checksOf(ok([{ claim_type: "comparability", text: "Gentle Cleanser: A mild face wash for daily use.", fact_ids: ["rec.gentle-cleanser"] }]))).not.toContain("product_claim");
    expect(checksOf(ok([{ claim_type: "comparability", text: "I recommend Gentle Cleanser.", fact_ids: ["rec.gentle-cleanser"] }]))).toContain("product_claim");
  });

  it("a paraphrase of a quotable label is not exempt", () => {
    expect(checksOf(ok([{ claim_type: "self_reported_echo", text: "You said shaving often causes irritation.", fact_ids: ["self.all.male_skin_context"] }]))).toContain("cause");
  });

  it("an uncited quote is not exempt", () => {
    expect(checksOf(ok([{ ...UNC, text: "Shaving often causes bumps or irritation." }]))).toContain("cause");
  });

  it("a measurement phrase on a self-reported claim fails, on a reading claim passes", () => {
    expect(checksOf(ok([{ claim_type: "self_reported_echo", text: "Your scan shows oily skin.", fact_ids: ["self.all.skin_type"] }]))).toContain("self_report_as_measurement");
    expect(checksOf(ok([{ claim_type: "descriptive", text: `Your scan shows ${RED.band} redness.`, fact_ids: [RED.id] }, UNC]))).not.toContain("self_report_as_measurement");
  });

  it("with extra caution on, an active ingredient fails even when a rec fact names it", () => {
    const cautious = buildContextPackage(fullInput({ answers: { current_products: ["prescription"] } }));
    const raw = ok([{ claim_type: "comparability", text: "Some people use retinol.", fact_ids: ["rec.gentle-cleanser"] }]);
    expect(validateAnswer(raw, cautious, "x").failures.map((f) => f.check)).toContain("product_claim");
  });
});

describe("the user-premise bypass (GEMINI_BOUNDARY §5)", () => {
  const MESSAGE = "last time redness was Elevated, now Moderate, am I better?";

  it("agreeing with the premise while citing a true fact still fails, and is marked as the user's premise", () => {
    const raw = ok([{ claim_type: "descriptive", text: `Yes, you are better: redness is ${RED.band} now.`, fact_ids: [RED.id] }, UNC]);
    const v = validateAnswer(raw, pkg, MESSAGE);
    expect(v.passed).toBe(false);
    expect(v.failures.map((f) => f.check)).toContain("comparative_or_change");
    expect(v.userPremise).toBe(true);
  });

  it("a failure the user did not prompt is not a premise failure", () => {
    const raw = ok([{ ...UNC, text: "This is caused by stress." }]);
    expect(validateAnswer(raw, pkg, "what is my redness?").userPremise).toBe(false);
  });
});

describe("our own text passes our own validator", () => {
  const allPkg = buildContextPackage(
    fullInput({
      longitudinal: (Object.keys(REASON_TEXT) as (keyof typeof REASON_TEXT)[]).map((code, i) => {
        const r = nee(i % 2 ? "colour.native.aStarMean" : "texture.lbpEntropy", (["forehead", "nose", "chin", "cheeks"] as const)[i % 4]!);
        return { ...r, reasons: [{ code, text: "x" }] } as typeof r;
      }),
    })
  );

  it("a verbatim echo of every option label of every sent step passes", () => {
    for (const step of SECTIONS.flatMap((s) => s.steps)) {
      if (GEMINI_FIELD_INVENTORY[step.id] !== "sent" || !("options" in step || "reflections" in step)) continue;
      const values = "options" in step ? step.options.map((o) => o.value) : Object.keys(step.reflections);
      for (const value of values) {
        const multi = step.type === "multi-select-cards" || step.type === "body-map";
        const p = buildContextPackage(fullInput({ answers: { [step.id]: multi ? [value] : value } }));
        const fact = p.selfReported?.find((s) => s.field === step.id);
        if (!fact) continue; // e.g. the extra-caution trigger answer is dropped
        const v = validateAnswer(ok([{ claim_type: "self_reported_echo", text: fact.text, fact_ids: [fact.id] }]), p, "x");
        expect(v.failures, `${step.id}=${value}: ${fact.text}`).toEqual([]);
      }
    }
  });

  it("a verbatim echo of every reading, longitudinal, uncertainty and missing fact passes", () => {
    for (const f of packageFacts(allPkg)) {
      if (f.kind === "self" || f.kind === "rec") continue;
      const claim = f.kind === "state" ? { claim_type: "descriptive" as const, text: f.text, fact_ids: [f.id, UNCERTAINTY.id] } : { claim_type: "uncertainty" as const, text: f.text, fact_ids: [f.id] };
      expect(validateAnswer(ok([claim]), allPkg, "x").failures, f.id).toEqual([]);
    }
  });

  it("our own fixed sentences contain no lexicon word at all, so a paraphrase is not punished", () => {
    const ours = [...Object.values(REASON_TEXT), ...Object.values(MISSING_TEXT), UNCERTAINTY.text, UNCERTAINTY_BANDS.text, ...packageFacts(allPkg).filter((f) => f.kind === "state" || f.kind === "long").map((f) => f.text)];
    for (const text of ours) {
      for (const re of [CHANGE, MEDICAL, DIAGNOSIS, CAUSE, FORECAST, CONFIDENCE, PAST_EVENT, PRODUCT, MEASUREMENT]) expect(re.test(text), `${re.source.slice(0, 30)}: ${text}`).toBe(false);
    }
    // "one photo" is a number word; it is only ever allowed as a quote.
    expect(NUMBER.test(UNCERTAINTY.text)).toBe(true);
  });
});
