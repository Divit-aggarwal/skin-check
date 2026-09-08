# Phase 3 — Final Production Readiness Report

*2026-09-09 · AWS `550428926515` / `ap-south-1` · Firebase `projectskin-a202c`
· frontend on Vercel*

## Final Verdict

**READY WITH DEPLOYMENT ACCESS REQUIRED**

Engineering is complete, retention consent is implemented and enforced at three
independent layers, and every check passes against real AWS and real production
Firebase: 55 automated tests plus 16/16 live end-to-end assertions. The only
outstanding step is the deployment itself — this session has no Vercel
credentials (CLI absent, no `.vercel` link, no auth), so the four
`S3_SKIN_IMAGES_*` variables could not be set and the Phase 3 build could not be
pushed. Nothing about deployment is claimed as done.

Separately, and not an engineering blocker: the published Privacy Policy still
needs its skin-image retention language (see §7).

---

## 1. Consent implementation

**Exact consent text** (rendered verbatim from `lib/consent.ts`):

> I consent to Project SKIN securely retaining my skin image and associated
> skin-analysis data for the purposes of providing, maintaining, and improving
> my skin analysis experience. I understand that my image will be stored
> securely and handled according to the Project SKIN Privacy Policy.

**Exact consent version:** `skin image retention version 1`

**Exact privacy URL:** `https://theprojectskin.com/policies/privacy-policy`,
link text "Read our Privacy Policy", opening in a new tab.

The URL is a constant in `lib/consent.ts`, not an environment variable. The one
existing legal-URL variable (`NEXT_PUBLIC_TERMS_URL`) points at a *different*
document and is unset in production today — a privacy link that silently
disappears is exactly what a consent control must never do. No duplicate
configuration was introduced and the existing Terms link is untouched.

**Where consent is enforced — four layers, listed by how much they actually
guarantee:**

1. **UI** (`components/skin-check/inputs/PhotoCapture.tsx`) — a second,
   independent checkbox below the existing processing consent. Unchecked by
   default, never preselected, real `<input type="checkbox">` with a proper
   `<label>` (keyboard- and screen-reader-accessible), and **reset on every
   retake** so consent given for one image can never carry to another. Consent
   is never inferred from authentication or from continuing the questionnaire.
2. **Client pipeline** (`lib/api.ts` → `runSkinScan`) — without consent the S3
   upload step is skipped entirely; the analysis still runs, because permission
   to *process* and permission to *retain* are separate permissions.
3. **Presign route** (`app/api/skin-scan/upload/route.ts`) — requires
   `imageRetentionConsent === true` **and** the exact current version string, or
   returns 403 `CONSENT_REQUIRED` before signing anything. This is the enforced
   request contract; being client-asserted, it stops the application's own flow,
   not a client that deliberately lies.
4. **Firestore rules** (`storedImageHasConsent`) — **this is the check that
   holds.** A record claiming `image.stored == true` is rejected unless it
   carries `consent.imageRetention == true` with the exact version. A tampered
   client cannot record a stored image as consented-to.

**How consent is persisted** — `users/{uid}/skinChecks/{scanId}`:

```js
consent: {
  imageRetention: true,
  imageRetentionVersion: "skin image retention version 1",
  imageRetentionConsentedAt: serverTimestamp(),   // never a client clock
}
```

Declined or absent → `consent: { imageRetention: false }` and
`image.stored: false`. The version is compared against the constant before the
record is written, so a session carrying a superseded string is not recorded as
consent to the current wording. Consent lives in component state only — never
in the draft, localStorage, or IndexedDB — so a new scan must ask again. The
analysis-processing consent remains a separate control and a separate concept;
the two are never combined into one boolean.

## 2. S3

| Property | Value |
| --- | --- |
| Bucket | `projectskin-skin-originals-prod` |
| Region | `ap-south-1` |
| Key format | `users/{verified Firebase uid}/scans/{scanId}/original.jpg` |
| Encryption | SSE-S3 `AES256`, bucket key enabled |
| Public access | Block Public Access all four `true`; no bucket policy; no public ACL; `BucketOwnerEnforced`; anonymous GET returns **403** |
| Lifecycle | none — no expiry on user originals |
| CORS | `PUT` only, explicit origins (`theprojectskin.com`, `www.`, `skin-check-sigma.vercel.app`), separate deletable localhost rule, `AllowedHeaders: ["content-type"]`, no `ExposeHeaders` |
| IAM | user `skin-check-uploader`; inline policy allows **only** `s3:PutObject` on `arn:aws:s3:::projectskin-skin-originals-prod/users/*/scans/*/original.jpg` |

IAM verified by probe with the application's own credentials: `GetObject`,
`ListBucket`, `DeleteObject`, `PutObject evil/elsewhere.jpg`, and `PutObject
users/x/scans/y/notoriginal.jpg` all **AccessDenied**; only the intended key
pattern is writable. Presigned URLs live 300 s and are write-only for one key.
No AWS credential reaches the browser; there is no `AWS_*` fallback (an
`AWS_REGION` fallback was removed because Vercel injects its own).

## 3. Authentication

- Client obtains a fresh Firebase ID token per request (`freshIdToken`), sent
  only as an `Authorization: Bearer` header — never persisted anywhere.
- Server verifies with Firebase Admin, `verifyIdToken(token, true)`: signature,
  audience, issuer, expiry **and revocation**.
- The decoded uid is the sole identity. The request body's `scanId` and consent
  fields are the only values read; `uid`, `key`, and `bucket` are inert by
  construction.
- Rejection behaviour: missing, malformed, `Bearer` with no token, raw token,
  Basic, invalid, expired, or revoked → **401**, one identical body
  (`AUTH_REQUIRED`), reason never disclosed. Header shape is checked before any
  credential is touched, and authentication is checked before consent, so an
  unauthenticated request is 401 rather than 403. No FastAPI call is made on a
  rejected request.
- Ownership proved live: user B presigning with A's `uid`/`key`/`bucket`
  received B's own key.

## 4. Firestore

**Schema** (`users/{uid}/skinChecks/{scanId}`): `schemaVersion`, `scanId`,
`answers`, `status` (`completed` | `analysis_failed` | `questionnaire_only`),
`image`, `consent`, `result`, `createdAt`.

**Image metadata:** `{ stored, captureMethod, storage: "s3", key }` — no bytes,
no base64, no public URL. **Consent metadata:** as in §1.

**Ownership rules:** `request.auth.uid == uid` on the path; `imageKeyIsOwn`
forces `image.key` to this user's key for this scan; `storedImageHasConsent`
forces matching consent whenever `stored == true`; `update`/`delete` remain
`false` (append-only). No rule was weakened to make a test pass.

**Deployed:** ruleset `abbf06b4-c569-419d-ad70-d882c9fc6043` (2026-09-08T18:29:34Z),
fetched back from the Rules API and confirmed **byte-identical** to
`firestore.rules`.

## 5. Tests

| Suite | Command | Passed | Failed |
| --- | --- | --- | --- |
| Unit — key validation, presign route (incl. 6 consent cases), client upload/consent gating | `npm test` | **40** (plus 15 skipped — the rules suite, which runs separately) | 0 |
| Firestore rules — emulator (incl. 5 consent cases) | `npm run test:rules` | **15** | 0 |
| Live end-to-end against real AWS + production Firestore | ad-hoc script | **16** | 0 |
| Typecheck / lint / production build | — | clean | — |
| Client bundle + `.env.local` value-level secret scan | — | clean | — |

55 automated (40 + 15) plus 16 live assertions.

Security-relevant coverage: 401 on missing/malformed/Basic/raw/invalid/expired
tokens; forged uid cannot influence the key; 6 traversal/invalid scanIds → 400;
presigned key uses the verified uid and requested scanId; `image/jpeg`; 300 s
expiry; direct PUT succeeds; tampered signed URL → 403; anonymous GET → 403;
out-of-pattern and wrong-user writes denied; Firestore cross-user write, forged
`image.key`, missing consent, and superseded consent version all denied.

**End-to-end result (16/16, real infrastructure, production build of this
code):**

| Test | Expected | Actual | Result |
|---|---|---|---|
| Presign with no retention consent | 403 `CONSENT_REQUIRED` | 403 `CONSENT_REQUIRED` | ✅ |
| Presign with `consent: false` | 403 | 403 | ✅ |
| Presign with superseded version | 403 | 403 | ✅ |
| Presign with current consent | 200 | 200 | ✅ |
| Returned key | `users/{verifiedUid}/scans/{scanId}/original.jpg` | exact match | ✅ |
| `expiresIn` / `contentType` | 300 / `image/jpeg` | 300 / `image/jpeg` | ✅ |
| Direct PUT to S3 | success | 200 | ✅ |
| Anonymous GET of the object | denied | 403 | ✅ |
| Attacker presign with victim's uid/key/bucket | attacker's own key | attacker's own key | ✅ |
| Firestore write, stored image **with** consent | accepted | 200 | ✅ |
| Firestore write, stored image **without** consent | denied | 403 | ✅ |
| Firestore write, superseded consent version | denied | 403 | ✅ |
| Cross-user Firestore write | denied | 403 | ✅ |
| Persisted consent metadata | `true` / exact version / timestamp | `true` / exact version / set | ✅ |
| Persisted image metadata | `stored:true` / `s3` / own key | same | ✅ |
| CV route after upload, authenticated | scan error code for a 1×1 image | 400 `IMAGE_TOO_SMALL` | ✅ |

**Not run:** the browser journey on the *deployed* app (phone OTP → camera →
upload → CV → results), which requires the deployment below.

## 6. Deployment

| Item | State |
| --- | --- |
| Platform | Vercel (`https://skin-check-sigma.vercel.app`, auto-built from this GitHub repo; target domain `https://theprojectskin.com`) |
| Deployed commit/build | **`977d4a1` — pre-Phase-3.** The Phase 3 work is uncommitted on branch `firebase-phone-auth` |
| Vercel environment verification | **Not possible from this session** — no Vercel CLI, no auth, no `.vercel` link. `S3_SKIN_IMAGES_*` presence and the Phase 2 `FIREBASE_*` variables are unverified |
| Production smoke test | **Not run** — depends on the above |

**Required of an authorized Vercel operator, in this order:**

1. Add to the production environment (and Preview, if previews are used):
   `S3_SKIN_IMAGES_REGION=ap-south-1`,
   `S3_SKIN_IMAGES_BUCKET=projectskin-skin-originals-prod`,
   `S3_SKIN_IMAGES_ACCESS_KEY_ID`, `S3_SKIN_IMAGES_SECRET_ACCESS_KEY` (the last
   two marked **Sensitive**; values are in the local `.env.local`, which is
   gitignored, and appear in no committed file or report). No `NEXT_PUBLIC_`
   prefix, and no generic `AWS_*` names.
2. Confirm `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
   exist in the **same** environment, or the presign route returns 500
   `AUTH_MISCONFIGURED`.
3. Deploy the Phase 3 commit. **Ordering matters:** shipping this code without
   the S3 variables makes the presign route return 500 `UPLOAD_MISCONFIGURED`,
   which correctly aborts before CV — verified — so consented users would get an
   upload error instead of results. Env vars must land before or with the code.
4. Run the production smoke test in `DEPLOYMENT.md`, plus the negative cases:
   unauthenticated presign, invalid token, forged uid, invalid scanId, and
   missing retention consent.

## 7. Remaining non-engineering dependency

The Skin Check application is wired to the canonical Privacy Policy URL. The
published Privacy Policy must be updated by the responsible legal/business team
with the finalized skin-image retention language before public launch/marketing.

For the record, and stated as fact rather than assessment: as of 2026-09-09 the
page at `https://theprojectskin.com/policies/privacy-policy` returns 200 and
contains no mention of photographs, facial images, image storage, or retention.
No legal analysis was performed, no legal language was written or modified, and
no claim is made that the current policy is sufficient for facial-image
retention. This is a content-publishing task, not an engineering blocker; the
engineering side is complete.

## 8. Failure handling (preserved)

| Case | Behaviour |
| --- | --- |
| S3 upload fails | CV never runs; no record claims the image was stored; client shows a retryable upload error |
| Upload OK, CV fails | Object kept; `status: "analysis_failed"`; `image.stored: true` with the key; never reported as completed |
| CV OK, Firestore write fails | Object kept, never auto-deleted; persistence is not reported as successful; the draft is deliberately not cleared so answers remain recoverable |
| No retention consent | No upload at all; analysis proceeds; record says `stored: false`, `imageRetention: false` |
| Resumed draft | Original bytes do not survive a refresh, so the record says `stored: false` — under-claims, the safe direction |

No reconciliation worker was added. Draft persistence, TTL, and versioning are
unchanged; consent is not persisted to any draft store.

## 9. Cleanup

All throwaway users, Firestore documents, and S3 objects from every test round
were deleted. `list-objects-v2` on the production bucket reports **`KeyCount:
0`** — no test images remain. No production user data was read or modified.

## 10. Remaining items

**BLOCKERS (engineering):** none.

**REQUIRES AUTHORIZED ACCESS:** Vercel env-var configuration + deployment +
post-deploy smoke test (§6).

**MAINTENANCE NOTE FOR THE NEXT CHANGE**

`uploadOriginalImage` is the only caller of the presign route, and the route now
403s without consent. A future call site added elsewhere must pass consent or it
will silently fail to store — no existing test covers "a new call site forgot
consent", because the gate lives in the request contract rather than in the
function's type. Keep new upload paths going through `runSkinScan`.

**NON-BLOCKING FOLLOW-UPS**

- Published Privacy Policy content update (§7).
- Vercel preview origins are not in the S3 CORS allowlist; add explicitly if
  previews must upload.
- Long-lived IAM access key (Vercel has no execution role). Vercel AWS OIDC
  removes it and is an env-only switch — `lib/s3.ts` already falls back to the
  provider chain. Rotation steps in `DEPLOYMENT.md`.
- The bucket is outside the CV service's Terraform state — fold into IaC.
- HEIC: a native camera `File` may not be JPEG on some devices; bytes are stored
  verbatim under a `.jpg` key with `image/jpeg` metadata. Confirm on real iOS.
- Retention **duration** is an open governance decision; nothing expires today.
- `checkRequestRate`'s cross-origin check is unverified behind Vercel's proxy
  (pre-existing; the trust boundary is the verified token, not the origin).
