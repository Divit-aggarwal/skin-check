// SkinState contract `skinstate-2` (A20, owner approval 2026-10-04): a pure,
// deterministic VIEW over the same server-written `users/{uid}/scanAnalyses/{id}`
// record as skinstate-1. Spec: docs/architecture/SKIN_STATE_CONTRACT_2.md.
//
// It reads the record through the frozen skinstate-1 reader and changes only:
// - engine.build: mapped from the record's `engine_build` (A10), null if absent;
// - clientAsserted: names the fields a browser can set (TD-05, D-26).
// skinstate-1 keeps working unchanged next to it (D-23). Never stored.

import { toSkinState, type LegacyReading, type SkinState } from "./skin-state";

export const SKIN_STATE_2_CONTRACT_VERSION = "skinstate-2";

/** Fields the browser sends. None is authoritative (D-26); each carries its bound. */
export const CLIENT_ASSERTED = Object.freeze({
  "input.captureMethod": "in the comparability key; a forged value can only merge the two capture paths (TD-05, O-1 A)",
  "provenance.persistAttempt": "provenance only; never in the comparability key",
  captureQuality: "stored on the record, not mapped; never feeds comparability (TD-06 Q-2)",
} as const);

export interface SkinState2 extends Omit<SkinState, "contractVersion" | "engine"> {
  contractVersion: "skinstate-2";
  /** build: the exact CV image tag the engine reported (A10). Never inferred. */
  engine: Omit<SkinState["engine"], "build"> & { build: string | null };
  clientAsserted: typeof CLIENT_ASSERTED;
}

export type SkinState2Result =
  | { kind: "skinstate"; state: SkinState2 }
  | LegacyReading
  | { kind: "invalid"; reasons: string[] };

/** Same arguments and trust rules as toSkinState. Legacy and invalid results pass through unchanged. */
export function toSkinState2(record: unknown, analysisRef: string, expectedUid: string): SkinState2Result {
  const v1 = toSkinState(record, analysisRef, expectedUid);
  if (v1.kind !== "skinstate") return v1;
  const raw = (record as Record<string, unknown>).engine_build;
  return {
    kind: "skinstate",
    state: {
      ...v1.state,
      contractVersion: SKIN_STATE_2_CONTRACT_VERSION,
      engine: { ...v1.state.engine, build: typeof raw === "string" && raw ? raw : null },
      clientAsserted: CLIENT_ASSERTED,
    },
  };
}
