# Owner queue: production commands, in the order to run them

Prepared 2026-10-09 by the agent (owner brief 2026-10-09). **Nothing in this file has been run.** Every command here changes production or something outside this repository; the owner runs it. After each step, tell the agent; it runs the check written under the step and says go or stop.

Rules for every step:
- Run the steps in order. Do not start a step until the check of the one before has passed.
- Paste each command into your own terminal (or after `!` in Claude Code), from the skin-check repository root unless the step says otherwise.
- Never paste a secret into a terminal line, a document or a chat. The commands below never print one.
- If a check fails, run that step's undo and stop.

State when this was written (2026-10-09, all checked by the agent):
- Engine: `skin-scan-service` on task definition `skin-scan:3` (1 vCPU / 2 GB, image digest `sha256:9a8f96c0…`), 1 running copy, HEALTHY, in the **public** subnets with a public IP, outbound 443 to anywhere allowed, Container Insights off. **All four paid interface endpoints still exist** (Logs is the recreated `vpce-068f7263470a72713`).
- Website: production `dpl_4yYMPGgiMj3hjEeeWWP9J7K3UKyA`, commit `3537f82` (PR #5), region `bom1`.
- Firestore `(default)`: asia-south1, delete protection on, point-in-time recovery off, no backup schedule; branch rules and the chat-turn expiry policy live (D3).
- The release branch `release/real-users` and its pull request #6 (https://github.com/Divit-aggarwal/skin-check/pull/6) are open, **not merged** (see step 6).

---

## Step 0. Before you start (logins)

```bash
aws sts get-caller-identity --query Account --output text      # 550428926515
npx -y firebase-tools@latest login:list                         # Logged in as info@theprojectskin.com
npx -y firebase-tools@latest firestore:databases:get "(default)" --project projectskin-a202c   # must print the database, not an auth error
vercel whoami
gh auth status
```
- If the Firebase read fails with "credentials are no longer valid": run `npx -y firebase-tools@latest login --reauth --no-localhost` **in your own terminal** (it prints a link; open it, sign in, and paste the code back into that terminal, not into a chat). The expired login cost two failed D3 runs on 2026-10-07/09.
- If AWS says the session expired: `aws login` in your own terminal.

## Step 1. Commit and push the terraform files (no production change)

The agent wrote the terraform changes in a separate worktree (`/Users/divit/Projects/frontend/skin-scan-infra`, branch `infra/stage1-cost`, staged, not committed): commits in the skin-scan repository are not allowed from the agent's session. They make the files match what is live after this queue (1 vCPU / 2 GB, one copy, Container Insights off, public subnets with a public IP, outbound 443, the four interface endpoints removed). **Do not run terraform.**

```bash
cd /Users/divit/Projects/frontend/skin-scan-infra && git diff --cached --stat && git commit -m "infra(terraform): match live after the Stage 1 cost changes (no apply)" && git push -u origin infra/stage1-cost; cd -
```
- Good output: six files changed (README.md, ecs.tf, security_groups.tf, variables.tf, vpc.tf, vpc_endpoints.tf), then the push. A push to a branch other than `main` starts no CI deploy (skin-scan `deploy.yml` runs on `main` only).
- Check (agent): `git -C ../skin-scan ls-remote --heads origin infra/stage1-cost` shows the branch.
- Undo: `git -C ../skin-scan push origin --delete infra/stage1-cost`.
- Merging that branch into skin-scan `main` is a separate owner decision (a push to `main` deploys the engine through CI).

## Step 2. Finish the network saving: delete the four interface endpoints (about $76/month)

Why this order: a running engine copy keeps the Logs route it started with (seen 2026-10-09: after the Logs endpoint was deleted, the running copy sent no log line until a new copy started). So Logs goes **last**, and a new copy is started right after it. Health checks alone do not show that problem; the agent checks the logs too.

Every endpoint below sits in the private subnets `subnet-01643ba2a0d184a17 subnet-0ef89ebb99aa011f3` with security group `sg-078d770eaaf84515e` and private DNS on. **Undo for any one of them** (put back that endpoint; then run step 2.5's command to start a fresh copy):

```bash
aws ec2 create-vpc-endpoint --region ap-south-1 --vpc-id vpc-065552b80ed040eb8 --vpc-endpoint-type Interface \
  --service-name com.amazonaws.ap-south-1.<SERVICE> --subnet-ids subnet-01643ba2a0d184a17 subnet-0ef89ebb99aa011f3 \
  --security-group-ids sg-078d770eaaf84515e --private-dns-enabled --query 'VpcEndpoint.{id:VpcEndpointId,state:State}' --output json
```
(`<SERVICE>` is `secretsmanager`, `ecr.api`, `ecr.dkr` or `logs`.)

### 2.1 Secrets Manager endpoint
```bash
aws ec2 delete-vpc-endpoints --region ap-south-1 --vpc-endpoint-ids vpce-08e6c8bc8ac6c92f2 --output json
```
- Good output: `{"Unsuccessful": []}`.
- Check (agent): the endpoint is gone; `/health/ready` reports `scan-0.1.6-provisional`; the task is HEALTHY; one smoke scan returns 200.
- Undo: the command above with `secretsmanager`.

### 2.2 ECR API endpoint
```bash
aws ec2 delete-vpc-endpoints --region ap-south-1 --vpc-endpoint-ids vpce-0399ff7697c5626e5 --output json
```
- Good output, check and undo: as 2.1 (undo with `ecr.api`).

### 2.3 ECR image endpoint
```bash
aws ec2 delete-vpc-endpoints --region ap-south-1 --vpc-endpoint-ids vpce-0d45dd18bd4d2f5b1 --output json
```
- Good output, check and undo: as 2.1 (undo with `ecr.dkr`).

### 2.4 Logs endpoint (the last one), then 2.5 at once
```bash
aws ec2 delete-vpc-endpoints --region ap-south-1 --vpc-endpoint-ids vpce-068f7263470a72713 --output json
```
- Good output: `{"Unsuccessful": []}`. **Go straight on to 2.5**; the running copy may hold its log lines back until it is replaced (they are delivered when it stops).
- Undo: the command above with `logs`, then 2.5.

### 2.5 Start one new copy, to prove it works with no endpoints
```bash
aws ecs update-service --region ap-south-1 --cluster skin-scan-cluster --service skin-scan-service --force-new-deployment --query 'service.taskDefinition' --output text && aws ecs wait services-stable --region ap-south-1 --cluster skin-scan-cluster --services skin-scan-service && echo STABLE
```
- Good output: `arn:…:task-definition/skin-scan:3`, then `STABLE` after a few minutes (the wait can take up to 10 minutes; if your terminal gives up first, the agent checks).
- Check (agent), all three must pass:
  1. the new task pulled its image (`pullStoppedAt` set) and is HEALTHY on digest `9a8f96c0…`, in a public subnet;
  2. log lines arrive in `/ecs/skin-scan` from the **new** task's log stream;
  3. a smoke scan returns 200 with `scan-0.1.6-provisional` (this proves the secret loaded).
- Undo if any check fails: recreate all four endpoints (the command above, four times), then run 2.5 again. If the service cannot start a healthy copy at all, the deployment circuit breaker keeps the old copy running.

### 2.6 Delete the unused second key of the uploader (tracker B12)
Key `…DWBQ` was last used 2026-09-08 18:30 UTC (checked 2026-10-09). The command re-checks that before it deletes, and deletes nothing if the key was used since.
```bash
K=$(aws iam list-access-keys --user-name skin-check-uploader --query "AccessKeyMetadata[?ends_with(AccessKeyId,'DWBQ')].AccessKeyId" --output text); \
L=$(aws iam get-access-key-last-used --access-key-id "$K" --query 'AccessKeyLastUsed.LastUsedDate' --output text); echo "last used: $L"; \
case "$L" in 2026-09-08*) aws iam delete-access-key --user-name skin-check-uploader --access-key-id "$K" && echo "deleted …DWBQ";; *) echo "NOT deleted: used since 2026-09-08";; esac
```
- Good output: `last used: 2026-09-08T18:30:00+00:00`, then `deleted …DWBQ`.
- Check (agent): the uploader has one key, `…CAD2`, Active; the next real photo upload works (phone check 7.3).
- Undo: none (a deleted key cannot come back). The website uses `…CAD2`, not this key.

## Step 3. Daily database backups and point-in-time recovery (owner decision: on before real users)

`firestore:databases:update` sets any flag left out back to its default (`DISABLED`), so the command names **both** flags; leaving out `--delete-protection ENABLED` would switch delete protection off.

```bash
npx -y firebase-tools@latest firestore:databases:update "(default)" --delete-protection ENABLED --point-in-time-recovery ENABLED --project projectskin-a202c
npx -y firebase-tools@latest firestore:backups:schedules:create --database "(default)" --recurrence DAILY --retention 7d --project projectskin-a202c
```
- Good output: the database with Delete Protection `ENABLED` and Point In Time Recovery `ENABLED`; then one schedule, DAILY, retention 7 days.
- Check (agent): `firestore:databases:get "(default)"` shows both ENABLED and location asia-south1; `firestore:backups:schedules:list --database "(default)"` shows one DAILY schedule.
- Cost: point-in-time recovery and backups are billed by stored data; with today's few documents it is cents a month.
- Undo: `firestore:databases:update "(default)" --delete-protection ENABLED --point-in-time-recovery DISABLED --project projectskin-a202c`; `firestore:backups:schedules:delete <name from the list> --project projectskin-a202c`.

## Step 4. Make sure Production uses your paid Gemini key (before the merge, so the merge's build uses it)

`GEMINI_API_KEY` is stored in Vercel as a sensitive value: neither the dashboard nor the CLI can show it, so "confirm" means putting your paid key in on purpose. The key never goes through a chat.

1. Open https://aistudio.google.com/apikey and sign in with the Google account that owns the paid key.
2. Find the key whose project shows a paid billing tier (the "Plan" or "Tier" column says Paid / Tier 1 or higher, not Free). Click **Copy** on that key.
3. Open https://vercel.com → project **skin-check** → **Settings** → **Environment Variables**.
4. Find `GEMINI_API_KEY` with environment **Production** → the **⋯** menu → **Edit** → paste the key into the value field → **Save**. (If it offers only "Remove", remove it and use **Add New**: name `GEMINI_API_KEY`, value the key, environment Production only, **Sensitive** on.)
5. Do not redeploy now: the merge in step 6 builds with the new value.
6. **Spend guard (tracker B13).** With a paid key and 20 questions per user, extra accounts mean extra spend:
   - Firebase console → https://console.firebase.google.com/project/projectskin-a202c/authentication/providers → the **Sign-in method** list must show **Phone** as the only enabled provider. If any other one (Anonymous, Email/Password, Google…) says Enabled, click it → switch **Enable** off → **Save**.
   - Budget alert on the paid key's Google Cloud project: https://console.cloud.google.com/billing → choose the billing account of the paid key's project → **Budgets & alerts** → **Create budget** → scope: that project → amount: your monthly limit (for example ₹2,000) → alerts at 50%, 90% and 100% → **Finish**.

- Check (agent): `vercel env ls production` lists `GEMINI_API_KEY` with an updated time of today. Which key it is can only be confirmed by Echo answering after step 6 (phone check 7.5).
- Undo: edit it back to the previous key (if you still have it).

## Step 5. Deploy the new database rules BEFORE the merge (reordered on purpose)

The brief said "merge, then any rules deploy it needs". The rules change must go first: the new code writes photo-consent version 2, and the live rules accept only version 1, so with the old rules every new check with a kept photo would be refused and lost. The new rules accept version 1 **and** version 2 (the only rules difference from `master`; checked with `git diff origin/master -- firestore.rules`), so they are safe for the live site now and for the new code after the merge. Indexes and the chat expiry policy are unchanged, so only rules are deployed.

```bash
git fetch origin && git worktree add /tmp/skin-check-release origin/release/real-users && cd /tmp/skin-check-release && npx -y firebase-tools@latest deploy --only firestore:rules --project projectskin-a202c; cd -; git worktree remove /tmp/skin-check-release
```
- Good output: `✔ firestore: released rules firestore.rules to cloud.firestore` and `✔ Deploy complete!`.
- Check (agent): the live rules contain `in ['skin image retention version 1', 'skin image retention version 2']` and everything else as before (D3).
- Undo: the same command with `origin/master` in place of `origin/release/real-users` (only before step 6; after the merge `master` is the new code).

## Step 6. Merge the pull request: this is the production deploy

```bash
gh pr merge 6 --merge
```
- Good output: `✓ Merged pull request #6`. Vercel builds `master` for production (about 2 minutes).
- Check (agent): production deployment READY, its commit equals `origin/master`, regions `[bom1]`, the sweep cron still registered; `/dev/recommendations` answers 404; a chat request without a login answers 401; the live rules unchanged from step 5. No other rules or index deploy is needed.
- Note: a browser tab left open from before the merge still runs the old page; a check with a kept photo fails there once (the upload now needs consent version 2). Reloading the page fixes it.
- Undo:
  - Fast: `vercel rollback dpl_4yYMPGgiMj3hjEeeWWP9J7K3UKyA` (today's production). A rollback turns off automatic production updates; after the problem is fixed, `vercel promote <new deployment id>` turns them back on. The rules from step 5 stay (they suit both versions).
  - Git: `git revert -m 1 <merge commit>` in a new pull request; its merge redeploys the previous code.

### How to turn Echo off quickly (only if needed; nothing to do now)
Echo is on by default (`ECHO_SWITCH` is not set). To turn it off:
```bash
printf 'off' | vercel env add ECHO_SWITCH production --no-sensitive
vercel redeploy $(vercel api /v9/projects/skin-check | jq -r '.targets.production.id') --target production
```
A Vercel setting takes effect only with a new deployment, hence the redeploy (about 2 minutes). The value is built into the code, so tell the agent afterwards: it loads https://skin-check-sigma.vercel.app/echo and checks the page source contains "Echo is paused for now". If it does not (a redeploy that reused an old build), run `vercel deploy --prod --force` from an up-to-date `master` checkout, which builds without the cache. Use `redeploy`, not `rollback` (rollback turns off automatic updates). A red-flag or self-harm message still gets the referral with the helpline while Echo is off. To turn Echo back on: `vercel env rm ECHO_SWITCH production --yes`, then the same redeploy.

## Step 7. Checks on your phone after the merge (made-up test accounts only)

Tell the agent each result. Items marked (Stage 1) were never reported and are still open.

1. **Sign in** by phone on https://skin-check-sigma.vercel.app; you land on Home. (D4 1, 9)
2. **AI-share consent is asked again** in Echo (the consent version changed from DRAFT to version 1; earlier answers no longer count). The text has no "DRAFT". (TD-29 (4))
3. **A check with a kept photo**: the photo consent text now ends "...kept until I delete my account, and handled according to the Project SKIN Privacy Policy." Complete the check with that box ticked. (D4 2, C4 website scan, A5 2) The agent then confirms the S3 object, the `image_retention` ledger entry at version 2, and the server analysis record (D4 3).
4. **History and profile** show the new check; Checks shows its photo; the opened check shows it. (A5 3-4, D4 11)
5. **Echo answers** an ordinary question and a Hinglish one (D4 4). This also proves the paid key from step 4 works.
6. **Red flag**: send "I want to hurt myself": the reply starts with the help line, **Tele-MANAS on 14416 or 1800-89-14416, free, 24 hours a day, and 112 in an emergency**; tapping 14416 opens the phone dialler. (F06, D4 4)
7. **Trust boundary** (D4 6), **Rules Playground** (A5 5, D4 6), **navigation on a phone and a desktop** (D4 10), **the face drawing** (D4 12).
8. **Routine** (D4 13): the steps show the real products (Refreshing Cleanser, 5% Niacinamide Serum, Calming Moisturiser, Protecting Sunscreen SPF 50 PA++++); Clear Seal and Active Boba are under "Other products"; Active Boba cannot be started (out of stock). The purpose line has no "DRAFT". A Stage 1 test account that still has a "sample-…" product in its routine shows the raw id: delete that test account (item 9) or ignore it.
9. **Erase and the next sweep** with a second made-up account (D4 7): delete it on `/account`; after the next 02:30-03:29 India-time run, Vercel → project → Settings → Cron Jobs shows the run with status 200.

Not tested on purpose: the 20-questions-a-day limit (it spends 20 real Gemini calls; covered by tests).

## Step 8. Delete the old Firebase Admin key: ONLY AFTER THE PHONE CHECKS PASS (TD-27, B11)

The old key (ID starting `5ab9a1f241`) is still Active so that rollbacks to deployments built before the 2026-10-07 rotation keep working. After step 7 passes, no rollback needs it. There is no `gcloud` on this laptop, so this is done in the console:

1. Open https://console.cloud.google.com/iam-admin/serviceaccounts?project=projectskin-a202c
2. Click the service account whose email starts with `firebase-adminsdk-`.
3. Open the **Keys** tab.
4. Find the key whose ID starts with `5ab9a1f241` (the other Active key is the rotated one in use; do not touch it).
5. Click the **delete** (trash) icon on that row → **Delete**.

- Check (agent): the production site still signs in and saves a check (it uses the rotated key); you confirm the Keys tab lists one user-managed key.
- Undo: none (a deleted key cannot come back). Rollbacks to deployments older than 2026-10-07 stop working.

## Step 9. Two-step sign-in (MFA) for the AWS admin user `theagihustler@gmail.com` (tracker B12)

1. Sign in at https://console.aws.amazon.com as `theagihustler@gmail.com` (account 550428926515).
2. Top right, click the user name → **Security credentials**.
3. Under **Multi-factor authentication (MFA)**, click **Assign MFA device**.
4. Device name: `phone`; choose **Authenticator app** → **Next**.
5. Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…), scan the QR code, then type two consecutive 6-digit codes → **Add MFA**.

- Check (agent): `aws iam list-mfa-devices --user-name theagihustler@gmail.com` lists one device.
- After this, `aws login` asks for the code too.
- The other console user, `TeleGlobal-user` (never signed in, read-only policies), was left untouched as asked.

---

# TD-33 release: optional questionnaire, product-name boxes, capture button (prepared 2026-10-10)

Pull request: branch `feat/optional-questionnaire`. **Nothing below has been run.** Same rules as above: in order, one step at a time, tell the agent after each step.

**Why this order is safe.** The only rules change adds two things: checks for the new `questionnaire` and `productNames` fields on `skinChecks`, and the new `laterAnswers` collection.
- New rules with the old (live) code: the live code never writes `questionnaire`, `productNames` or `laterAnswers`, so every live write still passes (a record without those fields is accepted; tested in tests/firestore-rules-questionnaire.test.ts, "a record with none (old bundles too)").
- Old rules with the new code: "Answer the questions later" would be refused (old rules deny any path they do not match), so the merge must come **after** the rules.
So: rules first (Q1), then merge (Q2). No index, TTL or other setting changes.

## Q1. Deploy the new database rules (before the merge)

```bash
git fetch origin && git worktree add /tmp/skin-check-td33 origin/feat/optional-questionnaire && cd /tmp/skin-check-td33 && npx -y firebase-tools@latest deploy --only firestore:rules --project projectskin-a202c; cd -; git worktree remove /tmp/skin-check-td33
```
- Good output: `✔ firestore: released rules firestore.rules to cloud.firestore` and `✔ Deploy complete!`.
- Check (agent): the live rules equal `firestore.rules` on the branch (they contain `match /laterAnswers/{scanId}` and `function productNamesOk`); a check on the live site (old code) still saves (phone check: one check with no photo kept).
- Undo: the same command with `origin/master` in place of `origin/feat/optional-questionnaire` (only before Q2).

## Q2. Merge the pull request (this is the production deploy)

```bash
gh pr merge 9 --merge
```
- Good output: `✓ Merged pull request #9`; Vercel builds `master` for production.
- Check (agent): production deployment READY on the merge commit, region `bom1`; `/questions` answers 200; a chat request without a login answers 401.
- Undo: `vercel rollback <previous production deployment id>` (fast; the Q1 rules suit both versions), or `git revert -m 1 <merge commit>` in a new pull request.
- Note: a tab left open from before the merge runs the old page; reloading fixes it. A draft saved by the old page is discarded once (draft version 3).

## Q3. Phone checks after the merge (made-up test accounts only)

1. New check: after About you, "About the questions" shows the number of questions and the minutes; **Skip for now** → sign in, photo, results with readings and the line "You skipped the questions…".
2. Home shows "Your Skin Check questions"; Echo shows the notice and answers with the fixed reply plus "Finish the Skin Check questions…" (no AI answer).
3. Answer the questions from Home; type a prescription name; Echo now answers normally; the opened check shows "Products you named"; Home and Echo never show the name.
4. Capture on a phone: "Open camera" opens the camera; on a laptop the browser asks for the camera only after "Open camera".
5. Delete that test account; the agent checks that no `skinChecks` or `laterAnswers` document is left for it.

Legal review of the line under the boxes (tracker H31) is separate and does not block the merge unless you decide it does.

---

# TD-34 release: Echo suggests Project Skin's own products (prepared 2026-10-10)

Pull request: branch `feat/echo-own-products` (pull request #10: https://github.com/Divit-aggarwal/skin-check/pull/10). **Nothing below has been run.** Same rules as above: in order, one step at a time, and tell the agent after each step. Start only after the TD-33 queue above is done.

**Why this order is safe.** There is no database rules, index or expiry change. The opening is stored in `chatTurns`, which only the server writes, and its read is a single-field equality query. The merge goes live with product suggestions **off** (step P1), so the new code first runs exactly like today's Echo (the same Gemini input as before). Suggestions are switched on in a separate redeploy (P4), after the phone checks. Turning them off again is the same switch.

Before P4, the owner should approve the six product descriptions (TD-34 report) and decide whether advertising waits for the written dermatology clearance (tracker E16).

## P1. Set the product switch to off in Production (before the merge)

```bash
printf 'off' | vercel env add ECHO_PRODUCTS_SWITCH production --no-sensitive
```
- Good output: `Added Environment Variable ECHO_PRODUCTS_SWITCH to Project skin-check`.
- Check (agent): `vercel env ls production` lists `ECHO_PRODUCTS_SWITCH`. Nothing is live yet: a setting takes effect only with a new deployment.
- Undo: `vercel env rm ECHO_PRODUCTS_SWITCH production --yes`.

## P2. Merge the pull request (this is the production deploy)

```bash
gh pr merge 10 --merge
```
- Good output: `✓ Merged pull request #10`. Vercel builds `master` for production (about 2 minutes).
- Check (agent): production deployment READY on the merge commit, region `bom1`; a chat request without a login answers 401; the switch is off in the live page: `curl -s https://skin-check-sigma.vercel.app/echo | grep -o 'productsOn[^,]*'` prints `productsOn\":false` (checked on a local build with the switch off, 2026-10-10).
- Undo: `vercel rollback <previous production deployment id>` (fast), or `git revert -m 1 <merge commit>` in a new pull request.

## P3. Phone checks with suggestions off (made-up test accounts only)

1. Echo answers an ordinary question and a Hinglish one, exactly as before. No product cards, no suggested routine.
2. "Which products should I use?" gets the same kind of answer as today, with no products.

## P4. Turn product suggestions on (WAITING: owner decision TD-36, 2026-10-10. Only after the real-model run on the final code, 78 product cases plus about 20 ordinary questions, shows 0 products outside the list, 0 made-up claims passed and 0 guard failures, and the owner says go)

```bash
vercel env rm ECHO_PRODUCTS_SWITCH production --yes
vercel redeploy $(vercel api /v9/projects/skin-check | jq -r '.targets.production.id') --target production
```
- Good output: `Removed Environment Variable`, then a new production deployment READY (about 2 minutes).
- Check (agent): the new deployment is READY on the same commit; `curl -s https://skin-check-sigma.vercel.app/echo | grep -o 'productsOn[^,]*'` prints `productsOn\":true`. If it still prints `false` (a redeploy that reused an old build), run `vercel deploy --prod --force` from an up-to-date `master` checkout.
- Undo (turn suggestions off again, Echo stays on): `printf 'off' | vercel env add ECHO_PRODUCTS_SWITCH production --no-sensitive`, then the same redeploy command.

## P5. Phone checks with suggestions on (made-up test accounts only)

1. A test account with a completed check and answered questions: Echo opens with "Here is…" or a similar line, then up to four cards in the order Cleanse, Treat, Moisturise, Protect. Each card shows the name, step, key ingredient, how to use and "Echo's note", with the line "These are Project Skin's own products." above. No price anywhere. Active Boba never appears (out of stock).
2. Tap "See it on the store": the product page opens in a new tab.
3. Reload `/echo`: the same suggestion comes back, and it uses none of the day's 20 questions.
4. Ask "Mujhe kaunsa face wash lena chahiye?": an answer, with a card if Echo suggests one.
5. A test account whose answers include "Deep, painful breakouts": the opening starts with "What you described is worth showing a dermatologist." and shows **no** card.
6. A test account with "A prescription product" picked: cards, and the last line is "Check with your doctor before you start any of these products."
7. "I want to hurt myself" still gets the help line first, with no card.

### How to turn product suggestions off quickly (only if needed)
The P4 undo: `printf 'off' | vercel env add ECHO_PRODUCTS_SWITCH production --no-sensitive`, then the redeploy. Echo keeps answering, with no products. To turn Echo itself off, see "How to turn Echo off quickly" above.
