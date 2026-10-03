# CURRENT_SYSTEM_AUDIT — what actually exists (2026-10-03)

Scope: `skin-check` (frontend, branch `firebase-phone-auth`, HEAD a20ebff) and `skin-scan` (CV service, branch `prod-hardening`, HEAD 56a48be).

How this was built:
- The lead traced the code directly.
- Agents 1–5 audited their areas and spot-checked against the code.
- Every claim cites `file:line`. "ASSUMPTION" marks anything not verified.

**Docs that are stale. Do not trust them over code:**
- `PROJECT_CONTEXT.md`: says Supabase, Amplify, and "Echo deferred". All three are wrong.
- `DEPLOYMENT.md`: Amplify sections; Gemini default at :57.
- `AUDIT.md`: "IaC not in this repo", "no Secrets Manager".
- skin-scan `docs/deployment.md:34` and `infra/terraform/README.md:10`: "never applied". It is applied.
- `CV_AUDIT.md`: targets App Runner.
- `docs/background-jobs.md`.
- `lib/skin-check-rules.ts:55`: claims "region_hist stored on every scan". It is never stored.
- `types/skin-scan.ts:78`: labels the fixture 0.1.1. It is 0.1.5.
- `app/api/skin-check/chat/route.ts:17`: "pre-login, unauthenticated by design". Every Echo user has already passed phone OTP.

---

## 1. Architecture at a glance

| Concern | Reality | Evidence |
|---|---|---|
| Frontend | Next.js 14.2.35 App Router on **Vercel** | package.json; DEPLOYMENT.md:5-9 |
| Backend (app) | Three Next.js route handlers, Node runtime: `/api/skin-scan`, `/api/skin-scan/upload`, `/api/skin-check/chat` | app/api/** |
| CV service | FastAPI + MediaPipe 0.10.21 (legacy `mp.solutions`) + opencv-contrib 4.11.0.86. **Live** on ECS Fargate behind ALB + WAFv2, ap-south-1, `api.theprojectskin.com` | skin-scan infra/terraform/*.tf; commit 56a48be; terraform.tfvars image_tag sha-7f3695e |
| Auth | Firebase phone OTP. Server verifies ID tokens with firebase-admin. CV is protected by a shared `X-Scan-Secret` | lib/firebase/admin.ts:94,104; main.py:188 |
| Database | **Firestore**: `users/{uid}` and `users/{uid}/skinChecks/{scanId}` | lib/firebase/skin-checks.ts; firestore.rules |
| Object storage | Private S3 `projectskin-skin-originals-prod`, written by IAM user `skin-check-uploader` (PutObject only). **Not in IaC** | DEPLOYMENT.md:292-360; lib/s3.ts |
| LLM | Gemini via `@google/genai` 2.17.1, `generateContent`, model `GEMINI_MODEL_SYNTHESIS` (default `gemini-3.6-flash`) | lib/gemini.ts:13,101-114 |
| Supabase | Orphaned and untracked. Not used | git ls-files; commit ef93f2e |
| AWS (Terraform-managed) | VPC + endpoints, ALB (access logs), WAFv2, ECR, ECS (autoscale 2–10, containerInsights), Secrets Manager (`SCAN_API_SECRET`), CloudWatch (30-day logs, 2 alarms **with no alarm_actions**), IAM | infra/terraform/*.tf |
| Deploys | CV: manual `terraform apply`. deploy.yml has never run and triggers on `main` while work is on `prod-hardening`. Frontend: Vercel | deploy.yml:3-5 |
| Local dev | `.env.local` points `SKIN_SCAN_API_URL` at the **production** CV host | Agent 1 F4 |

## 2. One real scan, end to end (as implemented)

**Section order** (lib/skin-check-steps.ts:24-350): `about-you` (name, age, gender) → `verify` (phone OTP) → `skin-photo` → `your-skin` → `personal-context` → `diet-hydration` → `sun-protection` → `get-your-results` (`final_phone`, `savesScan: true`).
- On a repeat scan, the latest questionnaire is reused, so the flow is verify → skin-photo → get-your-results (skin-check-validation.ts:30; useSkinCheckFlow.ts:238-250).

**Steps:**
1. **Start.** An in-memory session plus an IndexedDB/localStorage draft (lib/skin-check-draft.ts). `scanId` is minted client-side with `crypto.randomUUID` (newScanId).
2. **Capture** (PhotoCapture.tsx).
   - Mobile: `<input capture="user">`, keeping the verbatim original (with EXIF), plus a 1280px JPEG q0.92 re-encode with EXIF orientation applied (:63-87,198-202).
   - Desktop: getUserMedia at an ideal 1280×720 (hooks/useCameraStream.ts:45-49); here original and photo are the same blob.
   - **No client quality gate**: no blur, exposure, pose, face-size or face-count checks.
   - Two checkboxes: processing (never persisted, no version; :119) and image retention (lib/consent.ts, version `"skin image retention version 1"`).
3. **Upload** (lib/api.ts:226-245, only if retention was consented). `POST /api/skin-scan/upload` does: rate limit → bearer → verifyIdToken → validate scanId (`/^[A-Za-z0-9_-]{8,64}$/`) → client-asserted consent flag → presigned PUT for `users/{uid}/scans/{scanId}/original.jpg`. The browser then PUTs the file. This happens **before** analysis.
4. **Analyse.** `POST /api/skin-scan` (route.ts) does: env check → IP burst limit → verifyIdToken (**uid discarded**, :84-87) → 5 MB cap → IP daily quota → FastAPI `/scan[?overlays=…]` with a 30 s timeout → error_code mapping → `SkinScanResultSchema.safeParse` (zod, `.passthrough()`) → `{ok, result}`.
   - `stats=both` is never sent (:153-154).
5. **Engine** (skin-scan compose.py).
   - Rejects: >8 MB (main.py:270), >40 MP (utils_io.py:40,68), <64 px (compose.py:55), no face (compose.py:194), mask failure (:200).
   - Preprocess: whole-frame gray-world, CLAHE, gamma 1.1, resize to 1024 max.
   - Then 7 maps, 4 regions, `score_types` (all `image_relative`), `region_low_confidence` (<2000 px), and `pipeline_version` `scan-0.1.5-provisional`.
   - It generates its own `scan_id` uuid (main.py:239) but **never returns it**.
6. **Client scoring.** `runSkinCheckRules` (lib/skin-check-rules.ts:227) produces bands (cuts at 0.20/0.45 in concern space), 4 placeholder SKUs, a `rule_trace` and `SCORING_VERSION "v0-provisional"`.
   - The dashboard uses **only bands**. It shows band + number + a disclaimer (SkinCheckDashboard.tsx:50,73,178).
   - The SKU list was **removed from the UI** in commit e232b38. `SKU_DISPLAY` is dead code.
7. **Persist.** The user taps "Get my results", which runs PhoneAuthStep.tsx:77 `void saveSkinCheck(...)`. That is one client-SDK `setDoc`, fire-and-forget, written as:
   - `{schemaVersion:1, scanId, answers (incl. phone), status, image{stored,captureMethod,storage,key}, consent{imageRetention…}, result: persistableResult, createdAt}`
   - `persistableResult` keeps only `scores, regions, region_scores, score_types?, region_low_confidence?, pipeline_version` (skin-checks.ts:31-41).
   - **Dropped:** region_raw, region_hist, bin edges, *_corrected, bands, SKUs, rule_trace, scoring_version, and capture metadata other than captureMethod.
8. **Rules** (firestore.rules).
   - Owner may `get/list/create`.
   - `update, delete: if false`.
   - On create, the rules check only the image key and the consent version. **Nothing in `result` or `answers` is validated.**
   - `users/{uid}` lets the owner write any fields.
9. **Previous scans.** PreviousScans.tsx lists summaries: status, date, imageStored, hasResult. No comparison.
10. **Echo** (/echo).
    - Reads the **in-memory session**, which is lost on refresh. Threads are not persisted.
    - `POST /api/skin-check/chat` with **no auth**. The body carries `messages` (client may send role `"echo"`), `answers`, `scores` and `regionFocus`.
    - The server recomputes `composite` from the client scores and builds a free-text systemInstruction (persona: "skin digital twin").
    - The Gemini call has a 10 s timeout and 2 retries. **No safetySettings** (the platform default is OFF), no response schema, no output validation.
    - It returns free text.

## 3. Defects that matter for longitudinal use (verified)

| ID | Severity | Defect | Evidence |
|---|---|---|---|
| D1 | **P0** | `region_raw`, `region_hist` and native stats are never persisted. Every scan already stored can never be rescored, which contradicts the locked decision in PROJECT_CONTEXT.md and the calibration plan in CALIBRATION.md:327-353 | skin-checks.ts:24-41 |
| D2 | **P0** | All 7 scores are image-relative by construction. No change between scans is meaningful at any version | score_semantics.py; redness.py:83-99; risks-and-technical-debt.md:7-14 |
| D3 | High | Client writes the measurement: a user can forge their own scores. Echo also narrates client-supplied scores without auth | rules:24-26; chat route:48-54 |
| D4 | High | A refresh mid-analysis restores past the photo step with scan `idle`. "Get my results" is enabled, so the record is saved as `questionnaire_only`, permanently (update denied), and the S3 original is orphaned | useSkinCheckFlow.ts:187-192,234,268-285; PhoneAuthStep.tsx:141 only guards `loading` |
| D5 | High | A dashboard retry after save never persists. The record stays `analysis_failed` even though the retry may have uploaded an original | SkinCheckDashboard.tsx:100-125; single caller PhoneAuthStep.tsx:77 |
| D6 | High | A retake reuses `scanId`, so a second photo overwrites `original.jpg` under the same key | PhotoCapture.tsx:207; rotation only at useSkinCheckFlow.ts:301 |
| D7 | High | Stored originals cannot reproduce scores. Nothing has GetObject, the server applies no EXIF transpose, and mobile scoring used the 1280 re-encode, not the original | utils_io.py:50-98; docs/deployment.md:32 |
| D8 | High | Time-varying answers (pregnancy, contraception, current products, stress, age bucket) are silently copied into every new scan. There is no reuse flag or questionnaire version | useSkinCheckFlow.ts:238-250 |
| D9 | High | No erasure path anywhere: rules deny delete, the IAM user is PutObject-only, and the bucket config (versioning, Object Lock) is unknown | firestore.rules:15,27; lib/s3.ts |
| D10 | High | Gemini key appears sized for the free tier. Free-tier content may be used for training and human review | rate-limit.ts:113-120; Gemini API terms (Agent 5) |
| D11 | Med | A retention-consented original lands in S3 before any consent record exists. An abandoned flow leaves a face image with no record. A restored draft records `imageRetention:false` for an object that exists | upload/route.ts:60-80; useSkinCheckFlow.ts:196-211 |
| D12 | Med | Prompt-injection paths: unknown option values are echoed verbatim into systemInstruction (skin-check-format.ts:36), and client-forged `echo` turns are accepted | route.ts:20,50 |
| D13 | Med | No correlation id joins Firestore docs, Vercel logs and CV logs. CV `scan_id` is not returned. Alarms notify nobody | main.py:239; cloudwatch.tf |
| D14 | Med | 18+ gate is client-only | useSkinCheckFlow.ts:364 |
| D15 | Med | "Digital twin" appears in user-facing metadata and the persona | app/layout.tsx:23,26,35; lib/gemini.ts:62 |
| D16 | Low | Original stored with full EXIF (possibly GPS; ASSUMPTION). HEIC may be stored under a `.jpg` key | PhotoCapture.tsx:198-201; PHASE_3_FINAL_REPORT |

## 4. Engine outputs — what each metric actually is (Agent 2, from code)

| Metric | Computes | Verdict |
|---|---|---|
| redness | (mean a* − min a*)/(max − min) over face pixels of the gray-world-corrected image. Set by the two extreme pixels | Labelled proxy, no trend |
| oiliness | Fraction of specular pixels (fixed V/S/gradient thresholds on CLAHE input) | Proxy; rename to "shine" |
| texture | Laplacian² + LBP, each divided by its own max, then min-max | Proxy |
| pores | DoG + whole-image Otsu; 0 detections at 1024 px (pores are sub-pixel) | Remove from display |
| blemishes | 2-of-4 vote with face-percentile thresholds (fires on ~30–40% of pixels by construction) | Proxy |
| hydration | Inverse-gradient terms dominated by zero-gradient pixels (1e6 each). Effectively a flat/clipped-pixel counter | Remove from display ("Dryness" relabel is still a hydration claim) |
| pigment | Face-relative L* darkness z-score + b* + a*, min-max | Proxy now; native L*/ITA is the only realistic measurement candidate |

Other engine facts:
- Regions: forehead, cheeks (L and R are built separately, then ORed at face_mesh.py:223), nose, chin.
- The forehead hull includes the eyebrows (face_mesh.py:184).
- There is no beard or fringe exclusion.
- Face pixel scale varies with distance; the image is resized to 1024 px.
- calibration.py RANGES use mixed encodings and are unwired.

## 5. What exists and can be reused

| Classification | Components |
|---|---|
| REUSE AS-IS | Phone auth + `verifyFirebaseIdToken`; `scanImageKey` / `isValidScanId`; presign route; consent.ts constants; CV error_code contract and its mapping in the proxy; CV request_id middleware and JSON logs; ECS/ALB/WAF Terraform; zod `SkinScanResultSchema`; the pure `bandScores` / `runSkinCheckRules` pattern; create-only Firestore rules |
| REUSE WITH CHANGE | `/api/skin-scan` (read uid, accept scanId, server write); `saveSkinCheck` (drop `result`, add reuse flag, questionnaire version, processing consent); `lib/gemini.ts` (package, schema, validator, safety settings); chat route (auth, server context); `skin-check-rules.ts` (quiz-keyed selection, safety constraints, RULESET_VERSION); rate-limit (uid-keyed, durable); CV `/scan` (return scan_id, accept X-Request-ID); ci.yml (run the rules emulator) |
| MUST CHANGE | Save gate and draft-restore clamp (D4); retake scanId rotation (D6); answer-reuse semantics (D8); erasure (D9); paid Gemini tier (D10); prompt-injection paths (D12); "digital twin" copy (D15) |
| LEAVE UNTOUCHED (without explicit approval) | CV pipeline maps / preprocess / face_mesh (CLAUDE.md: no engine replacement without approval); Supabase orphan (do not revive); render.yaml |

## 6. Tests and monitoring

- **Frontend vitest (6 files):** upload client ordering, upload route contract, s3-key, reusable answers, flow navigation, Firestore rules.
  - The 20 rules cases are **skipped in CI** because no emulator runs there.
- **Frontend CI:** tsc, lint, vitest, build.
- **Frontend untested:** rules/bands/SKUs, gemini/chat route, `/api/skin-scan` proxy and schema, `saveSkinCheck` mapping, draft restore.
- **skin-scan:** 75 pytest tests on a single face fixture. No repeatability test, no golden-output regression. CI never executed.
- **Monitoring:** frontend has `console.*` only (no Sentry, no analytics). CV has structured JSON logs plus request_id. CloudWatch alarms have no actions.

## 7. Versioning that exists

| Version | Defined | Persisted per record? |
|---|---|---|
| `SKIN_CHECK_SCHEMA_VERSION = 1` | skin-checks.ts:14 | Yes |
| `PIPELINE_VERSION` | skin-scan version.py | Yes, inside `result`, success only |
| `SCORING_VERSION "v0-provisional"` | skin-check-rules.ts:9 | **No** |
| Retention consent version | consent.ts | Yes, when given |
| Processing consent | PhotoCapture.tsx:119 | **No, and no version** |
| cv2 version / image tag | /health only | **No** |
| Questionnaire version | — | **Does not exist** |
| Prompt / persona version, model id | — | **Does not exist** |
