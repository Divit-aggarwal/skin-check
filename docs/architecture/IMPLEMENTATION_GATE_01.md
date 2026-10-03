# IMPLEMENTATION_GATE_01: C2 (preserve raw analysis) + C5a (recoverable scan save)

| | |
|---|---|
| Branch | `longitudinal-platform` |
| Implementation commit | **`6e9081dff7059bba3246a7e1608b8d095cc1f74f`** |
| Base | `9078fd6` (docs); production is `1b39f88` |
| Date | 2026-10-03 |
| Deployed? | **No.** Nothing is pushed or deployed. Rules are not deployed |
| Team | persistence-engineer (C2) and recovery-engineer (C5a) worked on disjoint file sets. The lead reviewed both and requested two changes (native fields; a save timeout) |

Out of scope and not implemented: SkinState contract, trends, dashboard changes, recommendations, Gemini, forecasting, capture quality, models.

---

## 1. Exact problem

1. **Raw analysis was permanently discarded (D1).** The CV service returns `region_raw*`, `region_hist*` and bin edges: the fixed-edge data needed to rescore scans retroactively. The browser received them, and `persistableResult` (lib/firebase/skin-checks.ts:31-41) dropped them before the only Firestore write. Every stored scan was unrescorable.
2. **The browser authored the only persisted analysis (D3).** The result reached Firestore only through the client SDK, after a user tap. Nothing server-side recorded what the CV service actually returned.
3. **Refresh during analysis created a permanent wrong record (D4).** Sequence:
   - The draft held no photo until analysis finished.
   - Restore dropped `skin_photo` but kept the section index past the photo step.
   - "Get my results" was guarded only against `loading`, so it could save an `idle` scan.
   - That wrote `questionnaire_only` with `result:null`, and the rules deny `update`, so it was permanent.
4. **Dashboard retry results were never persisted (D5).**
5. **Retake reused the scanId (D6).** A second photo overwrote the first original in S3 under the same key.
6. **Late responses could overwrite newer state.** A response from a superseded attempt (after a retake, or after "Take a new scan") was applied anyway.
7. **Save failures were silent.** Failure went only to the console, the user went on to results, and "Take a new scan" cleared the only copy of the unsaved draft.
8. **Restored drafts under-recorded the original (D11, partial).** They lost `originalStored` and `retentionConsentVersion`.

## 2. Root cause

- **(1)(2)** The only persistence path was a client-side, create-only `setDoc`. It received a size-motivated allowlist and ran after the result had passed through the browser. `/api/skin-scan` verified the user but discarded the uid, so the server never wrote anything.
- **(3)(5)(7)** A single client write, gated on UI state rather than scan state, combined with create-only rules. Anything that arrived after that write, or a write made too early, could never be corrected.
- **(4)(6)** `scanId` was the only attempt identity, but it was rotated only by "Take a new scan". Async callbacks had no attempt token.
- **(8)** `DraftScan` had no fields for the original's state.

## 3. Fix

### C2: server-side preservation (app/api/skin-scan/route.ts, lib/scan-analysis-record.ts, lib/firebase/admin.ts, lib/api.ts, firestore.rules)

**Trigger**
- The browser now sends `scanId` with the analysis request (`runSkinScan` → `getSkinScanResult`).
- If `scanId` is valid (`isValidScanId`), the route writes the record after zod validation.
- If it is absent or invalid, behaviour and response are byte-identical to before. This covers old bundles.

**Record**
- Path: `users/{verifiedUid}/scanAnalyses/{scanId}_{sha256(analysed photo bytes)[0:16]}`.
- The uid comes only from the verified ID token.
- The record holds `scanId` and the full `inputSha256` as fields. Readers must never parse the document id.

**Write semantics**
- Admin SDK `.create()` only; it never updates.
- `ALREADY_EXISTS` counts as success. Same bytes always produce the same document (idempotent). A retake with different bytes produces a different document.

**Content: an explicit allowlist**
- Analysis fields: `scores`, `region_scores`, `regions`, `score_types?`, `region_low_confidence?`, `pipeline_version`, `region_raw`, `region_raw_corrected?`, `region_hist`, `region_hist_corrected`, `region_hist_bin_edges`, `region_hist_bin_edges_corrected?`, `region_raw_native?`, `region_hist_native?`, `region_hist_bin_edges_native?`.
- Provenance fields: `schemaVersion: 1`, `source: "server"`, `requestId`, `captureMethod?`, `createdAt` (server timestamp).
- **Never stored:** `overlays` (base64 PNGs) or any unlisted passthrough key.
- Any field containing an array of arrays (which Firestore rejects) is stored as a JSON string under `<field>_json`. None occur today.
- Records over 900 KB are skipped and logged.

**Never breaks the scan**
- One retry, with a 3 s total cap via `Promise.race`.
- Any failure, including admin not configured, returns the normal result with `persisted:false` and HTTP 200. Success returns `persisted:true`.
- Logs carry only the error name and code, never the message, because Firestore messages contain the document path and therefore the uid.

**Rules**
- New block `match /scanAnalyses/{id}`: the owner may `get` and `list`; `write: if false`.
- Existing rules are unchanged.

### C5a: recoverable save (lib/useSkinCheckFlow.ts, lib/skin-check-draft.ts, PhotoCapture.tsx, PhoneAuthStep.tsx, SkinCheckDashboard.tsx, StepAnswer.tsx)

**Save gate.** `canSaveScan(scan, answers)`: the save is allowed only when `scan.status ∈ {success, error}` **and** `answers.skin_photo === "done"`. It is checked both on the button and inside the handler, which covers the signed-out PhoneAuthForm path.

**Capture-time draft**
- On Analyze, the photo, `captureMethod`, `retentionConsentVersion` and `originalStored:false` are written to the IndexedDB draft before the request is sent.
- After a refresh mid-analysis, the scan restores as a **retryable error** with its photo, so nothing is lost.
- If IndexedDB is unavailable, `photoLostRestore` clamps back to the photo step, keeps the answers, and assigns a **fresh scanId**.

**Attempt identity**
- `scanIdForUpdate` and a ref-backed `updateScan` handle this.
- Async results carry the scanId they started under. A result from a superseded attempt is dropped.
- A retake (scan returns to `idle`) mints a new scanId, so S3 originals are never overwritten. A pure retry keeps the id, which makes it idempotent on both S3 and C2.

**Blocking, recoverable save**
- Results open only after `saveSkinCheck` resolves, wrapped in `withTimeout(…, 15 s)`.
- On failure or timeout, the user sees "We couldn't save your results. Check your connection and try again." and the same button retries.
- A save that times out but lands late is harmless: the retry gets `permission-denied`, which `saveSkinCheck` already treats as "already saved".
- The draft is cleared only after a successful save.

**Stop orphan draft writes.** `draftFinished` stops draft writes after the save. This covers a dashboard retry and a remount from /echo.

**Original-state restore.** `DraftScan` gains optional `originalStored` and `retentionConsentVersion`, which are restored together.

### Dashboard retry (D5)

- It reuses the scanId and calls `runSkinScan`, so its result is now preserved server-side by C2 at analysis time.
- No second client persistence path was added. The `skinChecks` record remains as first written.

## 4. Tests

| Suite | Count | Covers |
|---|---|---|
| tests/scan-analysis-record.test.ts (new) | 6 | Allowlist: overlays and unknown keys excluded; native fields kept, `null` preserved; nested array → `_json`; undefined omitted; size guard; deterministic doc id |
| tests/skin-scan-route-persist.test.ts (new) | 8 | No scanId → no write and unchanged response. Valid scanId → one `create` at `users/{verifiedUid}/scanAnalyses/{scanId}_{hash16}`. Body uid ignored. Same bytes → same id, and ALREADY_EXISTS → `persisted:true`. Different bytes → different id. `create` throws → 200 with `persisted:false`. Invalid scanId → no write. Admin not configured → `persisted:false`. Logs contain no uid |
| tests/api-scan-id.test.ts (new) | 2 | Client sends `scanId` on the analysis path; still omits it when absent |
| tests/scan-recovery.test.ts (new) | 5 (table-driven) | Save gate over 4 statuses × photo present/absent; restore clamp (index, dropped answer, new id); idle rotates the id while retry keeps it; stale responses dropped; `withTimeout` rejects a never-settling save and passes through a resolving one |
| tests/firestore-rules.test.ts (extended) | +4 (24 total) | Owner can read `scanAnalyses`; another user cannot; client create refused for the owner and for another user's path |

**Results at commit 6e9081d**
- `npx vitest run`: **81 passed**, 24 skipped. Baseline was 49 passed and 20 skipped. The skipped tests are the rules suite, which needs the emulator.
- Rules suite, run under the local Firestore emulator (`firebase emulators:exec`, demo project, no production access): **24/24 passed**.
- `npx tsc --noEmit`: clean.
- `npx next lint`: no warnings or errors.
- `npx next build`: succeeded.

**Not covered by automated tests**
- UI rendering of the retry message.
- An end-to-end real-browser refresh mid-analysis.

The logic behind both is covered by the pure-function tests above. A manual device test is recommended before deploy (§6).

## 5. Migration and backward compatibility

- **Existing scans stay readable.** `lib/firebase/skin-checks.ts`, `types/` and the `skinChecks` document shape are untouched (`git diff` empty). The skinChecks rules are unchanged, and the rules suite verifies them. `listSkinChecks` and `latestSkinCheckAnswers` read exactly as before.
- **No backfill.** Existing scans have no `scanAnalyses` record and cannot get one: the raw data was never kept.
- **Old bundles in the wild** send no `scanId`. They get the exact previous response, and no write happens. No rule rejects anything they send.
- **Deploy order** (when approved):
  1. Deploy `firestore.rules`. This is additive and safe on its own.
  2. Deploy the frontend.

  Persistence then starts for new bundles only.
- **Precondition G2:** the production `FIREBASE_CLIENT_EMAIL` service account must hold `datastore.entities.create`. This is verified for the local service account and unknown for production (PREFLIGHT_AUDIT G2.2). If it is missing, every response has `persisted:false` and server logs show the error code. Scans are unaffected.
- **User-visible changes**, both inside C5a's scope:
  - "Get my results" now waits for the save, up to 15 s, and offers a retry on failure. This replaces "non-fatal by design".
  - A refresh mid-analysis now restores the photo as "We didn't finish reading your photo. You can try again." instead of silently landing past the photo step.

  Analysis semantics (scores, bands, display) are unchanged.
- **Latency.** A normal Firestore write takes about 100 ms. The first call per instance also pays the Admin SDK's Firestore initialisation. The worst case is bounded at 3 s.
- **Data residency.** The new record goes to the same Firestore database, `nam5` (US), as the existing `skinChecks` data. No new cross-border path is added, but PREFLIGHT_AUDIT G4.2 still stands.

**Known gaps left open (documented, out of scope)**
- After a refresh, the capture-time draft records `originalStored:false` even if the upload had already landed (under-claim).
- If IndexedDB is unavailable after an upload, that original stays in S3 without a Firestore pointer. It is no longer overwritten.
- The original blob is not kept in the draft. This is deliberate: a full-resolution EXIF original should not sit in local storage. So an original upload interrupted by a refresh is not retried.
- No client sends `captureMethod` to the route yet. The field is accepted and validated.
- Differences from IMPLEMENTATION_MAP's C2, following this gate's narrower scope:
  - Collection is `scanAnalyses`, not `skinStates`.
  - No server-minted id when `scanId` is missing.
  - Hash-suffixed ids instead of `requestedScanId`.
  - No `X-Request-ID` forwarded to CV.
  - No `engineBuild`.

  Folding this into the SkinState contract is a later gate. DECISION_LOG should record "D-21: gate 01 uses `scanAnalyses` as the raw-preservation record; SkinState semantics deferred."

## 6. Before deploy (not done here)

1. Resolve G2.2: confirm the production service account.
2. Run a manual device test on iOS Safari and Android Chrome:
   - refresh mid-analysis
   - retake
   - dashboard retry
   - offline save, then retry
3. Deploy the rules, then the frontend. Watch the logs for `analysis record not persisted`.

## 7. Files changed (commit 6e9081d)

```
app/api/skin-scan/route.ts                      C2 write path (verified uid, create, timeout, persisted flag)
lib/scan-analysis-record.ts            (new)    C2 pure allowlist builder, doc id, size
lib/firebase/admin.ts                           adminDb()
lib/api.ts                                      send scanId on the analysis request
firestore.rules                                 scanAnalyses: owner read, no client write
lib/useSkinCheckFlow.ts                         canSaveScan, photoLostRestore, scanIdForUpdate, withTimeout,
                                                updateScan (stale guard + rotate on retake), restore clamp, draftFinished
lib/skin-check-draft.ts                         DraftScan.originalStored / retentionConsentVersion (optional)
components/skin-check/inputs/PhotoCapture.tsx   capture-time draft write; results tagged with scanId
components/skin-check/inputs/PhoneAuthStep.tsx  save gate, blocking save with 15 s timeout, retry message
components/skin-check/SkinCheckDashboard.tsx    retry results tagged with scanId
components/skin-check/StepAnswer.tsx            onScanChange prop type (scan, forScanId?)
tests/scan-analysis-record.test.ts     (new)
tests/skin-scan-route-persist.test.ts  (new)
tests/api-scan-id.test.ts              (new)
tests/scan-recovery.test.ts            (new)
tests/firestore-rules.test.ts                   +4 scanAnalyses cases
```
