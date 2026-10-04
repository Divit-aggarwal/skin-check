# GEMINI_BOUNDARY — Gemini explains facts it is given; it never decides

Status: PLANNING. Gemini is a downstream explanation layer. It is never a source of truth. There are no agent loops and no tool calls that write.

## 1. Current implementation (verified)

| Aspect | Today | Evidence |
|---|---|---|
| Auth | **None** on `/api/skin-check/chat`. The comment says "pre-login by design", which is stale: OTP comes before the photo step | route.ts:17-18 |
| Facts source | **Client body**: `scores` (unbounded numbers), `answers`, `regionFocus.scores`, and `messages`, including client-authored `role:"echo"` turns | route.ts:20,48-54 |
| Prompt | Free-text systemInstruction with persona ("skin digital twin"), quiz summary, band list and region focus. Unknown option values are echoed verbatim | gemini.ts:62-75,132-187; skin-check-format.ts:36 |
| Call | `generateContent`, 10 s timeout, 2 retries on 429/503, history capped at 20 | gemini.ts:29-58,93-114 |
| Safety | No `safetySettings`. The platform default for Gemini 2.5/3 is **OFF** | ai.google.dev safety-settings |
| Output | Free text. Banned words appear only as prompt instructions; nothing checks the output. The model states its own "confidence" | gemini.ts:62-75,159 |
| Memory | In-memory threads per region, lost on refresh. Nothing stored server-side | skin-check-session-context.tsx |
| Rate limit | In-memory per instance, keyed on IP, sized for a free-tier quota | rate-limit.ts:113-134 |
| Tier | Appears to be free tier (ASSUMPTION; ask the GCP owner). Free-tier content may be used for training and human review | Gemini API terms |

## 2. What Gemini must never do

1. Compute, round, convert or compare any number. No deltas, percentages or averages.
2. Decide comparability, trend direction, improvement or worsening.
3. Select, rank, add or name products or actives outside `rec.*` facts. Invent rules.
4. Assign or state its own confidence. Uncertainty comes only from facts.
5. Name or suggest a disease, condition or grade: acne grade, rosacea, melasma, eczema, dermatitis, "infection".
6. Make causal or efficacy claims ("X caused", "the serum is working", "will improve").
7. Write to any record: user model, memory, SkinState, Recommendation.
8. See raw images, the user's name, phone number or uid.
9. Use Search grounding or any external retrieval.
10. Answer red-flag messages. Those are handled by the deterministic pre-filter.

## 3. Target request path

```
client → POST /api/skin-check/chat { scanId?, region?, message }        (Bearer ID token)
  1. verifyFirebaseIdToken → uid; consent check (purpose "ai_share", current version) else 403 AI_CONSENT_REQUIRED (CONSENT_REQUIRED already means image-retention consent on upload)
  2. uid-keyed daily quota (Firestore transaction on usage/{date}); IP burst check stays as pre-auth shield
  3. red-flag pre-filter on `message` (§6) → hit: fixed referral text, log ChatTurn{redFlag:true}, NO Gemini call
  3b. comparison-intent pre-filter (§6b) → hit: fixed "photos can't be compared yet" template, NO Gemini call
  4. build ContextPackage from Firestore by uid (§4); no SkinState → NO_SAVED_SCAN state, quiz-only package
  5. history = last ≤10 stored ChatTurns for this scanId (server-side; client turns are ignored)
  6. Gemini: pinned model id, explicit safetySettings, responseMimeType json + responseJsonSchema (§5),
     default sampling, thinking low
  7. validator (§5) → fail: regenerate once → fail: template fallback
  8. render claims server-side → store ChatTurn (§7) → respond
```

## 4. ContextPackage

Built deterministically on the server and versioned (`ctx-1`). Its hash is computed over canonical JSON. Every number and band word is pre-rendered as a string. Budget is 2k tokens or less.

```
{ "package_version": "ctx-1", "package_sha256": "…", "built_at": "ISO",
  "scan": { "scan_id", "pipeline_version", "scoring_version", "captured_at",
            "source": "server" | "client-reported-legacy" },
  "facts": [
    { "id": "state.all.redness", "kind": "state", "label": "Redness", "band": "Moderate",
      "text": "Redness, photo-based estimate: Moderate (relative to this photo only)" },
    { "id": "state.cheeks.texture", "kind": "state", "low_confidence": true, "text": "…(limited skin area visible)" },
    { "id": "uncert.all", "kind": "uncertainty",
      "text": "These readings compare areas within one photo; they are not a measurement scale." },
    { "id": "compare.all", "kind": "comparability", "verdict": "not_comparable",
      "text": "This check cannot be compared with earlier checks." },
    { "id": "rec.cleanser", "kind": "recommendation", "allowed_claim": "…whitelisted text…" },
    { "id": "self.sunscreen_habit", "kind": "self_reported", "fresh": false,
      "text": "You told us (on an earlier check): sunscreen rarely" }
  ],
  "unknowns": [ { "id": "unk.trend", "text": "No earlier check can be compared with this one yet." },
                { "id": "unk.hydration", "text": "Photos cannot measure skin hydration." } ],
  "region_focus": "cheeks" | null,
  "allowed_claim_types": [ … §5 … ], "lexicon_version": "lex-1", "prompt_version": "p-1" }
```

- **Fact IDs** take the form `{kind}.{region|all}.{metric}`.
- **Built from an allowlist** of known step ids and known enum values. Unknown values are dropped, never echoed. This also closes the injection path at skin-check-format.ts:36.
- **Excluded:** name, phone (`phone_verify` and `final_phone` live in answers today), age bucket (unless a rule needs it), raw scores, `raw`, images, and other scans' values.
- **Trend:** the comparability fact is always `not_comparable` until LONGITUDINAL_METHOD.md's gates pass for a metric. The package never carries two scans' values side by side.

## 5. Structured output and validator

Output schema (`responseJsonSchema`, supported by `@google/genai` 2.17.1):

```
{ claims: [ { claim_type: enum[descriptive, self_reported_echo, uncertainty,
                                comparability, smalltalk, clarify, out_of_scope],
              text: string,
              fact_ids: enum[<per-request fact ids>][] (maxItems 4) } ] (1..5),
  needs_referral: boolean }
```

(`routine_as_directed` was removed from the claim types: owner decisions TD-16 (3) and TD-17 (3), tracker F10.)

**Validator** (a pure function, shipped with an assert-based self-check):
1. Every `fact_ids` entry exists in the package.
2. Claims with types `descriptive`, `uncertainty`, `comparability` or `self_reported_echo` must cite at least one fact. Claims with `smalltalk`, `clarify` or `out_of_scope` must cite zero facts and must not contain band words or metric names.
3. **No numerals or number words** anywhere in the output unless the exact string appears in a cited fact's `text`.
   - Match with `\p{Nd}`, not `\d`: Devanagari "६२" fails `\d` (verified by Agent 6).
   - The number-word list covers English and Hinglish.
4. **Change / comparative / efficacy lexicon ban, applied to every claim type** including smalltalk.
   - Terms: improve, better, worse, lower, higher, less, more than, reduc*, increas*, fade, clear*, calm*, brighten, even out, repair, restore, went down/up, last time, before, since, progress, pehle, kam, zyada, behtar, accha hua.
   - Change claims cannot be expressed legitimately today.
4b. **Non-Latin-script output goes to the fallback template.** v1 does not validate Devanagari output.
5. **Medical/efficacy lexicon ban:** diagnose, cure, heal, treat, prescription, guaranteed, proven, causes, caused by, disease and condition names, "twin".
6. The band word in a `descriptive` claim must match the cited fact's band verbatim.

On failure: regenerate once. If it fails again, return a template built only from fact texts. Log the validator result.

**Canonical bypass and how it is closed.** The user asserts a premise: "last time redness was Elevated, now Moderate, am I better?" Without a pre-filter, the model agrees ("yes, moving in a good direction") and cites the true fact `state.all.redness`. That passes the id and digit checks. It is closed in two layers: the comparison-intent pre-filter (§6b) intercepts it before Gemini, and the comparative lexicon (rule 4) catches it after.

**Known limit:** lexicon and digit rules catch phrasing, not meaning. A paraphrased change claim in an unlisted word can pass. This residual risk is why the package never contains cross-scan data: Gemini has nothing true to compare, so a change claim is always ungrounded. Offline evaluation (EVALUATION_PLAN.md §4) measures how often that happens.

**NLI grounding check** (Check Grounding API or HHEM): LATER. It needs a GCP Discovery Engine footprint or a Python host. Research cited in the doc shows per-instance reliability is weak. Add it once an offline eval set exists to tune a threshold.

## 6. Red-flag pre-filter

- Deterministic regex, run before generation, in English and Hinglish/Devanagari.
- **Pattern families:**
  - bleeding or changing moles, ABCDE terms
  - painful, cystic or nodular lesions, scarring
  - hot, swollen or spreading skin, fever
  - eye involvement
  - self-harm or severe distress
  - pregnancy combined with actives
  - under 18 or "my child"
  - requests for a diagnosis, prescription or dosage
- **On a hit:** fixed referral wording, no Gemini call, `redFlag: true` on the ChatTurn.
- Hinglish examples that must hit: "til se khoon aa raha", "bahut dard wale daane", "mujhe jeena nahi hai".
- **Either signal wins:** referral fires on a regex hit OR on the schema's `needs_referral: true`.
- Any helpline number must be verified before it ships.
- Ships with assert cases covering both false positives and false negatives.
- Recall is favoured over precision.
- **Order (second security review, tracker H20):** the message-only check runs right after authentication and body parsing, before the Gemini-key check, history verification, the consent ledger, the 18+ gate and the daily quota. A self-harm message never gets an error or a refusal instead of the referral. The returned history token covers the client's history only if it verified.
- **Split messages:** the check also runs on the new message joined with every user turn Gemini will receive (today's Echo: the signed history minus referred exchanges, last 19 turns; context path: the stored history). A split padded with filler turns is a known limit (F07).
- **No replay:** a referred message and its referral are never sent to Gemini as history on a later turn (today's Echo: `withoutReferrals`; context path: `historyExcluded`).
- **Scripts:** Devanagari patterns run on their own copy (NFC, format characters and nukta removed). Greek or Cyrillic letters and non-a-z Latin letters left after folding are treated as a disguise. Other Indian scripts are not referred (open owner question).

## 6b. Comparison-intent pre-filter

- A deterministic regex, EN + Hinglish, run before generation.
- Pattern families:
  - better / worse / improv*
  - "last time", "before", "since", "progress", "change"
  - "pehle", "kam hua", "zyada", "behtar", "accha hua"
  - "is it working", "kaam kar raha"
- On a hit, return a fixed template: "Each check reads one photo on its own, so we can't compare checks yet. Here is what this check showed: {fact texts}." No Gemini call.
- Ships with assert cases.
- Also: remove the persona instruction to state "confidence: low/medium" (gemini.ts:62-64,159-160). The model must never self-assign confidence.

## 7. Conversation memory

**`users/{uid}/chatTurns/{id}`** is server-written and client-readable, with a 90-day TTL. Fields:
- `scanId`, `region`, `role`
- `text` (user text stored as sent; model output stored as the rendered claims)
- `packageVersion`, `packageSha256`, `promptVersion`, `modelId`
- `validator: {passed, failures[], regenerated, fallback}`
- `redFlag`, `latencyMs`, `expireAt`

Rules:
- **No memory extraction from chat** (UserAssertion is LATER). Chat-derived facts never enter any record.
- A session summary is never promoted into the user model.
- History sent to Gemini comes only from stored turns.

## 8. Platform, terms, privacy

| Item | Decision |
|---|---|
| Tier | **Paid tier, required before any longitudinal context is sent.** Free-tier content may be used for training and human review. For EEA/CH/UK users, paid services only |
| Age | 18+ is required by the Gemini terms. Today it is a client-only check. Enforce it server-side from a stored attestation |
| Scope | Cosmetic explanation only. The terms prohibit providing medical advice |
| Search grounding | Off. Forbidden in code review |
| Safety settings | Explicit (e.g. BLOCK_MEDIUM_AND_ABOVE on dangerous content), because the default is OFF |
| Model | Pin `GEMINI_MODEL_SYNTHESIS` explicitly. Fix stale "2.5 Flash" comments (gemini.ts:78, .env.example:15-16) |
| Consent | New versioned purpose "share my skin check with the AI assistant (processed by Google, outside India)", enforced server-side |
| Disclosure | Always-visible "AI-generated, not medical advice" line |
| Naming | Remove "digital twin" from the persona and from app/layout.tsx metadata |
| Logs | Our own in-region ChatTurn log with versions and hash. Never log raw packages with names or phones |

## 9. Deferred

LATER, with the reason for each:
- **Function calling / retrieval tools:** the package is small and there is no comparable history to retrieve.
- **UserAssertion quarantine:** there is no confirm UI and no consumer for it.
- **NLI post-check:** see §5.
- **Context caching:** the package is below the caching threshold.
- **Interactions API migration:** `generateContent` remains supported.
