# PHASE 0 RUNBOOK: engine 0.1.6, India Firestore, Vercel bom1, website gates 01-04

Prepared 2026-10-03 on `longitudinal-platform`. **Nothing in this file has been executed.**

- Every step that changes production is run by **the owner**. The agent only prepared this file.
- Commands are written to run from the skin-check repository root (`/Users/divit/Projects/frontend/skin-check`) unless a step says otherwise.
- Never paste a secret value into a terminal line, a document, a ticket or a chat. The commands below load secrets into shell variables only.
- Sources: ENGINE_0_1_6_DEPLOYMENT_PLAN.md, FIRESTORE_RESET_RUNBOOK.md and DATA_LOCALITY_DECISION.md (D-22, both on `infra/india-region` ff08107), PHASE_0_0_1_6_RESULTS.md, GATE_02 §8.

## Order and why

| Order | Job | Why here |
|---|---|---|
| 1 | **C. Engine 0.1.6** | Independent of the other jobs, and the safest: the live website (1b39f88) works unchanged with 0.1.6 (its response schema is `.passthrough()` and `pipeline_version` is any string). It is undone with one command. Doing it first means the new website's first `scanAnalyses` records already carry `engine_build`. Its live replay must finish before job A's outage, so the two checks never overlap. |
| 2 | **A. Firestore reset to asia-south1** | Irreversible, but the data is disposable (owner decision, D-22). It must come **before D**, so the first `scanAnalyses` records are created in India. The live website keeps working on the new database once the rules are deployed (LP's rules are the live rules plus one owner-read-only block). |
| 3 | **B. Vercel bom1** | Done as an isolated redeploy of the **current** production code (1b39f88) with the project region changed, so the region change is tested on its own and undone with Instant Rollback. It comes after A so the functions move next to the new database. The `vercel.json` half of B cannot ship on its own: ff08107 also carries gate-01 code (6e9081d) without its durability fix (428c63d). It ships with D. |
| 4 | **D. Website gates 01-04** | Last, because it depends on A (D-22: first records in India) and on the A14 merge that brings `vercel.json`. Merging the pull request into `master` **is** the production deploy: the Vercel project deploys `master` automatically. Gates 01 and 02 ship together in one merge. GATE_02 §8 requires gate 01 first or together. |

**Between jobs:** each job ends with a STOP line. The owner confirms the job's checks passed, writes the result into the tracker, and only then starts the next job.

---

## Before any job (owner, read-only or git-only)

| # | Command | Who | Good output | Check | Undo |
|---|---|---|---|---|---|
| P1 | `git -C ../skin-scan push origin engine-build-identity` | Owner | `* [new branch] engine-build-identity -> engine-build-identity` | `git -C ../skin-scan ls-remote --heads origin engine-build-identity` shows `8dc37dc…` | `git -C ../skin-scan push origin --delete engine-build-identity` |
| P2 | B01 items 1-3 from DEV_PROD_BOUNDARY.md (on ff08107): remove the Firebase Admin key (`FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`) and the `S3_SKIN_IMAGES_*` lines from `.env.local`, and move the Desktop `*-firebase-adminsdk-*.json` off this laptop | Owner | the variables and the file are gone | `grep -cE '^(FIREBASE_PRIVATE_KEY\|FIREBASE_CLIENT_EMAIL\|S3_SKIN_IMAGES_)' .env.local` prints `0`; `ls ~/Desktop/*adminsdk*.json` finds nothing | restore from your password manager |

- P1 backs up the source of the image that job C deploys. Today it exists on one laptop only. It triggers no CI, because skin-scan's `deploy.yml` runs on pushes to `main` only, and GitHub has no `main` branch.
- P2 matters before job A: the Firebase Admin key bypasses security rules, so a laptop that still holds it can write into the new database. The S3 keys write to the production image bucket.

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

### C1. Push the image to ECR

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
- If `n` is below about 20, the p95 is not meaningful. Write that down; the p95 rule in C3 then does not apply, and the other rollback rules still do.
- Undo: nothing to undo. (Logs Insights bills a few cents for the data it scans.)

### C3. Update the service

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
- Check: this step is the check. Also complete one real scan on the live website (https://skin-check-sigma.vercel.app or the custom domain); it must finish normally.
- Undo: nothing to undo (read-only call). On failure, roll back as in C3.

### C5. Phase 0 replay against the live service, compared with the local run (`$BASE`)

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

Run from the skin-check repository root on `longitudinal-platform`. `firebase.json`, `firestore.rules` and `firestore.indexes.json` there are the files that get deployed.

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

```bash
F firestore:databases:delete "(default)" --project $P
```
- Who: owner. It asks for confirmation; answer yes.
- Good output: a success message naming `projects/projectskin-a202c/databases/(default)`.
- Check (read-only): `F firestore:databases:list --project $P` lists no databases.
- Undo: **none.** All test documents are gone for good. No export is taken, by owner decision (D-22). Point-in-time recovery was off.

### A2. Create `(default)` in asia-south1 with delete protection (wait about 5 minutes after A1)

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

### A3. Deploy rules and indexes again

```bash
F deploy --only firestore:rules,firestore:indexes --project $P
```
- Who: owner. Run it right after A2. Until it finishes, client access to the new database is denied.
- Deploys `longitudinal-platform`'s rules: the live rules plus `users/{uid}/scanAnalyses/{id}` (owner read only, no client writes). Only an addition, so the live website (1b39f88) is unaffected.
- Good output: `✔ firestore: released rules firestore.rules to cloud.firestore` and `✔ Deploy complete!`.
- Check (read-only):
  - `F firestore:indexes --project $P` prints `{"indexes": [], "fieldOverrides": []}`.
  - Firebase console → Firestore → Rules shows `match /scanAnalyses/{id}`.
- Undo: deploy the live (`master`) rules instead, from a clean copy of `origin/master`:
  ```bash
  git worktree add /tmp/skin-check-master origin/master && cd /tmp/skin-check-master \
    && npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes --project projectskin-a202c; cd -
  git worktree remove /tmp/skin-check-master
  ```

### A4. Daily backups (recommended by the approved D-22 runbook)

```bash
F firestore:backups:schedules:create --database "(default)" --recurrence DAILY --retention 7d --project $P
```
- Who: owner.
- Good output: a schedule with recurrence DAILY and retention 7 days.
- Check (read-only): `F firestore:backups:schedules:list --database "(default)" --project $P` shows one DAILY schedule.
- Undo: `F firestore:backups:schedules:delete <schedule name from the list> --project $P`.

### A5. Application check (production, real phone)

1. Sign in with an existing test account. It works, because Auth was untouched.
2. Complete a scan with retention consent. `users/{uid}/skinChecks/{scanId}` appears in the console.
3. The previous-scans list shows it.
4. `scanAnalyses` stays empty: the live site does not write it until job D.
5. The console shows `users/{uid}` with `phoneNumber` and `lastSeenAt` (the profile upsert on sign-in).
6. Rules, local: `npm run test:rules` passes. It uses the emulator with the same rules file.
7. Rules, production: in the console Rules Playground, a second test account cannot read the first account's `users/{uid}`. Never use a forged client.
8. S3: `aws s3api list-objects-v2 --bucket projectskin-skin-originals-prod --prefix users/<uid>/scans/<scanId>/ --query 'KeyCount'` returns `1`.

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
  - One real scan on the live website still completes, including the S3 upload. Use https://skin-check-sigma.vercel.app; `scan.theprojectskin.com` is also attached to this Vercel project (`vercel api /v9/projects/skin-check/domains`). `lib/s3.ts` signs with `S3_SKIN_IMAGES_REGION`, not the Vercel region.
- Undo: `vercel rollback dpl_7aCicWiHeqEJuer3grPWqpC3dTow`, then B1's undo.

```
==================== STOP: JOB B DONE ====================
Owner confirms: deployment regions [bom1], x-vercel-id bom1::bom1,
scan works, tracker A05 updated. Do not start job D before this.
==========================================================
```

---

## JOB D: website gates 01-04 (the code that goes with engine 0.1.6)

### D0. Bring `infra/india-region` into `longitudinal-platform` (A14)

- Who: owner. Follow docs/architecture/A14_RECONCILIATION_PROPOSAL.md steps 1-5 exactly. The only conflict is `docs/architecture/DECISION_LOG.md`.
- Good output: a merge commit on `longitudinal-platform`.
- Check (read-only):
  ```bash
  git show longitudinal-platform:vercel.json                               # "regions": ["bom1"]
  grep -oE '^\*\*D-[0-9]+[a-z]?' docs/architecture/DECISION_LOG.md | sort | uniq -d   # prints nothing
  npm run typecheck && npm run lint && npm test && npm run build          # all pass
  ```
- Run these checks **before** A14 step 5 (`git stash drop`).
- **After P2, `.env.local` no longer has the Firebase Admin and S3 variables. The checks still pass; they need no production keys.**
  - None of the four checks needs an environment variable. Firebase client, Firebase Admin and S3 are all initialised lazily (`lib/firebase/client.ts`, `lib/firebase/admin.ts`, `lib/s3.ts`), so a missing value is a runtime error, not a build error.
  - Verified 2026-10-03 at b0a7424 in a clean worktree with no `.env` file other than `.env.example`: `npm test` (217 passed, 24 skipped), `typecheck`, `lint` and `build` all passed. ff08107 adds no new `process.env` reads.
  - The 24 skipped tests are the Firestore rules tests. Run them with `npm run test:rules`; it uses the local emulator and the demo project `demo-rules-check`, never production.
  - If a check fails with `Firebase Admin is not configured` or `S3 image storage is not configured`, a test or page started calling them at build time. That is a bug to record in the tracker. Never put the production keys back to make the check pass.
- A14_RECONCILIATION_PROPOSAL step 4 has the same `grep` bug: it matches `**D-03a` as `**D-03`. Use the fixed command above.
- Undo (before step 5 and before pushing): `git reset --hard ORIG_HEAD`, then `git stash pop` to restore the drafts.

### D1. Push `longitudinal-platform` and open the pull request

```bash
git push -u origin longitudinal-platform
gh pr create --base master --head longitudinal-platform --title "Longitudinal platform: gates 01-04 + India region" \
  --body "Gates 01-04, skinstate-1, D-22 vercel.json bom1. Deploy per docs/PHASE_0_RUNBOOK.md job D."
```
- Who: owner.
- The push creates a Vercel **preview** deployment. Preview has no Firebase or S3 credentials (only the engine and Gemini variables), so sign-in and saving do not work there and it cannot write production data. It does call the production engine and Gemini.
- Good output: `branch 'longitudinal-platform' set up to track 'origin/longitudinal-platform'`, then a PR URL.
- Check (read-only): `gh pr view longitudinal-platform --json mergeable,baseRefName,headRefOid` shows `"mergeable": "MERGEABLE"`, base `master`.
- Undo: `gh pr close longitudinal-platform`; `git push origin --delete longitudinal-platform`.

### D2. Merge the pull request. This is the production deploy.

```bash
gh pr merge longitudinal-platform --merge
```
- Who: owner. Vercel deploys `master` to production automatically.
- Gates 01 and 02 ship together in this one merge. GATE_02 §8 requires gate 01 first or together: deploying gate 02 without gate 01 would make every Echo request return 409 (GATE_02 §8).
- Good output: `✓ Merged pull request #…`. Vercel then shows a new production deployment, status Ready.
- Check (read-only):
  ```bash
  git fetch origin && git rev-parse origin/master
  vercel api /v9/projects/skin-check | jq -c '{id: .targets.production.id, sha: .targets.production.meta.githubCommitSha}'
  vercel api /v13/deployments/<id> | jq -c '{regions, readyState}'
  ```
  - `sha` equals `origin/master`; `regions: ["bom1"]`; `readyState: "READY"`.
- Undo:
  - Fast: `vercel rollback <deployment id from B2>`. This returns production to 1b39f88 in bom1. Records already written to `scanAnalyses` stay; the old site ignores them.
  - Git: `git revert -m 1 <merge commit>` in a new PR. Its merge redeploys the old code.

### D3. Application check (production, real phone)

1. Sign in, complete a scan.
2. Firebase console: `users/{uid}/scanAnalyses/{scanId}_{sha16}` exists with `source: "server"`, `engine_build: "sha-8dc37dc501ea974825427c665acd7019120c20ec"`, `pipeline_version: "scan-0.1.6-provisional"` and `region_raw_native`.
3. Echo works for that scan while signed in. Calling it without signing in returns 401:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://skin-check-sigma.vercel.app/api/skin-check/chat -H 'content-type: application/json' -d '{}'
   ```
   prints `401`.
4. `x-vercel-id` still shows `bom1::bom1::` (B2's curl).

- Who: owner.
- Undo: as D2.

```
==================== STOP: JOB D DONE ====================
Owner confirms: D2 + D3 pass, tracker A13 updated, I01 (end-to-end
production check) may start.
==========================================================
```

## Known gaps, recorded in the tracker, not fixed here

- B06: the `.claude/settings.json` deny rules do not cover several other production-changing commands, among them `gh pr merge` (D2, the production deploy), `vercel rollback`, `git push`, `docker push`, `aws ecs deregister-task-definition`, `aws ecr batch-delete-image` and `firestore:databases:update`. Only the CLAUDE.md hard rules stop agents from running them.
- Fixed: `ENGINE_TABLE` now lists `scan-0.1.6-provisional` (A17). The deny rules now match the `npx -y firebase-tools@latest …` and `F …` forms (B05).
