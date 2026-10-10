# DATA_MODEL — minimum credible persistent model

> **Amended (2026-10-03):** the `skinStates` collection below is replaced by gate 01's immutable `scanAnalyses` record plus the computed SkinState view in [SKIN_STATE_CONTRACT_FINAL.md](SKIN_STATE_CONTRACT_FINAL.md) (D-21, D-23). Read every `skinStates` reference in this file as `scanAnalyses` → `toSkinState()`.

Status: PLANNING.

**Decision:** stay on Firestore + private S3 (DECISION D-01). Every query is scoped to one user. A user has tens of records of about 10 KB each. Nothing in CORE needs a cross-user join. Postgres would add a second auth/rules model and a second erasure surface, and would answer no query we need.

## 1. Collections

All collections live under `users/{uid}/`. Client rules stay deny-by-default.

| Entity | Path | Writer | Mutability | Version keys | Tier |
|---|---|---|---|---|---|
| Profile | `users/{uid}` | client | mutable `{phoneNumber, lastSeenAt}`. **Add a rules field allowlist** | — | existing (fix) |
| Questionnaire / CaptureSession | `skinChecks/{scanId}` | client | create-only (existing). **Legacy `result` stays accepted indefinitely** as the fallback copy (D-03); readers prefer SkinState | `schemaVersion` (→2), `questionnaireVersion` (new), `answersReusedFrom` (new: source scanId or null) | CORE (modify) |
| Late questionnaire (TD-33) | `laterAnswers/{scanId}` | client, owner only | create-only; written once when a check whose `questionnaire` is `"skipped"` is answered later, so the check itself is never edited. Readers merge it over that check's answers (Echo's trusted loader, reuse, dashboard). `productNames` (≤200 chars each) is never sent to Gemini (docs/design/optional-questionnaire.md) | `questionnaireVersion` (2) | G15 |
| SkinState | `skinStates/{scanId}_{pipelineVersion}` | Admin SDK in `/api/skin-scan` | immutable `.create()` | `pipelineVersion`, `inputVariant`, `inputSha256`, `schemaVersion` | **CORE, P0** |
| Recommendation | `recommendations/{recommendationId}` | Admin SDK, at questionnaire save (server route), **not at scan time**: quiz answers do not exist yet when the scan runs | immutable | `rulesetVersion`, `catalogVersion`, `inputSha256` | CORE with C8 (product decision OPEN-R1) |
| Bands | not stored. Computed on read from SkinState + `SCORING_VERSION` | — | derived. Old threshold sets stay in a versioned code table, so any past version is reproducible exactly | `scoringVersion` | CORE (code) |
| Consent | `consents/{autoId}` | Admin SDK (upload route, chat-consent route) | append-only; withdrawal is a new doc | `purpose`, `version`, `copySha256` | CORE |
| ChatTurn | `chatTurns/{autoId}` | Admin SDK in chat route | append-only, `expireAt` TTL (90 days; Firestore deletes typically within 24 h after expiry) | `packageVersion`, `packageSha256`, `promptVersion`, `modelId`, `validator` | CORE with C9. It is **the only source of chat history**, so client-sent turns are ignored. If it ever stops being read back, downgrade it to a text-free log |
| Usage counter | `usage/{yyyy-mm-dd}` | Admin SDK (transaction) | mutable counter | — | CORE (rate limit) |
| Events (Routine / ProductUse / Context) | `events/{autoId}` with `type` discriminator | client, rules-validated create-only | append-only | `eventSchemaVersion` | **LATER** |
| UserAssertion | — | — | — | — | **LATER** |

How the research doc's entities fold into this:

| Research-doc entity | Here |
|---|---|
| EngineVersion | a string field on SkinState |
| Image | the S3 key on `skinChecks.image` |
| QualityReport | the `regionLowConfidence` field (separate block LATER) |
| Comparability | a code constant plus a pure function |
| TrendSummary / AdherenceSummary / current Routine | projections computed on read |
| Recommendation | its own immutable doc, written at questionnaire save |
| RuleSetVersion / ProductVersion / ClaimEvidence | the static `lib/catalog.ts` plus version constants in git |
| ProvenanceRecord | `source` and version fields on every doc |
| RedFlagEvent | `redFlags[]` on Recommendation and `redFlag` on ChatTurn |
| ContextPackage | a hash on ChatTurn, rebuilt deterministically |

## 2. Immutable vs derived

**Immutable (stored):**
- SkinState
- Recommendation
- Consent
- ChatTurn
- skinChecks

**Derived on read (pure functions, never stored unless measured to be slow):**
- comparability verdict
- trend status
- ContextPackage
- scan list summaries
- bands (from a `SCORING_VERSION`-keyed threshold table that keeps every past version)

## 3. How version changes affect history

| Change | Effect | Record behaviour |
|---|---|---|
| `PIPELINE_VERSION` bump (engine) | New comparability epoch for affected metrics | New SkinStates carry the new version. Old ones are untouched. Re-processing (if consented and possible) creates *additional* SkinStates |
| `SCORING_VERSION` bump (band cut points) | Bands change meaning | Add a new entry to the threshold table. Never edit an old entry. Any past display can be reproduced from SkinState + version |
| `RULESET_VERSION` / `CATALOG_VERSION` bump | Recommendation logic or products change | Recorded on each new Recommendation. Old recommendations remain as issued |
| CV image digest change without `PIPELINE_VERSION` bump | Silent engine drift | `engineBuild` is part of the comparability key, so drift breaks comparability instead of corrupting it |
| `questionnaireVersion` bump | Question set changes | Stored per skinChecks doc |
| Prompt / package version bump | Explanation wording changes | Stored per ChatTurn |
| Consent copy change | New consent version | New Consent docs required. The old version does not cover the new copy |

## 4. Write path and migration (production-safe ordering)

1. **Server write (additive; old bundles keep working).**
   - `/api/skin-scan` reads the verified uid. It accepts an optional `scanId` and mints one if absent. It writes SkinState through the Admin SDK.
   - On failure: retry once, then return the result with `persisted:false`. On a hash mismatch: write under a server-minted id. Never 409.
   - New collection rules: owner read, `write: if false`.
2. **Client update.**
   - Sends `scanId`; rotates it on retake.
   - Save gate (D4): `final_phone` is enabled only when `scan.status ∈ {success, error}` and `skin_photo` exists. On restore, clamp `sectionIndex` back to the photo step if the photo was dropped.
   - Stops writing the phone into `answers`; adds `questionnaireVersion` and `answersReusedFrom`.
3. **Readers switch** to SkinState joined to skinChecks (see the join rule in §4a).
   - With no SkinState, fall back to `skinChecks.result`, labelled `client-reported-legacy`, **only when `schemaVersion` is 1**.
   - For `schemaVersion ≥ 2` with no SkinState, the state is "measurement not persisted" and no measured facts are shown.
4. **Never add a rule rejecting `result` on create.**
   - Firestore rules apply globally and instantly.
   - Old bundles' fire-and-forget `setDoc` would fail silently, and the whole questionnaire would be lost (PhoneAuthStep.tsx:77,82-84).
   - Vercel Skew Protection cannot pin Firestore SDK writes.
   - The forged-score risk is handled by readers preferring SkinState, not by rejecting writes.

### 4a. Join rule
A skinChecks doc resolves to the SkinState with the latest `capturedAt` among states whose `scanId` or `requestedScanId` equals its scanId. This picks the retake, not the discarded first photo, when an old bundle reuses a scanId.

**Save race (D4) and retry (D5):** the measurement is written at scan time, keyed by scanId, independently of the questionnaire doc. A dashboard retry produces its own SkinState. Readers derive status from whether a SkinState exists.

## 5. Indexes and queries

| Query | Index |
|---|---|
| Latest N scans: `skinChecks orderBy createdAt desc` | single-field (existing) |
| Latest states: `skinStates orderBy capturedAt desc limit N` | single-field |
| Comparable states: `skinStates where pipelineVersion in [...] orderBy capturedAt desc` | composite (pipelineVersion ASC, capturedAt DESC) |
| Chat history for a scan: `chatTurns where scanId == x orderBy createdAt` | composite |

Optionally exempt `raw.*` from single-field indexing to cut write cost. Whether a map-field exemption covers subfields is an ASSUMPTION to verify.

## 6. Erasure (DPDP) and retention

**Route:** `POST /api/account/erase`. It verifies the token, requires a recent `auth_time`, then runs these steps in order. Each step is idempotent and retryable.
1. S3: list prefix `users/{uid}/` and delete it, including object versions if versioning is on.
2. Firestore: Admin `recursiveDelete(users/{uid})`.
3. Auth: `deleteUser(uid)`.
4. LATER: the Gemini side. With `store=false` / generateContent, no Google-side conversation state is kept beyond the 55-day abuse log, which we cannot delete. Disclose it.

**Immutability is a client-facing guarantee, not a retention promise.** Rules deny client edits. Erasure removes the whole subtree server-side. Records are never edited.

**Blockers:**
- The Vercel IAM user has PutObject only; the route needs ListBucket and DeleteObject.
- The bucket is not in IaC: versioning, lifecycle and Object Lock are unknown, and compliance-mode Object Lock would make erasure impossible.
- Firestore PITR/backup retention after a delete is unknown.

**Retention clocks:**
- ChatTurn TTL 90 days.
- Originals per the consent copy. Today's copy states no period, which is a legal open question.

## 7. Data that must stop being stored, or be minimised

| Data | Change |
|---|---|
| Phone number in every `skinChecks.answers` | Already on the Auth record and the profile. Stop copying it into answers for new docs |
| Originals | Contain full EXIF, possibly GPS (ASSUMPTION). Keep the original, since the locked decision says it is the dataset's primary asset. Add `scored.jpg` for exact replay. Strip GPS only (not all EXIF) needs an owner decision (D-11) |
| Shopify attribution | Never pass `scanId`. Use an opaque `recommendationId`, and never join purchases to scans |
| Quiz `name` | Never sent to Gemini |
