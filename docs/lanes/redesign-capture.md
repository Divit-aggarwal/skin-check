# Lane B: capture and check-in (05, 07, 08)

Read [redesign-lanes.md](redesign-lanes.md) first. Branch `lane/redesign-capture`,
worktree `../skin-check-rd-capture`, PORT_BASE 4100.

## Screens

| # | Mockup | Becomes | Route / components |
|---|---|---|---|
| 05 | 05-weekly-skin-check.png | The start of a new check: last check date, next-check timing, what you will do (questions if any, one photo), a lighting tip, Start | `/skin-check` (`components/skin-check/SkinCheckFlow.tsx`, `QuestionsChoice.tsx`, `ProgressHeader.tsx`, `StepAnswer.tsx`, `inputs/*`) |
| 07 | 07-guided-capture.png | **One** photo (no Front/Left/Right: C10 parked), framing guide, shutter, then the existing quality gate's result (blur, exposure, resolution) after capture, retake. No live indicators (C11 parked). Bottom bar hidden | `inputs/PhotoCapture.tsx`, `captureStates.ts`, `components/mesh/*` (scan sweep) |
| 08 | 08-weekly-checkin.png | Weekly check-in UI **behind `weeklyCheckinUi()`** (E19): questions with `ChoiceGrid`, Skip in the header; nothing saves (save button disabled, line "Saving your answers comes later"). Flag off = screen not reachable | new client component under `components/skin-check/` reached from 05 only when the flag is on; no new route needed (a step/state inside the flow), or a page under `app/(marketing)/skin-check/` if the flow cannot host it — log which |

Also restyle the existing question pages (`/questions`, `LaterQuestions.tsx`,
`QuestionsChoice.tsx` incl. the skip pop-up at line 72, still 20px) to the kit.

You own: `components/skin-check/SkinCheckFlow.tsx`, `ProgressHeader.tsx`,
`StepAnswer.tsx`, `QuestionsChoice.tsx`, `LaterQuestions.tsx`,
`questionsCopy.ts`, `captureStates.ts`, `inputs/*`, `components/mesh/*`
(presentation only), `app/(marketing)/skin-check/**`,
`app/(marketing)/questions/**`, tests for them.
Read-only: `SkinCheckDashboard.tsx` (results: lane A), Echo files (lane D),
`lib/useSkinCheckFlow.ts`, `lib/capture-quality/*`, `lib/skin-check-steps.ts`
(logic and question set: no changes).

## Data

- Have: the question set (`lib/skin-check-steps.ts`), optional questionnaire
  (TD-33/44), returning-user reuse (TD-43), one photo, post-capture gate
  results, last check date and 7-day cadence (`lib/home/schedule.ts`).
- Don't have: three angles, live pose/lighting/distance checks, a weekly
  check-in question set or storage (E19).

## Locked here

TD-44 (questions choice first, "are you sure?" skip); TD-43 (nothing asked
again for a returning user); TD-37 mesh sweep while reading; TD-25(6) "check"
not "scan" (G06/G07 open questions: "results" on two flow screens stays as is);
TD-47(3) permissions screen once after the first results; D-26 client input
never authoritative.

## Tests

`tests/browser/questionnaire.spec.ts`, `flows.spec.ts`, `mesh.spec.ts` (scan
parts), `tests/skin-check-*.test.ts`, `tests/optional-questionnaire.test.ts`,
`tests/capture*.test.ts`, `tests/ui-wording.test.ts`. The photo step needs the
engine: `PW_ARGS="tests/browser/questionnaire.spec.ts" bash scripts/with-stack-slot.sh npm run test:browser`.

## Log

## Hand-back
