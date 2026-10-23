# Lane report: polish (UI/UX polish pass after G37)

- Branch `lane/polish`, worktree `../skin-check-polish`, from origin/master b2b90a9 (PR #27).
- Brief: owner, 2026-10-24: "act like a senior designer and UI/UX engineer … do not rebuild or re-iterate the complete design … walk through the complete app … I am giving you all the permission." The owner's message is the design-gate approval (lanes README rule 3). This brief is still written down first.
- Local stack only (`PORT_BASE=3400`). No production, no tracker edit, no new dependency, no test removed or weakened.

## 1. Scope and what stays fixed

A polish pass on the G37 mockup-match build, not a redesign. Unchanged: the TD-50 palette and one font; nav items and labels; reading colour on the icon only; level words only, no numbers, no good or bad colours; D-12 and every wording rule (BANNED_WORDS, label exceptions); TD-24, TD-47 (4) as amended by TD-54; the 393px mockup match (G37).

Skills used as the rubric, from the repositories the owner shared:
- jakubkrehel/skills: better-interface, better-ui (evidence before taste; shared-token fixes first; press 0.96 over 150ms ease-out; motion gated on reduced motion).
- emilkowalski/skills: emil-design-eng (responsive press feedback; no scale from 0; motion under 300ms).
- Not used, and why: garden-skills, MengTo, elayadesign and tastemaker are for new pages, landing pages or video. They do not fit a finished app.

## 2. Walkthrough

- `SHOTS=polish-before`: tests/design/pages.shots.ts at 390 (the run was stopped after 32 of 144 because stale specs hit 180s timeouts; see §5). New tests/design/polish.shots.ts at 390, 768 and 1280 covers Today, Skin Twin (overview, timeline, opened check), Progress, Photos, Routine, Echo, Account, a product, Since you started, and the empty account.
- Screenshots: docs/design/polish-before/ and docs/design/polish-after/.

## 3. Findings, ranked (evidence: screenshot, then file)

| # | Sev | Finding | Where | Fix |
|---|---|---|---|---|
| 1 | HIGH | Levels-by-date chart: the last date label is cut off ("22 O") at every width. On desktop the SVG scales with the card, so its 11px labels render at about 30px. | progress-1280, progress-390; `components/ui/kit.tsx` LevelTimeline | Last label anchored at its end; the chart keeps a phone-like size (max width) instead of scaling text with the card |
| 2 | MEDIUM | "Needs more checks 0 of 3 comparable" breaks over five ragged lines in every narrow reading tile (Progress row, opened check, Since you started). | progress-390, check-1280; kit ChangeSlot | Pill and count as two short lines; the pill keeps its shape when it wraps |
| 3 | MEDIUM | Opened check on a tablet or desktop: the five reading tiles sit in one row inside a half-width panel (about 100px each). | check-1280; `components/checks/ChecksView.tsx:274` | From 640px, a wrapping grid of three |
| 4 | MEDIUM | A disabled primary button looks like a secondary button (white, grey outline): "Analyze my skin" before consent, routine "Add". Users cannot tell "not yet" from "other option". | flow-photo-chosen-390, routine-current-390; `components/ui/classes.ts` btnPrimary, `components/ui/button.tsx` ink | Disabled = soft brand tint with no border, subtle text |
| 5 | MEDIUM | No pressed state on any button, chip or tile: a tap gives no feedback until the next screen arrives. | `classes.ts`, `button.tsx`, kit Chip, ChoiceGrid, SegmentedControl | `motion-safe:active:scale-[0.96]`, transform added to the colour transition (150ms) |
| 6 | MEDIUM | A signed-in user answering the questions still has the bottom bar (five ways out) under a focused task. Capture and check-in already hide it. | flow-questions-390; `components/skin-check/SkinCheckFlow.tsx:82` | Hide the bar for every question step too; the start, results and under-18 screens keep it |
| 7 | LOW | Native consent checkboxes and radios in browser blue/grey. | flow-photo-chosen-390 | `accent-color: var(--brand-700)` once on the page |
| 8 | LOW | Desktop and tablet show the wordmark twice: in the side bar or rail and again centred in each page header. | checks-1280, progress-1280; kit AppHeader | Header wordmark hidden where the side bar or rail shows |
| 9 | LOW | Sheets and dialogs that scroll pass the scroll to the page behind. | `components/dashboard/PhoneHome.tsx` weather sheet, `components/skin-check/QuestionsChoice.tsx` | `overscroll-behavior: contain` on every `dialog` |
| 10 | MEDIUM | Found while checking #3: one section, two headers. The list says "Your Skin Twin" with a full-width tab bar; an opened check on desktop says "History / Checks", and its tab bar is squeezed to its text (the "Overview" pill touches "Concerns"). | check-1280; `components/checks/ChecksView.tsx` | From 1024px an opened check uses the list's header. Phones keep their own back row |

## 4. Owner questions (not changed: wording or tested behaviour)

- Today while loading shows the title "Your skin checks" and then "Good morning": the header changes when data arrives. The browser tests wait on that title, so the change is the owner's.
- Today, empty account: three calls to take the first check (hero, Next check tile, "No check yet" row).
- Today's "Next check" tile repeats its label in its title ("Next check / Next check in 5 days").
- Today with no routine shows a "0/0" ring.
- Results: the sticky "Chat with Echo" bar sits on the bottom bar (two fixed bars, about 150px). Kept: the code says results keep the bar on purpose.

## 5. Found outside the task (new rows for the tracker at merge)

- tests/design/pages.shots.ts is stale: for example, "Delete my account and data" is no longer a button on /account, so several shots wait 180s and fail.

## 6. Results

Commits on lane/polish: a8e676c (this brief and the shot spec), 27b8595 (the fixes), then this report.

| # | Done | Change |
|---|---|---|
| 1 | Yes | `LevelTimeline` measures its figure (ResizeObserver) and draws 1:1: labels are 12px (the kit floor; they were 10-11px) at every width, and points sit 24px in from each edge, so no date is cut. |
| 2 | Yes | `ChangeSlot`: the pill and the count on two lines; the pill fill is `brand-text/6%`, which shows on white and tinted tiles. Phone tile rows show 2.5 tiles instead of 3.5 (Progress, opened check). **Deviation from mockup 12 (3.5 tiles)**, because our tiles must say "Needs more checks" where the mockup has a short value. Revert: `auto-cols-[calc((100%-1.5rem)/3.5)]`. |
| 3 | Yes | Opened check tiles: `sm:grid-flow-row sm:grid-cols-3`. |
| 4 | Yes | `btnPrimary` and the `ink` Button: disabled = `brand-100` fill, no border, `text-subtle`. |
| 5 | Yes | `press` in `components/ui/classes.ts`: transition on colour, background, border, opacity and transform, 150ms ease-out; `motion-safe:active:scale-[0.96]`. On btnPrimary, btnSecondary, btnGhost, btnOnDark, the shadcn Button, Chip, ChoiceGrid, check-in answers, Echo suggestions and send. Tabs and segmented controls are left without it (high-frequency switches). |
| 6 | Yes | `SkinCheckFlow`: `focused = checkin !== null \|\| !overlay`. Still one place sets `data-flow`; results never do (tests/redesign-capture.test.ts). |
| 7 | Yes | `accent-color: var(--brand-700)` on `body`. |
| 8 | Yes | `AppShell` marks a signed-in shell `data-nav`; the AppHeader wordmark is `lg:group-data-[nav]/shell:invisible`. |
| 9 | Yes | `dialog { overscroll-behavior: contain }` in globals.css. |
| 10 | Yes | `ChecksView`: an opened check shows the list header from 1024px; below that the compact PageHeader as before. |

Before and after: [docs/design/polish/](../design/polish/) (four comparison images). The full sets (docs/design/polish-before, polish-after; about 75 MB) are not committed; `tests/design/polish.shots.ts` makes them again.

### Tests

- Typecheck clean. Lint: no new findings (one older `<img>` warning).
- Unit tests that pin the touched files: 16 files, 229 tests passed (dashboard-copy, five-readings, face-mesh, redesign-capture, shell, ui-wording, brand-contrast, readings-series and others).
- Browser specs on the touched screens (mm-a, mm-c, home-v3, questionnaire, flows, dashboard), run against the lane stack after the screenshot runs: 65 passed, 3 failed. The three failures were seed state, not the change: the stopped pages.shots run had left the `capture` user with a draft at the photo step and the `routine` user with a product, and mm-c's seed needs the emulator variables that `npm run test:browser` sets. On a fresh stack, `PW_ARGS="tests/browser/flows.spec.ts tests/browser/mm-c.spec.ts" npm run test:browser`: 23 passed, 0 failed.
- Seen in the after shots: the bar is hidden on a question step; the disabled "Analyze my skin" is the tinted pill; the chart, tiles and opened-check header as in the comparison images.
- `npm run test:all` (about 20 minutes) is still owed, once, before the merge.

No test was removed or changed. New: tests/design/polish.shots.ts (screenshots only, not part of test:all).
