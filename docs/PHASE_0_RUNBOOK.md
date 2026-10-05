# DEPLOY RUNBOOK: everything on `longitudinal-platform`

## STAGE 1 CHECKLIST: test deploy for the owner's own test accounts

Stage 1 puts everything on `longitudinal-platform` into production and checks it with the owner's made-up test accounts only. Real users come in Stage 2, after the Stage 2 items at the end of this list. Every step below is detailed further down in this runbook. **The owner runs every step**; the agent prepared this file only.

**Know before you start:**
- The Vercel project is on the Hobby plan: production cannot be password-protected. During Stage 1 the live site serves anyone who visits. Do not announce it.
- Firebase Auth, the S3 bucket and the engine are shared with the current live site from the first step that touches them.
- All production data is test data (owner decision, D-22).

| # | Step (section) | Who | Time | Stop line after it |
|---|---|---|---|---|
| 0 | Log in: `aws login`, `npx -y firebase-tools@latest login --reauth`, `vercel login` if needed; re-read production (C0, the A0 checks, B1 check) and compare with "Production state checked 2026-10-06" below | Owner | 10 min | Stop if anything differs from what this runbook assumes |
| 1 | P1: done (the engine branch is on GitHub, checked 2026-10-06); re-check only | Owner | 1 min | |
| 2 | P2 / B01: remove the Admin and S3 keys from the laptop; rotate the Firebase Admin key and put the new one in Vercel Production | Owner | 20 min | Stop until `.env.local` holds no production key |
| 3 | **Job C** from C2: task definition `skin-scan:2`, baseline, update service, watch 30 min, smoke scan, replay | Owner | 75 min | **STOP: JOB C DONE** |
| 4 | **Job A**: Firestore `(default)` to asia-south1 (A1 cannot be undone; 5-10 min outage) | Owner | 30 min | **STOP: JOB A DONE** |
| 5 | **Job B**: Vercel functions to bom1 | Owner | 15 min | **STOP: JOB B DONE** |
| 6 | **Job S**: S1 erase user, S2 erase keys, S3 `CRON_SECRET`, S4 no dev settings, **S6 `GEMINI_MODEL_SYNTHESIS`** (Stage 1 needs it). Skip S5 (photo expiry) until decision 5 | Owner | 25 min | **STOP: JOB S DONE** |
| 7 | **Job D**: D0 A14 merge (resolve `DECISION_LOG.md` and `vercel.json`), D1 push and PR, D2 merge = production deploy, D3 rules and chat-turn expiry right after Ready | Owner | 45 min | **STOP before D2**: tests green on the merged branch. **STOP before D3**: D2 Ready |
| 8 | **D4** checks with two made-up test accounts: login, photo upload, engine, Gemini (English and Hinglish), rate limit, trust boundary, delete and the next daily sweep | Owner | 60 min + next sweep (03:00-03:59 IST) | **STOP: JOB D DONE**. Stage 1 is live |

Total: about 4.5 hours of owner time, plus waiting for the next daily sweep (step 8).

**What a Stage 1 test user sees, and why it is accepted for Stage 1 only:**
- Echo's AI-share consent starts with "DRAFT:" (H06 not final).
- The routine page lists three products named "Sample … (SYNTHETIC - replace)" (E01 not supplied).
- A red-flag or self-harm message gets the referral with no helpline number (F06).
- The Gemini key is whatever key is in production now (G1 undecided): use made-up answers only. Echo allows 18 chat requests a day across all users (F14).
- Product recommendations are off; the safety check is on and marked provisional.

**Must be done before Stage 2 (real users):** F06 helpline number, H06 final consent copy, G1 Gemini key and tier, F14 daily limit, E01 real catalogue (or hide the routine page), decision 5 and S5 photo expiry, and a review of everything the Stage 1 test accounts saw.

## Production state checked 2026-10-06 (read-only)

| Item | Found | Runbook assumes | Same? |
|---|---|---|---|
| Frontend in production | Vercel `dpl_7aCicWiHeqEJuer3grPWqpC3dTow`, commit 1b39f88, regions `[iad1]`, project region iad1, no crons; `x-vercel-id: bom1::iad1::…` | same (B not run) | Yes |
| `origin/master` | 1b39f88 (the local `master` branch is an unrelated 55b6f74; use `origin/master`) | 1b39f88 | Yes |
| Engine health | `scan-0.1.5-provisional`, cv2 4.11.0 | 0.1.5 live until C3 | Yes |
| Engine branch on GitHub (P1) | `engine-build-identity` at 8dc37dc on the remote | P1 not run | **No: P1 is already done** |
| ECS task definition, live image digest, 0.1.6 and rollback images in ECR | Not re-read: the AWS session was expired | `skin-scan:1` only, digest `668b1f56…`, 0.1.6 `9a8f96c0…` in ECR | **Cannot check**: re-read in step 0 |
| Firestore `(default)` region | Not re-read: the Firebase session was expired | nam5 until A1 | **Cannot check**: re-read in step 0 (A0) |
| Vercel Production settings | 20 names present; `CRON_SECRET`, `S3_SKIN_IMAGES_ERASE_ACCESS_KEY_ID`, `S3_SKIN_IMAGES_ERASE_SECRET_ACCESS_KEY` missing | same | Yes |
| `GEMINI_MODEL_SYNTHESIS` value | Stored as a secret, not readable | the model G1 approves | **Cannot check**: S6 sets it |
| Merge dry runs | `infra/india-region` into this branch: conflicts in `DECISION_LOG.md` and `vercel.json`; this branch into `origin/master`: clean | D0 | Yes (D0 now also covers `vercel.json`) |

---

Engine 0.1.6, India Firestore, Vercel bom1, website gates 01-04, and every feature built on the branch since (longitudinal engine, rules safety check, context-path Echo, dashboard, privacy: consent ledger, 18+ gate, erase and sweep).

First prepared 2026-10-03; rewritten 2026-10-05 for the whole branch. **Nothing in this file has been executed except C0 and C1 (2026-10-03, TD-04).**

- Every step that changes production is run by **the owner**. Each one has a `STOP (owner runs this)` line above it (C1 is already done). The agent only prepared this file.
- Commands run from the skin-check repository root (`/Users/divit/Projects/frontend/skin-check`) unless a step says otherwise.
- Never paste a secret value into a terminal line, a document, a ticket or a chat. The commands below pipe secrets straight from the tool that makes them into the tool that stores them.
- Sources: ENGINE_0_1_6_DEPLOYMENT_PLAN.md, FIRESTORE_RESET_RUNBOOK.md and DATA_LOCALITY_DECISION.md (D-22, on `infra/india-region` ff08107), PHASE_0_0_1_6_RESULTS.md, GATE_02 §8, H01_S3_ERASURE_READINESS.md, the tracker (TD-19, TD-20).

## Order and why

| Order | Job | Why here |
|---|---|---|
| 0 | **P. Before any job** | Backups and credential removal (unchanged), plus the owner inputs the code still needs before it can ship (P3). |
| 1 | **C. Engine 0.1.6** | Unchanged. Independent of the others and undone with one command. C0 and C1 are done (2026-10-03); resume at C2. |
| 2 | **A. Firestore reset to asia-south1** | Unchanged order, **one change in A3**: A3 now deploys the **live (`master`) rules**, not the branch rules. The branch rules are no longer "the live rules plus one read-only block": they refuse client writes the live site has never been tested against (profile key list, server-dated checks, erased and under-18 markers). They are deployed in job D (D3), right after the code that needs them. |
| 3 | **B. Vercel bom1** | Unchanged. |
| 4 | **S. Production settings (new)** | Before D because the new code reads these settings when it is deployed: the erase S3 keys and `CRON_SECRET` must exist when D2 builds, or the erase and the sweep refuse in production. The photo expiry rule (S5) can run any time after the owner chooses the period. |
| 5 | **D. Website: everything on the branch** | Last. Depends on A (first records in India), B, S and the A14 merge. Merging into `master` **is** the production deploy. The branch rules and the chat-turn expiry policy (D3) go out right after the code is live. |

**Between jobs:** each job ends with a STOP block. The owner confirms the job's checks passed, writes the result into the tracker, and only then starts the next job.

---

## Production settings (Vercel project `skin-check`, environment Production)

Names only. Set with `vercel env add <NAME> production` (the value is read from stdin, never typed on the command line) or in the dashboard. "Present" means already set on 2026-10-05 (`vercel env ls`).

| Variable | What it is for | Who sets it | Production value | Today |
|---|---|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID` | Firebase client config (sign-in, Firestore reads in the browser) | Owner | the `projectskin-a202c` web app config | Present |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firebase Admin: verifies ID tokens, writes `scanAnalyses`, ledger, chat turns, erase. `FIREBASE_PRIVATE_KEY` also derives the Echo history-token signing key (`lib/echo-history-token.ts`), so rotating it (B01) invalidates open chat threads, which is harmless | Owner | the rotated key (B01) | Present (rotate in P2/B01) |
| `SKIN_SCAN_API_URL`, `SCAN_API_SECRET` | The engine on ECS and its shared secret | Owner | `https://api.theprojectskin.com`, the ECS secret | Present |
| `S3_SKIN_IMAGES_REGION`, `S3_SKIN_IMAGES_BUCKET` | Photo bucket | Owner | `ap-south-1`, `projectskin-skin-originals-prod` | Present |
| `S3_SKIN_IMAGES_ACCESS_KEY_ID`, `S3_SKIN_IMAGES_SECRET_ACCESS_KEY` | Upload-only principal `skin-check-uploader` (presigned PUT) | Owner | existing keys | Present |
| `S3_SKIN_IMAGES_ERASE_ACCESS_KEY_ID`, `S3_SKIN_IMAGES_ERASE_SECRET_ACCESS_KEY` | **Erase credentials**: a separate principal that may list and delete under `users/*` only (account erase and the sweep) | Owner (S1, S2) | keys of the new `skin-check-eraser` user | **Missing** |
| `CRON_SECRET` | The erase sweep refuses without it; Vercel sends it as `Authorization: Bearer …` on every cron call | Owner (S3) | 32 random bytes, hex | **Missing** |
| `GEMINI_API_KEY` | Echo (context path) | Owner, after G1 (paid tier, region) | the key G1 approves | Present (key ownership/tier unresolved, G1) |
| `GEMINI_MODEL_SYNTHESIS` | Model id for Echo; unset means `gemini-3.6-flash`. The call always sends `thinkingLevel: MINIMAL`; the model must accept it. Older ids (`gemini-2.5-flash`, `gemini-2.0-flash`) now return 404 "no longer available" (checked 2026-10-06), and every answer would fail | Owner (S6) | `gemini-3.6-flash` for Stage 1; the model G1 approves for Stage 2 | Present, value not readable (stored as a secret) |
| `GEMINI_MODEL_VISION` | Not read by the code any more | Owner | may be removed | Present (unused) |
| `NEXT_PUBLIC_APP_ENV` | Only turns on full fetch-URL logging when `development` | Owner | `production` | Present |
| `NEXT_PUBLIC_TERMS_URL` | Terms link on the photo step | Owner | the terms page URL | Present |

**Feature switches (no setting changes them in production):**

| Switch | Where | Production behaviour |
|---|---|---|
| Echo path (`ECHO_CONTEXT_PATH`) | `lib/context/switch.ts` | Context path always (F12, TD-20). A production build ignores the variable; leave it **unset**. Going back to today's Echo is a code change and a redeploy. |
| Rules safety check | `lib/rules/settings.ts` (`REVIEW_STATUS`) | **On**, marked `provisional` (TD-20): the red-flag and extra-caution check runs. |
| Product recommendations | same | **Off** until clinical sign-off (E05). No setting turns them on. |
| 18+ attestation required for scan/upload | `app/api/account/_ledger.ts` (`REQUIRE_AGE_ATTESTATION`) | `false` (decision 3a): logged, not refused. Under-18 is always refused; chat always requires 18+. |

**Must be unset in Production** (development and test only; most are ignored in production builds anyway): `ECHO_CONTEXT_PATH`, `ERASE_SWEEP_DELAY_SECONDS`, `GEMINI_DEV_API_KEY`, `GEMINI_LOCAL_BASE_URL`, `FAKE_GEMINI_PORT`, `S3_SKIN_IMAGES_ENDPOINT`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST`, `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`, `NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST`. S4 checks this.

## Database rules and indexes (as on the branch)

`firestore.rules` (deployed in D3). Deny by default; every path a client touches is matched explicitly.

| Path | Client read | Client write |
|---|---|---|
| `users/{uid}` | owner `get` | owner `create`/`update` with only `phoneNumber` (must equal the token's) and `lastSeenAt`, and only while no `erasedAccounts/{uid}`; never `delete` |
| `users/{uid}/skinChecks/{checkId}` | owner `get`, `list` | owner `create` only: no `erasedAccounts/{uid}`, no `under18Accounts/{uid}` (H24), `createdAt == request.time`, `scanId` equals the doc id when present, `image.stored` boolean, `image.key` exactly `users/<uid>/scans/<checkId>/original.jpg`, a stored image only with image-retention consent at the current version; never `update`/`delete` |
| `users/{uid}/scanAnalyses/{id}` | owner `get`, `list` | none (server only) |
| `users/{uid}/routineEvents/{id}` | owner `get`, `list` | none (server only) |
| `users/{uid}/consentLedger/{id}` | owner `get`, `list` | none (server only, append-only) |
| `users/{uid}/chatTurns/{id}` | owner `get`, `list` | none (server only) |
| `erasedAccounts/{uid}`, `under18Accounts/{uid}`, `erasures/{id}` | none | none (server only) |

`firestore.indexes.json` (deployed in D3):

```json
{ "indexes": [],
  "fieldOverrides": [ { "collectionGroup": "chatTurns", "fieldPath": "expireAt", "ttl": true, "indexes": [] } ] }
```

- **No composite index.** Every query in the app is equality-only or one range on one field (ledger, chat turns, sweep `sweepAfter <=`), which Firestore's automatic single-field indexes serve.
- **Expiry policy for stored chat turns (H17, D-15):** every `users/{uid}/chatTurns` document carries `expireAt` = written time + 90 days (`CHAT_TURN_TTL_DAYS`). The override above turns on Firestore TTL for that field and leaves it unindexed (nothing queries it). Firestore deletes expired documents some time after `expireAt`, not on the second. Erase deletes them at once with the account.

## Scheduled job: the erase sweep (TD-19)

- `vercel.json` (on the branch) declares one Vercel cron: `GET /api/account/erase/sweep`, schedule `30 21 * * *` (UTC), i.e. once a day between 03:00 and 03:59 India time. The Hobby plan allows one run a day at any minute of the scheduled hour.
- Vercel sends `Authorization: Bearer $CRON_SECRET`. The route refuses (500) when `CRON_SECRET` is unset and (401) on any other header.
- What it does: for every `erasedAccounts/{uid}` whose `sweepAfter` (erase + 70 minutes) has passed, it erases S3 `users/{uid}/`, the Firestore tree, `under18Accounts/{uid}` and the Auth user again, then removes the marker. A failed account keeps its marker and is retried next run.
- The delete copy promises "within 2 days" (H26): 70 minutes + at most 24 h 59 min between runs. `ERASE_SWEEP_SCHEDULE` in `lib/consent.ts` and `vercel.json` are pinned together by a test. On a Pro plan the schedule can run more often; change both and the copy together.
- Crons run on production deployments only, never on previews.

---

## Before any job (owner)

| # | Command | Who | Good output | Check | Undo |
|---|---|---|---|---|---|
| P1 | **Done** (checked 2026-10-06: the remote has `engine-build-identity` at 8dc37dc). Re-check only: `git -C ../skin-scan ls-remote --heads origin engine-build-identity` | Owner | `8dc37dc501ea974825427c665acd7019120c20ec refs/heads/engine-build-identity` | `git -C ../skin-scan ls-remote --heads origin engine-build-identity` shows `8dc37dc…` | `git -C ../skin-scan push origin --delete engine-build-identity` |
| P2 | B01 items 1-3 from DEV_PROD_BOUNDARY.md (on ff08107): remove the Firebase Admin key (`FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`) and the `S3_SKIN_IMAGES_*` lines from `.env.local`, and move the Desktop `*-firebase-adminsdk-*.json` off this laptop | Owner | the variables and the file are gone | the P2 check command below the table prints `0`; `ls ~/Desktop/*adminsdk*.json` finds nothing | restore from your password manager |

P2 check (outside the table, so the `|` characters are real):

```bash
grep -cE '^(FIREBASE_PRIVATE_KEY|FIREBASE_CLIENT_EMAIL|S3_SKIN_IMAGES_)' .env.local
```

- P1 backs up the source of the image that job C deploys. It triggers no CI (skin-scan's `deploy.yml` runs on pushes to `main` only).
- P2 matters before job A: the Firebase Admin key bypasses security rules.

### P3. Owner inputs the code needs before D1 (no production change)

Each is a commit on `longitudinal-platform` by an engineer once the owner supplies the input, with tests, before D1:

1. **F06**: a verified India helpline number and its hours for the referral message (deploy blocker for the context path).
2. **H06**: the final AI-share and processing consent sentences (both versions still say DRAFT; tests pin them).
3. **G1**: Gemini key ownership, paid tier and processing region (decision 6). The context path sends Gemini the user's message and the reading facts.
4. **Decision 5** (optional before deploy): the photo retention period. Needed for S5 and for `IMAGE_RETENTION_PERIOD_DAYS` and its copy.

```
==================== STOP: P DONE ====================
Owner confirms P1, P2 done and P3 inputs committed (or recorded as
open blockers in the tracker). Do not start job C before this.
=======================================================
```

---

## JOB C: engine 0.1.6

Constants used below (copy once into the shell):

```bash
REG=ap-south-1
REPO=550428926515.dkr.ecr.ap-south-1.amazonaws.com/skin-scan
TAG=sha-8dc37dc501ea974825427c665acd7019120c20ec
DIGEST=sha256:9a8f96c0a54025c4137b89dee181ba7fb140db1431fa95156cc20d8880e1fc2c
BASE=results_0_1_6_release   # local Phase 0 results for $DIGEST
```

Run all of job C in one shell. Later steps use these variables. If C1 finds a different ECR digest, C1 changes `DIGEST` and `BASE`.

### C0. Confirm the tested image is still on this machine (read-only)

```bash
docker image inspect "$REPO:$TAG" --format '{{.Id}} {{.Os}}/{{.Architecture}}'
```
- Who: owner.
- Good output: `sha256:9a8f96c0a54025c4137b89dee181ba7fb140db1431fa95156cc20d8880e1fc2c linux/amd64`.
- If the ID differs or the image is missing: **STOP.** Do not rebuild. A rebuild is a different image and needs a new Phase 0 replay (PHASE_0_0_1_6_RESULTS Part I §6 item 4).
- Optional, before C1 (tracker A12): QA and security re-verification of this image. Compare its `/app` with `git -C ../skin-scan archive 8dc37dc`, confirm it is amd64-only, and run a local smoke test. The agent can do this read-only if you ask. Done 2026-10-03 by a read-only verifier agent: PASS (amd64-only index plus one attestation; `/app` identical to `git archive 8dc37dc` for every file the Dockerfile copies, the other 62 files excluded by `.dockerignore`; local `/health/ready` reports `scan-0.1.6-provisional`, cv2 `4.11.0`). Rerun C0 itself on the day.
- Undo: nothing to undo.

### C1. Push the image to ECR (DONE 2026-10-03, TD-04)

```bash
aws ecr get-login-password --region $REG | docker login --username AWS --password-stdin 550428926515.dkr.ecr.ap-south-1.amazonaws.com
docker push "$REPO:$TAG"
```
- Who: owner.
- Good output: `Login Succeeded`, then a last line like `sha-8dc37dc…: digest: sha256:9a8f96c0a54025c4137b89dee181ba7fb140db1431fa95156cc20d8880e1fc2c size: …`.
- Check (read-only):
  ```bash
  aws ecr describe-images --region $REG --repository-name skin-scan --image-ids imageTag=$TAG --query 'imageDetails[0].imageDigest' --output text
  ```
  **ECR must show `sha256:9a8f96c0a54025c4137b89dee181ba7fb140db1431fa95156cc20d8880e1fc2c`.**
- **If ECR shows a different digest:**
  1. **Stop.** Do not rebuild. Do not push again: the tag is immutable, so ECR would refuse it anyway.
  2. Record the ECR digest in the tracker (A12).
  3. Set `DIGEST=<ecr digest>` and `BASE=results_<first 12 hex chars of it>`. Every later step (C2, C3, C5) then uses the ECR digest.
  4. Pull it by digest and inspect it: `docker pull "$REPO@$DIGEST"`, then `docker image inspect "$REPO@$DIGEST" --format '{{.Id}} {{.Os}}/{{.Architecture}}'`.
  5. Start a local container **from `$REPO@$DIGEST`, by digest**, and run `bench.py matrix` and `bench.py determinism` against it with `RESULTS_DIR=$BASE`, then `analyse.py`. Use the run commands in PHASE_0_0_1_6_RESULTS §5, but skip its build step: nothing is rebuilt.
  6. Continue to C2 only if H-EQ holds (the response is bit-identical to 0.1.5 except `pipeline_version` and `engine_build`).
- Undo: the image is only stored, nothing runs it. If it must go, and only before C3: `aws ecr batch-delete-image --region $REG --repository-name skin-scan --image-ids imageTag=$TAG`.

### C2. Register task definition `skin-scan:2`, pinned by digest

> The steps below assume `skin-scan:1` is the only revision, so the new one is `:2` (true on 2026-10-03; not re-read since, the AWS session was expired on 2026-10-06). First run `aws ecs list-task-definitions --region $REG --family-prefix skin-scan --query taskDefinitionArns`. If it lists more than `:1`, the register below returns a higher number: use that number wherever C2-C4 say `skin-scan:2`.

**STOP (owner runs this):** the register command below changes production configuration.

**First, a read-only check: `skin-scan:1` must have exactly one container.** The `jq` below sets the image of *every* container. A sidecar (log router, agent) would get the engine image too.

```bash
N=$(aws ecs describe-task-definition --region $REG --task-definition skin-scan:1 \
  --query 'length(taskDefinition.containerDefinitions)' --output text)
echo "containers in skin-scan:1: $N"
[ "$N" = "1" ] || echo "STOP: expected 1 container, found $N. Do not register."
```
- Good output: `containers in skin-scan:1: 1` and no STOP line.
- **If it prints STOP: stop here.** Do not run the register command. Record the container count in the tracker (A12). The `jq` must then be changed to set the image of the engine container only, by name, and this runbook re-reviewed.

Then register. The `jq` repeats the one-container check and fails if it does not hold; the `&&` chain then never reaches `register-task-definition`, even if the check above was skipped:

```bash
umask 077; TD=$(mktemp -d)
aws ecs describe-task-definition --region $REG --task-definition skin-scan:1 --query taskDefinition --output json > "$TD/src.json" \
&& jq --arg img "$REPO@$DIGEST" '
      if (.containerDefinitions | length) != 1
      then error("STOP: skin-scan:1 has \(.containerDefinitions | length) containers, expected 1") else . end
      | .containerDefinitions |= map(.image = $img)
      | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)' \
  "$TD/src.json" > "$TD/td.json" \
&& aws ecs register-task-definition --region $REG --cli-input-json "file://$TD/td.json" --query 'taskDefinition.{rev:revision,image:containerDefinitions[0].image}'
rm -rf "$TD"
```
- Who: owner.
- `td.json` holds the environment block. Never print it, commit it or attach it. It is written to a private temp directory and deleted at the end.
- Only the image changes. Env, the `SCAN_API_SECRET` reference, roles, CPU and memory stay exactly as in `:1`.
- Good output: `{"rev": 2, "image": "550428926515.dkr.ecr.ap-south-1.amazonaws.com/skin-scan@<$DIGEST>"}`, normally `…@sha256:9a8f96c0a54025c4137b89dee181ba7fb140db1431fa95156cc20d8880e1fc2c`.
- Check (read-only): `aws ecs describe-task-definition --region $REG --task-definition skin-scan:2 --query 'taskDefinition.containerDefinitions[0].image' --output text` prints the line above, ending in `@$DIGEST`. It must contain `@sha256:`, not `:sha-`.
- Undo (only while no service uses it): `aws ecs deregister-task-definition --region $REG --task-definition skin-scan:2`.

### C2b. Record the pre-deploy baseline (read-only)

Run right before C3, in the same shell. It reads the last 24 hours of the live 0.1.5 service. The `date -v` syntax is macOS.

```bash
LB=$(aws elbv2 describe-load-balancers --region $REG --names skin-scan-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text | sed 's#.*:loadbalancer/##')
START=$(date -u -v-24H +%Y-%m-%dT%H:%M:%SZ); END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
for M in RequestCount HTTPCode_ELB_5XX_Count HTTPCode_Target_5XX_Count; do
  printf '%s ' $M
  aws cloudwatch get-metric-statistics --region $REG --namespace AWS/ApplicationELB --metric-name $M \
    --dimensions Name=LoadBalancer,Value=$LB --start-time $START --end-time $END \
    --period 3600 --statistics Sum --query 'sum(Datapoints[].Sum)' --output text
done

Q=$(aws logs start-query --region $REG --log-group-name /ecs/skin-scan \
  --start-time $(date -u -v-24H +%s) --end-time $(date -u +%s) \
  --query-string 'filter message = "scan_request" and status = 200 | stats count(*) as n, pct(duration_ms, 95) as p95_ms' \
  --query queryId --output text)
sleep 15; aws logs get-query-results --region $REG --query-id "$Q" --query '{status: status, results: results}'
```
- Who: owner.
- Good output: three lines, `RequestCount <n>`, `HTTPCode_ELB_5XX_Count <n>`, `HTTPCode_Target_5XX_Count <n>` (a metric with no datapoints prints `0`), then the query result with `"status": "Complete"`, `n` and `p95_ms`. If the status is `Running`, run the `get-query-results` line again.
- `p95_ms` is the engine's own `/scan` time (`duration_ms` in the `scan_request` log line, successful scans only). The ALB adds network time on top, which this baseline leaves out on purpose so the two engine versions compare like for like.
- **Write the five numbers into the tracker (A12) before C3.** Also compute the baseline 5xx rate: (ELB 5xx + Target 5xx) / RequestCount.
- `"results": []` with `"status": "Complete"` means no successful scans in the window (`n` = 0), not a broken query. Checked 2026-10-03: the ALB name, the log group and the fields `message`, `status`, `duration_ms` match the live logs, and the same query over 7 days returned `n` 4, `p95_ms` 384.
- If `n` is below about 20, the p95 is not meaningful. Write that down; the p95 rule in C3 then does not apply, and the other rollback rules still do.
- Undo: nothing to undo. (Logs Insights bills a few cents for the data it scans.)

### C3. Update the service

**STOP (owner runs this).**

```bash
aws ecs update-service --region $REG --cluster skin-scan-cluster --service skin-scan-service \
  --task-definition skin-scan:2 --query 'service.taskDefinition' --output text
aws ecs wait services-stable --region $REG --cluster skin-scan-cluster --services skin-scan-service
```
- Who: owner. Watch the rollout by hand for at least 30 minutes. CloudWatch alarms have no actions.
- Good output: `arn:aws:ecs:ap-south-1:550428926515:task-definition/skin-scan:2`, then `wait` returns with no output after a few minutes.
- Check (read-only):
  ```bash
  aws ecs describe-services --region $REG --cluster skin-scan-cluster --services skin-scan-service \
    --query 'services[0].deployments[].{td:taskDefinition,status:status,rollout:rolloutState,running:runningCount}'
  aws ecs describe-tasks --region $REG --cluster skin-scan-cluster \
    --tasks $(aws ecs list-tasks --region $REG --cluster skin-scan-cluster --service-name skin-scan-service --query 'taskArns' --output text) \
    --query 'tasks[].{td:taskDefinitionArn,digest:containers[0].imageDigest,health:healthStatus}'
  curl -s https://api.theprojectskin.com/health/ready
  ```
  - Exactly one deployment: `skin-scan:2`, PRIMARY, COMPLETED, 2 running.
  - Every task: `digest` equals `$DIGEST` (normally `sha256:9a8f96c0…`), `health` is HEALTHY.
  - Health: `{"status":"ready","pipeline_version":"scan-0.1.6-provisional","cv2_version":"4.11.0"}`.
- **Rollback to `skin-scan:1`** (one command, no rebuild):
  ```bash
  aws ecs update-service --region $REG --cluster skin-scan-cluster --service skin-scan-service --task-definition skin-scan:1
  aws ecs wait services-stable --region $REG --cluster skin-scan-cluster --services skin-scan-service
  ```
  Roll back on, comparing with the numbers recorded in C2b: a 5xx rate during the watch above the C2b baseline rate (any 5xx at all if the baseline was 0); `/scan` `p95_ms` more than about 20% above the C2b `p95_ms`; health-check failures or task restarts; the fixture scan in C4 not returning 200. To measure the watch window, rerun the C2b commands with `-v-30M` in place of every `-v-24H`. With few scans in 30 minutes, judge p95 only once `n` is at least about 20. The deployment circuit breaker also rolls back on its own if tasks fail health checks. Never deregister `skin-scan:1` and never delete the `sha-7f3695e…` image.

### C4. Authenticated smoke scan

Load the engine secret into a variable without printing it. The secret's ARN is read from the task definition (it is not itself a secret):

```bash
SECRET_ARN=$(aws ecs describe-task-definition --region $REG --task-definition skin-scan:2 \
  --query "taskDefinition.containerDefinitions[0].secrets[?name=='SCAN_API_SECRET'].valueFrom" --output text)
export SCAN_SECRET="$(aws secretsmanager get-secret-value --region $REG --secret-id "$SECRET_ARN" --query SecretString --output text)"
case "$SCAN_SECRET" in \{*) echo "secret is JSON: stop and extract the key first";; *) echo "secret loaded (${#SCAN_SECRET} chars)";; esac
curl -s -H "X-Scan-Secret: $SCAN_SECRET" -F "image=@../skin-scan/fixtures/input_face.png" \
  https://api.theprojectskin.com/scan | jq '{pipeline_version, engine_build, n_scores: (.scores|length)}'
```
- Who: owner.
- Good output: `{"pipeline_version": "scan-0.1.6-provisional", "engine_build": "sha-8dc37dc501ea974825427c665acd7019120c20ec", "n_scores": 7}`.
- Check: this step is the check.

**STOP (owner runs this):** also complete one real scan on the live website (https://skin-check-sigma.vercel.app or the custom domain), with a made-up test account; it writes production data and must finish normally.
- Undo: nothing to undo (read-only call). On failure, roll back as in C3.

### C5. Phase 0 replay against the live service, compared with the local run (`$BASE`)

**STOP (owner runs this):** it calls production 30 times.

**Why:** the local release run used Docker on an arm64 Mac, emulating amd64. Fargate runs real amd64. Bit-identity across the two was never established (PHASE_0_RESULTS §3.7).

**What this is, and is not:**
- It is post-deploy verification on the deployed bytes.
- It is **not** Phase 0 protocol evidence. ENGINE_0_1_6_DEPLOYMENT_PLAN §8 keys protocol evidence to a pinned digest run locally and says not to use the live service.
- It sends 30 requests (the matrix only). The determinism mode is not run: it restarts containers and cannot work against a live service.
- A difference is **not** a rollback trigger (plan §7). Record it as a tracker row for the Phase 0 open item.

Run in the same shell as C4: it uses the `SCAN_SECRET` variable loaded there.

```bash
cd docs/research/measurement-validation/phase0
git -C ../../../../../skin-scan rev-parse HEAD     # must print 8dc37dc501ea974825427c665acd7019120c20ec
mkdir -p results_0_1_6_live; OUT=$(mktemp -d)
RESULTS_DIR=results_0_1_6_live ENGINE_URL=https://api.theprojectskin.com SKIN_SCAN_REPO=../../../../../skin-scan \
  OUT_IMG="$OUT" ../../../../../skin-scan/.venv/bin/python bench.py matrix
BASE=$BASE python3 - <<'EOF'
import json, os
a = {r["variant"]: r for r in json.load(open(os.environ["BASE"] + "/matrix.json"))["rows"]}
b = {r["variant"]: r for r in json.load(open("results_0_1_6_live/matrix.json"))["rows"]}
assert a.keys() == b.keys(), "variant sets differ"
bad = [v for v in a if a[v]["transmittedSha256"] != b[v]["transmittedSha256"] or a[v]["response"] != b[v]["response"]]
print(f"{len(a) - len(bad)}/{len(a)} identical; differing: {bad}")
EOF
rm -rf "$OUT"; unset SCAN_SECRET; cd -
```
- Who: owner (it calls production).
- `bench.py` passes the secret to `curl` on the command line, so it is visible to other processes on this machine while the run lasts. Run it on your own laptop only.
- Good output: 30 lines `<kind> <level> 200`, then `30/30 identical; differing: []`.
- If any variant differs: keep `results_0_1_6_live/`, add a tracker row with the differing variants, and continue. It is not a rollback trigger.
- Check: `ls docs/research/measurement-validation/phase0/results_0_1_6_live/matrix.json` (from the repository root).
- Undo: `rm -rf docs/research/measurement-validation/phase0/results_0_1_6_live` (the results are local files only).

**Afterwards:** update `terraform.tfvars` `image_tag` in `../skin-scan/infra/terraform/` to `sha-8dc37dc…`, so the file matches reality. **Do not run `terraform apply`** (plan §5 step 7).

```
==================== STOP: JOB C DONE ====================
Owner confirms: C3 checks pass, C4 smoke passes, C5 result recorded,
tracker A12 updated. Do not start job A before this.
==========================================================
```

---

## JOB A: Firestore (default) to asia-south1

Run from the skin-check repository root. A3 deploys the files from `origin/master` (the live site's own rules); the branch's files are deployed in D3.

```bash
P=projectskin-a202c
F() { npx -y firebase-tools@latest "$@"; }   # a function, so it works in zsh and bash
```

**Expected outage:** about 5-10 minutes (A1 to A3). Sign-in and scanning keep working. Saving to history, the history list and the profile upsert fail until A3 finishes. Choose a quiet time in India.

**Firebase Auth is not touched by any step.** Auth is project-wide and does not live in the database.

### A0. Pre-checks (read-only)

```bash
git rev-parse --abbrev-ref HEAD                                  # longitudinal-platform
git status --short firebase.json firestore.rules firestore.indexes.json   # prints nothing
F firestore:databases:get "(default)" --project $P              # Location nam5
F --version                                                      # the firebase-tools version A2 will use
F firestore:databases:create --help | grep -oE -- '--(location|edition|delete-protection|point-in-time-recovery) ' | sort -u
```
- Who: owner.
- Good output: as in the comments. P2 is done. The last command prints exactly these four lines (every flag A2 uses):
  ```
  --delete-protection 
  --edition 
  --location 
  --point-in-time-recovery 
  ```
- If a line is missing: **stop.** Do not run A1. The installed firebase-tools changed the flag; A2 must be fixed first, because A1 cannot be undone.
- Checked 2026-10-03 with firebase-tools 15.32.1: all four flags exist with the values A2 uses (`--edition standard`, `--delete-protection ENABLED`, `--point-in-time-recovery ENABLED`). A2 needed no change.
- Undo: nothing to undo.

### A1. Delete `(default)` (IRREVERSIBLE)

**STOP (owner runs this).**

```bash
F firestore:databases:delete "(default)" --project $P
```
- Who: owner. It asks for confirmation; answer yes.
- Good output: a success message naming `projects/projectskin-a202c/databases/(default)`.
- Check (read-only): `F firestore:databases:list --project $P` lists no databases.
- Undo: **none.** All test documents are gone for good. No export is taken, by owner decision (D-22). Point-in-time recovery was off.

### A2. Create `(default)` in asia-south1 with delete protection (wait about 5 minutes after A1)

**STOP (owner runs this).**

```bash
F firestore:databases:create "(default)" --location asia-south1 --edition standard \
  --delete-protection ENABLED --point-in-time-recovery ENABLED --project $P
```
- Who: owner.
- If it says the ID is still in use or was recently deleted: wait a few minutes and run the same command again.
- If it refuses `asia-south1`: **stop.** Do not try other regions. Follow FIRESTORE_RESET_RUNBOOK §10 (on ff08107).
- Good output: the new database with Location `asia-south1`, Delete Protection `ENABLED`, Point In Time Recovery `ENABLED`.
- Check (read-only): `F firestore:databases:get "(default)" --project $P` shows those three values and type `FIRESTORE_NATIVE`.
- Undo: delete protection blocks a delete, on purpose. Do **not** try other regions (approved runbook §10). If the India database must go, first `F firestore:databases:update "(default)" --delete-protection DISABLED --project $P`. Then run A1, then A2 with `--location nam5`. That restores the previous, empty, behaviour with no code change.

### A3. Deploy the live (`master`) rules and indexes on the new database

**STOP (owner runs this).** Run it right after A2. Until it finishes, client access to the new database is denied.

```bash
MASTER_SHA=$(git rev-parse origin/master)        # 1b39f88… today; write it down, D3's undo uses it
git worktree add /tmp/skin-check-master "$MASTER_SHA" && cd /tmp/skin-check-master \
  && npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes --project projectskin-a202c; cd -
git worktree remove /tmp/skin-check-master
```
- Who: owner.
- **Changed 2026-10-05 (was: deploy the branch rules here).** The branch rules now refuse writes the live site (1b39f88) was never tested against: the profile key list, a client-dated check, and the erased and under-18 markers. Deploying the live site's own rules keeps job A a pure region move. The branch rules and the chat-turn expiry policy go out in D3, right after the code that needs them.
- Good output: `✔ firestore: released rules firestore.rules to cloud.firestore` and `✔ Deploy complete!`.
- Check (read-only): `F firestore:indexes --project $P` prints `{"indexes": [], "fieldOverrides": []}`.
- Undo: there is nothing older to go back to on a new database. To redeploy, run the block again **without its first line**, with `MASTER_SHA` set by hand to the value you wrote down (after D2, `origin/master` is the new code).

### A4. Daily backups (recommended by the approved D-22 runbook)

**STOP (owner runs this).**

```bash
F firestore:backups:schedules:create --database "(default)" --recurrence DAILY --retention 7d --project $P
```
- Who: owner.
- Good output: a schedule with recurrence DAILY and retention 7 days.
- Check (read-only): `F firestore:backups:schedules:list --database "(default)" --project $P` shows one DAILY schedule.
- Undo: `F firestore:backups:schedules:delete <schedule name from the list> --project $P`.

### A5. Application check (production, real phone)

**STOP (owner runs this):** these steps write production data. Use a made-up test account.

1. Sign in with an existing test account. It works, because Auth was untouched.
2. Complete a scan with retention consent. `users/{uid}/skinChecks/{scanId}` appears in the console.
3. The previous-scans list shows it.
4. The console shows `users/{uid}` with `phoneNumber` and `lastSeenAt` (the profile upsert on sign-in).
5. Rules, production: in the console Rules Playground, a second test account cannot read the first account's `users/{uid}`. Never use a forged client.
6. S3: `aws s3api list-objects-v2 --bucket projectskin-skin-originals-prod --prefix users/<uid>/scans/<scanId>/ --query 'KeyCount'` returns `1`.

- Who: owner.
- Undo: as A3.

```
==================== STOP: JOB A DONE ====================
Owner confirms: A2 shows asia-south1 + delete protection ENABLED,
A3 rules deployed, A5 passes, tracker A04 updated. Do not start job B before this.
==========================================================
```

---

## JOB B: Vercel functions to bom1

Two halves:
- **Project setting + redeploy of the current production code (this job).**
- **`vercel.json` `"regions": ["bom1"]`**: arrives with the A14 merge and ships in job D. Shipping ff08107 alone would also ship gate-01 code without its durability fix.

### B1. Change the project's function region

**STOP (owner runs this).**

- Who: owner.
- Vercel dashboard → project `skin-check` → Settings → Functions → Function Region → **Mumbai, India (bom1)** only → Save.
- Good output: the page shows bom1 selected.
- Check (read-only):
  ```bash
  vercel api /v9/projects/skin-check | jq -c '{serverlessFunctionRegion, functionDefaultRegions: .resourceConfig.functionDefaultRegions}'
  ```
  prints `bom1` for both (today both are `iad1`).
- Undo: set it back to Washington, D.C. (iad1) in the same place.

### B2. Redeploy the current production deployment so the setting takes effect

**STOP (owner runs this).**

```bash
vercel redeploy dpl_7aCicWiHeqEJuer3grPWqpC3dTow --target production
```
- Who: owner. It rebuilds the same commit (1b39f88) with the new region. No code changes.
- Good output: a new deployment URL, status Ready, and the production domains moved to it.
- Check (read-only):
  ```bash
  vercel api /v9/projects/skin-check | jq -r '.targets.production.id'      # the NEW deployment id
  vercel api /v13/deployments/<new id> | jq -c '{regions, sha: .meta.githubCommitSha}'
  curl -s -o /dev/null -D - -X POST https://skin-check-sigma.vercel.app/api/skin-scan | grep -i x-vercel-id
  ```
  - `regions: ["bom1"]`, `sha: 1b39f8851bb9224da0e3422e00edeeed1d9db9ac`.
  - `x-vercel-id: bom1::bom1::…`. The second part is the function region; today it is `iad1`.
  - **STOP (owner runs this):** one real scan with a made-up test account on the live website still completes, including the S3 upload. Use https://skin-check-sigma.vercel.app; `scan.theprojectskin.com` is also attached to this Vercel project (`vercel api /v9/projects/skin-check/domains`). `lib/s3.ts` signs with `S3_SKIN_IMAGES_REGION`, not the Vercel region.
- Undo: `vercel rollback dpl_7aCicWiHeqEJuer3grPWqpC3dTow`, then B1's undo.

```
==================== STOP: JOB B DONE ====================
Owner confirms: deployment regions [bom1], x-vercel-id bom1::bom1,
scan works, tracker A05 updated. Do not start job D before this.
==========================================================
```

---

## JOB S: production settings for the new code (new 2026-10-05)

Nothing in this job changes what users see until D2 deploys the code that reads it, except S5, which deletes old photos on its schedule.

```bash
REG=ap-south-1
BUCKET=projectskin-skin-originals-prod
```

### S1. Create the erase principal (S3 list and delete under `users/*` only)

Re-check first (read-only): versioning and Object Lock must still be off, or `DeleteObject` would not be a permanent delete (H01_S3_ERASURE_READINESS.md).

```bash
aws s3api get-bucket-versioning --bucket $BUCKET          # prints nothing (never enabled)
aws s3api get-object-lock-configuration --bucket $BUCKET  # ObjectLockConfigurationNotFoundError
```
- If versioning shows `Enabled` or `Suspended`: **stop.** The erase then needs `s3:DeleteObjectVersion` and code that deletes every version (tracker row).

**STOP (owner runs this).**

```bash
umask 077; POL=$(mktemp)
cat > "$POL" <<EOF
{ "Version": "2012-10-17", "Statement": [
  { "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::$BUCKET",
    "Condition": { "StringLike": { "s3:prefix": "users/*" } } },
  { "Effect": "Allow", "Action": "s3:DeleteObject", "Resource": "arn:aws:s3:::$BUCKET/users/*" } ] }
EOF
aws iam create-user --user-name skin-check-eraser --query 'User.Arn' --output text
aws iam put-user-policy --user-name skin-check-eraser --policy-name skin-check-erase-originals --policy-document "file://$POL"
rm -f "$POL"
```
- Who: owner.
- Good output: the new user's ARN, then nothing.
- Check (read-only): `aws iam get-user-policy --user-name skin-check-eraser --policy-name skin-check-erase-originals --query PolicyDocument` shows exactly the two statements; `aws iam list-attached-user-policies --user-name skin-check-eraser` shows none.
- Undo: `aws iam delete-user-policy --user-name skin-check-eraser --policy-name skin-check-erase-originals && aws iam delete-user --user-name skin-check-eraser` (after S2's undo).

### S2. Give the erase keys to Vercel without showing them

**STOP (owner runs this).**

```bash
umask 077; K=$(mktemp)
aws iam create-access-key --user-name skin-check-eraser --output json > "$K"
jq -r .AccessKey.AccessKeyId "$K"     | vercel env add S3_SKIN_IMAGES_ERASE_ACCESS_KEY_ID production --sensitive
jq -r .AccessKey.SecretAccessKey "$K" | vercel env add S3_SKIN_IMAGES_ERASE_SECRET_ACCESS_KEY production --sensitive
rm -f "$K"
```
- Who: owner. The key file lives in a private temp file for a few seconds and is deleted; nothing is printed.
- Good output: two `Added Environment Variable … to Project skin-check` lines.
- Check (read-only): `vercel env ls production | grep S3_SKIN_IMAGES_ERASE` shows both names; `aws iam list-access-keys --user-name skin-check-eraser --query 'AccessKeyMetadata[].Status'` shows one `Active`.
- Undo: `vercel env rm S3_SKIN_IMAGES_ERASE_ACCESS_KEY_ID production --yes; vercel env rm S3_SKIN_IMAGES_ERASE_SECRET_ACCESS_KEY production --yes`, then `aws iam delete-access-key --user-name skin-check-eraser --access-key-id <id from list-access-keys>`.

### S3. Set `CRON_SECRET`

**STOP (owner runs this).**

```bash
openssl rand -hex 32 | vercel env add CRON_SECRET production --sensitive
```
- Who: owner. Nobody needs to know the value: Vercel sends it on each cron call.
- Good output: `Added Environment Variable CRON_SECRET to Project skin-check`.
- Check (read-only): `vercel env ls production | grep CRON_SECRET`.
- Undo: `vercel env rm CRON_SECRET production --yes` (the sweep then refuses, and late data and markers stay: a deploy blocker, TD-19).

### S4. No development-only setting in Production (read-only)

```bash
vercel env ls production | grep -E 'ECHO_CONTEXT_PATH|ERASE_SWEEP_DELAY_SECONDS|GEMINI_DEV_API_KEY|GEMINI_LOCAL_BASE_URL|FAKE_GEMINI_PORT|S3_SKIN_IMAGES_ENDPOINT|EMULATOR_HOST' || echo "none"
```
- Who: owner.
- Good output: `none`.
- If any name prints:

**STOP (owner runs this).** `vercel env rm <NAME> production --yes`. Undo: add it back (you should not need to).

### S6. The Gemini model for Echo (Stage 1 needs this)

The context call always sends `thinkingLevel: MINIMAL`. Older model ids (`gemini-2.5-flash`, `gemini-2.0-flash`) now return 404 "no longer available" (checked with the dev key on 2026-10-06), so if production's `GEMINI_MODEL_SYNTHESIS` still names one, every Echo answer fails with `CHAT_SERVICE_ERROR`. Its value cannot be read (it is stored as a secret), so set it.

**STOP (owner runs this).**

```bash
vercel env rm GEMINI_MODEL_SYNTHESIS production --yes
printf 'gemini-3.6-flash' | vercel env add GEMINI_MODEL_SYNTHESIS production --no-sensitive
```
- Who: owner. For Stage 2, use the model G1 approves, and confirm it accepts `thinkingLevel: MINIMAL` before switching.
- Good output: `Removed …` then `Added Environment Variable GEMINI_MODEL_SYNTHESIS to Project skin-check`.
- Check (read-only): `vercel env ls production | grep GEMINI_MODEL_SYNTHESIS` shows it as a plain (non-secret) value; D4 item 4 shows `modelId: "gemini-3.6-flash"` on the echo turn.
- Undo: `vercel env rm GEMINI_MODEL_SYNTHESIS production --yes` (the code then uses its default, `gemini-3.6-flash`). The old value cannot be restored, because it was never readable.

### S5. Photo retention rule on the bucket (decision 5; period chosen by the owner)

Fill in `RETENTION_DAYS` with the decided number. **Do not run this until decision 5 is made and `IMAGE_RETENTION_PERIOD_DAYS` in `lib/consent.ts` and its copy are set to the same number** (otherwise photos disappear on a schedule no copy tells users about).

```bash
aws s3api get-bucket-lifecycle-configuration --bucket $BUCKET   # NoSuchLifecycleConfiguration today
```
**STOP (owner runs this).** `put-bucket-lifecycle-configuration` replaces the whole lifecycle configuration; the check above confirms there is none to lose.

```bash
RETENTION_DAYS=<OWNER FILLS IN>
aws s3api put-bucket-lifecycle-configuration --bucket $BUCKET --lifecycle-configuration "{
  \"Rules\": [ { \"ID\": \"expire-original-photos\", \"Status\": \"Enabled\",
    \"Filter\": { \"Prefix\": \"users/\" }, \"Expiration\": { \"Days\": $RETENTION_DAYS } } ] }"
```
- Who: owner.
- Good output: nothing.
- Check (read-only): `aws s3api get-bucket-lifecycle-configuration --bucket $BUCKET` shows the one rule with your number.
- S3 deletes objects some time after they pass the age (usually within a day or two), not on the second.
- Undo: `aws s3api delete-bucket-lifecycle --bucket $BUCKET`. This only stops future deletions: versioning is off, so photos already expired **cannot be restored**.

```
==================== STOP: JOB S DONE ====================
Owner confirms S1-S4 checks pass (S5 done or recorded as waiting on
decision 5), tracker H01/TD-19 updated. Do not start job D before this.
==========================================================
```

---

## JOB D: the website, everything on the branch

### D0. Bring `infra/india-region` into `longitudinal-platform` (A14)

**STOP (owner runs this):** it rewrites the branch.

- Follow docs/architecture/A14_RECONCILIATION_PROPOSAL.md steps 1-5 exactly. `DECISION_LOG.md` conflicts as before.
- **New conflict since 2026-10-05: `vercel.json`.** Both sides added it. Keep both keys:
  ```json
  {
    "$schema": "https://openapi.vercel.sh/vercel.json",
    "regions": ["bom1"],
    "crons": [{ "path": "/api/account/erase/sweep", "schedule": "30 21 * * *" }]
  }
  ```
- Check (read-only):
  ```bash
  git show longitudinal-platform:vercel.json | jq -c '{regions, crons}'   # regions ["bom1"] and the one cron
  grep -oE '^\*\*D-[0-9]+[a-z]?' docs/architecture/DECISION_LOG.md | sort | uniq -d   # prints nothing
  npm run typecheck && npm run lint && npm run test:all                    # all pass, no production keys needed
  ```
- Run these checks **after** the merge commit (A14 step 5's commit) and **before** its `git stash drop`: before the commit, `git show longitudinal-platform:vercel.json` still reads the old file, with no `regions`. `test:all` runs the unit tests, the local stack (emulators, engine 0.1.6 by image ID, S3Mock, fake Gemini), the browser tests and `next build`; it uses no production key.
- A14_RECONCILIATION_PROPOSAL step 4 has a `grep` bug (it matches `**D-03a` as `**D-03`). Use the command above.
- Undo (before the stash is dropped and before pushing): `git reset --hard ORIG_HEAD`, then restore the drafts from the A14 entry by name, never with a bare `git stash pop` (the stash list is shared with every worktree of this repository):
  ```bash
  REF=$(git stash list --format='%gd %gs' | grep 'A14 superseded drafts' | head -1 | cut -d' ' -f1)
  [ -n "$REF" ] && git stash apply "$REF" && git stash drop "$REF"
  ```

### D1. Push `longitudinal-platform` and open the pull request

**STOP (owner runs this).**

```bash
git push -u origin longitudinal-platform
gh pr create --base master --head longitudinal-platform --title "Longitudinal platform: gates 01-04, India region, context Echo, privacy" \
  --body "Everything on longitudinal-platform. Deploy per docs/PHASE_0_RUNBOOK.md job D."
```
- Who: owner.
- The push creates a Vercel **preview** deployment. Preview has no Firebase or S3 credentials (only the engine and Gemini variables), so sign-in fails there before any engine, Gemini or data call. Crons never run on previews.
- Good output: a PR URL.
- Check (read-only): `gh pr view longitudinal-platform --json mergeable,baseRefName` shows `"mergeable": "MERGEABLE"`, base `master`.
- Undo: `gh pr close longitudinal-platform`.

### D2. Merge the pull request. This is the production deploy.

**STOP (owner runs this).** Only after P3's blockers are committed (F06, H06, G1) and job S is done.

```bash
gh pr merge longitudinal-platform --merge
```
- Who: owner. Vercel deploys `master` to production automatically and registers the cron from `vercel.json`.
- Gates 01 and 02 ship together (GATE_02 §8). The context path is the chat that ships (F12, TD-20).
- Good output: `✓ Merged pull request #…`; Vercel shows a new production deployment, Ready.
- Check (read-only):
  ```bash
  git fetch origin && git rev-parse origin/master
  vercel api /v9/projects/skin-check | jq -c '{id: .targets.production.id, sha: .targets.production.meta.githubCommitSha, crons: .crons.definitions}'
  vercel api /v13/deployments/<id> | jq -c '{regions, readyState}'
  ```
  - `sha` equals `origin/master`; `regions: ["bom1"]`; `readyState: "READY"`; `crons` lists `/api/account/erase/sweep` with `30 21 * * *`.
- Undo:
  - Fast: `vercel rollback <deployment id from B2>` (1b39f88 in bom1). Records already written stay; the old site ignores them. Then D3's undo, so the old site runs under its own rules.
  - Git: `git revert -m 1 <merge commit>` in a new PR; its merge redeploys the old code.

### D3. Deploy the branch rules and the chat-turn expiry policy (right after D2 is Ready)

**STOP (owner runs this).**

```bash
git fetch origin && git worktree add /tmp/skin-check-deployed origin/master && cd /tmp/skin-check-deployed \
  && npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes --project projectskin-a202c; cd -
git worktree remove /tmp/skin-check-deployed
```
- Who: owner. Deploys `firestore.rules` (table above) and `firestore.indexes.json` (the `chatTurns.expireAt` TTL policy, H17).
- Run it the moment D2 is Ready. Until D3, the new site runs under the live rules: they have no `consentLedger` or `chatTurns` read rules (and possibly no `scanAnalyses` one), so the dashboard's readings and privacy section can show their error state, and the erased and under-18 markers are not checked by the rules. Nothing is written wrongly: those collections are written by the server. Rules go after the code on purpose: the other order would put the live site's client writes under rules it was never tested against, and a refused write loses a user's check.
- Good output: `✔ firestore: released rules firestore.rules to cloud.firestore` and `✔ Deploy complete!`. firebase-tools may take a few minutes to enable TTL.
- Check (read-only):
  - `npx -y firebase-tools@latest firestore:indexes --project projectskin-a202c` shows the `chatTurns` / `expireAt` override with `"ttl": true`.
  - Firebase console → Firestore → Rules shows `function notUnder18` and `match /chatTurns/{turnId}`.
  - Firebase console → Firestore → Time-to-live shows `chatTurns` · `expireAt` · Serving (it can show Creating for a while).
- Undo:
  - Rules only (leaves the TTL policy alone; deploying the old indexes file would prompt to delete the override):
    ```bash
    MASTER_SHA=<the value written down in A3>      # NOT git rev-parse origin/master: after D2 that is the new code
    git worktree add /tmp/skin-check-master "$MASTER_SHA" && cd /tmp/skin-check-master \
      && npx -y firebase-tools@latest deploy --only firestore:rules --project projectskin-a202c; cd -
    git worktree remove /tmp/skin-check-master
    ```
  - TTL: deploying an indexes file without the override only offers to delete it (prompt, default no); turn it off explicitly instead:
    ```bash
    T=$(mktemp -d) && printf '%s' '{"indexes":[],"fieldOverrides":[{"collectionGroup":"chatTurns","fieldPath":"expireAt","ttl":false,"indexes":[]}]}' > "$T/firestore.indexes.json" \
      && printf '%s' '{"firestore":{"indexes":"firestore.indexes.json"}}' > "$T/firebase.json" \
      && (cd "$T" && npx -y firebase-tools@latest deploy --only firestore:indexes --project projectskin-a202c); rm -rf "$T"
    ```
    Turns already deleted by the policy cannot be restored.

### D4. Checks after deploy that the local tests could not do (production, real phone)

**STOP (owner runs this):** these use production, and item 7 deletes a made-up test account.

The local stack uses emulators, S3Mock, a fake Gemini and the engine image by ID. These checks cover what it cannot. Use a **made-up test account**, never a real user's data. Record each result in the tracker (I01).

1. **Real login token.** Sign in by phone on the live site. Then check a bad token is refused:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://skin-check-sigma.vercel.app/api/skin-check/chat \
     -H 'authorization: Bearer not-a-token' -H 'content-type: application/json' -d '{}'
   ```
   prints `401`. Without the header it also prints `401`.
2. **One real photo upload.** Complete a check with photo retention consent. Then (read-only):
   - `aws s3api list-objects-v2 --bucket projectskin-skin-originals-prod --prefix users/<uid>/scans/<scanId>/ --query 'Contents[].Size'` shows one non-zero size. S3Mock never verified signatures, checksums or the signed size; this is the first real PUT of the presigned URL.
   - Console: `users/<uid>/consentLedger` has an `image_retention` entry with `source: "presign"` and that `scanId`; the dashboard's privacy section then says "Photo of your newest photo check: kept." (H27).
3. **The real engine.** Console: `users/<uid>/scanAnalyses/<scanId>_<sha16>` has `source: "server"`, `engine_build: "sha-8dc37dc501ea974825427c665acd7019120c20ec"`, `pipeline_version: "scan-0.1.6-provisional"`, `region_raw_native`; every value in `scores` and `region_scores` is between 0 and 1. The dashboard shows the reading.
4. **The real Gemini model.** Use a check whose questionnaire was **completed** (with no answers the reply is the fixed text plus "Finish the Skin Check questions…", F11, and Gemini is never called). Ask an ordinary question ("what does my cheek reading mean?") and one in Hinglish ("mere cheeks ki reading ka kya matlab hai?"). Both answer; the Hinglish one in Hinglish, never "only English". Console: each exchange writes two `users/<uid>/chatTurns` documents, both with `expireAt` 90 days ahead. The user-role one has `modelId: null` and `validator: null`. The echo-role one has `promptVersion: "ctx-prompt-4"`, `modelId` set to the model in S6, and one of: `validator.passed: true`; `fallback: true` with a reason in `validator.failures`; or, when the model asked for a doctor, `passed: false`, `fallback: false`, `redFlag: true` and the reply "This is a question for a doctor, dermatologist or pharmacist…". Then send a red-flag message ("I want to hurt myself"): the reply is the full referral (with the F06 helpline once P3 is in; today it has no number), and its echo-role turn has `modelId: null` (Gemini was not called).
5. **Rate limits.** In-memory and per instance, so a production check is only a smoke test:
   ```bash
   for i in $(seq 1 12); do curl -s -o /dev/null -w '%{http_code} ' -X POST https://skin-check-sigma.vercel.app/api/account/attestation -d '{}'; done; echo
   ```
   Expect `401` several times, then `429` (5 per minute per IP). No `429` at all means the requests landed on different instances: record it, it is not a rollback trigger. This uses the same per-IP bucket as `/api/skin-scan` and the upload route: wait a minute before the next scan from this IP. Never test the chat limit this way: `GEMINI_ROUTE_LIMITS` allows 18 chat requests a day in total and 10 per IP, counted per request whether or not Gemini is called, and a test with a valid token spends that budget.
6. **Live trust boundary checks.**
   - Echo about another account's `scanId` returns `409` (not found looks like not yours).
   - F13: make a second check with a reading on the same test account. Then, in the browser devtools, resend an earlier chat request that names the first check ("Copy as fetch" from the Network tab, paste in the console): it returns `409 CHAT_NOT_NEWEST`. A check with no reading of its own returns `409 CHAT_ANALYSIS_UNAVAILABLE` instead.
   - A forged chat history (edit one earlier message in the browser devtools request) returns `400 CHAT_HISTORY_INVALID`.
   - Console → Firestore → Rules Playground, signed in as the test uid: `create` on `users/<uid>/scanAnalyses/x` is denied; `get` on `erasedAccounts/<uid>` and on `under18Accounts/<uid>` is denied; `get` on another uid's `users/<other>` is denied.
   - The sweep without the secret: `curl -s -o /dev/null -w '%{http_code}\n' https://skin-check-sigma.vercel.app/api/account/erase/sweep` prints `401`.
7. **Erase and the sweep.** With a second made-up account that has one check with a photo: delete the account on `/account`. Right away (read-only): the S3 prefix `users/<uid2>/` lists nothing, the console has no `users/<uid2>` tree, Firebase Auth has no such user, and `erasedAccounts/<uid2>` exists. After the next cron run (03:00-03:59 India time, at least 70 minutes after the delete), `erasedAccounts/<uid2>` is gone. Vercel dashboard → project → Settings → Cron Jobs shows the run with status 200. To run it at once, use **Run** on that page (a STOP step; it only re-erases already erased accounts).
8. **Region.** `curl -s -o /dev/null -D - -X POST https://skin-check-sigma.vercel.app/api/skin-scan | grep -i x-vercel-id` shows `bom1::bom1::`.

- Who: owner.
- Undo: as D2.

### Clearing a mistaken under-18 record after deploy (H05)

Support tool, run by the owner only when an account holder says their under-18 answer was a mistake. Export the Firebase Admin settings (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`) in that one shell from your password manager. vite-node fills any variable the shell does not set from `.env` and `.env.local`; `--mode production` keeps `.env.development.local`'s emulator hosts out, and `--project` must name the project the script ends up connected to, or it refuses.

**STOP (owner runs this).**

```bash
env -u FIRESTORE_EMULATOR_HOST -u FIREBASE_AUTH_EMULATOR_HOST \
  npx vite-node --mode production --config vitest.config.ts scripts/clear-under18.ts -- \
  --project projectskin-a202c --phone +91XXXXXXXXXX --operator "<your name>" --reason "<what the user said>"
```
- Checked 2026-10-05 with this exact command shape on the Auth and Firestore emulators (no input and `no` stop; a wrong `--project` refuses; `CLEAR` clears).
- It prints the Firebase project (and `REAL PROJECT` or `EMULATORS`), the uid, the masked phone, every age entry and the marker, and what it will change. It changes nothing unless you type `CLEAR`.
- Then, together: one ledger entry `source: "support_clear"` with your operator name and reason (the ledger is never edited), and `under18Accounts/<uid>` deleted. The user is asked their age again.
- Undo: the user answering "under 18" again blocks the account again (the attestation route writes a new entry and the marker).

```
==================== STOP: JOB D DONE ====================
Owner confirms: D2, D3 and D4 pass, tracker A13 and I01 updated.
==========================================================
```

## Known gaps, recorded in the tracker, not fixed here

- Deny rules cannot read the current branch or expand variables. A bare `git push` or `git push origin HEAD` run while on `master`, and `git push origin "$BRANCH"` with `BRANCH=master`, are still allowed for agents. Only the CLAUDE.md hard rules stop those.
- Fixed: `ENGINE_TABLE` now lists `scan-0.1.6-provisional` (A17). The deny rules match the `npx -y firebase-tools@latest …` and `F …` forms (B05) and block `gh pr merge` (D2), `vercel rollback`, `aws ecs deregister-task-definition`, `aws ecr batch-delete-image`, `firestore:databases:update` in every Firebase form, `git push` to `master`, and `docker push` to this ECR registry (B06). The owner runs these steps, so the rules do not affect them.
- `GEMINI_ROUTE_LIMITS` allows 18 chat requests a day in total and 10 per IP (a free-tier budget), counted per request, including requests that never reach Gemini. With the context path in production that is about 18 Echo replies a day for all users. Raise it with the G1 decision (tracker F14).
- Revoked ID tokens still pass Firestore rules for up to an hour (H23, open).
