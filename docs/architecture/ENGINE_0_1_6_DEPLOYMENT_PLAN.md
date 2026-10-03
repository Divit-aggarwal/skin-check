# ENGINE_0_1_6_DEPLOYMENT_PLAN: moving skin-scan `scan-0.1.6` into production

| | |
|---|---|
| Date | 2026-10-03 |
| Status | **PLAN ONLY.** Nothing was built for release, pushed, merged, applied or deployed. Every AWS and GitHub fact below comes from **read-only** calls (`describe-*`, `list-*`, `batch-get-image`, GitHub API `GET`s) |
| Approval needed | **Yes, from the owner, before step 6.** Engine changes need explicit approval (CLAUDE.md; DECISION_LOG D-18). Gate 04's brief approved the `engine_build` change in code, not a production rollout |
| Scope | The CV engine on ECS only. The frontend gate-04 rollout (Vercel) is a separate decision with its own preconditions (§9) |

---

## 0. Premises in the request, corrected

| Request says | Repository and AWS evidence | Consequence |
|---|---|---|
| The engine branch adds "native stats" | `stats=both` and the native path have existed since `3c56b7f`, an ancestor of the live `7f3695e`. The 0.1.6 image delta is only `src/app/{deps,main,schemas}.py`, `src/pipeline/version.py` and the Dockerfile `ARG ENGINE_BUILD` | The rollout changes **no measurement**. Phase 0 on 0.1.6 found the measurement output bit-identical to 0.1.5 (PHASE_0_0_1_6_RESULTS) |
| A "stale `main`" carries unrelated commits that could ship | History is **linear**. Local `main` (`b10e682`) and `origin/main` (`afc55f5`) are both **ancestors of the live `7f3695e`**, so every commit on them is **already in production**. **GitHub has no `main` branch at all**: the repo's only branch, and its default, is `prod-hardening` at `8df8418` | There is nothing unrelated on `main` to leak. The real hazards are elsewhere (§3) |
| Merging to `main` and letting CI deploy is the path | `deploy.yml` has **never run**. It triggers only on `main`, which doesn't exist on GitHub. No GitHub Actions variables or secrets exist, no OIDC provider exists in the AWS account, and no deploy role exists. The workflow isn't even registered: GitHub lists only Dependabot | **CI cannot deploy today.** Production 0.1.5 was built and pushed **by hand** (§1). This plan uses the same manual path, executed step by step |

**Correction to gate 04 (its §3 item 3 and §8).**
- Gate 04 said a merge to `main` "would ship the whole hardening line". **That is wrong:** every commit up to `7f3695e` is already live, `56a48be` is infrastructure that is already applied, and `.dockerignore` keeps `infra/` out of every image.
- Gate 04 §3's build-identity argument assumed "CI builds once per commit". For a manual push it holds only under **build once, push once, immutable tag**, which is how this plan is written.

## 1. Current production (OBSERVED, read-only)

| Item | Value |
|---|---|
| ECS | cluster `skin-scan-cluster`, service `skin-scan-service`, ap-south-1 |
| Task definition | **`skin-scan:1`**, the only revision ever registered. Deployment created 2026-09-04 19:42 IST, rollout COMPLETED. 2 of 2 tasks running |
| Image reference in task def | `550428926515.dkr.ecr.ap-south-1.amazonaws.com/skin-scan:sha-7f3695ef2bfbda37273411766531848774bd098e` (by **tag**) |
| Running digest (both tasks) | **`sha256:668b1f56c4405b4aacad3b77076ac12c7d8e59a09bacc95693952a2e09455005`**: an OCI image index (`application/vnd.oci.image.index.v1+json`) |
| ECR contents | That one tagged index, plus 2 untagged manifests pushed in the same second (2026-09-04 13:50 IST). These are the index's children: the amd64 image and its attestation |
| **Production commit** | **`7f3695ef2bfbda37273411766531848774bd098e`** (`scan-0.1.5-provisional`) |
| How the commit was verified | The live digest was exported locally and `/app` was compared with `git archive 7f3695e`. `src/`, `requirements.txt`, `pyproject.toml`, `uv.lock`, `.env.example` and `LICENSE` are identical. The one extra item is `src/skin_scan.egg-info/`, a git-ignored local `pip install -e` artifact |
| How 0.1.5 was built | **From a working tree, by hand**, not by CI. The egg-info shows it: `.dockerignore`'s `*.egg-info/` is root-anchored and misses `src/`. The ECR push was at 13:50 on 2026-09-04, between `7f3695e` (2026-09-03) and `56a48be` (2026-09-04 14:28) |
| Live runtime config | `ENV=production`, `MAX_CONCURRENT_SCANS=4`, `SCAN_TIMEOUT_SECONDS=25`, `MAX_IMAGE_MB=8`, `LOG_JSON=true`, `CORS_ORIGINS`, `LOG_LEVEL`, `PORT`. Secret: `SCAN_API_SECRET` (PRODUCTION_BASELINE) |
| Live frontend | Vercel `1b39f88`. It does **not** send `stats`, and its schema is `.passthrough()` with `pipeline_version: z.string()`. Nothing gates on `scan-0.1.5`, so a 0.1.6 response is compatible |

## 2. Desired state and the exact commits

**Desired commit:** `8dc37dc501ea974825427c665acd7019120c20ec` (`feat(scan): return exact engine_build; pipeline 0.1.6`). It is on local branch `engine-build-identity` and is not pushed anywhere.

**Commits between production and desired:** `git log 7f3695e..8dc37dc`

| Commit | What it is | In the image? | Ships? |
|---|---|---|---|
| `56a48be` fix: reconcile phase 2 aws infrastructure | `infra/terraform/{security_groups,vpc_endpoints,waf}.tf` only. These fixes **were already applied live** via `terraform apply`; the commit only brings the repo into line | **No.** `.dockerignore` excludes `infra/` | Already live in AWS. It must stay **in the source tree** (§3) |
| `8dc37dc` feat(scan): return exact engine_build; pipeline 0.1.6 | the `engine_build` setting and response field, the version bump, the Dockerfile `ARG`, CI smoke assert, and 3 tests | Yes: `src/app/*` and `version.py`. The Dockerfile change is applied at build time | **The only required engine change** |

**Required commits: exactly one, `8dc37dc`, built from its full tree.** Its tree already contains every commit up to `7f3695e` (already live) and `56a48be` (no image effect).

**Image delta against live (OBSERVED by diff):**
- `src/app/deps.py`: `engine_build` setting
- `src/app/main.py`: `ENGINE_BUILD` in the response
- `src/app/schemas.py`: `engine_build` field
- `src/pipeline/version.py`: `0.1.6` plus changelog
- `requirements.txt`: unchanged
- base image: unchanged (pinned by digest)

## 3. What must NOT ship, and why

| Hazard | Why | Guard |
|---|---|---|
| `refs/claude/checkpoint-409a0628` (`52c9cc8`) and `refs/claude/checkpoint-014a140d` (`01678b3`), both "WIP: Claude Code rate-limit checkpoint" | Unreviewed work-in-progress, and **not ancestors** of `8dc37dc` | Build from `git archive 8dc37dc`. Never from a working tree or a checkpoint ref |
| The bench image `sha256:ce51ed2d…` (local `skin-scan-bench:0.1.6-8dc37dc`) | Its `engine_build` is `bench-local-…`, deliberately not an ECR tag. Pushing it would put a non-tag identity into production records | Never tag or push it. Build the release image fresh (§5 step 2) |
| Creating or pushing a `main` branch on GitHub | The first push to `main` runs `deploy.yml` **from that commit**. Lint, test and build would run, then `push-and-deploy` fails at `configure-aws-credentials` (no role, no secrets), leaving a red, half-run pipeline. It also makes "who deployed what" ambiguous | Don't create `main` on GitHub as part of this rollout. CI enablement is its own gate (§8) |
| A `terraform apply` from any tree **without `56a48be`** | It would **revert live fixes**: the S3-prefix-list egress rule (ECR layer pulls from the private subnet would time out) and the WAF `CrossSiteScripting_BODY` count override (multipart `/scan` uploads would be blocked) | **No `terraform apply` in this rollout** (§5 step 7). Whoever applies later must do it from a tree containing `56a48be` |
| Cherry-picking `8dc37dc` onto `7f3695e` "to exclude `56a48be`" | The new SHA's tree **lacks `56a48be`**, so any later apply from it is the hazard above. It gains nothing, since `56a48be` never reaches an image | **Rejected.** Deploy the existing `8dc37dc` |
| A dirty working-tree build (the 0.1.5 pattern) | It can pick up local, unreviewed or ignored files, as the `egg-info` did | Clean `git archive` export only |

## 4. ECR image, tag and digest

| | Value |
|---|---|
| Repository | `550428926515.dkr.ecr.ap-south-1.amazonaws.com/skin-scan` (tag mutability **IMMUTABLE**) |
| Tag | **`sha-8dc37dc501ea974825427c665acd7019120c20ec`** (the `deploy.yml` convention: `sha-<full git sha>`) |
| `ENGINE_BUILD` build arg | **The same string as the tag**, so every response's `engine_build` names the ECR tag |
| Digest | **Unknown until built.** It is recorded at step 5, and from then on it is the identity of 0.1.6. It will **not** equal the bench digest `ce51ed2d…`: a fresh build resolves transitive packages anew (PHASE_0_0_1_6_RESULTS §2.2) |
| Identity guarantee | Exactly one build, pushed once, to an immutable tag. If a rebuild is ever needed, it must get a new tag; ECR refuses an existing one |
| Lifecycle | The policy keeps the newest 20 `sha-` tags and expires untagged images after 1 day. After this push there are 2 tagged images, so `sha-7f3695e…` (the rollback target) is safe. The 0.1.5 index's untagged children have survived 29 days. **That is observed behaviour, not documented AWS behaviour.** Re-check the new index's children after 24–48 h (§7) |

## 5. Procedure (owner-executed; each step is a gate)

**1. Pre-flight on the exact source.** CI never ran, so nothing else checks the code.
```
git -C ../skin-scan archive 8dc37dc | tar -x -C <clean-dir>
cd <clean-dir> && uv run ruff check src/ tests/ && uv run pyright src/ && uv run pytest -q tests/
```
Expect 81 passed.

**2. Build once, from the clean export.** Record the builder machine, the Docker version and the image ID.
```
docker build --platform linux/amd64 --no-cache \
  --build-arg ENGINE_BUILD=sha-8dc37dc501ea974825427c665acd7019120c20ec \
  -t 550428926515.dkr.ecr.ap-south-1.amazonaws.com/skin-scan:sha-8dc37dc501ea974825427c665acd7019120c20ec .
docker image inspect <tag> --format '{{.Id}}'     # = the release digest candidate
```
For reference, the bench was built on Docker 29.5.2 with the containerd image store on an arm64 Mac.

**3. Run the local container smoke test,** replicating `deploy.yml`'s smoke job:
- `/health/ready` returns 200 with `pipeline_version: scan-0.1.6-provisional`;
- an authenticated `/scan` on `fixtures/input_face.png` returns 7 scores;
- **`engine_build == "sha-8dc37dc501ea974825427c665acd7019120c20ec"`**;
- `ENV=production` (the cv2 pin assertion must pass at startup).

**4. Phase 0 replay on THIS image, before pushing** (PROTOCOL §8):
- Run `phase0/bench.py` (matrix and determinism) against this exact local image ID, into a new `results_<digest12>/` directory.
- Pass condition: H-EQ holds, meaning the response is bit-identical to 0.1.5 except `pipeline_version` and `engine_build`.
- **If H-EQ fails, stop.** The build drifted into the measurement path. Investigate before any push.

**5. Push and confirm the digest.**
```
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 550428926515.dkr.ecr.ap-south-1.amazonaws.com
docker push <tag>
aws ecr describe-images --region ap-south-1 --repository-name skin-scan \
  --image-ids imageTag=sha-8dc37dc501ea974825427c665acd7019120c20ec --query 'imageDetails[0].imageDigest'
```
- The ECR digest **must equal** the local image ID from step 2. It did for `668b1f56`, which is identical locally and in ECR.
- If it differs, pull the ECR digest and repeat step 4 on it. The Phase 0 evidence must be about the deployed bytes.

**6. Owner sign-off, then roll out.** Clone `skin-scan:1`, changing **only** the image, as `deploy.yml` does:
```
aws ecs describe-task-definition --region ap-south-1 --task-definition skin-scan:1 --query taskDefinition > td.json
# edit: containerDefinitions[].image = "<repo>@sha256:<digest from step 5>"
# remove: taskDefinitionArn, revision, status, requiresAttributes, compatibilities, registeredAt, registeredBy
aws ecs register-task-definition --region ap-south-1 --cli-input-json file://td.json    # → skin-scan:2
aws ecs update-service --region ap-south-1 --cluster skin-scan-cluster --service skin-scan-service \
  --task-definition skin-scan:2
aws ecs wait services-stable --region ap-south-1 --cluster skin-scan-cluster --services skin-scan-service
```
- **Pin by digest, not tag (recommended).** The tag is immutable, so both resolve to the same bytes today. A digest in the task definition makes that structural, and it survives a tag expiring or being deleted. The trade-off: the task definition no longer shows the human-readable commit, which is why `engine_build` carries it.
- Env, secrets, roles, CPU and memory stay exactly as in `:1`.
- The caller needs `ecs:RegisterTaskDefinition`, `ecs:UpdateService` and `iam:PassRole` on `skin-scan-ecs-execution-role` and `skin-scan-ecs-task-role`.

**7. No `terraform apply`.**
- The service has `lifecycle { ignore_changes = [task_definition] }`, so an apply would roll nothing, and §3 explains the risk of applying from the wrong tree.
- The real `terraform.tfvars` is **untracked** (local to whoever ran the 0.1.5 apply). Its `image_tag` still says `sha-7f3695e…`. That is harmless with `ignore_changes`, but it should be updated by its holder **after** a successful rollout, so the files match reality.

## 6. Rollback

**Automatic:**
- `deployment_circuit_breaker { rollback = true }` with `deployment_minimum_healthy_percent = 100`.
- A rollout whose tasks fail health checks reverts to `:1` on its own, and capacity never drops below 2 healthy tasks.

**Manual:** one command, no rebuild.
```
aws ecs update-service --region ap-south-1 --cluster skin-scan-cluster --service skin-scan-service \
  --task-definition skin-scan:1
aws ecs wait services-stable --region ap-south-1 --cluster skin-scan-cluster --services skin-scan-service
```
- `:1` references the immutable tag `sha-7f3695e…` → `668b1f56`, still in ECR and protected by keep-20. **Never deregister `:1`,** and don't delete that image.

**Triggers.** **CloudWatch alarms have no actions** (IMPLEMENTATION_MAP C12), so someone must **watch the rollout by hand** for at least 30 min and roll back on any of:
- an ALB 5xx rate above the pre-deploy baseline;
- `/scan` p95 latency above the pre-deploy baseline by more than about 20% (0.1.6 adds no computation, so any rise is unexpected);
- target-group health-check failures, or task restarts;
- `/scan` returning anything other than 200 for the fixture.

**Data safety.** The response change is purely additive. Records written under 0.1.6 stay readable after a rollback (gate-04 tests: old and new records both map). A rollback needs no frontend change.

## 7. Post-deployment verification

| # | Check | Pass condition |
|---|---|---|
| 1 | `aws ecs describe-services` | `skin-scan:2` is PRIMARY, rollout COMPLETED, 2/2 running, no other deployment |
| 2 | `aws ecs describe-tasks` | **every** task's `imageDigest` equals the step-5 digest |
| 3 | `GET https://api.theprojectskin.com/health/ready` | 200, `pipeline_version: scan-0.1.6-provisional`, `cv2_version: 4.11.0` |
| 4 | One authenticated `/scan` with `fixtures/input_face.png` (the same request `deploy.yml`'s production smoke test makes) | 200, 7 scores, **`engine_build == "sha-8dc37dc…"`**. There is no native block by default, since the request sends no `stats`; that is expected |
| 5 | One real scan through the live frontend (`1b39f88`) | Completes normally. That frontend ignores `engine_build` (`.passthrough()`) |
| 6 | CloudWatch / ALB metrics, 30 min, then 24 h | 5xx, p95 and task restarts at the pre-deploy baseline |
| 7 | ECR, 24–48 h later | The new index's untagged child manifests still exist (see §4) |

**Not a pass condition: bit-identity between the production fixture response and the bench response.**
- Fargate runs native amd64; the bench ran under emulation. Cross-platform identity is **NOT ESTABLISHED** (PHASE_0_RESULTS §3.7).
- Record any difference as evidence for Phase 0's open item. It is not a rollback trigger, because nothing user-facing depends on bit-identity.

## 8. Phase 0: deployed image or pinned ECR digest?

**The pinned ECR digest, pulled read-only and run locally. Never the live service.**

- PROTOCOL §4.1 and §8 key the evidence to an image digest. "What's deployed" is a pointer that can move (rollback, the next deploy). The digest can't.
- The protocol and the research briefs forbid production calls. The live service is also shared with real users, sits behind WAF and rate limits, and has 2 tasks behind a load balancer, so determinism runs against it would be confounded.
- **With §5's ordering, the two are the same bytes:** Phase 0 is replayed on the release image before the push (step 4), and the digest is confirmed after the push (step 5). The digest the bench evidence names is then exactly the digest production runs (check §7 #2).
- The existing 0.1.6 bench evidence is for `ce51ed2d…`, a different build. It shows the measurement code is unchanged, but it does **not** cover the release digest until step 4 runs.

## 9. Ordering and dependencies

- **The engine rollout is independent of frontend gate 04.** The live frontend works against 0.1.6 unchanged, and gate 04's frontend works against 0.1.5 (`engine_build` simply absent). Either can go first.
- **Engine first is preferable:** the gate-04 frontend then records `engine_build` from its first production record.
- The gate-04 **frontend** rollout (which sends `stats=both`, with the documented latency cost) has its own preconditions (D-07 latency; D-22 data locality before C2 is deployed). They are not part of this plan.
- **Optional git hygiene after a successful rollout. Not required, not automatic:**
  - fast-forward local `prod-hardening` to `8dc37dc` (it is linear: `git merge --ff-only`);
  - push `prod-hardening` to GitHub (8 commits: `23b2401` … `56a48be`, `8dc37dc`);
  - this triggers no workflow, because `deploy.yml` listens on `main` only;
  - **never** push or create `main` until CI enablement is its own gate.
- **CI enablement (a separate future gate):**
  - create the GitHub OIDC provider and deploy role (`infra/terraform/OIDC_DEPLOY_ROLE.md`);
  - add the Actions variables and secret listed in `deploy.yml`'s header;
  - decide the branch model (`main` vs `prod-hardening`);
  - then do one supervised first run.
  - Until then, every engine deploy follows §5 by hand.

## 10. Summary

| Item | Answer |
|---|---|
| Current production commit | `7f3695ef2bfbda37273411766531848774bd098e` (0.1.5), image `sha-7f3695e…` → `sha256:668b1f56…`, task def `skin-scan:1` |
| Desired commit | `8dc37dc501ea974825427c665acd7019120c20ec` (0.1.6) |
| Required commits | `8dc37dc` only. Its tree includes the already-live history and `56a48be`, which is infrastructure only, already applied, and excluded from the image |
| Must not ship | the `refs/claude/checkpoint-*` WIP commits; the bench image `ce51ed2d…`; a GitHub `main` branch; any `terraform apply` from a tree without `56a48be`; a cherry-pick; a working-tree build |
| CI | Cannot deploy: no `main`, no OIDC provider or role, no variables or secrets, never run. Manual §5 path |
| ECR | tag `sha-8dc37dc501ea974825427c665acd7019120c20ec`; digest fixed at step 5; `ENGINE_BUILD` = the tag |
| Rollback | automatic circuit breaker, or `update-service --task-definition skin-scan:1` |
| Phase 0 | the pinned ECR digest, run locally, replayed before the push on the same bytes |
