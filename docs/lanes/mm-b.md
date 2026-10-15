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

## Hand-back
