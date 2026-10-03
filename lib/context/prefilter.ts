// GEMINI_BOUNDARY §6 and §6b: deterministic pre-filters, run on the user's
// message before any package is built. A hit means a fixed answer and no
// Gemini call. EN, Hinglish and Devanagari; recall is favoured over precision.

const re = (parts: string[]) => new RegExp(parts.join("|"), "iu");

const RED_FLAG = re([
  // bleeding or changing moles, ABCDE terms
  "\\bmoles?\\b.{0,40}\\b(?:bleed\\w*|chang\\w*|grow\\w*|itch\\w*|darker|bigger|irregular|border|asymmetr\\w*)",
  "\\b(?:bleed\\w*|chang\\w*|grow\\w*|new)\\b.{0,30}\\bmoles?\\b",
  "\\bbleed\\w*",
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
  "\\bwant to die\\b",
  "\\bdon'?t want to (?:live|be alive)\\b",
  "\\bjeena nahi\\b",
  "\\bmar ?ja\\w*",
  "\\bmarna\\b",
  "\\bkhudkushi\\b",
  "आत्महत्या",
  "जीना नहीं",
  // pregnancy combined with actives
  "\\b(?:pregnan\\w*|breastfeed\\w*|nursing|garbh\\w*|expecting (?:a )?baby)\\b.{0,60}\\b(?:retin\\w*|acids?|actives?|aha|bha|vitamin|serum\\w*|use|using|apply\\w*|safe|ok|okay|routine|cream\\w*|niacinamide|salicylic|products?|lagana|laga)\\b",
  "\\b(?:retin\\w*|acids?|actives?|aha|bha|vitamin|serum\\w*|use|using|apply\\w*|safe|ok|okay|routine|cream\\w*|niacinamide|salicylic|products?)\\b.{0,60}\\b(?:pregnan\\w*|breastfeed\\w*|nursing|garbh\\w*|expecting (?:a )?baby)",
  "गर्भ",
  // under 18 or "my child"
  "\\bmy (?:child|children|kid|kids|son|daughter|baby|toddler|teen\\w*)\\b",
  "\\b(?:i'?m|i am|im)\\s+(?:1[0-7]|[1-9])\\b",
  "\\b(?:1[0-7]|[1-9])\\s*(?:years?|yrs?)\\s*old\\b",
  "\\b(?:1[0-7]|[1-9])\\s*(?:yo|y/o|yrs?)\\b",
  "\\b(?:i'?m|i am|im)\\s+(?:ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)\\b",
  "\\bunder\\s*(?:18|eighteen)\\b",
  "\\bminor\\b",
  "\\bmer[ie] (?:bet[aie]|bachch?[ae]|bacch?[ae])\\b",
  // requests for a diagnosis, prescription or dosage
  "\\bdiagnos\\w*",
  "\\bprescri\\w*",
  "\\bdos(?:e|age|ages)\\b",
  "\\b(?:mg|milligrams?)\\b",
  "\\bantibiotic\\w*",
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
]);

export const redFlagHit = (message: string): boolean => RED_FLAG.test(message);
export const comparisonHit = (message: string): boolean => COMPARISON.test(message);

// No helpline number until one is verified (GEMINI_BOUNDARY §6).
export const REFERRAL_COPY =
  "This is something a doctor or dermatologist should look at in person, so Echo can't answer it here. " +
  "If you feel unsafe or might hurt yourself, please contact your local emergency services or someone you trust right now.";

export const COMPARISON_LEAD = "Each check reads one photo on its own, so we can't compare checks yet. Here is what this check showed:";
