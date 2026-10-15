# Mockup-match build (G37): shared rules for every agent

Owner master plan, 2026-10-15. Decisions TD-51 to TD-54 in the tracker
(on master). You are one of 8 agents, each in its own worktree off the same
base commit. The main session (orchestrator) integrates.

Mockups: `/Users/divit/Projects/frontend/skin-check/design/mockups/` (19
files; 04, 13 and 17 do not exist). Look at each of your mockups before
building its screen.

| Agent | Branch | Worktree | PORT_BASE | Scope |
|---|---|---|---|---|
| BE1 | `mm/be1` | `../skin-check-mm-be1` | 4000 | G31 notification prefs, H36 consents (backend) |
| BE2 | `mm/be2` | `../skin-check-mm-be2` | 4100 | H37 data export (backend) |
| BE3 | `mm/be3` | `../skin-check-mm-be3` | 4200 | E19 check-in record, C10 side-photo storage (backend) |
| A | `mm/a` | `../skin-check-mm-a` | 4300 | 09, 10, 11, 12 |
| B | `mm/b` | `../skin-check-mm-b` | 4400 | 05, 07, 08 (three angles, live checks, check-in) |
| C | `mm/c` | `../skin-check-mm-c` | 4500 | 06, 14, 15, 16 |
| D | `mm/d` | `../skin-check-mm-d` | 4600 | 01, 02, 03, 18, 19 |
| E | `mm/e` | `../skin-check-mm-e` | 4700 | 20, 21, 22 |

BE4 (readings over time) is already done in the base:
`lib/readings/series.ts` (`readingsOverTime`, `sinceStarted`, `METRIC_QUANTITY`).

## Shared files (main session only)

`tailwind.config.ts`, `app/globals.css`, `app/layout.tsx`, `next.config.js`,
`components/ui/*` (the kit), `components/shell/*` (shell and nav),
`lib/ui-flags.ts`, `lib/catalog/wording.ts`, `lib/feature-contracts/*`,
`lib/readings/*`, `lib/store/*`, `firestore.rules` (see BE rule below),
`package.json`, `playwright.config.ts`, `tests/design/match.config.ts`,
`tests/design/overlay.py`, `tests/design/match.ts`, `scripts/*` (except your
own `scripts/seed-mm-<agent>.ts`), the tracker, `DECISION_LOG.md`,
`CLAUDE.md`, `docs/ASSETS.md`.

- Need one changed? Append a row to `docs/lanes/kit-requests.md` under
  "Mockup-match (G37)" (agent, what, why, screen) and keep working. The
  main session merges requests in batches and tells you to rebase.
- `docs/ASSETS.md`: add your asset rows to your brief's hand-back; the main
  session copies them in.
- BE agents only: you may edit `firestore.rules` inside one block marked
  `// ── mm:<agent> ──` … `// ── end mm:<agent> ──` for your own
  collections. Nothing outside your block. The owner reviews every rules
  change before it is deployed.
- The bottom bar changes at integration (Today, Skin Twin, camera, Progress,
  Echo; main session). Until then your shots show the old bar: that is not
  a difference to fix.

## Data rules (do not change)

1. Skin images on any result, progress, comparison or Skin Twin screen are
   the user's own photos only (through `/api/checks/photo`). Never stock.
2. No "results from similar users" block (15). No before/after of other people.
3. Readings: the level word per check (Low / Moderate / Elevated, "early
   estimate" tag) and timelines of those levels (`LevelTimeline`). A change
   value only through `ChangeSlot` fed by `lib/readings/series.ts`; today every
   slot shows "Needs more checks". Never compute a change, percentage, arrow
   or trend yourself, never from scores.
4. No causal or efficacy copy: no "working", "improving", "response
   Positive", "learns", claim tags ("Acne control", "Fades pigmentation").
   On 16 the most we say is "since you started X".
5. Echo explains backend data only. Store descriptions (body_html) show on 15
   only and never reach Gemini.
6. Reading names stay: Breakouts, Redness, Oiliness, Texture, Dark marks.
   Mockup names (Acne, Pigmentation, Hydration) are an allowed difference.
7. Allowed words again: "Skin Twin", "Progress" (TD-51). Every other entry in
   `BANNED_WORDS` still applies; run `bannedWordsIn` over your new copy in a test.
8. Render only what the backend returns. Missing data → designed empty
   state. Never fake, never hard-code sample values. Fixtures in
   `lib/feature-contracts/fixtures.ts` are for tests and seeds only.
9. Backend not landed → UI behind its flag (`lib/ui-flags.ts`), off by
   default, unsupported controls disabled with a line naming what they wait for.
10. A blocker → log it in your brief's "Log" and move to your other work.
    Never invent a workaround or fake data.

## Assets

Only Unsplash, Pexels, Lucide or our own SVG, only in decorative or
explanatory spots (never in place of a user's photo). Download into
`public/assets/<agent>/`, no hotlinking, and list each (file, source URL,
licence, where used) in your hand-back.

## Every screen

Loading, empty and error states; 44px tap targets; visible focus; labelled
icons; reduced motion respected; 16px card corners (`rounded-card`), 12px
tiles (`rounded-tile`).

## Pixel match

- Shots: your own `tests/design/<agent>.match.ts` using `matchShot(page, testInfo, "<NN>-<state>")`
  from `tests/design/match.ts`, run with
  `PW_ARGS="-c tests/design/match.config.ts tests/design/<agent>.match.ts" bash scripts/with-stack-slot.sh npm run test:browser`
  (all four widths: 393, 320, 375, 430).
- Overlay: `python3 -I tests/design/overlay.py /Users/divit/Projects/frontend/skin-check/design/mockups <NN>`
  writes `docs/design/mockup-match/<NN>-<state>.png` (mockup | app | 50%
  overlay) and prints a mean difference. Iterate on spacing, type sizes,
  radii, icon sizes, card structure and order until only allowed
  differences remain: the iOS status bar, real data in place of sample
  data, the blocks the data rules remove, and the bottom bar until
  integration. List each remaining difference with its reason in the hand-back.
- Check 320, 375 and 430 by eye: no horizontal scroll, nothing clipped.

## Tests and commits

- First: `npx tsc --noEmit && npx vitest run` must pass on the base.
- While building: `npx tsc --noEmit`, `npm run lint`, your unit tests, your
  browser specs through the slot wrapper (at most 2 stacks on this Mac):
  `PW_ARGS="tests/browser/<spec>.ts" bash scripts/with-stack-slot.sh npm run test:browser`.
  Never leave a stack running. Never run `test:all`.
- Browser-test edits to existing specs are add-only; name each in your log.
- Logs and scratch files: your own folder only (`.local-stack/<agent>/` or
  the scratchpad sub-folder `<agent>/`).
- Never edit the tracker, never update baseline screenshots, never push.
  Stage files by name (never `git add -A` / `.`; docs need `git add -f`).
- Small commits ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; the last one's
  subject starts with `lane ready:`.

## Hand-back (in your brief, committed in the last commit)

Changelog; per screen the overlay mean difference and every remaining
difference with its reason; flags used; contract changes you needed (as
requests); assets; browser-test edits; open questions; test commands and
results.
