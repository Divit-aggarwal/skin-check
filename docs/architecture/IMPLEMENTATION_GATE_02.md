# IMPLEMENTATION_GATE_02: Trust boundary hardening

| | |
|---|---|
| Branch | `longitudinal-platform` |
| Implementation commit | the commit that adds this file (`fix(trust): authenticate Echo, ground it in server state, make SkinState trust structural (gate 02)`) |
| Depends on | Gate 01 (`users/{uid}/scanAnalyses`, written by the server), gate 03 (`toSkinState`) |
| Deployed? | **No.** It is also **not shippable on its own** (§8) |
| Team | 3 teammates: chat-auth, trusted-context, skinstate-integrity. The lead reviewed every diff before integrating it |

**Gate numbering.** Gates 03 and 04 guessed that "02" was the data-locality work (D-22). This brief assigns 02 to the trust boundary. Data locality stays D-22, outside any numbered gate.

## Core invariant

> **"Client-provided analysis measurements and analysis identity are never authoritative."**

- **Measurements:** every score Echo is grounded in, and every value a SkinState is built from, is read on the server from a record the server wrote, under the uid taken from a verified token.
- **Identity:** a client may *name* a scan (`scanId`) only to choose among its own records. The server builds the path from the verified uid. A record's own `source` field never confers trust; only the collection it was read from does.

---

## 1. Previous trust boundary

```
BROWSER ── scores, regionFocus.scores, answers, full history (incl. "echo" turns) ──► /api/skin-check/chat
            (no authentication; IP rate limit only)                                    └─► Gemini prompt built from those values

toSkinState(record, analysisRef): trusted any record whose record.source === "server"
```

The server built the Gemini prompt, but almost every fact in it came from the browser. `/api/skin-scan` was already authenticated (Phase 2) and wrote the trusted `scanAnalyses` record. Echo ignored that record entirely.

## 2. Attack paths (all closed by this gate)

| # | Attack | Before | Now |
|---|---|---|---|
| A1 | Call Echo without an account (anonymous Gemini spend, prompt probing) | 200 | **401 `AUTH_REQUIRED`** before the config check, the body, or the quota |
| A2 | Send fabricated `scores` so Echo "confirms" any condition | Accepted | **400**: strict schema, so an unknown field is a rejection |
| A3 | Send fabricated `regionFocus.scores` | Accepted | **400** |
| A4 | Inject a fake prior Echo turn ("Echo said your redness is 99%") or rewrite a past turn | Accepted with model authority | **400 `CHAT_HISTORY_INVALID`**: history must carry a server MAC |
| A5 | Name another user's `scanId` | n/a (facts came from the body anyway) | **409 `CHAT_ANALYSIS_UNAVAILABLE`**, the same response as a nonexistent scan. Every read is under `users/{verifiedUid}/…` |
| A6 | Put a `uid` in the body | Ignored | **400** (strict) |
| A7 | Write a `skinChecks` doc with `source: "server"` and raw fields, so it becomes a "trusted" SkinState once a consumer exists | Would have produced `kind: "skinstate"` | **`invalid`**: trust comes from the path |
| A8 | Hand `toSkinState` a forged or cross-user `analysisRef` | Not checked | **`invalid`**: strict path grammar, uid must equal the verified uid, and `docId` must equal `scanAnalysisDocId(scanId, inputSha256)` |

## 3. New trust boundary

```
BROWSER ──(Bearer Firebase ID token; {scanId, region, message, history, historyToken})──► /api/skin-check/chat
   1. IP burst limit (not the boundary)
   2. bearerToken() → verifyFirebaseIdToken(token, checkRevoked=true) → uid      ◄── the ONLY identity
   3. strict body schema (unknown fields → 400)
   4. verifyHistory(uid, scanId, region, history, historyToken) → else 400
   5. daily quota
   6. loadTrustedEchoContext(uid, scanId)  — Admin SDK reads under users/{uid}/:
        scanAnalyses where scanId == X  → scores, region_scores   (MEASUREMENT: server-written)
        skinChecks/{scanId}.answers      → quiz answers          (SELF_REPORTED; .result never read)
   7. composite + region focus derived server-side → Gemini
   8. reply + signHistory(uid, scanId, region, history + user turn + reply)

TRUSTED users/{uid}/scanAnalyses/{scanId}_{sha16} ──(loadTrustedSkinState(uid, docId): path built server-side)──► toSkinState(record, ref, uid)
```

## 4. Exact authorization mechanism

1. **Authentication.**
   - `Authorization: Bearer <Firebase ID token>`, parsed by `bearerToken()`. A missing or malformed header is a 401 before any credential is touched.
   - Verified by `verifyFirebaseIdToken()`: Admin `verifyIdToken(token, true)` checks signature, audience, issuer, expiry **and revocation**.
   - Any failure is the same 401 `AUTH_REQUIRED`. The Firebase reason is logged server-side only.
   - Missing admin configuration → 500 `AUTH_MISCONFIGURED`.
   - These are the same helpers and responses as `/api/skin-scan`; no second auth path exists.
2. **Ownership.**
   - Every Firestore read uses `adminDb().collection("users").doc(uid)`, with `uid` from step 1.
   - The body has no uid, and a body uid is rejected.
   - Admin reads bypass `firestore.rules`, so this path construction **is** the ownership check.
   - The rules are unchanged; the client still cannot write `scanAnalyses` (`allow write: if false`).
3. **Rate limiting** (IP burst and daily quota) remains. It is not part of authentication.
4. **History integrity (signed transcript).**
   - The MAC is HMAC-SHA256 over `JSON.stringify(["echo-history-v1", uid, scanId, region, [[role, text], …]])`.
   - **Key:** `HKDF-SHA256(FIREBASE_PRIVATE_KEY, salt = info = "skin-check/echo-history/v1")`. It is domain-separated from the credential, and no new secret has to be provisioned.
   - **Encoding and comparison:** base64url, compared with `timingSafeEqual` after a length check.
   - **Rules:**
     - empty history needs no token;
     - non-empty history without a valid token → 400;
     - a token is bound to (uid, scanId, region), so it cannot be replayed across users, scans or threads;
     - the only unsigned text per request is the new `message`, which is always sent as a user turn.
   - **Rotation:** rotating the service-account key invalidates every live thread. That is acceptable, because threads live in browser memory and are lost on refresh anyway.
   - **Chat text is deliberately not stored on the server.** That would be a new store of personal data in a US region while D-22 is pending.

**Record selection** (Echo):
- Use the latest **primary** `scanAnalyses` record for the scanId (no `persistAttempt`), because that is the CV run the user saw. A `recovery` record is the fallback.
- If the chosen record is malformed, or no record exists → 409. There is no fallback to an older record.
- The query is equality-only and sorted in code, so it needs no new index.

## 5. SkinState trust invariant

`toSkinState(record, analysisRef, expectedUid)` (pure). The **output shape is unchanged**: skinstate-1 is still frozen.

1. `analysisRef` must be exactly `users/{uid}/{collection}/{docId}`:
   - every segment matches `[A-Za-z0-9._-]{1,128}` and is not all dots;
   - no leading `/`, no empty segment, no whitespace.
2. `uid === expectedUid`. Otherwise the result is `invalid` (cross-user).
3. **Trust is decided by `collection`, never by `record.source`:**
   - `scanAnalyses` → must be `source: "server"`, `schemaVersion: 1`, `inputSha256` 64 lowercase hex, **and `docId === scanAnalysisDocId(scanId, inputSha256)`**, plus every existing strict check. Only this can produce `kind: "skinstate"`.
   - `skinChecks` → **never a SkinState.** `source: "server"` there is a forgery → `invalid`. A legacy reading gives the unchanged `legacy_display`. Anything else → `invalid`.
   - Any other collection → `invalid`.
4. **The pure function cannot prove where bytes came from**, so `lib/skin-state-loader.ts` `loadTrustedSkinState(uid, docId)` is the sanctioned entry point. It validates the segments, builds `users/${uid}/scanAnalyses/${docId}` itself, reads with Admin, and returns `invalid: "not found"` if the doc is missing. It is **server-only** and has no route and no consumer yet.

## 6. Tests

**Suite totals:**

| Suite | Result |
|---|---|
| `npx vitest run` | **199 passed**, 24 skipped (the emulator rules suite) |
| `npm run test:rules` (Firestore emulator) | **24/24 passed**; `firestore.rules` unchanged |
| `npx tsc --noEmit` | clean |
| `npx next lint` | clean |

**New and changed test files:**

| File | Tests | Covers |
|---|---|---|
| `tests/skin-check-chat-auth.test.ts` | 13 | no header; malformed headers; invalid, expired and revoked tokens (reason never leaked); admin not configured → 500; valid token → 200; body `uid` → 400 with no context load or Gemini call; no auth with the Gemini key unset → still 401; trusted context loaded under the verified uid |
| `tests/api-chat-auth.test.ts` | 5 | client sends the Bearer header and the exact new body (no scores or answers); 401 → `auth/required`; signed-out → no request; 409 and `CHAT_HISTORY_INVALID` come through as `ApiError.code` |
| `tests/skin-check-chat-trusted-context.test.ts` | 27 | see below |
| `tests/echo-history-token.test.ts` | 9 | round trip; tampered text; reorder; role flip; truncated or extended history; wrong-length token (no throw); different key; turn-boundary collision; unset key throws |
| `tests/skin-state.test.ts` | 41 | existing contract fixtures, plus the gate 02 cases below |
| `tests/skin-state-loader.test.ts` | 6 | reads exactly `users/{uid}/scanAnalyses/{docId}`; missing → invalid; bad uid or docId (`x/y`, `..`, `a/b`, `""`) rejected without a read |
| `tests/skin-scan-route-persist.test.ts` | — | one call updated to the 3-argument `toSkinState` |

**`skin-check-chat-trusted-context` (27 tests).** It uses an in-memory Firestore that records every read, and asserts on the **arguments passed to the mocked Gemini call**:
- strict 400s for `scores`, `regionFocus`, `answers`, `uid` and `messages`;
- an invalid `scanId`, including `../user-b`, and a region injection attempt;
- Gemini receives exactly the seeded `scanAnalyses` scores and region scores and `skinChecks.answers`. The **seeded `skinChecks.result` with different scores is never used**;
- re-seeding the server record changes the facts, while the same body cannot;
- cross-user → 409, with every read path under `users/user-a/`;
- missing or malformed analysis → 409;
- primary-vs-recovery selection;
- signed history: missing, forged, or bound to another text, uid, scanId or region → 400; a full round trip → 200 with the exact history.

**`skin-state` gate 02 cases:**
- a forged `skinChecks` doc with `source: "server"` and full raw fields → `invalid`, never a SkinState;
- a legacy record presented under a `scanAnalyses`-looking ref → `invalid`;
- a valid server record under a docId for another scan or input → `invalid`;
- non-hex `inputSha256`;
- 9 malformed refs;
- a cross-user ref;
- an invalid `expectedUid`.

**Manual checks.** Run against a real `next dev` server, the **Firebase Auth and Firestore emulators** (project `demo-gate02`), and a throwaway RSA key, with every Firebase and Gemini env var overridden. No production Firebase, no production credential. Two emulator users were created. User A has a server `scanAnalyses` record and a browser-style `skinChecks` doc carrying forged scores (all 0.99) and `source: "server"`.

| # | Request | Result |
|---|---|---|
| 5, 9 | Authenticated user A, own valid scan | **502 `CHAT_SERVICE_ERROR`**. The server log shows `API_KEY_INVALID` from Gemini, so auth and trusted-context loading passed and the request reached the model call. A dummy key was used deliberately, because G1 (Gemini data handling) is still open. That one request carried **synthetic seeded data only** to Google's endpoint and was refused. The facts actually given to Gemini are asserted by the unit tests above |
| 6 | No token, and an invalid token | **401 `AUTH_REQUIRED`** (both) |
| 7 | Body with `scores`, and with `regionFocus.scores` | **400** (both) |
| 7 | Forged prior Echo turn without a token, and with a forged token | **400 `CHAT_HISTORY_INVALID`** (both) |
| 10 | A's token with B's `scanId` | **409 `CHAT_ANALYSIS_UNAVAILABLE`** |
| 10 | A's token with `uid: B` in the body | **400** |

**Check 8, forged `source: "server"` SkinState**, through the real loader and Admin SDK on the emulator:

| Input | Result |
|---|---|
| Valid `scanAnalyses` via `loadTrustedSkinState` | `skinstate` |
| The same bytes stored in `skinChecks` | `invalid` ("skinChecks record claims source \"server\" (forged)") |
| Those bytes presented with a `scanAnalyses` ref | `invalid` ("docId does not match") |
| B loading A's docId | `invalid` ("not found") |
| A's ref with expected uid B | `invalid` ("different user") |
| docId `../x` | `invalid`, with no read |

## 7. Residual risks

1. **Self-reported answers are still browser-written.**
   - `skinChecks/{scanId}.answers` is the user's own quiz input in their own namespace. It is labelled SELF_REPORTED and bounded as before; only known step ids reach the prompt, and the phone and photo answers are never rendered.
   - A user can still put arbitrary text in their own free-text answers. That is prompt injection against *their own* session only, and is pre-existing.
2. **`skinChecks` can still carry forged fields** (rules allow the owner to create it). No consumer may read `result` or `source` from it. `toSkinState` enforces this, and the Echo loader reads only `.answers`. The rules were deliberately not tightened.
3. **Recovery fallback.** When only a recovery record exists, Echo's facts come from a second CV run of the same photo. Scores are image-relative and can differ slightly from what the dashboard (`session.result`) showed. The dashboard itself still renders browser-held results; that display path is outside this gate.
4. **Long threads.**
   - A Gemini reply over 2,000 characters becomes signed history that fails the per-turn bound on the next send (400 without a code, which the client treats as retryable).
   - `MAX_BODY_BYTES` (50 KB) is smaller than 100 × 2,000. A long thread eventually returns 413.
   - Both limits pre-date this gate. Signing removes the client's ability to trim history around them.
   - **Fix later:** cap reply length server-side, or sign only the last 20 turns, which is what `runEchoChat` already uses.
5. **Breaking API.** The strict schema means a tab left open on `/echo` across a deploy gets 400s until refresh.
6. **Key coupling.** The history MAC key is derived from `FIREBASE_PRIVATE_KEY`. A leak of that key already compromises Admin access, so the derived key adds no new exposure. Rotation resets live threads.
7. **Quota on 409.** A 409 is returned after the daily quota is consumed, so a user retrying before the record lands spends quota without a Gemini call.
8. **`toSkinState` still trusts its caller to pass the true path.** Only `loadTrustedSkinState` proves provenance. Future consumers must use the loader; the gate doc and the function comments say so.

## 8. Deployment order (blocking)

- **Gate 01 is not deployed**, so production has no `scanAnalyses` records. Deploying this gate on its own would make **every Echo request return 409**.
- **Required order:** gate 01 (with D-22's decision on recreating Firestore in asia-south1 first, if accepted), then gate 02.
- Gate 04 (`stats=both`, engine build and capture method) is independent of this gate.
- Nothing is deployed or pushed.

## 9. Files changed

```
app/api/skin-check/chat/route.ts         auth; strict body; history verify; trusted context; signed reply
lib/echo-trusted-context.ts      (new)   server-side loader under the verified uid
lib/echo-history-token.ts        (new)   HKDF key, HMAC sign/verify
lib/api.ts                               chat client: Bearer token; {scanId, region, history, historyToken, message}
lib/skin-check-session-context.tsx       session.scanId; per-region thread {messages, historyToken}; reset on scan change
components/skin-check/EchoPage.tsx       sends scanId + region + signed history; Retry resends pre-failure history and token
components/skin-check/SkinCheckDashboard.tsx  passes the displayed result's scanId into the session
lib/skin-state.ts                        toSkinState(record, ref, expectedUid): structural trust
lib/skin-state-loader.ts         (new)   loadTrustedSkinState(uid, docId), server only
docs/research/measurement-validation/phase0/to_skinstate.mts   3-argument call with a structurally valid bench ref (only that hunk)
tests/skin-check-chat-auth.test.ts (new), tests/api-chat-auth.test.ts (new),
tests/skin-check-chat-trusted-context.test.ts (new), tests/echo-history-token.test.ts (new),
tests/skin-state-loader.test.ts (new), tests/skin-state.test.ts, tests/skin-scan-route-persist.test.ts
docs/architecture/IMPLEMENTATION_GATE_02.md (new)
```

**Not changed:**
- `firestore.rules`, the skinstate-1 contract, `lib/gemini.ts`, the CV engine, any measurement, and any database.
- No ContextPackage, longitudinal logic, recommendation, dashboard or forecasting work.

**DECISION_LOG** was not edited, because another session's D-22 and D-24 hunks are uncommitted there. The decisions in §4 (signed transcript instead of server storage, primary-record selection, answers as SELF_REPORTED from `skinChecks`) are recorded here, and should be logged as **D-25 → this file** when the log is next committed.
