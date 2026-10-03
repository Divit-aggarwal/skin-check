# SYSTEM_MODEL: target architecture on the live system

**Status:** PLANNING. No code has changed. Date: 2026-10-03. Revision 2, after the red-team review (Agent 6).

**Inputs:**
- The code in both repos: `skin-check` on `firebase-phone-auth`, `skin-scan` on `prod-hardening`.
- `docs/Longitudinal skin platform architecture.md` (referred to below as "the research doc").
- Six agent reports.

Evidence lives in CURRENT_SYSTEM_AUDIT.md. Rationale lives in DECISION_LOG.md.

## 1. The model in one paragraph

The product is a per-user, append-only record of scan measurements with provenance. Each record is written by the server, carries engine identity, and is never mutated. It is shown honestly as a reading of one photo until a measured noise floor shows that a specific quantity can be compared over time.

The existing CV engine stays. Three things are wrapped around it:
1. **A persistence correction.** Store what the engine already returns, written by the server and never mutated. The client copy is a fallback for `schemaVersion: 1` legacy records only. New server requirements degrade; they never reject (D-03a).
2. **A measurement gate.** No change claims until a test–retest study passes for a given quantity.
3. **A narrowed explanation layer.** Gemini receives a server-built fact package and can only cite it. Comparison questions never reach Gemini.

Recommendations remain a deterministic pure function, re-keyed from image bands to quiz answers plus safety constraints.

```
PHONE ─ capture ─ consents: processing (NEW: versioned + stored) · retention · AI-share (NEW)
  │
  ├─(retention)─▶ POST /api/skin-scan/upload ─ presign ─▶ S3 users/{uid}/scans/{scanId}/original.jpg   (as today)
  │               NEW: + scored.jpg (the exact 1280px bytes sent to CV; EXIF-free) → exact replay
  │               NEW: admin-write consents/{id} (retention) at presign time
  ▼
POST /api/skin-scan  (Vercel; verifyIdToken → uid)
  │  NEW: optional scanId field (server mints one if absent); X-Request-ID; inputSha256
  ▼
skin-scan /scan on ECS — engine UNCHANGED (scan-0.1.5-provisional)
  │  NEW (small, non-scoring): return request id + image digest/git SHA
  ▼
/api/skin-scan after zod:
  ├─ NEW: admin .create() skinStates/{scanId}_{pipelineVersion}  (allowlisted ~10 KB, provenance)
  │        retry once; on failure → still return result with persisted:false (never fail the scan)
  │        hash mismatch on existing id → write under server-minted suffix (never 409)
  └─ returns result (as today)
  ▼
CLIENT: dashboard (band; NEW: no "/100", within-photo wording, "photos can't be compared yet")
CLIENT: skinChecks/{scanId} create-only (as today, INCLUDING legacy `result` — kept as fallback;
        NEW: questionnaireVersion, answersReusedFrom, no phone in answers)
  ▼
POST /api/skin-check/chat  (NEW: verifyIdToken + AI-share consent; client sends {scanId, region, message})
  1 red-flag filter (EN + Hinglish regex)          → fixed referral, no Gemini
  2 comparison-intent filter ("better/last time/kam…") → fixed "can't compare yet" template, no Gemini
  3 ContextPackage from Firestore by uid (allowlisted fields; latest scan only)
  4 history from stored chatTurns (client turns ignored)
  5 Gemini (billed key, explicit safety, JSON schema w/ fact-id enum) → validator → fallback template
  6 store chatTurn (TTL) — it IS the history source
```

## 2. Trust zones

| Zone | Contents | Writer | Shown as |
|---|---|---|---|
| Measured (server, immutable) | skinStates, consents, chatTurns | Route handlers through the Admin SDK. Client rules are `write: if false` | "From your photo", with a proxy label |
| Self-reported (client, create-only) | skinChecks (answers, consent snapshot, legacy `result`), profile | Client SDK under rules | "You told us", plus a reused/fresh flag |
| Derived (pure functions, not stored) | Bands (`SCORING_VERSION`-keyed threshold table kept in code), comparability verdicts, ContextPackage, scan list | Computed on read | Labels. Change appears only when the gates pass |
| Generated | Gemini text | Gemini → validator | Explanation citing fact ids |

**Rules:**
- Generated output is never read back as input.
- Client `result` is used only for `schemaVersion: 1` docs with no SkinState, and is then labelled `client-reported-legacy`. For newer docs, a missing SkinState means "measurement not persisted".

## 3. What the system says, by evidence state

| Evidence state | Today (all metrics) | When it changes |
|---|---|---|
| Single-photo reading | A band, worded as a within-photo distribution, labelled "photo-based estimate". **No "/100" number** (needs product approval; it reverses the 2026-09-02 decision; D-06) | — |
| Change between two scans | **Never shown.** All 7 scores are `image_relative`. Comparison questions in Echo get a fixed template | Pairwise: \|Δ\| > MDC95 for a quantity that passed the study. Both scans must share the same (pipelineVersion, image digest, captureMethod, inputVariant) and pass quality checks |
| Pattern over time | Never | Research-dependent. Users scan rarely and under informative sampling, so a 10-point persistence rule will almost never be reached (LONGITUDINAL_METHOD.md §4) |
| Product association / efficacy | Never | Not approved (CLAUDE.md) |
| Forecast | Never | Not approved (CLAUDE.md) |

## 4. Components

| # | Component | Tier |
|---|---|---|
| C1 | Capture (existing) + client capture-quality gate | Gate is LATER (needs study data for thresholds) |
| C2 | Server-written SkinState: allowlisted full output plus provenance (pipelineVersion, image digest, captureMethod, device family, inputVariant, inputSha256, requestId); failure-tolerant | **CORE, P0** |
| C3 | Recommendation record: written server-side when the questionnaire is saved, with C8 | CORE-with-C8 (not at scan time) |
| C4 | Consent ledger: processing (newly versioned; covers storing measurements), retention, AI-share; server-written | CORE |
| C5 | Questionnaire record: as today, plus `questionnaireVersion`, `answersReusedFrom`, re-confirm of `female_skin_context` / `current_products`, phone removed from answers, save-gate fix | CORE |
| C6 | Comparability table in code (empty today) | CORE (a constant) |
| C7 | Pairwise change computed on read | Gated on C13 |
| C8 | Recommendation: pure TS over quiz answers plus red flags, static versioned catalog | CORE once the product decision is made (OPEN-R1) |
| C9 | Echo: auth, ContextPackage, red-flag and comparison-intent pre-filters, schema, validator, fallback | CORE |
| C10 | chatTurns: the sole source of chat history, 90-day TTL | CORE (with C9) |
| C11 | User-level erasure (S3 → Firestore → Auth) | CORE; blocked on IAM and bucket config |
| C11a | Scored-bytes retention (`scored.jpg`, exact replay) | CORE; **needs approval** (D-11) |
| C12 | Correlation id plus image digest from CV | CORE (small) |
| C13 | Test–retest study and noise tables | RESEARCH (gates C7) |
| C14 | Engine changes: L/R cheek split, eyebrow subtraction, face-only gray-world, beard flag, `stats=both` native stats | **Needs explicit approval** (CLAUDE.md) |
| C15 | Display-side removal of hydration ("Dryness") and pores | CORE (frontend only, not an engine change) |
| C16 | Routine / ProductUse / Context events, UserAssertion, NLI check, function calling | LATER |

## 5. Not built

- forecasting
- causal or efficacy attribution
- agent loops
- "digital twin" naming
- ML ranking
- collaborative filtering
- percentiles / "skin age"
- face matching
- a rules engine (DMN)
- Postgres
- Step Functions / EventBridge
- Tier 3/4 evidence tiers
- joining purchases to scans (Shopify links use an opaque `recommendationId`)

## 6. Preconditions (release gates, all read-only checks)

1. The Gemini API key is billed (paid tier).
2. The firebase-admin service account has a Firestore write role.
3. Bucket config has been read: versioning, Object Lock, lifecycle (`aws s3api get-bucket-versioning`, `get-object-lock-configuration`).
4. The Vercel function region and the cross-border data paths are documented in consent copy. **Assumption:** the default region is outside India.

## 7. Conflicts with the research doc

See DECISION_LOG.md §B. In summary:
- **Stack:** the doc assumes a different stack.
- **Engine:** the doc says to keep the engine and add noise tables. That is insufficient, because the scores themselves are image-relative.
- **Hydration and pores:** remove them; don't relabel.
- **Evidence tiers:** tiers 3 and 4 are rejected.
- **Persistence:** the ≥10-point persistence approach is mostly unreachable for this product.
- **Misquoted citations:** GAGS cheeks; Ouyang reliability vs validity; the doc's own ICC targets.
- **Entities:** 22 entities in the doc vs 6 stored collections here (skinChecks, skinStates, recommendations, consents, chatTurns, usage).
- **Images:** the doc says "EXIF to sidecar, landmarks never persisted, crops not full frames". Full-frame originals conflict with the locked decision to keep the original as the dataset's primary asset (D-11).
