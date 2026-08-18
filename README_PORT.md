# skin-check-starter — port notes

This is an extracted, standalone starter for the `/skin-check` + `/echo` flow —
the pre-login skin quiz → external photo analysis → local scoring → Gemini-powered
Echo chat. It was mechanically traced out of a larger repo that also contained a
second, unrelated post-login app (routine tracker, product recommendations,
doctor/admin portals). None of that second app is here.

Full trace detail, every severance point, and every removed dependency (with
reasons) is in `MANIFEST.md`. This file is the short version: what's here, what
isn't, and the ordered task list for making it build.

## What this contains

- The `/skin-check` quiz flow and `/echo` chat, as React components + hooks
  (`components/skin-check/`, `hooks/useCameraStream.ts`, `lib/useSkinCheckFlow.ts`).
- Its two live API routes: `POST /api/skin-scan` (proxies to an external photo
  analysis service) and `POST /api/skin-check/chat` (Gemini-powered Echo chat).
- `lib/gemini.ts` and `lib/api.ts`, copied whole and unedited — both contain dead
  code left over from an older, removed `/assessment` flow. See `MANIFEST.md`
  Phase 3 for exactly which exports are live vs. dead.
- Rate limiting (`lib/rate-limit.ts`) on both public routes, copied as-is including
  its self-documented in-memory/per-process limitation.
- Shared UI primitives (`components/ui/`, `components/primitives/`) and the shadcn
  `button`/`skeleton` components it depends on.

## What this deliberately does not contain

- Firebase (client or admin), Supabase, Sentry, PostHog — none of these packages
  are in `package.json`, and their config files were not copied. See the severance
  list below for the one place this bites (`lib/auth-context.tsx`).
- The post-login app: routine tracker, product recommendations, progress charts,
  doctor portal, admin portal, and all of their API routes and database access.
- Real persistence of any kind. See the in-memory-session note below — this is the
  single most important thing to understand before touching this code.
- `vercel.json`. The deploy target for this starter is AWS Amplify, not Vercel —
  nothing Vercel-specific was carried over, and no Amplify config was written
  either (not part of this extraction — see task list below).

## Two things to understand before writing any code here

**1. `lib/skin-check-session-context.tsx` is in-memory only, on purpose, in the
source repo — and that was never meant to be permanent.** Its own comment says so:
"In-memory only — no sessionStorage/localStorage... refreshing loses the session
and every thread's history, ahead of real persistence." Quiz answers, the photo
scan result, the computed score, and every Echo chat thread all live in a React
context that resets on page refresh. **Do not extend this context with more
in-memory state as a way of adding features — the intended fix is to replace it
with real persistence (a database write, or at minimum `sessionStorage`), not to
grow the in-memory pattern further.**

**2. `SKIN_SCAN_API_URL` has no deployed target.** `app/api/skin-scan/route.ts`
defaults it to `http://localhost:8000` and proxies photo uploads there. As of this
extraction, nothing in the source repo confirms a real, reachable deployment of
that service exists anywhere — its own code comment says "Local-only for now...
once that service is hosted (separate session)." The service itself (an external
OpenCV/MediaPipe FastAPI app) is not part of this extraction and was never in the
source repo either — it's a separate codebase that needs to be located or rebuilt
and then deployed before `/skin-check`'s photo step will work anywhere but a
developer's own machine.

## Task list (the severance/gap entries from MANIFEST.md, as work items)

1. **Decide what to do about `lib/auth-context.tsx`.** It was pulled into this
   extraction only because `app/layout.tsx` (the Next.js root layout, required to
   exist) wraps its children in `<AuthProvider>`. Nothing in the actual
   skin-check/echo flow reads auth state. It imports `@/lib/firebase` and
   `@/lib/auth-cookie` (both excluded, not copied) and the `firebase` npm package
   (deliberately removed from `package.json`) — as shipped, this file will not
   typecheck or build. Two real options, not a patch:
   - **Remove it.** Delete `lib/auth-context.tsx`, remove the `<AuthProvider>`
     wrapper from `app/layout.tsx`, if this starter has no login step at all.
   - **Rebuild it.** Add `firebase` back to `package.json`, write a new
     `lib/firebase.ts` (client config) and a replacement for the presence-cookie
     helper, if login is coming back into scope for this starter.
2. **Find or stand up the skin-scan photo-analysis service** and point
   `SKIN_SCAN_API_URL` at it. Until this exists, `POST /api/skin-scan` will 502 in
   any environment (`app/api/skin-scan/route.ts` — unreachable upstream → 502
   `"Skin scan service is unavailable right now."`).
3. **Move rate-limit/quota state out of process memory** before relying on it at
   any real traffic level. `lib/rate-limit.ts`'s own header comment already
   documents why: serverless runs many instances, each with its own `Map`, so the
   real ceiling is `limit × instance count`, and cold starts reset counters
   entirely. This also protects the Gemini free-tier daily quota, which this file
   is trying (and, on serverless, currently failing) to stay under.
4. **Decide on security headers.** The source repo's security headers
   (`X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`,
   `Referrer-Policy`) lived only in `vercel.json`, which wasn't carried over since
   this starter targets AWS Amplify. `next.config.js` here has no `headers()`
   function and never did. These need to be added somewhere in the Amplify
   deployment path (a `headers()` block in `next.config.js`, or Amplify's own
   header configuration) — they don't currently exist anywhere in this starter.
5. **Decide whether to keep the dead code in `lib/gemini.ts` and `lib/api.ts`.**
   Both were copied whole, unedited, per the extraction rules. Each still contains
   exports from the old `/assessment` flow (`analyzeSkinImage`,
   `computeSkinAssessment`, `getEchoChatReply`, `getQuickResult`, `getFullResult`)
   that have no route to call them anymore in this starter and are unreachable. Not
   urgent, but worth pruning once this codebase has its own direction rather than
   carrying forward a fork of a file that used to serve two flows.

## Unresolved-import check (Phase 5)

A static check confirmed every import in every copied file resolves to either
another file in this tree or a package in `package.json`, with exactly the three
expected exceptions inside `lib/auth-context.tsx` (task #1 above) and one false
positive (a JSDoc type comment in `postcss.config.mjs`, not a real import). Full
detail in `MANIFEST.md` Phase 5. Nothing else is broken.

## Getting started

```
npm install
cp .env.example .env.local   # fill in GEMINI_API_KEY at minimum
npm run dev
```

The app will start, but `/skin-check`'s photo step will fail until task #2 above
is done, and `app/layout.tsx` will fail to compile until task #1 is resolved (it's
the very first file Next.js needs). Start there.
