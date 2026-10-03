# IMPLEMENTATION_GATE_01: C2 (durable raw analysis) + C5a (recoverable scan lifecycle)

| | |
|---|---|
| Branch | `longitudinal-platform` |
| Round 1 commit | `6e9081dff7059bba3246a7e1608b8d095cc1f74f`: server-side raw preservation, save gate, restore, retake rotation, stale-response guard, blocking save with timeout |
| Round 2 commit | see the commit that adds this revision (`fix(scan): make analysis persistence durable and recoverable`): recoverable server persistence, recovery provenance marker, rejected-save data-loss fix (O1), stale-save-after-retake fix |
| Production base | `1b39f88` (PRODUCTION_BASELINE.md) |
| Deployed? | **No.** Nothing is pushed or deployed. `firestore.rules` is not deployed |
| Team | persistence-engineer and recovery-engineer, two rounds each, on disjoint file sets. The lead reviewed every diff and requested four changes: native fields, the save timeout, the recovery marker, and the O1 fix. One file-ownership exception was granted: a one-line prop type in `StepAnswer.tsx` |

**Out of scope, not implemented:** SkinState, longitudinal comparison, recommendations, Echo/Gemini, dashboard changes beyond recovery, infrastructure.

---

## 1. Root cause: C2 (raw analysis lost)

**Where the raw data is produced (skin-scan, deployed `scan-0.1.5-provisional`):**
- Each map's `_extract` returns per-region stats: `maps/redness.py:28-41`, `pigment.py:52-73`, `texture.py`, `oiliness.py`, `hydration.py`, `pores.py:111-122`.
- `blemishes.py:242-278` is the only producer of `region_hist`.
- `compose.py` merges the stats:
  - into `region_raw_corrected` (`:230-240`, plus `region_px`);
  - sets `region_hist_corrected` and its edges (`:252-253`);
  - computes `*_native` only when `stats=both` (`:271-302`, `main.py:282`);
  - aliases the un-suffixed keys (`:306-308`);
  - returns everything at `:330-344`.
- Overlays are rendered after all measurements are computed and do not affect them.

**Where it was discarded:**
- The only persistence path was the **browser**. `lib/firebase/skin-checks.ts:30-41` `persistableResult` keeps scores, region scores and the pipeline version, and drops `region_raw*`, `region_hist*` and the bin edges.
- That write was a client-SDK `setDoc` made after a user tap.
- `/api/skin-scan` verified the user but discarded the uid. The server never persisted anything.

**Consequences:**
- Every stored scan was unrescorable.
- The only persisted measurement was a browser-supplied copy that the rules do not validate.

## 2. Root cause: C5a (permanent scan/result loss)

There was a single create-only client write, gated on UI state rather than scan state. `scanId` was the only identity of an attempt, and it was rotated only by "Take a new scan". Async callbacks carried no attempt token. Specifically:

- **Refresh mid-analysis.**
  - The draft held no photo until the result arrived.
  - Restore dropped `skin_photo` but kept the section index.
  - The save button guarded only against `loading`.
  - So the save wrote a permanent `questionnaire_only` record (rules deny update).
- **A retake reused the scanId**, so the S3 original was overwritten.
- **Late responses** from superseded attempts overwrote newer state.
- **A failed save went only to the console.** The user advanced anyway, and "Take a new scan" cleared the only copy of the draft.
- **A failed server persist was unrecoverable.** `persisted:false` was stripped by the client schema.
- **Every `permission-denied` counted as "already saved" (O1).** That included genuine rule rejections: a stale consent version, version skew between rules and bundle, or no or another user's auth. The draft was cleared and no record existed: silent loss of the answers and the photo reference.
- **A retake while a save was in flight let the old save finish the new scan.** It cleared the new scan's draft, stopped its draft writes, and stamped `final_phone` onto it, leaving it with no save button and no recovery.

## 3. Exact changes

### 3.1 Server persistence (C2)

Files: `app/api/skin-scan/route.ts`, `lib/scan-analysis-record.ts` (new), `lib/firebase/admin.ts`, `firestore.rules`.

- **Trigger.** The analysis request carries an optional `scanId` form field, validated with `isValidScanId`. Without it, behaviour and response are byte-identical to before. This covers old bundles.
- **Record path.** `users/{verifiedUid}/scanAnalyses/{scanId}_{sha256(analysed bytes)[0:16]}`.
  - The uid comes only from the verified ID token.
  - Fields `scanId` and the full `inputSha256` are stored. Readers join on the **field**, never by parsing the document id.
- **Write.** Admin SDK `.create()`. `ALREADY_EXISTS` counts as success. Other errors get one retry, with a 3 s cap over both attempts. Any failure returns HTTP 200 with the result and `persisted:false`; it never fails the scan.
- **Content.** An explicit allowlist:
  - `scores`, `region_scores`, `regions`, `score_types?`, `region_low_confidence?`, `pipeline_version`
  - `region_raw`, `region_raw_corrected`, `region_hist`, `region_hist_corrected`, `region_hist_bin_edges`, `region_hist_bin_edges_corrected`
  - `region_raw_native`, `region_hist_native`, `region_hist_bin_edges_native`
  - provenance: `schemaVersion:1`, `source:"server"`, `scanId`, `inputSha256`, `requestId`, `captureMethod?`, `persistAttempt?`, `createdAt` (server timestamp)

  **Overlays are never stored.** A field containing nested arrays is stored as `<field>_json` (none do today). Records over 900 KB are skipped.
- **Recovery marker (round 2).** The route accepts `persistAttempt` only if it equals exactly `"recovery"`. It is stored only on records created by the client's background re-request. Normal records are unchanged.
- **Rules.** `match /scanAnalyses/{id}`: owner `get, list`; `write: if false`.
- **Logs.** Error name and code only. Firestore messages contain the document path, which contains the uid.

### 3.2 Recoverable server persistence (C2, round 2)

File: `lib/api.ts`.

- The client parses the optional `persisted` field.
- If `persisted === false` on a successful analysis, it sends **one** background re-request after 5 s: same photo bytes, same `scanId`, no overlays, `persistAttempt=recovery`.
- The re-request's result is never applied to the UI, and its failure is swallowed (warning without payload). The user's result is returned immediately and never waits on it.
- `runSkinScan` additionally returns `persisted` (additive).
- **The browser never writes analysis measurements.** Recovery means re-asking the trusted server path to analyse and persist.

### 3.3 Recovery lifecycle (C5a)

Files: `lib/useSkinCheckFlow.ts`, `lib/skin-check-draft.ts`, `lib/firebase/skin-checks.ts`, `PhotoCapture.tsx`, `PhoneAuthStep.tsx`, `SkinCheckDashboard.tsx`, `StepAnswer.tsx` (prop type only).

| Mechanism | What it does |
|---|---|
| `canSaveScan` | Save is allowed only when `scan.status ∈ {success, error}` **and** `answers.skin_photo === "done"`. Checked on the button and inside the handler |
| Capture-time draft | Photo, `captureMethod`, retention consent version and `originalStored:false` are written to IndexedDB before the request. A refresh restores a retryable error with its photo. The restore also brings back `originalStored` and `retentionConsentVersion` together |
| `photoLostRestore` | If the draft photo is gone, clamp back to the photo step with answers kept, under a **fresh** scanId |
| `scanIdForUpdate` / `updateScan` | Async results carry the scanId they started under, and results from superseded attempts are dropped. A return to `idle` (retake) mints a new scanId; a pure retry keeps it |
| Blocking save | `withTimeout(saveSkinCheck, 15 s)`. On failure or timeout the user sees the retry message on the same button, and the draft is kept. The draft is cleared only after success. `draftFinished` stops later draft writes |
| **O1 fix** (round 2, `skin-checks.ts`) | On `permission-denied`, `getDoc` the same path. It counts as saved **only if the document exists**. Otherwise, including when `getDoc` itself fails, the original error is rethrown, the retry message shows, and the draft is kept. The document shape is unchanged |
| **Stale save** (round 2) | `finishDraftFor` / `completeSave`: a save that lands after the flow has moved to another scanId does nothing. No draft clear, no `draftFinished`, no `final_phone` commit |

## 4. State transitions (after this gate)

Classes:
- **SAFE:** no loss.
- **RECOVERABLE:** recoverable by the stated mechanism.
- **ORPHANED:** permanently unlinked, but data is not corrupted.

| # | From → event | To | Class |
|---|---|---|---|
| 1 | idle → capture, Analyze | loading. Draft `{photo, result:null}` written first; flow advances | SAFE |
| 2 | loading → upload OK + CV OK | success. Server `.create()` `scanAnalyses` (`persisted:true`); draft updated | SAFE |
| 3 | loading → CV OK, persist fails | success, `persisted:false`. Background re-request at 5 s writes `scanAnalyses` with `persistAttempt:"recovery"`, or gets ALREADY_EXISTS if the first write landed late | RECOVERABLE (needs the tab open for 5 s) |
| 4 | loading → upload fails | error, `stored:false`. If the PUT actually landed, the object is at the deterministic key | RECOVERABLE (dashboard retry re-uploads to the same key) |
| 5 | loading → CV fails or times out (client 45 s, server upstream 30 s) | error | RECOVERABLE (dashboard retry) |
| 6 | loading → presign hangs (no timeout) | stuck loading; save blocked | RECOVERABLE (refresh → row 7) |
| 7 | loading → refresh / tab restart within 24 h | restored as error "didn't finish reading"; the server may still complete and persist | RECOVERABLE |
| 8 | any → refresh with IndexedDB lost | photo step, fresh scanId. The old scanId's S3 object and `scanAnalyses` never get a `skinChecks` record | **ORPHANED (O2)** |
| 9 | restored error → save | `skinChecks` = `analysis_failed` (immutable). A later dashboard retry creates `scanAnalyses` | RECOVERABLE by join on `scanAnalyses.scanId` |
| 10 | terminal → Get my results → save OK | draft cleared; dashboard | SAFE |
| 11 | save in flight → tab closed (memory cache drops the write) | reopen at the final step; save again | SAFE |
| 12 | save → 15 s timeout → write lands later → retry | `permission-denied` → `getDoc` exists → saved | SAFE |
| 13 | save → genuine rule rejection | **was ORPHANED (O1)**; now retry message, draft kept | RECOVERABLE |
| 14 | saving → back → retake (X→Y) → X's save lands | **was ORPHANED**; now the stale save is ignored and Y continues | SAFE |
| 15 | draft cleared → tab closed before the dashboard renders | record saved; reopen starts fresh with reused answers | SAFE |
| 16 | dashboard → reload | record in Firestore, summary on /account; the dashboard view isn't rebuilt (overlays never stored) | SAFE (by design) |
| 17 | dashboard error → retry → success | `skinChecks` stays `analysis_failed`; `scanAnalyses` written by the server | RECOVERABLE by join |
| 18 | double-tap Analyze or save | ref guards + disabled button + rules deny duplicate create | SAFE |
| 19 | late response after retake or new scan | dropped; the superseded attempt's S3 object and `scanAnalyses` remain | **ORPHANED (O3)**, by design |
| 20 | retake during in-flight upload/CV (link not disabled) | as row 19 | **O3** |
| 21 | two tabs on the same draft | second save refused; drafts share one slot, so a tab can lose its crash recovery | RECOVERABLE / degrades to O2 |
| 22 | analysis done, user abandons, or returns after the 24 h TTL | S3 + `scanAnalyses`, no `skinChecks` | **ORPHANED (O2)** |
| 23 | S3 stored but the record says `stored:false` | object findable by `scanImageKey(uid, scanId)` | RECOVERABLE. Deletion must use the prefix, never `image.stored` |

**Incomplete vs complete is decidable:**
- **No `skinChecks` doc:** never finished.
- **`completed` (result non-null):** finished.
- **`analysis_failed` plus a `scanAnalyses` doc with that `scanId`:** the analysis succeeded later.
- **`questionnaire_only`:** unreachable for new scans (legacy only).

**Remaining permanently orphaned:**
- O2: abandoned, TTL-expired, or IndexedDB-lost attempts.
- O3: attempts superseded by a retake.

Both leave data unlinked, never corrupted. Both need a server-side reconciler or retention GC, which is out of scope.

## 5. Idempotency

| Operation | Key | Duplicate behaviour |
|---|---|---|
| Server analysis record | `{scanId}_{sha256[0:16]}`, `.create()` | Same bytes → ALREADY_EXISTS → `persisted:true`, the original record is kept unmarked. Different bytes (retake) → a separate record |
| Background re-request | same key | If the first write landed late → ALREADY_EXISTS. Otherwise it creates the record with `persistAttempt:"recovery"`. At most one re-request |
| Client questionnaire save | `skinChecks/{scanId}`, create-only rules | Second write → `permission-denied` → treated as saved only if the doc exists |
| S3 original | `users/{uid}/scans/{scanId}/original.jpg` | Retry reuses the key. A retake now rotates the scanId, so no overwrite |
| Async results | scanId tag | Superseded → dropped |

**Verified against the real Firestore emulator** (round-trip script, demo project, no production):
- The record built from the real CV output fixture was accepted.
- 10,117 bytes.
- No overlays.
- `createdAt` is a Timestamp.
- Raw data read back identical.
- A second `.create()` was refused with `code=6` (ALREADY_EXISTS).

## 6. Persisted document shape (inspected)

```
users/{uid}/scanAnalyses/{scanId}_{sha16}
  schemaVersion: 1                    source: "server"          scanId: string
  inputSha256: string (64 hex)        requestId: uuid           captureMethod?: "native"|"canvas"   (never sent today)
  persistAttempt?: "recovery"         createdAt: Timestamp      pipeline_version: string
  scores{7} · region_scores{4×7} · regions[4] · score_types{7} · region_low_confidence{4}
  region_raw{4 regions × 22 stats}  ==  region_raw_corrected{…}          (alias kept; SKIN_STATE_CONTRACT_FINAL maps only _corrected)
  region_hist{4 × {lab_a_hist[20], lab_a_hist_clip{4}, color_var_hist[20], color_var_hist_clip{4}}}  ==  region_hist_corrected
  region_hist_bin_edges{lab_a_hist[21], color_var_hist[21]}  ==  …_corrected
  region_raw_native / region_hist_native / region_hist_bin_edges_native: null   (stats=both never requested)
```

`users/{uid}/skinChecks/{scanId}` is **unchanged** (schemaVersion 1, same fields).

## 7. Backward compatibility

- **Old Firestore records stay readable.** The `skinChecks` shape, rules and read functions (`listSkinChecks`, `latestSkinCheckAnswers`) are unchanged. The rules suite covers them. The only change in skin-checks.ts is inside the error branch of the writer.
- **Old bundles** send no `scanId`. They get the exact previous response, and nothing is written. No rule rejects anything they send.
- **User-visible scores are unchanged.** Scores, bands and the dashboard are untouched.
- **User-visible recovery changes:**
  - "Get my results" waits for the save (up to 15 s) with a retry.
  - A mid-analysis refresh restores the photo as retryable.
  - A rejected save now shows the retry message instead of silently "succeeding".
- **Deploy order** (when approved): rules, then frontend. Preconditions: PREFLIGHT_AUDIT G2.2 (production service account) and DATA_LOCALITY_DECISION / D-22 (Firestore location).

## 8. Tests executed (lead, at the round-2 commit)

| Check | Result |
|---|---|
| `npx vitest run` | **95 passed**, 24 skipped (the rules suite needs the emulator). Baseline before gate 01: 49 passed |
| Rules suite under the Firestore emulator | **24/24 passed** (includes 4 `scanAnalyses` cases) |
| `npx tsc --noEmit` | clean |
| `npx next lint` | no warnings or errors |
| `npx next build` | compiled successfully |
| Emulator document round trip | pass (§5) |

**New or extended test files:**

| File | Count | Covers |
|---|---|---|
| `scan-analysis-record.test.ts` | 7 | Allowlist, native fields and nulls, nested-array guard, size guard, doc id, recovery marker |
| `skin-scan-route-persist.test.ts` | 9 | No scanId → no write; verified-uid path; idempotent same bytes; distinct retake; failure → `persisted:false`; admin not configured; no uid in logs; marker clamping |
| `api-scan-id.test.ts` | 2 | scanId sent only when given |
| `api-persist-retry.test.ts` | 5 | `false` → exactly one delayed re-request (same scanId and bytes, no overlays, marker); `true` / absent → none; failures swallowed; result not delayed |
| `scan-recovery.test.ts` | 5 | Save gate, restore clamp, id rotation, stale drop, `withTimeout` |
| `save-recovery.test.ts` | 7 | permission-denied: exists → saved / missing → original error / getDoc fails → original error; other errors; timeout-then-retry; stale save after retake; current save |
| `firestore-rules.test.ts` | +4 | `scanAnalyses` owner read; client writes denied |

## 9. Known limitations (documented, not fixed)

1. **O2 / O3 orphans** (rows 8, 19–22): unlinked S3 objects and `scanAnalyses` records. These need a server reconciler or retention GC.
2. **`captureMethod` is never sent** by the client, so it is missing from every record. It is part of the SkinState comparability key (SKIN_STATE_CONTRACT_FINAL §7).
3. **Background re-request:**
   - It needs the tab open for 5 s.
   - It consumes the per-IP rate-limit budget (5/min, 40/day), and a 429 there is swallowed.
   - It is a second CV run, which is why it is marked `persistAttempt:"recovery"`. Its values may differ from what the user saw if CV output is not bit-identical or a deploy lands in between; `pipeline_version` is recorded.
4. **The presign request has no timeout** (`lib/api.ts`). A refresh recovers from it.
5. **No `maxDuration` on `/api/skin-scan`.** Whether the platform default covers the roughly 33 s worst case is unverified.
6. **Under-claims:**
   - The capture-time draft says `originalStored:false` even if the upload landed before a refresh.
   - A record saved `analysis_failed` stays so (immutable) even when the server later stores the analysis. Readers must join.
7. **"Retake photo" is enabled while analysis is loading**, which produces O3.
8. **A restore IndexedDB race** (milliseconds) and a **two-tab single draft slot**.
9. **UX dead end:** after a save, navigating back to the final step shows "Verified…" with no forward button. Data is safe.
10. **Aliases stored twice:** `region_raw` and `region_hist` duplicate the `_corrected` versions, about 4 KB per record. This was kept to preserve the complete engine output; SkinState maps only `_corrected`.

## 10. Files changed (both rounds)

```
app/api/skin-scan/route.ts                      verified uid; .create() scanAnalyses; persisted flag; persistAttempt clamp
lib/scan-analysis-record.ts            (new)    allowlist builder, doc id, size, recovery marker
lib/firebase/admin.ts                           adminDb()
lib/api.ts                                      send scanId; parse persisted; one background recovery re-request
firestore.rules                                 scanAnalyses: owner read, no client write
lib/firebase/skin-checks.ts                     permission-denied counts as saved only if the doc exists (O1)
lib/useSkinCheckFlow.ts                         canSaveScan, photoLostRestore, scanIdForUpdate, withTimeout,
                                                updateScan, draftFinished, finishDraftFor, completeSave
lib/skin-check-draft.ts                         DraftScan.originalStored / retentionConsentVersion
components/skin-check/inputs/PhotoCapture.tsx   capture-time draft; results tagged with scanId
components/skin-check/inputs/PhoneAuthStep.tsx  save gate; blocking save + timeout + retry; stale-save guard
components/skin-check/SkinCheckDashboard.tsx    retry results tagged with scanId
components/skin-check/StepAnswer.tsx            prop types only (onScanChange, onSaved)
tests/scan-analysis-record.test.ts, tests/skin-scan-route-persist.test.ts, tests/api-scan-id.test.ts,
tests/api-persist-retry.test.ts, tests/scan-recovery.test.ts, tests/save-recovery.test.ts,
tests/firestore-rules.test.ts (+4)
```

**Decisions to record in DECISION_LOG** (not edited in this gate, because another session holds uncommitted edits to it):
- **D-21** (exists): `scanAnalyses` is the raw-preservation record.
- **New:** the client may trigger exactly one server re-analysis to recover a failed persist, marked `persistAttempt:"recovery"`. The browser never writes measurements.
