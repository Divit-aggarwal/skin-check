# Lane brief: capture (C01, C02)

Branch `lane/capture`, worktree `../skin-check-capture`, `PORT_BASE=3200`. Read [README.md](README.md) first: lane rules, ports, shared files.

## Tasks

| ID | Task | Starts as | Deliverable in this lane |
|---|---|---|---|
| C01 | Guided capture quality gate: on-device checks for pose, expression, exposure, distance, blur and framing, with a retake loop | NOT STARTED | 1. Design brief (checks, thresholds, retake UX). Exposure comes first, because it is the dominant Phase 0 risk. 2. After owner approval: implementation and tests |
| C02 | Per-scan comparability: decide whether two scans can be compared before any change is computed (D-13) | BLOCKED (D-26, C07) | Design brief plus a pure **key-based** function over SkinState: engine build, pipeline version, capture method, input variant, quality. Per-metric noise thresholds stay `unknown` until C07 exists. Never a naive % change (D-13, D-24) |

## Files you own

- `components/skin-check/inputs/PhotoCapture.tsx`
- `hooks/useCameraStream.ts`
- `lib/scan-analysis-record.ts`
- new: `lib/capture-quality/**`, `lib/comparability.ts`
- new tests: `tests/capture-*.test.ts`, `tests/comparability*.test.ts`, and optionally `tests/capture.e2e.test.ts` (runs inside `npm run test:local`)
- new seed: `scripts/seed-lane-capture.ts`, for example pairs of comparable and non-comparable scans

## Shared files: your part only

- `app/api/skin-scan/route.ts`: only the `persistScanAnalysis` call and the form fields it reads, after `request.formData()`. Never the auth or rate-limit preamble.
- `lib/firebase/skin-checks.ts`: add one optional `capture` field. Do not touch `consent`.
- `types/skin-scan.ts`: new optional fields or types only. `SkinScanResultSchema` is the engine contract; leave it.

## Do not touch

- `lib/skin-state.ts`, `lib/skin-state-loader.ts` (D-23 frozen). C02 reads SkinState; it does not change it.
- `lib/consent.ts` and the consent part of PhotoCapture's behaviour (privacy lane). You may move that code within the file, but keep what it does.
- `firestore.rules`. If capture needs a rule, write the request in your report.
- The engine (skin-scan). Engine changes need explicit approval (D-18).
- Everything listed under "No lane edits" in README.md.

## Tests you must add

- Each quality check as a pure function. Pass, fail and edge cases at the thresholds, with synthetic frames (no real faces in the repo).
- The retake loop: a failed check blocks the scan request, and a retake clears the previous consent state as today.
- Comparability:
  - a table of scan pairs giving comparable or not, with the reason;
  - missing `engine.build`, or `null` capture method, gives "not comparable", never a guess;
  - no output contains a % change or a causal word (D-12, D-13).
- Anything stored with the analysis: a round trip through the local stack (`tests/capture.e2e.test.ts`).

## Exit conditions

- Design brief approved by the owner (recorded in `capture-report.md`).
- `npm run test:local` green; typecheck, lint and `npm run build` green.
- Only owned files and your marked parts of shared files changed (`git diff --stat longitudinal-platform...`).
- `docs/lanes/capture-report.md` has: what was built, commits, test results, open questions, and proposed decisions for the owner.
