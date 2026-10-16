// D-12 word check (docs/lanes/routine-design.md §4). Used by the tests over
// routine copy, routine UI text and the catalogue's user-visible fields.
// TD-51 (owner 2026-10-15): "progress" and "twin" are allowed again
// ("Progress", "Skin Twin", the product name).
// Case-insensitive, whole word or whole phrase; an entry ending in "*" is a
// prefix. "before" and "since" alone are allowed on purpose (order
// instructions, "since <date>"); both stay banned inside their phrases below.
export const BANNED_WORDS: readonly string[] = [
  // GEMINI_BOUNDARY rule 4
  "improve*", "better", "worse", "lower", "higher", "less", "more than", "reduc*", "increas*", "fade*",
  "clear*", "calm*", "brighten*", "even out", "repair*", "restore*", "went down", "went up", "last time",
  "pehle", "kam", "zyada", "behtar", "accha hua",
  // rule 5
  "diagnos*", "cure*", "heal*", "treat*", "prescription", "guarantee*", "proven", "causes", "caused",
  "caused by", "acne", "eczema", "rosacea", "melasma", "psoriasis", "dermatitis",
  // routine-specific
  "works", "working", "results", "because of", "thanks to", "since you started", "before and after",
];

const PATTERNS = BANNED_WORDS.map((w) => {
  const prefix = w.endsWith("*");
  const body = (prefix ? w.slice(0, -1) : w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  return { word: w, re: new RegExp(`(?<![\\p{L}\\p{N}])${body}${prefix ? "" : "(?![\\p{L}\\p{N}])"}`, "iu") };
});

/** The banned entries found in `text`, empty when it is clean. */
export function bannedWordsIn(text: string): string[] {
  return PATTERNS.filter((p) => p.re.test(text)).map((p) => p.word);
}

/**
 * Owner decision TD-26 (1), 2026-10-06: the routine step label "Treat", the
 * store's own step name. Exact match on the whole label only; any other text
 * containing "treat" is still banned.
 */
export const STEP_LABEL_EXCEPTIONS: readonly string[] = ["Treat"];

export function stepLabelIsExcepted(text: string): boolean {
  return STEP_LABEL_EXCEPTIONS.includes(text);
}

/**
 * Owner decision TD-49, 2026-10-12: three Home labels, exact whole-label
 * match only. Any other text containing these words is still checked.
 */
export const LABEL_EXCEPTIONS: readonly string[] = ["Your progress", "Today's conditions", "View full results"];

export function labelIsExcepted(text: string): boolean {
  return LABEL_EXCEPTIONS.includes(text);
}

export type NameException = { name: string; approvedBy: "owner"; date: string; reason: string };

/** True only for an owner product whose whole name is listed exactly. */
export function nameIsExcepted(
  product: { name: string; dataSource: "synthetic" | "owner" },
  exceptions: readonly NameException[]
): boolean {
  return product.dataSource === "owner" && exceptions.some((e) => e.name === product.name);
}
