# Dashboard lane design (G01, H14)

Branch `lane/dashboard`, worktree `../skin-check-dashboard`, `PORT_BASE=3800`
(web 3800, auth 3801, firestore 3802 … S3Mock 3808; `.env.lane`, gitignored).
Baseline before any change: `npm run test:local` exit 0 (unit 1199 passed / 47
skipped in 74 files; stack 10 files 47/47).

## 0. Owner decisions this design follows (lane brief, 2026-10-04)

1. The product-response timeline (G02) is not built.
2. Sections: current state, trend, history, chat, routine link, privacy.
3. Current state: the latest valid scan's readings, the capture quality
   result, and a plain statement of what is and is not known.
4. Trend: no numbers (other than the starting-check count), no arrows, no
   colours for better or worse. While there is not enough evidence, say so in
   plain words and show how many starting checks exist out of the number
   needed.
5. History: past checks by date. The user opens one check at a time. No chart
   over time, no two checks side by side.
6. Recommendations: hidden while the rules feature is off.
7. Routine: a link to /routine only. No routine data next to skin readings.
8. Privacy: consent status, withdraw AI-share consent (H14), link to account
   deletion.
9. All wording passes the existing banned-word checks.
10. Phone screen first.
11. One dev-only dependency approved: `@playwright/test`. Nothing else.

Frozen rules this design keeps: D-12 (no attribution, efficacy or
forecasting), D-23 (skinstate-1 frozen, legacy stays legacy), D-26 (client
input is never authoritative), R-1 A (routine data only in the user's own
view, never joined to scans), R-2 B (no product cards now), D-16 (consent
ledger), GEMINI_BOUNDARY §4 (no two scans' values side by side).

## 1. What the user sees (phone first, one column)

New page **`/dashboard`**, inside the `(marketing)` layout (so it shares the
Echo session provider). Signed out, it shows only a sign-in link. Signed in,
six sections, top to bottom:

| # | Section | Shows | Never shows |
|---|---|---|---|
| 1 | **Your newest photo reading** (current state) | Date of the newest check with a reading; each metric's band word (Low / Moderate / Elevated), all in one neutral style, for redness, oiliness, texture, breakouts and dark marks (no "Dryness" row: a photo cannot measure hydration, D-23, LONGITUDINAL_METHOD, GEMINI_BOUNDARY §4); areas that were hard to read; the phone's photo-check result; what this does and does not tell you | Scores (`x/100`), band colours, overlays, the photo, any other check |
| 2 | **Starting point** (trend) | "Not enough evidence yet." and "Starting checks: n of 3", with one plain sentence | Any difference, direction, arrow, number other than the count, colour for better or worse, chart |
| 3 | **Past checks** (history) | A list of dates, newest first, each with what kind of check it was | Readings, anywhere. Opening a check replaces the whole page with that one check's date, kind and photo-check result, and a link back. LONGITUDINAL_METHOD §1: "The previous-scans list may show dates and photos only"; each band is relative to its own photo. Readings in a past check need owner decision O-D4 |
| 4 | **Ask Echo** (chat) | A button that opens Echo about the newest measured reading; hidden with a sentence when there is none | Anything from chat history |
| 5 | **Your routine** | A link to /routine | Any routine data |
| 6 | **Your privacy** | AI-assistant sharing status with a stop button; whether the photo of the newest photo check was kept; link to delete the account | Ledger ids, versions, timestamps of entries |

Recommendations: **not shown at all.** `RULES_ENABLED` is true under
`development` and `test`, so "hidden while the rules feature is off" does not
hide them locally; showing anything while it is on means product cards, which
R-2 B rules out. Not built; owner decision O-D1 (section 8).

Routine link: docs/lanes/routine-design.md §5 and the comment in
`app/(marketing)/routine/page.tsx` say /routine has no link from the scan
dashboard until G02. The owner's lane decision 7 now asks for a link (and only
a link); G02 stays unbuilt. The stale comment is a request to main (§9).

## 2. Where the data comes from

All reads are client SDK reads (`getDocsFromServer`, 15 s timeout) of the signed-in user's own subtree, which
`firestore.rules` already allows (`get, list` where `request.auth.uid == uid`).
No new route, no new rule, no write except the existing consent route.
Plain `getDocs` is not used: offline it resolves with an empty result from the
cache, which the page would show as "no checks" or "not asked yet" (found by
the error-state browser test). Dates are formatted in `en-IN`.

| Data | Source | Notes |
|---|---|---|
| Checks (history rows, answers, photo storage) | `users/{uid}/skinChecks` | Client-written. Used for dates, status, `image.stored` and the app-only reading |
| Measured readings | `users/{uid}/scanAnalyses` | Server-written. A record counts only when `toSkinState2(record, "users/{uid}/scanAnalyses/{id}", uid)` returns `kind: "skinstate"`. Bands come from `bandScores` on the record's `scores` (the results screen's table) |
| One record per check | `scanAnalyses.scanId` | Picked exactly as Echo picks it (lib/echo-trusted-context.ts): the primary record (no `persistAttempt`) first, then the newest `createdAt`. So the bands shown and the scan Echo talks about are the same record |
| App-only reading ("legacy record") | `skinChecks.result` with no measured record for that scanId | Old client-written checks, and current checks whose server record is missing (failed persist, H13 restored draft). Labelled, shown as saved, never a starting check (D-23) |
| Photo-check result | `scanAnalyses.captureQuality.verdict` | Client-asserted (D-26): every line says "Photo checks on your phone", and it is used for nothing else |
| Starting-check count | `pickBaseline(states).candidates.length`, capped at `BASELINE_RULE.scans` (lib/longitudinal/baseline.ts, settings.ts) | `states` = every measured record, retakes and recovery records included, as the chat path passes them to the engine. The engine itself may not be imported outside the chat path (tests/longitudinal-guard). The newest is never a candidate. See gap G-1 |
| AI-share status | `users/{uid}/consentLedger`, purpose `ai_share`, read on its own by `ConsentSection` | Newest entry at `AI_SHARE_CONSENT_VERSION` wins (the server's `latestGrant` rule); a pending `recordedAt` counts as newest. None → "not asked yet". A failed ledger read shows the privacy error only; the rest of the page still loads |
| Withdraw | `POST /api/account/consent` `{ purpose: "ai_share", granted: false, version }` | Existing route (H03c). 2xx → re-read the ledger; 409 `VERSION_STALE` → "reload" message; anything else → "try again" |
| Echo hand-off | `setSession` of the existing session provider: `scanId`, `answers`, `result` (the chosen record), `composite` (`summarizeConcerns(scores, bandScores(scores).bands)`, as the results screen builds it), `captureMethod`, and an empty Blob for the required `photo` (marked `ponytail:`) | Echo reads only `scanId` and `region_scores`; the chat server loads the facts from `scanId` |
| Session clean-up | `setSession(null)` when the dashboard mounts | A session in the provider makes /skin-check reopen that scan's results screen (lib/useSkinCheckFlow.ts). Clearing it on the dashboard means every dashboard link to /skin-check starts a new check |

**D-26 note.** DECISION_LOG D-26 says only the server-only loader yields a
SkinState. The dashboard runs the pure `toSkinState2` in the browser over
records the browser can read but never write (firestore.rules: scanAnalyses
`write: if false`). Its result is display only: nothing derived from it leaves
the page or is sent to any route (Echo gets only the `scanId`, and the server
reloads the record). Proposed owner acknowledgement O-D5 (§8).

**Gap G-1 (recorded, not fixed here).** The dashboard count can differ from the
engine's per-quantity count:
1. The engine skips a scan that is unusable for the quantity (`SELF_UNUSABLE`:
   region absent, low pixels, no native stats, capture method unknown); the
   dashboard uses `pickBaseline`'s default filter (known engine build only).
2. TD-14 (3) and (4) (capture method must match; one scan per calendar day)
   are not in `pickBaseline` yet.
3. Both count retakes and recovery records as separate scans, because the chat
   path passes every record; that may itself be a gap in the engine.
The page never states a change, so the worst case is "3 of 3" while the engine
still says "too few scans", and the page says "not enough evidence" either
way. Request to main: one shared `startingCheckCount(series)` exported from
`lib/longitudinal/` that both use. Copying the engine's logic here would fork it.

## 3. States, per section

The page computes one view model with pure functions
(`components/dashboard/state.ts`: `deriveDashboard`, `pastCheck`,
`aiShareStatus`, `withdrawalOutcome`), so every state below is a unit-tested
branch. Exact strings are in `components/dashboard/copy.ts`; they are quoted
here.

| Page state | When | Shows |
|---|---|---|
| signed out | no user after auth resolves | "Sign in to see your skin checks." + "Sign in" (→ /account) |
| loading | reads in flight | skeleton blocks + "Loading your checks…" |
| error | the check or analysis read fails, or 15 s pass with no answer | "We couldn't load your checks just now. Refresh the page to try again." (no error code) |
| empty | signed in, no checks | "You have no skin checks yet." + "Take your first Skin Check"; starting point shows "Nothing to show yet."; chat shows "Echo needs a check with a photo reading."; routine and privacy still shown |
| ready | at least one check | the six sections |
| one check open | `?check={scanId}` of this user | only that check: "Check from {date}", its kind, its photo-check line, for an app-only check "This check was saved by the app on your phone and not checked by our server.", "Readings are shown for your newest photo reading only. Each reading is relative to its own photo, so past checks are listed by date.", "Back to your dashboard" |
| check not found | `?check=` unknown, malformed, or not this user's | "This check could not be found." + "Back to your dashboard" |

Section 1, current state ("Your newest photo reading"):

| State | When | Shows |
|---|---|---|
| reading | a measured record exists | "Checked on {date}", the bands, hard-to-read areas, the photo-check line, known / not known |
| app-only reading | no measured record, a check has an app-only result | the same, without the photo-check line, plus "This reading was saved by the app on your phone and not checked by our server. It is shown as it was saved and is not used as a starting check." |
| unreadable | the stored scores do not parse | "The readings of this check could not be shown." |
| no reading | checks exist, none with a reading | "None of your checks has a photo reading yet." + "Take a new Skin Check" |
| orphan record | a measured record with no skinChecks doc | shown here; left out of Past checks (history lists checks) |

Lines in that section:
- hard to read: "Hard to read in this photo: {areas}. Those readings are uncertain."
- photo checks: "Photo checks on your phone: passed." / "… you chose to use this photo after a retake was suggested." / "… could not run on this device." / "… not recorded for this check."
- "What this tells you": "How each area of your face showed up in this one photo, as Low, Moderate or Elevated."
- "What this does not tell you": "It is not a medical opinion." "It does not measure pores or how dry your skin is." "It does not set you against other people." "Light, camera angle and distance shape every photo."

Section 2, trend ("Starting point"):

| State | When | Shows |
|---|---|---|
| empty | no measured record | "Nothing to show yet." + "Your first 3 photo checks form your starting point. Your newest check is never counted as one of them." |
| building | count < 3 | "Not enough evidence yet." + "Starting checks: n of 3" + the same "first 3" sentence |
| starting point set | count = 3 | "Not enough evidence yet." + "Starting checks: 3 of 3" + "Your starting point is set, but photo-to-photo variation has not been measured yet, so no trend is shown." |
| software boundary | `pickBaseline(...).engineBoundary` | adds "Your checks were read by different versions of the analysis software, so they are not used together." |
| app-only present | any app-only check | adds "Readings saved only by the app on your phone are not starting checks." |

There is no state that shows a change. If the engine ever returns a pairwise
answer, the dashboard still shows only the count (owner decision O-D2).

Section 3, history ("Past checks"): each row is the date ("Just now" for an
unresolved timestamp) and one of "Photo reading", "Reading saved by the app
only", "Photo could not be read", "Questions only". A row is a link to
`?check=…`.

Section 4, chat ("Ask Echo"): "Ask Echo about your newest photo reading." +
"Chat with Echo" when a measured record exists; otherwise "Echo needs a check
with a photo reading." (an app-only reading cannot be loaded by Echo's server).

Section 6, privacy ("Your privacy"):

| State | Shows |
|---|---|
| on | "Sharing with the AI assistant: on." + "Stop sharing with the AI assistant" |
| saving | the button shows "Saving…" and is disabled |
| off | "Sharing with the AI assistant: off. Echo will ask you again the next time you chat." |
| not asked | "Sharing with the AI assistant: not asked yet. Echo asks the first time you chat." |
| loading | "Loading your sharing setting…" |
| read failed (or 15 s) | "Your sharing setting could not be loaded. Refresh the page to try again." |
| write failed | "That did not save. Please try again." |
| stale version (409) | "This page is out of date. Please reload it and try again." |
| photo storage | "Photo of your newest photo check: kept." / "… not kept." from `image.stored === true` of the newest check that had a photo; hidden when no check had one |
| delete | "Delete your account and data" → `/account#delete-account` |

The same `ConsentSection` is on `/account` (H14 names both places), without the
photo line and the delete link (the delete section is on that page).

## 4. Wording

`tests/dashboard-copy.test.ts` runs every string in `copy.ts` (each function
called with a formatted date, "Just now" and every count 0..3) and every string
literal and JSX text (text between `>` and `<`, the same regex extraction as
tests/routine-copy.test.ts) in `components/dashboard/**` and
`app/(marketing)/dashboard/**` through:

- `bannedWordsIn` (lib/catalog/wording.ts, the routine D-12 list),
- the comparability `BANNED_WORDS` and `DIGIT_NEXT_TO_CHANGE` patterns
  (tests/comparability-wording.test.ts, copied verbatim),
- the context lexicon `CHANGE`, `MEDICAL`, `DIAGNOSIS`, `CAUSE` and
  `FORECAST` (lib/context/lexicon.ts).

`NUMBER` is not applied: the owner asked for the starting-check count. The
only digits on the page are that count and the check dates. Each checker has a
positive control.

Words this rules out, so the copy avoids them: than, before, since, last time,
compared with, more than, less, lower, higher, clear*, results, works,
clinical, condition, because, explain*, progress*, over time, soon, expect*.

## 5. Files

Add:
- `app/(marketing)/dashboard/page.tsx` — route shell (metadata, Suspense).
- `components/dashboard/DashboardPage.tsx` — the page (client).
- `components/dashboard/CheckReadings.tsx` — the newest reading's bands, photo
  check, app-only note; "what this does and does not tell you".
- `components/dashboard/ConsentSection.tsx` — privacy section, also on /account.
- `components/dashboard/state.ts` — pure view model.
- `components/dashboard/data.ts` — client Firestore reads with the timeout.
- `components/dashboard/copy.ts` — the wording.
- `tests/dashboard-state.test.ts`, `tests/dashboard-copy.test.ts`.
- `playwright.config.ts` (`testDir: "tests/browser"`, so neither runner picks
  up the other's files), `tests/browser/*.spec.ts`, `tests/browser/seed-users.ts`.
- `scripts/seed-lane-dashboard.ts` — one new user per state and per
  data-changing browser test (phones +9199999008xx). The existing seed users
  are not touched (their counts are pinned by tests/local-stack.e2e.test.ts).
- Screenshots `docs/lanes/dashboard-*.png`; report `docs/lanes/dashboard-report.md`.

Change:
- `app/(marketing)/account/page.tsx` — add `ConsentSection` and an
  `id="delete-account"` wrapper around `<DeleteAccount />` (the literal stays,
  tests/privacy-delete-account.test.ts pins it). The owner brief gives this lane
  "the account page's consent section"; README has no dashboard row yet (§9).
- `package.json`, `package-lock.json` — `@playwright/test` in devDependencies
  only (owner-approved). No script is added; the browser binary comes from
  `npx playwright install chromium`.

Not changed: lib/contracts, lib/longitudinal, lib/rules, lib/context,
lib/gemini.ts, EchoPage, SkinCheckFlow, useSkinCheckFlow, PhotoCapture,
RoutinePage, DeleteAccount, the routes, firestore.rules, local-stack scripts,
the tracker, the decision log, docs/lanes/README.md. The results screen inside
the flow (`SkinCheckDashboard`) is not changed.

## 6. Tests

Unit (vitest, node; no DOM renderer: H12 is not approved):
- `dashboard-state.test.ts`: every state in §3 from fixture records: empty;
  one reading (0 of 3); 3 records (2 of 3); 5 records (3 of 3, capped);
  engine boundary; app-only reading (shown, not counted, named in the trend);
  measured wins over a newer app-only one; unparsable scores; questions-only
  and failed checks; forged source, unknown schema and moved record ignored;
  retake; primary record wins over a newer recovery record (Echo's order);
  every photo-check verdict; history order with a pending timestamp; photo
  storage from `image.stored`; the view model's only numbers are the count;
  a past check holds exactly date, kind and photo check (no readings);
  unknown / malformed / orphan `?check=` ids; an orphan record; the record
  Echo loads; consent newest-wins with a pending timestamp and a stale
  version; the withdrawal outcome for 2xx, 409 and other codes.
- `dashboard-copy.test.ts`: §4, positive controls, no score / band colour /
  arrow / chart in the dashboard files, and no import of lib/rules,
  lib/context, lib/gemini or the longitudinal engine.

Browser (Playwright, Chromium, 390×844, touch, mobile user agent, one
worker), against `npm run dev:local` on PORT_BASE 3800:
1. sign in as a seeded user and see the dashboard;
2. a dark or covered photo gives a named retake reason, and "Use this photo
   anyway" appears after `gate.retakesBeforeOverride` retakes (read from
   settings, not hard-coded); the dark photo is made in the test;
3. a normal scan (the engine fixture face) finishes and shows on the dashboard;
4. a returning user is asked the two questions again with the "Last time you
   said" hint (existing owner-approved flow copy, TD-08 10a; not dashboard copy);
5. under 18 shows the confirm step; "No" goes back, "Yes" blocks;
6. Echo asks for AI-share consent first;
7. routine: add a product, mark used, mark skipped, add "other product",
   reload, all still there;
8. withdraw AI-share consent on the dashboard, then Echo asks again;
9. delete the account, sign in again, no history;
10. Ask Echo, back to the dashboard, "Take a new Skin Check" starts at the
    questions, not at an old results screen; and Echo's own "Back to Skin
    Check" pinned as known defect K-1 (`test.fail`);
11. every dashboard state in §3, each saved as `docs/lanes/dashboard-<state>.png`.
    Error and loading are made with `page.route` on the Firestore emulator.

Tests 2, 4, 5, 7 and 9 cover other lanes' flows; the owner's lane brief asks
for them. A failure in code this lane does not own becomes a proposed tracker
row, not a fix here.

Sign-in uses the auth emulator's verification-code endpoint, as
tests/capture.e2e.test.ts does. Run: `npm run dev:local` in one terminal, then
`npx playwright test` (the config reads `.env.lane`).

## 7. Steps (each ends with unit tests, typecheck, lint, commit)

1. Design (this file) + verifier check.
2. `state.ts`, `copy.ts`, `data.ts`, components, route, ConsentSection on
   /dashboard and /account, both unit tests.
3. Seed `seed-lane-dashboard.ts`.
4. Playwright dependency + config + browser tests + screenshots.
5. Verifier review of code and screenshots; fixes; report.

## 8. Owner decisions this lane cannot make

- **O-D1** Recommendations on the dashboard when the rules feature is on
  (locally it is on). Proposed: none until R-2 B is reopened.
- **O-D2** What the starting-point section shows once a pairwise answer
  exists. Proposed: nothing new until the context-lane wording is settled.
- **O-D3** Entry points to /dashboard (results screen, account page, a site
  header). Proposed: a link on the results screen and on /account.
- **O-D4** Whether an opened past check may show its readings. LONGITUDINAL_METHOD
  §1 allows dates and photos only; built that way. Reopening it needs "relative
  to this photo only" copy and a method-doc change.
- **O-D5** Acknowledge the D-26 note in §2 (display-only skinstate-2 reading
  in the browser).

## 9. Requests to main

- Add a dashboard row to docs/lanes/README.md (ports 3800-3808, ownership:
  `components/dashboard/**`, `app/(marketing)/dashboard/**`, the consent section
  of `app/(marketing)/account/page.tsx`, `scripts/seed-lane-dashboard.ts`,
  `tests/dashboard-*.test.ts`, `tests/browser/**`, `playwright.config.ts`) and
  commit the lane brief as `docs/lanes/dashboard.md`.
- One shared `startingCheckCount(series)` in `lib/longitudinal/` (G-1).
- Update the "Reached by URL only" comment in `app/(marketing)/routine/page.tsx`.
- **Known defect K-1** (proposed tracker row): after "Chat with Echo" from the
  dashboard, Echo's own "Back to Skin Check" link (EchoPage, context-lane code)
  goes to /skin-check with the dashboard's hand-off session still set, and
  useSkinCheckFlow (not lane-owned) reopens that scan's results screen with a
  blank photo. The dashboard clears the session whenever it loads, so its own
  links are safe; the Echo link is not. Fix in main, one of: Echo's link leads
  to /dashboard when the session came from it, or useSkinCheckFlow ignores a
  session whose photo is empty. Browser test 10 checks the dashboard path and
  pins this path as an expected failure (`test.fail`), so it turns red when
  fixed. Ask Echo stays on: the owner asked for the chat section, and the
  defect shows the user's own newest results screen, nothing of another user.
