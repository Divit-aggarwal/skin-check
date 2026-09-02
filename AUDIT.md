# Audit — skin-check

Read-only. Every claim below cites a file:line the auditor actually opened, or a command output. Nothing is inferred from a filename alone.

---

## 1. WHAT THIS IS

**Stack**: Next.js `14.2.35` (package.json:18), App Router, React `^18` (package.json:20), TypeScript `^5` strict (tsconfig.json:6), Tailwind `^3.4.1` (package.json:34), Zod `^4.4.3` (package.json:23), `@google/genai` `^2.11.0` (package.json:12) for Gemini, `framer-motion` `^12.42.2` (package.json:16). No test framework in package.json (no jest/vitest/playwright/testing-library entries).

**Router type**: App Router only — confirmed by `app/` tree, no `pages/` directory (`find . -type f ... | grep app` at session start).

**Route map** (from `npm run build` output and `find ./app -type f`):

| Route | Source | Type |
|---|---|---|
| `/skin-check` | `app/(marketing)/skin-check/page.tsx:1` | Static, client (`SkinCheckFlow`) |
| `/echo` | `app/(marketing)/echo/page.tsx:1` | Static, client (`EchoPage`, `Suspense`-wrapped) |
| `/api/skin-scan` | `app/api/skin-scan/route.ts:22` | Dynamic, POST |
| `/api/skin-check/chat` | `app/api/skin-check/chat/route.ts:39` | Dynamic, POST |

No `/` route exists — `find ./app -type f` shows no `app/page.tsx` or `app/(marketing)/page.tsx`. Build output confirms: the only static routes are `/_not-found`, `/echo`, `/skin-check`. `PROJECT_CONTEXT.md:105` locks "Amplify Hosting" for this app as a subdomain-mounted funnel, so this is plausibly intentional, not a bug — noted in §5 with Low confidence as a defect.

**Data-fetching patterns** (every distinct one found, with a count of call sites):

1. **Client → own API route, `FormData` upload, no timeout** — `lib/api.ts:129` (`getSkinScanResult`), called from `components/skin-check/inputs/PhotoCapture.tsx:171` and `components/skin-check/SkinCheckDashboard.tsx:90`. 2 call sites.
2. **Client → own API route, JSON body, no timeout** — `lib/api.ts:206` (`getSkinCheckChatReply`), called from `components/skin-check/EchoPage.tsx:100`. 1 call site.
3. **Route handler → external self-hosted service, raw `fetch`, `AbortController` timeout** — `app/api/skin-scan/route.ts:72` (30s timeout, `app/api/skin-scan/route.ts:61-62`). 1 call site.
4. **Route handler → Gemini, via `@google/genai` SDK (not raw `fetch`), retry-on-429/503, no timeout** — `lib/gemini.ts:281` (vision), `lib/gemini.ts:313` (synthesis), `lib/gemini.ts:381` (chat), all through `withGeminiRetry` at `lib/gemini.ts:209`. 3 call sites, all only reachable from the live `getSkinCheckChatReply` (`lib/gemini.ts:479`) via `app/api/skin-check/chat/route.ts:59`.
5. **Dead/unreachable pattern** — `lib/api.ts:22`'s generic `request()` helper and the six functions built on the same never-implemented `/api/assessment/*` and `/api/twin/chat` routes (`lib/api.ts:73,93,167,243,248`). See §3.

---

## 2. HEALTH

**Clean install → typecheck → build**: all green.
- `npx tsc --noEmit` — exit 0, zero errors.
- `npm run build` — exit 0. Output: `✓ Compiled successfully`, all 7 routes generated, First Load JS 87.3 kB shared + 11.3–12.9 kB per page.

**TS strictness**: `tsconfig.json:6-10` — `strict: true`, plus `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `exactOptionalPropertyTypes`. Stronger than default `create-next-app` strictness.

**Escape-hatch counts** (grepped across all `.ts`/`.tsx`, excluding `node_modules`/`.next`):
- `any` as a type: **0**. Every `rg '\banyb'` hit is inside a comment or prose string (`lib/gemini.ts:57,59,343`, `lib/skin-check-rules.ts:75,148`, `types/skin-scan.ts:47,81`, `app/api/skin-scan/route.ts:160`) — none are `: any` type annotations.
- `as any`: **0**.
- `@ts-ignore` / `@ts-expect-error`: **0**.
- `as never` (functionally the same bypass as `as any` here): **1** — `components/skin-check/SkinCheckDashboard.tsx:90`. See finding S2-1.
- Non-null assertions (`x!.`): **1** — `lib/rate-limit.ts:37`.
- `eslint-disable`: **6** total, all narrow and comment-justified (`lib/api.ts:21` unused-vars; `components/skin-check/inputs/PhotoCapture.tsx:98,192,228` and `components/skin-check/EchoTwin.tsx:45,53` `no-img-element` on transient object-URL/base64 images, each with a one-line reason).

This is a genuinely clean TS surface — no blanket type-safety bypasses outside the one noted above.

**Circular deps**: `npx madge --circular --extensions ts,tsx .` — "No circular dependency found!" on the 56 files it resolved. Caveat, Low confidence on completeness: madge skipped 24 files it couldn't resolve because it doesn't read the `@/*` path alias from `tsconfig.json:24-26` — every file importing via `@/...` shows as "Skipped." The check is real but only covers relative imports.

**Dependency rot / duplicates**: no duplicate libraries solving the same problem found in `package.json:11-37` — one date/animation lib (`framer-motion`), one class-merge pair (`clsx` + `tailwind-merge`, a standard shadcn combo, not a duplicate), one schema lib (`zod`), one icon lib (`lucide-react`). No rot observed at these pinned versions (Not measured against latest upstream releases — no network check performed).

---

## 3. DEAD CODE

Every entry below is confirmed unreferenced by an actual `rg` search the auditor ran, cross-checked against `npx knip`'s independent output.

1. **`components/skin-check/EchoRegionDiagram.tsx`** (97 lines) — zero import references anywhere in current source. `rg -n 'EchoRegionDiagram' --glob '!node_modules' --glob '!.next'` returns only the file's own declaration (line 40) and comments inside itself, plus a historical mention in `MANIFEST.md:31`. Independently flagged by `knip` as "Unused files."
   **RESOLVED** — deleted by a subsequent, separately-approved cleanup pass. The file no longer exists.

2. **`lib/api.ts:73,93,167,243,248` and `:253`** — `getQuickResult`, `getFullResult`, `getEchoChatReply`, `submitWaitlistSignup`, `subscribeNewsletter`, `ApiError` (class). All target routes that don't exist: `/api/assessment/quick-result` (`lib/api.ts:74`), `/api/assessment/full-result` (`lib/api.ts:101`), `/api/twin/chat` (`lib/api.ts:172`). `find ./app -type f` lists only `app/api/skin-scan/route.ts` and `app/api/skin-check/chat/route.ts` — neither of those three paths exists. `npx knip`'s "Unused exports" list independently confirms zero importers for all six.
   **PARTIALLY RESOLVED** — `getQuickResult`, `getFullResult`, and `getEchoChatReply` were deleted by a subsequent, separately-approved cleanup pass (their supporting types in `types/gemini.ts` were deleted in the same pass, see item 4). `submitWaitlistSignup`, `subscribeNewsletter`, and `ApiError` remain in `lib/api.ts`, deliberately deferred — not yet addressed.

3. **`lib/gemini.ts:272,307,397`** — `analyzeSkinImage`, `computeSkinAssessment`, `getEchoChatReply` (the old, non-`SkinCheck`-prefixed one), plus their support functions `validateVisionCoordinates` (`lib/gemini.ts:234`) and `applyAllergyGate` (`lib/gemini.ts:257`). This is the same dead `/assessment` flow as item 2, on the model-call side — `getEchoChatReply` (`lib/gemini.ts:397`) is a near-duplicate of the live `getSkinCheckChatReply` (`lib/gemini.ts:479`), both built on the shared `runEchoChat` (`lib/gemini.ts:375`). Confirmed unreferenced by `knip`'s "Unused exports" list; `rg` for each name shows no caller outside their own file and `lib/api.ts`'s equally-dead `getEchoChatReply` wrapper.
   **RESOLVED** — all five (`analyzeSkinImage`, `computeSkinAssessment`, `getEchoChatReply`, `validateVisionCoordinates`, `applyAllergyGate`) were deleted by a subsequent, separately-approved cleanup pass, along with the prompts/helpers exclusive to them.

4. **Zod schema/type exports with zero external consumers**, per `npx knip`: `types/gemini.ts` — `ConfidenceSchema:16`, `SeveritySchema:17`, `BoundingBoxSchema:21`, `VisionCategorySchema:28`, `VisionZoneSchema:39`, `VisionRegionSchema:49`, `VisionCategorySummarySchema:56`, `VisionAnalyzableResultSchema:67`, `VisionUnanalyzableResultSchema:74`, `RecommendationSchema:91`, `SubScoresSchema:96`, `QuizAnswersSchema:126`, plus types `BoundingBox:84`, `VisionRegion:85`, `VisionAnalyzableResult:86`, `Recommendation:113`, `SubScores:114`. These exist solely to support item 3's dead code path — deleting item 3 makes these safe to delete too. `types/assessment.ts`'s `AssessmentAnswersSchema:66` and its 8 derived types (`:102-110`) are in the same boat.
   **RESOLVED** — `types/gemini.ts` and `types/assessment.ts` were both deleted in full by a subsequent, separately-approved cleanup pass.

5. **`components/ui/button.tsx:61`** — `buttonVariants` export unused outside the file (knip). The `Button` component itself (`ButtonProps:41`) is used everywhere; only the separately-exported variant-map function has no external caller.

**Not flagged, despite `knip` listing them** — verified false positives:
- `supabase/.temp/start-secrets/.../index.ts` — inside `supabase/.gitignore:3`'s ignored `.temp` dir (`git check-ignore -v supabase/.temp` confirms), a local Supabase CLI scratch file, not repo content.
- `SCORING_VERSION` (`lib/skin-check-rules.ts:9`), `BAND_THRESHOLDS` (`:84`), `SKU_RULES` (`:144`) — all three are used *within* their own file (`SKU_RULES` is read at `lib/skin-check-rules.ts:227`); `knip` flags them only because they're exported when they don't need to be. Cosmetic, not dead.

---

## 4. ML INTEGRATION READINESS

**Where outbound calls live**: cleanly server-side. The only two upstream integrations (self-hosted CV service, Gemini) are both called exclusively from route handlers (`app/api/skin-scan/route.ts:72`, `app/api/skin-check/chat/route.ts:59` → `lib/gemini.ts`) — never from a client component or Server Action. `SCAN_API_SECRET` and `GEMINI_API_KEY` are read only in server files (`app/api/skin-scan/route.ts:23`, `lib/gemini.ts:33`) and neither is `NEXT_PUBLIC_`-prefixed.

**`NEXT_PUBLIC_` audit** (`rg -n 'NEXT_PUBLIC_'`): `lib/api.ts:9` (`NEXT_PUBLIC_API_URL`, feeding the dead `request()` helper from §3 — effectively unused) and `next.config.js:21` (`NEXT_PUBLIC_APP_ENV`, gates verbose fetch logging only). No model endpoint, API key, or internal host is exposed client-side.

**Timeouts / cancellation / retries** — present in one place, absent in three:
- Present: `app/api/skin-scan/route.ts:61-62` — `AbortController` with a 30s timeout wrapping the proxy `fetch` at `:72`.
- Present: `lib/gemini.ts:209` (`withGeminiRetry`) — retries 429/503 with exponential backoff, used by all three Gemini calls.
- **Absent**: no timeout or `AbortSignal` on any of the three `ai.models.generateContent` calls themselves (`lib/gemini.ts:281,313,381`) — a hung Gemini call blocks the handler indefinitely, bounded only by the hosting platform's own function timeout, not by app code.
- **Absent**: no timeout or cancellation on either client-side fetch in `lib/api.ts` (`getSkinScanResult:129`, `getSkinCheckChatReply:206`) — the browser will wait on `fetch` indefinitely; nothing aborts it if the user navigates away mid-request.

**API responses — validated, not asserted**: every fetch path parses through Zod before use. `lib/api.ts:146` (`SkinScanResponseSchema.safeParse`), `:223` (`SkinCheckChatResponseSchema.safeParse`), and server-side `app/api/skin-scan/route.ts:220` (`SkinScanResultSchema.safeParse`) — all `safeParse`, all checked before the `.data` is trusted, no `as` casts on network responses. This is a real strength, not a gap.

**One place to add a header/timeout/trace ID, or 40 files?** — Closer to one than 40, but not literally one: the two outbound integrations have no shared client. `app/api/skin-scan/route.ts:72` is a raw `fetch` call; `lib/gemini.ts:281,313,381` go through the `@google/genai` SDK. Adding a shared concern (a trace-ID header, a global timeout policy) today means editing both independently — there's no `lib/upstream.ts`-style wrapper either routes through.

**Loading / error / empty state coverage per route**:
- `/skin-check` results (`SkinCheckDashboard.tsx`): idle → `null` (`:65`), loading → `Skeleton` + copy (`:67-83`), error → retry UI (`:85-117`), success → full dashboard (`:119-196`). Full coverage.
- `/echo` (`EchoPage.tsx`): no-session empty state (`:63-81`), per-message thinking indicator (`:186-192`, `isThinking`), inline error message on a failed send (`:108-110`, `ERROR_MESSAGE`). Route-level Suspense fallback is `null` (`app/(marketing)/echo/page.tsx:14`) — a blank frame during the boundary, inconsistent with the skeleton pattern used one route over.

**Biggest obstacle to plugging in a slow backend**: the client-side legs have no bound at all. Both `lib/api.ts` fetches (`:129`, `:206`) — the ones a real user's browser actually waits on — have no `AbortController`, no timeout, and no shared wrapper to add one to in a single place. The one timeout that exists (`app/api/skin-scan/route.ts:61-62`) only protects the Next.js server from *its* upstream; it does nothing for a slow Gemini call (`lib/gemini.ts`, no timeout at all) or for the browser waiting on either. A slow backend today means an indefinitely-spinning UI with no user-facing bound, on two separate integration types with no common choke point.

---

## 5. DESIGN + DEPLOY

**Hardcoded hex / arbitrary-value count** (`rg -o '#[0-9A-Fa-f]{3,8}\b'`, excluding `node_modules`/`.next`): **191** total hex literals across `.ts`/`.tsx`/`.css`. `tailwind.config.ts` itself accounts for 41 of those (legitimate — it's the token definitions, e.g. `sage`, `rebel`, `echo`, `confidence`, `status` at `tailwind.config.ts:56-115`). The remaining **150** are outside the token layer, i.e., raw hex baked directly into `className` strings. Top offenders: `components/skin-check/EchoPage.tsx` (16), `components/skin-check/EchoRegionDiagram.tsx` (12, and dead — §3), `components/skin-check/inputs/ImageCardMultiSelect.tsx` (9), `CardSelect.tsx` / `BodyZoneChecklist.tsx` (6 each). Tailwind arbitrary-value bracket syntax (`rg -o '[a-zA-Z-]+-\[[^]]+\]'`) shows a matching **168** occurrences, same file ranking, led by `EchoPage.tsx` (17).

**Missing token layer — verified, not inferred**: `tailwind.config.ts:15-116` defines a full palette (`sage`, `rebel`, `echo`, `subscore`, `confidence`, `status`, plus shadcn's `border`/`muted`/`accent`/etc.). None of the three colors repeated most often in the `/skin-check` + `/echo` components — `#98415A`, `#1A1A1A`, `#E02D79`, `#FAF4EF` — appear anywhere in that config (`rg -n "'#98415A'|'#1A1A1A'|'#E02D79'|'#FAF4EF'" tailwind.config.ts` — zero matches). Separately, `components/skin-check/SkinCheckDashboard.tsx` and `EchoTwin.tsx` use a *third*, different vocabulary — `text-body`, `text-label`, `bg-canvas`, `bg-surface`, `text-text`, `rounded-media`, `tracking-label` — that also isn't in `tailwind.config.ts`. Three incompatible theming systems live in the same ~20-file feature.

**Duplicate components**: none found among current files — `ConfidenceBadge` and `ScoreRadar`, mentioned as removed in the git log ("Fix interpolated SKU accent class, remove orphaned ConfidenceBadge"), are confirmed gone (`find . -iname "ConfidenceBadge*" -o -iname "ScoreRadar*"` — no results).

**Dockerfile**: absent (`find . -iname "Dockerfile*"` — no results in this repo; `PROJECT_CONTEXT.md:23` describes a Dockerfile for the separate `skin-scan` CV service repo only).

**Env validation at boot**: absent. `SCAN_API_SECRET` is checked per-request inside the route handler (`app/api/skin-scan/route.ts:23-30`), not at process start. `GEMINI_API_KEY` is checked lazily on first use inside `getClient()` (`lib/gemini.ts:33-34`). A deploy missing either variable won't fail until the first real request hits it.

**Health check**: absent — no `/api/health` or equivalent route in `app/api/`.

**CI gates**: absent — `find . -path "*/.github/workflows/*"` returns nothing; no `.github` directory at all.

---

## RANKED FINDINGS (S0 = highest)

**S0-1 — The scan-overlay feature is unreachable on the normal success path.**
`components/skin-check/inputs/PhotoCapture.tsx:171` calls `getSkinScanResult(blob)` with no second argument. `getSkinScanResult`'s `overlay` parameter (`lib/api.ts:129-135`) only appends `overlay` to the outgoing `FormData` when truthy — so on the primary capture flow, the proxy route never receives `overlay` and `app/api/skin-scan/route.ts:47-49` resolves it to `null`, and the CV service returns no overlay image. `EchoTwin.tsx:39,52,66` only renders a heatmap when `focus && overlaySrc` are both truthy — never true on this path. The only call site that ever passes an overlay is `SkinCheckDashboard.tsx:90`, inside the *error-retry* handler — reachable only after a scan has already failed, not after a normal success. Confirmed by `rg -n 'getSkinScanResult'` — exactly these two call sites exist, nothing else populates `overlay`.
**Fix**: pass a resolved focus metric into `getSkinScanResult` at `PhotoCapture.tsx:171` (the same `resolveFocus` helper `SkinCheckDashboard.tsx` already has), so the primary capture requests the right overlay the first time.

**S0-2 — Six Tailwind utility classes used on the results screen generate zero CSS.**
`text-body`, `text-label`, `bg-canvas`, `bg-surface`, `text-text`, `rounded-media`, `tracking-label` are used at `components/skin-check/EchoTwin.tsx:43,67,72` and `components/skin-check/SkinCheckDashboard.tsx:70,73,109,110,142,153,154,162,168,183,187,188`, but none are defined anywhere in `tailwind.config.ts`. Verified directly against the production build: `grep -o '\.text-body{[^}]*}' .next/static/css/*.css` and the equivalent for `bg-canvas`, `text-label`, `rounded-media`, `bg-surface`, `text-text` all return nothing, while a real token (`border-border`) does generate (`.border-border{border-color:hsl(var(--border))}`). These are the dashboard's own summary text, category labels, and photo-frame corners — they render with no explicit color, size, or radius.
**Fix**: add `canvas`, `surface`, `text` color keys and `body`/`label` `fontSize` entries and a `media` `borderRadius` entry to `tailwind.config.ts:15-203`, matching what these two files already assume exists.

**S1-1 — `lib/api.ts` and `lib/gemini.ts` carry a whole dead `/assessment`-era code path.**
`lib/api.ts:73,93,167,243,248,253` and `lib/gemini.ts:234,257,272,307,397` — see §3 items 2–4 for the full, verified list. ~140 lines of exported functions/schemas with zero live callers, duplicating the live `getSkinCheckChatReply` path.
**Fix**: delete `getQuickResult`, `getFullResult`, `getEchoChatReply`, `submitWaitlistSignup`, `subscribeNewsletter`, `ApiError`, and the `request()` helper from `lib/api.ts`; delete `analyzeSkinImage`, `computeSkinAssessment`, `getEchoChatReply`, `validateVisionCoordinates`, `applyAllergyGate` from `lib/gemini.ts`; then delete the now-orphaned schemas in `types/gemini.ts` and `types/assessment.ts` (§3 item 4).
**PARTIALLY RESOLVED** — see §3 items 2–4 for exactly what was and wasn't deleted by the subsequent cleanup pass. `types/gemini.ts` and `types/assessment.ts` are gone entirely; `lib/gemini.ts`'s five dead exports are gone entirely; `lib/api.ts` had `getQuickResult`/`getFullResult`/`getEchoChatReply` removed but still carries `submitWaitlistSignup`, `subscribeNewsletter`, `ApiError`, and `request()`, deliberately deferred.

**S1-2 — `components/skin-check/EchoRegionDiagram.tsx` is a 97-line dead file.**
Zero import references anywhere in current source; independently flagged by `knip`. See §3 item 1.
**Fix**: delete `components/skin-check/EchoRegionDiagram.tsx`.
**RESOLVED** — deleted by a subsequent, separately-approved cleanup pass.

**S1-3 — No timeout or cancellation on the browser's own fetches.**
`lib/api.ts:129` (`getSkinScanResult`) and `lib/api.ts:206` (`getSkinCheckChatReply`) — both plain `fetch`, no `AbortController`. Called from `PhotoCapture.tsx:171` and `EchoPage.tsx:100`. The server-side proxy has a 30s bound (`app/api/skin-scan/route.ts:61-62`); nothing bounds the client's own wait, and there's no way to cancel an in-flight request from the UI.
**Fix**: add an `AbortController` in each `lib/api.ts` function, wired to a `signal` param the calling component can cancel on unmount/retake.

**S1-4 — No timeout on the Gemini SDK calls themselves.**
`lib/gemini.ts:281,313,381` (`ai.models.generateContent`) have retry-on-429/503 (`withGeminiRetry`, `lib/gemini.ts:209`) but no `AbortSignal` or timeout wrapping the call. A hung call blocks the request handler with no app-level bound.
**Fix**: build a timeout `AbortSignal` (mirroring `app/api/skin-scan/route.ts:61-62`'s pattern) and pass it into each `generateContent` call's config.

**S2-1 — One type-safety bypass: `{} as never`.**
`components/skin-check/SkinCheckDashboard.tsx:90` — `resolveFocus(answers, {} as never)` forces an empty object through a `Record<BandableMetric, Band>` parameter. It's the one escape hatch in an otherwise strict codebase (§2). Currently harmless because `resolveFocus`'s fallback branch (`SkinCheckDashboard.tsx:28`) just reads `undefined` and compares to a string, but the contract is unchecked — a future change to `resolveFocus` could silently misbehave here with no type error to catch it.
**Fix**: thread the real `bands` value from the prior successful scan into the retry handler instead of faking the type, or have the retry explicitly skip focus resolution.

**S2-2 — Three incompatible color/token systems in the same feature.**
See §5 "Missing token layer." `tailwind.config.ts`'s real palette (`sage`/`rebel`/`echo`/etc.) vs. 150 raw hex arbitrary values in `/skin-check` + `/echo` components vs. the undefined `canvas`/`body`/`label`/`media` tokens from S0-2.
**Fix**: pick `tailwind.config.ts` as the single source, add the missing tokens (S0-2's fix covers half of this), then replace the raw hex values in `EchoPage.tsx`, the `inputs/*.tsx` files, and `SkinCheckFlow.tsx` with references to it.

**S2-3 — No env validation at boot, no health route, no Dockerfile, no CI.**
`app/api/skin-scan/route.ts:23-30` checks `SCAN_API_SECRET` per-request; `lib/gemini.ts:33-34` checks `GEMINI_API_KEY` lazily on first call. Neither fails fast at startup. No `/api/health` route exists. No `.github/workflows`. No `Dockerfile` in this repo (the sibling CV-service repo has one, per `PROJECT_CONTEXT.md:23`, but not this one).
**Fix**: add a small startup check (e.g., a module evaluated at the top of `next.config.js` or a custom server entry) that throws on missing `GEMINI_API_KEY`/`SCAN_API_SECRET`/`SKIN_SCAN_API_URL`, and add a trivial `app/api/health/route.ts`.

**S3-1 — `depcheck` flags 5 unused devDependencies (Low confidence on most).**
`@types/node`, `@types/react-dom`, `autoprefixer`, `postcss`, `shadcn` (`package.json:26,28,29,32,33`). `autoprefixer`/`postcss` are almost certainly false positives — used implicitly by Tailwind's PostCSS pipeline via `postcss.config.mjs`; `@types/node`/`@types/react-dom` are ambient-type packages `depcheck` can't detect usage of. `shadcn` (the CLI) is the one plausible genuine removal candidate if it's only ever invoked via `npx`.
**Fix**: verify `shadcn` isn't referenced by any script in `package.json:5-9` (it isn't) and remove it from `devDependencies` if it's only used ad hoc; leave the other four.

**S3-2 — `postcss-load-config` used but not declared.**
`knip` flags it as an "Unlisted dependency" at `postcss.config.mjs:1`. Works today via hoisting but is fragile under a stricter package manager or a dependency bump.
**Fix**: add `postcss-load-config` to `devDependencies` explicitly if the import in `postcss.config.mjs:1` is intentional.

**S3-3 — `scan-response.json` (792 lines) committed at the repo root.**
Referenced only in comments/docs (`PROJECT_CONTEXT.md:49`, `types/skin-scan.ts:82`, `supabase/migrations/0001_init.sql:69`) as a "known-good sample," never imported by any code (`rg -n 'scan-response'` — three doc/comment hits, zero imports).
**Fix**: move it into a `fixtures/` or `docs/` subdirectory so it doesn't read as stray root clutter.

**S3-4 — `/echo`'s Suspense fallback is blank, inconsistent with `/skin-check`'s loading pattern.**
`app/(marketing)/echo/page.tsx:14` — `<Suspense fallback={null}>`. `SkinCheckDashboard.tsx:67-83` shows an explicit `Skeleton` + copy for its loading state instead.
**Fix**: give the Suspense boundary a lightweight skeleton matching `EchoPage`'s shell instead of `null`.

**S3-5 — No root `"/"` route (Low confidence this is a defect).**
`find ./app -type f` shows no `app/page.tsx` or `app/(marketing)/page.tsx`; build output confirms no static `/` route is generated. `PROJECT_CONTEXT.md:105` ("Amplify Hosting" for the frontend, deployed as a funnel) suggests this may be an intentional subdomain-mounted funnel with no home page, not a bug — flagged only for completeness.
**Fix, if unintentional**: add `app/(marketing)/page.tsx`.

---

## git status

```
$ git status
On branch master
Your branch is ahead of 'origin/master' by 5 commits.
  (use "git push" to publish your local commits)

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	AUDIT.md

nothing added to commit but untracked files present (use "git add" to track)
```

The only filesystem change from this audit is this file, `AUDIT.md`, itself. No source file was modified, formatted, or upgraded.
