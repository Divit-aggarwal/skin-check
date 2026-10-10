import { z } from "zod";
import type { AllowedClaim, ContextPackage, ForbiddenClaim } from "@/lib/contracts/context-package";
import { packageFacts, type CitableFact, type FactKind } from "./builder";
import { nonMedicalRedFlagHit, redFlagHit } from "./prefilter";
import { productsOnFor } from "./renderer";
import { CATALOGUE } from "@/lib/catalog/catalogue";
import { UNLISTED_ALIASES } from "./products";
import {
  ACTIVE,
  BAND_WORD,
  FORMAT_CHARS,
  LOOKALIKE,
  CAUSE,
  CHANGE,
  CONFIDENCE,
  DIAGNOSIS,
  EFFICACY,
  OTHER_PRODUCT,
  PRESSURE,
  PRICE,
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

const CLAIM_TYPES = ["product", "descriptive", "self_reported_echo", "uncertainty", "comparability", "smalltalk", "clarify", "out_of_scope"] as const satisfies readonly AllowedClaim[];
const MUST_CITE = new Set<ClaimKind>(["descriptive", "uncertainty", "comparability", "self_reported_echo", "product", "product_reason"]);
/** TD-34: a product's reason is checked like a claim of its own, citing that product and the user's facts. Internal only. */
type ClaimKind = AllowedClaim | "product_reason";

const AnswerSchema = z
  .object({
    claims: z
      .array(z.object({ claim_type: z.enum(CLAIM_TYPES), text: z.string().min(1).max(600), fact_ids: z.array(z.string()).max(4) }).strict())
      .min(1)
      .max(5),
    needs_referral: z.boolean(),
    // F16 (ctx-prompt-3). Optional so an answer without it is still read; then
    // a referral keeps the crisis line (answer.ts).
    distress: z.boolean().optional(),
    // TD-34: suggested own products, each with one reason. Optional: off, there is none.
    products: z
      .array(z.object({ product_id: z.string().max(80), reason: z.string().min(1).max(300), fact_ids: z.array(z.string()).max(3) }).strict())
      .max(5)
      .optional(),
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
  /** A claim's own words (quotes of our facts removed) read as self-harm or another red flag: a referral (red team pass 2). */
  redFlag: boolean;
  /** F16: a red flag in the model's own words other than a medical request (a crisis, a symptom, a child, pregnancy). */
  crisis: boolean;
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
// TD-34: only while product suggestions are on, so an off package is checked exactly as before.
const PRODUCT_WORD_CHECKS: [ForbiddenClaim, RegExp][] = [
  ["efficacy_claim", EFFICACY],
  ["made_up_price", PRICE],
  ["purchase_pressure", PRESSURE],
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
  if (f.quotes) out.push(...f.quotes);
  return out;
}

/** smalltalk, clarify and out_of_scope claims are short, uncited free text (security finding 5). */
const UNCITED_MAX = 240;

// Words that may frame a quote. Anything else must come from the cited facts' own text.
// Hinglish glue words (ctx-prompt-4) frame a quote the same way. Never "nahi", a past tense
// ("tha", "thi") or a change word: those would change what the quoted fact says.
const FRAME = new Set(
  ("you told us said say mentioned noted shared your that the a an and or is are was were for about on in of with we as it this these listed picked chose selected answered answer answers quiz here also so i me my our " +
    "aap aapka aapke aapki aapne apna apne apni bataya batayi bataye hai hain ka ke ki ko se pe par mein me yeh ye is iss isme ismein aur ya bhi sirf wala wali wale").split(" ")
);
// A descriptive claim may add only these words to its cited facts' own words (security review, wave 2).
const DESCRIBE_FRAME = new Set(
  Array.from(FRAME).concat("reads read reading readings shows show photo photos scan skin level at across whole face region area estimate based by".split(" "))
);
// TD-34: a "product" claim may frame its product's own words with these too (EN and Hinglish).
const PRODUCT_FRAME = new Set(
  Array.from(FRAME).concat(
    ("use using apply suggest suggested suggesting suggestion pick picked chose step steps routine own project skin's product products list from can could may " +
      "one each morning night daily here's here then after next first is are simple s for you " +
      "kar sakte sakti sakta hain karein kijiye lagayein lagaiye lagana istemal subah raat roz din wala").split(" ")
  )
);
// A product's reason repeats the user's facts; it may be framed like a description or a product claim.
const REASON_FRAME = new Set(Array.from(DESCRIBE_FRAME).concat(Array.from(PRODUCT_FRAME)));
// A self-report echo must say it is what the user told us (security review, wave 2).
const TOLD = new RegExp(String.raw`\b(?:told|said|mentioned|noted|shared|listed|picked|chose|selected|answered|bataya|batayi|bataye)\b`, "iu");
// Uncited claims: no comparison, and smalltalk does not talk about the skin or point back at a reading.
const UNCITED_COMPARE = new RegExp(String.raw`\bthan\b`, "iu");
const SMALLTALK_SKIN = new RegExp(String.raw`\b(?:skin|face|complexion|spots?|acne|pimples?|breakouts?|shine|shiny|oily|bumps?|marks?|tone|it|that|this)\b`, "iu");
// clarify and out_of_scope may name the skin ("Which part of your face?") but not say how it is (H20, finding 5).
const UNCITED_SKIN_NOUN = new RegExp(String.raw`\b(?:skin|face|complexion|acne|pimples?|breakouts?|bumps?|spots?|marks?|redness|rash\w*|oil\w*|pores?|texture|pigment\w*|scars?|daane|chehr\w*)\b`, "iu");
const UNCITED_SKIN_STATE = new RegExp(
  String.raw`\b(?:gone|cleared?|clearing|healthy|great|good|fine|normal|bad|severe|mild|serious|perfect|flawless|glow\w*|calm\w*|settled|subsid\w*|okay|ok|nothing to worry|chale? ga(?:ye|ya|yi)|theek|thik|saaf|kam ho\w*)\b`,
  "iu"
);
// Red team pass 2 (I02 P2-1): an uncited claim names no brand, day or other
// proper noun (a capital letter inside a sentence, except "I"), and never
// sends the user to a link, a sign-in or a code.
// F07 live run: the two languages Echo answers in are not brands ("I can only answer in English").
const UNCITED_PROPER = new RegExp(String.raw`(?<=[\p{L},;:]\s+)(?!I\b|English\b|Hindi\b|Hinglish\b)\p{Lu}\p{L}*`, "u");
const UNCITED_PHISH = new RegExp(String.raw`https?:|www\.|\b\w+\.(?:com|in|org|net|io|app)\b|\b\w+\s+dot\s+(?:com|in|org|net|io|app|example)\b|\bsign (?:in|up)\b|\blog ?in\b|\botp\b|\bpassword\b|\bphone\b|\bcode\b`, "iu");
// F07 live run (real Gemini): our own fixed phrases that tripped a word list
// without saying anything about the skin. Only these exact phrases are blanked,
// for the word checks and the small-talk check; every other use of the word
// still fails. "before" only after "ask a doctor", "explain" only before
// "your results/readings", and "skin check" (the product's name) only in small talk.
const SAFE_PHRASES = [
  new RegExp(String.raw`(?<=\b(?:doctor|dermatologist|pharmacist)\b[^.;:!?]{0,40}\s)before (?:starting|using|trying|adding|changing|switching)\b`, "giu"),
  // photo-taking words, not a change or a condition (final live runs)
  new RegExp(String.raw`\bbefore (?:taking|you take) (?:a|the|your) (?:photo|picture|selfie|scan|check)\b`, "giu"),
  new RegExp(String.raw`\blighting conditions?\b`, "giu"),
  // a refusal: "I cannot explain general definitions" (still fails on "causes" or "because")
  new RegExp(String.raw`(?<=\b(?:cannot|can't|can not|unable to|not able to)\s)explain\b`, "giu"),
  new RegExp(String.raw`\b(?:help(?:s)?|to) explain (?:your|the|these) (?:skin check )?(?:results?|readings?)\b`, "giu"),
];
const neutral = (text: string) => SAFE_PHRASES.reduce((t, re) => t.replace(re, " "), text);
// TD-34 (live run): a refusal that names what it will not do ("I cannot share
// prices or discount codes") offers nothing; blanked for the price and buying
// checks only. Any other price or buying word still fails.
const REFUSED_SALE = new RegExp(
  String.raw`\b(?:cannot|can't|can not|unable to|not able to|do not|don't|won't|will not)\s+(?:\w+\s+){0,3}?(?:(?:prices?|pricing|costs?|discounts?|offers?|coupons?|deals?|codes?|buying|purchases?|shopping)(?:\s+(?:or|and)\s+|\s*,\s*|\s+)?)+`,
  "giu"
);
const notSelling = (text: string) => text.replace(REFUSED_SALE, " ");
const SKIN_CHECK_NAME = new RegExp(String.raw`\byour skin[- ]checks?(?: results?| readings?| analysis| data)?\b`, "giu");
// F17: an uncited claim (small talk, clarify, out of scope) carries no fact,
// so it may assert nothing about the world: "the heat is the issue" and "this
// is from the sun" name no cause word but still say why. By sentence form, not
// by word list: after an optional greeting, every clause is Echo saying what it
// can or cannot do, a question to the user, a request to see a doctor or
// pharmacist, or a closing. Anything else fails citation_rule ("statement").
const OPENER = new RegExp(String.raw`^(?:(?:hello|hi|hey|hiya|namaste|thanks|thank you|sure|of course|okay|ok|absolutely|got it|no problem|good question|great question|haan|ji|ji haan|theek hai|thik hai|accha|achha|bilkul|shukriya|dhanyavaad)\b[\s,!.:-]*)+`, "iu");
const CLAUSE_SPLIT = new RegExp(String.raw`\s*(?:[;:]|,\s*(?:but|so|and|though|although|while|because|since|as|which)\b|\s(?:but|so that|because|since|as(?! (?:a|an)\b))\s)\s*`, "iu");
const CLAUSE_FORMS = [
  // Echo on what it can or cannot do. Any verb, but not an opinion ("I think the
  // heat is ...", "I am sure ...") and not a reported clause ("I can tell you that ...").
  new RegExp(String.raw`^(?:i|echo)(?:'m| am| can(?:not|'t)?| could(?: not|n't)?| do(?: not|n't)| does(?: not|n't)| will| would| may not| won't| have no| only)\b(?!.*\b(?:think|believe|feel|guess|suspect|reckon|bet|sure|certain|confident|convinced)\b)(?!.*\b(?:that|:)\s+(?:the|this|it|your|my|stress|heat|sun|weather|diet|hormones?)\b)`, "iu"),
  // a request to ask a professional, or to tell Echo more
  new RegExp(String.raw`^(?:please\s+)?(?:ask|consult|talk to|speak (?:to|with)|see|check with|contact|reach out to)\s+(?:a|an|your)\s+(?:doctor|dermatologist|pharmacist|gp|physician|skin specialist)\b`, "iu"),
  new RegExp(String.raw`^(?:please\s+)?(?:let me know|feel free|tell me|share)\b`, "iu"),
  new RegExp(String.raw`^you (?:can|could|may)(?: also| always)? (?:ask|consult|talk|speak|see|check with|contact|tell me|share|try asking|rephrase)\b`, "iu"),
  // a closing
  new RegExp(String.raw`^(?:you(?:'re| are) (?:very |most |always )?welcome|anytime|happy to help|glad to help|glad (?:that|it|i could) help\w*)\b`, "iu"),
  // The same forms in Hinglish (ctx-prompt-4): Echo on what it can or cannot do
  // ("Main product suggest nahi kar sakti"), not an opinion ("mujhe lagta hai").
  new RegExp(String.raw`^(?:main|mai|mein|echo)\b(?!.*\b(?:lagta|lagti|sochta|sochti|sochte|yakeen|pakka|shayad)\b).*\b(?:sakti|sakta|sakte|sakungi|sakunga|paungi|paunga|karti|karta|kar rahi|kar raha|hoon|hu|hun)\b`, "iu"),
  // a request to ask a professional ("Please kisi doctor se poochein")
  new RegExp(String.raw`^(?:please\s+)?(?:kisi\s+|apne\s+)?(?:doctor|dermatologist|pharmacist|skin specialist)\s+(?:se|ko)\b.*\b(?:poochein|poochiye|puchiye|puchein|poocho|pucho|dikhaiye|dikhayein|dikhao|milein|consult)\b`, "iu"),
  new RegExp(String.raw`^(?:please\s+)?(?:mujhe\s+)?(?:batayein|bataiye|batao|bataein)\b`, "iu"),
  // a closing
  new RegExp(String.raw`^(?:aapka (?:bahut )?swagat hai|koi baat nahi|khushi hui|madad karke khushi hui|aur kuch poochna ho to batayein)\b`, "iu"),
];
// F07 (ctx-prompt-4): a claim that Echo answers only in English, or cannot answer in Hindi or Hinglish, is false.
const ENGLISH_ONLY = new RegExp(String.raw`\b(?:only|sirf|keval)\b[^.!?]*\b(?:english|angrezi)\b(?![^.!?]*\b(?:hindi|hinglish)\b)|\b(?:english|angrezi)\b[^.!?]*\b(?:only|hi|mein hi)\b[^.!?]*\b(?:answer|reply|respond|speak|baat|jawab)|\b(?:cannot|can't|can not|unable to|not able to|nahi)\b[^.!?]*\b(?:hindi|hinglish)\b|\b(?:hindi|hinglish)\b[^.!?]*\bnahi\b`, "iu");
// A real question to the user; a negative question ("isn't it the heat?") asserts, so it is not one.
const QUESTION = new RegExp(String.raw`^(?:(?:in|on|for|about|at|from|with|to) (?:which|what|where|whom)|how|what|which|where|when|who|could|can|would|will|do|does|did|is|are|may|should|shall|have|has)\b(?!n't)[^?]*\?$|^(?=[^?]*\b(?:kya|kaun\w*|kab|kahan|kaise|kis\w*|kitn\w*)\b)[^?]*\?$`, "iu");
const sentenceKey = (t: string) => normalizeForMatch(t).toLowerCase().replace(/[.!?\s]+$/, "").trim();
/** `own`: this package's fact texts, which are our words, not a statement by Gemini. */
function uncitedStatement(text: string, own: Set<string>): string | null {
  for (const raw of text.split(/(?<=[.!?])\s+/)) {
    const sentence = raw.trim().replace(OPENER, "").trim();
    if (!sentence || QUESTION.test(sentence) || own.has(sentenceKey(sentence))) continue;
    for (const part of sentence.replace(/[.!]+$/, "").split(CLAUSE_SPLIT)) {
      const clause = part.trim().replace(OPENER, "").trim();
      if (clause && !CLAUSE_FORMS.some((f) => f.test(clause))) return clause;
    }
  }
  return null;
}
const GOOD_QUESTION = new RegExp(String.raw`\b(?:good|great) question\b`, "giu");
// An uncertainty or comparability claim cites the facts it is about (H20, finding 4).
const NEEDS_KIND: Partial<Record<ClaimKind, FactKind[]>> = { uncertainty: ["uncert", "missing", "long"], comparability: ["long", "missing", "confounder"] };
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
  if (!answer) return { passed: false, answer: null, failures: [{ check: "malformed_output", claimIndex: -1 }], userPremise: false, redFlag: false, crisis: false };
  let redFlag = false;
  let crisis = false;

  const facts = new Map(packageFacts(pkg).map((f) => [f.id, f]));
  const ownTexts = new Set(packageFacts(pkg).flatMap((f) => f.text.split(/(?<=[.!?])\s+/).map(sentenceKey)));
  const readings = pkg.skin?.readings ?? [];
  const failures: Failure[] = [];
  const fail = (check: Check, claimIndex: number, term?: string) => failures.push({ check, claimIndex, ...(term ? { term } : {}) });

  const productsOn = productsOnFor(pkg);
  // TD-34: product ids must be on this package's list, once each.
  const listed = new Set((pkg.recommendation?.items ?? []).map((item) => item.productId));
  const seenProducts = new Set<string>();
  for (const product of answer.products ?? []) {
    if (!productsOn || !listed.has(product.product_id) || seenProducts.has(product.product_id)) fail("product_not_in_list", -1, product.product_id);
    seenProducts.add(product.product_id);
  }
  // Our own products that are not on this list (out of stock) are other products here.
  const unlisted = CATALOGUE.products.filter((p) => !listed.has(p.id)).flatMap((p) => [p.name, ...(UNLISTED_ALIASES[p.id] ?? [])]);
  const unlistedRe = unlisted.length > 0 ? new RegExp(unlisted.map((n) => String.raw`(?<![\p{L}\p{N}])${escape(normalizeForMatch(n))}(?![\p{L}\p{N}])`).join("|"), "iu") : null;

  // Each reason is checked as a claim citing its own product plus the facts it names.
  const reasons = (answer.products ?? []).map((p) => ({ claim_type: "product_reason" as ClaimKind, text: p.reason, fact_ids: [`rec.${p.product_id}`, ...p.fact_ids] }));
  const checked: { claim_type: ClaimKind; text: string; fact_ids: string[] }[] = [...answer.claims, ...reasons];

  checked.forEach((claim, i) => {
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
    if (claim.claim_type !== "product_reason" && !pkg.allowedClaims.includes(claim.claim_type)) fail("citation_rule", i, claim.claim_type);
    // TD-34: a product claim cites products only; a reason cites the user's own facts (answers or readings) besides its product.
    if (claim.claim_type === "product" && (!kinds.has("rec") || cited.some((f) => f.kind !== "rec"))) fail("citation_rule", i);
    if (claim.claim_type === "product_reason") {
      const own = cited.slice(1);
      if (cited[0]?.kind !== "rec" || own.length === 0 || own.some((f) => f.kind !== "self" && f.kind !== "state")) fail("citation_rule", i);
      if (own.some((f) => f.kind === "self") && !TOLD.test(text)) fail("self_report_as_measurement", i);
    }
    if (MUST_CITE.has(claim.claim_type) && claim.fact_ids.length === 0) fail("citation_rule", i);
    // An uncited type may cite only a missing fact it repeats as is ("Product suggestions were not included here.").
    const onlyMissingQuoted = cited.length === claim.fact_ids.length && cited.every((f) => f.kind === "missing");
    if (!MUST_CITE.has(claim.claim_type) && ((claim.fact_ids.length > 0 && !onlyMissingQuoted) || BAND_WORD.test(text) || metricsIn(text).length > 0 || text.length > UNCITED_MAX)) {
      fail("citation_rule", i);
    }
    if (!MUST_CITE.has(claim.claim_type) && UNCITED_COMPARE.test(text)) fail("comparative_or_change", i, "than");
    if (claim.claim_type === "smalltalk") {
      const named = text.replace(SKIN_CHECK_NAME, " ");
      // Naming the product lets no state word in ("... with your skin check results, all good").
      const skin = firstMatch(SMALLTALK_SKIN, named) ?? (named !== text ? firstMatch(UNCITED_SKIN_STATE, text) : null);
      if (skin) fail("citation_rule", i, skin);
    }
    // Red team pass 2 (I02 P2-1): a claim whose own words read as self-harm or another
    // red flag never passes, and answer.ts gives the referral. Our quoted fact text
    // (e.g. the user's own label "Deep or painful breakouts") is not the claim's own words.
    if (redFlagHit(stripped)) {
      redFlag = true;
      if (nonMedicalRedFlagHit(stripped)) crisis = true;
      fail("contradicts_package", i);
    }
    if (!MUST_CITE.has(claim.claim_type)) {
      // TD-34 (named change): with products on, our own name "Project Skin" is no outside brand.
      const proper = firstMatch(UNCITED_PROPER, productsOn ? claim.text.replace(/\bProject Skin(?:'s)?/g, "our") : claim.text);
      if (proper) fail("citation_rule", i, proper);
      const phish = firstMatch(UNCITED_PHISH, text);
      if (phish) fail("citation_rule", i, phish);
    }
    if (!MUST_CITE.has(claim.claim_type) && uncitedStatement(claim.text, ownTexts) !== null) fail("citation_rule", i, "statement");
    if (ENGLISH_ONLY.test(text)) fail("citation_rule", i, "english_only");
    if (claim.claim_type === "clarify" || claim.claim_type === "out_of_scope") {
      const plain = text.replace(GOOD_QUESTION, " ");
      const state = UNCITED_SKIN_NOUN.test(plain) ? firstMatch(UNCITED_SKIN_STATE, plain) : null;
      if (state) fail("citation_rule", i, state);
    }
    const needs = NEEDS_KIND[claim.claim_type];
    if (needs && claim.fact_ids.length > 0 && !cited.some((f) => needs.includes(f.kind))) fail("citation_rule", i);
    const roman = firstMatch(ROMAN, claim.text);
    if (roman) fail("made_up_number", i, roman);

    for (const [check, pattern] of productsOn ? WORD_CHECKS.concat(PRODUCT_WORD_CHECKS) : WORD_CHECKS) {
      // Numbers also on the raw text: NFKD folds "Ⅳ" to the letters "IV".
      const term = firstMatch(pattern, check === "made_up_price" || check === "purchase_pressure" ? notSelling(neutral(stripped)) : neutral(stripped)) ?? (check === "made_up_number" ? firstMatch(pattern, stripQuotes(claim.text, cited)) : null);
      if (term) fail(check, i, term);
    }
    // TD-34: another brand, a shop, our kit or one of our products not on the list, quoted or not.
    if (productsOn) {
      const other = firstMatch(OTHER_PRODUCT, text) ?? (unlistedRe ? firstMatch(unlistedRe, text) : null);
      if (other) fail("product_not_in_list", i, other);
    }
    // No active ingredient at all, even one a rec.* fact names. For every user,
    // like the instruction: a check only some users got would change their
    // retry prompt and so point at a hidden answer (TD-17 (1), tracker H19).
    // TD-34 (named change): with product suggestions on, a cited product's own
    // exact name ("5% Niacinamide Serum") and a verbatim quote of its whole fact
    // (our text) are not an ingredient of Gemini's; the key ingredient alone still is.
    const own = productsOn ? cited.flatMap((f) => (f.kind === "rec" && f.productName ? [normalizeForMatch(f.text), normalizeForMatch(f.productName)] : [])) : [];
    const active = firstMatch(ACTIVE, own.reduce((t, n) => t.replace(new RegExp(escape(n), "giu"), " "), text));
    if (active && !failures.some((f) => f.claimIndex === i && f.check === "product_claim")) fail("product_claim", i, active);

    // §5 rule 6: a descriptive band word must be a band of a cited reading.
    if (claim.claim_type === "descriptive" || claim.claim_type === "product_reason") {
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
    if (kinds.has("self") && claim.claim_type !== "self_reported_echo" && claim.claim_type !== "product_reason") fail("self_report_as_measurement", i);
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
      // Own words come from the cited READINGS only (red team pass 2, I02 P2-1:
      // "not" from the uncertainty fact turned "Redness is not Elevated" into an allowed claim).
      const extra = extraWord(stripped, cited.filter((f) => f.kind === "state"), DESCRIBE_FRAME, cited.flatMap((f) => (f.band ? [f.band.toLowerCase()] : [])));
      // No term: a common extra word ("about") must not read as the user's own premise and stop the retry.
      if (extra) fail("contradicts_package", i);
    }
    // Uncertainty and comparability claims are the cited facts' own words in a
    // frame too: no "Your breakouts have subsided", "Back in March ...", "down
    // to the heat" (second security review, H20 finding 4).
    if (claim.claim_type === "uncertainty" || claim.claim_type === "comparability") {
      const extra = extraWord(stripped, cited, DESCRIBE_FRAME);
      if (extra) fail("contradicts_package", i);
    }
    if (kinds.has("rec") && claim.claim_type !== "product_reason") {
      // Own words from the product facts only, so a reading cannot be pulled in ("…, for your Elevated redness").
      const extra = extraWord(stripped, cited.filter((f) => f.kind === "rec"), claim.claim_type === "product" ? PRODUCT_FRAME : FRAME);
      if (extra) fail("product_claim", i, extra);
    }
    // TD-34: a reason is the cited facts' own words in a frame, nothing about what the product does.
    if (claim.claim_type === "product_reason") {
      const extra = extraWord(stripped, cited, REASON_FRAME, cited.flatMap((f) => (f.band ? [f.band.toLowerCase()] : [])));
      if (extra) fail("product_claim", i, extra);
    }
  });

  // The user reads the claims joined: a phrase split across two claims is checked too.
  const joined = answer.claims.map((c) => stripQuotes(normalizeForMatch(c.text), c.fact_ids.flatMap((id) => facts.get(id) ?? []))).join(" ");
  for (const [check, pattern] of productsOn ? WORD_CHECKS.concat(PRODUCT_WORD_CHECKS) : WORD_CHECKS) {
    const term = firstMatch(pattern, check === "made_up_price" || check === "purchase_pressure" ? notSelling(neutral(joined)) : neutral(joined));
    if (term && !failures.some((f) => f.check === check)) fail(check, -1, term);
  }

  // An answer that describes a reading also says what the reading cannot tell.
  // F07 live run: a descriptive claim that cites only what is missing ("Product
  // suggestions were not included here.") describes no reading.
  const describes =
    answer.claims.some((c) => c.claim_type === "descriptive" && c.fact_ids.some((id) => facts.get(id)?.kind === "state")) ||
    reasons.some((c) => c.fact_ids.some((id) => facts.get(id)?.kind === "state"));
  const uncertain = answer.claims.some((c) => c.fact_ids.some((id) => facts.get(id)?.kind === "uncert"));
  if (describes && !uncertain) fail("missing_uncertainty", -1);

  const message = userMessage.toLowerCase();
  const userPremise = failures.some((f) => f.term !== undefined && f.check !== "unknown_fact_id" && message.includes(f.term.toLowerCase()));
  return { passed: failures.length === 0, answer, failures, userPremise, redFlag, crisis };
}
