# Dashboard lane report (G01, H14) — INTERIM

Stopped early: the session's usage limit was reached. Steps 3 (part) and 4 are not done.

## 1. Steps
- Done: design (docs/lanes/dashboard-design.md), checked by the verifier twice; build (state, copy, data, components, /dashboard, ConsentSection on /dashboard and /account); seed; Playwright setup; browser tests for every dashboard state, with screenshots.
- Not done: browser tests 2-10 of design §6 (capture retake, normal scan, returning user, under-18, Echo consent, routine, withdraw then Echo, delete account, Echo hand-off and K-1); STEP 4 fresh verifier review of code and screenshots.

## 2. Results
- Baseline before changes: npm run test:local exit 0 (unit 1199 passed / 47 skipped; stack 47/47).
- Unit after changes: 1227 passed / 47 skipped (86 files). Typecheck 0, lint clean.
- Browser: tests/browser/dashboard.spec.ts 12/12 passed on the 2nd run. On the first run three failed:
  - error state: offline `getDocs` returned an empty list, so the page said "no skin checks". Real bug; fixed with `getDocsFromServer` and a 15 s timeout.
  - past check: the test picked the wrong row (test bug).
  - signed out: failed once, passed on rerun; the cause was not captured (possibly the first `next dev` compile).

## 3. Verifier
- Round 1: FAIL, 12 findings. All were fixed, including: past checks show no readings (LONGITUDINAL_METHOD §1), Echo's record order, the D-26 note, the 409 state, and the missing states.
- Round 2: FAIL on K-1, plus 6 smaller items. The 6 are fixed: Dryness row dropped, a past-check legacy line, ledger loading and load-failure copy, seed ids fixed, dates in en-IN, browser tests started. K-1 is recorded as a known defect (design §9).

## 4. Owner decisions
O-D1 to O-D5 in design §8 (recommendations; pairwise display; entry points; readings in past checks; D-26 acknowledgement).

## 5. Requests to main
Design §9: README dashboard row and brief; shared `startingCheckCount` (G-1); stale /routine comment; K-1 fix in EchoPage or useSkinCheckFlow.

## 6. Proposed tracker rows
- K-1: Echo "Back to Skin Check" after a dashboard hand-off reopens an old results screen with a blank photo.
- G-1: dashboard and engine starting-check counts can differ.

## 7. Commits
b586467 design; 70a0fd8 dashboard + unit tests; 6b757cd seed; a99412a Playwright + state tests + screenshots.
