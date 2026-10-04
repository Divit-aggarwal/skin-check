// Word lists shared by the validator (docs/lanes/context-design.md §3.6), the
// build-time screen of outside text (§3.3) and the pre-filters (§6, §6b).
// EN and Hinglish. Recall over precision: these catch phrasing, not meaning
// (GEMINI_BOUNDARY §5 "Known limit").
//
// Every pattern is case-insensitive and Unicode-aware. `firstMatch` returns
// the matched term so a failure can name it and the user-premise test
// (§3.7) can look for it in the user's message.

const re = (parts: string[]) => new RegExp(parts.join("|"), "iu");

/**
 * Compatibility forms folded (fullwidth, ligatures), combining marks removed,
 * curly quotes made straight and whitespace runs collapsed, so "ｃａｕｓｅｄ",
 * "câused", "don’t" and "due  to" match like their plain forms (security
 * review finding 6, re-check). Format characters (zero-width, soft hyphen)
 * are not removed here: FORMAT_CHARS rejects them, and LOOKALIKE rejects
 * Latin letters with no plain fold (ı, ɑ, small capital ᴄ).
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(new RegExp(String.raw`\p{M}`, "gu"), "")
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/\s+/g, " ");
}

/** After normalizeForMatch: a letter that is not plain a-z is a lookalike, rejected like another script. */
export const LOOKALIKE = new RegExp(String.raw`(?![a-zA-Z])\p{L}`, "u");

export const FORMAT_CHARS = new RegExp(String.raw`\p{Cf}`, "u");

export function firstMatch(pattern: RegExp, text: string): string | null {
  return pattern.exec(text)?.[0] ?? null;
}

// §5 rule 3. "do" (two) is left out: it is also an English verb.
export const NUMBER = re([
  "\\p{N}",
  "%",
  "\\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|half|halves|once|double|twice|thrice|triple|dozen|percent|percentage|third|quarter|several|couple|first|second|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)s?\\b",
  "\\b(?:ek|teen|char|chaar|paanch|panch|chhe|chhah|saat|aath|nau|das|bees|pachees|tees|chalees|pachaas|sau|hazaar|hazar|lakh|crore|aadha|dedh|dhai|dugna)\\b",
]);

// §5 rule 4: change and comparative words, on every claim type.
export const CHANGE = re([
  "\\bimprov\\w*",
  "\\bbetter\\b",
  "\\bworse\\w*",
  "\\blower\\b",
  "\\bhigher\\b",
  "\\bless(?:er)?\\b",
  "\\bmore than\\b",
  "\\bfewer\\b",
  "\\breduc\\w*",
  "\\bincreas\\w*",
  "\\bdecreas\\w*",
  "\\bfad(?:e|es|ed|ing)\\b",
  "\\bclear\\w*",
  "\\bcalm\\w*",
  "\\bbrighten\\w*",
  "\\beven(?:s|ed|ing)? out\\b",
  "\\brepair\\w*",
  "\\brestor\\w*",
  "\\b(?:went|gone|go|going) (?:down|up)\\b",
  "\\blast time\\b",
  "\\bbefore\\b",
  "\\bsince\\b",
  "\\bprogress\\w*",
  "\\bcompared? (?:to|with)\\b",
  "\\bpehle\\b",
  "\\bkam\\b",
  "\\bzy?aa?da\\b",
  "\\bbehtar\\b",
  "\\bacc?ha hua\\b",
  "\\bbadh\\w*",
  "\\bghat\\w*",
  // wave-2 security review: change verbs and comparatives not listed before
  "\\bdrop(?:s|ped|ping)?\\b",
  "\\bfell\\b",
  "\\bfall(?:en|ing|s)?\\b",
  "\\b(?:rose|risen|rising|rises)\\b",
  "\\bspik\\w*",
  "\\beas(?:ed|ing|es)\\b",
  "\\bsettl\\w*",
  "\\b(?:down|up) from\\b",
  "\\b(?:redder|smoother|oilier|shinier|rougher|darker|lighter|bumpier|drier|softer)\\b",
  "\\bthan\\b",
  "\\bfa?rak\\b",
]);

// §5 rule 5.
export const MEDICAL = re([
  "\\bdiagnos\\w*",
  "\\bcur(?:e|es|ed|ing)\\b",
  "\\bheal(?:s|ed|ing)?\\b",
  "\\btreat\\w*",
  "\\bprescri\\w*",
  "\\bguarantee\\w*",
  "\\bproven\\b",
  "\\bdiseases?\\b",
  "\\bdisorders?\\b",
  "\\bconditions?\\b",
  "\\bclinical(?:ly)?\\b",
  "\\btwin\\b",
  "\\bmedicines?\\b",
  "\\bmedications?\\b",
  "\\bdermatologist[- ]approved\\b",
]);

export const DIAGNOSIS = re([
  "\\bacne\\b",
  "\\bpcos\\b",
  "\\bhives\\b",
  "\\ballerg\\w*",
  "\\bmilia\\b",
  "\\bseborrh\\w*",
  "\\brosacea\\b",
  "\\bmelasma\\b",
  "\\beczema\\b",
  "\\bdermatitis\\b",
  "\\bpsoriasis\\b",
  "\\binfect\\w*",
  "\\bfungal\\b",
  "\\bfolliculitis\\b",
  "\\bmelanoma\\b",
  "\\bcancer\\w*",
  "\\bkeratosis\\b",
  "\\bvitiligo\\b",
  "\\bgrade\\b",
]);

export const CAUSE = re([
  "\\bbecause\\b",
  // link verbs that turn a quoted answer into an explanation of a reading
  "\\breflect\\w*",
  "\\bmirror\\w*",
  "\\bconsistent with\\b",
  "\\bin line with\\b",
  "\\b(?:related|connected|associated|tied) (?:to|with)\\b",
  "\\bgoes with\\b",
  "\\bfits? with\\b",
  "\\bwhich is why\\b",
  "\\bstem(?:s|med|ming)? from\\b",
  "\\bcom(?:e|es|ing) from\\b",
  "\\blinked (?:to|with)\\b",
  "\\bdriven by\\b",
  "\\bthanks to\\b",
  "\\bas a result\\b",
  "\\bexplain\\w*",
  "\\bfrom (?:shaving|stress|diet|sleep|sweat\\w*|food|dairy|sugar|sun|hormones?)\\b",
  "\\bky[uo]n(?:ki|ke)\\b",
  "\\bse ho (?:raha|rahi|rha|rhi)\\b",
  "\\bdue to\\b",
  "\\bcaus\\w*",
  "\\bleads? to\\b",
  "\\bled to\\b",
  "\\bresult(?:s|ed|ing)? (?:from|in)\\b",
  "\\btrigger\\w*",
  "\\bthe reason\\b",
  "\\breason (?:for|why)\\b",
  "\\bresponsible for\\b",
  "\\bis why\\b",
  "\\bcontribut\\w*",
  "\\bwajah\\b",
  "\\bvajah\\b",
  "\\bisliye\\b",
  // wave-2 security review
  "\\bfrom (?:the|your) (?:humidity|weather|heat|climate|pollution|water|diet|food|products?|routine|cream|stress|sleep|hormones?)\\b",
  "\\bowing to\\b",
  "\\ba result of\\b",
  "\\bke kaa?ran\\b",
  "\\bkyu+n?ki\\b",
  "\\bkyuki\\b",
]);

export const FORECAST = re([
  "\\bwill (?:\\w+ )?(?:improve|get|become|look|be|clear|see|fade|go|reduce|increase|change|stay|help|work|start|notice|settle)\\b",
  "\\byou'?ll (?:see|notice|get|have)\\b",
  "\\bgoing to\\b",
  "\\bexpect\\w*",
  "\\bsoon\\b",
  "\\bover time\\b",
  "\\bin (?:a|the) (?:few|couple|coming)\\b",
  "\\bwithin (?:a|\\w+) (?:days?|weeks?|months?)\\b",
  "\\b(?:next|coming) (?:weeks?|months?)\\b",
  "\\bfuture\\b",
  "\\bho jaa?(?:yega|egi|ega)\\b",
  "\\bhog[ai]\\b",
  "\\bjaldi\\b",
]);

export const CONFIDENCE = re([
  "\\bconfiden\\w*",
  "\\bcertain(?:ly)?\\b",
  "\\bdefinitely\\b",
  "\\b(?:i'?m|i am) sure\\b",
  "\\bsurely\\b",
  "\\bpakka\\b",
]);

export const PAST_EVENT = re([
  "\\blast (?:\\w+ )?(?:times?|weeks?|months?|years?|days?|scans?|checks?|visits?|photos?)\\b",
  "\\bprior\\b",
  "\\brecent(?:ly)?\\b",
  "\\bthe other day\\b",
  "\\ba while (?:back|ago)\\b",
  "\\bwhen you first\\b",
  "\\byou(?:'ve| have) (?:started|stopped|been|begun|switched|used)\\b",
  "\\bthis past\\b",
  "\\bkal\\b",
  "\\byesterday\\b",
  "\\bago\\b",
  "\\bprevious(?:ly)?\\b",
  "\\bearlier\\b",
  "\\bused to\\b",
  "\\byou (?:started|stopped|began|switched)\\b",
  "\\bsince you\\b",
  "\\bpich(?:h)?l[ie]\\b",
  "\\bpehle\\b",
  // wave-2 security review
  "\\blast (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|spoke|talked|chatted|saw|time we)\\b",
  "\\bwhen (?:we|you) last\\b",
  "\\b(?:january|february|april|june|july|august|september|october|november|december)\\b",
  "\\bmarch (?:check|scan|photo|reading)s?\\b",
]);

// Actives and named product categories (§2 item 3: no product outside rec.* facts).
export const ACTIVE = re([
  "\\bretinol\\w*",
  "\\bretinoids?\\b",
  "\\w*tretinoin\\b",
  "\\baccutane\\b",
  "\\bretinal\\b",
  "\\bhydroquinone\\b",
  "\\barbutin\\b",
  "\\bbakuchiol\\b",
  "\\bkojic\\b",
  "\\btranexamic\\b",
  "\\bclindamycin\\b",
  "\\bdoxycycline\\b",
  "\\bsteroid\\w*",
  "\\bhydrocortisone\\b",
  "\\badapalene\\b",
  "\\bniacinamide\\b",
  "\\bsalicylic\\b",
  "\\bglycolic\\b",
  "\\blactic acid\\b",
  "\\bmandelic\\b",
  "\\bazelaic\\b",
  "\\bbenzoyl\\b",
  "\\bhyaluronic\\b",
  "\\bceramides?\\b",
  "\\bpeptides?\\b",
  "\\baha\\b",
  "\\bbha\\b",
  "\\bvitamin [ace]\\b",
  "\\bacids?\\b",
]);

export const PRODUCT = re([
  ACTIVE.source,
  "\\bserums?\\b",
  "\\btoners?\\b",
  "\\bpeels?\\b",
  "\\bexfoliat\\w*",
  "\\bspf\\b",
  "\\bsunscreens?\\b",
  "\\bmoisturi[sz]er\\w*",
  "\\bcleansers?\\b",
  "\\bcreams?\\b",
  "\\b(?:i|we) (?:would |'d )?recommend\\b",
  "\\byou should (?:use|try|apply|start|add)\\b",
  "\\b(?:try|start) using\\b",
]);

export const MEASUREMENT = re([
  "\\b(?:scan|photo|image|picture|analysis|reading|check)s? (?:shows?|showed|found|finds|detected|says|indicates|measured|reveals?|revealed|picked up|captured)\\b",
  "\\bpicked up\\b",
  "\\bwe (?:can )?see\\b",
  "\\b(?:visible|seen|shown) (?:in|on) (?:your|the|this) (?:photo|scan|image|picture)\\b",
  "\\baccording to (?:your|the|this) (?:photo|scan|check|analysis|image)\\b",
  "\\brated\\b",
  "\\bmeasured\\b",
  "\\bdetected\\b",
  "\\byour (?:results?|readings?)\\b",
]);

// Outside text (catalog names and claims) that tries to talk to the model.
export const INSTRUCTION = re([
  "\\bignor\\w*",
  "\\binstruction\\w*",
  "\\bsystem prompt\\b",
  "\\byou are now\\b",
  "\\bdisregard\\w*",
  "\\bpretend\\w*",
  "\\brole\\b",
  "\\b(?:assistant|system|user|model)\\s*:",
  "\\bforget\\b",
  "\\boverrid\\w*",
  "\\bjailbreak\\w*",
  "\\bact as\\b",
  "\\becho\\s*:",
  "\\btell (?:the )?user\\b",
  "\\bfrom now on\\b",
  "\\bnew rules?\\b",
  "\\byou must\\b",
  "\\balways (?:say|tell|answer)\\b",
  "\\bguidance\\b",
  "\\bprompt\\b",
  "\\bdirections?\\b",
  "\\bsay\\b",
  "\\b(?:write|reply|respond|answer|speak|translate)\\b.{0,30}\\b(?:in|only|every|always|as)\\b",
  "(?:\\b\\w[.\\-_*]){3,}\\w\\b",
  // letters spaced out to dodge a word list: "i g n o r e"
  "(?:\\b\\w\\s){3,}\\w\\b",
]);

/** Our three bands, plus intensity words that would act as a band of Gemini's own. */
export const BAND_WORD = new RegExp(
  String.raw`\b(?:low|moderate|elevated|high|severe|mild|significant(?:ly)?|intense|strong|noticeable|extreme(?:ly)?|slight(?:ly)?|heavy|minimal|a lot of|lots of|bahut)\b`,
  "iu"
);

/** Metric words a claim may use, keyed by the package metric. */
export const METRIC_WORDS: Record<"redness" | "oiliness" | "texture" | "blemishes" | "pigment", RegExp> = {
  redness: new RegExp(String.raw`\bredness\b|\bred\b`, "iu"),
  oiliness: new RegExp(String.raw`\boil\w*|\bshine\b|\bshiny\b`, "iu"),
  texture: new RegExp(String.raw`\btexture\b`, "iu"),
  blemishes: new RegExp(String.raw`\bblemish\w*|\bbreakouts?\b|\bspots?\b`, "iu"),
  pigment: new RegExp(String.raw`\bpigment\w*|\bdark marks?\b`, "iu"),
};

export const UNMEASURED_WORDS = new RegExp(String.raw`\b(?:de)?hydrat\w*|\bdryness\b|\bmoisture\w*|\bpores?\b`, "iu");

/** §5 rule 4b: any letter outside the Latin script. */
export const NON_LATIN = new RegExp(String.raw`(?![\p{Script=Latin}])\p{L}`, "u");

/** A question about products or routine: the only case the recommendation section is sent (§3.3). */
export const PRODUCT_INTENT = re([
  "\\bproducts?\\b",
  "\\broutine\\b",
  "\\b(?:use|using|apply|buy)\\b",
  "\\brecommend\\w*",
  "\\bsuggest\\w*",
  "\\bcleansers?\\b",
  "\\bmoisturi[sz]er\\w*",
  "\\bsunscreens?\\b",
  "\\bserums?\\b",
  "\\bcreams?\\b",
  "\\bwhat should i\\b",
  "\\blaga\\w*",
]);

/** Band names only, for the catalog screen ("a mild face wash" is a fair product claim; "suits elevated redness" is not). */
export const BAND_NAME = new RegExp(String.raw`\b(?:low|moderate|elevated|high|severe)\b`, "iu");
