import { z } from "zod";
import type { AllowedClaim, ContextPackage, ForbiddenClaim } from "@/lib/contracts/context-package";
import { packageFacts, type CitableFact } from "./builder";
import {
  ACTIVE,
  BAND_WORD,
  FORMAT_CHARS,
  LOOKALIKE,
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
  normalizeForMatch,
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
  ["all", new RegExp(String.raw`\bwhole face\b|\boverall\b`, "iu")],
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

/** smalltalk, clarify and out_of_scope claims are short, uncited free text (security finding 5). */
const UNCITED_MAX = 240;

// Words that may frame a quote. Anything else must come from the cited facts' own text.
const FRAME = new Set(
  "you told us said say mentioned noted shared your that the a an and or is are was were for about on in of with we as it this these listed picked chose selected answered answer answers quiz here also so i me my our".split(" ")
);
// A descriptive claim may add only these words to its cited facts' own words (security review, wave 2).
const DESCRIBE_FRAME = new Set(
  Array.from(FRAME).concat("reads read reading readings shows show photo photos scan skin level at across whole face region area estimate based by".split(" "))
);
// A self-report echo must say it is what the user told us (security review, wave 2).
const TOLD = new RegExp(String.raw`\b(?:told|said|mentioned|noted|shared|listed|picked|chose|selected|answered)\b`, "iu");
// Uncited claims: no comparison, and smalltalk does not talk about the skin or point back at a reading.
const UNCITED_COMPARE = new RegExp(String.raw`\bthan\b`, "iu");
const SMALLTALK_SKIN = new RegExp(String.raw`\b(?:skin|face|complexion|spots?|acne|pimples?|breakouts?|shine|shiny|oily|bumps?|marks?|tone|it|that|this)\b`, "iu");
// Roman numerals as numbers ("type III skin"), on the raw text, upper case only.
const ROMAN = /\b(?:II|III|IV|VI|VII|VIII|IX|XI|XII)\b/;
const wordsOf = (text: string) => text.toLowerCase().match(new RegExp(String.raw`\p{L}+`, "gu")) ?? [];

function extraWord(stripped: string, cited: CitableFact[], frame: Set<string> = FRAME, bands: string[] = []): string | null {
  // A band or intensity word is never an "own" word: "Your Redness is heavy" reuses a label word as a band (re-check N5).
  // Only a cited reading's own band is allowed back in, and band_mismatch still checks it.
  const own = new Set(cited.flatMap((f) => wordsOf(normalizeForMatch(f.text))).filter((w) => !BAND_WORD.test(w)).concat(bands));
  return wordsOf(stripped).find((w) => !frame.has(w) && !own.has(w)) ?? null;
}

function stripQuotes(text: string, cited: CitableFact[]): string {
  const segments = cited.flatMap(quotable).map(normalizeForMatch).filter((s) => s.trim().length > 0).sort((a, b) => b.length - a.length);
  // Whole words only: a short label ("Dry") is not cut out of a longer word (re-check N7).
  return segments.reduce((t, seg) => t.replace(new RegExp(String.raw`(?<!\p{L})` + escape(seg) + String.raw`(?!\p{L})`, "giu"), " "), text);
}

export function parseAnswer(raw: string): GeminiAnswer | null {
  try {
    const parsed = AnswerSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const matchesOf = (re: RegExp, text: string) =>
  Array.from(text.matchAll(new RegExp(re.source, "giu")), (m) => ({ word: m[0].toLowerCase(), index: m.index ?? 0 }));
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

    // §5 rule 4b: no Devanagari or other script is validated in v1. Zero-width
    // and soft-hyphen characters can split a word past every list: rejected too.
    const script = firstMatch(NON_LATIN, claim.text.normalize("NFKC")) ?? firstMatch(FORMAT_CHARS, claim.text);
    if (script) fail("non_latin_script", i, script);

    const text = normalizeForMatch(claim.text);
    const lookalike = script ? null : firstMatch(LOOKALIKE, text);
    if (lookalike) fail("non_latin_script", i, lookalike);
    const stripped = stripQuotes(text, cited);
    // Band and contradiction checks keep quoted readings, so their metric and
    // band stay paired. Quoted labels are removed ("Exercise or heavy sweating
    // seems to trigger breakouts" is not a band); a band word added around a
    // label fails the quote-framing rule below instead (security finding 1).
    const bandText = stripQuotes(text, cited.filter((f) => f.kind !== "state"));

    // §5 rule 2. A claim type the package does not allow is a citation failure too.
    if (!pkg.allowedClaims.includes(claim.claim_type)) fail("citation_rule", i, claim.claim_type);
    if (MUST_CITE.has(claim.claim_type) && claim.fact_ids.length === 0) fail("citation_rule", i);
    if (!MUST_CITE.has(claim.claim_type) && (claim.fact_ids.length > 0 || BAND_WORD.test(text) || metricsIn(text).length > 0 || text.length > UNCITED_MAX)) {
      fail("citation_rule", i);
    }
    if (!MUST_CITE.has(claim.claim_type) && UNCITED_COMPARE.test(text)) fail("comparative_or_change", i, "than");
    if (claim.claim_type === "smalltalk") {
      const skin = firstMatch(SMALLTALK_SKIN, text);
      if (skin) fail("citation_rule", i, skin);
    }
    const roman = firstMatch(ROMAN, claim.text);
    if (roman) fail("made_up_number", i, roman);

    for (const [check, pattern] of WORD_CHECKS) {
      // Numbers also on the raw text: NFKD folds "Ⅳ" to the letters "IV".
      const term = firstMatch(pattern, stripped) ?? (check === "made_up_number" ? firstMatch(pattern, stripQuotes(claim.text, cited)) : null);
      if (term) fail(check, i, term);
    }
    // With extra caution on, no active ingredient at all, even one a rec.* fact names.
    if (pkg.safety.extraCaution) {
      const active = firstMatch(ACTIVE, text);
      if (active && !failures.some((f) => f.claimIndex === i && f.check === "product_claim")) fail("product_claim", i, active);
    }

    // §5 rule 6: a descriptive band word must be a band of a cited reading.
    if (claim.claim_type === "descriptive") {
      const citedBands = new Set(cited.filter((f) => f.band).map((f) => f.band!.toLowerCase()));
      for (const band of matchesOf(BAND_WORD, bandText)) if (!citedBands.has(band.word)) fail("band_mismatch", i, band.word);
    }

    // A metric named with a band the package does not hold for it, cited or
    // not. Per sentence, each metric word pairs with its nearest band word. A
    // band word must sit next to a metric in its own sentence ("It reads
    // Elevated." is not anchored), and one metric gets one band ("not Low but
    // Elevated" fails) — security re-check N2, N3.
    for (const sentence of bandText.split(/[.;!?]/)) {
      const bands = matchesOf(BAND_WORD, sentence);
      if (bands.length === 0) continue;
      const unmeasured = firstMatch(UNMEASURED_WORDS, sentence);
      if (unmeasured) fail("contradicts_package", i, unmeasured);
      const metricHits = (Object.keys(METRIC_WORDS) as (keyof typeof METRIC_WORDS)[]).flatMap((m) => matchesOf(METRIC_WORDS[m], sentence));
      if (metricHits.length === 0 && !unmeasured) fail("contradicts_package", i, bands[0]!.word);
      if (metricHits.length === 1 && new Set(bands.map((b) => b.word)).size > 1) fail("contradicts_package", i, bands[1]!.word);
      const regions = REGION_WORDS.filter(([, re]) => re.test(sentence)).map(([r]) => r);
      for (const metric of Object.keys(METRIC_WORDS) as (keyof typeof METRIC_WORDS)[]) {
        for (const at of matchesOf(METRIC_WORDS[metric], sentence)) {
          const band = bands.find((b) => b.index > at.index) ?? bands[bands.length - 1]!;
          const held = readings.filter((r) => r.metric === metric && (regions.length === 0 || regions.includes(r.region)));
          if (!held.some((r) => r.band.toLowerCase() === band.word)) fail("contradicts_package", i, band.word);
        }
      }
    }

    // Hydration and pores are never described, banded or not, except by quoting a missing fact.
    const unmeasuredWord = firstMatch(UNMEASURED_WORDS, stripped);
    // A self-report echo is bound to its own label words by the framing rule below.
    if (unmeasuredWord && !kinds.has("missing") && claim.claim_type !== "self_reported_echo") fail("contradicts_package", i, unmeasuredWord);

    // F04: what the user told us is never presented as measured.
    // One quoted answer per echo, so two labels cannot be joined into a new claim (re-check N1).
    if (claim.claim_type === "self_reported_echo" && cited.length > 1) fail("self_report_as_measurement", i);
    if (kinds.has("self") && claim.claim_type !== "self_reported_echo") fail("self_report_as_measurement", i);
    if (claim.claim_type === "self_reported_echo" && cited.some((f) => f.kind !== "self")) fail("self_report_as_measurement", i);
    const measured = firstMatch(MEASUREMENT, stripped);
    if (measured && !kinds.has("state")) fail("self_report_as_measurement", i, measured);
    // A quote may be framed ("You told us …") but not extended with Gemini's
    // own words: "…, and that is what your Moderate redness reflects" (security finding 8).
    if (claim.claim_type === "self_reported_echo") {
      const extra = extraWord(stripped, cited);
      if (extra) fail("self_report_as_measurement", i, extra);
      if (!TOLD.test(text)) fail("self_report_as_measurement", i);
    }
    // A description is the cited readings' own words in a frame, nothing else:
    // no "dropped to", "your March check", "likely from the humidity",
    // "plenty of" or "shaving bumps" (security review, wave 2).
    if (claim.claim_type === "descriptive") {
      const extra = extraWord(stripped, cited, DESCRIBE_FRAME, cited.flatMap((f) => (f.band ? [f.band.toLowerCase()] : [])));
      // No term: a common extra word ("about") must not read as the user's own premise and stop the retry.
      if (extra) fail("contradicts_package", i);
    }
    if (kinds.has("rec")) {
      // Own words from the product facts only, so a reading cannot be pulled in ("…, for your Elevated redness").
      const extra = extraWord(stripped, cited.filter((f) => f.kind === "rec"));
      if (extra) fail("product_claim", i, extra);
    }
  });

  // The user reads the claims joined: a phrase split across two claims is checked too.
  const joined = answer.claims.map((c) => stripQuotes(normalizeForMatch(c.text), c.fact_ids.flatMap((id) => facts.get(id) ?? []))).join(" ");
  for (const [check, pattern] of WORD_CHECKS) {
    const term = firstMatch(pattern, joined);
    if (term && !failures.some((f) => f.check === check)) fail(check, -1, term);
  }

  // An answer that describes a reading also says what the reading cannot tell.
  const describes = answer.claims.some((c) => c.claim_type === "descriptive");
  const uncertain = answer.claims.some((c) => c.fact_ids.some((id) => facts.get(id)?.kind === "uncert"));
  if (describes && !uncertain) fail("missing_uncertainty", -1);

  const message = userMessage.toLowerCase();
  const userPremise = failures.some((f) => f.term !== undefined && f.check !== "unknown_fact_id" && message.includes(f.term.toLowerCase()));
  return { passed: failures.length === 0, answer, failures, userPremise };
}
