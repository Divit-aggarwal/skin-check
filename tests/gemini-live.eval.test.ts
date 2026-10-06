import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { QUESTIONS } from "./gemini-live/questions";

// F07: the context path against the REAL Gemini model, over the fixed question
// set. Skipped unless GEMINI_LIVE_EVAL=1, so no normal test run calls Gemini:
//
//   GEMINI_LIVE_EVAL=1 GEMINI_LIVE_OUT=<file.json> npx vitest run tests/gemini-live.eval.test.ts
//   (GEMINI_LIVE_IDS=o03,p01 re-runs only those questions)
//
// It uses the development key (GEMINI_DEV_API_KEY in .env.development.local,
// never printed) and made-up users only. Firestore is replaced by in-memory
// stand-ins; everything else is the production code: the route's pre-filters,
// handleContextChat, the package builder, the safety check, the renderer, the
// real Gemini call and the validator. Each answer's raw Gemini output is
// recorded so a rejection can be judged.
const LIVE = process.env.GEMINI_LIVE_EVAL === "1";

const h = vi.hoisted(() => ({
  trusted: null as unknown,
  turns: [] as { meta: Record<string, unknown> }[],
  raw: [] as string[],
}));

vi.mock("@/lib/echo-trusted-context", () => ({ loadTrustedEchoContext: async () => h.trusted }));
vi.mock("@/lib/skin-state-2-loader", () => ({ loadTrustedSkinState2Series: async () => [] }));
vi.mock("@/lib/context/chat-turns", () => ({
  recordChatTurns: async (_u: string, _s: string, _r: string, _m: string, _reply: string, meta: Record<string, unknown>) => void h.turns.push({ meta }),
  loadChatHistory: async () => [],
  loadSplitCheckTurns: async () => [],
}));
vi.mock("@/lib/gemini", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gemini")>("@/lib/gemini");
  return {
    ...actual,
    generateContextAnswer: async (...args: Parameters<typeof actual.generateContextAnswer>) => {
      const out = await actual.generateContextAnswer(...args);
      h.raw.push(out.text);
      return out;
    },
  };
});

/** Two made-up users. Scores are synthetic; no name, phone or real answer. */
const PERSONAS = [
  {
    scores: { redness: 0.72, oiliness: 0.58, texture: 0.31, pores: 0.44, blemishes: 0.61, hydration: 0.5, pigment: 0.36 },
    regionScores: { cheeks: { redness: 0.81, oiliness: 0.42, texture: 0.35, pores: 0.4, blemishes: 0.66, hydration: 0.5, pigment: 0.3 } },
    answers: { gender: "female", skin_type: "oily", primary_concerns: ["redness", "oiliness"], breakout_pattern: ["small_bumps"], pih_scar_tendency: "fades_no_trace", current_products: ["cleanser_moisturizer"], female_skin_context: ["none_not_sure"] },
  },
  {
    scores: { redness: 0.28, oiliness: 0.22, texture: 0.55, pores: 0.37, blemishes: 0.2, hydration: 0.5, pigment: 0.64 },
    regionScores: { cheeks: { redness: 0.3, oiliness: 0.2, texture: 0.6, pores: 0.35, blemishes: 0.18, hydration: 0.5, pigment: 0.7 } },
    answers: { gender: "male", skin_type: "dry", primary_concerns: ["pigment", "texture"], breakout_pattern: ["small_bumps"], pih_scar_tendency: "dark_mark_fades", current_products: ["prescription"] },
  },
];

describe.skipIf(!LIVE)("context path against the real Gemini model (F07)", () => {
  it("answers the fixed question set and records every outcome", async () => {
    const key = /^GEMINI_DEV_API_KEY=(.*)$/m.exec(readFileSync(".env.development.local", "utf8"))?.[1]?.trim();
    expect(key, "GEMINI_DEV_API_KEY is empty").toBeTruthy();
    vi.stubEnv("GEMINI_API_KEY", key!); // NODE_ENV is test here, which reads GEMINI_API_KEY
    vi.stubEnv("GEMINI_LOCAL_BASE_URL", "");
    const { redFlagHit, unsupportedScript } = await import("@/lib/context/prefilter");
    const { handleContextChat } = await import("@/lib/context/chat");

    const results = [];
    const only = process.env.GEMINI_LIVE_IDS?.split(",");
    const set = (only ? QUESTIONS.filter((q) => only.includes(q.id)) : QUESTIONS).slice(0, Number(process.env.GEMINI_LIVE_LIMIT) || QUESTIONS.length);
    for (let i = 0; i < set.length; i++) {
      const q = set[i]!;
      // The persona follows the question's place in the full set, so a re-run of some ids matches a full run.
      const persona = PERSONAS[QUESTIONS.indexOf(q) % PERSONAS.length]!;
      h.trusted = { ...persona, regionLowConfidence: {}, pipelineVersion: "scan-0.1.6-provisional", schemaVersion: 1 };
      h.turns.length = 0;
      h.raw.length = 0;
      let outcome: string;
      let reply = "";
      let meta: Record<string, unknown> = {};
      // The route's own pre-filters run before handleContextChat.
      if (redFlagHit(q.message)) outcome = "filter:red_flag";
      else if (unsupportedScript(q.message)) outcome = "filter:unsupported_script";
      else {
        // A Gemini timeout (504) is retried twice; anything else is recorded as is.
        for (let attempt = 1; ; attempt++) {
        try {
          h.turns.length = 0;
          h.raw.length = 0;
          const r = await handleContextChat({ uid: "made-up-user", scanId: "0f8fad5b-d9cb-469f-a165-70867728950e", region: "cheeks", message: q.message });
          reply = r.ok ? r.reply : `${r.code}`;
          meta = h.turns.at(-1)?.meta ?? {};
          const v = meta.validator as { passed: boolean; fallback: boolean; failures: string[] } | null;
          outcome = meta.prefilter
            ? `filter:${String(meta.prefilter)}`
            : meta.redFlag
              ? "referral:model_or_validator"
              : v?.fallback
                ? "rejected"
                : v?.passed
                  ? "passed"
                  : "other";
          break;
        } catch (err) {
          outcome = `error:${(err as Error)?.name}:${String((err as { status?: unknown })?.status ?? "")}`;
          if (attempt >= 3 || (err as { status?: unknown })?.status !== 504) break;
          await new Promise((r) => setTimeout(r, 20_000));
        }
        }
      }
      const v = meta.validator as { failures?: string[]; regenerated?: boolean } | null | undefined;
      results.push({ ...q, outcome, reply, failures: v?.failures ?? [], regenerated: v?.regenerated ?? false, modelId: meta.modelId ?? null, raw: [...h.raw] });
      // Free-tier pacing.
      await new Promise((r) => setTimeout(r, 4000));
    }
    if (process.env.GEMINI_LIVE_OUT) writeFileSync(process.env.GEMINI_LIVE_OUT, JSON.stringify(results, null, 2));
    expect(results).toHaveLength(set.length);
  }, 60 * 60 * 1000);
});
