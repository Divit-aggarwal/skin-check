# FIRESTORE_RESET_RUNBOOK: recreate `(default)` in asia-south1, functions to bom1

Decision: DECISION_LOG **D-22**, approved by the owner on 2026-10-03. Background: DATA_LOCALITY_DECISION.md.

Scope is **infrastructure only**:
- No application code changes.
- No data is copied. The owner confirmed all current Firestore data is disposable test data.
- Firebase Auth is untouched.

Prepared 2026-10-03 on branch `infra/india-region`, created from `longitudinal-platform`. Every check below was read-only. **No step here has been executed.**

---

## 1. Current state (verified 2026-10-03)

| Item | Value | Source |
|---|---|---|
| Firebase project | `projectskin-a202c`, number `456198134767`, created 2026-09-08, ACTIVE | MCP `firebase_get_project` |
| Databases | exactly one: `(default)` | `firebase firestore:databases:list` |
| `(default)` location | **`nam5`** | MCP `firestore_get_database` |
| Edition / type | STANDARD / FIRESTORE_NATIVE, `freeTier: true` | same |
| Delete protection | **DISABLED**, so the deletion needs no extra step | same |
| PITR | **DISABLED** (version retention 3600 s) | same |
| Backup schedules | **none** | MCP `list_backup_schedules` |
| App Engine integration | `DISABLED` | same |
| Data | 21 test docs: 7 `users`, 14 `skinChecks`, 0 `scanAnalyses`. Disposable by owner decision | DATA_LOCALITY_DECISION §2 |
| Live rules | identical to the `firestore.rules` on `master`'s deployed commit: `users`, `skinChecks` | MCP `get_security_rules` |
| Rules on this branch | the live rules **plus** `users/{uid}/scanAnalyses/{id}`: owner `get, list`; `write: if false`. A strict superset; the old frontend is unaffected | `git diff` vs live |
| Indexes | none, live or in `firestore.indexes.json` | MCP `list_indexes` |
| Storage for Firebase | **never provisioned.** "No active Storage rules", and the app uses S3 for images | MCP `get_security_rules storage` |
| Auth | phone OTP. Project-global, not tied to the database | n/a |
| Code assumptions about the database ID | **none.** Both SDKs call `getFirestore(app)`, which means `(default)` (`lib/firebase/client.ts:28`, `lib/firebase/admin.ts:86`). No env var names a database or location | grep |
| `nam5` references | docs only (PRODUCTION_BASELINE, PREFLIGHT_AUDIT, DATA_LOCALITY_DECISION). None in code, scripts or CI | grep |
| Vercel function region | **`iad1`**. Project setting `resourceConfig.functionDefaultRegions: ["iad1"]`; no `vercel.json` existed. Live header `x-vercel-id: bom1::iad1::…` (edge Mumbai, function Washington) | `vercel api /v9/projects/…`, `curl -D -` |

### Can `(default)` be recreated in asia-south1?

**Yes. No blocker was found.**
- `firebase firestore:locations` lists `asia-south1` (Mumbai) for this project.
- The project was created **after 2024-10-30**. For such projects, the `*.firebasestorage.app` default bucket does **not** set the project's default resource location (Firebase "Storage changes, Sept 2024" FAQ). In any case, that bucket was never provisioned.
- App Engine integration is `DISABLED`, so no App Engine app pins a location.
- The only remaining confirmation is the create call itself. Firestore checks it at creation, so a refusal is visible, safe, and covered by §10.

---

## 12. Owner-only steps, in order

All of this runs as a **project owner** (the Firebase CLI here is logged in as the owner account). The app's service account cannot create or delete databases.

Run every command from the root of this worktree / branch, so `firebase.json` and the rules are the ones in this commit.

```bash
P=projectskin-a202c
```

**Step 0, before you start:** choose an Indian low-traffic window (§11).

### 2. Exact deletion action (IRREVERSIBLE)

> **OWNER ACTION REQUIRED: delete the existing (default) Firestore database.**

```bash
npx -y firebase-tools@latest firestore:databases:delete "(default)" --project $P
# (interactive confirmation; --force skips it)
```

Console equivalent: Firebase console → Firestore → `(default)` → ⋮ → **Delete database**.

Expected result:
- `firebase firestore:databases:list --project $P` shows **no databases**.
- All 21 test documents are gone permanently. **No export is taken**, by owner decision. PITR is off, so there is nothing to recover.
- The ID `(default)` can be reused after **about 5 minutes**.

### 3. Exact recreation action (wait about 5 minutes after step 2)

```bash
npx -y firebase-tools@latest firestore:databases:create "(default)" \
  --location asia-south1 \
  --edition standard \
  --delete-protection ENABLED \
  --point-in-time-recovery ENABLED \
  --project $P
```

If it fails with an "ID in use" or "recently deleted" error, wait a few more minutes and retry the same command.

### 4. Expected location

- `locationId: asia-south1`
- `type: FIRESTORE_NATIVE`
- `databaseEdition: STANDARD`
- `freeTier: true` (the free tier passes to the next database created after deletion)

### 5. Rule and index deployment (immediately after step 3)

```bash
npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes --project $P
```

- Deploys this branch's `firestore.rules`, the live rules plus the owner-read-only `scanAnalyses` block, and the empty `firestore.indexes.json`.
- Until this runs, assume client access to the new database is denied.

### 6. Delete protection

Set at creation (step 3). If you created the database in the console instead:

```bash
npx -y firebase-tools@latest firestore:databases:update "(default)" --delete-protection ENABLED --project $P
```

Every future deletion must first run `--delete-protection DISABLED`. That is deliberate.

### 7. Point-in-time recovery

Set at creation (step 3). It gives 7 days of minute-granularity reads and restores. Console fallback:

```bash
npx -y firebase-tools@latest firestore:databases:update "(default)" --point-in-time-recovery ENABLED --project $P
```

Cost: version storage is billed as normal storage. At the current volume this is negligible.

### 8. Backup configuration

```bash
npx -y firebase-tools@latest firestore:backups:schedules:create --database "(default)" \
  --recurrence DAILY --retention 7d --project $P
```

- Backups live in asia-south1 and restore to a new database in the same location.
- Increase retention once real users exist; up to 14 weeks is allowed.

### Vercel region (independent of steps 2–8; can happen before or after)

`vercel.json` on this branch sets `"regions": ["bom1"]`. Production builds from **`master`** (GitHub integration), so the change takes effect **when this commit reaches `master` and production redeploys**.
- `regions` in `vercel.json` is deployment-level configuration. Vercel documents it as the way to set the default region, and it is expected to take precedence over the dashboard default.
- The Vercel docs do not state the precedence explicitly. The `x-vercel-id` check in §9 is the proof.

Recommended, so that nothing depends on precedence: also set Project → Settings → Functions → Function Regions to **Mumbai (bom1)**, so the dashboard and the repo agree.

---

## 9. Post-reset verification (TASK 4)

### Firestore

| Check | Command | Pass if |
|---|---|---|
| `(default)` exists | `firebase firestore:databases:list --project $P` | exactly one row: `…/databases/(default)` |
| location | `firebase firestore:databases:get "(default)" --project $P` | Location `asia-south1` |
| delete protection | same | Delete Protection `ENABLED` |
| PITR | same | Point In Time Recovery `ENABLED` |
| free tier | MCP `firestore_get_database` | `freeTier: true` |
| backups | `firebase firestore:backups:schedules:list --database "(default)" --project $P` | one DAILY schedule, retention 7 d |
| rules deployed | MCP `firebase_get_security_rules firestore`, or Console → Rules | text equals this branch's `firestore.rules` (includes `match /scanAnalyses/{id}`) |
| indexes deployed | `firebase firestore:indexes --project $P` | `{"indexes": [], "fieldOverrides": []}` |

### Vercel (after this commit is in production)

| Check | Command | Pass if |
|---|---|---|
| deployment region | `vercel inspect <production deployment URL>` | Regions shows `bom1` |
| live function region | `curl -s -o /dev/null -D - -X POST https://skin-check-sigma.vercel.app/api/skin-scan \| grep -i x-vercel-id` | `x-vercel-id: bom1::`**`bom1`**`::…` (the 2nd segment is the function region; today it is `iad1`) |
| S3 signing unaffected | one scan with retention consent | upload succeeds. `lib/s3.ts` signs with `S3_SKIN_IMAGES_REGION`, never Vercel's `AWS_REGION`, so the region move cannot change it |

### Application (production, real phone, after both of the above)

1. **Sign-in:** OTP sign-in succeeds. Existing Auth users still work; Auth was untouched.
2. **Profile record:** the console shows `users/{your uid}` with `phoneNumber` and `lastSeenAt` (written by `upsertProfile` on sign-in).
3. **Scan creation:** complete a Skin Check with a photo and retention consent. `users/{uid}/skinChecks/{scanId}` exists with `schemaVersion: 1`, `status: "completed"`, `image.stored: true`, and `consent.imageRetention: true`.
4. **Scan analysis:** the results dashboard renders the 7 scores. The CV call goes through `/api/skin-scan` (now bom1) to ECS ap-south-1.
5. **Read path:** the previous-scans list shows the scan (`orderBy("createdAt")` on the auto single-field index).
6. **Server-side write path:** **only after C2 (`6e9081d`) is deployed.** `users/{uid}/scanAnalyses/{scanId}_{sha16}` exists with `source: "server"`, and the `/api/skin-scan` response has `persisted: true`. Before C2 is deployed this check is N/A. Production `master` does not write `scanAnalyses`.
7. **Rules behaviour:**
   - Run `npm run test:rules` (emulator; identical rules file). It must pass.
   - Production negative check: a second test account cannot read the first account's `users/{uid}`. Use the Console Rules Playground with the deployed rules; never a forged client.
8. **S3:** `aws s3api list-objects-v2 --bucket projectskin-skin-originals-prod --prefix users/<uid>/scans/<scanId>/ --query 'KeyCount'` returns `1`.

---

## 10. Rollback and contingency

There is **no data rollback**, by owner decision. The old data is not exported, and losing it is accepted.

| Situation | Action |
|---|---|
| Step 3 refuses `asia-south1` (unexpected location pin) | Do **not** retry other regions blindly. Fallback per D-22: create an empty **named** database in asia-south1, e.g. `firebase firestore:databases:create in-prod --location asia-south1 …`. That needs the small code change in DATA_LOCALITY_DECISION §8, so stop and treat it as a new change. Meanwhile, recreating `(default)` in `nam5` restores the previous (empty) behaviour with no code change |
| Step 3 says the ID is still reserved | wait and retry; it is about 5 minutes |
| Rules deploy fails | the app cannot read or write Firestore. Fix and redeploy; the Auth and CV paths keep working |
| Vercel `bom1` misbehaves | revert `vercel.json` (or set the dashboard to `iad1`) and redeploy, or use Vercel Instant Rollback to the previous production deployment. Firestore is unaffected either way |

## 11. Expected downtime

The window runs from step 2 to step 5 and is **about 5–10 minutes**.

In that window production is still on `master` (`1b39f88`):
- **Works:** sign-in (Auth), the CV scan and results display, S3 upload.
- **Fails:** `users/{uid}` profile upsert (non-fatal, logged), saving the Skin Check to history, and the previous-scans list.

Users are test users only, so this is acceptable. The Vercel region change has no downtime: it is a normal deploy, with atomic alias swap.

**Ordering note:** deploy C2 (`6e9081d`) only **after** this reset, so the first `scanAnalyses` records are created in asia-south1.
