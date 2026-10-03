import { z } from "zod";
import type { AllowedClaim, ContextPackage, ForbiddenClaim } from "@/lib/contracts/context-package";
import { packageFacts, type CitableFact } from "./builder";
import {
  ACTIVE,
  BAND_WORD,
  CAUSE,
  CHANGE,
  CONFIDENCE,
  DIAGNOSIS,
  FORECAST,
  MEASUREMENT,
  MEDICAL,
  METRIC_WORDS,
  NON_LATIN,
  NUMBER,
  PAST_EVENT,
  PRODUCT,
  UNMEASURED_WORDS,
  firstMatch,
} from "./lexicon";

// F03 (docs/lanes/context-design.md §3.6; GEMINI_BOUNDARY §5). A pure function
// over one Gemini answer. Every failure names the check it broke.
//
// Exemption: a verbatim quote of a cited fact's text is our own text, so it is
// removed before the word checks run. For a self-reported fact each answer
// label is quotable on its own. A paraphrase is not removed, so "shaving
// causes your redness" still fails `cause` even though a label says "Shaving
// often causes bumps or irritation".

const CLAIM_TYPES = ["descriptive", "self_reported_echo", "routine_as_directed", "uncertainty", "comparability", "smalltalk", "clarify", "out_of_scope"] as const satisfies readonly AllowedClaim[];
const MUST_CITE = new Set<AllowedClaim>(["descriptive", "uncertainty", "comparability", "routine_as_directed", "self_reported_echo"]);

const AnswerSchema = z
  .object({
    claims: z
      .array(z.object({ claim_type: z.enum(CLAIM_TYPES), text: z.string().min(1).max(600), fact_ids: z.array(z.string()).max(4) }).strict())
      .min(1)
      .max(5),
    needs_referral: z.boolean(),
  })
  .strict();

export type GeminiAnswer = z.infer<typeof AnswerSchema>;
export type Check = ForbiddenClaim | "malformed_output";

export interface Failure {
  check: Check;
  /** -1 for an answer-level failure. */
  claimIndex: number;
  term?: string;
}

export interface Validation {
  passed: boolean;
  answer: GeminiAnswer | null;
  failures: Failure[];
  /** A failing term also appears in the user's own message (§3.7: no retry). */
  userPremise: boolean;
}

const WORD_CHECKS: [ForbiddenClaim, RegExp][] = [
  ["made_up_number", NUMBER],
  ["comparative_or_change", CHANGE],
  ["medical_or_efficacy_term", MEDICAL],
  ["diagnosis", DIAGNOSIS],
  ["cause", CAUSE],
  ["forecast", FORECAST],
  ["self_assigned_confidence", CONFIDENCE],
  ["made_up_past_event", PAST_EVENT],
  ["product_claim", PRODUCT],
];

const REGION_WORDS: [string, RegExp][] = [
  ["forehead", new RegExp(String.raw`\bforehead\b`, "iu")],
  ["cheeks", new RegExp(String.raw`\bcheeks?\b`, "iu")],
  ["nose", new RegExp(String.raw`\bnose\b`, "iu")],
  ["chin", new RegExp(String.raw`\bchin\b`, "iu")],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function quotable(f: CitableFact): string[] {
  const out = [f.text];
  if (f.kind === "self") out.push(...f.text.slice(f.text.indexOf(": ") + 2).split("; "));
  if (f.productName) out.push(f.productName);
  return out;
}

function stripQuotes(text: string, cited: CitableFact[]): string {
  const segments = cited.flatMap(quotable).filter((s) => s.trim().length > 0).sort((a, b) => b.length - a.length);
  return segments.reduce((t, seg) => t.replace(new RegExp(escape(seg), "giu"), " "), text);
}

export function parseAnswer(raw: string): GeminiAnswer | null {
  try {
    const parsed = AnswerSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const bandsIn = (text: string) => Array.from(text.matchAll(new RegExp(BAND_WORD.source, "giu")), (m) => m[0].toLowerCase());
const metricsIn = (text: string) => (Object.keys(METRIC_WORDS) as (keyof typeof METRIC_WORDS)[]).filter((m) => METRIC_WORDS[m].test(text));

export function validateAnswer(raw: string, pkg: ContextPackage, userMessage: string): Validation {
  const answer = parseAnswer(raw);
  if (!answer) return { passed: false, answer: null, failures: [{ check: "malformed_output", claimIndex: -1 }], userPremise: false };

  const facts = new Map(packageFacts(pkg).map((f) => [f.id, f]));
  const readings = pkg.skin?.readings ?? [];
  const failures: Failure[] = [];
  const fail = (check: Check, claimIndex: number, term?: string) => failures.push({ check, claimIndex, ...(term ? { term } : {}) });

  answer.claims.forEach((claim, i) => {
    const cited = claim.fact_ids.flatMap((id) => {
      const f = facts.get(id);
      if (!f) fail("unknown_fact_id", i, id);
      return f ? [f] : [];
    });
    const kinds = new Set(cited.map((f) => f.kind));
    const stripped = stripQuotes(claim.text, cited);

    // §5 rule 2. A claim type the package does not allow is a citation failure too.
    if (!pkg.allowedClaims.includes(claim.claim_type)) fail("citation_rule", i, claim.claim_type);
    if (MUST_CITE.has(claim.claim_type) && claim.fact_ids.length === 0) fail("citation_rule", i);
    if (!MUST_CITE.has(claim.claim_type) && (claim.fact_ids.length > 0 || BAND_WORD.test(claim.text) || metricsIn(claim.text).length > 0)) {
      fail("citation_rule", i);
    }

    // §5 rule 4b: no Devanagari or other script is validated in v1.
    const script = firstMatch(NON_LATIN, claim.text);
    if (script) fail("non_latin_script", i, script);

    for (const [check, pattern] of WORD_CHECKS) {
      const term = firstMatch(pattern, stripped);
      if (term) fail(check, i, term);
    }
    // With extra caution on, no active ingredient at all, even one a rec.* fact names.
    if (pkg.safety.extraCaution) {
      const active = firstMatch(ACTIVE, claim.text);
      if (active && !failures.some((f) => f.claimIndex === i && f.check === "product_claim")) fail("product_claim", i, active);
    }

    // §5 rule 6: a descriptive band word must be a band of a cited reading.
    if (claim.claim_type === "descriptive") {
      const citedBands = new Set(cited.filter((f) => f.band).map((f) => f.band!.toLowerCase()));
      for (const band of bandsIn(stripped)) if (!citedBands.has(band)) fail("band_mismatch", i, band);
    }

    // A metric named with a band the package does not hold for it, cited or not.
    for (const clause of stripped.split(new RegExp(String.raw`[.;!?]|,\s|\band\b|\bbut\b|\bwhile\b`, "iu"))) {
      const bands = bandsIn(clause);
      if (bands.length === 0) continue;
      if (UNMEASURED_WORDS.test(clause)) {
        fail("contradicts_package", i, firstMatch(UNMEASURED_WORDS, clause) ?? undefined);
        continue;
      }
      const regions = REGION_WORDS.filter(([, re]) => re.test(clause)).map(([r]) => r);
      for (const metric of metricsIn(clause)) {
        const held = readings.filter((r) => r.metric === metric && (regions.length === 0 || regions.includes(r.region)));
        const heldBands = new Set(held.map((r) => r.band.toLowerCase()));
        const wrong = bands.find((b) => !heldBands.has(b));
        if (wrong) fail("contradicts_package", i, wrong);
      }
    }

    // F04: what the user told us is never presented as measured.
    if (claim.claim_type === "descriptive" && kinds.has("self")) fail("self_report_as_measurement", i);
    if (claim.claim_type === "self_reported_echo" && cited.some((f) => f.kind !== "self")) fail("self_report_as_measurement", i);
    const measured = firstMatch(MEASUREMENT, stripped);
    if (measured && !kinds.has("state")) fail("self_report_as_measurement", i, measured);
  });

  // An answer that describes a reading also says what the reading cannot tell.
  const describes = answer.claims.some((c) => c.claim_type === "descriptive");
  const uncertain = answer.claims.some((c) => c.fact_ids.some((id) => facts.get(id)?.kind === "uncert"));
  if (describes && !uncertain) fail("missing_uncertainty", -1);

  const message = userMessage.toLowerCase();
  const userPremise = failures.some((f) => f.term !== undefined && f.check !== "unknown_fact_id" && message.includes(f.term.toLowerCase()));
  return { passed: failures.length === 0, answer, failures, userPremise };
}
