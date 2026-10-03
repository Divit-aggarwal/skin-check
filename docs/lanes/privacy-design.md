# Privacy lane design: H01, H02, H03

Branch `lane/privacy`, worktree `../skin-check-privacy`, `PORT_BASE=3400`. Design only: no app code is written until the owner approves this document (README rule 3).

Inputs: CLAUDE.md, [README.md](README.md), [privacy.md](privacy.md), DECISION_LOG.md (D-03, D-03a, D-12, D-14, D-15, D-16, D-17, D-19, D-23, D-26), GEMINI_BOUNDARY.md, PREFLIGHT_AUDIT.md (G1, G4), H01_S3_ERASURE_READINESS.md.

Decisions are cited by name and ID. The log has two entries numbered D-21 ("Firestore to asia-south1" and "Gate 01 stores raw analysis in scanAnalyses"). An uncommitted D-22 ("recreate Firestore `(default)` in asia-south1, no data copy") is in flight in the main checkout. This design does not depend on it.

---

## 1. What will be built

**H01a: Consent ledger (D-16, "consent ledger, server-written").** Today, consent lives only inside the client-written `skinChecks` document. The image-retention consent is recorded only if the user finishes the flow. This lane adds an append-only list of consent events per user, written only by the server. Clients can read their own entries and can never write them. The presign route writes an "image retention" entry before it hands out an upload URL, so an abandoned flow still has a record (audit finding D11). The same ledger also holds the 18+ attestation (H02) and the AI-share consent (H03).

**H01b: User erasure (D-17, "erasure route: S3, then Firestore `recursiveDelete`, then Auth").** A signed-in user can delete their account from `/account`. The server first revokes the user's sessions. Revoking is not a deletion step: it only stops new uploads and scans during the erase. Then the server deletes, in order:
1. every S3 object under `users/<uid>/`;
2. the whole Firestore `users/<uid>` tree;
3. the Firebase Auth user.

If any step fails, the later steps do not run. The response names the failed step, and running the route again finishes the job. Locally, S3Mock stands in for S3. D-17 says "Immutability is a promise to clients, not a retention promise." The immutable-state rule in CLAUDE.md stops clients from changing records. It does not stop a user from erasing their own data.

**H01c: Retention period.** Nothing is built in this lane. Originals are kept forever today, because the bucket has no lifecycle rule. The period is an owner decision (§7, decision 5). Enforcing it means an S3 lifecycle rule, which is infra work and an OWNER ACTION, not lane code. The lane only shows the period in the consent copy once the owner sets it.

**H02a: Server-side 18+ attestation (D-19).** Today the under-18 check exists only in the browser (`useSkinCheckFlow.ts:486`). After phone sign-in, the client sends the user's age answer to a new `POST /api/account/attestation`. The server records `over18: true|false` in the ledger. The upload, scan and chat routes read that record on the server. An under-18 record is always refused. What happens when no record exists is decision 3 in §7. The record is sticky: once a user is recorded as under 18, a later "18+" answer does not unlock them (decision 4). Skipping the client gate therefore doesn't help a minor: either no record exists, or an under-18 record exists.

**H02b: Re-confirm sensitive answers on every scan (D-19).** When a returning user reuses a saved questionnaire, `current_products` and `female_skin_context` (for female users) are no longer carried over silently. Those two questions are asked again on every scan. Everything else is still reused.

**H02c: Stop storing the phone number in answers (D-19).** `phone_verify` and `final_phone` will store the marker `"verified"` instead of the number. The verified number stays where it already lives: Firebase Auth, and `users/{uid}.phoneNumber` (written by `lib/auth-context.tsx`, which no lane owns). The fix is client-side only. Firestore rules do not reject old documents that carry a phone number, because D-03 forbids rule changes that would silently lose fire-and-forget saves from old bundles.

**H03a: Gemini field inventory and pin test.** One inventory lists every value that reaches Gemini (§2.4), each marked **needed** or **remove**. A test captures the real `generateContent` call and checks it against the inventory. Every quiz step id must be classified as sent or not sent, so a new question fails the test until someone adds it on purpose.

**H03b: Minimisation.** After the owner approves the field list, remove the fields marked **remove** from the prompt. The answer renderer becomes allowlist-driven: it renders only step ids that the inventory marks as sent.

**H03c: AI-share consent (D-16 and the D-14 Gemini boundary).** A new consent purpose: "share my skin check with the AI assistant, processed by Google, outside India". It is recorded in the ledger through `POST /api/account/consent`. The chat route refuses a request without it, with code `AI_CONSENT_REQUIRED`. The Echo page shows the consent prompt. The copy and the go-live depend on G1 and the owner's copy (§7, decisions 6 and 7).

---

## 2. Data shapes

### 2.1 Consent ledger entry (new)

Path: `users/{uid}/consentLedger/{entryId}`. `entryId` is server-generated (Firestore auto-id). The server writes with `.create()` only and never updates. Clients get `get` and `list` on their own entries and `write: if false`.

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | `1` | literal |
| `purpose` | `"image_retention" \| "processing" \| "ai_share" \| "age_18_plus"` | one purpose per entry; purposes are never combined |
| `granted` | `boolean` | for `age_18_plus`, true means "attested 18 or over" |
| `version` | `string` | the copy version, e.g. `IMAGE_RETENTION_CONSENT_VERSION`; for `age_18_plus`, `AGE_ATTESTATION_VERSION` |
| `copySha256` | `string` (64 hex) | SHA-256 of the exact copy shown, so a later reword can't pass as the same consent |
| `scanId` | `string \| null` | set for per-scan purposes (`image_retention`, `processing`), null otherwise |
| `source` | `"presign" \| "scan" \| "attestation_route" \| "consent_route"` | which server route wrote it |
| `recordedAt` | `Timestamp` | `FieldValue.serverTimestamp()` |

No age bucket, name, phone or IP is stored. `age_18_plus` stores only the boolean.

### 2.2 New constants in `lib/consent.ts`

These are client-safe strings with no SDK import.
- `AGE_ATTESTATION_VERSION: string`
- `AGE_ATTESTATION_COPY: string`. Draft wording: "I confirm I am 18 or older." The owner approves the final copy.
- `AI_SHARE_CONSENT_VERSION: string` and `AI_SHARE_CONSENT_COPY: string`. Copy pending (decision 7).
- `PROCESSING_CONSENT_VERSION: string` and `PROCESSING_CONSENT_COPY: string`. The copy moves here from PhotoCapture, which is a capture-lane change (request R3).
- `type ConsentPurpose` (the union above).

### 2.3 Request and response shapes

| Route | Request | Success | Failure codes |
|---|---|---|---|
| `POST /api/account/attestation` (new) | Bearer token; body `{ ageBucket: "under-18"\|"18-24"\|"25-34"\|"35-44"\|"45-plus", version }`, strict | `{ ok: true, over18: boolean }` | 401 `AUTH_REQUIRED`, 400 `BAD_REQUEST`, 409 `VERSION_STALE`, 500 `LEDGER_UNAVAILABLE` |
| `POST /api/account/consent` (new) | Bearer token; body `{ purpose: "ai_share", granted: boolean, version }`, strict | `{ ok: true }` | 401, 400, 409 `VERSION_STALE`, 500 |
| `POST /api/account/erase` (new) | Bearer token, with `auth_time` no older than `ERASE_MAX_AUTH_AGE_SECONDS` (named setting, **provisional**); body `{ confirm: "DELETE MY DATA" }`, strict | `{ ok: true, steps: { revoke, s3, firestore, auth }: "done" }` | 401, 403 `REAUTH_REQUIRED`, 400, 500 `{ ok:false, failedStep, completedSteps }` |
| `POST /api/skin-scan/upload` (changed) | unchanged body | unchanged | new: 403 `UNDER_18`, 403 `ATTESTATION_REQUIRED`, 500 `LEDGER_UNAVAILABLE` (no URL is issued if the retention entry can't be written) |
| `POST /api/skin-scan` (preamble changed) | new optional header `X-Consent-Processing-Version` | unchanged | new: 403 `UNDER_18`; missing attestation per decision 3 |
| `POST /api/skin-check/chat` (changed) | unchanged | unchanged | new: 403 `UNDER_18`, 403 `ATTESTATION_REQUIRED`, 403 `AI_CONSENT_REQUIRED` |

Field changes in stored answers (`users/{uid}/skinChecks/{scanId}.answers`):

| Field | Today | After H02c |
|---|---|---|
| `phone_verify` | `string`: the E.164 number | `"verified"` |
| `final_phone` | `string`: the E.164 number | `"verified"` |

### 2.4 H03 field inventory: what reaches Gemini today

The source is `lib/gemini.ts`, `lib/echo-trusted-context.ts`, `lib/skin-check-format.ts` and `app/api/skin-check/chat/route.ts`. One `generateContent` call carries a `systemInstruction` (persona + answers + scores + region) and `contents` (the turns).

| # | Field | Where it comes from | Sensitive? | Mark | Reason |
|---|---|---|---|---|---|
| 1 | Persona and fixed rules text | constant in gemini.ts | no | **needed** | Instructions, not user data. Fix "digital twin" under D-20 when touched |
| 2 | `name` (free text) | skinChecks.answers | identifier; injection surface | **remove** | Not needed to explain a scan. PREFLIGHT G1.4 FAIL; GEMINI_BOUNDARY §4 excludes it |
| 3 | `age` bucket | answers | personal | **remove** | No explanation depends on it; GEMINI_BOUNDARY §4 excludes it. The 18+ check is server-side now |
| 4 | `gender` | answers | personal | **remove** (contested, decision 8) | The context answers that matter (rows 13 and 14) carry the signal. Gender alone adds nothing |
| 5 | `primary_concerns` | answers | low | **needed** | The user's own stated concern frames the answer |
| 6 | `skin_type` | answers | low | **needed** | Basic explanatory context |
| 7 | `breakout_pattern` | answers | low | **needed** | Explains blemish readings |
| 8 | `acne_areas` | answers | low | **needed** | Matches region threads |
| 9 | `pih_scar_tendency` | answers | low | **needed** | Explains pigment readings |
| 10 | `skin_tone` (sun response) | answers | low | **needed** | Explains pigment and redness wording |
| 11 | `current_products` | answers (re-confirmed per scan after H02b) | medium ("a prescription product") | **needed** | Echo must not suggest stacking actives on a prescription. Labels only, no product names |
| 12 | `male_skin_context` | answers | low (shaving, sweat gear) | **needed** | Explains irritation patterns |
| 13 | `female_skin_context` | answers | **high: pregnancy, contraception, menopause** | **remove** (contested, decision 8) | Reproductive-health data sent to a processor outside India. Pregnancy safety must come from deterministic rules, not from Gemini (Gemini is not the source of truth) |
| 14 | `skin_factors` | answers | low | **needed** | Stress and sleep context |
| 15 | `diet` | answers | low | **needed** | Users ask diet questions |
| 16 | `water_intake` | answers | low | **needed** | Users ask about dryness |
| 17 | `sunscreen_habit` | answers | low | **needed** | Core advice context |
| 18 | Band: Redness, Oiliness, Texture, Blemishes, Pigmentation | scanAnalyses.scores → `bandScores` | low | **needed** | The thing being explained |
| 19 | Band: "Dryness" (hydration) | scanAnalyses.scores.hydration | low | **remove** | D-05 ("stop displaying hydration"): photos can't measure it. Pores is already excluded |
| 20 | `composite.topConcerns` | computed server-side | low | **needed** | Matches what the user saw |
| 21 | `composite.summaryLine` | computed server-side | low | **needed** | Same |
| 22 | Region label (enum of 4) | request `region` | low | **needed** | Scopes the thread |
| 23 | Region bands (same categories as 18 and 19) | scanAnalyses.region_scores | low | **needed**, except Dryness: **remove** | Same as 18 and 19 |
| 24 | User `message` (≤2000 chars) | request | whatever the user types | **needed** | The question itself |
| 25 | History turns, user text and Echo replies (server-signed, last 20) | request, verified by HMAC | same as 24 | **needed** | Multi-turn chat. Text is not stored server-side (D-26) |

**Not sent today, and pinned as not sent by the test:**
- `phone_verify` and `final_phone` (dropped by type);
- `skin_photo`;
- uid and scanId;
- the image or any image bytes;
- numeric scores, `raw` and `region_hist` (bands only);
- `skinChecks.result`;
- consent fields;
- other scans' values.

**Where the data is processed and logged:**
- Vercel function in `iad1` (US) while D-21 ("Firestore and Vercel to India") is pending.
- Google Gemini: any country; a 55-day abuse log; used for training and human review if the key is on the free tier (PREFLIGHT G1.2, G1.3).
- Our logs carry the error message only. The prompt is never logged (chat route line 177).

---

## 3. Files

### 3.1 Owned files I will change

| File | Change | Task |
|---|---|---|
| `lib/consent.ts` | new version and copy constants (§2.2), `ConsentPurpose` type | H01a, H02a, H03c |
| `app/api/skin-scan/upload/route.ts` | read attestation (refuse under 18 or missing); write the `image_retention` ledger entry before presigning; refuse if the write fails | H01a, H02a |
| `lib/s3.ts` | new server-only `eraseUserPrefix(uid)`: list `users/<uid>/` and batch-delete until empty, using **separate** erase credentials (`S3_SKIN_IMAGES_ERASE_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY`); fails closed if they are unset | H01b |
| `lib/s3-key.ts` | new `userPrefix(uid)` → `users/${uid}/`, the one place a prefix is built | H01b |
| `app/(marketing)/account/page.tsx` | render the delete-account section (component location: request R1) | H01b |
| `lib/skin-check-validation.ts` | phone answer is valid when it equals `"verified"`; `RECONFIRM_EACH_SCAN_IDS = ["current_products", "female_skin_context"]`, stripped from reuse and skipped in the completeness check | H02b, H02c |
| `components/skin-check/inputs/PhoneAuthStep.tsx` | store `"verified"`, never `user.phoneNumber`, in both phone answers; after sign-in on `phone_verify`, call the attestation route | H02a, H02c |
| `lib/skin-check-steps.ts` | no shape change. Only if needed: a step flag `reconfirmEachScan: true` on the two steps, instead of the id list in validation (one of the two, not both) | H02b |
| `lib/gemini.ts` | `GEMINI_FIELD_INVENTORY` constant (step id → `"sent" \| "not_sent"`); drop the Dryness band from the scale note | H03a, H03b |
| `lib/skin-check-format.ts` | `summarizeSkinCheckAnswers` renders only step ids marked `"sent"`; `summarizeSkinScanScores` skips the fields marked remove | H03b |
| `lib/echo-trusted-context.ts` | none planned; re-checked when the inventory changes | H03 |
| `app/api/skin-check/chat/route.ts` | after auth: read the ledger; refuse `UNDER_18`, `ATTESTATION_REQUIRED` (only after the attestation UI ships, per D-03a) and `AI_CONSENT_REQUIRED` | H02a, H03c |
| `components/skin-check/EchoPage.tsx`, `app/(marketing)/echo/page.tsx` | AI-share consent prompt; on `AI_CONSENT_REQUIRED`, show it and post to `/api/account/consent` | H03c |

### 3.2 New owned files

| File | Purpose |
|---|---|
| `app/api/account/_ledger.ts` | **server-only** ledger read and write helpers (`appendConsent`, `latestGrant`, `ageStatus`). Lives under `app/api/account/**` because `lib/consent.ts` is imported by client code and must not pull in the admin SDK. `_`-prefixed, so Next.js doesn't route it |
| `app/api/account/attestation/route.ts` | H02a |
| `app/api/account/consent/route.ts` | H03c |
| `app/api/account/erase/route.ts` | H01b. Uses `adminDb().recursiveDelete(...)` and `getAuth(getApp("admin"))` from `firebase-admin/auth` (see request R2) |
| `scripts/seed-lane-privacy.ts` | ledger entries for the seed users, plus one under-18 seed user and one user with S3Mock objects to erase |
| `tests/privacy-*.test.ts`, `tests/firestore-rules-privacy.test.ts`, `tests/privacy.e2e.test.ts` | §4 |

### 3.3 Shared files: my marked part only

| File | My part |
|---|---|
| `firestore.rules` | between `// ── lane:privacy ──` and `// ── end lane:privacy ──`, inside `match /users/{uid}`: `match /consentLedger/{id} { allow get, list: if request.auth != null && request.auth.uid == uid; allow write: if false; }`. No change to existing blocks |
| `app/api/skin-scan/route.ts` | preamble only, after `verifyFirebaseIdToken` and before `request.formData()`: the attestation check; read `X-Consent-Processing-Version` and write the `processing` ledger entry (scanId is not known before formData, so `scanId: null`; see R4) |
| `lib/useSkinCheckFlow.ts` | the reuse path (`isSkipped` / `nextEligibleIndex` when `reusing`) visits sections that contain a re-confirm step and reveals only those steps. The age gate stays as it is |
| `lib/api.ts` | new optional parameter on the scan helper: the processing-consent version, sent as a header. Existing callers are unchanged |
| `lib/firebase/skin-checks.ts` | `consent` block only: no shape change planned. The phone fix happens upstream in PhoneAuthStep |
| `lib/skin-check-draft.ts` | export a `clearAllLocalData()` (draft + IndexedDB scan) if `clearDraft` doesn't already cover both; used after erasure |
| `.env.development.example` | append a `# lane:privacy` block: `S3_SKIN_IMAGES_ERASE_ACCESS_KEY_ID`, `S3_SKIN_IMAGES_ERASE_SECRET_ACCESS_KEY` with S3Mock-safe values |

### 3.4 Requests (files I do not own)

| # | To | Request |
|---|---|---|
| R1 | owner | Ownership of a new client component `app/(marketing)/account/DeleteAccount.tsx`. `page.tsx` is a server component (it exports `metadata`), so the button needs its own `"use client"` file next to it. Only `page.tsx` is listed today |
| R2 | owner / main | `admin.ts` exports no Auth getter. The app is named `"admin"` and initialised lazily inside `adminApp()`. Calling `adminDb()` or `verifyFirebaseIdToken()` first and then `getAuth(getApp("admin"))` works without editing admin.ts, but that relies on a private name. Preferred: main adds `export function adminAuth()` to admin.ts. The lane uses the `getApp("admin")` fallback until then |
| R3 | capture lane | PhotoCapture: import `PROCESSING_CONSENT_COPY` and `_VERSION` from `lib/consent.ts`, and pass the version to the scan helper (`lib/api.ts` new param). Today the processing checkbox has no version (audit, CURRENT_SYSTEM_AUDIT §50) |
| R4 | capture lane | `app/api/skin-scan/route.ts` after formData: when the preamble found no processing-consent version, skip `persistScanAnalysis` and return `persisted:false, reason:"consent_missing"` (D-03a). Also add the scanId to the processing ledger entry, or accept `scanId: null` |
| R5 | main (not lane-owned) | `lib/dev-env-guard.cjs` must learn the two new erase-credential names, because they could point at production |
| R6 | owner / main | Update `tests/skin-check-flow-navigation.test.ts:43` and `:48`. With H02b, the reuse walk for a female user becomes verify → skin-photo → your-skin (current_products only) → personal-context (female_skin_context only) → get-your-results, not verify → skin-photo → get-your-results. The test is not lane-owned. `tests/reusable-answers.test.ts` and `tests/echo-prompt-answers.test.ts` keep passing under this design (checked: they assert partial matches and the absence of phone numbers) |
| R7 | routine lane | `SkinCheckDashboard.tsx`: a "Your data and consents" link to `/account`. Optional; not needed for any test |

---

## 4. Tests

Unit tests use vitest with the same fake-Firestore pattern as `skin-check-chat-trusted-context.test.ts`. Rules tests run on the emulator. E2E runs on the local stack (`npm run test:local`, port 3400).

**`tests/firestore-rules-privacy.test.ts`**
- The owner can `get` and `list` their own `consentLedger` entries.
- Another user's `get` and `list` are denied.
- A client `create`, `update` or `delete` is denied, both on their own path and on another user's.
- Existing `skinChecks` rules are unchanged: a create without a ledger entry still succeeds (D-03).

**`tests/privacy-ledger.test.ts`**
- `appendConsent` writes the exact §2.1 shape, with a server timestamp and a SHA-256 of the copy.
- It uses `.create()`, never `.set()` or `.update()`.
- `latestGrant` picks the newest entry per purpose with an equality-only query and sorts in code, so no composite index is needed.
- `ageStatus` returns `"under18"` when any under-18 entry exists, even if a later entry says 18+ (sticky; decision 4).
- `ageStatus` returns `"missing"` when there are no entries.

**`tests/privacy-upload-consent.test.ts`**
- A presign writes an `image_retention` entry before the URL is returned. The entry exists even though nothing calls the scan route or saves the questionnaire (the abandoned flow, D-16).
- A failed ledger write gives 500 `LEDGER_UNAVAILABLE` and no URL.
- Missing or wrong consent version: still 403 `CONSENT_REQUIRED` and no ledger entry.
- Under-18 record: 403 `UNDER_18`. Missing attestation: 403 `ATTESTATION_REQUIRED`.

**`tests/privacy-attestation.test.ts`**
- Unauthenticated: 401.
- A body with extra keys, such as `uid` or `over18`: 400 (strict).
- `"under-18"` records `granted:false`. Every other bucket records `granted:true`.
- A stale version: 409, and nothing is written.
- **Bypass:** a client that skips the attestation route and calls upload or chat directly is refused. A client that posts under-18 and then 18-24 stays refused.

**`tests/privacy-scan-gate.test.ts`**
- Under-18 record: the scan route returns 403 `UNDER_18` before `formData()` is read and before the engine is called.
- Missing attestation, mode "degrade" (D-03a): the scan runs and the response flags `attestationMissing: true`.
- Missing attestation, mode "refuse": 403 `ATTESTATION_REQUIRED`.
- The mode is one named constant, `SCAN_REQUIRES_ATTESTATION`, set by decision 3.
- The processing header is present: a `processing` entry is written. Absent: no entry, and the scan still runs.

**`tests/privacy-chat-gate.test.ts`**
- Under 18: 403. Missing attestation: 403. No AI-share grant: 403 `AI_CONSENT_REQUIRED`.
- A grant followed by a later `granted:false`: 403.
- In every refused case, Gemini is not called and no quota is consumed.

**`tests/privacy-phone.test.ts`**
- PhoneAuthStep's save payload: `answers.phone_verify` and `answers.final_phone` equal `"verified"`.
- No string anywhere in the payload matches `/\+?\d{10,}/`.
- `isStepAnswerValid` accepts `"verified"` for phone steps.
- The legacy number format still validates, so old drafts restore.

**`tests/privacy-reconfirm.test.ts`**
- `reusableAnswers` drops `current_products` and `female_skin_context` but still returns non-null for an otherwise complete set.
- The reuse walk for a female user visits those two steps, and for a male user only `current_products`.
- A reused scan can't reach `get-your-results` with either one unanswered.
- An under-18 saved answer still returns null.

**`tests/privacy-gemini-inventory.test.ts`** (H03)
- Mock `@google/genai`, call `getSkinCheckChatReply` with every step answered, and capture the real `generateContent` argument (`config.systemInstruction` and `contents`).
- Sentinel values: name `"ZZNAMEZZ"`, phones `"+919999999999"`, and an unknown key `"ZZUNKNOWNZZ"`.
- **Pins the exact set** of step ids rendered: each `"sent"` label appears, and no `"not_sent"` label or sentinel appears.
- Every `SECTIONS` step id has an entry in `GEMINI_FIELD_INVENTORY`. A new step with no entry fails with a message that names it.
- The category labels in the instruction equal the approved set exactly.
- No uid, scanId or digit sequence ≥ 3 (numeric score) appears.
- Before H03b ships, the test pins today's set (name, age, gender, female context and Dryness present). The minimisation commit changes the pinned set and the inventory together, so the diff shows exactly what was removed.

**`tests/privacy-erase.test.ts`** (unit, with fakes)
- Order: revoke, then S3, then Firestore, then Auth.
- An S3 failure means Firestore and Auth are not called, and the response is `failedStep:"s3"`.
- A Firestore failure means Auth is not called.
- Running again after a partial failure completes the remaining steps.
- The uid comes only from the token; a body `uid` gives 400.
- A token older than `ERASE_MAX_AUTH_AGE_SECONDS` gives 403 `REAUTH_REQUIRED`.
- Erase credentials unset: 500, and nothing is deleted.

**`tests/privacy.e2e.test.ts`** (local stack)
- Seed users A and B, each with skinChecks, scanAnalyses, ledger entries and S3Mock objects. Sign in as A and call erase.
- Afterwards, for A:
  - S3Mock lists nothing under `users/A/`;
  - the emulator has no `users/A` document or subcollection;
  - Auth has no user A;
  - A's old ID token is refused by `/api/skin-scan/upload`.
- B's S3 objects, Firestore tree and Auth user are unchanged.

---

## 5. What this lane will NOT build

- **No S3 lifecycle or retention enforcement.** That is infra and an OWNER ACTION, and no terraform apply.
- **No production IAM change.** The erasure principal is the owner's.
- **No change to the scan route after `formData()`.** No skip-persist on missing processing consent (that is R4 for capture).
- **No change to PhotoCapture layout or copy placement** (R3).
- **No backfill or rewrite of existing `skinChecks` documents** that hold phone numbers. They are append-only by rule, and deleting or resetting databases is forbidden. They go away through erasure, or through the D-22 recreate if the owner approves it.
- **No firestore.rules check** that rejects phone numbers or missing attestation on `skinChecks` create (D-03).
- **No guardian-consent flow for minors.** They stay blocked.
- **None of the rest of D-14's Gemini boundary:** the ContextPackage, fact-id schema, validator and pre-filters, the chatTurns store (D-15), safety settings, and the "digital twin" rename (D-20). These are other tracker rows. This lane only removes fields and adds the consent gate.
- **No Vertex AI move.** The Gemini key and tier stay with the owner (G1).
- **No erasure of Google-side Gemini logs, Vercel or CloudWatch logs, or other devices' local drafts.** These are listed as gaps in §5.1.
- **No change** to `lib/skin-state.ts` (D-23), `lib/skin-check-rules.ts`, `lib/firebase/admin.ts` or `lib/firebase/client.ts`, `lib/auth-context.tsx`, `lib/dev-env-guard.cjs`, `package.json`, the tracker or `DECISION_LOG.md`.
- **No new npm dependency.** `firebase-admin` (Auth, `recursiveDelete`) and `@aws-sdk/client-s3` (`ListObjectsV2`, `DeleteObjects`) are already installed.

### 5.1 Every place user data lives, and what erasure does

| # | Place | What | Erasure |
|---|---|---|---|
| 1 | Firebase Auth | uid, phone number, sign-in metadata | **deleted** (step 3); sessions revoked first |
| 2 | Firestore `users/{uid}` | `phoneNumber`, `lastSeenAt` (written by `lib/auth-context.tsx`) | **deleted** (step 2, recursive) |
| 3 | `users/{uid}/skinChecks/*` | answers (name, age, gender, health context; legacy phone numbers), legacy `result`, image key, consent flags | **deleted** (step 2) |
| 4 | `users/{uid}/scanAnalyses/*` | saved analysis records: engine output, `inputSha256`, captureMethod | **deleted** (step 2) |
| 5 | `users/{uid}/consentLedger/*` (new) | consent and attestation events | **deleted** (step 2); keeping a receipt is decision 9 |
| 6 | S3 `projectskin-skin-originals-prod`, `users/{uid}/scans/*/original.jpg` (locally S3Mock) | original face photos with EXIF | **deleted** (step 1, whole prefix, which also covers a future `scored.jpg` under D-11) |
| — | `skinStates` | does not exist. D-23 makes SkinState a computed view, so there is nothing to delete | n/a |
| 7 | Browser localStorage `skin-check-draft` | draft answers | cleared on **this** device after a successful erase. **Gap:** other devices keep theirs until their next save or clear |
| 8 | Browser IndexedDB draft scan | scan result incl. overlay PNGs | same as 7 |
| 9 | In-memory session context and Echo threads | current visit only | gone on sign-out or reload |
| 10 | Gemini (Google) | prompt contents for 55 days; training and human review if on the free tier | **cannot be erased by us.** Gap; depends on G1 |
| 11 | Vercel function logs (iad1) | error messages, scan ids; no images | platform retention. Gap: not erased |
| 12 | CloudWatch (engine, 30 days) and ALB access logs | request ids, timings, IPs; no images | expire by retention. Gap: not erased |
| 13 | Firestore version retention (1 h) and backups | PITR is off; backup schedules unknown (PREFLIGHT G2.5) | version retention expires in 1 h. Backups: **unknown**, owner to confirm |
| 14 | In-memory rate-limit maps | IP counters | ephemeral |
| 15 | Developer machines (T8) | anything pulled from production | out of scope; the local stack uses no production data |
| 16 | Shopify | store customers (separate system) | not linked by uid; out of scope |
| 17 | Engine (ECS) | processes the image; logs carry no images (T7). That the service writes no image to disk or S3 is **not verified** here | nothing to erase if confirmed; check skin-scan code before H01 ships |

**Known race (gap):** a presigned PUT issued up to `UPLOAD_URL_TTL_SECONDS` (300 s) before the erase can land after the S3 step. Revoking sessions first stops new presigns, but not one already issued. A scheduled sweep or a lifecycle rule is the fix. It is a new tracker row, not this lane.

---

## 6. Steps

Each step ends with passing tests (`npm run test:local`, typecheck, lint) and one commit. Steps 1–5 need no new owner decision beyond approving this design. A step marked "blocked" lists its decision.

| # | Step | Tests | Needs |
|---|---|---|---|
| 1 | **H03 pin test against today's behaviour.** Add `GEMINI_FIELD_INVENTORY` to `lib/gemini.ts`, classifying today's real behaviour, and `tests/privacy-gemini-inventory.test.ts` | inventory test (today's set) | design approval |
| 2 | **Consent ledger + rules.** `app/api/account/_ledger.ts`, the privacy section in `firestore.rules`, constants in `lib/consent.ts` | `firestore-rules-privacy`, `privacy-ledger` | design approval |
| 3 | **Presign writes the retention entry.** Upload route; refuses if the ledger write fails | `privacy-upload-consent` (consent part) | design approval |
| 4 | **Erasure helpers.** `userPrefix` in s3-key.ts, `eraseUserPrefix` in s3.ts, the env block in `.env.development.example` | unit tests of the S3 helper against S3Mock | design approval (R5 filed) |
| 5 | **Erasure route + e2e, local only.** `app/api/account/erase/route.ts`, the seed script | `privacy-erase`, `privacy.e2e` | design approval (R2 fallback) |
| 6 | **Delete button on /account** | e2e extended: the UI calls the route and clears local data | R1 |
| 7 | **Attestation route** and the PhoneAuthStep call after sign-in | `privacy-attestation` | blocked: D-19 approval (decision 2), stickiness (decision 4) |
| 8 | **Attestation gate on upload and chat** | `privacy-upload-consent` (attestation part), `privacy-chat-gate` (attestation part) | blocked: decision 2. Chat hard-reject only after step 7's UI ships (D-03a) |
| 9 | **Attestation gate in the scan-route preamble** | `privacy-scan-gate` | blocked: decision 3 (degrade or refuse) |
| 10 | **Phone stored as `"verified"`** | `privacy-phone` | blocked: decision 2 |
| 11 | **Re-confirm `current_products` and `female_skin_context` per scan** | `privacy-reconfirm` | blocked: decision 2, decision 10 (prefill), R6 |
| 12 | **Gemini minimisation:** remove the fields marked remove, allowlist rendering, update the pinned set | inventory test (new set) | blocked: decision 8 |
| 13 | **AI-share consent:** consent route, chat gate, Echo prompt | `privacy-chat-gate` (consent part) | blocked: decision 6 (G1) and decision 7 (copy) |
| 14 | **Processing-consent header** in the scan preamble and `lib/api.ts` | `privacy-scan-gate` (processing part) | blocked: R3 and R4 (capture lane), merge order |
| 15 | **`privacy-report.md`:** commits, test results, the H03 inventory, the open owner items | none (document) | none |

---

## 7. Owner decisions

**Decision 1: Approve this design (README rule 3; tracker H02 says design gate first).**
- **What it means:** no app code is written in this lane until you say yes.
- **Options:** (a) approve as written; (b) approve with changes; (c) reject.
- **Recommendation:** (a), or (b) with your edits to decisions 2–10.
- **Blocks:** every step. **Can start without it:** nothing.

**Decision 2: Approve D-19 ("re-confirm `female_skin_context` and `current_products` on every scan; stop storing the phone number in answers; server-side 18+ attestation"). Status PROPOSED.**
- **What it means:** three changes.
  - A returning user is asked again about pregnancy, contraception, menopause and current products on every scan, instead of having a months-old answer reused silently.
  - The phone number stops being copied into every questionnaire. It stays in the sign-in account.
  - The server, not only the browser, keeps a record that the user said they are 18 or older, and enforces it.
- **Options:** (a) approve all three; (b) approve some (name which); (c) reject.
- **Recommendation:** (a). Each part closes a known gap (audit findings D8 and D14, PREFLIGHT G1.5). Gemini's terms require 18+.
- **Blocks:** steps 7–11. **Can start without it:** steps 1–6, 12–14.

**Decision 3: When a scan arrives with no 18+ record on file, should the scan route refuse it or let it run?**
- **What it means:** the lane brief says the server must refuse a scan without attestation. D-03a ("a new server-side requirement on the scan route degrades, never rejects") says a missing attestation must not break the scan, because cached old app versions and existing users don't have one yet. These two disagree. A recorded under-18 answer is refused in every option; this decision is only about "no record".
- **Options:**
  - (a) **Degrade now, refuse later.** The scan runs and is flagged `attestationMissing`. Upload and chat refuse at once. A constant `SCAN_REQUIRES_ATTESTATION` flips to refuse in a later commit, once old bundles are gone.
  - (b) **Refuse now.** This amends D-03a. Old bundles get an error on scan.
  - (c) **Degrade forever.** Upload and chat still refuse.
- **Recommendation:** (a). It honours D-03a. Users of old bundles never get the photo stored (upload refuses) and never reach Gemini (chat refuses), so a minor gains nothing from an old bundle. It also meets the brief once flipped. Because prod data is disposable (owner, 2026-10-03), the flip can come early.
- **Blocks:** step 9 only. **Can start without it:** everything else. The upload and chat gates (step 8) are not affected by D-03a.

**Decision 4: Is an under-18 answer permanent for that account?**
- **What it means:** if someone answers "under 18" and is blocked, can they come back and answer "18–24"?
- **Options:**
  - (a) **Sticky.** Any under-18 record blocks the account until support clears it.
  - (b) **Latest answer wins.**
  - (c) **Sticky for a period** (a named setting, provisional).
- **Recommendation:** (a). With (b), the server check is bypassed by one back-button. It's simple, and support can clear a genuine mistake.
- **Blocks:** step 7. **Can start without it:** all other steps.

**Decision 5: How long are original face photos kept? (D-16 retention; H01_S3_ERASURE_READINESS "retention gap")**
- **What it means:** the bucket has no lifecycle rule, so photos are kept forever. The consent copy should state a period, and an S3 lifecycle rule should enforce it.
- **Options:** (a) a fixed period after upload (you choose the number); (b) until the account is deleted; (c) keep them forever and say so.
- **Recommendation:** (a), with the number set by you and legal. The lane does not invent a number. This lane builds no lifecycle rule; that is an infra OWNER ACTION.
- **Blocks:** no lane step. It blocks the final retention consent copy and H01 going to production. **Can start without it:** all steps.

**Decision 6: Which Google project and billing tier owns the production Gemini key? (PREFLIGHT G1.2)**
- **What it means:** on the free tier, Google may use users' skin answers for training and let humans read them. D-14 makes the paid tier a release gate. Only you can check AI Studio or the Cloud Console.
- **Options:** (a) the key is already on a paid project: record which; (b) switch the key to `projectskin-a202c` (billing active); (c) move to Vertex AI for residency controls (bigger change, not this lane).
- **Recommendation:** (b) if not already (a). Keep (c) for later.
- **Blocks:** step 13 going live, and the processor wording in decision 7. **Can start without it:** steps 1–12, 14.

**Decision 7: The wording of the new "AI share" consent (D-16, GEMINI_BOUNDARY §8).**
- **What it means:** before Echo sends anything to Gemini, the user must agree to a sentence naming Google as the processor and saying the data leaves India. The lane will not write legal copy.
- **Options:** (a) you or legal supply the final sentence; (b) the lane ships the GEMINI_BOUNDARY §8 draft ("share my skin check with the AI assistant (processed by Google, outside India)") for local testing only, marked DRAFT, and production waits for (a).
- **Recommendation:** (b) for building, then (a) before production.
- **Blocks:** step 13 production use. **Can start without it:** all steps (13 locally, with the DRAFT copy).

**Decision 8: Two contested Gemini fields: `female_skin_context` and `gender`.**
- **What it means:**
  - `female_skin_context` holds pregnancy, contraception and menopause answers. This is the most sensitive data in the app, and today it goes to Google outside India.
  - Removing it means Echo can't tailor wording to pregnancy. Pregnancy safety then has to come from fixed rules, which is where CLAUDE.md wants it anyway: Gemini explains, it does not decide.
  - `gender` adds little once the context answers exist.
  - Name, age and Dryness are marked remove without debate (GEMINI_BOUNDARY §4, D-05).
- **Options:** (a) remove both; (b) remove `female_skin_context`, keep `gender`; (c) keep both.
- **Recommendation:** (a). Send the minimum to a processor outside India. Safety must not depend on the LLM.
- **Blocks:** step 12. **Can start without it:** all other steps (step 1 pins today's set either way).

**Decision 9: After erasure, keep a minimal receipt?**
- **What it means:** after deletion, nothing proves the deletion happened. A receipt outside the user's tree (`erasures/{random}`: erasedAt, step results, and a salted hash of the uid) would let support answer "was I deleted?". But a hashed uid is still pseudonymous personal data.
- **Options:** (a) no receipt; (b) a receipt without any uid, so it only counts erasures; (c) a receipt with a salted uid hash.
- **Recommendation:** (b). It shows that erasures run, without keeping anything linked to the person.
- **Blocks:** nothing (step 5 builds (a); (b) is a small addition). **Can start without it:** all steps.

**Decision 10: Re-confirmed questions: blank, or pre-filled with last time's answer?**
- **What it means:** D-19 says "re-confirm". Pre-filled is faster, but users tap through, which keeps the stale-pregnancy problem D-19 exists to fix. Blank forces a real answer.
- **Options:** (a) blank, with "last time you said: …" shown under it; (b) pre-filled, and the user must tap Continue on that step.
- **Recommendation:** (a).
- **Blocks:** step 11. **Can start without it:** all others.

**Decision 11: Erasure IAM principal (D-17 "blocked on IAM"; H01_S3_ERASURE_READINESS).**
- **What it means:** the only production key today can upload photos but cannot list or delete them, so a production erase can't remove photos.
- **Options:** (a) a separate IAM user or role for erasure with `s3:ListBucket` (prefix `users/*`) and `s3:DeleteObject` on `…/users/*`; (b) widen the uploader key.
- **Recommendation:** (a). A leaked upload key then can't delete data. The lane reads it from the separate erase variable names (§3.1). If versioning is ever turned on, add `s3:DeleteObjectVersion`.
- **Blocks:** H01 in production only. **Can start without it:** all lane steps (S3Mock locally).

**Decision 12: Ownership requests R1, R2 and R6 (§3.4).**
- **What it means:** three small edits outside the lane's file list:
  - a new delete-button component next to the account page (R1);
  - an `adminAuth()` export in admin.ts, or permission to use `getApp("admin")` (R2);
  - updating two expectations in an existing navigation test (R6).
- **Options:** approve each, or route it to main or after merge.
- **Recommendation:**
  - R1: approve; it's a new file in an owned route folder.
  - R2: main adds `adminAuth()`; the lane uses the fallback until then.
  - R6: approve. The test change is exactly the D-19 behaviour change.
- **Blocks:** R1 blocks step 6; R6 blocks step 11. **Can start without it:** steps 1–5, 7–10, 12–14.

Cross-lane items R3, R4, R5 and R7 are requests to the capture lane, routine lane and main, not owner decisions. R3 and R4 block step 14.
