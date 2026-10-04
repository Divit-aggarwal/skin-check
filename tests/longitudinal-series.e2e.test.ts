// Longitudinal lane end to end: reads scripts/seed-lane-longitudinal.ts back
// from the Firestore emulator. Every record maps under skinstate-1 and
// skinstate-2 (same stored record, D-23); skinstate-2 carries the build; and
// with the production tables every quantity in every region answers
// "not enough evidence". Skipped unless scripts/local-stack.sh started the stack.
import { describe, expect, it } from "vitest";
import { SKINSTATE_FIELD_PATHS } from "@/lib/comparability";
import type { QuantityPath } from "@/lib/contracts/longitudinal-result";

const WEB = process.env.LOCAL_STACK_WEB;
const PROJECT = process.env.FIREBASE_PROJECT_ID;
const UID = "seed-user-longitudinal";

describe.skipIf(!WEB)("longitudinal lane end to end", () => {
  it("both contract versions read the seeded series; the engine says not enough evidence everywhere", async () => {
    const { initializeApp } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    const { toSkinState } = await import("@/lib/skin-state");
    const { toSkinState2 } = await import("@/lib/skin-state-2");
    const { longitudinalResult } = await import("@/lib/longitudinal/engine");

    const db = getFirestore(initializeApp({ projectId: PROJECT! }, `longitudinal-e2e-${Date.now()}`));
    const snap = await db.collection("users").doc(UID).collection("scanAnalyses").get();
    expect(snap.size).toBe(6);

    const series = snap.docs.map((d) => {
      const ref = `users/${UID}/scanAnalyses/${d.id}`;
      const one = toSkinState(d.data(), ref, UID);
      const two = toSkinState2(d.data(), ref, UID);
      expect(one.kind).toBe("skinstate");
      expect(two.kind).toBe("skinstate");
      if (one.kind === "skinstate" && two.kind === "skinstate") {
        expect(one.state.engine.build).toBeNull();
        expect(two.state.regions).toEqual(one.state.regions);
      }
      return two;
    });
    const builds = series.map((s) => (s.kind === "skinstate" ? s.state.engine.build : "x"));
    expect(builds.filter((b) => b === null)).toHaveLength(1); // the 0.1.5 record
    expect(new Set(builds.filter(Boolean)).size).toBe(2);

    for (const region of ["forehead", "nose", "chin", "cheeks"] as const) {
      for (const q of SKINSTATE_FIELD_PATHS as readonly QuantityPath[]) {
        const r = longitudinalResult(series, q, region);
        expect(r.evidence).toBe("not_enough_evidence");
        expect(r.reasons.map((x) => x.code)).toEqual(expect.arrayContaining(["noise_table_empty", "engine_boundary", "not_comparable"]));
      }
    }
  });
});
