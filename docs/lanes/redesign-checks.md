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

(lane writes here: decisions hit, data gaps, kit requests filed)

## Hand-back

(lane fills in at the end)
