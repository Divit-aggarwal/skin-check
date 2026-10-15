# Mockup-match build (G37): saved state, 2026-10-15

Paused by the owner (usage limit). Resume from here.

## Where things are
- **Integration branch:** `build/mockup-match`, worktree `../skin-check-mm`. Local only, not pushed.
- **Master:**
  - PR #24 (font fix) merged as 4f4d43c.
  - PR #25 (tracker: TD-51 to TD-54, rows C12, E22, E23, G35, G36, G37, A34) merged as 63d1af7.
  - Both auto-deployed to production; the last is `skin-check-nudrjjr0h`, Ready.
  - Production now has the font change only. No mockup-match code is in production.
- **Merged into build/mockup-match:** BE1 (G31 notifications, H36 consents), BE2 (H37 export), BE3 (E19 check-ins, C10 side photos), lane E (20, 21, 22, plus follow-ups), lane C (06, 14, 15, 16).
- **Kit batch:** C-mm-1, C-mm-3 and C-mm-4 done (7756bab). Last checks: typecheck 0, lint 0 errors, unit 2504 passed.
- **Not yet merged** (agents stopped mid-work; uncommitted changes may remain in their worktrees):
  - lane A `mm/a` (`../skin-check-mm-a`, 09-12): last commit 2152c25, 6 files uncommitted.
  - lane B `mm/b` (`../skin-check-mm-b`, 05/07/08): last commit 85d22f8, 1 file uncommitted. It also needs BE3 wiring: the upload `angle` and `sidesStored`.
  - lane D `mm/d` (`../skin-check-mm-d`, 01-03, 18, 19): last commit c48c320, clean. It filed kit requests D-1 to D-4 and added a new flag, `NEXT_PUBLIC_UI_ROUTINE_PHOTOS`. It still needs to hide the products entry when personalisation is off; lane C may already have done this with EchoWithConsent and DashboardWithConsent.
- **Browser run started before the pause:** echo-products, flows and mm-c specs on build/mockup-match. Log at scratchpad `w0/mm-c-browser.log`; re-run if it's gone.

## To resume
1. Each of lanes A, B, D: look at `git status` in its worktree. Commit or finish the work (relaunch an agent on its brief `docs/lanes/mm-<x>.md`, telling it to rebase on build/mockup-match first), then get a "lane ready:" commit.
2. Merge A, B and D. Run typecheck, lint and unit after each merge.
3. Kit batch 2: the open rows in `docs/lanes/kit-requests.md`: E3, E4, D-1 to D-4, C-mm-2 (kept as an exact-title test waiver), plus any from A and B. Then the bottom bar: Today, Skin Twin (/checks), camera, Progress (/progress), Echo (`components/shell/*`).
4. Review pack for the owner, BEFORE anything touches Firebase or S3:
   - the rules diff: the mm:be1 and mm:be3 blocks, plus BE3's one AND-ed line in the skinChecks create rule
   - migrations: none
   - S3 keys: `left.jpg` and `right.jpg` beside `original.jpg`
   - emulator rules test results
5. Owner items so far:
   - S3 IAM: both the uploader and the reader must allow `left.jpg`/`right.jpg`.
   - Export: include the profile doc and pushSubscriptions? (BE2-2)
   - Vercel plan vs the cart (A34).
   - OPEN_METEO_API_KEY (G36).
   - Store serum screenshot (E23).
   - The new public route `/api/store/products` (lane C) needs a TD entry.
   - The check-in, notification and consent content was taken from mockups 08, 20 and 22 (owner to confirm).
   - Consent texts are DRAFT until the H29 legal review.
6. After the owner approves: deploy the rules, then run one full `test:all`. Stop agent stacks first: contention caused 8 false failures (G32).
7. Preview: fast-forward `lane/redesign` to the integrated build, so it gets the branch-scoped preview variables and the Firebase domain. Push it and check the branch alias.
8. Deliverable: overlay diffs for all 19 screens (`tests/design/overlay.py`), the status of 04/13/17, flags, the reversals, ASSETS.md, contract changes, test results, the preview host and a phone checklist. Then STOP. No production until the owner's explicit "go".

Do not merge anything to master during the build: every master merge deploys production.
