# Dashboard lane report (G01, H14)

Branch `lane/dashboard`, worktree `../skin-check-dashboard`, `PORT_BASE=3800`
(`.env.lane`, gitignored). Design: [dashboard-design.md](dashboard-design.md).
Nothing is pushed. The tracker and the decision log are not edited (lane rule);
`git diff --name-only 3e0c09a..HEAD` touches none of lib/contracts,
lib/longitudinal, lib/rules, lib/context, lib/gemini.ts, the tracker, the
decision log, docs/lanes/README.md, firestore.rules or the stack scripts.

Approval note: README rule 3 asks for owner approval of the design before code.
The owner's lane brief set the order (design → verifier → build), so the build
started after the verifier's design check. The owner decisions in §4 are open.

## 1. Steps done and skipped

| Step | Status |
|---|---|
| 1. Design brief, verifier check, fixes | Done (b586467). Verifier: round 1 FAIL (12 findings, all fixed), round 2 FAIL on one item, recorded as known defect K-1 (§3) |
| 2. Build: view model, copy, client reads, page, `/dashboard`, ConsentSection on `/dashboard` and `/account` (H14) | Done (70a0fd8, 787a9c4, aebf1eb) |
| 3. Seed: one user per state and per data-changing test | Done (6b757cd; extended in 1dac63c, aebf1eb). 16 users, phones +9199999008xx; base seed users untouched |
| 4. Playwright (owner-approved dev dependency) and browser tests | Done (a99412a, 1dac63c, aebf1eb). All 10 requested tests, plus every dashboard state |
| 5. Fresh verifier review of code and screenshots; fixes; this report | Done (aebf1eb, this commit) |

Skipped, each needing an owner decision (§4):
- **Recommendations:** not shown at all (O-D1).
- **Any change display once a pairwise answer exists:** not built (O-D2).
- **Links to `/dashboard`:** none added from other screens (O-D3).
- **Readings inside an opened past check:** not shown (O-D4).

## 2. Test results

At the final commit (§7, last row):
- `npm run test:local`: exit 0. Unit tests 1232 passed, 47 skipped (86 files); stack 10 files, 47/47. The baseline before the lane was 1199 passed, 47 skipped; stack 47/47.
- `npx tsc --noEmit`: 0 errors. `npm run lint`: clean. `next build`: exit 0 (`/dashboard` 2.66 kB).
- The lane's unit tests are `tests/dashboard-state.test.ts` (every state in design §3) and `tests/dashboard-copy.test.ts` (D-12 wording, positive controls, no score, band colour or arrow, no import of the rules, context, gemini or engine code). Together: 33/33.
- **Browser tests:** `npx playwright test` against a fresh `npm run dev:local`, Chromium, 390×844, mobile user agent, one worker.
  - Result: **25/25 passed.** One of these is K-1, a known defect pinned with `test.fail()`, so it passes while it still fails.
  - Run command: `GEMINI_DEV_API_KEY=placeholder-not-a-key npm run dev:local`, then `npx playwright test`.
  - Why the placeholder key: the chat route checks for a Gemini key before it checks consent. With no key, Echo answers "isn't set up" and never reaches its consent prompt.
  - It cannot reach Google in these tests. No test grants consent and the route refuses without consent before any Gemini code runs. The seed users with sharing on are `withdraw` (checked as "off" before its Echo message is sent) and `newer` (never sends an Echo message; its consent requests are answered by `page.route`). The Echo user was never asked.
  - The value lives only in the shell, not in any file.
  - The data-changing tests (scan, withdraw, delete, routine) need a fresh stack for each run.
- **Screenshots:** `docs/lanes/dashboard-*.png`.
  - Dashboard states: signed out, loading, error, empty, one reading, building, set, boundary, legacy, unreadable, no reading, newer check not shown, past check, check not found, privacy on, off, saving, failed and out of date, after scan, after delete.
  - Flows: retake, returning user, under 18, Echo consent, routine.

### Browser tests that failed at first, and why

| Test | Run | Cause | Fix |
|---|---|---|---|
| error state | 1st | **Product bug.** Offline, `getDocs` returned an empty list from the cache, so the page said "You have no skin checks yet" (and privacy would have said "not asked yet") | Reads use `getDocsFromServer` with a 15 s timeout (70a0fd8) |
| normal scan | 2nd | **Product bug.** The analysis lands before the questionnaire is saved; the page treated "no check docs" as empty, hid the reading and said "no skin checks" | Empty means no check and no reading (787a9c4), unit test added |
| signed out | 1st of each fresh stack | First request to a cold `next dev`: Firebase Auth never reported while routes compiled; the page sat on "Loading…". Passed on every rerun | Route warm-up before the tests (`tests/browser/warm-up.ts`); passed first time on the next two fresh stacks |
| past check | 1st | Test bug: picked the oldest row, not the one with the override verdict | Picks the middle row |
| normal scan | 1st | Test bug: waited for the photo step's "Photo saved" text, but the flow moves to the next section | Waits for the next question, then reloads the dashboard until the reading shows |
| returning user | 1st, 2nd | Test bugs: the re-asked questions are multi-select (need "Confirm selection"); the next section replaces the old one on screen, so only one hint is visible at a time | Taps confirm; checks each hint by its exact text |
| under 18 | 1st | Test bug: the confirm step comes at the end of the section, after gender | Answers gender |
| Echo asks for consent; withdraw then Echo asks | 1st | Environment: no Gemini key locally, and the route checks the key before consent | Placeholder key for the browser run only (above); proposed row R-4 |
| routine | 1st | Test bug: each card's "Swap for" list also names the other products, so the locator matched the wrong card | Matches the product-name line only |
| delete account | 1st | Test bug: strict-mode locator matched three history rows | `.first()` |
| K-1 | all | Reproduces as expected: Echo's own back link reopens an old results screen ("30 /100", blank photo) | Pinned with `test.fail()`; fix requested (§5) |

## 3. What the verifier found, and what was fixed

**Design check, round 1: FAIL, 12 findings, all fixed.**
- A sentence used "before".
- The Echo hand-off left a session behind, which reopened an old results screen on /skin-check. The page now clears it when it loads.
- Past checks showed readings, against LONGITUDINAL_METHOD §1. A past check now shows only its date, kind and photo check; the question is raised as O-D4.
- D-26 was claimed without saying how the browser use is limited. The design now has a display-only note, raised as O-D5.
- The record choice differed from Echo's.
- One label named an app version.
- Photo storage read consent instead of `image.stored`.
- The 409 stale-version state was missing.
- Other states were missing.
- Some copy was described but not quoted.
- Some tests were missing.
- The lane had no README row (request to main).

**Design check, round 2: FAIL on one item.** Echo's own "Back to Skin Check" link, which is outside lane-owned code. It is recorded as K-1 and pinned by a test. Six smaller items were fixed:
- Dryness row dropped, plus the line "It does not measure pores or how dry your skin is".
- Separate copy for app-only past checks.
- Copy for loading the sharing setting and for a failed load.
- Fixed seed ids for consent entries.
- Dates in `en-IN`.
- Browser tests written.

**Fresh review of code and screenshots: FAIL. No screen puts two checks' readings side by side, and none shows a score, colour, arrow or chart.** Its findings and the response (fixed in aebf1eb; a confirmation pass then found four follow-ups, fixed in the next commit and listed after this list):
1. The report was interim. This report is final.
2. The reviewer could not check frozen files without a shell. Checked with `git diff --name-only`: none touched.
3. **An older reading could sit under "Your newest photo reading" right after a new check.** Now a plain line is shown whenever a newer check has no server reading. Unit and browser tested.
4. **Retakes moved the starting-check count.** The count is now of distinct checks, with a unit test.
5. The trend copy says "yet", which promises a trend later. Raised as O-D6.
6. When the primary record was invalid, the page could show a recovery record that Echo would not load. The record is now picked over all records in Echo's order and then validated, with a unit test.
7. The app-only note said "not checked by our server", which is false when an unreadable server record exists. Reworded. The labels on /account differ from the dashboard's: row R-5.
8. The past-check test was weak. It now asserts that no band word appears on screen.
9. A band-dependent class could slip past the colour test. A static test now pins one fixed class on each reading row.
10. Some states had no screenshot. Added for unreadable, newer check not shown, and privacy saving, failed and out of date. Two privacy states have none; the reason is in the design §6.
11. No test pinned the retake count. Added.
12. /routine is wider than a 390 px phone (the "Swap for" selects spill out). Not lane code: row R-6.

**Confirmation pass: FAIL, four follow-ups, all fixed:**
1. The "newer check" line said "no reading … yet", which is false for a questions-only or failed check. It now reads "Your newest check has no photo reading from our server. The reading below is from an earlier check."
2. Counting records and then removing duplicates by check could leave the count at "2 of 3" for good after an early retake. `pickBaseline` now gets one state per check, with a 5-check unit test.
3. The unreadable state showed the app-only note and "what this tells you" next to no readings. Both now show only when readings do, with a browser assertion.
4. This report's Gemini statement missed the `newer` seed user. Now named.

## 4. New owner decisions

- **O-D1:** recommendations on the dashboard when the rules feature is on. It is on in local builds, so "hidden while off" hides nothing locally. Proposed: none until R-2 B is reopened.
- **O-D2:** what the starting-point section shows once a pairwise answer exists. Proposed: nothing new until the context-lane wording is settled.
- **O-D3:** links to /dashboard. Proposed: from the results screen and /account. Today it is reached by URL only.
- **O-D4:** may an opened past check show its readings? LONGITUDINAL_METHOD §1 allows dates and photos only, and the page is built that way.
- **O-D5:** acknowledge that skinstate-2 is read in the browser for display only (design §2). Nothing derived from it leaves the page.
- **O-D6:** keep or drop "yet" in "Not enough evidence yet." and "…has not been measured yet". "Yet" promises a trend the page may never show.
- **Routine link:** the owner's lane decision 7 asks for a link to /routine. That supersedes routine-design §5, which said "no link from the scan dashboard until G02"; G02 stays unbuilt.

## 5. Requests to main

1. Add a dashboard row to docs/lanes/README.md (ports 3800–3808; ownership: `components/dashboard/**`, `app/(marketing)/dashboard/**`, the consent section of `app/(marketing)/account/page.tsx`, `scripts/seed-lane-dashboard.ts`, `tests/dashboard-*.test.ts`, `tests/browser/**`, `playwright.config.ts`). Also commit the lane brief as `docs/lanes/dashboard.md`.
2. **K-1:** after "Chat with Echo" from the dashboard, Echo's "Back to Skin Check" (EchoPage, context-lane code) goes to /skin-check with the hand-off session still set. useSkinCheckFlow then reopens that scan's results screen with a blank photo. Fix either: Echo's link leads to /dashboard when the session came from it, or the flow ignores a session whose photo is empty. Then remove `test.fail()` from the K-1 test.
3. **G-1:** export one shared `startingCheckCount(series)` from `lib/longitudinal/` for the engine and the page. Today they differ in three ways:
   - the engine's per-quantity usability filter;
   - TD-14 (3) and (4) are not yet in `pickBaseline`;
   - the engine counts records, the page counts checks.
4. Update the "Reached by URL only" comment in `app/(marketing)/routine/page.tsx`.
5. A browser-test entry point: `local-stack-e2e.sh` runs vitest only. To put Playwright in `npm run test:local`, it would need a line there (not lane-owned), plus the Gemini key question in R-4.

## 6. Proposed tracker rows

| Row | Area | What | Evidence or next action |
|---|---|---|---|
| G01 | Dashboard | Move to DONE / CHECKED LOCAL, with the evidence in §2 | final commit (§7); test:local exit 0; browser 25/25 |
| H14 | Privacy | Move to DONE / CHECKED LOCAL: withdraw control on /dashboard and /account | ConsentSection; withdraw browser test; 409 state |
| E06 | Routine | The browser click-through is done: add, used, skipped, other product, reload | flows.spec.ts routine test |
| R-1 (K-1) | Echo / flow | Echo's back link after a dashboard hand-off reopens an old results screen | §5.2; pinned by `test.fail()` |
| R-2 (G-1) | Longitudinal | One shared starting-check count | §5.3 |
| R-3 | Dashboard | Entry points to /dashboard | O-D3 |
| R-4 | Echo | The chat route checks for a Gemini key before age and consent, so a local stack with no key can never show the consent prompt | Move the key check after the consent check, or give the local stack a test fake |
| R-5 | Account | /account's PreviousScans labels ("Photo analyzed") and the dashboard's labels ("Reading saved by the app only") can name the same check differently | Align the labels |
| R-6 | Routine | /routine is wider than a 390 px phone screen (the "Swap for" selects overflow their cards) | docs/lanes/dashboard-flow-routine.png |
| R-7 | Dashboard | Owner decisions O-D1, O-D2, O-D4, O-D5, O-D6 | §4 |

## 7. Commits

| Commit | What |
|---|---|
| b586467 | docs: design brief |
| 70a0fd8 | feat: /dashboard, view model, copy, client reads, ConsentSection on /dashboard and /account; unit tests |
| 6b757cd | test: lane seed |
| a99412a | test: Playwright, dashboard-state browser tests, screenshots |
| e772ecb | docs: interim report (replaced by this one) |
| 787a9c4 | fix: show a reading that landed before the questionnaire was saved |
| 1dac63c | test: flow browser tests 2–10, warm-up, returning-user seed |
| aebf1eb | fix: review fixes (newer check named, checks not records, Echo record order, app-only copy); tests and screenshots |
| c555e2e | docs: final report |
| (this commit) | fix: confirmation-pass follow-ups (newer-check copy, one state per check for the count, unreadable state); tests, screenshots, design and report updated |
