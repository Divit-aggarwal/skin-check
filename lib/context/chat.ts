import { generateContextAnswer } from "@/lib/gemini";
import { loadTrustedEchoContext } from "@/lib/echo-trusted-context";
import type { EchoRegion } from "@/lib/echo-regions";
import { answerFromPackage, comparisonAnswer } from "./answer";
import { buildContextPackage, PACKAGE_VERSION, packageSha256 } from "./builder";
import { loadChatHistory, recordChatTurns, type EchoTurnRecord } from "./chat-turns";
import { comparisonHit, redFlagHit, REFERRAL_COPY } from "./prefilter";
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

export async function handleContextChat(input: { uid: string; scanId: string; region: EchoRegion; message: string }): Promise<ContextChatResult> {
  const { uid, scanId, region, message } = input;
  const started = Date.now();
  const meta = (m: Omit<EchoTurnRecord, "latencyMs">): EchoTurnRecord => ({ ...m, latencyMs: Date.now() - started });

  // §6: before anything is loaded or built, and never to Gemini.
  if (redFlagHit(message)) {
    await recordBestEffort(uid, scanId, region, message, REFERRAL_COPY, meta({ ...NO_CALL, packageVersion: null, packageSha256: null, prefilter: "red_flag", redFlag: true }));
    return { ok: true, reply: REFERRAL_COPY };
  }

  const trusted = await loadTrustedEchoContext(uid, scanId);
  if (!trusted) return { ok: false, status: 409, code: "CHAT_ANALYSIS_UNAVAILABLE", error: "This scan's analysis isn't available yet." };

  // Longitudinal, recommendation and safety inputs are wired by the main
  // session after the lanes merge; until then `missing` says they are absent.
  const pkg = buildContextPackage({
    regionFocus: region,
    message,
    skin: { scores: trusted.scores, regionScores: trusted.regionScores, regionLowConfidence: trusted.regionLowConfidence, pipelineVersion: trusted.pipelineVersion },
    answers: trusted.answers,
  });
  const versions = { packageVersion: PACKAGE_VERSION, packageSha256: packageSha256(pkg) };

  // §6b: a comparison question gets the fixed template, no Gemini call.
  if (comparisonHit(message)) {
    const reply = comparisonAnswer(pkg);
    await recordBestEffort(uid, scanId, region, message, reply, meta({ ...NO_CALL, ...versions, prefilter: "comparison", redFlag: false }));
    return { ok: true, reply };
  }

  const history = await loadChatHistory(uid, scanId, region);
  const outcome = await answerFromPackage(pkg, message, history, { generate: generateContextAnswer, redFlag: false });
  // Not best effort: an unrecorded reply would make the D-15 history diverge.
  await recordChatTurns(
    uid, scanId, region, message, outcome.reply,
    meta({ ...versions, promptVersion: PROMPT_VERSION, modelId: outcome.modelId, validator: outcome.validator, prefilter: null, redFlag: outcome.referral })
  );
  return { ok: true, reply: outcome.reply };
}
