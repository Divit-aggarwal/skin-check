# PRODUCTION_BASELINE: what is live before any longitudinal work

Recorded 2026-10-03 using read-only queries:
- `vercel inspect` and `vercel api`
- `aws ecs describe-*`
- `GET /health`
- the Firebase MCP `get_security_rules` tool

Nothing was changed. Every later implementation diff should be measured against this baseline.

## 1. Deployed components

| Component | Deployed version | Where | How verified |
|---|---|---|---|
| Frontend (skin-check) | Git **`1b39f8851bb9224da0e3422e00edeeed1d9db9ac`** on `master` ("Merge pull request #4 from Divit-aggarwal/firebase-phone-auth"). Its file tree is identical to `a20ebff` (`git diff 1b39f88 a20ebff` is empty) | Vercel project `skin-check` (`prj_A0DgyV2WkO14y3e462zSq8vd7sDd`), deployment `dpl_7aCicWiHeqEJuer3grPWqpC3dTow`, created 2026-09-14 23:46 IST. Aliases: `skin-check-sigma.vercel.app`, `skin-check-git-master-…`. **Function region `iad1` (Washington DC, US)**, Fluid compute, Node 24.x | `vercel inspect`, `vercel api /v13/deployments`, `/v9/projects` |
| CV service (skin-scan) | Image `skin-scan:sha-7f3695ef2bfbda37273411766531848774bd098e`, digest `sha256:668b1f56c4405b4aacad3b77076ac12c7d8e59a09bacc95693952a2e09455005`. That commit's `PIPELINE_VERSION` is **`scan-0.1.5-provisional`**. `/health` reports cv2 `4.11.0` | ECS cluster `skin-scan-cluster`, service `skin-scan-service`, task def `skin-scan:1` (2 vCPU / 4 GB), 2 of 2 tasks running, last deployment 2026-09-17. ap-south-1, behind ALB/WAF at `api.theprojectskin.com` | `aws ecs describe-services/-tasks/-task-definition`; `git show 7f3695e:src/pipeline/version.py`; `curl /health` |
| CV runtime config (non-secret) | `ENV=production`, `MAX_CONCURRENT_SCANS=4`, `SCAN_TIMEOUT_SECONDS=25`, `MAX_IMAGE_MB=8`, `LOG_JSON=true`, `CORS_ORIGINS=""`. Secret: `SCAN_API_SECRET` (Secrets Manager) | task def `skin-scan:1` | `describe-task-definition` (values of secret entries not read) |
| skin-scan repo vs deployed | Branch `prod-hardening` HEAD `56a48be` is one commit ahead of the deployed `7f3695e`. **The difference contains no `src/`, `requirements.txt` or `Dockerfile` changes**, so the deployed engine is the code in the repo | `git diff --stat 7f3695e 56a48be -- src requirements.txt Dockerfile` (empty) |
| Firestore | Database `(default)` in project `projectskin-a202c`, **location `nam5` (US multi-region)**. Native mode. PITR disabled. Version retention 1 h. Delete protection disabled. No TTL policies | Firestore Admin REST `GET /databases` (read-only) |
| Firestore rules | The deployed rules are **identical in content** to the repo's `firestore.rules` | Firebase MCP `get_security_rules` |
| Originals bucket | `projectskin-skin-originals-prod`, ap-south-1. 9 objects, 4.68 MB in total | `aws s3api list-objects-v2` (counts only; no keys read) |
| Gemini | Model from env `GEMINI_MODEL_SYNTHESIS` (Sensitive on Vercel, so the value cannot be read). Code default is `gemini-3.6-flash`, which exists in `models.list` | `vercel env ls`; read-only `models.list` call with the local key |
| Shopify storefront | `theprojectskin.com` (Shopify). The skin-check app is served from Vercel | HTTP headers |

## 2. Live scan flow at `1b39f88`

The flow is documented in full, with file:line references, in [CURRENT_SYSTEM_AUDIT.md §2](CURRENT_SYSTEM_AUDIT.md). In summary:

```
Browser (Next.js page from Vercel iad1)
 ├─ phone OTP ──────────────────────────▶ Firebase Auth
 ├─ [retention consent] presign request ▶ Vercel iad1 /api/skin-scan/upload ─▶ (signs URL)
 │   └─ PUT original.jpg (EXIF intact) ──▶ S3 ap-south-1 (direct, browser → AWS)
 ├─ 1280px JPEG ────────────────────────▶ Vercel iad1 /api/skin-scan ─▶ ECS ap-south-1 /scan ─▶ back
 ├─ bands computed in browser (SCORING_VERSION v0-provisional)
 ├─ "Get my results" → setDoc ──────────▶ Firestore nam5 (US): answers incl. phone, scores, consent
 └─ /echo → answers + scores ───────────▶ Vercel iad1 /api/skin-check/chat (no auth) ─▶ Gemini API ─▶ back
```

## 3. Things this baseline makes measurable

- **No regression to the scan path.** Compare scan latency and success rate before and after C2, using the CV JSON logs and Vercel function logs.
- **Data at rest today:** 9 S3 objects. The Firestore document count was not read. Any migration or erasure work starts from a small, known base.
