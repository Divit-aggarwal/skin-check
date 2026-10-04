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
  "\\btil\\b.{0,30}\\b(?:khoon|khun|badh|badal)\\w*",
  "तिल.{0,30}(?:खून|बढ़|बदल)",
  "खून",
  // painful, cystic or nodular lesions, scarring
  "\\bcyst\\w*",
  "\\bnodul\\w*",
  "\\bpain\\w*",
  "\\bhurts?\\b",
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
  "\\beye(?:s|lids?)?\\b.{0,30}\\b(?:swell\\w*|pain\\w*|hurt\\w*|red\\w*|vision|blur\\w*|rash\\w*|itch\\w*|sting\\w*|burn\\w*)",
  "\\bvision\\b",
  "\\baa?nkh\\w*",
  "आंख|आँख",
  // self-harm or severe distress
  "\\bkill\\s*(?:my\\W*self|me)\\b",
  "\\bunalive\\w*",
  "\\bkms\\b",
  "\\bkhatam kar\\w*",
  "\\bsuicid\\w*",
  "\\bself[- ]?harm\\w*",
  "\\bhurt(?:ing)? my ?self\\b",
  "\\bend (?:my|it all)\\b",
  "\\b(?:want|wanna|wanted|going) (?:to )?die\\b",
  "\\bwish (?:i|i'?d) (?:was|were|had) (?:dead|died|never been born)\\b",
  "\\bbetter off dead\\b",
  "\\bno (?:reason|point) (?:to|in) (?:live|living)\\b",
  "\\bdon'?t want to (?:live|be alive)\\b",
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
  "जीना नहीं",
  // pregnancy combined with actives
  "\\b(?:preg\\w*|breastfeed\\w*|nursing|garbh\\w*|expecting (?:a )?baby)\\b.{0,60}\\b(?:retin\\w*|\\w+retin\\w*|adapalene|accutane|acids?|actives?|aha|bha|vitamin|serum\\w*|use|using|apply\\w*|safe|ok|okay|routine|cream\\w*|niacinamide|salicylic|products?|lagana|laga)\\b",
  "\\b(?:retin\\w*|\\w+retin\\w*|adapalene|accutane|acids?|actives?|aha|bha|vitamin|serum\\w*|use|using|apply\\w*|safe|ok|okay|keep|routine|cream\\w*|niacinamide|salicylic|products?)\\b.{0,60}\\b(?:preg\\w*|breastfeed\\w*|nursing|garbh\\w*|expecting (?:a )?baby)",
  "गर्भ",
  // under 18 or "my child"
  "\\bmy (?:child|children|kid|kids|son|daughter|baby|toddler|teen\\w*)\\b",
  "\\b(?:i'?m|i am|im)\\s+(?:1[0-7]|[1-9])\\b",
  "\\b(?:1[0-7]|[1-9])\\s*(?:years?|yrs?)\\s*old\\b",
  "\\b(?:1[0-7]|[1-9])\\s*(?:yo|y/o|yrs?)\\b",
  "\\b(?:i'?m|i am|im)\\s+(?:ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)\\b",
  "\\bunder\\s*(?:18|eighteen)\\b",
  "\\bminor\\b",
  "\\bmer[aie] (?:bet[aie]|bachch?[ae]|bacch?[ae])\\b",
  "\\b(?:1[0-7]|[1-9]) ?saal\\b",
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
  "\\bdo i have\\b",
  "\\b(?:tablets?|pills?)\\b",
  "\\b(?:what|which) (?:disease|condition|infection)\\b",
  "\\b(?:is|could|might|do|does|am|are|it'?s)\\b.{0,30}\\b(?:cancer\\w*|melanoma|rosacea|eczema|psoriasis|infect\\w*|fungal|melasma|dermatitis|hives|allerg\\w*|pcos)\\b",
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
  "і": "i", "ї": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "ԛ": "q", "ԝ": "w", "ɡ": "g", "ı": "i", "ɑ": "a",
  "α": "a", "β": "b", "ε": "e", "η": "n", "ι": "i", "κ": "k", "ν": "v", "ο": "o", "ρ": "p", "τ": "t", "υ": "u", "χ": "x",
};
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "$": "s", "@": "a", "!": "i", "|": "l" };
const DEVANAGARI_DIGIT = /[\u0966-\u096F]/g;

// Curly apostrophes (iOS default), doubled spaces and folded forms must not
// slip a message past the patterns (security re-check, finding 9). Wave 2:
// format characters (zero-width, soft hyphen) are removed, lookalike letters
// mapped, Devanagari digits read as digits, and line breaks are spaces.
const fold = (message: string) =>
  normalizeForMatch(
    message
      .normalize("NFKC")
      .replace(new RegExp(String.raw`\p{Cf}`, "gu"), "")
      .toLowerCase()
      .replace(new RegExp(".", "gu"), (c) => CONFUSABLE[c] ?? c)
      .replace(DEVANAGARI_DIGIT, (d) => String(d.charCodeAt(0) - 0x0966))
  );
/** Leetspeak read as letters (a separate copy, so "I'm 16" still reads as an age). */
const unleet = (folded: string) => folded.replace(/[013457$@!|]/g, (c) => LEET[c]!);
/** Every non-letter removed: catches spaced letters, emoji or line breaks inside a word, and run-together phrases. */
const squash = (folded: string) => unleet(folded).replace(new RegExp(String.raw`[^\p{L}]`, "gu"), "");

// Self-harm stems matched against the squashed copy, typos included. Recall first.
const SELF_HARM_SQUASHED = new RegExp(
  [
    "su+i?c+i?d", "sucid", "suicd", "suisid", "killmy?self", "kilmy?self", "killme(?:now|plz|please)?$", "endmylife", "endmyself", "endital",
    "(?:want|wanna|wanted|going)(?:to)?die", "cutmy?self", "hurtmy?self", "selfharm", "unaliv", "betteroffdead",
    "khudk?h?ush?i", "a+tma?h?atya", "(?:jee?na|jina)n(?:a|h)?h?i", "marnekam", "आत्महत्या", "जीनानहीं",
  ].join("|"),
  "u"
);
const OTHER_SCRIPT_LOOKALIKE = new RegExp(String.raw`[\p{Script=Cyrillic}\p{Script=Greek}]`, "u");

export const redFlagHit = (message: string): boolean => {
  const folded = fold(message);
  return (
    RED_FLAG.test(folded) ||
    RED_FLAG.test(unleet(folded)) ||
    RED_FLAG.test(message) ||
    SELF_HARM_SQUASHED.test(squash(folded)) ||
    // A Cyrillic or Greek letter left after mapping is a disguise, not a language this product serves.
    OTHER_SCRIPT_LOOKALIKE.test(folded)
  );
};
/** The last few user turns and the new message, as one text for the pre-filter. */
export const joinedUserTurns = (history: readonly { role: string; text: string }[], message: string): string =>
  [...history.filter((t) => t.role === "user").slice(-3).map((t) => t.text), message].join(" ");

export const comparisonHit = (message: string): boolean => COMPARISON.test(fold(message)) || COMPARISON.test(message);

// No helpline number until one is verified (GEMINI_BOUNDARY §6).
export const REFERRAL_COPY =
  "This is something a doctor or dermatologist should look at in person, so Echo can't answer it here. " +
  "If you feel unsafe or might hurt yourself, please contact your local emergency services or someone you trust right now.";

export const COMPARISON_LEAD = "Each check reads one photo on its own, so we can't compare checks yet. Here is what this check showed:";
