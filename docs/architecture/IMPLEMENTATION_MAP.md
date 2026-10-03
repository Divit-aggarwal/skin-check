# IMPLEMENTATION_MAP

Status: PLANNING. Nothing in this map has been implemented.

Every architectural component maps to: **CURRENT → REQUIRED CHANGE → NEW COMPONENT → DEPENDENCIES → OWNER → TESTS → OPEN QUESTIONS**.

**Owner roles.** No people are named, because the repo doesn't identify them:

| Role | Covers |
|---|---|
| **FE** | skin-check engineer |
| **CV** | skin-scan engineer |
| **INFRA** | AWS / Vercel / Firebase console |
| **PRODUCT** | Founder |
| **LEGAL** | Privacy and claims review |
| **RESEARCH** | Study lead |
| **DERM** | Dermatologist partners |

Approval markers:
- **⚠ APPROVAL** means the item touches the engine, a locked decision, or a CLAUDE.md restriction.
- **⛔ BLOCKED** means it waits on a precondition.

---

## Phase 0: release gates (read-only checks; no code)

| Gate | Check | Owner | Why it blocks |
|---|---|---|---|
| G1 | The Gemini API key is billed (paid tier) | INFRA / PRODUCT | Unpaid-tier content may be used for product improvement and human review. Must hold before any stored history goes to Gemini (C9) |
| G2 | firebase-admin service account has a Firestore write role | INFRA | C2, C4, C10 depend on it |
| G3 | Originals bucket: versioning, Object Lock, lifecycle (`aws s3api get-bucket-versioning`, `get-object-lock-configuration`) | INFRA | Compliance-mode Object Lock makes erasure impossible (C11) |
| G4 | Vercel function region and every cross-border path (Vercel, Google) are documented | INFRA / LEGAL | Consent copy (C4) must name them |

---

## Phase 1: stop losing data (P0; no user-visible change)

### C2 Server-written SkinState
- **CURRENT**
  - The client writes `result` into `skinChecks` (lib/firebase/skin-checks.ts:31-41,125).
  - The allowlist drops `region_raw`, `region_hist`, the bin edges, and `*_corrected`.
  - `/api/skin-scan` discards the verified uid (route.ts:84-87).
  - The rules don't validate `result`.
- **REQUIRED CHANGE**
  - `/api/skin-scan` accepts an optional `scanId` form field and validates it with `isValidScanId`. If absent, it mints one.
  - It computes `inputSha256` and generates a `requestId`, which is forwarded as `X-Request-ID`.
  - After zod passes, it writes via the Admin SDK `.create()`.
  - Retry once. On failure, return the result with `persisted:false`.
  - On a hash mismatch, write under a server-minted id. Never return 409.
  - The client `result` write stays as-is, forever (D-03).
- **NEW COMPONENT**
  - `adminDb()` in lib/firebase/admin.ts.
  - `buildSkinState(result, meta)`: a pure allowlist builder. It never writes `overlays`, and moves unknown or nested-array fields into `extraJson`.
  - A rules block `match /skinStates/{id}`: owner `get, list`; `write: if false`.
- **DEPENDENCIES**
  - G2.
  - SKIN_STATE_CONTRACT.md.
  - `engineBuild` from C12. Write null until C12 lands.
- **OWNER**: FE
- **TESTS**
  - Builder: overlays are excluded; output is under 1 MiB; nested arrays end up in `extraJson`; field names are explicit `_corrected`.
  - Route: same hash returns the stored doc; a different hash mints an id and stores `requestedScanId`; a missing scanId mints an id; an Admin failure still returns the result with `persisted:false`.
  - Join rule: after an old-bundle retake (same scanId, new photo), the questionnaire resolves to the retake's state.
  - A `schemaVersion ≥ 2` doc with no SkinState yields no measured facts.
  - Rules tests: the client cannot write `skinStates`. Run these in CI with the emulator.
- **OPEN QUESTIONS**
  - Does an index exemption on the `raw` map cover its subfields?
  - Measured latency of the Admin write plus the firebase-admin cold start.

### C5a Save gate and draft-restore clamp (D4) plus retake scanId rotation (D6)
- **CURRENT**
  - `final_phone` is guarded only against `loading` (PhoneAuthStep.tsx:141).
  - Restore keeps the section index past the photo step after dropping `skin_photo` (useSkinCheckFlow.ts:187-192,234).
  - `handleRetake` keeps the same scanId (PhotoCapture.tsx:207).
- **REQUIRED CHANGE**
  - Enable the save only when `scan.status ∈ {success, error}` and `answers.skin_photo === "done"`.
  - On restore, clamp to the photo step if the photo was dropped.
  - Rotate the scanId on retake.
- **NEW COMPONENT**: none
- **DEPENDENCIES**: none. Ship independently; this is the smallest P0.
- **OWNER**: FE
- **TESTS**
  - Flow tests: the save is disabled for each of `idle`, `loading`, and a missing photo.
  - Restore after a mid-analysis reload lands on the photo step.
  - A retake produces a new scanId.
- **OPEN QUESTIONS**: none

### C4 Consent ledger (server-written)
- **CURRENT**
  - Retention consent is embedded per scan, and only once the questionnaire is saved.
  - Processing consent is never stored and has no version (PhotoCapture.tsx:119).
  - The original can land in S3 before any record exists (upload/route.ts:60-80).
- **REQUIRED CHANGE**
  - Version the processing-consent copy. It must cover storing measurements at scan time, which C2 introduces.
  - Write a consent doc at presign time (retention) and at scan time (processing).
  - Add `x-amz-meta-consent-version` to the presigned PUT.
- **NEW COMPONENT**
  - `users/{uid}/consents/{id}` with `{purpose, version, copySha256, createdAt (server)}`.
  - A `PROCESSING_CONSENT_VERSION` constant in lib/consent.ts.
- **DEPENDENCIES**: G2, G4, LEGAL copy.
- **OWNER**: FE + LEGAL
- **TESTS**
  - The upload route writes the consent doc before returning the URL.
  - The scan route **still returns the result** without a processing-consent version, but skips the SkinState write (`persisted:false, reason:"consent_missing"`; D-03a).
  - The client cannot write to `consents`.
- **OPEN QUESTIONS**
  - Retention period for originals. The current copy states none.
  - Withdrawal UX.

### C12 Correlation id plus engine build identity
- **CURRENT**
  - The CV service generates `scan_id` (main.py:239) but doesn't return it.
  - The frontend sends no request id.
  - `PIPELINE_VERSION` is a hand-edited string.
  - The CloudWatch alarms have no actions.
- **REQUIRED CHANGE**
  - CV: accept `X-Request-ID`; return it and an `engine_build` (image tag or git SHA from the task env, set via Terraform) in the `/scan` response.
  - INFRA: add SNS `alarm_actions`.
- **NEW COMPONENT**: response fields `request_id` and `engine_build`, with no scoring change.
- **DEPENDENCIES**: ⚠ APPROVAL (it touches the engine's response contract, though not the scoring). A `PIPELINE_VERSION` bump is required, since the payload shape changes.
- **OWNER**: CV + INFRA
- **TESTS**
  - pytest: the response carries both fields.
  - Zod schema updated to accept them.
- **OPEN QUESTIONS**: should `engine_build` be the image digest or the git SHA? Prefer the digest.

### C11a Scored-bytes retention (D-11)
- **CURRENT**: only the verbatim original is stored. It cannot reproduce scores (D7).
- **REQUIRED CHANGE**
  - Under retention consent, also PUT `scored.jpg` (the exact bytes sent to CV).
  - Add a second presign key in `lib/s3-key.ts`.
  - Rules: the image-key check allows the two known keys.
- **NEW COMPONENT**: `scoredImageKey(uid, scanId)`
- **DEPENDENCIES**: ⚠ APPROVAL (amends the locked decision "processed variant NOT stored"); LEGAL (does the consent copy cover it?); IAM policy expanded to the new key pattern.
- **OWNER**: FE + INFRA
- **TESTS**: s3-key tests; upload route ownership tests for both keys.
- **OPEN QUESTIONS**: strip GPS from the original (owner/legal)?

---

## Phase 2: honest display and safe inputs (user-visible, small)

### C15 Display truthfulness
- **CURRENT**
  - The dashboard shows `{score}/100` and bands for 6 metrics, including "Dryness" (SkinCheckDashboard.tsx:237,256).
  - Pores are already hidden.
  - "Digital twin" appears in app/layout.tsx:23,26,35.
- **REQUIRED CHANGE**
  - Hide hydration ("Dryness"). Relabel oiliness as "Shine". Label each metric "photo-based estimate".
  - Add the permanent line "Photos can't be compared with each other yet".
  - Remove "digital twin" from metadata.
  - **⚠ APPROVAL (D-06):** remove the `/100` number and use within-photo wording.
- **NEW COMPONENT**: none
- **DEPENDENCIES**: PRODUCT decision on D-06.
- **OWNER**: FE + PRODUCT
- **TESTS**: a snapshot or unit test that no metric renders a number; that hydration is absent; that the label is present.
- **OPEN QUESTIONS**: copy testing. Do users understand "within this photo"?

### C5b Questionnaire record hygiene
- **CURRENT**
  - Every answer except phone_verify / skin_photo / final_phone is silently copied from the latest scan (useSkinCheckFlow.ts:238-250).
  - The phone number is stored in every `answers` map.
  - There is no questionnaire version.
  - The 18+ check is client-only (:364).
  - `users/{uid}` rules allow writing any field (firestore.rules:14).
- **REQUIRED CHANGE**
  - Add `female_skin_context` and `current_products` to the per-scan set, as a one-tap "still true?" confirmation.
  - Stop writing phone values into `answers`.
  - Add `questionnaireVersion` and `answersReusedFrom` (schemaVersion 2).
  - Record an 18+ attestation server-side.
  - The chat route checks it, but only after the attestation UI has shipped.
  - The scan route never rejects on it (D-03a); a missing attestation is collected on the next visit.
  - Add a field allowlist to the profile rules.
- **NEW COMPONENT**: `QUESTIONNAIRE_VERSION` constant.
- **DEPENDENCIES**: none
- **OWNER**: FE
- **TESTS**
  - reusable-answers tests updated.
  - Rules test: the profile rejects unknown fields.
  - The chat route rejects a user with no 18+ attestation.
  - The scan route does not reject.
- **OPEN QUESTIONS**: should the "still true?" confirmation expire after N days instead of appearing on every scan?

---

## Phase 3: Echo grounded and constrained

### C9 ContextPackage, pre-filters, schema, validator
- **CURRENT**: the chat route has no auth. The client supplies scores, answers and history, including forged `echo` turns. The prompt is free text, there are no safety settings (the default is OFF), and nothing validates the output. The persona tells the model to state its own confidence. Unknown answer values are echoed verbatim into the prompt (lib/gemini.ts; route.ts; skin-check-format.ts:36).
- **REQUIRED CHANGE**: the route takes `{scanId?, region?, message}` with a bearer token and the AI-share consent, and applies a uid-keyed quota. The server builds the package from Firestore from allowlisted fields of the latest scan only. Then, in order:
  1. Red-flag pre-filter, English and Hinglish. A schema `needs_referral` result also triggers it.
  2. Comparison-intent pre-filter, English and Hinglish, which returns a fixed template.
  3. Gemini with a pinned model, explicit `safetySettings`, and a `responseJsonSchema` whose fact ids are an enum.
  4. Validator: `\p{Nd}` digit check, a comparative and efficacy lexicon applied to every claim type, ids must exist, band word must match verbatim, non-Latin script goes to the fallback.
  5. Regenerate once, then fall back to the template.

  Also remove the persona's "confidence" instruction and the "digital twin" self-description. EchoPage reads from the server, not the in-memory session.
- **NEW COMPONENT**: `lib/context-package.ts` (pure builder plus canonical hash), `lib/echo-validator.ts` (pure, with an assert self-check), `lib/echo-prefilters.ts` (red-flag and comparison-intent regexes with assert cases), and a Firestore `usage/{date}` counter.
- **DEPENDENCIES**: G1 (paid tier, a hard gate), C2 (SkinState to read), C4 (AI-share consent), C10.
- **OWNER**: FE
- **TESTS**: the package builder never emits phone, name or unknown values. A validator table with these bypass cases: "better than last time" citing a true fact, "about sixty", "६२", Hinglish "kam hua", and a change claim hidden in smalltalk. Pre-filter recall on labelled English and Hinglish sets. A route test that rejects a missing token, missing consent, or no 18+ attestation. EVALUATION_PLAN.md §4 golden set as the release gate.
- **OPEN QUESTIONS**: what fallback rate is tolerable? Whether Hinglish output should be supported at all (v1 sends it to the fallback). Helpline numbers must be verified before the red-flag copy ships.

### C10 chatTurns (history source)
- **CURRENT**: threads live in memory and are lost on refresh. Nothing is stored server-side.
- **REQUIRED CHANGE**: the server writes each turn. History sent to Gemini comes only from stored turns. TTL is 90 days.
- **NEW COMPONENT**: `users/{uid}/chatTurns/{id}`, a Firestore TTL policy on `expireAt`, and a rules block (owner read; no client write).
- **DEPENDENCIES**: G2, C9.
- **OWNER**: FE + INFRA (TTL policy)
- **TESTS**: the route ignores client history. Turns carry `packageSha256`, `promptVersion`, `modelId` and the validator result. Client writes are denied.
- **OPEN QUESTIONS**: is 90 days of retention right for health-adjacent text? What does Firestore point-in-time recovery or backup keep after TTL deletion?

---

## Phase 4: recommendations (only if PRODUCT decides cards return; OPEN-R1)

### C8 Recommendation function, catalog, and C3 record
- **CURRENT**: `runSkinCheckRules` keys 4 placeholder SKUs on image bands. Its output is discarded because the SKU UI was removed in e232b38. Handles are guessed. There are no safety constraints. The claim copy is risky (skus.ts:64,76).
- **REQUIRED CHANGE**: a pure `recommend(answers, catalog)` with this evaluation order: red-flag gate → hard constraints (prescription, pregnancy plus actives notice) → base routine → one conditional active → fixed order. It also carries `RULESET_VERSION`. The server writes the record when the questionnaire is saved. Reasons shown to the user are self-reported ("Because you said…"). Shopify links carry an opaque `recommendationId`. Echo may mention only the `rec.*` facts.
- **NEW COMPONENT**: `lib/catalog.ts` (`CATALOG_VERSION`, slot, ingredient classes, warnings, a whitelist of `claims[]` with evidence level, source and date), `users/{uid}/recommendations/{id}`, and a token-verified save route (or an extension of an existing one).
- **DEPENDENCIES**: PRODUCT (OPEN-R1), LEGAL (claim copy, PA++++), real INCI lists and test reports, verified Shopify handles, C5b (re-confirmed answers).
- **OWNER**: FE + PRODUCT + LEGAL
- **TESTS**: a table test covering every red flag, pregnancy × actives, prescription, and empty and maximal answer sets. Sunscreen is always present. Same input produces the same output and the same `inputSha256`. Every rendered claim exists in `catalog.claims`.
- **OPEN QUESTIONS**: who owns the INCI lists and the substantiation? The Indian sunscreen labelling standard for "PA++++".

### Bands (derived)
- **CURRENT**: `SCORING_VERSION "v0-provisional"` and a single threshold set (skin-check-rules.ts:9,84-91).
- **REQUIRED CHANGE**: a threshold table keyed by version. Old entries are never edited. Bands are computed on read from SkinState.
- **NEW COMPONENT**: none, just a data shape inside the existing file.
- **DEPENDENCIES**: none
- **OWNER**: FE
- **TESTS**: for each historical version, the computed band equals the band snapshot taken for that version.
- **OPEN QUESTIONS**: none

---

## Phase 5: privacy completeness

### C11 User-level erasure
- **CURRENT**: none. The rules deny delete, and IAM allows PutObject only.
- **REQUIRED CHANGE**: `POST /api/account/erase` takes a fresh token (recent `auth_time`) and runs: S3 list and delete of `users/{uid}/` including versions → Firestore `recursiveDelete(users/{uid})` → Auth `deleteUser`. Each step is idempotent and logged without content.
- **NEW COMPONENT**: the route, an IAM policy adding `s3:ListBucket` (prefix-scoped) and `s3:DeleteObject[Version]`, a bucket brought under Terraform, and a user-facing "Delete my data" action.
- **DEPENDENCIES**: ⛔ G3, ⛔ IAM change, LEGAL (the 90-day rights window per the DPDP Rules), INFRA (bucket into IaC; also fold in the Phase 3 drift noted in memory).
- **OWNER**: FE + INFRA + LEGAL
- **TESTS**: the route against emulators and a mocked S3. A partial failure followed by a retry completes. Afterwards, nothing remains under the prefix.
- **OPEN QUESTIONS**: how long backups and point-in-time recovery retain data after erasure. Gemini's 55-day abuse log cannot be deleted, so it needs disclosure.

---

## Phase R: measurement research (parallel; gates any change display)

### C13 Test–retest study and noise tables
- **CURRENT**: no repeatability data exists. The only uncertainty signal is `region_low_confidence` (pixel count). `CALIBRATION.md` rests on 3 photos.
- **REQUIRED CHANGE**: run EVALUATION_PLAN.md §1 offline with existing scripts (`calibrate.py`, `extract_native_stats.py`, `scan_image.py`), scoring the same 1280px client downscale.
- **NEW COMPONENT**: a versioned calibration table per quantity × region × tone band, holding ICC, SEM and MDC95, referenced by the comparability key.
- **DEPENDENCIES**: participant consent and protocol (LEGAL/ethics), 30 participants, and a reference device. It does **not** depend on the derm rubric.
- **OWNER**: RESEARCH + CV
- **TESTS**: the analysis script itself has a self-check that recovers ICC on synthetic data with known variance components.
- **OPEN QUESTIONS**: does any quantity pass? (Prediction: all 7 `scores` fail; native L*/ITA and `lbp_entropy` are plausible.) How big is the background confound? Front-camera mirroring per OS and capture path.

### C6 / C7 Comparability table and pairwise change
- **CURRENT**: none. `score_types` are all `image_relative`.
- **REQUIRED CHANGE**: an empty `COMPARABLE` constant now, with readers that refuse comparison when it has no entry. Pairwise change (|Δ| > MDC95, matching on pipelineVersion, engineBuild, inputVariant and captureMethod, quality passed, baseline window) is computed on read **only after** C13 adds an entry.
- **NEW COMPONENT**: `lib/comparability.ts` (a constant plus a pure verdict function).
- **DEPENDENCIES**: C2, C12, C13.
- **OWNER**: FE + RESEARCH
- **TESTS**: with no entry, the function returns "not comparable". With an entry, it is not comparable across engineBuild or captureMethod. It never uses `scores`.
- **OPEN QUESTIONS**: how to set the importance threshold (MIC) without an anchor study. Conservative tone-band choice.

### C14 Engine refinements ⚠ APPROVAL
- **CURRENT**: cheeks are ORed (face_mesh.py:223). The forehead includes the eyebrows (:184). Gray-world is computed over the whole frame (preprocess.py:91-105). There is no beard or fringe exclusion. The whole frame is resized to 1024px. `stats=both` is never requested.
- **REQUIRED CHANGE**, each item gated by C13 findings: split L/R cheeks (keeping a `cheeks` union), subtract the brows, use face-only gray-world, add a beard/fringe flag, add interocular px as a covariate, request `stats=both` (D-07). Each change bumps `PIPELINE_VERSION`.
- **NEW COMPONENT**: none. These are changes inside the existing engine.
- **DEPENDENCIES**: explicit approval (CLAUDE.md), C13 data, and replay of stored `scored.jpg` (C11a) for cross-version continuity.
- **OWNER**: CV
- **TESTS**: golden-output regression with a mandatory version bump on any diff. Regions remain disjoint. CI that actually runs (fix the deploy.yml branch trigger).
- **OPEN QUESTIONS**: is the +43% p95 latency of `stats=both` acceptable? L/R naming under mirroring.

### C1 Capture-quality gate
- **CURRENT**: none on the client. The server rejects only on size, dimensions, missing face, or a mask failure.
- **REQUIRED CHANGE**: client checks for face size, pose, exposure and blur, plus a named-reason retake. Thresholds come from C13 data, not guesses.
- **NEW COMPONENT**: a quality block on SkinState (separately versioned).
- **DEPENDENCIES**: C13. MediaPipe in the browser is a new dependency and needs justification.
- **OWNER**: FE + CV
- **TESTS**: a fixture set of good and bad captures.
- **OPEN QUESTIONS**: how much retake friction is acceptable.

---

## LATER (not scheduled; each needs a stated consumer before it is built)

| Item | Why deferred | Trigger to revisit |
|---|---|---|
| Routine / ProductUse / Context events | Attribution is banned, so no consumer exists | Irritant actives enter the catalog ("irritation reported" event) |
| Scheduled check-in reminders | Only useful once a comparable quantity exists | C13 passes for at least one quantity |
| UserAssertion quarantine | No confirm UI and no consumer | A memory feature is approved |
| NLI grounding check | Needs an eval set to tune; adds a GCP or Python footprint | §4 golden set exists and the fallback rate is known |
| Function calling / retrieval | Package is small; no comparable history | Comparable history exists |
| Validity study against the derm panel | Rubric not ready | Rubric delivered |
| ML ranking, collaborative filtering | 4 SKUs; no propensity logs | Catalog > ~20 SKUs plus logged shown sets |
| Forecasting, causal attribution, agent loops | **Not approved** (CLAUDE.md) | Explicit approval only |

## Critical path

```
G2 ─▶ C2 (+C5a, independent) ─▶ C12 ─▶ C11a ──────────────▶ C13 results ─▶ C6/C7 ─▶ any change display
G1 + C2 + C4 ─▶ C9 + C10
PRODUCT(OPEN-R1) + LEGAL + C5b ─▶ C8
G3 + IAM ─▶ C11
```

**Smallest first step with the biggest value:** C5a (one guard plus a clamp) and C2 (server-written SkinState with raw data). These two stop permanent data loss. Neither changes what users see.
