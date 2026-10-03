# Capture lane report: C01 capture quality gate, C02 comparability

Branch `lane/capture`, worktree `../skin-check-capture`. Design: [capture-design.md](capture-design.md). Brief: [capture.md](capture.md).

**Owner approval.** The owner approved the design on 2026-10-03 with these decisions (recorded in design part 0, commit `8ee4372`):

| Item | Decision |
|---|---|
| O-1 | A: `captureMethod` stays in the comparability key, marked client-asserted (owner change to D-26) |
| O-2 | A: the gate result is saved on `scanAnalyses`, labelled client-asserted, with a version number field (`schemaVersion: 1`) |
| O-3 | C: no new library; follow-up row for server-side landmarks |
| O-4 | B: soft block |
| O-5 | A: `lib/api.ts` passes the server's error code through |
| Q-1 | Follow the frozen contract (no "comparable-with-caveats" tier) |
| Q-2 | The browser's quality result never feeds comparability |

## 1. Steps done, steps skipped

| Step | Status | Commit |
|---|---|---|
| Owner decisions written into the design | done | `8ee4372` |
| S1 types, provisional settings, luma, retake reasons, synthetic frames | done | `88a7505` |
| S2 exposure check | done | `da6ebfb` |
| S3 blur (per capture path) and resolution checks | done | `e45dcab` |
| S4 gate (seven checks, `unchecked`, primary reason) and retake reducer | done | `3acb41d` |
| S5 key-based comparability, fails closed, empty `COMPARABLE_QUANTITIES` | done | `afb7fe2` |
| S6 local seed `scripts/seed-lane-capture.ts` | done | `9811c22` |
| S7 PhotoCapture retake loop, soft block, quality on `SkinScanState` and the draft | done | `1f053cf` |
| S8 server error codes become retake reasons | done | `d29253a` |
| S9 persist `captureQuality` on `scanAnalyses` | done | `747df17` |
| S10 pose, expression, distance, framing | **skipped**: O-3 = C (no landmark library). The four checks report `not_measured` (`no_landmark_model`). | — |
| S11 key marks `captureMethod` client-asserted (O-1 = A) | done | `94512b7` |
| Verifier fixes | done | `9ec59f3`, `484af75` |
| S12 this report | done | (this commit) |

What was built:
- **C01.** `lib/capture-quality/`: exposure (clip fractions and mean luma), blur (Laplacian variance, one threshold per capture path) and resolution checks, all pure, run on the exact blob sent to the engine. Every threshold is in `settings.ts`, `status: "provisional"`, with a source, under `cq-settings-0-provisional`. Verdict: `pass`, `retake`, `unchecked` (exposure could not be measured; never `pass`) or `override`. PhotoCapture runs the gate on both capture paths. Analyze stays disabled while the gate is pending and after a `retake`. After `gate.retakesBeforeOverride` (2) retakes, "Use this photo anyway" appears and the result is saved as `override`. Engine refusals (`NO_FACE_DETECTED`, `IMAGE_UNPARSEABLE`, `IMAGE_TOO_SMALL`, `IMAGE_DIMENSIONS_TOO_LARGE`, `IMAGE_TOO_LARGE`) map to named retake copy.
- **Persistence (O-2).** `captureQuality` (`schemaVersion: 1`, `assertedBy: "client"`) goes as a form field. The route caps it at 8,000 chars, validates it with a strict zod schema (`lib/capture-quality/schema.ts`), requires the request's capture method, plain-identifier `measured` keys and a verdict that agrees with its checks, then stores it on the record. Anything invalid is dropped; the scan still succeeds. The background recovery request carries it too. It is never mapped into skinstate-1, whose `quality.*` stays null.
- **C02.** `lib/comparability.ts`: `comparabilityKey`, `compareKeys`, `compareStates`. Output is `comparable` or `not_comparable` with named reasons in a fixed order. No numbers, percentages or direction. Today every real pair gives `not_comparable` with at least `quantity_not_validated` (empty table) and `engine_build_unknown` (skinstate-1 maps `engine.build` to null).

Notes for merge:
- **Consent state moved** from two `useState`s in PhotoCapture into the pure reducer in `lib/capture-quality/gate.ts`. Behaviour is unchanged: both boxes start unchecked, every retake clears both, neither is written to the draft, copy still comes from `lib/consent.ts`. The privacy lane should know.
- **`app/api/skin-scan/route.ts`** has two import lines at the top of the file, and `persistScanAnalysis` (private, same file) gained one optional `captureQuality` parameter. Both are outside "the call and the form fields it reads" (disclosed in design §3). Privacy will see a small conflict near the imports when it rebases.
- **Files added beyond design §3**, both within owned paths: `lib/capture-quality/schema.ts` (server-side validation) and `tests/capture-persist.test.ts` (route-level drop cases).
- **Threshold choices** (all provisional): `resolution.minShortSidePx` = 360 so a 640×360 webcam passes; blur minimum 60 (native) and 30 (canvas).

## 2. Test results

Final run, after the last code commit (`9ec59f3`):
- `npm run test:local`: exit 0.
  - Unit pass (no emulators): 31 files passed, 3 skipped; 372 tests passed, 26 skipped.
  - Seeds: `seed-local: 2 users, 3 scans each`, `seed-lane-capture: 6 scanAnalyses for seed-user-ravi`.
  - Rules and e2e against the stack: 3 files, 26 tests passed (includes `tests/capture.e2e.test.ts`).
- `npm run typecheck`: clean. `npm run lint`: no warnings or errors.
- `npm run build`: exit 0.
- Every step ran unit tests, typecheck and lint before its commit. The full `test:local` also ran at S6 and S9, both exit 0.

New tests: `capture-settings`, `capture-retake`, `capture-exposure`, `capture-blur`, `capture-resolution`, `capture-gate`, `capture-api-code`, `capture-persist`, `comparability`, `comparability-wording`, and `capture.e2e`.

## 3. What the verifier found and what was fixed

A verifier agent with a fresh view checked the code against the design and the decisions. Verdict: **FAIL** on one defect; every decision item otherwise passed.

| # | Finding | Fixed |
|---|---|---|
| D1 (medium) | `measured` keys were only length-checked. A key like `__x__` passed zod and made Firestore refuse the whole analysis record and its retry (against D-03a). | Yes, `9ec59f3`: keys must match `^[A-Za-z][A-Za-z0-9]{0,31}$`; tests for a reserved key and an empty key. |
| D2 (low) | The server did not check that a stored verdict agrees with its checks. | Yes, `9ec59f3`: schema refinement for reason-iff-fail, `pass`/`retake`/`override`/`unchecked` rules and reason order; 8 test rows. |
| D3 (low) | Design §4 listed single reasons for "pipeline versions differ" and "unknown fieldPath"; code also adds `quantity_not_validated` (per §2.7). | Yes, `484af75`: the design text was corrected. The code was right. |
| D4 (low) | The dashboard retry drops `quality` and `captureQuality`, and re-sends a photo the engine already refused. | Request to routine (part 4). |
| Unverified | No `npm run build`, and no seed/e2e after S11. | Both re-run after the fixes (part 2), both green. |

Nits left as they are (all fail closed or are cosmetic): hist-clip fields are not comparability fields; `captureQuality` skips the nested-array guard (the schema has none); blur reports `frame_empty` for a frame under 3×3; `retakeCount` resets if the step remounts; a region missing from a state counts as `absent_region`; `compareKeys` throws on keys for different fields; the seed uses `.set()` on the emulator only.

## 4. Requests to other lanes or to main

**routine** (owns `components/skin-check/SkinCheckDashboard.tsx`):
1. When `scan.status === "error"` and `scan.retakeReason` is set, show the existing message with a "Retake photo" action, and do not offer "retry" for that same photo: the engine already refused it. PhotoCapture already sets the message text.
2. The dashboard retry (`runSkinScan` call, around lines 108-128) should pass `captureQuality: scan.quality` and carry `quality: scan.quality` into the success and error states it builds. Otherwise a retried record has no `captureQuality`, and the draft loses it.

**privacy:** no change needed. For awareness: consent state now lives in the reducer (part 1, notes for merge), and two capture import lines sit at the top of `route.ts`.

**main session / owner:**
1. SkinState contract amendment naming `captureMethod`, `persistAttempt` and `captureQuality` as client-asserted (see the D-26 row below).
2. A new contract version that maps `engine_build`. Until then C02 can never say `comparable` for real data.
3. LONGITUDINAL_METHOD §3 and the capture brief: say that steps 2 and 5 (quality gate in comparability) stay unmet until a server-side quality producer exists (Q-2).
4. `firestore.rules`: no request.
5. No new npm dependency was added.

## 5. Proposed tracker rows

| Proposed row | Content |
|---|---|
| D-26 amendment (owner change, O-1 = A) | `captureMethod` stays in the skinstate comparability key, marked client-asserted. The contract amendment names `captureMethod`, `persistAttempt` and `captureQuality` as client-asserted, and states the bound: a forged `captureMethod` can only merge two capture paths, while every other key part and the validated-quantity table still apply. |
| Server-side capture quality (O-3 = C follow-up) | Derive pose, distance (face scale) and framing on the server from the engine's own mediapipe face landmarks, as a separately versioned server-side quality producer. This is the only route by which quality can enter comparability (Q-2). Engine work needs approval under D-18. |
| R05 thresholds | Replace the provisional capture-quality settings with values from the R05 real-device sweep; bump `settingsVersion`. |
| Dashboard retake action and retry quality (routine) | Part 4, requests 1 and 2. |
| C01 / C02 status | C01: built and tested on the local stack, except the four landmark checks (S10, skipped by O-3). C02: key-based comparability built, fails closed; blocked from saying `comparable` on real data by C05-C07 and the `engine_build` mapping. |

## 6. Commits

```
484af75 docs(lanes): capture design §4 reasons match §2.7 (verifier finding)
9ec59f3 fix(capture): drop captureQuality with Firestore-unsafe keys or an inconsistent verdict
94512b7 fix(capture): comparability key per D-26 (O-1 = A, captureMethod client-asserted)
747df17 feat(capture): persist client capture quality
d29253a feat(capture): surface scan error codes as retake reasons
1f053cf feat(capture): retake loop in PhotoCapture
9811c22 chore(capture): local seed for comparability pairs
afb7fe2 feat(capture): key-based comparability (C02), fails closed
3acb41d feat(capture): capture gate and retake reducer
e45dcab feat(capture): blur and resolution checks
da6ebfb feat(capture): exposure check
88a7505 feat(capture): quality types, provisional settings, retake reasons
8ee4372 docs(lanes): capture design approved, owner decisions O-1..O-5, Q-1, Q-2
```

Not pushed. The tracker was not edited.
