# Redesign lanes (Phases 3–7): shared rules

Owner master plan, 2026-10-14 (TD-50). Five lanes build in parallel off
`lane/redesign`; the main session integrates. Each lane also reads its own
brief: [checks](redesign-checks.md) · [capture](redesign-capture.md) ·
[products](redesign-products.md) · [echo](redesign-echo.md) ·
[account](redesign-account.md). Background: [redesign-report.md](redesign-report.md)
(audit, decisions, Phase 1–2 patterns) and the mockups in
`/Users/divit/Projects/frontend/skin-check/design/mockups/` (look at each
mockup before building its screen).

| Lane | Branch | Worktree | PORT_BASE | Screens |
|---|---|---|---|---|
| A checks | `lane/redesign-checks` | `../skin-check-rd-checks` | 4000 | 09, 10, 11, 12, 13 |
| B capture | `lane/redesign-capture` | `../skin-check-rd-capture` | 4100 | 05, 07, 08 |
| C products | `lane/redesign-products` | `../skin-check-rd-products` | 4200 | 06, 14, 15 |
| D echo | `lane/redesign-echo` | `../skin-check-rd-echo` | 4300 | 18, 19 |
| E account | `lane/redesign-account` | `../skin-check-rd-account` | 4400 | 20, 21, 22 |

Out of scope: 16 (D-12 LOCKED), 17 (blocked), the Routine Impact tab on 12.

## Shared files (main session only; frozen while lanes run)

`tailwind.config.ts`, `app/globals.css`, `app/layout.tsx`, `components/ui/*`
(kit.tsx, page.tsx, button.tsx, skeleton.tsx), `components/shell/*`,
`lib/ui-flags.ts`, `scripts/*` (except your own `scripts/seed-lane-redesign-<lane>.ts`),
`package.json`, `playwright.config.ts`, `tests/design/redesign.shots.ts`,
`lib/catalog/wording.ts`, `docs/lanes/redesign-report.md`, the tracker,
`DECISION_LOG.md`, `CLAUDE.md`.

- Need a kit or shell change? Append it to [kit-requests.md](kit-requests.md)
  (lane, what, why, which screen) and carry on with the rest. The main session
  merges requests in batches and tells you to rebase.
- New patterns go into the kit, never a local copy. Until a request is merged,
  build with what the kit has and note the gap in your brief's log.
- Files owned by another lane (listed in each brief) are read-only for you.

## Rules for every screen

1. No banned words (`lib/catalog/wording.ts` BANNED_WORDS; exact-label
   exceptions only: "Your progress", "Today's conditions", "View full
   results", "Treat"). No "twin", "acne", "progress" (except the exact
   label), "improve", "better", "worse", "results" (except the label),
   "before and after", "calm", "clear", "works", "scan" (say "check").
2. Readings are the five level words only (Low / Moderate / Elevated, plus
   the "early estimate" tag): no deltas, percentages, arrows, status pills,
   sparklines, trend charts, before/after, better/worse colours. Reading
   identity colours go on icons only (`READING_ICON` in the kit). Where a
   mockup has a chart or delta, leave the layout slot (e.g. `MetricTile.footer`)
   empty so it can be added later without a redesign.
3. Render only what the backend returns. Missing data → the designed empty
   state. Never fake, never hard-code sample values.
4. Done, Skipped and Not logged stay three separate states everywhere.
5. Echo shows and explains backend data; it never presents its own decisions.
6. Products: store link, no price (TD-34). No cart, no checkout.
7. Backend not built yet → UI behind its flag in `lib/ui-flags.ts`, off by
   default, with no fake saving: unsupported controls render disabled with a
   line naming what they wait for. Only controls the backend supports go live.
8. No API route, Firestore rule, data-fetching or business-logic change. A new
   *page* is allowed only where your brief says so (UI over existing data).
9. A locked decision or data gap → log it in your brief's "Log" section and
   move on. No workarounds.
10. Every screen: loading, empty and error states; 44px tap targets; visible
    focus; labelled icons; 16px card corners (`rounded-card`), 12px image
    tiles (`rounded-tile`), no 20px (`rounded-2xl`, `rounded-media`) on
    screens you touch; reduced motion respected.
11. Hide the bottom bar during capture, check-in and other focused flows by
    setting `document.body.dataset.flow` (see `components/routine/RoutinePage.tsx`).

## Tests and commits

- Before you change anything: `npx tsc --noEmit && npx vitest run` must pass.
- While building, run only what you touch: `npx tsc --noEmit`, `npm run lint`,
  `npx vitest run <your test files>`, and your screens' browser specs on a
  fresh stack, always through the slot wrapper (at most 2 stacks on this Mac):
  `PW_ARGS="tests/browser/<spec>.ts" bash scripts/with-stack-slot.sh npm run test:browser`.
  Never leave `npm run dev:local` running; if you need it for a look, wrap it
  the same way and stop it when done. Never run `test:all` (the main session
  runs it once after integration).
- Browser-test edits are add-only (lane rule 8): a role or name that moves
  gets a new locator; nothing is deleted or weakened. Name each edit in your log.
- Screenshots at 375px: your own file `tests/design/redesign-<lane>.shots.ts`
  writing to `docs/design/redesign/<lane>/`, run with
  `PW_ARGS="-c tests/design/playwright.config.ts tests/design/redesign-<lane>.shots.ts --project=390" bash scripts/with-stack-slot.sh npm run test:browser`.
  Make a side-by-side `compare-<nn>-<name>.png` (mockup left, app right) per screen.
- Never update baseline screenshots (`AFTER_SHOTS`), never edit the tracker,
  never push. Stage files by name only (never `git add -A` / `.`).
- Small logical commits ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; the last one's
  subject starts with `lane ready:`.
- Hand-back: fill your brief's "Hand-back" section (changelog, deviations and
  why, flags used, browser-test edits, open questions, test commands and
  results) and commit it in the last commit.
