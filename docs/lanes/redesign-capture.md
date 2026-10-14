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

- **05 lives on the existing first screens (TD-44, TD-43).** No new screen and no extra tap: for a new visitor or a user who skipped last time, the start is the "About the questions" screen, now under the title "Take your skin check" with a one-line intro, the last-check card, the choice card and the lighting tip. Its Start is the existing "Answer the questions now" (or skip). For a returning user whose answers carry over, the photo step is the start, so the last-check card shows there.
- **Last check and next check (05):** read with the existing loader (`loadDashboard` → `deriveDashboard` → `lastReadingDate`, the same rule as Today's tile) and `nextCheck` (7 days, provisional), worded with `HOME_COPY`. No new query or API. Optional: signed out, loading or failed, the card is absent, and the check never waits for it. No "weekly", no "3 photos", no "for better insights" (banned).
- **Data gaps (logged, not built):** 05's three-angle grid and "Retake photos" (C10, one photo per check); 05's "Your progress" photo strip (banned label as a section title, before/after-like strip, TD-47(4)); 07's Front/Left/Right stepper and thumbnails (C10); 07's live lighting/position/distance/face indicators and "Good lighting" pill (C11). After capture the gate's own result is shown instead: Light, Sharpness, Photo size as words (Fine / Retake / Not checked); pose, distance and framing are never measured so never shown; an unchecked photo shows no list.
- **08 question set is a placeholder (E19).** No weekly question set exists. The mockup's questions are change claims or banned ("Much better … Much worse", "Fading / Worse", "More than"), so the screen uses three placeholder questions in `flowCopy.ts` (new breakouts, started or stopped a product, how the skin felt), none comparing weeks. Owner to replace with E19's set.
- **08 placement:** a view state inside `SkinCheckFlow` (no route), opened from 05 by a "Weekly check-in" button that exists only when `weeklyCheckinUi()` is on; Back and Skip return to 05; answers live in the component; "Save answers" is disabled with "Saving your answers comes later." The mockup's stepper (Photos ✓ → Check-in → Complete) is left out: reached from 05 before any photo, a done Photos step would be untrue.
- **08 choice tiles:** `ChoiceGrid` (radios), no images or smileys (no data; smileys rate the week).
- **Bottom bar:** hidden (`body[data-flow="check"]`, set in one place in `SkinCheckFlow`) on the photo step, the photo wait (mesh sweep) and the check-in. Kept on the start, the questions and the results, which need the way out.
- **Header:** the flow keeps its own back button (the hook's `back()`, disabled on the first screen) with the kit `Wordmark` centred; kit request B1 for an `AppHeader` with a callback. The 8-part segment bar stays (numbered circles do not fit 8 parts at 375px), restyled; the part title is the page's one h1, now sentence case ("Skin photo").
- **Question inputs** (`/skin-check` parts and `/questions`) keep their own components (buttons by name, which the browser tests use); restyled to 12px tiles only. `ChoiceGrid` is used on 08 only.
- **`FacePhoto` corners** 20px → 16px: this also changes the photo on lane A's results and opened-check screens (presentation only).
- **TD-25(6)/G06/G07:** "Get my results" and "Your photo reading" unchanged; "Analyze my skin" unchanged (browser tests).

## Hand-back

### Changelog

| File | Change |
|---|---|
| `components/skin-check/SkinCheckFlow.tsx` | Wordmark header beside the flow's own back button; 05 on the choice screen (title, intro, last-check card, choice card, tip) and the last-check card on a returning user's photo step; check-in view state (flag only); `body[data-flow="check"]` from one place on the photo step, the photo wait and the check-in; 16px cards, new tokens on the blocked and results headers; "Go to Today" link `text-sm` |
| `components/skin-check/ProgressHeader.tsx` | Thin segment bar in `--brand-700`, "Part n of 8" eyebrow, the part as a sentence-case 28–32px h1; `showBar` off on 05 |
| `components/skin-check/CheckStart.tsx` (new) | `LastCheckCard` (existing loader and Today's next-check rule, optional) and `PhotoTip` (Today's tip wording) |
| `components/skin-check/WeeklyCheckin.tsx`, `flowCopy.ts` (new) | 08 behind `weeklyCheckinUi()`: numbered question cards with `ChoiceGrid`, Back and Skip to 05, "Save answers" disabled with "Saving your answers comes later."; placeholder questions; START and CHECKIN copy |
| `components/skin-check/inputs/PhotoCapture.tsx`, `captureStates.ts` | 07: 16px dark frame with corner framing guide (also over the live preview), "Keep your face in the frame" tip card, round shutter (name "Take photo"), "Photo check" card from `gateRows()` (Light, Sharpness, Photo size: Fine / Retake / Not checked), 12px thumb and tiles; capture logic, consents, gate and retake loop untouched |
| `components/skin-check/inputs/PhoneAuthStep.tsx` | "Continue" and "Get my results" buttons `size="lg"` (were 36px) |
| `components/mesh/ScanningPhoto.tsx`, `FacePhoto.tsx` | 20px → 16px corners (FacePhoto also on lane A's screens) |
| `components/skin-check/QuestionsChoice.tsx` | Skip pop-up 20px → 16px card, new tokens; h3 without the old display font |
| `inputs/CardSelect`, `ImageCardMultiSelect`, `BodyZoneChecklist`, `SegmentedSlider` | Option tiles 12px (`rounded-tile`) |
| `tests/redesign-capture.test.ts` (new) | `gateRows` (three checks only; unchecked shows nothing); check-in only behind the flag, no save path; one `data-flow` setter |
| `tests/ui-wording.test.ts` | Add-only: `flowCopy.ts`, `WeeklyCheckin.tsx`, `CheckStart.tsx` in the wording scan |
| `tests/design/redesign-capture.shots.ts` (new) | 375px shots into `docs/design/redesign/capture/` (flag on for 08; the scan request is held, nothing saved) |

`/questions` (`LaterQuestions.tsx`) already used the kit card, heading and buttons; no change needed.

### Deviations and why

See the Log. In short: one photo (no angle grid, no Front/Left/Right stepper, C10); no live indicators (C11), the post-capture gate result instead; no "Your progress" photo strip or "Save and continue" (05); 08 questions are placeholders without the mockup's better/worse scales, smileys or skin photos, and without its Photos/Check-in/Complete stepper; the flow keeps the 8-part bar; 05's Start is the existing choice buttons (TD-44) or the photo step (TD-43); the bottom bar stays on the start, the questions and the results.

### Flags used

`weeklyCheckinUi()` (`NEXT_PUBLIC_UI_WEEKLY_CHECKIN=on`) for 08. Off: the "Weekly check-in" button and the view do not exist.

### Browser-test edits

None. No locator in `tests/browser/` was changed or added.

### Kit requests

B1: `AppHeader` with an `onBack` callback and a disabled state (kit-requests.md).

### Open questions

1. E19: the real weekly check-in question set and storage; the placeholder three questions are for review only.
2. Should 08 sit after the photo (as the mockup's stepper says) once E19 exists? That needs a flow (hook) change, out of this lane.
3. 05: "Take your skin check" sits above the TD-44 choice card, so the primary button is below the fold at 375px on the first visit. Fine, or shorten the choice card?
4. Gate status words "Fine / Retake / Not checked": OK, or icons only?

### Tests

- Baseline before changes: `npx tsc --noEmit && npx vitest run`: 108 files passed, 18 skipped; 2367 tests passed, 85 skipped.
- Final: `npx tsc --noEmit` clean; `npm run lint` clean (only the existing `<img>` warnings in `components/ui/kit.tsx`); `npx vitest run`: 109 files passed, 18 skipped; 2372 tests passed, 85 skipped.
- `PW_ARGS="tests/browser/questionnaire.spec.ts" bash scripts/with-stack-slot.sh npm run test:browser`: 16 passed.
- `PW_ARGS="tests/browser/flows.spec.ts" …`: 20 passed.
- `PW_ARGS="tests/browser/mesh.spec.ts" …`: 22 passed.
- `NEXT_PUBLIC_UI_WEEKLY_CHECKIN=on PW_ARGS="-c tests/design/playwright.config.ts tests/design/redesign-capture.shots.ts --project=390" bash scripts/with-stack-slot.sh npm run test:browser`: 3 passed.
- Screenshots (375px), `docs/design/redesign/capture/`: `compare-05-weekly-skin-check.png`, `compare-07-guided-capture.png`, `compare-08-weekly-checkin.png`, and `05-start`, `05-start-signed-out`, `05-start-returning`, `07-capture-before`, `07-capture-retake`, `07-capture-after`, `07-scanning`, `08-checkin`.
