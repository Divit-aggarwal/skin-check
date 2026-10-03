// Word lists shared by the validator (docs/lanes/context-design.md §3.6), the
// build-time screen of outside text (§3.3) and the pre-filters (§6, §6b).
// EN and Hinglish. Recall over precision: these catch phrasing, not meaning
// (GEMINI_BOUNDARY §5 "Known limit").
//
// Every pattern is case-insensitive and Unicode-aware. `firstMatch` returns
// the matched term so a failure can name it and the user-premise test
// (§3.7) can look for it in the user's message.

const re = (parts: string[]) => new RegExp(parts.join("|"), "iu");

export function firstMatch(pattern: RegExp, text: string): string | null {
  return pattern.exec(text)?.[0] ?? null;
}

// §5 rule 3. "do" (two) is left out: it is also an English verb.
export const NUMBER = re([
  "\\p{Nd}",
  "%",
  "\\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|half|double|twice|dozen|percent|percentage)\\b",
  "\\b(?:ek|teen|char|chaar|paanch|panch|chhe|chhah|saat|aath|nau|das|bees|pachaas|sau|hazaar|hazar|aadha|dugna)\\b",
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
  "\\bacne vulgaris\\b",
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
  "\\bbecause of\\b",
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
  "\\blast (?:time|week|month|year|scan|check|visit|photo)\\b",
  "\\byesterday\\b",
  "\\bago\\b",
  "\\bprevious(?:ly)?\\b",
  "\\bearlier\\b",
  "\\bused to\\b",
  "\\byou (?:started|stopped|began|switched)\\b",
  "\\bsince you\\b",
  "\\bpich(?:h)?l[ie]\\b",
  "\\bpehle\\b",
]);

// Actives and named product categories (§2 item 3: no product outside rec.* facts).
export const ACTIVE = re([
  "\\bretinol\\w*",
  "\\bretinoids?\\b",
  "\\btretinoin\\b",
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
  "\\b(?:scan|photo|image|picture|analysis|reading)s? (?:shows?|showed|found|detected|says|indicates|measured)\\b",
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
]);

export const BAND_WORD = new RegExp(String.raw`\b(?:low|moderate|elevated|high|severe|mild)\b`, "iu");

/** Metric words a claim may use, keyed by the package metric. */
export const METRIC_WORDS: Record<"redness" | "oiliness" | "texture" | "blemishes" | "pigment", RegExp> = {
  redness: new RegExp(String.raw`\bredness\b|\bred\b`, "iu"),
  oiliness: new RegExp(String.raw`\boil\w*|\bshine\b|\bshiny\b`, "iu"),
  texture: new RegExp(String.raw`\btexture\b`, "iu"),
  blemishes: new RegExp(String.raw`\bblemish\w*|\bbreakouts?\b|\bspots?\b`, "iu"),
  pigment: new RegExp(String.raw`\bpigment\w*|\bdark marks?\b`, "iu"),
};

export const UNMEASURED_WORDS = new RegExp(String.raw`\bhydrat\w*|\bdryness\b|\bmoisture\b|\bpores?\b`, "iu");

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
