import { ACTIVE, FORECAST, PAST_EVENT, normalizeForMatch } from "@/lib/context/lexicon";
import { redFlagHit } from "@/lib/context/prefilter";

// Red team (2026-10-04, tracker I02, areas B and E): today's Echo returned
// Gemini's text unchecked, so a made-up number, a made-up past event or
// change, a cure or cause claim, a product push or a reply that endorsed
// self-harm reached the user, and was then signed into the history. This
// screen runs on every reply before it is shown or signed. It is narrower
// than the context path's validator (free text here, structured claims
// there): it blocks what cannot be true of one photo read as bands, and what
// the persona already forbids. PROVISIONAL word lists (tracker F07 measures
// the fallback rate; clinical sign-off with E05).

const re = (parts: string[]) => new RegExp(parts.join("|"), "iu");

const CHECKS: [string, RegExp][] = [
  // Bands only: the reply never has a number of its own.
  ["number", re(["\\p{N}", "%", "\\bper ?cent\\w*", "\\bpoints?\\b"])],
  // One photo: no change, comparison or trend.
  [
    "change",
    re([
      "\\bimprov\\w*", "\\bworse\\w*", "\\bbetter than\\b", "\\b(?:got|getting|is|are|looks?|much|has|have) better\\b",
      "\\b(?:went|gone|go|going) (?:down|up)\\b", "\\bdrop(?:s|ped|ping)?\\b", "\\bincreas\\w*", "\\bdecreas\\w*", "\\breduced\\b",
      "\\bprogress\\w*", "\\bcompared? (?:to|with)\\b", "\\btrend\\w*", "\\bfad(?:ed|ing)\\b", "\\bcleared up\\b", "\\bsince your\\b",
      "\\b(?:kam|zy?aa?da|behtar) (?:hua|hui|ho)\\w*", "\\bpehle se\\b",
      // Final-review recheck (I02): change in ordinary wording.
      "\\b(?:lower|higher|less|more|calmer|clearer|smoother|brighter|lighter|darker|redder|oilier|drier|better|worse)\\s+(?:\\w+\\s+)?(?:than|now)\\b",
      "\\b(?:has|have|had|is|are|looks?|seems?)\\s+(?:\\w+\\s+)?(?:eased|lessened|calmed(?: down)?|cleared(?: up)?|settled|subsided|clearer|calmer)\\b",
      "\\b(?:is|are)\\s+(?:now\\s+)?(?:down|up)\\b",
      "\\bthan before\\b",
      "\\bbetter hu(?:i|a|e)\\b",
      // A band from another time ("Moderate, down from Elevated") and more change wording (recheck).
      "\\b(?:from|was|were|used to be)\\s+(?:low|moderate|elevated)\\b",
      "\\b(?:come|toned|calmed|settled|died|cooled) down\\b",
      "\\bmilder\\b", "\\bhealthier\\b", "\\bab kam\\b", "\\bkam (?:hai|ho) gay\\w*",
    ]),
  ],
  ["past_event", PAST_EVENT],
  ["forecast", FORECAST],
  // Medical and efficacy claims, and naming a condition (the persona's banned words and more).
  [
    "medical",
    re([
      "\\bdiagnos\\w*", "\\bcur(?:e|es|ed|ing)\\b", "\\bheal(?:s|ed|ing)?\\b", "\\bprescri\\w*", "\\bguarantee\\w*", "\\bproven\\b",
      "\\bclinical(?:ly)?\\b", "\\bmedicines?\\b", "\\bmedications?\\b", "\\bdos(?:e|age)s?\\b", "\\bmg\\b",
      "\\brosacea\\b", "\\bmelasma\\b", "\\beczema\\b", "\\bdermatitis\\b", "\\bpsoriasis\\b", "\\binfect\\w*", "\\bfungal\\b",
      "\\bmelanoma\\b", "\\bcancer\\w*", "\\bpcos\\b", "\\bhives\\b", "\\ballerg\\w*", "\\bvitiligo\\b",
    ]),
  ],
  ["cause", re(["\\bcaus\\w*", "\\bdue to\\b", "\\bthanks to\\b", "\\bresult(?:s|ed)? (?:from|in)\\b", "\\bled to\\b", "\\bleads? to\\b", "\\bresponsible for\\b"])],
  // TD-17 (1), H19: no active ingredient for anyone, and no product push.
  // Final review (I02 H1): the lists below are English and Hinglish, so a reply in
  // another script cannot be checked and is not shown (the persona asks for Latin letters).
  ["script", new RegExp(String.raw`(?![a-zA-Z])\p{L}`, "u")],
  // Red team pass 2 (I02 P2-1): never a link, a sign-in, a code or a phone request.
  ["link", re(["https?:", "www\\.", "\\b\\w+\\.(?:com|in|org|net|io|app)\\b", "\\b\\w+\\s+dot\\s+(?:com|in|org|net|io|app|example)\\b", "\\bsign (?:in|up)\\b", "\\blog ?in\\b", "\\botp\\b", "\\bpassword\\b", "\\bphone number\\b", "\\bbit\\.ly\\b", "\\bt\\.me\\b", "\\b[a-z0-9-]+\\.[a-z]{2,6}/\\S", "\\b(?:verification |one[- ]time |otp )?code (?:you|we) (?:just )?(?:got|received|sent)\\b", "\\bwhats ?app\\b"])],
  ["product", re([ACTIVE.source, "\\brecommend\\w*", "\\byou should (?:use|try|apply|start|add|buy)\\b", "\\b(?:try|start) using\\b", "\\bbuy\\b"])],
];

export type EchoReplyVerdict = { kind: "ok" } | { kind: "referral" } | { kind: "blocked"; check: string };

export function screenEchoReply(reply: string): EchoReplyVerdict {
  const text = normalizeForMatch(reply);
  for (const [check, pattern] of CHECKS) if (pattern.test(text)) return { kind: "blocked", check };
  // What is left that still reads as self-harm or another red flag gets the referral, never the text.
  if (redFlagHit(reply)) return { kind: "referral" };
  return { kind: "ok" };
}

