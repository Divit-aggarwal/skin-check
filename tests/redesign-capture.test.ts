import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gateRows } from "@/components/skin-check/captureStates";
import { runCaptureGate } from "@/lib/capture-quality/gate";

// Redesign lane B (05, 07, 08; TD-50): the presentation rules that a test can pin.

const frame = (luma: number, size = 1200) => ({ width: size, height: size, data: new Uint8ClampedArray(size * size * 4).fill(luma) });

describe("07: the quality gate's result after capture", () => {
  it("shows only light, sharpness and size, never the unmeasured checks (C11)", () => {
    const rows = gateRows(runCaptureGate(frame(10), { captureMethod: "native", retakeCount: 0 }));
    expect(rows.map((r) => r.id)).toEqual(["exposure", "blur", "resolution"]);
    expect(rows.find((r) => r.id === "exposure")!.status).toBe("fail");
  });

  it("an unchecked photo (no frame) shows nothing", () => {
    expect(gateRows(runCaptureGate(null, { captureMethod: "native", retakeCount: 0 }))).toEqual([]);
    expect(gateRows(null)).toEqual([]);
  });
});

describe("08: the weekly check-in stays behind its flag and saves nothing (E19)", () => {
  const flow = readFileSync("components/skin-check/SkinCheckFlow.tsx", "utf8");
  const checkin = readFileSync("components/skin-check/WeeklyCheckin.tsx", "utf8");

  it("is opened and shown only when weeklyCheckinUi() is on", () => {
    expect(flow).toMatch(/if \(checkin && weeklyCheckinUi\(\)\)/);
    expect(flow).toMatch(/\{weeklyCheckinUi\(\) && \(\s*<button type="button" onClick=\{\(\) => setCheckin\(true\)\}/);
    expect(flow.match(/setCheckin\(true\)/g)).toHaveLength(1);
  });

  it("has no save path: no fetch, no Firestore, the save button disabled", () => {
    expect(checkin).not.toMatch(/fetch\(|@\/lib\/firebase|@\/lib\/api|localStorage|setDoc|addDoc/);
    expect(checkin).toMatch(/<button type="button" disabled aria-describedby="checkin-later"/);
  });
});

describe("bottom bar", () => {
  it("one place sets body[data-flow] in the check flow, and the results screen never does", () => {
    const flow = readFileSync("components/skin-check/SkinCheckFlow.tsx", "utf8");
    expect(flow.match(/dataset\.flow =/g)).toHaveLength(1);
    expect(flow).toMatch(/const overlay = complete \|\|/);
    for (const f of ["components/skin-check/inputs/PhotoCapture.tsx", "components/skin-check/WeeklyCheckin.tsx", "components/skin-check/CheckStart.tsx"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/dataset\.flow/);
    }
  });
});
