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

## Hand-back
