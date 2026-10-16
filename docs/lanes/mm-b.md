# Agent B: capture and check-in (05, 07, 08)

Read `docs/lanes/mm-README.md` first. Contracts: `lib/feature-contracts/check-photos.ts`
(three angles, `LiveChecks`) and `lib/feature-contracts/checkin.ts`. Backend: BE3 builds the upload `angle`, the photo `angle`, `sideImages` on the record and `/api/checkins`. Build against the contract, unit-test with the fixtures, and expect the real routes at integration.

## Build
**05 Weekly skin check start** (`components/skin-check/CheckStart.tsx`, `QuestionsChoice.tsx`)
- Match the mockup.
- The "Your progress" strip shows the user's own last photos (`PhotoStrip`).
- The three-photo row appears only with `threeAngleUi()`.

**07 Guided capture: three angles and live checks** (`components/skin-check/inputs/*`, `lib/capture-quality/*`)
- Behind `threeAngleUi()`. Off: today's one-photo capture, unchanged.
- On: a Front, Left cheek, Right cheek stepper.
- Live checks on the camera stream with `@mediapipe/tasks-vision` (already installed; model and wasm in `public/mediapipe/`, loader in `components/mesh/landmarks.ts`). Run the face landmarker in VIDEO mode, throttled to about 5 fps:
  - lighting: mean luma and clipping from `lib/capture-quality/exposure.ts`
  - position: face centre inside the guide
  - distance: face box width as a share of the frame
  - face clear: landmarks found and enough of them visible
  - For left and right, also the head yaw from the landmarks.
- Thresholds go in `lib/capture-quality/settings.ts` as named, provisional values (a calibration knob, C09).
- Front is sent to the engine as today. Left and right are uploaded with `angle` and recorded in `sideImages`, never analysed.
- The after-capture gate (blur, exposure, resolution) still runs on each photo.
- Pose and framing are now measured live, so record them in `captureQuality.checks` instead of `not_measured` (no schema change: same check ids).
- No camera, permission denied, or model failed to load: fall back to today's capture, with a line naming why.

**08 Weekly check-in** (`components/skin-check/WeeklyCheckin.tsx`)
- Behind `weeklyCheckinUi()`.
- Questions from `CHECKIN_QUESTIONS` through the kit's `CheckinQuestionCard`.
- Face icons instead of the mockup's skin photos (TD-51 (2)).
- POST to `/api/checkins`, with "Skip" and a 409 "already this week" state.

## Tests
- Unit tests: the live-check maths (pure functions over landmark arrays; use synthetic landmark fixtures), the flag-off path unchanged, the check-in payload and its states.
- Browser: with the fake camera (see `tests/design/playwright.config.ts` 1280 project), the flag-off flow is unchanged (`questionnaire.spec.ts` must still pass). The flag-on stepper renders.
- Overlay shots.

## Log

- 2026-10-15: rebased on build/mockup-match (BE1-3, lanes C and E, kit fixes): no conflicts; lane B touches no shared file.
- After the rebase, BE3's guard `tests/side-photos.test.ts` (the scan client names no side contract) failed on lane B's `import type { SideAngle } from check-photos` in `lib/api.ts`; the angle is now typed inline (`"left" | "right"`), aafb9f8.
- Docker Desktop was not running; started it for the stack runs.
- One overlay pass after the rebase (owner time-box): titles and intros set to the mockups' measured sizes (cb48391). No further pixel iteration.
- The three-angle capture is checked in the browser with the fake camera, which shows a frontal face: on the cheek steps the live chips Position/Distance show "not yet" (correct for that input), not a defect.

## Hand-back

### Changelog (13 commits on mm/b)
- fbbc46d live-check maths (`lib/capture-quality/live.ts`): lighting, position, distance, face in view, head yaw over landmark arrays; the gate records distance, framing and pose when measured live (same check ids, no schema change).
- cae7d37 screen 08 `WeeklyCheckin.tsx` on `CHECKIN_QUESTIONS` + kit `CheckinQuestionCard`, face icons (TD-51 (2)), POST `/api/checkins` (`checkinSubmit.ts`) with saved, 409 already-this-week, error and Skip; opened from the start or after a check; behind `weeklyCheckinUi()`.
- 94310f0 / 8fa488c screen 05: the user's own kept photos strip (`PhotoStrip` via `/api/checks/photo`), and with `threeAngleUi()` the last kept check's own three photos (`?angle=left|right`), outline when not kept.
- 877218b screen 07 `inputs/GuidedCapture.tsx`: Front, Left cheek, Right cheek stepper with live checks (MediaPipe face landmarker, VIDEO mode, ~5 fps); front analysed as today, sides uploaded with `angle` and recorded in `sideImages`, never analysed; after-capture gate on each photo; fallback to today's capture (with the reason) when there is no camera, permission is denied or the model fails.
- 8fa488c BE3 wiring: `sidesStored` (upload landing watched) into `saveSkinCheck`.
- 4383f02 flag off: the gate call is today's exact call.
- aafb9f8 `lib/api.ts` upload angle typed inline (BE3 guard).
- 9a622ef / 741aef2 `tests/design/b.match.ts` shots (05, 07, 08) with the fake camera, 08 on BE3's real route.
- e43a54c, 72aa874, f6e23d8, cb48391 overlay styling.

### Live-check thresholds (`lib/capture-quality/settings.ts`, all provisional, C09 calibration knob; settings version `cq-settings-1-provisional`)
| id | value |
|---|---|
| live.fps | 5 frames/s |
| live.visibleFracMin | 0.97 of the 478 landmarks inside the frame (face in view) |
| live.centreMaxOffset | 0.12 of frame, both axes (position) |
| live.widthMinFrac / widthMaxFrac | 0.35 / 0.80 of frame width (distance) |
| live.frontYawMax | 0.10 nose offset (front) |
| live.sideYawMin / sideYawMax | 0.15 / 0.40 nose offset (cheeks) |
Lighting reuses the exposure values (mean luma 50-210, clip fractions 0.25 low / 0.10 high).

### Flags
`NEXT_PUBLIC_UI_THREE_ANGLE` (05 three-photo row, 07), `NEXT_PUBLIC_UI_WEEKLY_CHECKIN` (08). Both off by default; off is today's flow.

### Overlay (393 px, `docs/design/mockup-match/`, after cb48391)
| shot | mean diff |
|---|---|
| 05-start | 59.8 |
| 05-start-lower | 57.3 |
| 07-capture-front | 43.3 |
| 07-capture-left | 44.6 |
| 07-review | 95.2 |
| 08-checkin | 36.5 |
| 08-saved | 30.4 |
| 08-already | 34.2 |

Remaining differences and reasons:
- All: iOS status bar; the app's "PROJECT SKIN" header sits ~24 px lower than the mockup's (kit `AppHeader`/shell height, kit request B-mm-1); bottom bar until integration.
- 05: the "About the questions" card comes first and "Answer the questions now" / "Skip the questions" replace "Retake photos" / "Save and continue" (owner answer 5, TD-44: the choice is on the first screen at 375 px). This pushes the last-check card, the three photos, the tip and "Your photos" below the fold (shown in 05-start-lower). The last-check card's text is real data ("Yesterday", the date and the next-check rule) in place of "3 days ago / Keep checking weekly". The three tiles show an outline in place of photos because the shot's user (skipped questions) has no kept photo; with kept photos they show the user's own (data rule 1). The progress strip shows its empty state for the same reason. The lighting tip uses our wording. A "Weekly check-in" button (flag on) has no mockup counterpart.
- 07: the fake camera is a frontal face, so the left-cheek step shows Position/Distance as not yet; real data. The kit `Stepper` circles are 32 px against the mockup's ~26 px, with the current step outlined rather than filled (kit request B-mm-2). Our chip label is "Face in view" (what it measures) where the mockup says "Face clear". The shutter row shows the next step's number when no photo is taken yet, where the mockup shows sample thumbnails. The `TintCard` hint uses kit type sizes (17/15 px against ~13/11 px; kit request B-mm-3).
- 07-review, 08-saved, 08-already: app-only states with no mockup; the overlay compares them with the nearest mockup for reference only.
- 08: opened from the start, so no "Photos / Weekly Check-in / Complete" stepper (shown only after a check, when the photos step exists). Face icons in place of skin photos (TD-51 (2)). No answer pre-selected (the mockup's selections are sample data). Kit `CheckinQuestionCard` type is larger and its cards taller than the mockup's (question 17 px vs ~13 px, options 15 px vs ~11 px), so only four questions fit above the fold (kit request B-mm-4). Our title is "Weekly check-in" in sentence case (TD-50).
- 320 px rechecked after the rebase and cb48391 (07-capture-left@320, 08-checkin@320): no horizontal scroll, nothing clipped. Tight spots, both in the kit `CheckinQuestionCard` at 320: "A bit better" fills its option edge to edge and "More than 5" wraps to three lines (part of B-mm-4). The 08 title breaks as "Weekly check-/in" at 320. 375 and 430 were not rechecked after the rebase.

### Kit requests (also appended to `docs/lanes/kit-requests.md`)
| # | Agent | Request | Why / screen |
|---|---|---|---|
| B-mm-1 | B | `AppHeader` / flow header: ~24 px less top space so "PROJECT SKIN" sits at the mockup's height | 05, 07, 08 |
| B-mm-2 | B | `Stepper`: 26 px circles, current step filled (white number on brand-700), done steps with a check | 07, 08 |
| B-mm-3 | B | `TintCard`: a `compact` size (title 13 px semibold, body 11-12 px) | 05 tip, 07 hint |
| B-mm-4 | B | `CheckinQuestionCard`: a `compact` density (question 13-14 px, option labels 11-12 px, smaller padding); at 320 px "A bit better" touches its option edge and "More than 5" wraps to three lines | 08 |

### Production owner item (IAM)
The S3 policies (upload role and photo-read role, prod and staging) must allow `users/<uid>/scans/<scanId>/left.jpg` and `right.jpg` as well as the front object, or the cheek uploads and `/api/checks/photo?angle=` fail in production. Owner item: change and apply the IAM policy (never applied by an agent; no terraform apply).

### Contract changes needed
None. BE3's routes (upload `angle`, photo `angle`, `sideImages`, `/api/checkins`) were used as built.

### Assets
None added (Lucide icons only).

### Browser-test edits
No existing browser spec edited. New: `tests/design/b.match.ts`. Unit: `tests/redesign-capture.test.ts` 08 block updated for the real save path (the old test pinned "no save path"); new `tests/live-checks.test.ts`, `tests/three-angle.test.ts`, `tests/weekly-checkin.test.ts`.

### Open questions
- Calibrate the live-check thresholds on real phones (C09) and replace the provisional values.
- Should 05's start overview (last check, three photos) come before the questions choice when the three-angle flag is on? Kept after it per owner answer 5.

### Test commands and results (2026-10-15, after the rebase)
- `npx tsc --noEmit`: pass.
- `npm run lint`: pass (3 warnings, all in the shared `components/ui/kit.tsx`).
- `npx vitest run`: 124 files passed, 23 skipped; 2535 tests passed, 102 skipped.
- `NEXT_PUBLIC_UI_THREE_ANGLE=on NEXT_PUBLIC_UI_WEEKLY_CHECKIN=on PW_ARGS="-c tests/design/match.config.ts tests/design/b.match.ts" bash scripts/with-stack-slot.sh npm run test:browser`: 12 passed (the flag-on stepper, live chips, review, check-in, saved and already states render).
- Flags off: `PW_ARGS="tests/browser/questionnaire.spec.ts" bash scripts/with-stack-slot.sh npm run test:browser`: 16 passed, spec unchanged.
- `tests/browser/flows.spec.ts` was NOT run. The orchestrator's time-box cut it. At integration, expect its /routine `main img` test to be red; that failure is lane C's (C-mm-4, store photos on 06), not lane B's.
