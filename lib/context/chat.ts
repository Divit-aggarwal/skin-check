import { generateContextAnswer } from "@/lib/gemini";
import { loadTrustedEchoContext } from "@/lib/echo-trusted-context";
import type { EchoRegion } from "@/lib/echo-regions";
import { SKINSTATE_FIELD_PATHS } from "@/lib/comparability";
import type { LongitudinalResult } from "@/lib/contracts/longitudinal-result";
import type { SafetyState } from "@/lib/contracts/safety-state";
import { longitudinalResult } from "@/lib/longitudinal/engine";
import { evaluateSafety } from "@/lib/rules/safety";
import type { SkinStateRegionKey } from "@/lib/skin-state";
import { loadTrustedSkinState2Series } from "@/lib/skin-state-2-loader";
import type { SkinState2Result } from "@/lib/skin-state-2";
import { answerFromPackage, comparisonAnswer, fallbackAnswer, FINISH_QUESTIONNAIRE_COPY, guardedReply, productGuard, type ShownProduct } from "./answer";
import { echoProductsOn, listedProduct, OPENING_MESSAGE, OWN_PRODUCTS_VERSION } from "./products";
import { RULE_INPUT_FIELDS } from "@/lib/rules/settings";
import { buildContextPackage, packageSha256 } from "./builder";
import { hadRedFlagTurn, loadChatHistory, loadSplitCheckTurns, recordChatTurns, type EchoTurnRecord, type StoredOpening } from "./chat-turns";
import { comparisonHit, joinedUserTurns, redFlagHit, referralCopyFor, UNSUPPORTED_SCRIPT_COPY } from "./prefilter";
import { promptVersionFor } from "./renderer";

// The chat route's context-package branch (docs/lanes/context-design.md §3.2).
// Runs only after auth, the history token, the 18+ and AI-share gates and the
// quota, and only while contextChatEnabled(). Throws on a Gemini or Firestore
// failure; the route turns that into its existing 502.

/** `products`: checked own-product suggestions after the guards (TD-34); the app draws their cards. */
export type ContextChatResult = { ok: true; reply: string; products: ShownProduct[] } | { ok: false; status: number; code: string; error: string };

const onlyListed = (products: ShownProduct[]) => products.filter((p) => listedProduct(p.productId));

const NO_CALL = { promptVersion: null, modelId: null, validator: null } as const;

// A pre-filter answer is returned even if the record fails: a self-harm
// message must never get "Couldn't reach Echo". Name and code only in the log.
async function recordBestEffort(...args: Parameters<typeof recordChatTurns>): Promise<void> {
  try {
    await recordChatTurns(...args);
  } catch (err) {
    console.error("context chat: pre-filter turn not recorded:", (err as Error)?.name ?? "unknown", (err as { code?: unknown })?.code ?? "");
  }
}

/** Every skinstate region key (DEFINED_REGIONS is private to the frozen lib/skin-state.ts). */
const REGIONS = ["forehead", "nose", "chin", "cheeks", "cheek_image_left", "cheek_image_right"] as const satisfies readonly SkinStateRegionKey[];
// Compile-time check that REGIONS names every key: a new key fails the build here.
const ALL_REGIONS: Exclude<SkinStateRegionKey, (typeof REGIONS)[number]> extends never ? true : never = true;
void ALL_REGIONS;

/**
 * The series up to the scan being discussed, so "latest" is that scan. Legacy
 * and invalid entries stay in (the engine names them). If the scan has no
 * skinstate-2 state, the whole series is used: with the production tables the
 * answer is "not enough evidence" either way.
 */
export function seriesUpTo(series: readonly SkinState2Result[], scanId: string): SkinState2Result[] {
  const times = series.flatMap((e) => (e.kind === "skinstate" && e.state.identity.scanId === scanId ? [e.state.provenance.analyzedAt] : []));
  if (times.length === 0) return [...series];
  const upTo = times.sort().at(-1)!;
  return series.filter((e) => e.kind !== "skinstate" || e.state.provenance.analyzedAt <= upTo);
}

/**
 * D02/D03 answers for every quantity in every region, from the trusted
 * skinstate-2 series. Production tables only (three arguments; guarded by
 * tests/longitudinal-guard.test.ts), so every answer is "not enough evidence"
 * until C07. A read or engine failure leaves the section out, and the
 * package's `missing` says so; it never invents a trend.
 */
async function longitudinalFor(uid: string, scanId: string): Promise<LongitudinalResult[] | undefined> {
  try {
    const series = seriesUpTo(await loadTrustedSkinState2Series(uid), scanId);
    return SKINSTATE_FIELD_PATHS.flatMap((quantity) => REGIONS.map((region) => longitudinalResult(series, quantity, region)));
  } catch (err) {
    console.error("context chat: longitudinal section left out:", (err as Error)?.name ?? "unknown");
    return undefined;
  }
}

/** A message caught before anything else ran (red flag, or an unsupported script): record it (best effort) as a pre-filter turn. */
export async function recordReferral(uid: string, scanId: string, region: EchoRegion, message: string, kind: "red_flag" | "unsupported_script" = "red_flag"): Promise<void> {
  const reply = kind === "red_flag" ? referralCopyFor(message) : UNSUPPORTED_SCRIPT_COPY;
  await recordBestEffort(uid, scanId, region, message, reply, { ...NO_CALL, packageVersion: null, packageSha256: null, prefilter: kind, redFlag: kind === "red_flag", latencyMs: 0 });
}

export async function handleContextChat(input: { uid: string; scanId: string; region: EchoRegion; message: string; opening?: boolean }): Promise<ContextChatResult> {
  const { uid, scanId, region } = input;
  // TD-34: the opening is a fixed request about the whole face, outside any thread.
  const opening = input.opening === true;
  const message = opening ? OPENING_MESSAGE : input.message;
  const ownProducts = echoProductsOn();
  const started = Date.now();
  const meta = (m: Omit<EchoTurnRecord, "latencyMs">): EchoTurnRecord => ({ ...m, latencyMs: Date.now() - started });

  // §6: before anything is loaded or built, and never to Gemini.
  if (redFlagHit(message)) {
    const reply = referralCopyFor(message);
    await recordBestEffort(uid, scanId, region, message, reply, meta({ ...NO_CALL, packageVersion: null, packageSha256: null, prefilter: "red_flag", redFlag: true }));
    return { ok: true, reply, products: [] };
  }

  // A message split over turns ("i want to" then "die") is checked joined with
  // the last stored user turns, still before anything is built (security
  // review, wave 2). Stored turns hold no pre-filter or referral turns.
  const history = opening ? [] : await loadChatHistory(uid, scanId, region);
  // Every stored user turn, including ones whose answer fell back (red team pass 2, I02 P2-3).
  // TD-34: not for the opening, whose text is fixed and outside any thread.
  const joined = opening ? message : joinedUserTurns(await loadSplitCheckTurns(uid, scanId, region), message);
  if (redFlagHit(joined)) {
    const reply = referralCopyFor(joined);
    await recordBestEffort(uid, scanId, region, message, reply, meta({ ...NO_CALL, packageVersion: null, packageSha256: null, prefilter: "red_flag", redFlag: true }));
    return { ok: true, reply, products: [] };
  }

  const trusted = await loadTrustedEchoContext(uid, scanId);
  if (!trusted) return { ok: false, status: 409, code: "CHAT_ANALYSIS_UNAVAILABLE", error: "This scan's analysis isn't available yet." };

  // Real inputs (wave-2 wiring 2). The recommendation section stays empty:
  // recommend() is off in production builds (TD-20) and nothing calls it yet.
  // evaluateSafety runs in every build, marked provisional.
  // No server record says which answers were confirmed on this check
  // (tracker row), so every answer counts as reused: caution is never removed.
  const skin = { scores: trusted.scores, regionScores: trusted.regionScores, regionLowConfidence: trusted.regionLowConfidence, pipelineVersion: trusted.pipelineVersion, schemaVersion: trusted.schemaVersion };
  let safety: SafetyState;
  try {
    safety = evaluateSafety({ answers: trusted.answers, confirmedThisScan: [] });
  } catch (err) {
    // Rules report 6.4: ANY throw (a TypeError for answers
    // with no rule field, a bug) means the fixed fallback: our own reading
    // text and one uncertainty line, no Gemini call, no products. Never "no
    // red flag". The builder still applies the caution matcher to the answers.
    console.error("context chat: safety unavailable, fixed fallback:", (err as Error)?.name ?? "unknown");
    // TD-34: no opening for a check without answers (the screen does not ask for one); nothing is stored.
    if (opening) return { ok: false, status: 409, code: "OPENING_UNAVAILABLE", error: "No suggestion for this check." };
    const pkg = buildContextPackage({ regionFocus: opening ? null : region, message, skin, answers: trusted.answers, ownProducts, opening });
    // F11: a check with no questionnaire answers gets the same fixed reply plus
    // a line asking the user to finish the questionnaire, so Echo can help.
    const noAnswers = !RULE_INPUT_FIELDS.some((f) => Object.hasOwn(trusted.answers, f));
    const reply = noAnswers ? `${fallbackAnswer(pkg)}\n${FINISH_QUESTIONNAIRE_COPY}` : fallbackAnswer(pkg);
    await recordChatTurns(
      uid, scanId, region, message, reply,
      meta({ ...NO_CALL, opening, packageVersion: pkg.packageVersion, packageSha256: packageSha256(pkg), validator: { passed: false, failures: [noAnswers ? "no_answers" : "safety_unavailable"], regenerated: false, fallback: true }, prefilter: null, redFlag: false })
    );
    return { ok: true, reply, products: [] };
  }
  const longitudinal = await longitudinalFor(uid, scanId);
  const pkg = buildContextPackage({
    regionFocus: opening ? null : region,
    message,
    skin,
    answers: trusted.answers,
    longitudinal,
    safety,
    ownProducts,
    opening,
  });
  const versions = { packageVersion: pkg.packageVersion, packageSha256: packageSha256(pkg) };

  // §6b: a comparison question gets the fixed template, no Gemini call.
  if (!opening && comparisonHit(message)) {
    const reply = comparisonAnswer(pkg);
    await recordBestEffort(uid, scanId, region, message, reply, meta({ ...NO_CALL, ...versions, prefilter: "comparison", redFlag: false }));
    return { ok: true, reply, products: [] };
  }

  const outcome = await answerFromPackage(pkg, message, history, { generate: generateContextAnswer });
  // TD-34: the guards change only what the user sees. The stored text (Gemini's
  // later history) is the unguarded answer, the same for every user.
  // A red-flag message earlier on this check counts like a quiz red flag (safety review).
  const guard = ownProducts && (await hadRedFlagTurn(uid, scanId)) ? "red_flag" : productGuard(safety, opening ? "" : message);
  const shown = guardedReply(outcome, guard, opening);
  // Not best effort: an unrecorded reply would make the D-15 history diverge.
  await recordChatTurns(
    uid, scanId, region, message, outcome.reply,
    meta({
      ...versions, promptVersion: promptVersionFor(pkg), modelId: outcome.modelId, validator: outcome.validator, prefilter: null, redFlag: outcome.referral,
      ...(ownProducts ? { products: outcome.products, withoutProducts: outcome.withoutProducts, productContent: outcome.productContent, guard, opening, listVersion: OWN_PRODUCTS_VERSION } : {}),
    })
  );
  // TD-34: an opening that fell back is kept (so a reload spends nothing) but is no suggestion.
  if (opening && outcome.validator.fallback) return { ok: false, status: 409, code: "OPENING_UNAVAILABLE", error: "No suggestion for this check." };
  return { ok: true, reply: shown.reply, products: onlyListed(shown.products) };
}

/**
 * TD-34: an opening already made for this check, shown again with today's
 * guards and today's list. No Gemini call. Any safety failure shows no product.
 */
export async function serveStoredOpening(uid: string, scanId: string, stored: StoredOpening): Promise<ContextChatResult> {
  if (stored.fallback) return { ok: false, status: 409, code: "OPENING_UNAVAILABLE", error: "No suggestion for this check." };
  const trusted = await loadTrustedEchoContext(uid, scanId);
  if (!trusted) return { ok: false, status: 409, code: "CHAT_ANALYSIS_UNAVAILABLE", error: "This scan's analysis isn't available yet." };
  let guard: ReturnType<typeof productGuard>;
  try {
    guard = (await hadRedFlagTurn(uid, scanId)) ? "red_flag" : productGuard(evaluateSafety({ answers: trusted.answers, confirmedThisScan: [] }));
  } catch {
    // Fails closed: no opening at all rather than products without their guard.
    return { ok: false, status: 409, code: "OPENING_UNAVAILABLE", error: "No suggestion for this check." };
  }
  const shown = guardedReply(stored, guard, true);
  return { ok: true, reply: shown.reply, products: onlyListed(shown.products) };
}
