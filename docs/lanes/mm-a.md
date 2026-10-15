# Agent A: Skin Twin and Progress (09, 10, 11, 12)

Read `docs/lanes/mm-README.md` first. Data: `lib/readings/series.ts` (`readingsOverTime`, `SeriesCheck`) over the checks `components/dashboard/state.ts` and `data.ts` already load. Kit: `LevelTimeline`, `PhotoStrip`, `ChangeSlot`, `MetricTile`, `PhotoTile`. Photos: the user's own photos through `/api/checks/photo` only.

## Routes
| Screen | Route | Notes |
|---|---|---|
| 10 Skin Twin | `/checks` | Heading "Your Skin Twin". Tabs Overview / Concerns / Timeline. |
| 11 Concern detail | `/checks?reading=<metric>` | Already the A2 link from tiles. |
| 12 Progress | `/progress` | New page. Tabs Overview / Concerns / Photos. |
| 09 Weekly report | `/checks/[scanId]` | The opened check. |

`components/checks/*` and `app/(marketing)/checks/*` are yours; create `app/(marketing)/progress/` and `components/progress/`.

## What the data rules remove or replace
These are allowed differences; list them in the hand-back.

**Screen 10**
- The "Learnings" tab and "Latest learning" are removed (causal).
- The "positive progress" banner is removed (change claim).
- "Your skin goals" with percentages: no backend, so it is not shown.
- "A living model that learns" becomes plain copy, for example "Your checks, readings and routine in one place".

**Screen 10 keeps**
- The user's own latest photo with the face mesh labels: `components/mesh/*` exists; reuse it.
- "Your current skin state": the five level words with their identity icons, plus bars that show the level, not a score.
- The routine strip.
- Routine consistency: real, from `lib/routine/adherence.ts`.

**Screen 11**
- Kept: the level today, the `LevelTimeline` for that reading (4W / 8W / 12W / All with `SegmentedControl`), and the `ChangeSlot` (needs more checks) where the mockup has −42%.
- "Before and after" becomes a `PhotoStrip` of the user's own checks, labelled with dates. The heading becomes "Your photos", because "before and after" is banned.
- "AI insights" is removed.
- "What to do next" keeps only lines that are not claims: "Keep your routine" goes to /routine, and "Track with the weekly check-in" goes to the check-in. No "maintain results".

**Screen 12**
- Metric tiles: level word plus a `ChangeSlot`, never −62%.
- "Visible Results" becomes "Your photos" (own photos), with no "clearer, calmer" copy.
- "Progress Trends": one `LevelTimeline` per reading, or a combined level chart if you build it from the same points. Levels on the y-axis, never 0–100.
- "Key insights" with Improving pills is removed.
- The "Routine Impact" tab is removed (D-12).
- The "Last 12 weeks" dropdown is the window control.

**Screen 09**
- The opened check as today, matched to the mockup's layout.
- Change chips become `ChangeSlot`.

## Tests
- Unit tests over the copy (`bannedWordsIn`), the window filter wiring and the empty state.
- Browser spec for /checks, /checks?reading, /progress, /checks/[scanId] with a seed of 0, 1 and 4 checks: `scripts/seed-mm-a.ts`, modelled on `scripts/seed-lane-dashboard.ts`.
- Overlay shots of each screen and main state.

## Log
- 2026-10-15: 2152c25 built 09, 10, 11, 12 (routes, kit timelines, ChangeSlot, own photos, seed, browser spec, match shots, copy tests). First overlay pass left uncommitted when the agent stopped.
- Resume: the uncommitted overlay-pass edits were sound (CheckDetail was re-nested, not half-edited; only its indentation was off). Re-indented and committed. Rebased on build/mockup-match (one conflict, `docs/lanes/kit-requests.md`, both sides kept; A-2 marked done by C-mm-3).
- After the rebase: the lane seed is renamed `scripts/seed-mm-a.ts` (the stack now runs `seed-mm-*`), and `components/checks/series.ts` reads kept side photos from `sideImages` (C10 landed in the base). My `seriesChecks` stays separate from `components/dashboard/state.ts`'s: mine follows the dashboard history (incl. non-measured views, newest first) for the opened check and timelines; the base one is measured-only for 16.
- `tests/browser/mm-a.spec.ts`: the 09 whole-face tiles moved out of the check's `<section>` (so each reading name appears once inside it), so the spec reads them from `main` (own spec, not an existing one).
- Orchestrator time-box (owner wants speed): one overlay pass only; remaining differences listed below, no further pixel iteration.

## Hand-back

### Changelog
- `/checks` (10): heading "Your Skin Twin", tabs Overview / Concerns / Timeline, own latest photo with the face mesh, "your current skin state" with level words and level bars, the routine strip and routine consistency (`lib/routine/adherence.ts`).
- `/checks?reading=<metric>` (11): level today, `LevelTimeline` with 4W / 8W / 12W / All (`SegmentedControl`), `ChangeSlot`, "Your photos" `PhotoStrip` of own checks, "What to do next" (Keep your routine → /routine, weekly check-in).
- `/progress` (12, new): tabs Overview / Concerns / Photos, "Last 12 weeks" window select, `LevelTile`s (level word + `ChangeSlot`), one `LevelTimeline` per reading, own photos.
- `/checks/[scanId]` (09): opened check, photo wide with the mesh, whole-face level tiles with `ChangeSlot`, what we know / don't know, next steps.
- Seed `scripts/seed-mm-a.ts` (0, 1, 4 checks; emulators + demo- project + local S3 only).

### Overlay (393, one pass; `docs/design/mockup-match/<NN>-<state>.png`)
| Shot | Mean diff |
|---|---|
| 09-check | 65.4 |
| 10-empty | 52.4 |
| 10-one | 59.2 |
| 10-overview | 59.1 |
| 11-reading | 42.7 |
| 12-empty | 34.7 |
| 12-one | 34.0 |
| 12-overview | 41.8 |
| 12-photos | 76.7 (no mockup for the Photos tab; compared against 12) |

Remaining differences (all screens):
- iOS status bar; old bottom bar (Checks/Routine) until integration (README).
- Real data in place of sample data: the seed's test face, real dates ("Check from 13 Oct 2026" vs "Weekly Skin Report"), level words in place of Mild/Healthy/Good.
- Reading names Breakouts / Redness / Oiliness / Texture / Dark marks (rule 6); five readings, not four.
- Our type scale and header (`AppHeader` with the account button, larger title) run larger than the mockup; content starts lower, so everything below drifts down. Not iterated (time-box).
- Tabs: separate pills, not a full-width track (kit request A-1, open).
- Fixed notice "Photos differ in light and angle…" (TD-24) appears on 09, 10, 12, which the mockups lack.

Per screen, removed by the data rules:
- 10: "Learnings" tab and "Latest learning" (causal); "positive progress" banner (change claim); "Your skin goals" with percentages (no backend); "A living model that learns" → "Your checks, readings and routine in one place."
- 11: "Before and after" → "Your photos" (own photos, dated); "AI insights" removed; −42% → `ChangeSlot` ("Needs more checks").
- 12: −62% etc. → level word + `ChangeSlot`; "Visible Results" → "Your photos" without "clearer, calmer" copy; "Progress Trends" 0–100 chart → `LevelTimeline` per reading (levels, no scores); "Key insights" / Improving pills removed; "Routine Impact" tab removed (D-12); calendar icon → account button.
- 09: "Weekly Skin Report / what changed" → "Check from <date>"; before/after pair → the one own photo with the mesh (TD-39); "Visible improvement" banner, change chips with arrows/% and bar sparklines → level tiles with `ChangeSlot`; "Key Insights" removed; "What to do next" claim tiles ("It's working well", "Maintain sun protection") → non-claim next rows; "Update my routine" → "Open your routine".

### 320 / 375 / 430
Shots taken at all four widths (`docs/design/mockup-match/shots/`, not committed); tile rows scroll inside their own track, no page-level horizontal scroll in the spec runs. Not re-checked by eye after the time-box.

### Flags
None. All data these screens read has landed (series in the base).

### Contract changes needed
None.

### Kit requests (`docs/lanes/kit-requests.md`)
- A-1 `TabBar` fill look (open).
- A-2 stack runs `seed-mm-*` (done, C-mm-3; seed renamed).
- A-3 TD-51 names in the shared wording checks (open; lane A's `tests/ui-wording.test.ts` change carries it meanwhile).

### Assets
None (no `public/assets/a/`).

### Browser-test edits
No existing spec edited. New: `tests/browser/mm-a.spec.ts`, `tests/browser/seed-mm-a.ts`, `tests/design/a.match.ts`.

### Open questions
- Header scale: match the mockup's smaller title and header across lanes (a kit/shell decision), or keep ours?
- 12 Photos tab has no mockup; layout is ours.

### Tests (after rebase on build/mockup-match 35e7b2d)
- `npx tsc --noEmit`: 0 errors.
- `npm run lint`: 0 errors (3 `no-img-element` warnings).
- `npx vitest run tests/mm-a-copy.test.ts tests/ui-wording.test.ts`: 16 passed.
- `PW_ARGS="tests/browser/mm-a.spec.ts tests/browser/dashboard.spec.ts" bash scripts/with-stack-slot.sh npm run test:browser`: 24 passed, 1 failed (mm-a 09 locator, fixed); dashboard.spec.ts all passed.
- `PW_ARGS="tests/browser/mm-a.spec.ts" …`: 3 passed.
- `PW_ARGS="-c tests/design/match.config.ts tests/design/a.match.ts" …`: 12 passed (4 widths).
