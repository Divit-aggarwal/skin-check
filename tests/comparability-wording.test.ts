import { describe, expect, it } from "vitest";
import { compareKeys, NOT_COMPARABLE_REASONS, type ComparabilityKey, type ComparabilityVerdict } from "@/lib/comparability";
import * as comparability from "@/lib/comparability";

// D-12, D-13: no change, no %, no causal or comparative wording, in any output.
const BANNED_WORDS = /\b(improve\w*|worse|better|reduc\w*|increas\w*|decreas\w*|because|caused|due to|effect\w*|works)\b/i;
const CHANGE_WORDS = "(up|down|more|less|higher|lower|change\\w*|delta|drop\\w*|rise|rose|gain\\w*|loss)";
const DIGIT_NEXT_TO_CHANGE = new RegExp(`\\d\\s*${CHANGE_WORDS}\\b|\\b${CHANGE_WORDS}\\s*[+-]?\\d`, "i");

const A: ComparabilityKey = {
  contractVersion: "skinstate-1", fieldPath: "colour.native.lStarMean", region: "cheek_image_left",
  pipelineVersion: "scan-0.1.6-provisional", engineBuild: "sha-a", colourPath: "native", statsPath: "both",
  inputVariant: "cv_downscale_1280", captureMethod: "native", captureMethodAssertedBy: "client", regionStatus: "available", lowPixelCount: false,
};

// Every combination of the key parts that drive a reason, against both tables.
function allVerdicts(): ComparabilityVerdict[] {
  const out: ComparabilityVerdict[] = [];
  const table = [{ fieldPath: A.fieldPath, region: A.region, pipelineVersion: "scan-0.1.6-provisional", calibrationId: null }];
  for (const engineBuild of [null, "sha-a", "sha-b"])
    for (const pipelineVersion of [null, "scan-0.1.6-provisional", "scan-0.1.5-provisional"])
      for (const captureMethod of [null, "native", "canvas"] as const)
        for (const statsPath of ["both", "corrected"] as const)
          for (const regionStatus of ["available", "absent_region"] as const)
            for (const lowPixelCount of [false, true])
              for (const t of [[], table]) {
                out.push(compareKeys(A, { ...A, engineBuild, pipelineVersion, captureMethod, statsPath, regionStatus, lowPixelCount }, t));
              }
  return out;
}

function numbersIn(v: unknown): number[] {
  if (typeof v === "number") return [v];
  if (v && typeof v === "object") return Object.values(v).flatMap(numbersIn);
  return [];
}

describe("comparability wording", () => {
  const verdicts = allVerdicts();

  it("covers both verdicts and every key-driven reason", () => {
    const seen = new Set(verdicts.flatMap((v) => (v.verdict === "not_comparable" ? v.reasons : [v.verdict])));
    expect(seen.has("comparable")).toBe(true);
    for (const r of NOT_COMPARABLE_REASONS.filter((r) => !["field_not_defined", "contract_version_differs", "different_user", "input_variant_unknown", "input_variant_differs"].includes(r))) {
      expect(seen.has(r), r).toBe(true);
    }
  });

  it("no serialised verdict contains %, a digit next to a change word, or a banned word", () => {
    for (const v of verdicts) {
      const text = JSON.stringify(v);
      expect(text).not.toContain("%");
      expect(text).not.toMatch(DIGIT_NEXT_TO_CHANGE);
      expect(text).not.toMatch(BANNED_WORDS);
    }
    for (const r of NOT_COMPARABLE_REASONS) expect(r.replace(/_/g, " ")).not.toMatch(BANNED_WORDS);
  });

  it("no verdict carries a number, so nothing derived from two scans is returned", () => {
    for (const v of verdicts) expect(numbersIn(v)).toEqual([]);
  });

  it("exports only the documented functions, none returning a number", () => {
    const fns = Object.entries(comparability).filter(([, v]) => typeof v === "function").map(([k]) => k).sort();
    expect(fns).toEqual(["comparabilityKey", "compareKeys", "compareStates"]);
  });
});
