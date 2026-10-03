# Capture lane design: C01 capture quality gate, C02 comparability

Branch `lane/capture`, worktree `../skin-check-capture`. The rules are in [README.md](README.md), the brief in [capture.md](capture.md).

Status: **design only. No app code until the owner approves this design (README rule 3).** "Needs no owner decision" in part 6 means no decision beyond approving this design.

Sources read: CLAUDE.md, DECISION_LOG (D-03, D-03a, D-12, D-13, D-18, D-23, D-26), SKIN_STATE_CONTRACT_FINAL §7–§8, LONGITUDINAL_METHOD §3, `docs/research/measurement-validation/PHASE_0_RESULTS.md` §3–§4, and the tracker rows C01, C02, C07 and R05. Code read: `lib/skin-state.ts`, `lib/scan-analysis-record.ts`, `app/api/skin-scan/route.ts`, `components/skin-check/inputs/PhotoCapture.tsx`, `hooks/useCameraStream.ts`, `lib/api.ts`, `types/skin-scan.ts`, `lib/firebase/skin-checks.ts`.

---

## 1. What will be built

**C01: guided capture quality gate.** After the user takes a photo, and before "Analyze my skin" can send it, the app runs a few checks on the exact bytes it is about to send to the engine. It runs them on the ~1280 px JPEG (`capturedBlobRef`), not the full-size original, so the checks describe the image whose hash is `inputSha256`. Without any new library, the checks are:
- **exposure**, built first because Phase 0 found it is the largest risk: how much of the frame is crushed to black or blown to white, and the overall brightness;
- **blur**: the sharpness of the frame;
- **resolution**: whether the image is big enough for the engine.

Each check returns `pass`, `fail` or `not_measured`. A check that could not run is `not_measured`, never `pass`. Pose, expression and framing need a face-landmark library, and none is installed. They stay `not_measured` until the owner decides on a dependency (decision O-3).

If a check fails, the user sees one named retake reason with a short instruction ("Your photo is too dark. Face a window or a lamp"). The Analyze button stays blocked until they retake. Whether a "use this photo anyway" path exists is decision O-4. Retake keeps today's behaviour: both consent boxes are cleared and the scan state resets.

The engine's own refusals (`NO_FACE_DETECTED`, `IMAGE_UNPARSEABLE`, `IMAGE_TOO_SMALL`, `IMAGE_DIMENSIONS_TOO_LARGE`) map to the same retake-reason list. Today the client throws the server's error code away (`lib/api.ts:135` throws a bare "Failed to analyze photo."). The lane passes the code through so the user is told why.

The gate is a guard against bad photos. It does not make two photos comparable. Phase 0 showed a half-stop exposure change (0.5 EV) moves native L\* by 5.9–9.0 units, about as much as the whole −8 L\* change the study injected. A photo that passes the gate is therefore "not obviously broken", nothing more.

**C02: per-scan comparability.** A pure function answers one question: can field F in region R of scan A be compared with the same field and region of scan B? The answer is `comparable` or `not_comparable`, always with named reasons. It never outputs a difference, a percentage or a direction. It reads only SkinState (`skinstate-1`) and never the raw record, because trust comes from the SkinState path (D-23, D-26). It has two parts:
- `comparabilityKey(state, field, region)` pulls the frozen key out of one SkinState;
- `compareKeys(a, b)` decides on two keys.

**Today every real pair returns `not_comparable` with reason `engine_build_unknown`.** skinstate-1 always maps `engine.build` to `null` (`lib/skin-state.ts:301`), even though the raw record now stores `engine_build`. Only a new contract version can change that, and the lane may not edit `lib/skin-state.ts`. This is correct behaviour, not a bug: the contract says a null key part means not comparable (§7.1). Per-metric noise thresholds stay `unknown` until C07 produces a calibration table. The function has a slot for that table and fails closed when it is missing.

**Seed.** `scripts/seed-lane-capture.ts` writes a few synthetic `scanAnalyses` records to the local emulator only. They are pairs that differ by pipeline version, by statsPath and by an absent region, so the local UI and the e2e test have data to read. No real faces.

---

## 2. Data shapes

All new types live in `lib/capture-quality/types.ts` and `lib/comparability.ts`. `SkinScanResultSchema` (the engine contract) and `lib/skin-state.ts` are not changed.

### 2.1 Frame input for checks (pure, no DOM)

```ts
interface Frame {
  width: number;               // pixels
  height: number;
  data: Uint8ClampedArray;     // RGBA, length = width*height*4 (ImageData layout)
}
```
In the browser, the frame comes from `createImageBitmap(capturedBlob)` drawn to a canvas, then `getImageData`. Tests build synthetic frames directly. vitest runs in node and has no canvas, and adding one would be a new dependency.

### 2.2 Settings (every number named, every number provisional)

```ts
interface QualitySetting {
  id: string;                  // e.g. "exposure.clipLowFracMax"
  value: number;
  unit: string;                // "fraction of pixels", "8-bit luma", "px", "variance"
  status: "provisional";       // the only allowed value until R05 / C07 data exists
  source: string;              // why this value: "placeholder; replace after R05 exposure sweep"
}

const CAPTURE_QUALITY_SETTINGS: Record<SettingId, QualitySetting>;
```

| Setting id | Meaning | Status |
|---|---|---|
| `exposure.clipLowLuma` | luma at or below this counts as crushed black | provisional |
| `exposure.clipHighLuma` | luma at or above this counts as blown white | provisional |
| `exposure.clipLowFracMax` | largest allowed fraction of crushed pixels | provisional |
| `exposure.clipHighFracMax` | largest allowed fraction of blown pixels | provisional |
| `exposure.meanLumaMin` / `exposure.meanLumaMax` | allowed band for mean luma | provisional |
| `blur.laplacianVarMin` | smallest allowed variance of the Laplacian on luma | provisional |
| `resolution.minShortSidePx` | smallest allowed short side | provisional |
| `gate.maxSoftOverrides` | only if O-4 allows "use anyway": retakes before the override appears | provisional |

- No value is written into this document. The values are chosen in step S2, from the synthetic test frames and the Phase 0 sweep levels, and each one is labelled `provisional` with its source.
- The R05 real-device exposure sweep replaces them later. That needs no code change, only a new `settingsVersion`.
- A test fails if any setting has a status other than `provisional`.

### 2.3 Check result

```ts
type CheckId = "exposure" | "blur" | "resolution" | "pose" | "expression" | "framing";
type CheckStatus = "pass" | "fail" | "not_measured";

interface CheckResult {
  id: CheckId;
  status: CheckStatus;
  measured: Record<string, number> | null;   // e.g. { clipLowFrac: 0.03, clipHighFrac: 0.0, meanLuma: 118 }; null when not_measured
  retakeReason: RetakeReason | null;         // non-null exactly when status === "fail"
  notMeasuredWhy?: "no_landmark_model" | "decode_failed" | "frame_empty";
}
```

### 2.4 Retake reasons (one named enum)

```ts
type RetakeReason =
  // on-device
  | "too_dark"            // exposure: clipLowFrac or meanLuma below band
  | "too_bright"          // exposure: clipHighFrac or meanLuma above band
  | "blurry"              // blur
  | "too_small"           // resolution
  | "face_turned"         // pose (only once O-3 is approved)
  | "expression_not_neutral" // expression (only once O-3 is approved)
  | "face_not_centred"    // framing (only once O-3 is approved)
  // from the engine via /api/skin-scan
  | "no_face_found"       // NO_FACE_DETECTED
  | "unreadable_image"    // IMAGE_UNPARSEABLE
  | "engine_too_small"    // IMAGE_TOO_SMALL
  | "engine_too_large";   // IMAGE_DIMENSIONS_TOO_LARGE / IMAGE_TOO_LARGE
```

Each reason has one line of user copy in `RETAKE_COPY: Record<RetakeReason, string>`. The copy is instruction only, with no number, score or comparison in it. Every rejected capture carries exactly one reason. When several checks fail, the first in the order `exposure > blur > resolution > pose > framing > expression` is shown. All failed reasons are kept in the result.

### 2.5 Gate result (one per captured photo)

```ts
interface CaptureQuality {
  producer: "capture-quality-web";     // the "separately versioned quality producer" (contract §7.2)
  producerVersion: "cq-1";
  settingsVersion: string;             // e.g. "cq-settings-0-provisional"
  assertedBy: "client";                // D-26: never authoritative
  frame: { width: number; height: number };
  checks: CheckResult[];               // always all six ids, in fixed order
  verdict: "pass" | "retake" | "override"; // "override" only if O-4 allows it
  retakeReasons: RetakeReason[];       // empty when verdict is "pass"
  retakeCount: number;                 // retakes in this attempt before this photo
}
```

The rules for this shape:
- Separate from the engine output and from SkinState. It **never fills skinstate-1's `quality` block**: the contract fixes those fields to `null`, and filling them is a new contract version.
- `verdict: "pass"` means only "the gate did not reject this photo". C02 does not read it (see 2.7).

Where it is kept:
- `SkinScanState` (`types/skin-scan.ts`) gets an optional `quality?: CaptureQuality` on the `success` and `error` variants. The `error` variant also gets an optional `retakeReason?: RetakeReason`.
- The draft scan state (`lib/skin-check-draft.ts`) gets an optional `quality`. It is dropped on retake.
- Persisting it to Firestore is decision O-2. Until then it lives only in memory and in the draft.

### 2.6 If O-2 is approved: persisted shape

- **Option A, `scanAnalyses`:**
  - a flat optional field `captureQuality: CaptureQuality` on the record, written by `buildScanAnalysisRecord` from a form field;
  - the server validates the shape with zod and **drops** it if invalid, never rejecting the scan (D-03a);
  - `schemaVersion` stays **1**, because `toSkinState` rejects any other value (`lib/skin-state.ts:173`);
  - the field name does not end in `_json`, because `toSkinState` refuses records with such keys.
- **Option B, `skinChecks`:**
  - one optional field `capture: { quality: CaptureQuality }` on the client-written skinChecks doc (README shared-file plan);
  - no `firestore.rules` change is needed, because skinChecks accepts additional fields today.

### 2.7 Comparability shapes

```ts
type ColourPath = "corrected" | "native";

interface ComparabilityKey {
  contractVersion: "skinstate-1";
  fieldPath: string;                 // e.g. "colour.native.lStarMean", "texture.lbpEntropy"
  region: SkinStateRegionKey;
  pipelineVersion: string | null;
  engineBuild: string | null;        // always null under skinstate-1
  colourPath: ColourPath | null;     // null for non-colour fields
  statsPath: "corrected" | "both";
  inputVariant: string | null;
  captureMethod: "native" | "canvas" | null;
  regionStatus: "available" | "absent_region";
  lowPixelCount: boolean;
}

type NotComparableReason =
  | "engine_build_unknown"           // either key has engineBuild null
  | "engine_build_differs"
  | "pipeline_version_unknown" | "pipeline_version_differs"
  | "input_variant_unknown" | "input_variant_differs"
  | "capture_method_unknown"         // either side null
  | "capture_method_differs"         // see O-1 and open question Q-1
  | "native_stats_missing"           // native field, statsPath !== "both" on either side
  | "region_absent"                  // absent_region on either side
  | "region_low_pixel_count"         // lowPixelCount on either side
  | "lr_cheek_cross_capture_method"  // cheek_image_left/right across methods (METHOD §3)
  | "field_not_defined"              // fieldPath not a skinstate-1 field
  | "contract_version_differs"
  | "different_user";                // analysisRef uid differs

type ComparabilityVerdict =
  | { verdict: "comparable"; key: ComparabilityKey; noiseThreshold: { status: "unknown"; calibrationId: null } }
  | { verdict: "not_comparable"; reasons: NotComparableReason[] };   // at least one reason, all collected
```

How the functions behave:
- `comparabilityKey(state: SkinState, fieldPath, region): ComparabilityKey`. Pure; copies values and never infers one.
- `compareKeys(a, b): ComparabilityVerdict`. Pure; every null key part gives a reason.
- `compareStates(a, b, fieldPath, region) = compareKeys(comparabilityKey(a, …), comparabilityKey(b, …))`, plus the different-user check.
- There is no "comparable-with-caveats" verdict. See Q-1.
- `noiseThreshold` is always `{ status: "unknown", calibrationId: null }` until C07 delivers a versioned table keyed on field × region × tone band × engine build. That is a later step, not in this lane.

---

## 3. Files

### Add (all owned by capture)

| File | What |
|---|---|
| `lib/capture-quality/types.ts` | Types from §2.1–2.5 |
| `lib/capture-quality/settings.ts` | `CAPTURE_QUALITY_SETTINGS`, `settingsVersion` |
| `lib/capture-quality/exposure.ts` | `checkExposure(frame, settings)`: luma histogram, clip fractions, mean |
| `lib/capture-quality/blur.ts` | `checkBlur(frame, settings)`: variance of a 3×3 Laplacian on luma |
| `lib/capture-quality/resolution.ts` | `checkResolution(frame, settings)` |
| `lib/capture-quality/gate.ts` | `runCaptureGate(frame, ctx): CaptureQuality`. Runs all checks, puts in `not_measured` for pose, expression and framing, and picks the verdict and primary reason |
| `lib/capture-quality/retake.ts` | `RetakeReason`, `RETAKE_COPY`, `retakeReasonFromServerCode(code)` |
| `lib/capture-quality/frame.ts` | Browser-only: `frameFromBlob(blob): Promise<Frame>` (createImageBitmap + canvas). Kept apart so the pure modules never import DOM |
| `lib/comparability.ts` | §2.7 |
| `tests/capture-exposure.test.ts`, `tests/capture-blur.test.ts`, `tests/capture-resolution.test.ts`, `tests/capture-gate.test.ts`, `tests/capture-retake.test.ts`, `tests/capture-settings.test.ts` | §4 |
| `tests/comparability.test.ts`, `tests/comparability-wording.test.ts` | §4 |
| `tests/capture.e2e.test.ts` | Only if O-2 is approved: round trip through the local stack |
| `tests/capture-fixtures.ts` | Synthetic frame builders (flat, gradient, checkerboard, clipped). No real faces |
| `scripts/seed-lane-capture.ts` | §1 |

### Change

| File | Owner | Change |
|---|---|---|
| `components/skin-check/inputs/PhotoCapture.tsx` | capture | Run the gate after each capture, on both paths. Show the retake reason. Block Analyze on `retake`. Map server codes to retake reasons in the existing `.catch`. Consent behaviour is unchanged: the two boxes are still reset on retake, and the copy still comes from `lib/consent.ts` |
| `hooks/useCameraStream.ts` | capture | No change planned. A live exposure hint on the desktop preview is out of scope (§5) |
| `lib/scan-analysis-record.ts` | capture | Only if O-2 = A: an optional `captureQuality` in `ScanAnalysisMeta`, written as is. `schemaVersion` stays 1 |
| `types/skin-scan.ts` | shared, additive | Optional `quality?` on the success and error variants, optional `retakeReason?` on error. `SkinScanResultSchema` untouched |
| `lib/api.ts` | shared, additive | 1) `requestSkinScan` reads `code` from a non-OK JSON body and passes it to the existing `ApiError(status, message, code)`. Same status and message; callers that ignore `code` see no change. 2) Add `isRetakeError(err)`. 3) Only if O-2 = A: optional `captureQuality` on `runSkinScan`, appended as a form field |
| `app/api/skin-scan/route.ts` | shared, capture part only | Only if O-2 = A: read the optional `captureQuality` form field after `formData`, validate it, and pass it to `persistScanAnalysis`. An invalid value is dropped, never rejected. The preamble is untouched |
| `lib/skin-check-draft.ts` | shared, additive | Optional `quality` on the stored scan state |
| `lib/useSkinCheckFlow.ts` | shared, scan-state part only | Carry `quality` through the photo → `SkinScanState` path and drop it on the retake reset. Answers, sections and age gate are untouched |
| `lib/firebase/skin-checks.ts` | shared, additive | Only if O-2 = B: one optional `capture` field |
| `lib/skin-check-session-context.tsx` | shared | No change expected. Touched only if the dashboard request below needs `quality` in context |

### Requests to other lanes (go into `capture-report.md`; not edited here)

- **routine** (owns `SkinCheckDashboard.tsx`): when `scan.status === "error"` and `scan.retakeReason` is set, show the existing message plus a "Retake photo" action. The message text is already set by PhotoCapture, so without this change the dashboard still shows the right words.
- **owner / main session**: none for `firestore.rules`. Option B needs no rule change, and Option A is server-written.

---

## 4. Tests

All tests are vitest unit tests that run in `npm run test:local`, except the e2e file. They use synthetic frames only.

**Exposure (`capture-exposure.test.ts`)**
- A mid-grey frame passes.
- An all-black frame fails with `too_dark`; an all-white frame fails with `too_bright`.
- Boundary: clipped fraction exactly at `clipLowFracMax` passes, one pixel over fails. The same for high, and for the mean band edges.
- A frame that is half black and half white fails. The reason is the larger clip fraction; a tie goes to `too_dark`.
- Failure cases:
  - a zero-size frame gives `not_measured` (`frame_empty`), never `pass`;
  - a `data` length that does not equal `width*height*4` gives `not_measured`;
  - alpha is ignored.

**Blur (`capture-blur.test.ts`)**
- A checkerboard passes.
- A flat frame and a Gaussian-blurred checkerboard fail with `blurry`.
- Boundary: variance at `laplacianVarMin` passes, below it fails.
- A frame smaller than 3×3 gives `not_measured`.

**Resolution (`capture-resolution.test.ts`)**
- Short side at the minimum passes; one pixel below fails with `too_small`.

**Gate (`capture-gate.test.ts`)**
- Always six checks, in fixed order.
- pose, expression and framing are `not_measured` with `no_landmark_model`.
- The verdict is `pass` only if no check is `fail`. `not_measured` never makes `pass` on its own: with every check `not_measured`, the verdict is still `pass`, but the result records it, and a test pins that behaviour so it is visible.
- When several checks fail, the primary reason follows the fixed order and all reasons are listed.
- `assertedBy` is always `"client"`, `producerVersion` is `cq-1`, and `settingsVersion` matches the settings module.
- Every `fail` has a non-null `retakeReason`, and every non-fail has a null one.

**Settings (`capture-settings.test.ts`)**
- Every setting has `status: "provisional"` and a non-empty `source`.
- Every number used by a check is read from settings. A grep-style test checks that `lib/capture-quality/{exposure,blur,resolution}.ts` contain no numeric literal other than 0, 1, 2, 3, 4 and 255.

**Retake (`capture-retake.test.ts`)**
- Every `RetakeReason` has copy.
- Copy has no digit (`\p{Nd}`) and no comparative or causal word (the same lexicon as the wording test below).
- `retakeReasonFromServerCode` maps the four engine codes.
- Failure case: an unknown code, `SCAN_TIMEOUT`, `SCAN_CAPACITY_EXCEEDED` or `AUTH_REQUIRED` gives `null`. Not a photo problem, so no retake is asked.
- The retake loop, tested on the pure state reducer extracted from PhotoCapture:
  - a `retake` verdict blocks the scan request;
  - a retake clears both consent booleans and the quality result, as today;
  - after a retake, a passing photo unblocks Analyze.

**api.ts**, extended in a new file `tests/capture-api-code.test.ts` (owned prefix):
- A 400 with `{code:"NO_FACE_DETECTED"}` throws an `ApiError` whose `code` is that value and whose message is unchanged.
- A non-JSON error body still throws as before.
- 401 still gives `auth/required`.

**Comparability (`comparability.test.ts`)**
- A table of key pairs with the expected verdict and exact reasons:
  - identical keys with non-null build → `comparable`, noise `unknown`;
  - build null on either side → `engine_build_unknown`;
  - builds differ → `engine_build_differs`;
  - pipeline differs; variant differs;
  - capture method null → `capture_method_unknown`;
  - capture method differs → `capture_method_differs`;
  - native field with `statsPath: "corrected"` → `native_stats_missing`;
  - absent region → `region_absent`;
  - low pixel count → `region_low_pixel_count`;
  - `cheek_image_left` with native vs canvas → both `capture_method_differs` and `lr_cheek_cross_capture_method`;
  - an unknown fieldPath → `field_not_defined`;
  - different uid → `different_user`.
- Several failures at once → all reasons are listed, in a fixed order.
- **Real SkinState pairs** built with `toSkinState` from `tests/synthetic-scan.ts` give `not_comparable` with `engine_build_unknown`, even when `captureMethod` is the same. This pins today's honest answer.
- Purity: the same input gives deep-equal output, and the inputs are not mutated.

**Wording (`comparability-wording.test.ts`)**
- Serialise every verdict from the table. No output contains `%`, a digit next to a change word, or any of: improve, worse, better, reduce, increase, decrease, because, caused, due to, effect, works.
- No exported function returns a number derived from two scans.

**e2e (`capture.e2e.test.ts`, only if O-2 is approved)**
- Against the local stack, post a synthetic scan with a `captureQuality` field.
- Read back `scanAnalyses` (A) or `skinChecks` (B) and check the field round-trips unchanged.
- `toSkinState` still returns `kind: "skinstate"` with `quality.*` still null.
- A malformed `captureQuality` is dropped and the scan still returns `ok: true`.

---

## 5. Not built in this lane

- **No engine change** (D-18). This includes returning a build or digest; the C12 path is separate.
- **No change to `lib/skin-state.ts`** or to the skinstate-1 contract. No `skinstate-2`. Mapping `engine_build` and filling `quality.*` is a new contract version, owned by the main session.
- **No change output of any kind:** no deltas, %, trends, baselines, tiers or "different from your starting checks" copy (D-12, D-13; LONGITUDINAL_METHOD tier 1 needs C07).
- **No noise thresholds.** `noiseThreshold` is always `unknown` until C07.
- **No pose, expression or framing checks** without O-3. No new npm dependency without approval.
- **No live, per-frame exposure overlay** on the desktop preview. The checks run once, on the captured frame. A live hint can be added later on the same pure functions.
- **No device-family detection** and no use of EXIF or device model. The contract keeps `quality.device` null.
- **No `firestore.rules` change.**
- **No dashboard edit.** That is a request to routine.
- **No consent change.** Consent belongs to the privacy lane; the reset-on-retake stays as is.
- **Not used for comparability:** the client gate result. It is client-asserted (D-26).

---

## 6. Steps

Every step ends with `npm run test:local` green, plus typecheck and lint, and one commit. All steps wait for the owner to approve this design.

**Needs no further owner decision**

| Step | Work | Tests | Commit |
|---|---|---|---|
| S1 | `lib/capture-quality/types.ts`, `settings.ts` (values `provisional`, with sources), `retake.ts` (enum, copy, server-code map) | capture-settings, capture-retake (enum, copy, map) | `feat(capture): quality types, provisional settings, retake reasons` |
| S2 | `exposure.ts` (first: the dominant Phase 0 risk), plus synthetic frame fixtures | capture-exposure | `feat(capture): exposure check` |
| S3 | `blur.ts`, `resolution.ts` | capture-blur, capture-resolution | `feat(capture): blur and resolution checks` |
| S4 | `gate.ts`: all six checks, pose, expression and framing `not_measured`, verdict, primary reason | capture-gate | `feat(capture): capture gate over pure checks` |
| S5 | `lib/api.ts`: pass the server `code` into `ApiError`; `isRetakeError` | capture-api-code | `feat(capture): surface scan error codes to the client` |
| S6 | `lib/comparability.ts`: key extractor, `compareKeys`, `compareStates`, noise `unknown` | comparability, comparability-wording | `feat(capture): key-based comparability (C02), fails closed` |
| S7 | `scripts/seed-lane-capture.ts`: synthetic pairs | Seed runs inside `test:local`; comparability test reads seeded shapes | `chore(capture): local seed for comparability pairs` |

**Needs an owner decision**

| Step | Work | Blocked by | Commit |
|---|---|---|---|
| S8 | PhotoCapture wiring: `frame.ts`; run the gate on both paths; block Analyze; retake copy; map server codes in `.catch`; `quality` and `retakeReason` on `SkinScanState`, the draft and the flow's scan state | **O-4** (hard or soft block) | `feat(capture): retake loop in PhotoCapture` |
| S9 | Persist `CaptureQuality` (A: record field plus route form field; B: `skinChecks.capture`) and `capture.e2e.test.ts` | **O-2** | `feat(capture): persist client capture quality` |
| S10 | Pose, expression and framing checks with a landmark model | **O-3** (dependency) | `feat(capture): pose, expression, framing checks` |
| S11 | Remove `captureMethod` from the key, or mark it client-asserted, per D-26's outcome. If the owner keeps it, S11 is empty | **O-1** | `fix(capture): comparability key per D-26` |
| S12 | `capture-report.md`: what was built, commits, test results, requests to routine, open questions | none (last) | `docs(lanes): capture report` |

S6 is fully buildable now. If O-1 later removes `captureMethod`, only the extractor and a few table rows change.

---

## 7. Owner decisions

### O-1. Can the browser's own claim about how the photo was taken be part of the comparability check? (D-26 open item)

**In plain words.**
- The browser tells the server whether the photo came from the phone camera app (`native`) or the desktop webcam (`canvas`). The server stores what the browser says without checking it.
- The frozen contract uses this value as part of the comparability check: two scans taken different ways are never compared.
- D-26 says the browser is never trusted for measured skin state. So either we accept this one unchecked value in the check, or we stop using it.
- `persistAttempt` ("was this a background retry?") is also browser-sent, but it is not in the comparability key. It only affects which record is chosen.

**Options.**
- **A. Keep it in the key, marked client-asserted.** A new contract version records it as client-asserted. Nothing measured is forged: the value only labels how the photo was taken.
- **B. Drop it from the key** until the server can tell for itself (for example from EXIF in the original, or from image dimensions). More scans would pass the check, including desktop-vs-phone pairs, which Phase 0 suggests differ a lot.
- **C. Stop persisting it.** Simplest, but we lose the stratification the dataset needs.

**Recommendation: A.**
- In the key, an honest value can only remove pairs, never add them. A forged value can make a webcam scan and a phone scan look like the same method. The pair must still match on engine build, pipeline version and input variant, and no change is ever shown before C07. So the damage is bounded, and the contract amendment should say so.
- Dropping the value (B) removes the only signal that separates the two very different camera paths. Every honest desktop-vs-phone pair would then pass this part of the check.
- A keeps the most conservative behaviour while keeping the data.

**Blocks:** S11 only. **Can start without it:** S1–S10. S6 is built to the frozen contract (captureMethod in the key) and adjusted in S11 if needed.

### O-2. Do we save the on-device quality result, and where?

**In plain words.** The app will compute "was this photo too dark, too blurry" for every capture. Today nothing like that is saved. If we save it, it can later explain why a scan looked odd, and the R05 exposure study can use it to set real thresholds. The analysis record is immutable, so a badly shaped field saved there stays forever.

**Options.**
- **A. On the server-written analysis record (`scanAnalyses`)**, as an optional field marked client-asserted.
  - It sits next to the exact bytes it describes (same `inputSha256`).
  - The schema version stays 1.
  - The server validates the shape and drops it if invalid.
- **B. On the browser-written questionnaire record (`skinChecks.capture`).**
  - It is easy to change later.
  - It is written at save time, not scan time, so it is lost when the user does not finish the questionnaire.
  - It is not tied to the exact image hash.
- **C. Don't save it.** Show it to the user only.

**Recommendation: A.** The quality result describes one exact image. The only record keyed on that image's hash is the analysis record. Scan-time writing also survives abandoned questionnaires, which is the D-02 lesson. The risk of a permanent wrong shape is handled by:
- the shape being fixed in this design (§2.5);
- `producerVersion` letting a later shape coexist;
- the server dropping anything that does not validate.

**Blocks:** S9. **Can start without it:** S1–S8, S10–S12.

### O-3. Can we add a face-landmark library for the pose, expression and framing checks?

**In plain words.** Exposure, blur and size can be checked by counting pixels. "Is the face turned?", "is the person smiling?" and "is the face centred?" need a model that finds the face's key points in the browser. No such library is installed, and the lane rules forbid adding one without approval. Until then, those three checks report "not measured". The engine still refuses photos with no face at all (`NO_FACE_DETECTED`), but only after upload.

**Options.**
- **A. `@mediapipe/tasks-vision` (Face Landmarker).**
  - The same model family as the engine (mediapipe face mesh).
  - Runs in the browser with WASM.
  - The model file is a few MB, loaded only on the capture step.
- **B. The browser's built-in `FaceDetector` (Shape Detection API).** No dependency, but it is not available on iOS Safari or most browsers, so most users would get `not_measured` anyway.
- **C. None for now.** Ship exposure, blur and resolution only.

**Recommendation: C now, A as a follow-up.**
- Exposure is the dominant measured risk. The pixel checks cover it with no new dependency.
- A adds a few MB of download to every capture and a model version that must be pinned and recorded. Decide that once the R05 sweep shows how often pose actually fails in real captures.
- If chosen, A should be pinned to the engine's mediapipe line (0.10.x), and its version recorded in `producerVersion`.

**Blocks:** S10. **Can start without it:** everything else.

### O-4. When a check fails, must the user retake, or can they continue anyway?

**In plain words.** If the photo is too dark, we can either refuse to analyse it until they retake (hard block), or warn them and offer "use this photo anyway" after a set number of tries (soft block). A hard block is safer for data quality, but on a poor phone camera in a dim room a user may never pass and gives up. The thresholds are still provisional guesses, so a hard block might reject good photos.

**Options.**
- **A. Hard block.** Analyze stays disabled until every measured check passes.
- **B. Soft block.** Analyze stays disabled on the first failure. After `gate.maxSoftOverrides` retakes (a provisional setting), a "Use this photo anyway" button appears. The result is recorded as `verdict: "override"`.
- **C. Warn only.** Show the reason; never block.

**Recommendation: B.**
- The thresholds are provisional until R05, and a hard block on guessed numbers can lock real users out.
- An override is recorded as `override`, never as `pass`, so the data stays honest.
- Comparability does not read the gate result anyway (D-26), so an override cannot make a pair comparable.

**Blocks:** S8. **Can start without it:** S1–S7, S9–S12. S9 can save `verdict` once S8 has merged.

### Blockers outside this lane (C02 can never say "comparable" for real data until these land)

- **A new SkinState contract version that maps `engine_build`.** skinstate-1 hard-codes `engine.build: null`. The raw record already stores `engine_build` from 0.1.6, but the frozen contract cannot read it. This belongs to the main session and the owner (D-23), not the lane. Until it lands, C02 truthfully returns `engine_build_unknown` for every pair.
- **Deploy of 0.1.6 and gate 04 (A12, A13).** Paused under TD-04.
- **C07 noise tables.** Until they exist, `noiseThreshold` stays `unknown`, and no change is ever shown even for a comparable pair.

### Open question to record (not a lane decision)

**Q-1. Capture method: different key, or a caveat?**
- LONGITUDINAL_METHOD §3 step 2 lists a different capture method as "comparable-with-caveats".
- The frozen contract (§7.1) and D-13 put `captureMethod` in the key, which makes it "not comparable".
- This design follows the frozen contract: a difference means not comparable, and there is no caveats tier.
- The owner may want LONGITUDINAL_METHOD corrected to match.
