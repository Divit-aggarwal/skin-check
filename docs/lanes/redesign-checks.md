# Lane A: checks and report (09, 10, 11, 12, 13)

Read [redesign-lanes.md](redesign-lanes.md) first. Branch `lane/redesign-checks`,
worktree `../skin-check-rd-checks`, PORT_BASE 4000.

## Screens

| # | Mockup | Becomes | Route / components |
|---|---|---|---|
| 09 | 09-weekly-report.png | The opened check and the results screen at the end of a check | `/checks/[scanId]`, `components/checks/ChecksView.tsx`, `components/dashboard/CheckReadings.tsx`, `components/skin-check/SkinCheckDashboard.tsx` (results) |
| 10 | 10-skin-twin-home.png | **Checks home** (not "Skin Twin": banned word): latest check's readings, face drawing with tappable areas (TD-46), routine strip and days logged, newest check card | `/checks` (`ChecksView.tsx`), `components/dashboard/FaceDrawing.tsx` |
| 11 | 11-concern-detail.png | **One reading over time**: that reading's level word per check, by date, newest first, with the fixed "Photos differ…" line | inside `/checks` as a tab or `?reading=<key>` query (no new route) |
| 12 | 12-progress.png | **Checks overview tabs**: Overview, Readings, Photos (kept photos via the existing thumbnail route). No Routine Impact tab | `/checks` tabs (`TabBar`, links with query) |
| 13 | none (Timeline) | Restyle the existing timeline | `/checks?view=timeline`, `components/timeline/*` |

You own: `components/checks/*`, `components/timeline/*`,
`components/dashboard/CheckReadings.tsx`, `FaceDrawing.tsx`,
`components/skin-check/SkinCheckDashboard.tsx`, `app/(marketing)/checks/**`,
their copy modules (`components/checks/copy.ts`, `components/timeline/copy.ts`,
`components/dashboard/copy.ts` keys you add), tests for them.
Read-only for you: `components/dashboard/PhoneHome.tsx`, `HomeCards.tsx`,
`homeCopy.ts` (Phase 2, done), routine files, Echo files.

## Data

- Have: per check, five readings × whole face + forehead/nose/cheeks/chin as
  level words; "early estimate" tags (Breakouts, Texture, Dark marks, TD-40);
  check date; kept photo (if image retention consented) via
  `/api/checks/photo`; mesh photo with Redness/Oiliness overlays on results
  only (TD-37/39); routine events (`lib/routine/*`: adherence used / skipped /
  not logged, `daysLoggedLast7`, `routineStreak`); starting checks n of 3
  (`dashboard.trend`); timeline items (checks + routine events, TD-24(2)).
- Don't have: any change between checks (D-24, `NOISE_TABLE` empty), acne,
  hydration (Dryness is never shown), goals, learnings, concerns objects,
  user-facing Skin Twin versions, "AI insights".

## Locked here

TD-24(1) the fixed line "Photos differ in light and angle. Differences between
checks are not yet a measured change." on every opened check and on 11; TD-24(4)
and TD-47(4) no arrows/deltas/colours; system.md §2 readings in ink; TD-37/39/40
mesh and overlays on results only, five readings as level words; TD-46 face
areas open Echo on that area; D-12 no "is working".

## Tests

Existing: `tests/browser/dashboard.spec.ts`, `mesh.spec.ts`, `flows.spec.ts`
(opened check parts), `tests/timeline.test.ts`, `tests/dashboard-*.test.ts`,
`tests/ui-wording.test.ts`. Run e.g.
`PW_ARGS="tests/browser/dashboard.spec.ts tests/browser/mesh.spec.ts" bash scripts/with-stack-slot.sh npm run test:browser`.

## Log

Decisions hit, data gaps and kit requests (lane A, 2026-10-14).

**Views and routes.** No new route. `/checks` has four tabs (kit `TabBar`,
links, so Back works): Overview (`/checks`), Readings (`?view=readings`),
Photos (`?view=photos`), Timeline (`?view=timeline`, unchanged address);
one reading at each check is `?reading=<key>` (key checked against
`SHOWN_METRICS`; anything else falls back to the Overview). The old List /
Timeline switch is the same nav (`CHECKS_COPY.views`), "List" became "Overview".
New views live in `components/checks/ChecksTabs.tsx`; `ChecksView.tsx` keeps
the list, the opened check and the timeline, in the order the source-reading
unit tests slice it.

**TD-24 (1).** The fixed line is on every view that shows a level word: the
Overview card, Readings, one reading (11), Photos and the opened check (09).
Never behind a toggle.

**09 opened check (and the results screen).** Built: back + wordmark header
(kit `AppHeader`) on phones, check date and kind, the kept photo with the mesh
or the face drawing (TD-37 (2)), the fixed line as a tinted card, the TD-39
readings table, "What this tells you / does not tell you", Ask Echo (newest
check only) and a new check. Not built: the before/after pair, the
"Visible improvement" card, the % tiles with arrows and bars, the Key Insights
status pills, "What to do next" (efficacy copy, "It's working well") and
"Update my routine" (TD-24 (1)(4), TD-47 (4), D-12, D-24, R-2 B). No reading
tiles here: TD-39 is one table, and `dashboard.spec.ts` pins exactly one
"Redness" text in the opened check, so tiles would duplicate the table's
whole-face row. A later change display would go between the fixed line and
the table. The results screen got the same card, tokens and a sentence-case
heading; its pinned `CheckReadings` line is unchanged; overlays stay on the
results only (TD-37/39).

**10 Checks home (Overview).** "Skin Twin" → "Checks" (banned word). Built on
phones: the newest reading card (date, the face drawing whose areas open Echo
on that area only when it is Echo's check and Echo is on, TD-46; the fixed
line; five `MetricTile`s under one "Whole face" label, with level words and
"early estimate" tags; each tile opens 11), then Past checks (every check by date, unchanged
labels), then the routine strip (product names with Morning / Evening, and
`daysLoggedLast7` as "n of 7 days, routine days logged") as its own card below
the list, never beside the readings (D-12). The "newer check not shown",
unreadable, legacy and no-reading states come from `deriveDashboard` as on
Home. From 1024px the Overview stays the list on the left and the opened
newest check on the right (TD-25 (1)); the newest reading card and the routine
strip are phone-only there (the routine strip would otherwise sit beside the
readings). Not built: "living model that learns", the photo with concern
markers (no per-area marker data beyond level words), the coloured bars,
"positive progress" card, skin goals and %, Latest learning (no goals or
learnings objects; D-12), product photos (none exist).

**11 one reading at each check.** Title is the reading's label (no "Acne");
the mockup's chips are the five readings as `TabBar` links. A `MetricTile` with
the newest level and "Latest check, <date>"; its empty footer is the slot where
the mockup's delta card and graph would go if ever allowed. Then every check
with a photo reading, newest first (history order, never sorted by level):
date, "Reading saved by the app only" for legacy rows, the level word or "No
reading" (one fixed class), each opening the check. When the checks were read
by different software versions the existing `C.trend.boundary` line is shown
(comparability gate). Not built: "-42%", "Improving", the graph with
4W/8W/12W/All, before/after strip, "AI insights" ("is working", D-12), "What
to do next".

**12 overview tabs.** "Your Progress" → "Checks"; Concerns → Readings;
**no Routine Impact tab** (D-12). Readings: the newest whole-face reading as
five level-word tiles (footer slots empty) with the fixed line, each opening
11; when that reading cannot be read, the five readings as links. Photos:
kept photos only (via `/api/checks/photo`, `Thumb size="tile"`), newest first,
two across, each labelled by its date only (no "Week n", "Today" or "Visible
results"), with the fixed line; a claimed photo that cannot be fetched shows
"Photo not available"; no kept photo → empty state. Not built: % tiles,
Progress Trends graph, Key Insights pills, "Last 12 weeks" range (nothing to
filter without a change display).

**13 timeline.** Restyled only: a card, icon wells (camera for a check,
repeat for a routine entry), tokens. Still no reading and no photo (D-12).
Removed the unused `thumb` prop of `TimelineList` (no caller).

**Other changes in owned files.** `Thumb` 48px corners 8px → 12px
(`rounded-tile`; also on Today's latest-check row) and reduced-motion on its
loading pulse. `CheckReadings` picture well 20px → 16px, table heading in the
one sans. 20px corners: none left in the files this lane owns.

**Data gaps (nothing faked).** No change between checks (D-24, empty
`NOISE_TABLE`); no concerns, goals, learnings or Skin Twin versions; no
"Week n" numbering; no product photos; no per-area markers on a photo; no
results-screen screenshot (needs a real engine check; `mesh.spec.ts` covers
that screen).

**Kit requests filed:** A1 `PhotoTile` no-referrer + onError (Photos keeps
`Thumb`'s own image until then); A2 `MetricTile` `href`.

**Browser-test edits (add-only):** `tests/browser/dashboard.spec.ts` new
`describe("checks views on a phone (TD-50)")` with two tests (Overview,
Readings, one reading, Photos empty; Photos with a kept photo). Nothing
existing changed.

## Hand-back

**Commits** (on `lane/redesign-checks`, from 8dc77ef): views 10/11/12 and the
opened check 09 (`9535ac0`); timeline 13 (`8b98f3d`); readings card and
results screen (`df3f80f`); list padding and the tiles' "Whole face" label
(`1f311ef`); browser test and screenshot spec (`6fc16c6`); this hand-back
(`lane ready:`).

**Changelog**

| File | Change |
|---|---|
| `components/checks/ChecksView.tsx` | Router for the views by query; kit `TabBar` (Overview, Readings, Photos, Timeline) instead of the List/Timeline switch; phone Overview = newest reading card, Past checks, routine strip; opened check (09) on the 16px card with `AppHeader` on phones and the fixed line as a tinted card; list and timeline on kit cards |
| `components/checks/ChecksTabs.tsx` (new) | `LatestReading` (10), `RoutineStrip` (10), `ReadingsView` (12), `ReadingView` (11), `PhotosView` (12), `fixedLine` |
| `components/checks/readings.ts` (new) | `readingHistory`: one reading's level per check, history order. Pure |
| `components/checks/copy.ts` | New strings (tabs, 10, 11, 12); `list` → `overview` |
| `components/checks/Thumb.tsx` | `size="tile"` (3:4, full width); 12px corners; reduced motion |
| `components/timeline/TimelineList.tsx` | Icon wells, tokens; unused `thumb` prop removed |
| `components/dashboard/CheckReadings.tsx` | 16px picture well, heading in the one sans (pinned shapes unchanged) |
| `components/skin-check/SkinCheckDashboard.tsx` | Results card on tokens and 16px corners, sentence-case heading (pinned shapes unchanged) |
| `tests/checks-readings.test.ts` (new) | `readingHistory`: order; questions-only, failed, legacy and unreadable checks |
| `tests/browser/dashboard.spec.ts` | Add-only: two phone tests for the new views |
| `tests/design/redesign-checks.shots.ts` (new) | 375px shots into `docs/design/redesign/checks/` |
| `docs/lanes/kit-requests.md` | A1, A2 |

**Screenshots** (`docs/design/redesign/checks/`): `compare-09-opened-check`,
`compare-10-checks-overview`, `compare-11-reading`, `compare-12-readings`,
`compare-12-photos` (mockup left, app right), and `09-opened-check`,
`09-opened-check-photo`, `10-checks-overview`, `11-reading`, `12-readings`,
`12-photos`, `13-timeline` (full pages; the fixed bottom bar shows mid-page in
full-page captures). 13 has no mockup. No results-screen shot (needs a real
engine check).

**Deviations and why:** see the Log (each screen lists what was built and what
was not, with the decision that blocks it). Summary: no deltas, %, arrows,
pills, graphs, before/after, goals, learnings, insights or Routine Impact; no
"Skin Twin" / "Progress" / "Acne" labels; no reading tiles on the opened
check or the results (TD-39 one table); Overview cards are phone-only (the
desktop keeps list + opened check, and the routine strip must not sit beside
readings).

**Flags used:** none (`echoOn()` as before; no backend-pending controls).

**Browser-test edits:** add-only, `dashboard.spec.ts` describe "checks views
on a phone (TD-50)", 2 tests.

**Open questions for the owner**
1. 11 lists one reading's level at every check together, including checks
   read by different software versions (the `C.trend.boundary` line is shown
   then). Should rows across an engine boundary be hidden or marked per row?
2. Photos (12) shows kept photos side by side by date. Fixed line on top,
   dates only. Is a grid of the user's own faces acceptable under D-12, or
   one photo per row?
3. The fixed line now also sits on the Overview card, Readings and Photos
   (not only opened checks and 11). Keep it there?
4. Overview cards (newest reading, routine strip) are phone-only; from
   1024px `/checks` stays list + opened newest check. OK?

**Tests**
- Baseline before changes: `npx tsc --noEmit && npx vitest run`: 2367 passed,
  85 skipped (108 files passed, 18 skipped).
- After: `npx tsc --noEmit` clean; `npm run lint` no errors (existing kit
  `<img>` warnings only); `npx vitest run`: 2368 passed, 85 skipped (109
  files passed, 18 skipped).
- `PW_ARGS="tests/browser/dashboard.spec.ts tests/browser/mesh.spec.ts tests/browser/flows.spec.ts tests/browser/questionnaire.spec.ts" bash scripts/with-stack-slot.sh npm run test:browser`:
  80 passed (17.5 min).
- `PW_ARGS="-c tests/design/playwright.config.ts tests/design/redesign-checks.shots.ts --project=390" bash scripts/with-stack-slot.sh npm run test:browser`:
  3 passed. An earlier run failed the kept-photo shot (the dashboard seed's
  photo is a test card, so no mesh); it now uses the mesh seed's face.
- No stack left running; `test:all` and `AFTER_SHOTS` not run.
