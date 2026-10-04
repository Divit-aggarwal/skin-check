// GEMINI_BOUNDARY §6 and §6b: deterministic pre-filters, run on the user's
// message before any package is built. A hit means a fixed answer and no
// Gemini call. EN, Hinglish and Devanagari; recall is favoured over precision.

import { normalizeForMatch } from "./lexicon";

const re = (parts: string[]) => new RegExp(parts.join("|"), "iu");

const RED_FLAG = re([
  // bleeding or changing moles, ABCDE terms
  "\\bmoles?\\b.{0,40}\\b(?:bleed\\w*|chang\\w*|grow\\w*|itch\\w*|darker|bigger|irregular|border|asymmetr\\w*)",
  "\\b(?:bleed\\w*|chang\\w*|grow\\w*|new)\\b.{0,30}\\bmoles?\\b",
  "\\bbleed\\w*",
  "\\bbled\\w*",
  "\\bbleding\\b",
  "\\bblood\\w*",
  "\\bkho+o?n\\b",
  "\\btil\\b.{0,30}\\b(?:khoon|khun|badh(?!iya)|badal)\\w*",
  // Devanagari patterns run on a copy with no nukta (DEVANAGARI below), so none is written here.
  "तिल.{0,30}(?:खून|बढ|बदल)",
  "खून",
  // painful, cystic or nodular lesions, scarring
  "\\bcyst\\w*",
  "\\bnodul\\w*",
  "\\bpain\\w*",
  "\\bhurt(?:s|ing)?\\b",
  "\\bsore\\b",
  "\\bboils?\\b",
  "\\bscarring\\b",
  "\\bdard\\b",
  "दर्द",
  // hot, swollen or spreading skin, fever
  "\\bswollen\\b",
  "\\bswell\\w*",
  "\\bspreading\\b",
  "\\bhot to (?:the )?touch\\b",
  "\\bfever\\w*",
  "\\bpus\\b",
  "\\booz\\w*",
  "\\bbukhaa?r\\b",
  "\\bso+jan\\b",
  "\\bsujan\\b",
  "\\bphail\\w*",
  "बुखार",
  "सूजन",
  // eye involvement
  "\\beye(?:s|lids?)?\\b.{0,30}\\b(?:swell\\w*|pain\\w*|hurt\\w*|red(?:ness|dish|den\\w*)?\\b|vision|blur\\w*|rash\\w*|itch\\w*|sting\\w*|burn\\w*)",
  "\\b(?:swollen|swell\\w*|pain\\w*|hurt\\w*|red|reddish|blur\\w*|itch\\w*|sting\\w*|burn\\w*|watery|sore)\\b.{0,30}\\beye(?:s|lids?)?\\b",
  "\\bvision\\b",
  "\\baa?nkh\\w*.{0,30}\\b(?:jalan|dard|sooj\\w*|suj\\w*|laal|lal|khujl\\w*|pani|paani|dhundh\\w*|chubh\\w*|infect\\w*|kharab|problem|chot|dikh\\w*|chala gaya|chali gayi|gir\\w*)",
  "\\b(?:jalan|dard|sooj\\w*|suj\\w*|laal|lal|khujl\\w*|dhundh\\w*|chubh\\w*)\\b.{0,30}\\baa?nkh\\w*",
  "(?:आंख|आँख)\\S*.{0,30}(?:जलन|दर्द|सूज|लाल|खुजली|पानी|धुंध)",
  "(?:जलन|दर्द|सूज|लाल|खुजली|धुंध).{0,30}(?:आंख|आँख)",
  // self-harm or severe distress
  "\\bkill\\s*(?:my\\W*self|me)\\b",
  "\\bunalive\\w*",
  // A distance ("5 kms daily") is not "kill myself"; the leet copy reads the 5 as "s", hence the second guard.
  "(?<!\\p{N}\\s?)\\bkms\\b(?!\\s*(?:daily|a day|every|per|away|from|run|walk|cycl\\w*)\\b)",
  "\\b(?:khud|apne aap|apne ap|sab|sabkuch|zindagi|zindgi|life|jaan)\\b(?: \\w+){0,2} khatam\\b",
  // Bare "khatam kar..." still hits, unless it is about a skin problem ("pimples khatam karne ke liye").
  "(?<!\\b(?:pimples?|acne|daane|dane|daag|dag|spots?|marks?|tan|oil|oiliness|blackheads?|whiteheads?|circles|redness|dandruff|scars?)(?: \\w+){0,2} )\\bkhatam kar\\w*",
  "\\bsuicid\\w*",
  "\\bself[- ]?harm\\w*",
  "\\bhurt(?:ing)? my ?self\\b",
  // Any "end my ..." except "the end, my ..." and a skincare noun ("end my routine with sunscreen").
  "(?<!\\bthe )\\bend(?:ing|ed|s)? (?:my (?!skin|face|routine|day|night|morning|evening|week|cleans\\w*|pimple\\w*|acne|regimen|steps?\\b)\\w+|myself|it all|everything)",
  "\\b(?:want|wanna|going|gonna|ready) (?:to )?end it\\b(?!\\s*(?:with|on|in|at|for|by|before|now that)\\b)",
  "\\bhang(?:ing)? my ?self\\b",
  "\\boverdos\\w*",
  "\\b(?:want|wanna|wish|rather) (?:to )?be dead\\b",
  "\\bjee?ne? ka (?:mann|man|dil) n",
  "\\bgoli(?:yan|yaan|an)?\\b.{0,20}\\bkha\\w*",
  "\\bneend ki goli\\w*",
  "\\bjaa?n de\\w*",
  "\\b(?:want|wanna|wanted|going) (?:to )?die\\b",
  "\\bwish (?:i|i'?d) (?:was|were|had) (?:dead|died|never been born)\\b",
  "\\bbetter off dead\\b",
  "\\bno (?:reason|point) (?:to|in) (?:live|living)\\b",
  "\\b(?:do ?n[o']?t|dont|never) (?:want|wanna) (?:to )?(?:live|be alive|wake up|exist)\\b",
  "\\bjee?na nahi\\b",
  "\\b(?:jee?na|jina) n(?:a|h)?h?i\\b",
  "\\bcut(?:ting)? my ?self\\b",
  "\\b(?:want|wanna|wanted) to disappear\\b",
  "\\bdisappear (?:forever|for good)\\b",
  "\\bmarne ka (?:mann|man|dil)\\b",
  "\\bkhud ?kh?ush?i\\b",
  "\\ba+tma?h?atya\\b",
  "\\bmar ?ja\\w*",
  "\\bmarna\\b",
  "\\bkhudkushi\\b",
  "आत्महत्या",
  "जीना नही",
  "मरना|मरने|मर जा|मार डाल",
  // pregnancy combined with actives
  "\\b(?:preg\\w*|breastfeed\\w*|nursing|garbh\\w*|expecting (?:a )?baby)\\b.{0,60}\\b(?:retin\\w*|\\w+retin\\w*|adapalene|accutane|acids?|actives?|aha|bha|vitamin|serum\\w*|use|using|apply\\w*|safe|ok|okay|routine|cream\\w*|niacinamide|salicylic|hydroquinone|fine|allowed|harmful|products?|lagana|laga)\\b",
  "\\b(?:retin\\w*|\\w+retin\\w*|adapalene|accutane|acids?|actives?|aha|bha|vitamin|serum\\w*|use|using|apply\\w*|safe|ok|okay|keep|routine|cream\\w*|niacinamide|salicylic|hydroquinone|fine|allowed|harmful|products?)\\b.{0,60}\\b(?:preg\\w*|breastfeed\\w*|nursing|garbh\\w*|expecting (?:a )?baby)",
  "गर्भ",
  // under 18 or "my child"
  "\\bmy (?:child|children|kid|kids|son|daughter|baby|toddler|teen\\w*)\\b",
  "\\bnew ?borns?\\b|\\binfants?\\b",
  "\\b(?:i'?m|i am|im)\\s+(?:1[0-7]|[1-9])\\b(?!\\s*(?:weeks?|wks?|days?|months?|mos?|hours?|hrs?|mins?|minutes?|times?|steps?|products?|%|x\\b|kgs?|kms?|litres?|liters?))",
  "\\b(?:1[0-7]|[1-9])[\\s-]*(?:years?|yrs?)[\\s-]*old\\b",
  "(?<!\\b(?:for|since|past|last|from|over|about|almost|nearly|around)\\s+)\\b(?:1[0-7]|[1-9])\\s*(?:yo|y/o|yrs?)\\b",
  "\\b(?:i'?m|i am|im)\\s+(?:ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)\\b",
  "\\bunder\\s*(?:18|eighteen)\\b",
  "\\b(?:i'?m|i am|im|am) (?:a |still a )?minor\\b",
  "\\bas a minor\\b",
  "\\bminor here\\b",
  "\\b(?:have|got|running|with|has) (?:a )?(?:high |slight )?temperature\\b",
  "\\bmer[aie] (?:bet[aie]|bachch?[ae]|bacch?[ae])\\b",
  "\\b(?:1[0-7]|[1-9]) ?saal\\b(?! se\\b)",
  "\\bumr?a?r? (?:1[0-7]|[1-9])\\b",
  // requests for a diagnosis, prescription or dosage
  "\\bdiagnos\\w*",
  "\\bprescri\\w*",
  "\\bdos(?:e|age|ages)\\b",
  "\\b(?:mg|milligrams?)\\b",
  "\\bantibiotic\\w*",
  "\\b\\w*retinoin\\b",
  "\\b(?:adapalene|accutane|isotretinoin|tretinoin|clindamycin|doxycycline|spironolactone)\\b",
  "\\bmedicines?\\b",
  "\\bmedication\\w*",
  "\\bdo i have (?:\\w+ ){0,2}(?:acne|rosacea|eczema|psoriasis|melasma|infection|cancer|melanoma|disease|condition|fungal|allerg\\w*|dermatitis|hives|pcos)\\b",
  "\\b(?:tablets?|pills?)\\b",
  "\\b(?:what|which) (?:disease|condition|infection)\\b",
  "\\b(?:is|could|might|can|do|does|am|are)\\s+(?:it|this|that|these|those|they|i|my \\w+|this \\w+|the \\w+)\\s+(?:\\w+\\s+){0,2}(?:cancer\\w*|melanoma|rosacea|eczema|psoriasis|infect\\w*|fungal|melasma|dermatitis|hives|allerg\\w*|pcos)\\b",
  "\\bit'?s (?:\\w+ ){0,2}(?:cancer\\w*|melanoma|rosacea|eczema|psoriasis|infect\\w*|fungal|melasma|dermatitis|hives|allerg\\w*|pcos)\\b",
  "\\b(?:skin cancer|melanoma|infected)\\b",
  "\\bbimaa?ri\\b",
  "\\bdawa\\w*",
  "दवा|बीमारी",
]);

const COMPARISON = re([
  "\\bbetter\\b",
  "\\bworse\\w*",
  "\\bimprov\\w*",
  "\\blast time\\b",
  "\\bbefore\\b",
  "\\bsince\\b",
  "\\bprogress\\w*",
  "\\bchang\\w*",
  "\\bcompar\\w*",
  "\\b(?:is it|is this|it'?s|its|is (?:the|my) \\w+) working\\b",
  "\\bworking\\?",
  "\\bpehle\\b",
  "\\bkam (?:hua|hui|ho)\\w*",
  "\\bzy?aa?da\\b",
  "\\bbehtar\\b",
  "\\bacc?ha hua\\b",
  "\\bkaam kar (?:raha|rahi|rha|rhi)\\b",
  "पहले|बेहतर|सुधार",
  // wave-2 security review
  "\\bdid (?:it|this|that|the \\w+) (?:work|help)\\b",
  "\\b(?:has|have|is|did) (?:my |the )?\\w+ (?:dropped|gone down|gone up|reduced|increased|faded|cleared)\\b",
  "\\bfa?rak\\b",
  "\\bdifference\\b",
]);

// Lookalike letters from Cyrillic and Greek that read as Latin (security review, wave 2).
const CONFUSABLE: Record<string, string> = {
  "а": "a", "в": "b", "е": "e", "ё": "e", "к": "k", "м": "m", "н": "h", "о": "o", "р": "p", "с": "c", "т": "t", "у": "y", "х": "x",
  "і": "i", "ї": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "ԛ": "q", "ԝ": "w", "ɡ": "g", "ı": "i", "ɑ": "a", "µ": "u", "μ": "u",
  "α": "a", "β": "b", "ε": "e", "η": "n", "ι": "i", "κ": "k", "ν": "v", "ο": "o", "ρ": "p", "τ": "t", "υ": "u", "χ": "x",
};
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "$": "s", "@": "a", "!": "i", "|": "l" };
const DEVANAGARI_DIGIT = /[\u0966-\u096F]/g;
// Hangul fillers count as letters but show nothing (second security review, H20).
const HANGUL_FILLERS = "\u115F\u1160\u3164\uFFA0";

/**
 * The copy the Devanagari patterns run on (H20): normalizeForMatch removes every
 * combining mark, which in Devanagari is every vowel sign, so they cannot run on
 * the folded copy. Here only format characters (ZWJ, ZWNJ) and the nukta go:
 * NFC leaves "ख़" decomposed, so with the nukta removed it reads as "ख".
 */
const devanagari = (message: string) => message.normalize("NFC").replace(new RegExp(String.raw`[\p{Cf}${HANGUL_FILLERS}\u093C]`, "gu"), "");

// Curly apostrophes (iOS default), doubled spaces and folded forms must not
// slip a message past the patterns (security re-check, finding 9). Wave 2:
// format characters (zero-width, soft hyphen) are removed, lookalike letters
// mapped, Devanagari digits read as digits, and line breaks are spaces.
const fold = (message: string) =>
  normalizeForMatch(
    message
      .normalize("NFKC")
      .replace(new RegExp(String.raw`[\p{Cf}${HANGUL_FILLERS}]`, "gu"), "")
      .toLowerCase()
      .replace(new RegExp(".", "gu"), (c) => CONFUSABLE[c] ?? c)
      .replace(DEVANAGARI_DIGIT, (d) => String(d.charCodeAt(0) - 0x0966))
  );
/** Leetspeak read as letters (a separate copy, so "I'm 16" still reads as an age). */
const unleet = (folded: string) => folded.replace(/[013457$@!|]/g, (c) => LEET[c]!);
/** Every non-letter removed: catches spaced letters, emoji or line breaks inside a word, and run-together phrases. */
const squash = (folded: string) => unleet(folded).replace(new RegExp(String.raw`[^\p{L}]`, "gu"), "");

// Self-harm words that are one word: matched on the squashed copy, typos included.
const SELF_HARM_WORD = new RegExp(
  ["su+i?c+i?d", "sucid", "suicd", "suisid", "selfharm", "unaliv", "khudk?h?ush?i", "a+tma?h?atya"].join("|"),
  "u"
);
// Self-harm phrases: matched on a word-spaced copy (non-letters become spaces, so
// emoji or line breaks between words do not hide them, but "skill myself" or
// "diet" do not match), and on the squashed copy only when letters are spaced out.
const SELF_HARM_PHRASE = [
  "kil+ ?my ?self", "kil+ ?me", "end ?my ?(?:life|self)", "end ?it ?all", "(?:want|wanna|wanted|going) ?(?:to )?die",
  "cut(?:ting)? ?my ?self", "hurt(?:ing)? ?my ?self", "better ?off ?dead", "(?:jee?na|jina) ?n(?:a|h)?h?i", "marne ?ka ?ma", "hang ?my ?self",
];
const PHRASE_SPACED = new RegExp(SELF_HARM_PHRASE.map((p) => String.raw`\b(?:${p})\b`).join("|"), "u");
const PHRASE_SQUASHED = SELF_HARM_PHRASE.map((p) => new RegExp(p.replace(/ \?/g, "").replace(/ /g, ""), "uy"));
/** Non-letters as single spaces, so words keep their boundaries. */
const spaced = (folded: string) => unleet(folded).replace(new RegExp(String.raw`[^\p{L}]+`, "gu"), " ");
/**
 * A phrase with its letters spaced out or run together ("k i l l m y s e l f",
 * "wanttodie"), matched on the squashed copy but only from the start of a word
 * to the end of a word, so "I'm a student ... diet" or "skill myself" never
 * match (H20: replaces the any-three-single-letters switch).
 */
function squashedPhraseHit(folded: string): boolean {
  const words = spaced(folded).trim().split(" ").filter(Boolean);
  const starts: number[] = [];
  const ends = new Set<number>();
  let text = "";
  for (const w of words) {
    starts.push(text.length);
    text += w;
    ends.add(text.length);
  }
  return starts.some((at) =>
    PHRASE_SQUASHED.some((re) => {
      re.lastIndex = at;
      const m = re.exec(text);
      return m !== null && ends.has(at + m[0].length);
    })
  );
}
// A Greek or Cyrillic letter left after mapping is a disguise, not a language this product serves.
// One carve-out (H20): a Greek letter used as a chemistry prefix, as in "γ-oryzanol".
const OTHER_SCRIPT_LOOKALIKE = new RegExp(String.raw`[\p{Script=Cyrillic}\p{Script=Greek}]`, "u");
const GREEK_PREFIX = new RegExp(String.raw`(?<!\p{L})\p{Script=Greek}(?=-\p{L})`, "gu");
// A Latin-script letter that is not plain a-z after folding (small capitals "ꜱᴜɪᴄɪᴅᴇ") is a disguise too (H20).
const LATIN_LOOKALIKE = new RegExp(String.raw`(?![a-z])\p{Script=Latin}`, "u");
// Other Indian scripts (Tamil, Bengali, ...) are not referred: they are real users' languages (tracker row).

export const redFlagHit = (message: string): boolean => {
  const folded = fold(message);
  return (
    RED_FLAG.test(folded) ||
    RED_FLAG.test(unleet(folded)) ||
    RED_FLAG.test(devanagari(message)) ||
    SELF_HARM_WORD.test(squash(folded)) ||
    PHRASE_SPACED.test(spaced(folded)) ||
    squashedPhraseHit(folded) ||
    OTHER_SCRIPT_LOOKALIKE.test(folded.replace(GREEK_PREFIX, "")) ||
    LATIN_LOOKALIKE.test(folded)
  );
};
/**
 * Every user turn of `history` and the new message, as one text for the
 * pre-filter. Pass exactly the turns Gemini will receive, so the check and
 * Gemini see the same window (H20). A split with filler turns in between
 * ("i want to" / "ok" / "die") still passes: a known limit (tracker F07).
 */
export const joinedUserTurns = (history: readonly { role: string; text: string }[], message: string): string =>
  [...history.filter((t) => t.role === "user").map((t) => t.text), message].join(" ");

/**
 * Today's Echo: the client's signed history without referred exchanges (a
 * user turn answered with REFERRAL_COPY, and that answer), so a red-flag
 * message never reaches Gemini on a later turn either (GEMINI_BOUNDARY §6;
 * found while fixing H20). The context path's stored history already leaves
 * them out (chat-turns.ts historyExcluded).
 */
export function withoutReferrals<T extends { role: string; text: string }>(history: readonly T[]): T[] {
  return history.filter((t, i) => t.text !== REFERRAL_COPY && !(t.role === "user" && history[i + 1]?.text === REFERRAL_COPY));
}

export const comparisonHit = (message: string): boolean => COMPARISON.test(fold(message)) || COMPARISON.test(message);

// No helpline number until one is verified (GEMINI_BOUNDARY §6).
export const REFERRAL_COPY =
  "This is something a doctor or dermatologist should look at in person, so Echo can't answer it here. " +
  "If you feel unsafe or might hurt yourself, please contact your local emergency services or someone you trust right now.";

export const COMPARISON_LEAD = "Each check reads one photo on its own, so we can't compare checks yet. Here is what this check showed:";
