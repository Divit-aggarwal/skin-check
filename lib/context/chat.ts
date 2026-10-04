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
import { answerFromPackage, comparisonAnswer, fallbackAnswer } from "./answer";
import { buildContextPackage, PACKAGE_VERSION, packageSha256 } from "./builder";
import { loadChatHistory, recordChatTurns, type EchoTurnRecord } from "./chat-turns";
import { comparisonHit, joinedUserTurns, redFlagHit, REFERRAL_COPY } from "./prefilter";
import { PROMPT_VERSION } from "./renderer";

// The chat route's context-package branch (docs/lanes/context-design.md §3.2).
// Runs only after auth, the history token, the 18+ and AI-share gates and the
// quota, and only while contextChatEnabled(). Throws on a Gemini or Firestore
// failure; the route turns that into its existing 502.

export type ContextChatResult = { ok: true; reply: string } | { ok: false; status: number; code: string; error: string };

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

export async function handleContextChat(input: { uid: string; scanId: string; region: EchoRegion; message: string }): Promise<ContextChatResult> {
  const { uid, scanId, region, message } = input;
  const started = Date.now();
  const meta = (m: Omit<EchoTurnRecord, "latencyMs">): EchoTurnRecord => ({ ...m, latencyMs: Date.now() - started });

  // §6: before anything is loaded or built, and never to Gemini.
  if (redFlagHit(message)) {
    await recordBestEffort(uid, scanId, region, message, REFERRAL_COPY, meta({ ...NO_CALL, packageVersion: null, packageSha256: null, prefilter: "red_flag", redFlag: true }));
    return { ok: true, reply: REFERRAL_COPY };
  }

  // A message split over turns ("i want to" then "die") is checked joined with
  // the last stored user turns, still before anything is built (security
  // review, wave 2). Stored turns hold no pre-filter or referral turns.
  const history = await loadChatHistory(uid, scanId, region);
  if (redFlagHit(joinedUserTurns(history, message))) {
    await recordBestEffort(uid, scanId, region, message, REFERRAL_COPY, meta({ ...NO_CALL, packageVersion: null, packageSha256: null, prefilter: "red_flag", redFlag: true }));
    return { ok: true, reply: REFERRAL_COPY };
  }

  const trusted = await loadTrustedEchoContext(uid, scanId);
  if (!trusted) return { ok: false, status: 409, code: "CHAT_ANALYSIS_UNAVAILABLE", error: "This scan's analysis isn't available yet." };

  // Real inputs (wave-2 wiring 2). The recommendation section stays empty:
  // rules are off in production builds, and nothing calls recommend() yet.
  // No server record says which answers were confirmed on this check
  // (tracker row), so every answer counts as reused: caution is never removed.
  const skin = { scores: trusted.scores, regionScores: trusted.regionScores, regionLowConfidence: trusted.regionLowConfidence, pipelineVersion: trusted.pipelineVersion, schemaVersion: trusted.schemaVersion };
  let safety: SafetyState;
  try {
    safety = evaluateSafety({ answers: trusted.answers, confirmedThisScan: [] });
  } catch (err) {
    // Rules report 6.4: ANY throw (RulesDisabledError, a TypeError for answers
    // with no rule field, a bug) means the fixed fallback: our own reading
    // text and one uncertainty line, no Gemini call, no products. Never "no
    // red flag". The builder still applies the caution matcher to the answers.
    console.error("context chat: safety unavailable, fixed fallback:", (err as Error)?.name ?? "unknown");
    const pkg = buildContextPackage({ regionFocus: region, message, skin, answers: trusted.answers });
    const reply = fallbackAnswer(pkg);
    await recordChatTurns(
      uid, scanId, region, message, reply,
      meta({ ...NO_CALL, packageVersion: PACKAGE_VERSION, packageSha256: packageSha256(pkg), validator: { passed: false, failures: ["safety_unavailable"], regenerated: false, fallback: true }, prefilter: null, redFlag: false })
    );
    return { ok: true, reply };
  }
  const longitudinal = await longitudinalFor(uid, scanId);
  const pkg = buildContextPackage({
    regionFocus: region,
    message,
    skin,
    answers: trusted.answers,
    longitudinal,
    safety,
  });
  const versions = { packageVersion: PACKAGE_VERSION, packageSha256: packageSha256(pkg) };

  // §6b: a comparison question gets the fixed template, no Gemini call.
  if (comparisonHit(message)) {
    const reply = comparisonAnswer(pkg);
    await recordBestEffort(uid, scanId, region, message, reply, meta({ ...NO_CALL, ...versions, prefilter: "comparison", redFlag: false }));
    return { ok: true, reply };
  }

  const outcome = await answerFromPackage(pkg, message, history, { generate: generateContextAnswer, redFlag: safety.redFlag });
  // Not best effort: an unrecorded reply would make the D-15 history diverge.
  await recordChatTurns(
    uid, scanId, region, message, outcome.reply,
    meta({ ...versions, promptVersion: PROMPT_VERSION, modelId: outcome.modelId, validator: outcome.validator, prefilter: null, redFlag: outcome.referral })
  );
  return { ok: true, reply: outcome.reply };
}
