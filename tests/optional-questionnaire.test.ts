import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SECTIONS } from "@/lib/skin-check-steps";
import {
  hasQuestionAnswers,
  keptProductNames,
  PRODUCT_NAME_MAX,
  productNameLabel,
  productNamesFrom,
  questionAnswersOnly,
  questionMinutes,
  questionSteps,
  RECONFIRM_EACH_SCAN_IDS,
  reusableAnswers,
  reusableBasics,
  SECONDS_PER_QUESTION,
} from "@/lib/skin-check-validation";
import { nextEligibleIndex, prevEligibleIndex, PHOTO_INDEX } from "@/lib/useSkinCheckFlow";
import { questionsDone, questionsTarget, productNamesOf, type Doc } from "@/components/dashboard/state";
import { cameraView, CAPTURE_COPY } from "@/components/skin-check/captureStates";
import { QUESTIONS_COPY } from "@/components/skin-check/questionsCopy";
import { readInput } from "@/lib/rules/input";
import { evaluateSafety } from "@/lib/rules/safety";
import { summarizeSkinCheckAnswers } from "@/lib/skin-check-format";
import { GEMINI_FIELD_INVENTORY } from "@/lib/gemini";
import { buildScanAnalysisRecord } from "@/lib/scan-analysis-record";
import type { SkinScanResult } from "@/types/skin-scan";
import { syntheticAnalysis, syntheticNative } from "./synthetic-scan";

const idx = (id: string) => SECTIONS.findIndex((s) => s.id === id);
const BASICS = { name: "Tester", age: "25-34", gender: "female" };
const STEP = (id: string) => SECTIONS.flatMap((s) => s.steps).find((s) => s.id === id)!;

describe("TD-33 (1): how many questions, and how long", () => {
  it("counts the real eligible steps for the user's gender", () => {
    const optional = SECTIONS.filter((s) => ["your-skin", "personal-context", "diet-hydration", "sun-protection"].includes(s.id)).flatMap((s) => s.steps);
    const unconditional = optional.filter((s) => !s.condition).length;
    expect(questionSteps({ gender: "female" })).toHaveLength(unconditional + 1);
    expect(questionSteps({ gender: "male" })).toHaveLength(unconditional + 1);
    expect(questionSteps({ gender: "other" })).toHaveLength(unconditional);
    expect(questionSteps({ gender: "female" }).map((s) => s.id)).toContain("female_skin_context");
    expect(questionSteps({ gender: "female" }).map((s) => s.id)).not.toContain("male_skin_context");
    // Never the photo, the phone steps or About you.
    for (const id of ["name", "age", "gender", "phone_verify", "skin_photo", "final_phone"]) {
      expect(questionSteps({ gender: "female" }).map((s) => s.id)).not.toContain(id);
    }
  });

  it("minutes come from the count, rounded up, at least 1", () => {
    expect(questionMinutes(12)).toBe(Math.ceil((12 * SECONDS_PER_QUESTION) / 60));
    expect(questionMinutes(1)).toBe(1);
    expect(questionMinutes(0)).toBe(1);
  });

  it("the copy says the number it is given (no typed number)", () => {
    expect(QUESTIONS_COPY.howMany(12, 2)).toContain("12 questions");
    expect(QUESTIONS_COPY.howMany(11, 1)).toContain("about 1 minute.");
    expect(readFileSync("components/skin-check/QuestionsChoice.tsx", "utf8")).toContain("questionSteps(answers).length");
  });

  it("the copy is honest about Echo and keeps the way back in", () => {
    expect(QUESTIONS_COPY.skip.join(" ")).toMatch(/Echo cannot answer questions about this check until the questions are done/);
    expect(QUESTIONS_COPY.skip.join(" ")).toMatch(/photo check and your readings/);
    expect(QUESTIONS_COPY.skip.join(" ")).toMatch(/Home or Account/);
  });
});

describe("TD-33 (1): skipping", () => {
  it("name, age and gender alone are not answers; one optional question is", () => {
    expect(hasQuestionAnswers(BASICS)).toBe(false);
    expect(hasQuestionAnswers({ ...BASICS, phone_verify: "verified", skin_photo: "done", final_phone: "verified" })).toBe(false);
    expect(hasQuestionAnswers({ ...BASICS, skin_type: "oily" })).toBe(true);
    expect(hasQuestionAnswers(Object.create({ skin_type: "oily" }))).toBe(false); // own keys only
  });

  it("skip goes About you → Verify → Photo → Get your results", () => {
    expect(nextEligibleIndex(idx("verify"), BASICS, false, true)).toBe(idx("verify"));
    expect(nextEligibleIndex(PHOTO_INDEX + 1, BASICS, false, true)).toBe(idx("get-your-results"));
    expect(prevEligibleIndex(idx("get-your-results") - 1, BASICS, false, true)).toBe(PHOTO_INDEX);
    // Answering: the question sections come after the photo, as before.
    expect(nextEligibleIndex(PHOTO_INDEX + 1, BASICS, false, false)).toBe(idx("your-skin"));
  });

  it("a returning user who skipped reuses name, age and gender only (no re-confirm steps)", () => {
    expect(reusableAnswers(BASICS)).toBeNull();
    expect(reusableBasics({ ...BASICS, phone_verify: "verified", final_phone: "verified" })).toEqual(BASICS);
    expect(reusableBasics({ ...BASICS, age: "under-18" })).toBeNull();
    expect(reusableBasics({ name: "Tester", age: "25-34" })).toBeNull();
  });

  it("a returning user who answered is handled as today (reuse, with the re-confirm steps)", () => {
    const answered = Object.fromEntries(
      SECTIONS.flatMap((s) => s.steps)
        .filter((s) => "options" in s)
        .map((s) => [s.id, s.type === "multi-select-cards" || s.type === "body-map" ? [(s as { options: { value: string }[] }).options[0]!.value] : (s as { options: { value: string }[] }).options[0]!.value])
    );
    const all = { ...answered, name: "Tester", age: "25-34", gender: "female" };
    expect(reusableBasics(all)).toBeNull();
    const reuse = reusableAnswers(all)!;
    expect(reuse).not.toBeNull();
    for (const id of RECONFIRM_EACH_SCAN_IDS) expect(reuse).not.toHaveProperty(id);
  });

  it("an answer-later record holds only the optional questions", () => {
    expect(questionAnswersOnly({ ...BASICS, skin_type: "oily", final_phone: "verified", productNames: "x" })).toEqual({ skin_type: "oily" });
  });

  it("the safety check and the rules with no answers: fail closed, never 'no red flag'", () => {
    // Name, age and gender only (gender is a rule field): readInput runs and every other field is missing.
    const readings = readInput({ answers: BASICS, confirmedThisScan: [] });
    expect(readings.current_products.present).toBe(false);
    // The Echo loader passes {} for a skipped check; the safety check then throws (F11 path).
    expect(() => evaluateSafety({ answers: {}, confirmedThisScan: [] })).toThrow();
    expect(summarizeSkinCheckAnswers({}, (id) => GEMINI_FIELD_INVENTORY[id] === "sent")).toBe("No quiz answers provided.");
  });
});

describe("TD-33 (1): the check that 'Answer the questions' fills in", () => {
  const ts = (ms: number) => ({ toDate: () => new Date(ms), toMillis: () => ms });
  const SCAN_A = "0f8fad5b-d9cb-469f-a165-70867728950a";
  const SCAN_B = "0f8fad5b-d9cb-469f-a165-70867728950b";
  function analysis(scanId: string, at: number): Doc {
    const sha = scanId.slice(-1).repeat(16).padEnd(64, "0");
    const result = { ...syntheticAnalysis(), ...syntheticNative(), pipeline_version: "scan-0.1.6-provisional", engine_build: "sha-test" };
    const record = buildScanAnalysisRecord(result as unknown as SkinScanResult, { scanId, inputSha256: sha, requestId: `r-${scanId}`, captureMethod: "native" });
    return { id: `${scanId}_${sha.slice(0, 16)}`, data: { ...record, uid: "u", createdAt: ts(at) } };
  }
  const check = (id: string, at: number, extra: Record<string, unknown>): Doc => ({ id, data: { createdAt: ts(at), ...extra } });

  it("the newest skipped check, while nothing was answered later", () => {
    const checks = [check(SCAN_A, 1, { answers: BASICS, questionnaire: "skipped" })];
    expect(questionsTarget("u", checks, [], [])?.id).toBe(SCAN_A);
    expect(questionsTarget("u", checks, [], [{ id: SCAN_A, data: { answers: { skin_type: "oily" } } }])).toBeNull();
    expect(questionsDone(checks[0]!, [{ id: SCAN_A, data: { answers: { skin_type: "oily" } } }])).toBe(true);
  });

  it("an answered or older record (no questionnaire field) is never a target", () => {
    expect(questionsTarget("u", [check(SCAN_A, 1, { answers: { ...BASICS, skin_type: "oily" }, questionnaire: "answered" })], [], [])).toBeNull();
    expect(questionsTarget("u", [check(SCAN_A, 1, { answers: BASICS })], [], [])).toBeNull();
  });

  it("prefers the check Echo talks about over a newer check with no reading", () => {
    const checks = [check(SCAN_A, 1, { answers: BASICS, questionnaire: "skipped" }), check(SCAN_B, 2, { answers: BASICS, questionnaire: "skipped", status: "analysis_failed" })];
    const analyses = [analysis(SCAN_A, 1)];
    expect(questionsTarget("u", checks, analyses, [])?.id).toBe(SCAN_A);
    // With no reading at all, the newest check.
    expect(questionsTarget("u", checks, [], [])?.id).toBe(SCAN_B);
  });
});

describe("TD-33 (2): product names", () => {
  it("are kept only for picked options; unpicking or 'Nothing right now' clears them", () => {
    const names = { prescription: "Tretinoin", other: "A serum" };
    expect(keptProductNames(["prescription", "other_products"], names)).toEqual(names);
    expect(keptProductNames(["other_products"], names)).toEqual({ other: "A serum" });
    expect(keptProductNames(["none"], names)).toEqual({});
    expect(keptProductNames(undefined, names)).toEqual({});
  });

  it("are trimmed, never empty, and dropped (not cut) over the limit", () => {
    expect(keptProductNames(["prescription"], { prescription: "  x  " })).toEqual({ prescription: "x" });
    expect(keptProductNames(["prescription"], { prescription: "   " })).toEqual({});
    expect(keptProductNames(["prescription"], { prescription: "a".repeat(PRODUCT_NAME_MAX) })).toEqual({ prescription: "a".repeat(PRODUCT_NAME_MAX) });
    expect(keptProductNames(["prescription"], { prescription: "a".repeat(PRODUCT_NAME_MAX + 1) })).toEqual({});
    expect(PRODUCT_NAME_MAX).toBe(200);
  });

  it("only two boxes exist, on current_products, under 'A prescription product' and 'Other products'", () => {
    const boxes = SECTIONS.flatMap((s) => s.steps).filter((s) => "nameBoxes" in s && s.nameBoxes);
    expect(boxes.map((s) => s.id)).toEqual(["current_products"]);
    expect(Object.keys((STEP("current_products") as { nameBoxes: object }).nameBoxes).sort()).toEqual(["other_products", "prescription"]);
    expect(productNameLabel("prescription")).toBe("A prescription product");
    expect(productNameLabel("other")).toBe("Other products");
  });

  it("a stored value is read safely: only the two keys, only non-empty strings", () => {
    expect(productNamesFrom({ prescription: "x", other: 3, extra: "y" })).toEqual({ prescription: "x" });
    expect(productNamesFrom("x")).toEqual({});
    expect(productNamesOf({ id: "a", data: { productNames: { other: "z" } } }, [])).toEqual({ other: "z" });
    expect(productNamesOf({ id: "a", data: {} }, [{ id: "a", data: { productNames: { prescription: "p" } } }])).toEqual({ prescription: "p" });
  });

  it("the safety check reads the option, never the text", () => {
    const withText = evaluateSafety({ answers: { gender: "female", current_products: ["prescription"], productNames: { prescription: "x" } } as Record<string, unknown>, confirmedThisScan: [] });
    const withoutText = evaluateSafety({ answers: { gender: "female", current_products: ["prescription"] }, confirmedThisScan: [] });
    expect(withText).toEqual(withoutText);
    expect(withText.extraCaution).toBe(true);
    // A name that "sounds" like a caution answer, with the option not picked, raises nothing.
    const textOnly = evaluateSafety({ answers: { gender: "female", current_products: ["other_products"] }, confirmedThisScan: [] });
    expect(textOnly.extraCaution).toBe(false);
  });

  it("the flow keeps names out of answers, the draft and the session", () => {
    const flow = readFileSync("lib/useSkinCheckFlow.ts", "utf8");
    expect(flow).toMatch(/saveDraft\(\{ scanId, answers, sectionIndex, questionsChoice \}\)/);
    const draft = readFileSync("lib/skin-check-draft.ts", "utf8");
    expect(draft).not.toMatch(/productNames:/);
    const session = readFileSync("lib/skin-check-session-context.tsx", "utf8");
    expect(session).not.toMatch(/productNames/);
  });

  it("no source line logs the names", () => {
    const files = ["lib/useSkinCheckFlow.ts", "lib/firebase/skin-checks.ts", "components/skin-check/LaterQuestions.tsx", "components/skin-check/inputs/ProductNameBox.tsx", "components/skin-check/inputs/ImageCardMultiSelect.tsx", "components/skin-check/inputs/PhoneAuthStep.tsx", "components/checks/ChecksView.tsx", "lib/echo-trusted-context.ts"];
    for (const f of files) {
      for (const line of readFileSync(f, "utf8").split("\n").filter((l) => /console\.\w+\(/.test(l))) {
        expect(line, `${f}: ${line}`).not.toMatch(/productNames|names|text\b/i);
      }
    }
  });
});

describe("G16 (TD-33 (3)): camera states", () => {
  it("laptop: before → loading → ready, and each refusal", () => {
    expect(cameraView(false, "idle", false)).toBe("start");
    expect(cameraView(false, "requesting", false)).toBe("loading");
    expect(cameraView(false, "active", false)).toBe("ready");
    expect(cameraView(false, "denied", false)).toBe("refused");
    expect(cameraView(false, "unavailable", false)).toBe("unavailable");
    expect(cameraView(false, "error", false)).toBe("failed");
    expect(cameraView(false, "idle", true)).toBe("after");
  });

  it("phone: before until a photo comes back, then after", () => {
    expect(cameraView(true, "idle", false)).toBe("start");
    expect(cameraView(true, "idle", true)).toBe("after");
  });

  it("the line under the button says what happens, including the permission prompt", () => {
    expect(CAPTURE_COPY.nextLaptop).toMatch(/photo of your face/);
    expect(CAPTURE_COPY.nextLaptop).toMatch(/browser will ask to use the camera/);
    expect(CAPTURE_COPY.nextPhone).toMatch(/photo of your face/);
    expect(CAPTURE_COPY.nextPhone).toMatch(/asks to use the camera/);
    expect(CAPTURE_COPY.how.map((h) => h.device)).toEqual(["iPhone (Safari)", "Android (Chrome)", "Laptop"]);
  });

  it("the laptop asks for the camera only from the button, never when the step appears", () => {
    const src = readFileSync("components/skin-check/inputs/PhotoCapture.tsx", "utf8");
    const effects = src.split("useEffect(").slice(1).map((e) => e.slice(0, e.indexOf("}, [")));
    expect(effects.some((e) => e.includes("requestCamera("))).toBe(false);
    expect(src).toContain("else void requestCamera();");
  });

  it("the capture logic and the gate are unchanged", () => {
    const src = readFileSync("components/skin-check/inputs/PhotoCapture.tsx", "utf8");
    for (const kept of ["canAnalyze(flow)", "runCaptureGate(frame, { captureMethod, retakeCount: 0 })", 'dispatch({ type: "retake" })', "canOverride(flow)", "downscaleToJpeg(file, 1280, 0.92)", '"image/jpeg",\n      0.92']) {
      expect(src, kept).toContain(kept);
    }
  });
});
