# Deployment

> ## ⚠️ CORRECTION — read before anything below
>
> **This app is deployed on Vercel, not AWS Amplify.**
>
> Production is `https://skin-check-sigma.vercel.app` (confirmed from live
> response headers: `server: Vercel`, `x-vercel-id: bom1::…`). The two most
> recent commits (`a39146b`, `d2a9532`) are both Vercel-specific deploy fixes,
> and `lib/s3.ts` encodes Vercel-runtime-specific reasoning about the `AWS_*`
> variables that platform injects into functions.
>
> **Everything below describing AWS Amplify Hosting as "a locked decision" is
> historical and no longer accurate.** Treat the Amplify console steps, the
> Amplify environment-variable instructions, and the Amplify-specific smoke
> test as superseded. The env-var *names* and their purposes are still
> correct — only the platform they get entered into has changed.
>
> Two further corrections to the text below:
> - **Node.js `>=22.12.0`** is the real floor (`package.json` `engines`), not
>   `>=18.17.0`. `firebase-admin` 13 fails to load below it — that is what
>   commit `a39146b` fixed. CI pins `22.x`.
> - **"No health endpoint was added"** is justified below by Amplify's
>   platform checks. That reasoning no longer applies; the app still has no
>   health endpoint, and `/health`, `/health/live` and `/health/ready` all
>   return 404 in production.

## Prerequisites

- **Node.js `>=22.12.0`** — this repo's `package.json` `engines` field.
  `next@14.2.35` itself only requires `>=18.17.0`, but `firebase-admin` 13
  does not load below 22.12, which takes every authenticated API route down
  with it (commit `a39146b`). 22.12 is therefore the real floor, not a
  preference. CI pins `22.x` (`.github/workflows/ci.yml`). Local development
  in this repo has been done on Node v26 — that mismatch is expected and fine
  (`engines` constrains what runs the *build*, not what you develop with).
- **npm** (this repo uses `package-lock.json`, not yarn/pnpm).
- An AWS account with permission to create an Amplify Hosting app, and the
  app created with the **Web Compute** platform type, not the static-only
  **Web** type — SSR and the two API routes will not function under the
  static type. This is a one-time, console-level setting made when the
  Amplify app is created, not something a repo file controls.
- Access to the three external services below, or their local-dev
  equivalents.

## Environment variables

Never commit real values — `.env.local` is gitignored; use `.env.example` as
the template.

| Variable | Required | Secret | Description |
|---|---|---|---|
| `SKIN_SCAN_API_URL` | Yes | No (a URL, not a credential) | Base URL of the self-hosted skin-scan CV service. `app/api/skin-scan/route.ts` now fails with a clear 500 (`SCAN_MISCONFIGURED`) if unset, rather than silently falling back to `localhost:8000` — this must be set explicitly for every non-local environment. |
| `SCAN_API_SECRET` | Yes | **Yes** | Shared secret sent as `X-Scan-Secret` to the skin-scan service. Without it, `/api/skin-scan` refuses to call the service (`SCAN_MISCONFIGURED`, 500). |
| `GEMINI_API_KEY` | Yes | **Yes** | Google AI Studio API key. Read only server-side (`lib/gemini.ts`), only inside `getClient()`, never `NEXT_PUBLIC_`-prefixed. Without it, `/api/skin-check/chat` fails per-request with a generic 502 (the key's absence is logged server-side, never returned to the client). |
| `GEMINI_MODEL_VISION` | No | No | Optional model override. Defaults to `gemini-2.5-flash` in `lib/gemini.ts` — currently unused, since the vision-model code path (`analyzeSkinImage`) was removed as dead code in a prior cleanup pass. Kept for forward compatibility if that path is ever revived. |
| `GEMINI_MODEL_SYNTHESIS` | No | No | Optional model override for the live Echo chat path. Defaults to `gemini-2.5-flash`. |
| `NEXT_PUBLIC_APP_ENV` | No | No — this one is genuinely public | Read by `next.config.js` to gate verbose fetch logging (`logging.fetches.fullUrl`). Safe to leave unset. |

## Local verification

```bash
npm ci
npx tsc --noEmit
npm run lint
npm run build
```

All four must pass before deploying. `npm run build` alone is not sufficient
evidence of readiness — it verifies the app compiles, not that it's safe to
expose publicly.

## Deployment

**Target: AWS Amplify Hosting**, `ap-south-1` — this is a locked decision
(`PROJECT_CONTEXT.md`: "Amplify Hosting for the frontend, ap-south-1.
`vercel.json` deleted."), not a default assumed by this document.

**No `amplify.yml` is included in this repo, deliberately.** Amplify Hosting
auto-detects a standard Next.js app from `package.json` (finds the `build`
script, `next build`) and generates its own default build spec without
needing one — an `amplify.yml` is only for *overriding* that default, and
this repo has nothing unusual to override (no monorepo, no custom output
directory, no non-standard build steps). Add one later only if auto-detection
ever needs overriding — e.g. to pin an exact Node patch version explicitly
rather than relying on the build image's default. `next.config.js`'s
`output: "standalone"` is also deliberately left commented out — that mode is
for containerized/self-hosted deployments, not Amplify's managed SSR compute,
which handles the standard `.next` build output itself.

Exact procedure:

1. Push this repo to its remote. `git remote -v` confirms `origin` already
   exists (`github.com/Divit-aggarwal/skin-check.git`) and the local
   `master` is currently 5 commits ahead of `origin/master` — including
   every change from this pass and the prior cleanup/hardening passes, none
   of which has been pushed yet. (`PROJECT_CONTEXT.md`'s "skin-check has no
   remote" note is stale as of this check — corrected there in this pass.)
2. In the Amplify console, create a new app, connect it to that repository,
   and select the **Web Compute** platform type (not **Web**) — required for
   SSR and the two API routes to run at all.
3. Let Amplify auto-detect the build settings (`npm ci` / `npm run build`) on
   first connection; do not hand-write a build spec unless auto-detection
   visibly gets something wrong.
4. Configure the 3 required environment variables (below) in the Amplify
   console under the app's **Environment variables** — never in `.env.local`,
   which never leaves your machine.
5. Confirm the build runs on **Node 22.12 or newer** — this repo's `engines`
   floor, below which `firebase-admin` 13 fails to load and every
   authenticated API route 500s. Do not accept a default 18.x/20.x image:
   set the Node version explicitly and verify the resolved version in the
   first build's logs, since that's a fact only the actual build run can
   confirm. (On Vercel, this is Project Settings → Node.js Version.)
6. Trigger the first deploy, inspect the build logs for the full
   `npm ci` → `npm run build` sequence completing without error.
7. Once deployed, work through the Production Smoke Test below against the
   real deployed URL — a successful build is necessary but not sufficient
   evidence of readiness.

**Everything above through step 5 is platform behavior described from AWS's
own current documentation, not something this pass executed** — no AWS
credentials or Amplify access were available in this session, so nothing
past `npm run build` locally has been verified against the real platform.
Treat steps 6-7 as the dividing line between "verified in this pass" and
"requires an actual AWS deployment to confirm."

## External services

```
Browser
  |
  v
Next.js (this repo, Amplify Hosting)
  |-- /api/skin-check/chat --> Gemini API (@google/genai, server-only key)
  |-- /api/skin-scan       --> skin-scan CV service (separate deployment,
                                App Runner per PROJECT_CONTEXT.md; shared-secret
                                auth via X-Scan-Secret)

Supabase (Postgres, schema + RLS already defined) — provisioned but NOT
connected to any of the above; no arrow drawn on purpose, see below.
```

The browser never calls the CV service or Gemini directly — both integrations
are same-origin proxies through this app's own API routes, confirmed by the
client/server boundary audit in the previous phase (no client component
imports `lib/gemini.ts` or references either secret).

- **Gemini**: called only from `lib/gemini.ts`, only from
  `app/api/skin-check/chat/route.ts`. Single remaining live call path
  (`getSkinCheckChatReply` → `runEchoChat`), rate-limited (5/min, 10/day per
  IP, 18/day global — `lib/rate-limit.ts`), 10s per-attempt timeout with up
  to 2 retries on 429/503 (`lib/gemini.ts`).
- **skin-scan CV service**: a separate deployment this app proxies to, never
  called directly from the browser. 5MB image cap, 30s upstream timeout,
  rate-limited (5/min, 40/day per IP) — `app/api/skin-scan/route.ts`.
- **Supabase**: schema and migrations exist (`supabase/migrations/0001_init.sql`),
  Row Level Security is enabled on every table. **Not yet wired into the
  active application code path** — no frontend code currently reads or
  writes to it (confirmed: no `@supabase/supabase-js` in `package.json`, no
  Supabase client instantiated anywhere in `app/`, `components/`, or `lib/`).
  This is infrastructure-ready, not live. Do not treat its presence as
  evidence the app persists anything — it currently doesn't (`skin-check`
  session state is in-memory only, per `lib/skin-check-session-context.tsx`'s
  own comment, and is lost on refresh).

## Known limitations to carry into production, not silently accept

- **Rate limiting is in-memory and per-process** (`lib/rate-limit.ts`'s own
  header comment documents this). On a horizontally-scaled or serverless
  deployment, the real ceiling is roughly `limit × running instance count`,
  and a cold start resets counters to zero. This is a genuine gap for a
  public, unauthenticated route at meaningful traffic — it is not a
  regression introduced by this pass, and this pass deliberately did not
  "fix" it by adding new infrastructure (Redis, DynamoDB) that the current
  scale/traffic of this pre-launch capture funnel does not yet justify. If
  traffic grows enough that this becomes a real abuse vector, the smallest
  next step compatible with Amplify is a small serverless-KV-backed limiter,
  not a general-purpose queue/cache layer.
- **No Content-Security-Policy.** Baseline headers were added this pass
  (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `Strict-Transport-Security`), but a real CSP for a
  Next.js app using `next/font` and inline hydration scripts needs a
  nonce/hash architecture to avoid either doing nothing (an overly loose
  policy) or breaking the render (an overly strict one). That's
  disproportionate to implement speculatively; revisit if/when a
  third-party embed or script is actually added.
- **No health endpoint was added.** Amplify Hosting's own platform-level
  health checks (not an app-level `/api/health` route) are what gate a
  deploy — there's no orchestration layer here (no ECS/Kubernetes) polling
  a custom endpoint, so one would be unused ceremony rather than a real gap.

## Post-launch improvements

Valuable, but not necessary for this deploy — deliberately left untouched
rather than folded into hardening scope:

- **`next@14.2.35` carries 5 high-severity `npm audit` findings.** Reachability
  was checked directly, not taken at the audit tool's word: this app uses no
  Server Actions, no `middleware.ts`, no `next/image`, no WebSocket code, no
  CSP nonces, no `next/script`, and no `rewrites()` — which rules out most of
  the listed advisories as inapplicable to this app's actual code paths. The
  one category that remains plausibly reachable is React Server
  Components-related DoS/cache-confusion advisories, since App Router uses
  RSC unconditionally. The only fix is `next@16.3.3`, a major version with
  breaking changes — track as its own dedicated migration effort (breaking-
  change review, full regression pass), not bundled into a deploy-readiness
  pass.
- **Distributed rate limiting.** See "Known limitations" above — revisit if
  real traffic/abuse patterns justify it.
- **A real Content-Security-Policy**, once there's an actual third-party
  script/embed to justify the nonce/hash architecture it needs.

## Pre-deploy checklist

- [ ] `SKIN_SCAN_API_URL`, `SCAN_API_SECRET`, `GEMINI_API_KEY` configured in
      the Amplify console (not committed anywhere)
- [ ] Amplify app created with the **Web Compute** platform type
- [ ] `npm ci && npx tsc --noEmit && npm run lint && npm run build` all green
      from a clean checkout
- [ ] Rate-limit behavior accepted as in-memory/per-instance for this launch
      (see Known limitations above) — not silently assumed to be more robust
      than it is

## Production smoke test

Run immediately after every deploy, against the real deployed URL. Every item
here requires an actual AWS deployment to execute — none of this was run
against a live Amplify URL in this pass; only the local-server equivalents
(`npm start` on `localhost`) were verified where noted.

**Browser**
- [ ] Homepage (`/`) loads
- [ ] `/skin-check` loads
- [ ] `/echo` loads (expected: reachable only by direct URL — see
      `PROJECT_CONTEXT.md`'s "Open, low cost" note; no in-app link points to
      it, by design)
- [ ] CSS loads (no unstyled flash)
- [ ] JS bundles load, no console errors on initial load
- [ ] Images/static assets load
- [ ] Camera permission prompt appears on the `/skin-check` photo step
      (desktop `getUserMedia` path)
- [ ] Denying camera permission shows the existing denied-state UI
      (`useCameraStream.ts`'s `"denied"` status) rather than crashing the page

**Skin scan**
- [ ] A valid photo reaches `/api/skin-scan` and returns a result
- [ ] The proxied request actually reaches the external CV service (check CV
      service logs/metrics if accessible, not just a 200 from this app)
- [ ] An unparseable/no-face image fails gracefully with the existing
      user-facing message, not a raw error
- [ ] An image over 5MB is rejected client-visibly (already verified
      server-side locally: `MAX_IMAGE_BYTES` in `app/api/skin-scan/route.ts`
      — re-confirm against the deployed URL)
- [ ] Simulate/observe a slow or unreachable CV service and confirm the
      existing 504 (`SCAN_TIMEOUT`) / 502 (`SCAN_SERVICE_UNREACHABLE`) paths
      surface the existing user-facing retry UI, not a hang

**Echo chat**
- [ ] A valid chat message gets a real reply
- [ ] Malformed JSON is rejected (verified locally: 400 — re-confirm against
      the deployed URL)
- [ ] An oversized body (>50KB) is rejected (verified locally: 413 — re-confirm)
- [ ] An oversized single message (>2000 chars) is rejected (verified
      locally: 400 — re-confirm)
- [ ] A region value outside the real 4 labels is rejected (verified locally:
      400, generic message, no leak — re-confirm)
- [ ] A deliberately slow/unavailable Gemini condition (e.g. temporarily
      misconfigure `GEMINI_API_KEY` in a non-production stage if one exists)
      surfaces the existing generic error, not a raw provider error
- [ ] Open browser devtools → Network tab on a real request; confirm no
      response body, header, or console log contains `GEMINI_API_KEY`,
      `SCAN_API_SECRET`, or the internal `SKIN_SCAN_API_URL` value

**Security**
- [ ] HTTPS is enforced (Amplify Hosting provides this by default via
      CloudFront + ACM — confirm the deployed URL is actually `https://`,
      not just assumed)
- [ ] `curl -I <deployed-url>/skin-check` shows all 5 headers configured in
      `next.config.js` (verified locally against `npm start`; re-run against
      the real URL — a platform's edge/CDN layer can occasionally strip or
      override headers a local server doesn't)
- [ ] View page source / bundle: confirm `GEMINI_API_KEY` and `SCAN_API_SECRET`
      never appear in any client-shipped JS (expected: they can't, since
      neither is `NEXT_PUBLIC_`-prefixed and both are only read inside
      server-only files — this is a re-confirmation, not a new risk)
- [ ] Trigger a deliberate 500-class failure (e.g. temporarily unset a
      required env var in a non-production stage) and confirm the response
      body contains no stack trace, file path, or internal hostname

---

## S3 original-image storage (Phase 3) — PROVISIONED 2026-09-08

Every scan's original image is PUT by the browser, using a short-lived
presigned URL from `POST /api/skin-scan/upload`, to:

```
s3://projectskin-skin-originals-prod/users/{verified Firebase uid}/scans/{scanId}/original.jpg
```

**Deploy target correction:** this app deploys to **Vercel**
(`https://skin-check-sigma.vercel.app` today, `https://theprojectskin.com`
next), not AWS Amplify. `aws amplify list-apps` in ap-south-1 returns nothing.
The Amplify guidance earlier in this file predates that and applies only if the
target ever moves.

### Bucket (created and verified 2026-09-08)

| Property | Value |
| --- | --- |
| Name | `projectskin-skin-originals-prod` |
| Account / region | `550428926515` / `ap-south-1` |
| Block Public Access | all four settings `true` |
| Object Ownership | `BucketOwnerEnforced` (ACLs disabled) |
| Default encryption | `AES256` (SSE-S3), bucket key enabled |
| Bucket policy | none (`NoSuchBucketPolicy`) |
| Public ACL grants | none — owner `FULL_CONTROL` only |
| Lifecycle rules | none — **do not add an expiry rule**; these are user-owned originals kept for scan history |
| Versioning | not enabled — retries overwrite the one canonical original per scan |

Not managed by the `skin-scan-tfstate-550428926515-ap-south-1` Terraform state
that governs the CV service; this bucket was created out-of-band via the CLI.
Fold it into that IaC when convenient, or it will drift.

### CORS (applied — `aws s3api get-bucket-cors` confirms)

Two explicit rules, no wildcard origin, `PUT` only, one allowed header:

```json
[
  { "ID": "skin-check-production-put",
    "AllowedOrigins": ["https://theprojectskin.com", "https://www.theprojectskin.com", "https://skin-check-sigma.vercel.app"],
    "AllowedMethods": ["PUT"], "AllowedHeaders": ["content-type"],
    "ExposeHeaders": [], "MaxAgeSeconds": 3000 },
  { "ID": "skin-check-local-development-put",
    "AllowedOrigins": ["http://localhost:3000", "http://localhost:3100"],
    "AllowedMethods": ["PUT"], "AllowedHeaders": ["content-type"],
    "ExposeHeaders": [], "MaxAgeSeconds": 3000 }
]
```

The dev rule is a separate entry precisely so it can be deleted without
touching production. Add a preview-deployment origin explicitly if Vercel
preview URLs ever need to upload — they are not covered.

### IAM (applied)

Runtime identity: IAM user **`skin-check-uploader`**, inline policy
`skin-check-put-originals`:

```json
{ "Effect": "Allow", "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::projectskin-skin-originals-prod/users/*/scans/*/original.jpg" }
```

Verified with that identity: `GetObject` → AccessDenied, `ListBucket` →
AccessDenied, `DeleteObject` → AccessDenied, `PutObject` to `evil/elsewhere.jpg`
→ AccessDenied, `PutObject` to `users/x/scans/y/notoriginal.jpg` → AccessDenied,
`PutObject` to `users/…/original.jpg` → allowed.

A static access key is used because Vercel functions have no AWS execution
role. **Upgrade path:** Vercel's AWS OIDC integration (`/docs/oidc/aws`) with
an IAM role trust policy removes the long-lived key entirely; `lib/s3.ts`
already falls back to the default provider chain when the explicit key vars are
absent, so that switch is env-only.

Rotate the key with `aws iam create-access-key` → update Vercel → `aws iam
delete-access-key` on the old one.

### Image-retention consent (Phase 3 closure)

Storing the original is gated on a **second, separate** consent checkbox — the
existing analysis-processing checkbox is unchanged and does not imply it.

| Item | Value |
| --- | --- |
| Consent version | `skin image retention version 1` (`lib/consent.ts`) |
| Privacy URL | `https://theprojectskin.com/policies/privacy-policy` — a constant, not an env var, so the link can never silently go missing |
| Where enforced | UI (unchecked by default, reset on retake) → `runSkinScan` skips the upload without it → presign route returns 403 `CONSENT_REQUIRED` → `firestore.rules` rejects any record claiming `image.stored == true` without matching consent |
| Where persisted | `users/{uid}/skinChecks/{scanId}.consent` = `{ imageRetention, imageRetentionVersion, imageRetentionConsentedAt: serverTimestamp() }` |

Declining retention is not an error: the scan still runs and the record says
`stored: false`.

**Legal publication dependency (not an engineering item):** the published
Privacy Policy at the URL above must be updated by the responsible
legal/business team with the finalized skin-image collection, retention,
processing, storage and user-rights language before public launch/marketing.
As of 2026-09-09 that page does not describe image retention.

### Environment variables (Vercel → Settings → Environment Variables)

| Variable | Notes |
| --- | --- |
| `S3_SKIN_IMAGES_BUCKET` | `projectskin-skin-originals-prod` |
| `S3_SKIN_IMAGES_REGION` | `ap-south-1` — required; there is no `AWS_REGION` fallback (Vercel injects its own) |
| `S3_SKIN_IMAGES_ACCESS_KEY_ID` | mark **Sensitive** |
| `S3_SKIN_IMAGES_SECRET_ACCESS_KEY` | mark **Sensitive** |

Deliberately **not** named `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.
Vercel permits those names but its function runtime can also inject its own
`AWS_*` values including `AWS_SESSION_TOKEN`; the SDK's env provider reads all
three together, so a half-overridden set signs with our key and Vercel's stale
token and fails as `InvalidToken`. `lib/s3.ts` reads the app-specific names and
passes credentials explicitly, falling back to the provider chain when they are
unset (local `~/.aws`, or a future role/OIDC).

None of these are `NEXT_PUBLIC_`. Never set an AWS credential as `NEXT_PUBLIC_*`.

### Firestore rules

Deployed to `projectskin-a202c` (latest ruleset
`abbf06b4-c569-419d-ad70-d882c9fc6043`, 2026-09-08T18:29:34Z), byte-identical to
`firestore.rules` — includes both `imageKeyIsOwn` and `storedImageHasConsent`.
Redeploy after any change:

```
npx firebase-tools deploy --only firestore:rules --project projectskin-a202c
```

### Post-deploy checks (run against the deployed app, not localhost)

- [ ] Set the four env vars in Vercel for Production **and** Preview if
      previews are used, then redeploy — the presign route 500s
      (`UPLOAD_MISCONFIGURED`) without them.
- [ ] Confirm `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` /
      `FIREBASE_PRIVATE_KEY` exist in the **same** Vercel environment(s) you
      add the S3 vars to. The presign route verifies tokens with them; if
      Phase 2 scoped them to only one environment, the new route 500s
      `AUTH_MISCONFIGURED` there on the first deploy.
- [ ] Complete a real scan on the deployed URL; confirm the object exists at
      `users/<uid>/scans/<scanId>/original.jpg` (`aws s3api head-object`).
- [ ] `curl -I https://projectskin-skin-originals-prod.s3.ap-south-1.amazonaws.com/<key>`
      → 403.
- [ ] The Firestore document for that scan has `image.stored == true`,
      `image.storage == "s3"`, and the matching key.
- [ ] Devtools → Network: the presign response carries no credentials, and the
      PUT goes straight to S3 (not through `/api`).
