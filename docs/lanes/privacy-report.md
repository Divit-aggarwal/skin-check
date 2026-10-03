# Privacy lane report: H01, H02, H03

Branch `lane/privacy` (worktree `../skin-check-privacy`, `PORT_BASE=3400`). Design: [privacy-design.md](privacy-design.md). The owner's decisions are recorded in its §0. Nothing in this lane is pushed. The tracker and DECISION_LOG.md are not edited.

**Read this first: merge blocker.** Three gates live on a second local branch, `lane/privacy-held` (§1, §4 R-A):
- the Echo chat 18+ gate;
- the AI-share consent gate on chat;
- the 18+ gate in the scan-route preamble.

They break tests the lane does not own. If `lane/privacy` is merged without `lane/privacy-held`, **Echo ships with no age gate and no consent gate**, and the scan route ships without the under-18 refusal. Merge both branches together, with the three one-line test patches in R-A.

## Owner approval

The owner approved the design on 2026-10-03, with decisions 2–12 (design §0). The owner's instruction on step 14, quoted from the task: *"Then build steps 1 to 13 and step 15, in order. Skip step 14: it waits until the capture lane is merged."*

## 1. Steps done and skipped

| Step | What | Status | Commit |
|---|---|---|---|
| 1 | H03 pin test against the behaviour before minimisation | done | `c468f1a` |
| 2 | Consent ledger, rules, constants | done | `52cbbbc` |
| 3 | Presign writes the `image_retention` entry (best-effort, capped, one retry) | done | `9808fd5` |
| 4 | `userPrefix` and `eraseUserPrefix` with a separate erase credential pair; env block | done | `bbaa10a` |
| 5 | Erase route, admin.ts R2 (add-only), seed, unit tests and e2e | done | `2155645` |
| 6 | Delete-account section on `/account` (R1) | done | `f8f2b64`, test added in `72b293d` |
| 7 | Attestation route and the call from PhoneAuthStep | done | `743c24c`, under-18 memory in `72b293d` |
| 8 | 18+ gate on chat | **held** on `lane/privacy-held` | `05cbc18` |
| 9 | 18+ gate on upload and in the scan preamble | upload **done** (`4464282`); scan preamble **held** | `38fe247` |
| 10 | Phone stored as `"verified"` | done | `a9719a2` |
| 11 | Re-confirm `current_products` and `female_skin_context` on every scan (R6 applied) | done | `a22a317` |
| 12 | Gemini minimisation and the extra-caution flag | done | `bae775f`, hardened in `72b293d` |
| 13 | AI-share consent: route and Echo prompt **done**; chat gate **held**. **Local only** (decision 6) | partly held | `4b47292`; held `0dda9b9` |
| 14 | Processing consent at scan time | **skipped** on the owner's instruction: it waits for the capture lane to merge. Also blocked on R3 and R4 | — |
| 15 | This report | done | this commit |

**Why some work is held.** Each held gate makes an existing, non-lane test fail. The tests are right about the old behaviour and wrong about the approved new behaviour. The owner's rule says: "If a step needs another file, stop that step and write a request." So the gate code and its own tests are committed on `lane/privacy-held`, which is rebased on `lane/privacy` and not pushed. The fix for each test is one add-only `vi.mock` (R-A). I verified it on throwaway copies:
- **without the patch:** 16 tests fail across the three files;
- **with the patch:** all 54 tests in those files pass.

**One behaviour added beyond the design wording (owner, please confirm).** Design §3.3 said "the age gate stays as it is". The verifier found that the app then never wrote an under-18 record:
- the browser blocks under-18 before sign-in;
- the user could press Back and pick 18–24;
- the server would only ever see 18+.

The fix keeps the gate itself but adds a side effect. When the browser blocks an under-18 answer:
- the device remembers it (`localStorage`);
- if the user is signed in, `"under-18"` is posted at once;
- the phone step attests `"under-18"` if it was ever chosen on that device.

This is still self-attestation: clearing browser storage defeats it.

## 2. Test results

All runs are on `lane/privacy` after the final fixes (`72b293d`).

| Check | Result |
|---|---|
| `npm run test:local`, unit part | **342 passed**, 31 skipped (emulator-only tests, run in the next row), 33 files |
| `npm run test:local`, stack part (emulators, engine 0.1.6, S3Mock) | **31/31**: `firestore-rules` 24, `firestore-rules-privacy` 5, `privacy.e2e` 1, `local-stack.e2e` 1 |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run build` | green; `/api/account/{attestation,consent,erase}` built as dynamic routes |
| `lane/privacy-held`, privacy tests | 113/113 (all `tests/privacy-*`, including `privacy-chat-gate` 10 and `privacy-scan-gate` 3) |
| `lane/privacy-held`, full unit suite | **16 failures**, all in the three unowned files in R-A. All pass with the R-A patch |

Baseline before any change: 242 passed, typecheck and lint clean.

New test files: `privacy-gemini-inventory`, `privacy-ledger`, `firestore-rules-privacy`, `privacy-upload-consent`, `privacy-s3-erase`, `privacy-admin-auth`, `privacy-erase`, `privacy.e2e`, `privacy-attestation`, `privacy-phone`, `privacy-reconfirm`, `privacy-consent-route`, `privacy-delete-account` and `privacy-age-memory`. On the held branch: `privacy-chat-gate` and `privacy-scan-gate`.

**Accepted test limits:**
- **UI tests are pinned at the source.** vitest runs in node with no DOM renderer, and adding one is a new dependency (README rule 6). So `DeleteAccount`, the PhoneAuthStep save payload, the hook's hint state and the under-18 marker are checked by reading their source. The routes behind them have real tests.
- **No direct `eraseUserPrefix` test against S3Mock.** It is exercised against S3Mock through the erase route in `privacy.e2e`. The unit test fakes the SDK.

## 3. What the verifier and the security reviewer found, and what was fixed

**Verifier on the design (before any code):**
- First pass: FAIL with 15 findings. Everything was fixed in `c6b7eeb`, including:
  - the R2 add-only rule spelled out;
  - a home for extraCaution;
  - the receipt's failure handling;
  - the hint source;
  - the DRAFT production blocker;
  - the `CONSENT_CHECK_UNAVAILABLE` code;
  - corrected line references.
- Second pass: 3 leftovers, fixed in `573057e`. It also asked for the step-14 instruction to be quoted; it is quoted above.

**Verifier on the code (fresh view): FAIL, then fixed in `72b293d`.**

| # | Finding | Action |
|---|---|---|
| 1 | Step 6 had no test | Added `privacy-delete-account` (source-pinned) |
| 2 | The app never wrote an under-18 record (bypass by going Back) | Fixed: under-18 memory plus an immediate post when signed in; `privacy-age-memory` added. Owner to confirm (§1) |
| 3 | The inventory test claimed uid and scanId checks the call can't exercise | Claim removed; comment explains why |
| 4 | Re-confirm completeness was not tested | Section-completeness test added |
| 5 | Phone payload checked at the source only | Accepted limit (§2) |
| 6 | No test of a rejected gate read | Added |
| 7 | S3Mock-direct helper test | Accepted limit (§2) |
| 8 | No single test across routes for under-18 then 18–24 | Covered in pieces: the sticky gate (`privacy-ledger`), the attestation response, chat (held). A route-spanning test needs the held branch; proposed row T6 |
| 9 | Revoke ran before the erase-credential check | Fixed: preflight before the revoke |
| 10 | "5 minutes" hard-coded | Fixed: `ERASE_MAX_AUTH_AGE_SECONDS` moved to `lib/consent.ts` |
| 11 | A failed consent POST showed nothing | Fixed: error line on Echo |

**Security reviewer: no high-severity issues.**

| Severity | Finding | Action |
|---|---|---|
| Medium | Writes after an erase can't be erased (an unexpired ID token in Firestore rules, a presigned PUT, an in-flight scan) | Not fixable in lane files (needs a rules change or a second sweep). Proposed row T3 |
| Medium | The extra-caution sentence plus a visible "prescription" answer let Gemini infer pregnancy | **Fixed:** the example list is gone and the trigger answer is hidden when the flag is on. Tested |
| Low-medium | A flood of 18+ entries could make the gate's read time out and fail open on upload and scan | **Fixed:** `ageStatus` makes two fixed-size queries. Tested |
| Low | `err.message` in logs can embed `users/<uid>/…` | **Fixed** in all lane routes and the held chat gate (name and code only) |
| Low | Firestore emulator host not guarded in production | **Fixed** in the erase preflight. admin.ts stays add-only |
| Low | Echo threads signed before minimisation stay valid | `lib/echo-history-token.ts` is not lane-owned. Request R-F |
| Low | No uid shape check before building paths | **Fixed:** `isPlainUid` in `userPrefix` and the erase preflight |
| Low | `summarizeSkinCheckAnswers` defaults to "send everything" | Not changed: a required parameter breaks the unowned `echo-prompt-answers` test. The only Gemini caller passes the allowlist. Proposed row T10 |
| Record only | Gender can be inferred from `male_skin_context`; "Dryness" still arrives as a *self-reported* answer (`primary_concerns`, `skin_type`); erasure resets the sticky under-18 state (D-17 vs decision 4); the account routes share the scan rate-limit bucket | Owner items: rows T7–T9, T11 |

## 4. Requests to other lanes or to main

| # | To | Request |
|---|---|---|
| R-A | owner / main (merge) | **Merge `lane/privacy-held` with `lane/privacy`, and add one add-only block to each of three unowned tests** (block 1 to the first two, block 2 to the third). Without it, chat and scan ship ungated (16 tests fail with the gates and no patch). No assertion is removed. |
| R5 | main | `lib/dev-env-guard.cjs` must learn `S3_SKIN_IMAGES_ERASE_ACCESS_KEY_ID` and `S3_SKIN_IMAGES_ERASE_SECRET_ACCESS_KEY` before the lane merges. |
| R9 | owner / main (after merge) | `components/skin-check/SkinCheckFlow.tsx`: under a re-confirmed step, render the hook's `lastAnswerHints[step.id]` (decision 10a). The hook already provides it. |
| R-F | main | `lib/echo-history-token.ts`: bump `LABEL` to `…/v2` (and the `echo-history-v1` tag) when this lane merges, so Echo threads signed before minimisation stop verifying. |
| R-G | main | Align `docs/architecture/GEMINI_BOUNDARY.md`: purpose `ai_share` (not `ai_assistant`) and code `AI_CONSENT_REQUIRED` (because `CONSENT_REQUIRED` already means image-retention consent on upload). |
| R3, R4 | capture lane | Step 14 (processing consent at scan time) waits on these, as in the design. |
| R8 | capture lane | Needed only when `REQUIRE_AGE_ATTESTATION` flips to true: no endless retry on `UNDER_18` or `ATTESTATION_REQUIRED` in PhotoCapture. |
| R7 | routine lane | Optional: a "Your data and consents" link from the dashboard to `/account`. |

The three patches for R-A, verified on copies.

Block 1, for `tests/skin-check-chat-auth.test.ts` and `tests/skin-check-chat-trusted-context.test.ts`, placed just before `import { POST }`:

```ts
// Privacy lane (H02a/H03c): this suite tests auth and trusted context, not the
// consent gates (tests/privacy-chat-gate.test.ts), so the user is attested and consented.
vi.mock("@/app/api/account/_ledger", async () => {
  const actual = await vi.importActual<typeof import("@/app/api/account/_ledger")>("@/app/api/account/_ledger");
  return { ...actual, ageStatus: async () => "over18", latestGrant: async () => true };
});
```

Block 2, for `tests/skin-scan-route-persist.test.ts`, placed just before `import { POST }`:

```ts
// Privacy lane (H02a): the 18+ preamble gate has its own suite
// (tests/privacy-scan-gate.test.ts); here it always goes ahead.
vi.mock("@/app/api/account/_ledger", () => ({ scanAgeGate: async () => null }));
```

## 5. The final list of fields sent to Gemini (H03)

There is one `generateContent` call (`lib/gemini.ts`). The pin test is `tests/privacy-gemini-inventory.test.ts`.

**Sent:**
1. Persona and fixed rules text (constant).
2. Quiz answers, as option labels from our own config, with unknown values dropped:
   - `primary_concerns`
   - `skin_type`
   - `breakout_pattern`
   - `acne_areas`
   - `pih_scar_tendency`
   - `skin_tone`
   - `current_products` (the trigger value is hidden while extra caution is on)
   - `male_skin_context`
   - `skin_factors`
   - `diet`
   - `water_intake`
   - `sunscreen_habit`
3. Whole-face bands: Redness, Oiliness, Texture irregularity, Blemishes, Pigmentation.
4. `topConcerns` and `summaryLine`, recomputed without hydration.
5. Region label (one of 4) and that region's bands (the same five categories).
6. The `extraCaution` flag, sent only as one fixed sentence: "Extra caution applies to this user. Do not suggest any active ingredients. Advise them to ask a doctor before starting anything new."
7. The user's message (≤ 2000 characters) and the last 20 history turns (HMAC-signed).

**Not sent, and pinned:**
- name, age, gender, `female_skin_context`;
- `phone_verify`, `final_phone`, `skin_photo`;
- the Dryness/hydration band, also kept out of the concerns and summary;
- Pores;
- numeric scores;
- uid, scanId and image bytes;
- consent fields;
- unknown keys.

**Provisional (E05):** `EXTRA_CAUTION_TRIGGERS = { female_skin_context: ["pregnant_or_breastfeeding"], current_products: ["prescription"] }`.

**Known inferences:** gender from `male_skin_context`; self-reported dryness from `primary_concerns` and `skin_type`.

## 6. Proposed tracker rows

| # | Row | Type |
|---|---|---|
| T1 | **Merge blocker:** merge `lane/privacy-held` with `lane/privacy`, and apply R-A | merge |
| T2 | **Deploy blocker:** step 13 (AI-share consent) is local only until decision 6 (Gemini key and tier) and final copy (decision 7a). `AI_SHARE_CONSENT_VERSION` contains `DRAFT` and a test pins it | owner |
| T3 | Writes after an erase: a second S3 and Firestore sweep after max(upload URL lifetime, ID-token lifetime), or a short-lived uid tombstone checked by rules and the upload route. Needs a rules change outside this lane | new |
| T4 | Production erasure: the owner's erase IAM principal (decision 11a), plus R5. Re-check versioning and Object Lock before go-live | owner |
| T5 | Retention period (decision 5): a number, then an S3 lifecycle rule (infra). `IMAGE_RETENTION_PERIOD_DAYS` is `null` | owner |
| T6 | A test across the routes for "under-18 then 18–24 stays refused on upload, scan and chat", after the held branch merges | test |
| T7 | Erasure resets the sticky under-18 state (D-17 vs decision 4): decide whether to keep anything | owner |
| T8 | Decision 8 scope: confirm that self-reported "Dryness" answers (`primary_concerns`, `skin_type`) may still go to Gemini; only the measured band was removed | owner |
| T9 | Gender can be inferred from `male_skin_context`: accept, or drop that step from Gemini too | owner |
| T10 | After R-A, make `summarizeSkinCheckAnswers`'s allowlist required, and update `echo-prompt-answers` | cleanup |
| T11 | Give the account routes their own rate-limit bucket (today they share the scan bucket, 5 per minute per IP) | cleanup |
| T12 | E05 clinical review of `EXTRA_CAUTION_TRIGGERS` and of the caution sentence | clinical |
| T13 | `REQUIRE_AGE_ATTESTATION` → true once old bundles are gone (decision 3a), with R8 | later |
| T14 | Step 14, processing consent at scan time, after the capture lane merges (R3, R4) | lane |
| T15 | §5.1 row 17: confirm the engine writes no image to disk or S3 | verify |
| T16 | A DOM test renderer, so UI flows can be tested beyond source pins (needs approval for a new dependency) | test |

## Open owner items

- Erase IAM principal (decision 11a): the principal and its policy. The lane reads `S3_SKIN_IMAGES_ERASE_*` and fails closed when they are unset.
- Retention period (decision 5): not decided. No number is used anywhere.
- G1, the Gemini key project and tier (decision 6).
- Final AI-share copy (decision 7a).
- Confirm the under-18 memory added in §1.

## 7. Commits

On `lane/privacy` (oldest first):
- `ab7eed7` docs: owner decisions in the design
- `c6b7eeb` docs: verifier fixes
- `c468f1a` step 1
- `52cbbbc` step 2
- `9808fd5` step 3
- `573057e` docs: re-check leftovers
- `bbaa10a` step 4
- `2155645` step 5
- `f8f2b64` step 6
- `743c24c` step 7
- `4464282` step 9, upload part
- `a9719a2` step 10
- `a22a317` step 11
- `bae775f` step 12
- `4b47292` step 13, owned part
- `72b293d` review fixes
- this report (step 15)

On `lane/privacy-held`, local only and rebased on `72b293d`:
- `05cbc18` step 8
- `38fe247` step 9, scan part
- `0dda9b9` step 13, chat part
- `e7f4769` log fix
