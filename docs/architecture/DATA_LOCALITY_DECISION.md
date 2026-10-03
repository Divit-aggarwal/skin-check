# DATA_LOCALITY_DECISION: Firestore nam5 vs India (asia-south1)

Status: **APPROVED by owner 2026-10-03 (DECISION_LOG D-22): Option A, recreate `(default)` in asia-south1.** Execution steps: FIRESTORE_RESET_RUNBOOK.md. Nothing was migrated or changed by this investigation.
Investigated 2026-10-03 with read-only calls only: Firebase MCP (`list_databases`, `list_collections`, `list_documents` with field masks, `list_indexes`, `list_backup_schedules`) and a repo read. No document content beyond `schemaVersion`, `status`, `createdAt` and `lastSeenAt` was read. No UIDs are recorded here.

Resolves the open question in PREFLIGHT_AUDIT **G4.2** ("disclose and keep, or migrate to `asia-south1` while the data set is still tiny").

---

## Owner input (2026-10-03): supersedes the original recommendation

The owner confirmed:
- All 7 users and all 21 documents are **test data**. None of it needs to be preserved.
- As an Indian brand, everything that can run in India should.
- The priority is **cost**, not data continuity.

**Revised recommendation: Option A, recreating `(default)` in `asia-south1`, with no data copy.** Option B's advantages (reversibility, zero downtime, the delta sweep) only matter when the data must survive. Without that constraint, A is cheaper and simpler:

| | A: recreate `(default)` | B: named DB |
|---|---|---|
| Code changes | **none** | env var plus 2 files plus `firebase.json` |
| Free tier (50k reads, 20k writes, 1 GiB per day) | **kept**: it moves to the next database created | lost while `(default)` exists |
| Tooling (console, CLI, MCP) | works as-is | needs `--database` everywhere |
| Downtime | about 5–10 min, irrelevant for test users | none |
| Data | discarded (an optional export can be kept) | copied |

**Runbook (A), run by a project owner:**
1. Optional: `gcloud firestore export` as a keepsake. The bucket must be in the `nam5` location.
2. Delete `(default)`. Delete protection is already disabled.
3. Wait about 5 minutes, then create `(default)` in **`asia-south1`**, Standard edition.
4. Enable delete protection, PITR and a daily backup schedule.
5. `firebase deploy --only firestore` (rules plus the empty index file).
6. Test users sign in again. Their Auth accounts are untouched, and `users/{uid}` is recreated on the next sign-in by `upsertProfile`.
7. Then deploy C2 (committed in `6e9081d`, not yet deployed).

**Fallback:** if step 3 refuses `asia-south1` (the default-resource-location pin in §5, unverified), use Option B with an empty named database. No copy is needed in that case either.

**Cost:**
- Mumbai is a regional location and nam5 is multi-region. Regional locations are priced lower; the one SKU with a published per-location price in the docs consulted (real-time read units) is $0.312 in asia-south1 against $0.60 in nam5 per million.
- At current volume, both sit inside the free tier: effectively $0.
- The Vercel function region change to `bom1` is a setting with no price difference for a single region.

**What still is NOT in India after this:**
- **Firebase Auth** stores phone numbers in Google global infrastructure. There is no region option.
- **Gemini** (AI Studio API) runs in "any country". Vertex AI offers an `asia-south1` endpoint if that matters later.

The sections below are the original analysis, which assumed the data had to be preserved.

## TL;DR (original, data-preserving analysis)

**Recommendation: migrate now, before longitudinal collection, to a new *named* Firestore database in `asia-south1` (Mumbai). Ship C2 (`scanAnalyses`) only after the cutover. In the same change window, move the Vercel function region from `iad1` to `bom1`.**

- The database holds **21 documents**. Migrating 21 documents is trivial. Migrating append-only, provenance-bearing longitudinal history later is not.
- A named database (Option B) is reversible by flipping one env var. There is never a window where no database exists.
- The move makes **Firestore data at rest** India-resident. It does **not** make the system India-resident. Firebase Auth and Gemini stay global (§5, §10).

---

## 1. Exact current data in Firestore

Project `projectskin-a202c`. Exactly one database exists:

| Property | Value |
|---|---|
| Database | `(default)` |
| Location | **`nam5`** (US multi-region) |
| Type / edition | `FIRESTORE_NATIVE`, `STANDARD` |
| Created | 2026-09-08T10:31:16Z |
| Free tier | `true` |
| PITR | **disabled** (version retention 3600 s) |
| Delete protection | **disabled** |
| Backup schedules | **none** |
| Realtime updates | enabled |

Collections (the full tree):

```
users/{uid}                          profile: { phoneNumber, lastSeenAt }      lib/auth-context.tsx:59
  skinChecks/{scanId}                one completed Skin Check, append-only     lib/firebase/skin-checks.ts:77
    { schemaVersion, scanId, answers, status, image, consent, result, createdAt }
  scanAnalyses/{scanId}_{sha16}      C2, server-written via Admin SDK          app/api/skin-scan/route.ts:413 (UNCOMMITTED)
```

`answers` includes health-adjacent answers (pregnancy/breastfeeding, contraception, irregular periods), age band, gender and name. `users/{uid}` duplicates the phone number. See PREFLIGHT_AUDIT T4.

No other top-level collections exist (`list_collections` → `["users"]`).

## 2. Exact document counts

From one recursive `list_documents` (page size 500, **no next-page token**, so the listing is complete):

| Path | Count | Detail |
|---|---|---|
| `users/{uid}` | **7** | all have `lastSeenAt` |
| `users/*/skinChecks/*` | **14** | 8 at `schemaVersion: 1` (7 `completed`, 1 `analysis_failed`); 6 legacy auto-ID docs with no `schemaVersion` (written 2026-09-08 by the pre-`a7b65fa` `addDoc` code) |
| `users/*/scanAnalyses/*` | **0** | C2 is not deployed |
| **Total** | **21** | |

- **All 14 `skinChecks` have a `createdAt` field**, legacy ones included. The `orderBy("createdAt")` history queries therefore see all of them, and `createdAt` is a field value that survives a copy (see §10 R3).
- One user holds 7 of the 14 scans. That pattern fits internal testing, so real-user data is likely a handful of documents. This is an inference.
- **Firebase Auth user count: not read.** `auth_get_users` was denied by the session's permission policy. Auth is not regional and does not migrate (§5), so the migration does not depend on this number.
- Related, from PRODUCTION_BASELINE: S3 `projectskin-skin-originals-prod` (ap-south-1) holds 9 objects. Those are already in India and are untouched by this decision.

## 3. Firestore indexes

| Source | Composite indexes | Field overrides |
|---|---|---|
| Live (`list_indexes`, all collection groups) | **0** | none |
| `firestore.indexes.json` | `[]` | `[]` |

All queries use automatic single-field indexes:
- `skinChecks` `orderBy("createdAt","desc")`, with and without `limit(1)` (skin-checks.ts:177, 206)
- point reads and writes

**There is nothing index-related to recreate.**

## 4. Server and client SDK usage

| Where | SDK | Operation | DB selection today |
|---|---|---|---|
| `lib/firebase/client.ts:28` | `firebase` 12.x web | `getFirestore(firebaseApp())` | implicit `(default)` |
| `lib/auth-context.tsx:59-64` | web | `setDoc(users/{uid}, merge)` **on every auth state change** | via `db()` |
| `lib/firebase/skin-checks.ts:77` | web | `setDoc(users/{uid}/skinChecks/{scanId})` (create-only by rules) | via `db()` |
| `lib/firebase/skin-checks.ts:177,206` | web | history list and latest-scan queries | via `db()` |
| `lib/firebase/admin.ts:85-87` | `firebase-admin` 13.x | `getFirestore(adminApp())` | implicit `(default)` |
| `app/api/skin-scan/route.ts:413` | admin | `.create()` `scanAnalyses` (uncommitted C2) | via `adminDb()` |
| `lib/firebase/admin.ts:105` | admin Auth | `verifyIdToken(token, true)`. **Not Firestore**, unaffected | n/a |
| `lib/api.ts`, `usePhoneAuth.ts`, auth components | web Auth | phone OTP, `getIdToken`. **Not Firestore** | n/a |

Both installed SDKs support named databases. Both `getFirestore(app, databaseId)` overloads exist:
- `node_modules/@firebase/firestore/dist/index.d.ts:1766`
- `node_modules/firebase-admin/lib/firestore/index.d.ts:92`

## 5. Firebase services coupled to the database location

| Service | Coupled? | Notes |
|---|---|---|
| Firestore rules | Per database | Rules are deployed per database. `match /databases/{database}/documents` is already database-agnostic, so the same file works unchanged |
| Firestore indexes | Per database | None exist |
| Firebase Auth (phone) | **No** | Project-global. Phone numbers stay in Google global infrastructure whichever option is chosen |
| Cloud Storage for Firebase | **Possibly** | The client config sets `storageBucket: projectskin-a202c.firebasestorage.app` (.env.local). Nothing in the app uses Firebase Storage; originals go to S3. **Whether that bucket was provisioned, and in which location, was not verified** (gcloud is not installed, and there is no MCP tool for it). This matters only for Option A (§6) |
| Cloud Functions / App Engine | No | none in use |
| Free tier | Yes | One database per project gets the free tier. It currently sits on `(default)` in nam5 |
| Gemini | No | "Any country" per terms. Unaffected |
| Firestore emulator / rules tests | No | `tests/firestore-rules.test.ts` uses project `demo-rules-check` against `(default)` in the emulator. Unaffected |

## 6. Supported migration paths

Verified against Firebase docs (manage-databases, locations, manage-data/move-data):
- **A Firestore location cannot be changed after creation.**
- A project can hold **multiple databases, each with its own location**. `asia-south1` (Mumbai) is a supported regional location.
- Managed **export/import**: the export bucket must be in the **same location as the source database**. If the import target is in a different location, the files must first be copied to a bucket in the **target's location**. Billing (Blaze) is required; the project has billing enabled.
- **Backups** live in the source database's location and restore only to a new database there. They are not a cross-region path. Clone was not verified as cross-region, so treat it as same-region only.
- A deleted database ID (including `(default)`) can be reused after **about 5 minutes**.

| Option | Mechanism | Code change | Rollback | Verdict |
|---|---|---|---|---|
| **A.** Recreate `(default)` in asia-south1 | export (US bucket) → copy to asia-south1 bucket → **delete `(default)`** → wait about 5 min → create `(default)` in asia-south1 → import → deploy rules | none | slow: repeat in reverse | **Not recommended.** It is destructive, and there is a hard window with no database. Its viability is **unverified**: a provisioned default Storage bucket may pin the project's default resource location (§5) |
| **B.** New named DB in asia-south1 | create `in-prod` (name illustrative) in asia-south1 → copy at T0 → flip env var → soak → delta sweep → delete `(default)` | about 3 small edits (§8) | **flip env var back**; `(default)` is left intact | **Recommended** |
| **C.** New Firebase project in asia-south1 | as B, plus new Auth and new phone users | large: Auth users must be exported and imported (phone users import fine), new web config, new service account | moderate | Rejected. All of B's benefit at much higher cost |
| **D.** Stay on nam5 and disclose | update privacy policy and consent copy | copy only | n/a | Viable but worse: the cost of moving only grows (§13) |

Two ways to copy for B at 21 documents. Both run under a project owner:
1. **Managed export/import** (export in a US bucket, copy to an asia-south1 bucket, import into `in-prod`). This is the documented path.
2. **A one-off Admin SDK copy script** (read `(default)` and write `in-prod` with the same paths and fields). It is simpler at this size and needs only entity permissions on both databases.

Either way, verify by comparing per-path document counts and field hashes.

## 7. Is asia-south1 practical for this application?

**Yes.**
- Every query is per-user, there are no composite indexes, and nothing uses Firestore triggers or Functions.
- The data set is 21 documents.
- The CV service (ECS) and the S3 originals are already in ap-south-1, so a Mumbai database co-locates the data plane.
- The only regional-vs-multi-region trade-off is availability. A regional database has a lower SLA (99.99%) than multi-region nam5 (99.999%) and no cross-region failover. For a capture funnel at this scale that is acceptable.
- Cost: a named database gets no free tier while `(default)` holds it. At this volume, billed usage is cents per month. Deleting `(default)` later would hand the free tier to the next database created, but not to an existing one; treat that as unverified.

## 8. Required application changes (Option B)

1. **One env var, read by both SDKs:** `NEXT_PUBLIC_FIRESTORE_DATABASE_ID`. Read it as `process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID ?? "(default)"`, so "unset means today's behaviour" is explicit in code.
   - `NEXT_PUBLIC_` because the browser SDK needs it. It is not a secret.
   - The server reads the same variable, mirroring how `admin.ts` already reuses `NEXT_PUBLIC_FIREBASE_PROJECT_ID`. Two sources for the database ID is how client and server end up split across two databases.
2. `lib/firebase/client.ts:28`: `getFirestore(firebaseApp(), DB_ID)`.
3. `lib/firebase/admin.ts:86`: `getFirestore(adminApp(), DB_ID)`.
4. `firebase.json`: switch `firestore` to the array form, so rules deploy to both databases. Both use the same rules file until `(default)` is deleted.
   ```json
   "firestore": [
     { "database": "(default)", "rules": "firestore.rules" },
     { "database": "in-prod", "rules": "firestore.rules", "indexes": "firestore.indexes.json" }
   ]
   ```
5. Vercel env: set the variable for Production (and Preview if previews use prod data; see PREFLIGHT G3.5), then redeploy. A `NEXT_PUBLIC_` value is inlined at build time, so a redeploy is required.

No change to collection paths, schemas, queries or rules logic.

## 9. Required auth / rules / index changes

- **Auth:** none. Same project, same users, same ID tokens. `verifyIdToken` is database-independent.
- **Rules:**
  - Deploy the existing `firestore.rules` unchanged to `in-prod`.
  - **Do NOT freeze `(default)` with deny-all-writes rules.** `saveSkinCheck` (`lib/firebase/skin-checks.ts`, catch block) treats `permission-denied` as "duplicate, already saved" and returns success. Under a freeze, a scan saved from an old-bundle tab would be **silently dropped while the user is told it saved**.
  - Instead, `(default)` keeps its normal rules through the soak, and stale-tab writes are recovered by the **delta sweep** (§11).
  - If a freeze is ever wanted, `saveSkinCheck` must first distinguish a freeze denial from a duplicate denial. That is a prerequisite, not part of this proposal.
- **Admin writes:** if C2 has shipped before the migration, its writes to `(default)` are covered by the same delta sweep. Under the recommended order (migrate first, then ship C2) this does not arise.
- **Indexes:** none to create.
- **IAM:** the app's service account (`firebase-adminsdk-fbsvc@…`, PREFLIGHT G3) has entity CRUD and `databases.get` only. It cannot create databases, export/import, or deploy rules. A **project owner** runs the migration. The app service account's entity permissions are project-level, so they cover `in-prod` with no change. Confirm this with one test read after creation.
- **New-database hardening:** this is missing on today's database. Enable it at creation:
  - delete protection
  - PITR (7 days)
  - a daily backup schedule

## 10. Expected migration risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | **Split brain:** old-bundle tabs keep writing to `(default)` after the flip (`upsertProfile` fires on every auth state change) | Certain, small volume | Delta sweep at the end of the soak (§11). Residual risk: a write after the final sweep and before deletion. Keep that gap to minutes |
| R2 | Client and server pointed at different databases | Low | One env var for both (§8); smoke test checks a `skinChecks` write and a `scanAnalyses` write land in the same DB |
| R3 | Document **`createTime`/`updateTime` metadata is not preserved** by either copy path | Certain | All app logic uses the `createdAt` field, which all 14 scans have. Record the original `createTime`s in the migration log if provenance needs them |
| R4 | Option A is refused or forced back to nam5 by a pinned default resource location | Unknown | Avoided by choosing B |
| R5 | Migration done by hand with no record | Medium | Owner runbook plus a migration log of counts and hashes before and after, kept with this doc |
| R6 | Regional SLA lower than nam5 | Low impact | Accepted (§7) |
| R7 | **Residency overclaim** in privacy copy | Medium | Copy must say "stored in India" for Firestore data only. Auth phone numbers (Google global), Gemini context and Vercel transit are separate (PREFLIGHT T1, T5, T2) |
| R8 | Preview/dev builds without the env var silently use nam5 | Medium | Set the var on all Vercel environments and `.env.local`; delete `(default)` after the soak, so a stale config fails loudly |

## 11. Cutover sequence and rollback strategy

**Sequence (Option B):**
1. A project owner creates `in-prod` in asia-south1 with delete protection, PITR and a backup schedule. They deploy rules to it.
2. Copy `(default)` → `in-prod` and record the snapshot time **T0**. Verify per-path counts and field hashes.
3. Set the env var and promote the new build.
4. Soak for 7 days. `(default)` stays on normal rules.
5. **Delta sweep:** copy every `(default)` document with `updateTime > T0` into `in-prod`. This is safe to repeat:
   - `skinChecks` and `scanAnalyses` are create-only with deterministic IDs, so ALREADY_EXISTS means skip.
   - `users/{uid}` is a merge upsert, so keep the later `lastSeenAt`.
6. Take a final export of `(default)` (kept in GCS), then run a final sweep and delete `(default)` immediately.
   - **To verify:** a stale tab writing to a deleted database should fail with a not-found-type error, not `permission-denied`. If it returns `permission-denied`, the silent-success problem in §9 returns, and the client must be fixed first.

**Rollback:**
- **During the soak (recommended: 7 days):**
  1. Unset or flip `NEXT_PUBLIC_FIRESTORE_DATABASE_ID` back to `(default)`.
  2. Redeploy (or instant-rollback the Vercel deployment to the pre-cutover build).
  3. Copy any documents written to `in-prod` after cutover back to `(default)`. At current traffic this is a handful; the same copy script works in reverse.
- **After the soak:** `(default)` in nam5 is deleted (after one final export kept in GCS). Rollback becomes "a new migration", which is acceptable once PITR and backups are on for `in-prod`.

## 12. Downtime implications

- **Option B: zero downtime and no write-failure window.** Both databases accept writes throughout. Writes that land in `(default)` after T0 are recovered by the delta sweep (§11).
  - Schedule the work in an Indian low-traffic window anyway, to keep the post-T0 delta small.
- **Option A:** hard downtime for every Firestore read and write from delete through import (at least 5 minutes plus import time), and no fallback database during it.

## 13. Should migration happen before longitudinal data collection?

**Yes, and before C2 ships.**
1. **Size:** 21 documents today. Each longitudinal scan adds a `scanAnalyses` record of about 10 KB plus its `skinChecks` document, indefinitely.
2. **Immutability:** the longitudinal model (CLAUDE.md: provenance, immutable historical states) makes records append-only, with creates only. Migrating them later means re-creating "immutable" records in a new place and explaining the lost `createTime` for each one (R3). Done now, the provenance-bearing records are **born in Mumbai** and never move.
3. **C2 is uncommitted**, and prod has 0 `scanAnalyses`. Order:
   1. migrate
   2. point C2 at `in-prod`
   3. ship C2

   C2 then never needs a migration, and the delta sweep has no Admin-written records to reconcile.
4. **Consent copy (C4) is being rewritten anyway.** Deciding the location first lets one consent version state it correctly.

## Recommendation

| Factor | Weight | Points to |
|---|---|---|
| Current data volume (21 docs) | High | Migrate now: cost is near zero |
| Future longitudinal history (immutable, provenance) | High | Migrate before C2 |
| India user base | High | Mumbai: health-adjacent data at rest in India, co-located with ECS and S3, lower browser latency for India |
| Operational simplicity | Medium | Named DB plus one env var; delete `(default)` after the soak, so there is one database again. Cost: every CLI, MCP and console action must name `--database in-prod`, because the tools default to `(default)` |
| Migration risk | Medium | Low with B: reversible, no read downtime; the main risk (R1) has a concrete control |

**Decision proposed:** Option B, a named database in `asia-south1` with delete protection, PITR and backups. The migration is run by a project owner using the copy (T0) → verify → flip → 7-day soak → delta sweep → final export → delete `(default)` sequence (§11), before C2 ships. LEGAL still owns the disclosure of the non-Firestore transfers (PREFLIGHT G4.4–G4.6).

---

## Appendix: Vercel → AWS geographic path

Source for regions: PRODUCTION_BASELINE §1 (Vercel function region **`iad1`**, Washington DC; ECS and S3 in **ap-south-1**). There is no `vercel.json` or `preferredRegion` in the repo, so `iad1` is the project default.

**Today, per scan (India user):**

```
Browser (IN) ─▶ Vercel edge PoP (bom1, near) ─▶ function iad1 (US)  ── 1st ocean crossing, carries ~300 KB JPEG
   iad1 ─▶ Google (verifyIdToken checkRevoked)                       ── near, US
   iad1 ─▶ ALB api.theprojectskin.com, ap-south-1 ─▶ ECS /scan        ── 2nd crossing, JPEG again
   ECS ─▶ iad1                                                        ── 3rd crossing, JSON
   iad1 ─▶ edge ─▶ Browser                                            ── 4th crossing, JSON
   (after C2) iad1 ─▶ Firestore                                       ── near if nam5, an ocean crossing if Mumbai
Browser ─▶ Firestore nam5 directly (skinChecks write, history read)   ── crossing per call, independent of Vercel
```

**With the function in `bom1` (Mumbai):** all four scan-path crossings disappear, and the face image never transits the US (closes the transit half of PREFLIGHT G4.1).
- `verifyIdToken` goes to Google's nearest front end. Auth is global, and the key fetch is cached.
- The rate limiter is an in-process `Map` (`lib/rate-limit.ts:10`), so it has no regional dependency to move.

**Does it materially help?**
- **Latency: modestly.** India↔US-East round trips are typically about 200–250 ms. These are public ballpark figures, not measured here. Removing two round trips plus the image's transoceanic transfer saves on the order of 0.5–1 s per scan. The CV step itself takes 10–30 s, so that is a few percent of scan time. Echo chat is dominated by Gemini, and Gemini is global, so no meaningful gain there.
- **Compliance: yes, materially.** It stops every face image transiting the US. That is the stronger reason.
- **Pairing with the Firestore move matters.**
  - If only the function moves, the C2 Admin write becomes Mumbai → nam5. That adds about 250 ms per write, still well inside `PERSIST_TIMEOUT_MS = 3000`.
  - If only Firestore moves, the C2 write becomes iad1 → Mumbai, the same penalty in reverse.
  - Moving both makes the server path entirely in-region.

**Recommendation:** set the Vercel function region to `bom1` in the same change window as the Firestore cutover. This is a project setting or one `regions` entry, with no code change. Measure scan p50/p95 before and after from Vercel function logs and CV JSON logs (PRODUCTION_BASELINE §3).
