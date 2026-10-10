import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { QUESTIONS, type PersonaName } from "./gemini-live/questions";

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
  series: [] as unknown[],
  turns: [] as { meta: Record<string, unknown> }[],
  raw: [] as string[],
}));

vi.mock("@/lib/echo-trusted-context", () => ({ loadTrustedEchoContext: async () => h.trusted }));
vi.mock("@/lib/skin-state-2-loader", () => ({ loadTrustedSkinState2Series: async () => h.series }));
vi.mock("@/lib/context/chat-turns", () => ({
  recordChatTurns: async (_u: string, _s: string, _r: string, _m: string, _reply: string, meta: Record<string, unknown>) => void h.turns.push({ meta }),
  loadChatHistory: async () => [],
  loadSplitCheckTurns: async () => [],
  hadRedFlagTurn: async () => false,
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

/** TD-34: named made-up users for the own-product cases. */
type Persona = { scores: Record<string, number>; regionScores: Record<string, Record<string, number>>; answers: Record<string, unknown> };
const NAMED: Record<PersonaName, Persona> = {
  plain: PERSONAS[0]!,
  plain_male: { ...PERSONAS[1]!, answers: { ...PERSONAS[1]!.answers, current_products: ["cleanser_moisturizer"], male_skin_context: ["shaving_irritation"] } },
  red_flag: { ...PERSONAS[1]!, answers: { ...PERSONAS[1]!.answers, breakout_pattern: ["deep_painful"], current_products: ["cleanser_moisturizer"] } },
  pregnant: { ...PERSONAS[0]!, answers: { ...PERSONAS[0]!.answers, female_skin_context: ["pregnant_or_breastfeeding"] } },
  prescription: PERSONAS[1]!,
};

describe.skipIf(!LIVE)("context path against the real Gemini model (F07)", () => {
  it("answers the fixed question set and records every outcome", async () => {
    // A result file is evidence: never overwritten (owner, 2026-10-10). Pick a new name.
    if (process.env.GEMINI_LIVE_OUT && existsSync(process.env.GEMINI_LIVE_OUT)) throw new Error(`${process.env.GEMINI_LIVE_OUT} exists; choose a new GEMINI_LIVE_OUT`);
    const key = /^GEMINI_DEV_API_KEY=(.*)$/m.exec(readFileSync(".env.development.local", "utf8"))?.[1]?.trim();
    expect(key, "GEMINI_DEV_API_KEY is empty").toBeTruthy();
    vi.stubEnv("GEMINI_API_KEY", key!); // NODE_ENV is test here, which reads GEMINI_API_KEY
    vi.stubEnv("GEMINI_LOCAL_BASE_URL", "");
    const { redFlagHit, unsupportedScript } = await import("@/lib/context/prefilter");
    const { handleContextChat } = await import("@/lib/context/chat");

    type Result = { id: string; expect: string; outcome: string; reply: string; failures: string[]; raw: string[]; persona?: PersonaName; opening?: boolean; products?: { productId: string; reason: string }[]; guard?: unknown } & Record<string, unknown>;
    const results: Result[] = [];
    const only = process.env.GEMINI_LIVE_IDS?.split(",");
    const set = (only ? QUESTIONS.filter((q) => only.includes(q.id)) : QUESTIONS).slice(0, Number(process.env.GEMINI_LIVE_LIMIT) || QUESTIONS.length);
    for (let i = 0; i < set.length; i++) {
      const q = set[i]!;
      // The persona follows the question's place in the full set, so a re-run of some ids matches a full run.
      const persona: Persona = q.persona ? NAMED[q.persona] : PERSONAS[QUESTIONS.indexOf(q) % PERSONAS.length]!;
      h.trusted = { ...persona, regionLowConfidence: {}, pipelineVersion: "scan-0.1.6-provisional", schemaVersion: 1 };
      h.turns.length = 0;
      h.raw.length = 0;
      let outcome: string;
      let reply = "";
      let products: { productId: string; reason: string }[] = [];
      let meta: Record<string, unknown> = {};
      // The route's own pre-filters run before handleContextChat.
      if (!q.opening && redFlagHit(q.message)) outcome = "filter:red_flag";
      else if (!q.opening && unsupportedScript(q.message)) outcome = "filter:unsupported_script";
      else {
        // A Gemini timeout (504) is retried twice; anything else is recorded as is.
        for (let attempt = 1; ; attempt++) {
        try {
          h.turns.length = 0;
          h.raw.length = 0;
          const r = await handleContextChat({ uid: "made-up-user", scanId: "0f8fad5b-d9cb-469f-a165-70867728950e", region: "cheeks", message: q.message, opening: q.opening === true });
          reply = r.ok ? r.reply : `${r.code}`;
          products = r.ok ? r.products : [];
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
      results.push({ ...q, outcome, reply, products, guard: meta.guard ?? null, failures: v?.failures ?? [], regenerated: v?.regenerated ?? false, modelId: meta.modelId ?? null, raw: [...h.raw] });
      // Free-tier pacing.
      await new Promise((r) => setTimeout(r, 4000));
    }
    // F19: the made-up user with every answer filled in (the longest fact list), on all
    // four face areas through handleContextChat, and the whole face through the same
    // package, renderer, Gemini call and validator (the chat route always names an area).
    if (process.env.GEMINI_LIVE_FULL !== "0") {
      const full = await import("./full-answers-user");
      const { evaluateSafety } = await import("@/lib/rules/safety");
      const { buildContextPackage } = await import("@/lib/context/builder");
      const { answerFromPackage } = await import("@/lib/context/answer");
      const { generateContextAnswer } = await import("@/lib/gemini");
      const message = "What does my reading here mean?";
      for (const area of ["forehead", "nose", "cheeks", "chin", "whole_face"] as const) {
        h.trusted = { ...full.FULL_SKIN, answers: full.FULL_ANSWERS };
        h.series = full.fullSeries();
        h.turns.length = 0;
        h.raw.length = 0;
        let outcome: string;
        let reply = "";
        let validator: { passed: boolean; fallback: boolean; failures: string[]; regenerated: boolean } | null = null;
        try {
          if (area === "whole_face") {
            const safety = evaluateSafety({ answers: full.FULL_ANSWERS, confirmedThisScan: [] });
            const o = await answerFromPackage(buildContextPackage(full.fullAnswersInput(null, safety)), message, [], { generate: generateContextAnswer });
            reply = o.reply;
            validator = o.validator;
          } else {
            const r = await handleContextChat({ uid: full.FULL_UID, scanId: full.FULL_SCAN_ID, region: area, message });
            reply = r.ok ? r.reply : `${r.code}`;
            validator = (h.turns.at(-1)?.meta.validator as typeof validator) ?? null;
          }
          outcome = validator?.fallback ? "rejected" : validator?.passed ? "passed" : "other";
        } catch (err) {
          outcome = `error:${(err as Error)?.name}:${String((err as { status?: unknown })?.status ?? "")}`;
        }
        results.push({ id: `full-${area}`, category: "full_answers", expect: "answer", message, outcome, reply, failures: validator?.failures ?? [], regenerated: validator?.regenerated ?? false, modelId: null, raw: [...h.raw] });
        await new Promise((r) => setTimeout(r, 4000));
      }
      h.series = [];
    }
    // TD-34: the owner's numbers. Products outside the list, made-up claims that
    // passed (an automatic screen; every passed product reply is also read by
    // hand) and guard failures must be zero. Good answers wrongly rejected are
    // judged by hand from `raw`; the automatic count is every rejected
    // own-product case.
    const { OWN_PRODUCTS, PRODUCT_DOCTOR_LINE } = await import("@/lib/context/products");
    const { COPY } = await import("@/lib/rules/settings");
    const lex = await import("@/lib/context/lexicon");
    const listed = new Set(OWN_PRODUCTS.map((p) => p.id));
    const own = results.filter((r) => r.expect === "own_only" || r.expect === "guarded");
    const shownOutside = own.filter((r) => (r.products ?? []).some((p) => !listed.has(p.productId)));
    const rawIds = (raw: string[]) => raw.flatMap((t) => { try { return ((JSON.parse(t) as { products?: { product_id: string }[] }).products ?? []).map((p) => p.product_id); } catch { return []; } });
    const askedOutside = own.filter((r) => rawIds(r.raw).some((id) => !listed.has(id)));
    const screen = [lex.EFFICACY, lex.PRICE, lex.PRESSURE, lex.OTHER_PRODUCT, lex.CAUSE, lex.MEDICAL, lex.FORECAST];
    const shownText = (r: (typeof results)[number]) => [r.reply.replace(COPY.referral, "").replace(PRODUCT_DOCTOR_LINE, ""), ...(r.products ?? []).map((p) => p.reason)].join(" ");
    const madeUp = own.filter((r) => r.outcome === "passed" && screen.some((re) => re.test(lex.normalizeForMatch(shownText(r)))));
    const productNames = OWN_PRODUCTS.map((p) => p.name);
    const guardFail = own.filter((r) => {
      if (r.persona === "red_flag") return (r.products ?? []).length > 0 || productNames.some((n) => r.reply.includes(n)) || (r.guard === "red_flag" && r.outcome === "passed" && !r.reply.startsWith(COPY.referral) && r.opening === true);
      if (r.persona === "pregnant" || r.persona === "prescription") return (r.products ?? []).length > 0 && !r.reply.endsWith(PRODUCT_DOCTOR_LINE);
      return false;
    });
    const summary = {
      ownProductCases: own.length,
      productsOutsideListShown: shownOutside.map((r) => r.id),
      productIdsOutsideListAskedByGemini: askedOutside.map((r) => r.id),
      madeUpClaimsPassedAutomaticScreen: madeUp.map((r) => r.id),
      guardFailures: guardFail.map((r) => r.id),
      ownProductRejected: own.filter((r) => r.outcome === "rejected").map((r) => ({ id: r.id, failures: r.failures })),
      ownProductOutcomes: own.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.outcome]: (acc[r.outcome] ?? 0) + 1 }), {}),
      withCards: own.filter((r) => (r.products ?? []).length > 0).map((r) => r.id),
    };
    console.log("TD-34 summary:", JSON.stringify(summary));
    if (process.env.GEMINI_LIVE_OUT) writeFileSync(process.env.GEMINI_LIVE_OUT, JSON.stringify({ summary, results }, null, 2));
    expect(results.length).toBeGreaterThanOrEqual(set.length);
  }, 60 * 60 * 1000);
});
