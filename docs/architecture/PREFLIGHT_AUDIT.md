# PREFLIGHT_AUDIT: release gates G1–G4

- **Date:** 2026-10-03.
- **Branch:** `longitudinal-platform`.
- **Mode:** strictly READ-ONLY. Nothing was enabled, created, written, rotated or deleted in any system.

**Classification key**

| Label | Meaning |
|---|---|
| PASS | Verified against the live system and acceptable |
| FAIL | Verified, and it blocks or contradicts the architecture or a legal/consent requirement |
| UNKNOWN | Could not be verified with the access available. The row says what is missing |
| NEEDS HUMAN DECISION | Verified fact, but the right outcome is a policy or product call |

**Methods used:** `vercel api` / `vercel inspect` / `vercel env ls` (names only; Sensitive values cannot be read back); Google Cloud REST APIs called with the backend's Firebase service account from `.env.local` (`testIamPermissions`, `projects.get`, `billingInfo`, Firestore `databases.list`; none of these write); one Gemini `models.list` call (no content sent); `aws s3api get-*`, `aws iam get-*/list-*`, `aws ecs describe-*`, `aws cloudtrail describe-trails`; the Firebase MCP `get_security_rules`; and WebFetch of the official Google pages and the live privacy policy. No user records, object keys or document contents were read.

---

## G1: Gemini project, billing, terms and data handling

### Verified facts

- The local `GEMINI_API_KEY` is valid. `models.list` succeeds and includes `gemini-3.6-flash`, the code default.
- The production key is a Vercel **Sensitive** variable, available in Production and Preview. Its value cannot be read back, so it is not verifiable that production uses the same key as local.
- Firebase project `projectskin-a202c` (number 456198134767, under organisation 268648337035) has **billing enabled** (`billingAccounts/01DB62-78D16B-3157A0`).
- I could not determine which Cloud project owns the Gemini key:
  - The API Keys API is disabled in `projectskin-a202c`, so `keys:lookupKey` returned 403.
  - The service account cannot read Service Usage, so I could not check whether `generativelanguage.googleapis.com` is enabled there.
  - gcloud is not installed.
- Google terms ([Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms), effective 2026-03-23, updated 2026-04-28):
  - Gemini API use is a **Paid Service "only when accessing the API through a Cloud Project associated with an active billing account."**
  - Unpaid: "Google uses the content you submit … to provide, improve, and develop Google products" and "Human reviewers may read, annotate, and process your API input and output."
  - Paid: prompts and responses are not used to improve products; they are logged "for a limited period … solely for detecting and preventing violations."
  - "You must be 18 years of age or older."
  - "You may not use the Services in clinical practice, to provide medical advice, or in any manner that is overseen by or requires clearance from a medical device regulatory agency."
  - Paid services only for users in the EEA, Switzerland or the UK.
  - "This data may be stored transiently or cached in any country in which Google or its agents maintain facilities."
- [Abuse monitoring](https://ai.google.dev/gemini-api/docs/usage-policies) (updated 2026-06-09):
  - Prompts, contextual information and outputs are retained **55 days**.
  - Authorised Google staff may review them.
  - The page draws **no distinction between tiers** and mentions no zero-retention option.

### Findings

| ID | Finding | Class |
|---|---|---|
| G1.1 | The Gemini key works, and the code default model exists | PASS |
| G1.2 | **Which Cloud project owns the production key, and whether that project has active billing.** This decides Paid vs Unpaid. Unpaid means user skin data may be used for training and read by human reviewers. The code (rate-limit.ts:113-120, "share one free-tier quota") suggests free tier, but code is not evidence | **UNKNOWN**. A human must open AI Studio → API keys (or Cloud Console → APIs & Services → Credentials). For the key whose prefix matches production: record its project, and check that project's billing account and the tier AI Studio displays ("Free" / "Tier 1+"). If it is `projectskin-a202c`, billing is already active |
| G1.3 | Whatever the tier, every Echo prompt (quiz answers, scores, region, user messages and the typed **name**) is kept 55 days by Google, may be reviewed by humans, and may be cached in any country | NEEDS HUMAN DECISION. Accept it and disclose it, or move to Vertex AI (which offers data-governance and residency controls) |
| G1.4 | The typed **name** is sent to Gemini (`summarizeSkinCheckAnswers` → `describeStepAnswer` returns raw `text`, skin-check-format.ts:22). The phone number is not (`phone` → null, :23-26) | FAIL (data minimisation; the architecture already removes it, GEMINI_BOUNDARY §4) |
| G1.5 | The 18+ requirement is enforced client-side only (useSkinCheckFlow.ts:364). The chat route has no auth | FAIL against the terms. Fix tracked as C5b and C9 |
| G1.6 | "No medical advice": Echo is a cosmetic explainer with banned words in its prompt, but nothing validates its output. Whether the current free-text Echo complies is a judgement call | NEEDS HUMAN DECISION. Recommendation: treat it as non-compliant until C9's validator ships |
| G1.7 | Gemini `safetySettings` are not set. Per Google's docs the default for 2.5/3 models is OFF | FAIL (code). Tracked in C9 |
| G1.8 | EEA/UK/CH users would require Paid services | UNKNOWN. Is the app geo-restricted to India? (Vercel serves globally; the Firebase phone-auth SMS region policy was not read) |

---

## G2: Can the backend's service account write the required Firestore documents?

### Verified facts

- The local `.env.local` service account is `firebase-adminsdk-fbsvc@projectskin-a202c.iam.gserviceaccount.com`.
- `testIamPermissions` on `projectskin-a202c` returns that it holds:
  - `datastore.entities.create`, `.update`, `.delete`, `.get`, `.list`
  - `datastore.databases.get`
  - `firebaseauth.users.delete`, `.get`
  - `resourcemanager.projects.get`
- It does **not** hold `datastore.indexes.create`, backup-schedule read, Service Usage read or `apikeys.keys.lookup`.
- Firestore `(default)`:
  - location `nam5`, Native mode, Standard edition
  - **PITR disabled**, version retention 3600 s, delete protection disabled
  - no TTL policies configured
- The deployed Firestore rules are identical to the repo's `firestore.rules`.
- In production, `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` are Vercel Sensitive variables. Their values cannot be read.

### Findings

| ID | Finding | Class |
|---|---|---|
| G2.1 | The local Admin service account can create Firestore documents under any path. The Admin SDK bypasses rules. That covers `skinStates`, `consents`, `chatTurns`, `recommendations` and `usage` (C2/C4/C10). It can also delete documents and Auth users, which is what the erasure route (C11) needs | PASS |
| G2.2 | **Is production using the same service account?** Not readable | **UNKNOWN**. A human confirms which service account's key was pasted into Vercel's `FIREBASE_CLIENT_EMAIL` (Firebase Console → Project settings → Service accounts). A future read-only check is possible: a deploy-time log line printing only the client email, with no key material |
| G2.3 | The service account is broad: it can write and delete the entire database and delete any Auth user. A leaked Vercel env means full data loss. Narrowing it to `roles/datastore.user` plus a separate erasure identity is possible but adds a second credential | NEEDS HUMAN DECISION |
| G2.4 | Number of active keys on this service account is unknown, because the IAM API is disabled in the project | UNKNOWN. Check in Console → IAM → Service accounts → Keys |
| G2.5 | Backup schedules are unknown (no permission). PITR is off, so with no backups a Firestore delete is final. That is good for erasure and bad for recovery | UNKNOWN (backups) / NEEDS HUMAN DECISION (recovery vs erasure trade-off) |
| G2.6 | No TTL policy exists. Expected, since `chatTurns` isn't built yet. Creating the `expireAt` TTL policy is an INFRA step in C10 | PASS (nothing to conflict with) |
| G2.7 | Composite indexes (DATA_MODEL §5) must be deployed through the CLI with a human login. The service account cannot create them | PASS (expected; noted for C2 rollout) |

---

## G3: Production S3 bucket `projectskin-skin-originals-prod`

### Verified facts

Bucket and account:
- ap-south-1, account 550428926515.
- **9 objects, 4.68 MB** (count only).

Data protection settings:
- **Versioning: never enabled** (`get-bucket-versioning` returns no status).
- **Object Lock: not configured.**
- **Lifecycle: none.**
- Replication: none.
- Encryption: SSE-S3 (AES256), Bucket Key on, SSE-C blocked.
- Public access block: all four settings on. Ownership: BucketOwnerEnforced.
- **Bucket policy: none.**
- **Server access logging: off.**
- **CloudTrail: no trails in the region.**

CORS:
- PUT allowed from `theprojectskin.com`, `www.`, `skin-check-sigma.vercel.app`, `scan.theprojectskin.com`, **`http://localhost:3000`, `http://localhost:3100`**.

Uploader IAM user `skin-check-uploader`:
- One inline policy: `s3:PutObject` on `…/users/*/scans/*/original.jpg` only.
- **Two active access keys** (created 2026-09-08 17:59 and 18:47 UTC).

ECS task role `skin-scan-ecs-task-role`:
- No attached or inline policies, so it has no S3 access.

The bucket is not in any Terraform state found in either repo.

### Findings

| ID | Finding | Class |
|---|---|---|
| G3.1 | No Object Lock, so there is no WORM retention or legal hold and erasure is technically possible | PASS |
| G3.2 | Versioning off: a `DeleteObject` is final, so erasure needs no version cleanup. The flip side is that an overwrite is also final. The retake bug D6 (same scanId → same key) **permanently destroys the earlier original** | NEEDS HUMAN DECISION. Keep versioning off (simplest erasure) and fix D6 in code, or enable it and add version deletion to C11. Recommendation: keep it off and fix D6 |
| G3.3 | No lifecycle rules: originals are kept indefinitely. The retention consent copy states no period, and the live privacy policy states none either | NEEDS HUMAN DECISION (legal: choose a retention period, then add a lifecycle expiry on `users/`) |
| G3.4 | **Erasure is impossible with current credentials.** The uploader can only PutObject one key pattern, and the ECS role has nothing. C11 needs a new identity or policy with `s3:ListBucket` (prefix-scoped) and `s3:DeleteObject` | FAIL (blocks C11; expected) |
| G3.5 | **The production bucket accepts browser PUTs from `localhost`**, and `.env.local` points at the production bucket, production Firestore and the production CV host. Local development therefore writes real production data | FAIL. Recommend a separate dev bucket and Firebase project. NEEDS HUMAN DECISION on timing |
| G3.6 | No CloudTrail and no S3 access logging: there is no record of who read or deleted face images | FAIL (DPDP Rules require reasonable security safeguards and log retention; the research doc §16 recommends CloudTrail data events). NEEDS HUMAN DECISION on cost |
| G3.7 | No bucket policy denying non-TLS access. Presigned URLs are HTTPS in practice | FAIL (low severity; a one-statement `aws:SecureTransport` deny) |
| G3.8 | Two active access keys on `skin-check-uploader`: one is probably stale from setup | NEEDS HUMAN DECISION (identify which one Vercel uses, then deactivate the other) |
| G3.9 | Encryption at rest is SSE-S3, not SSE-KMS. There is no per-object decrypt audit, which ties to G3.6 | NEEDS HUMAN DECISION (SSE-S3 is acceptable at 9 objects; KMS only if a decrypt audit is wanted) |
| G3.10 | Bucket, CORS, encryption and the IAM user exist outside IaC (drift) | FAIL (process; fold into Terraform before C11/C11a touch IAM) |
| G3.11 | The IAM resource pattern allows only `original.jpg`. C11a (`scored.jpg`) needs a policy change | PASS (expected; noted) |

**Deletion implications, summarised:**
1. Erasing a user's images is one prefix list plus delete. It is final, with no versions or locks.
2. Nothing currently deletes anything.
3. Nothing records who touched what.
4. A buggy erase cannot be undone.
5. A retake already silently overwrites an original today.

---

## G4: Where user images, analysis data and Gemini context travel

Locations, verified:

| System | Location |
|---|---|
| Vercel functions | **iad1, Washington DC, US** |
| Firestore | **nam5, US multi-region** |
| S3 | ap-south-1, Mumbai |
| ECS CV service | ap-south-1, Mumbai |
| Gemini | Google global; "any country" per the terms |
| Firebase Auth | Google global |

### Transfer map

| # | Data | Path | Crosses India border? | In current consent / privacy copy? |
|---|---|---|---|---|
| T1 | Phone number, OTP SMS | Browser → Firebase Auth (Google) | Yes (Google global) | **No** |
| T2 | **Face photo** (1280 px JPEG, the CV input) | Browser → **Vercel iad1 (US)** → ECS Mumbai → back via the US | **Yes: the face image transits the US.** Not stored there by the app. Vercel request logs are not body logs (assumption about the platform) | **No** |
| T3 | Original face photo, full EXIF (possibly GPS) | Browser → S3 Mumbai (direct presigned PUT) | No | Retention consent: partly ("securely retaining my skin image"). No location, no period, no mention of EXIF |
| T4 | Analysis results (7 scores, region scores), quiz answers incl. **pregnancy/breastfeeding, contraception, irregular periods, age band, gender, name, phone**, and consent flags | Browser → **Firestore nam5 (US)**, stored indefinitely | **Yes, at rest in the US** | **No** |
| T5 | Echo context: quiz answers incl. **name** and health-adjacent answers, scores, region, chat messages | Browser → Vercel iad1 (US) → **Gemini (Google, any country; 55-day abuse log; training if unpaid)** | **Yes** | **No.** There is no AI-processing consent purpose at all |
| T6 | Server logs: Vercel `console.*` (error details, scan ids; no images) | Vercel US | Yes | No |
| T7 | CV logs: JSON with request ids, error codes, timings; no images (per main.py logging) | CloudWatch Mumbai, 30 days | No | No |
| T8 | Developer machines: `.env.local` uses production bucket, Firestore and CV | Anywhere a developer is | Possibly | No (internal control issue, see G3.5) |
| T9 | Shopify storefront (separate; not in the scan path) | Shopify | Yes | Presumably covered by the store's own policy |

**Live privacy policy** (theprojectskin.com/policies/privacy-policy, effective 01/07/2026) does not mention:
- facial images, skin analysis or AI processing
- Google, Gemini, Firebase, Vercel or AWS
- any transfer outside India
- image retention periods
- the DPDP Act

It does offer deletion on request ("contact us"). No technical erasure path exists (G3.4).

### Findings

| ID | Finding | Class |
|---|---|---|
| G4.1 | Face images transit the US (Vercel iad1) on every scan (T2), undisclosed | FAIL (disclosure). NEEDS HUMAN DECISION on whether to move Vercel function region to `bom1` (Mumbai), which would also cut a US round trip off scan latency |
| G4.2 | **All structured user data, including pregnancy and menstrual-health answers, is stored at rest in the US** (Firestore `nam5`, T4), undisclosed. A Firestore location cannot be changed after creation; moving means a new database or project and a migration | FAIL (disclosure). NEEDS HUMAN DECISION: disclose and keep, or migrate to `asia-south1` while the data set is still tiny |
| G4.3 | Gemini receives health-adjacent answers and the user's name with no consent purpose, under unverified tier terms (T5) | FAIL. Blocks C9 until G1.2 is resolved and the AI-share consent (C4) exists |
| G4.4 | The privacy policy covers none of T1–T6 | FAIL. LEGAL must update it before longitudinal storage expands what is kept |
| G4.5 | The retention consent copy names no location, processor or period (lib/consent.ts) | FAIL. New consent version needed (C4) |
| G4.6 | DPDP's cross-border model allows transfers except to notified restricted countries; the US is not one, as far as the team knows. Disclosure and purpose limitation still apply | NEEDS HUMAN DECISION (LEGAL to confirm the current restricted-country notification) |

---

## Gate summary

| Gate | Status | What unblocks it |
|---|---|---|
| **G1** Gemini paid tier | **UNKNOWN**. Key valid; owning project and tier not verifiable here | A human checks AI Studio / Cloud Console for the production key's project and billing. If unpaid, enable billing on that project or switch the key to `projectskin-a202c` (billing active) |
| **G2** Service account can write Firestore | **PASS for the local service account**; **UNKNOWN that production uses it** | A human confirms the production `FIREBASE_CLIENT_EMAIL` |
| **G3** Bucket safe for erasure | **PASS** (no Object Lock or versioning to block deletion). **FAIL** for readiness: no delete credential, no audit trail, localhost CORS, not in IaC | IAM change for C11; LEGAL retention period; decisions G3.2/3.5/3.6/3.8 |
| **G4** Transfers documented | **FAIL**. US transit and US storage are undisclosed; there is no AI-processing consent | LEGAL updates the privacy policy and consent copy. Decide `bom1` and the Firestore location before data grows |

**Implications for the implementation map:**
- **C5a and C2 can proceed.** C2 writes to Firestore with a service account that has the needed permissions. It moves no new data across borders: the same scan data already goes to `nam5` today.
- **C9 (Echo on stored data) stays blocked** until G1.2 and G4.3 are resolved.
- **C11 (erasure) stays blocked** until G3.4 and G3.10 are resolved.
- **The Firestore-location decision (G4.2) is cheapest now.** The production dataset is small: 9 S3 objects; the Firestore document count was not read.
