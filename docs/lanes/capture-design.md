# Capture lane design: C01 capture quality gate, C02 comparability

Branch `lane/capture`, worktree `../skin-check-capture`. Read [README.md](README.md) for the lane rules and [capture.md](capture.md) for the brief.

**Status: approved by the owner on 2026-10-03, with the decisions in part 0.**
- `capture-report.md` links to this file and records the approval (capture.md exit conditions).
- In part 6, "needs no owner decision" means no decision beyond approving this design.

## 0. Owner decisions (2026-10-03)

| Item | Decision | What it means for the build |
|---|---|---|
| O-1 | **A** | `captureMethod` stays in the comparability key and is marked client-asserted (`captureMethodAssertedBy: "client"` on the key). This is an owner change to D-26, which listed only two options. It goes to the tracker as a proposed row (below). |
| O-2 | **A** | The gate result is saved on the server-written `scanAnalyses` record as `captureQuality`, labelled `assertedBy: "client"`. It carries a numeric version field, `schemaVersion: 1` (§2.5). The server drops a value with any other version. |
| O-3 | **C** | No new library. Pose, expression, distance and framing stay `not_measured`. S10 is skipped. Proposed tracker row: derive pose, distance and framing later on the server from the engine's own face landmarks. |
| O-4 | **B** | Soft block. A failed check disables Analyze. After `gate.retakesBeforeOverride` retakes, "Use this photo anyway" appears and the result is saved as `override`. `unchecked` is allowed and saved as `unchecked`. |
| O-5 | **A** | `lib/api.ts` passes the server's error `code` through on a failed scan, as a one-function exception for the capture lane. |
| Q-1 | Follow the frozen contract | A different capture method is `not_comparable` (`capture_method_differs`). There is no "comparable-with-caveats" tier. |
| Q-2 | The browser's quality result never feeds comparability | `lib/comparability.ts` never reads `captureQuality`. Steps 2 and 5 of LONGITUDINAL_METHOD §3 stay unmet until a server-side quality producer exists. |

Build order set by the owner: S1 to S9, then S11 and S12. S10 is skipped (O-3 = C).

**Proposed tracker rows (go into `capture-report.md`; the lane does not edit the tracker)**
- **D-26 amendment (owner change, O-1 = A):** `captureMethod` stays in the skinstate comparability key, marked client-asserted. The SkinState contract amendment names `captureMethod`, `persistAttempt` and `captureQuality` as client-asserted, and states that a forged `captureMethod` can only merge two capture paths, while every other key part and the validated-quantity table still apply.
- **Server-side capture quality (O-3 = C follow-up):** derive pose, distance (face scale) and framing on the server from the engine's own mediapipe face landmarks, as a separately versioned server-side quality producer. That is the only route by which quality can enter comparability (Q-2). Engine work needs approval under D-18.

**Sources read**
- Decisions and specs:
  - CLAUDE.md
  - DECISION_LOG: D-03, D-03a, D-12, D-13, D-18, D-23, D-25, D-26
  - SKIN_STATE_CONTRACT_FINAL §7–§8
  - LONGITUDINAL_METHOD §2–§3
  - `docs/research/measurement-validation/PHASE_0_RESULTS.md` §3–§5
  - tracker rows C01, C02, C07 and R05
- Code:
  - `lib/skin-state.ts`, `lib/scan-analysis-record.ts`, `lib/api.ts`
  - `app/api/skin-scan/route.ts`
  - `components/skin-check/inputs/PhotoCapture.tsx`
  - `hooks/useCameraStream.ts`
  - `types/skin-scan.ts`
  - `lib/firebase/skin-checks.ts`
  - `firestore.rules`
  - `scripts/local-stack.sh`

---

## 1. What will be built

**C01: guided capture quality gate.**

When it runs:
- After the user takes a photo, and before "Analyze my skin" can send it, the app checks the exact bytes it will send to the engine (`capturedBlobRef`), so the result describes the image whose hash becomes `inputSha256`.
- On **mobile** that is the ~1280 px JPEG made from the camera file.
- On **desktop** it is the full webcam canvas frame (`videoWidth × videoHeight`, usually 1280×720). On desktop the same blob is also the stored original.
- The two capture paths give images of different sizes, so a size-dependent setting (blur) has its own value for each path.

What it checks without a new library:
- **exposure**, built first because Phase 0 found it is the largest risk: how much of the frame is crushed to black or blown to white, and the overall brightness;
- **blur**: sharpness of the frame;
- **resolution**: whether the image is big enough for the engine.

How results are reported:
- Each check returns `pass`, `fail` or `not_measured`. A check that could not run is `not_measured`, never `pass`.
- The brief also lists **pose, expression, distance and framing**. These need a face-landmark library, and none is installed. They stay `not_measured` until the owner decides on a dependency (O-3).

What the user sees:
- If a check fails, one named retake reason with a short instruction (for example "Your photo is too dark. Face a window or a lamp.").
- Analyze stays disabled while the checks are still running, and stays blocked after a failure. Whether "use this photo anyway" exists is O-4.
- If exposure itself could not be measured (the image would not decode), the photo is marked `unchecked`, never `pass`.

Retake keeps today's consent behaviour: both consent boxes are cleared. A retake from the committed "done" view also resets the scan state, as `handleRetakeFromDone` does today.

The engine's own refusals map onto the same list of retake reasons:
- `NO_FACE_DETECTED`
- `IMAGE_UNPARSEABLE`
- `IMAGE_TOO_SMALL`
- `IMAGE_DIMENSIONS_TOO_LARGE`
- `IMAGE_TOO_LARGE` (sent by the route's own 5 MB check and by the engine)

Today the client throws the server's error code away (`lib/api.ts:135` throws a bare "Failed to analyze photo."). Passing the code through is a change to a shared file outside capture's allowed part, so it is owner decision O-5.

The gate is a guard against bad photos. It does not make two photos comparable:
- Phase 0 found that half a stop of exposure (0.5 EV) moves native L\* by 5.9–9.0 units. That is about as much as the whole −8 L\* change the study injected.
- A photo that passes is "not obviously broken", nothing more.

**C02: per-scan comparability.**

The question: may field F in region R of scan A be compared with the same field and region of scan B?
- The answer is `comparable` or `not_comparable`, always with named reasons.
- It never outputs a difference, a percentage or a direction.
- It reads only SkinState (`skinstate-1`), never the raw record, because trust comes from the SkinState path (D-23, D-26).

It has three parts:
- `comparabilityKey(state, field, region)` extracts the frozen key;
- `compareKeys(a, b, table)` decides on two keys;
- the **comparable-quantity table**, passed in by the caller.

The table and why it exists:
- LONGITUDINAL_METHOD §2–§3 says the gates apply only to quantities listed in a COMPARABLE table, and that table is **empty today**. A field enters it only after test–retest (C05–C07).
- So "the engine gave a value" and "the value is safe to compare" stay separate. A field that is not in the table gives `quantity_not_validated`, whatever the keys say.
- The production table is an empty constant. Only tests pass in a table with entries. A test checks that no file outside `tests/` passes a `table` argument.

**Today every real pair returns `not_comparable`**, with at least two reasons:
- `quantity_not_validated`, because the table is empty;
- `engine_build_unknown`, because skinstate-1 always maps `engine.build` to `null` (`lib/skin-state.ts:314`). That happens even though the raw record now stores `engine_build` (`lib/scan-analysis-record.ts:78-79`).

Only a new contract version can change the second reason, and the lane may not edit `lib/skin-state.ts`. Both answers are correct behaviour: the contract says a null key part means not comparable (§7.1). Per-metric noise thresholds stay `unknown` until C07.

**Seed.** `scripts/seed-lane-capture.ts` writes a few synthetic `scanAnalyses` records to the local emulator only. They are pairs that differ by pipeline version, by statsPath and by an absent region, so the local UI has data to read. There are no real faces.

---

## 2. Data shapes

New types go in `lib/capture-quality/types.ts` and `lib/comparability.ts`. `SkinScanResultSchema` (the engine contract) and `lib/skin-state.ts` are not changed.

### 2.1 Frame input for checks (pure, no DOM)

```ts
interface Frame {
  width: number;               // pixels
  height: number;
  data: Uint8ClampedArray;     // RGBA, length = width*height*4 (ImageData layout)
}
```

- In the browser, a frame comes from `createImageBitmap(capturedBlob)`, drawn to a canvas and read with `getImageData`.
- Tests build frames directly. vitest runs in node with no canvas, and adding one would be a new dependency.

### 2.2 Settings (every threshold named, every threshold provisional)

```ts
interface QualitySetting {
  id: string;                  // e.g. "exposure.clipLowFracMax"
  value: number;
  unit: string;                // "fraction of pixels", "8-bit luma", "px", "variance"
  status: "provisional";       // the only allowed value until R05 / C07 data exists
  source: string;              // why this value, e.g. "placeholder; replace after R05 exposure sweep"
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
| `blur.laplacianVarMin.native` / `blur.laplacianVarMin.canvas` | smallest allowed Laplacian variance on luma, per capture path (the two paths have different scales) | provisional |
| `resolution.minShortSidePx` | smallest allowed short side | provisional |
| `gate.retakesBeforeOverride` | only if O-4 = soft block: retakes before "use anyway" appears | provisional |

Rules for the values:
- This document writes no values. Step S1 sets them from the synthetic frames and the Phase 0 sweep levels, and each records its `source`.
- The R05 real-device sweep later replaces them. That is a settings-only change plus a new `settingsVersion`.
- Fixed standard constants are not thresholds and are not settings. One example is the Rec.601 luma weights. They live in `lib/capture-quality/luma.ts` as `LUMA_REC601`, with their source named.

### 2.3 Check result

```ts
type CheckId = "exposure" | "blur" | "resolution" | "pose" | "expression" | "distance" | "framing";
type CheckStatus = "pass" | "fail" | "not_measured";

interface CheckResult {
  id: CheckId;
  status: CheckStatus;
  measured: Record<string, number> | null;   // e.g. { clipLowFrac: 0.03, clipHighFrac: 0, meanLuma: 118 }; null when not_measured
  retakeReason: RetakeReason | null;         // non-null exactly when status === "fail"
  notMeasuredWhy?: "no_landmark_model" | "decode_failed" | "frame_empty";
}
```

The fixed order of checks, used everywhere (the result list and the choice of primary reason):

`exposure, blur, resolution, distance, framing, pose, expression`

`distance` corresponds to contract `quality.faceScale` and `pose` to `quality.pose`. `framing` has no contract field. That link is for a future server-side producer only. The client result never fills those contract fields (§2.5).

### 2.4 Retake reasons (one named enum)

```ts
type RetakeReason =
  // on-device
  | "too_dark"               // exposure: clipLowFrac or meanLuma below band
  | "too_bright"             // exposure: clipHighFrac or meanLuma above band
  | "blurry"                 // blur
  | "too_small"              // resolution
  | "too_far_or_close"       // distance (only once O-3 is approved)
  | "face_not_centred"       // framing (only once O-3 is approved)
  | "face_turned"            // pose (only once O-3 is approved)
  | "expression_not_neutral" // expression (only once O-3 is approved)
  // from the engine or route via /api/skin-scan (needs O-5 to reach the client)
  | "no_face_found"          // NO_FACE_DETECTED
  | "unreadable_image"       // IMAGE_UNPARSEABLE
  | "engine_too_small"       // IMAGE_TOO_SMALL
  | "engine_too_large";      // IMAGE_DIMENSIONS_TOO_LARGE, IMAGE_TOO_LARGE
```

- Each reason has one line of user copy in `RETAKE_COPY: Record<RetakeReason, string>`.
- The copy is instruction only, with no number, score or comparison in it.
- Every rejected capture carries exactly one primary reason: the first failed check in the fixed order. All failed reasons are kept.
- `retakeReasonFromServerCode(code)` and `isRetakeError(err)` live in owned `lib/capture-quality/retake.ts`. `isRetakeError` uses the exported `ApiError`. `lib/api.ts` gets no new export.

### 2.5 Gate result (one per captured photo)

```ts
interface CaptureQuality {
  schemaVersion: 1;                    // owner O-2: numeric shape version; any other value is dropped by the server
  producer: "capture-quality-web";     // the "separately versioned quality producer" (contract §7.2)
  producerVersion: "cq-1";
  settingsVersion: string;             // e.g. "cq-settings-0-provisional"
  assertedBy: "client";                // D-26: never authoritative
  captureMethod: "native" | "canvas";  // selects the per-path blur setting
  frame: { width: number; height: number };
  checks: CheckResult[];               // always all seven ids, in the fixed order
  verdict: "pass" | "retake" | "unchecked" | "override"; // "override" only if O-4 allows it
  retakeReasons: RetakeReason[];       // empty unless verdict is "retake" or "override"
  retakeCount: number;                 // retakes in this attempt before this photo
}
```

How the verdict is set:
- `unchecked`: exposure, the one required check, is `not_measured` (decode failed or empty frame). It never counts as `pass`. O-4 decides whether Analyze is allowed.
- `retake`: at least one check is `fail`.
- `pass`: exposure was measured, and no check is `fail`. It means only "the gate did not reject this photo". It does not mean "checked for pose" or "safe to compare".
- `override` (soft block only): the user chose to continue after a `retake`.

The result is kept apart from the engine output and from SkinState:
- It **never fills skinstate-1's `quality` block**. The contract fixes those fields to null, and filling them needs a new contract version.
- C02 does not read it. Under D-26 a client-asserted value cannot decide comparability (see Q-2).

Where it is held:
- `SkinScanState` (`types/skin-scan.ts`) gets an optional `quality?: CaptureQuality` on the `success` and `error` variants.
- The `error` variant also gets an optional `retakeReason?: RetakeReason`.
- The draft scan state (`lib/skin-check-draft.ts`) gets an optional `quality`, which is dropped on retake.
- Whether it is stored in Firestore is O-2. Until then it lives only in memory and in the draft.

### 2.6 If O-2 is approved: persisted shape

**Option A: on `scanAnalyses`**
- A flat optional field `captureQuality: CaptureQuality`, written by `buildScanAnalysisRecord` from a form field.
- The server validates it with zod. If it is invalid, the server **drops** it and never rejects the scan (D-03a).
- `schemaVersion` stays **1**, because `toSkinState` rejects any other value (`lib/skin-state.ts:198`).
- The field name does not end in `_json`, because `toSkinState` refuses records with such keys (`lib/skin-state.ts:202-203`).

**Option B: on `skinChecks`**
- One optional field, `capture: { quality: CaptureQuality }`.
- `firestore.rules` needs no change. The create rule does not restrict extra fields (`firestore.rules:24-26`).
- The documents are create-only (`firestore.rules:27`), so each saved document is just as permanent as under A.

### 2.7 Comparability shapes

```ts
type ColourPath = "corrected" | "native";

interface ComparabilityKey {
  contractVersion: "skinstate-1";
  fieldPath: string;                 // e.g. "colour.native.lStarMean"
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

/** LONGITUDINAL_METHOD §2 COMPARABLE table. Empty in production until C05–C07. */
interface ComparableQuantity { fieldPath: string; region: SkinStateRegionKey; pipelineVersion: string; calibrationId: string | null }
export const COMPARABLE_QUANTITIES: readonly ComparableQuantity[] = [];

type NotComparableReason =
  | "quantity_not_validated"         // (fieldPath, region, pipelineVersion) not in the table
  | "engine_build_unknown" | "engine_build_differs"
  | "pipeline_version_unknown" | "pipeline_version_differs"
  | "input_variant_unknown" | "input_variant_differs"
  | "capture_method_unknown" | "capture_method_differs"   // see O-1, Q-1
  | "native_stats_missing"           // native field, statsPath !== "both" on either side
  | "region_absent"                  // absent_region on either side
  | "region_low_pixel_count"         // lowPixelCount on either side
  | "lr_cheek_cross_capture_method"  // cheek_image_left/right across methods (METHOD §3)
  | "field_not_defined"              // fieldPath is not a skinstate-1 field
  | "contract_version_differs"
  | "different_user";                // compareStates only: analysisRef uid differs

type ComparabilityVerdict =
  | { verdict: "comparable"; key: ComparabilityKey; noiseThreshold: { status: "unknown"; calibrationId: null } }
  | { verdict: "not_comparable"; reasons: NotComparableReason[] };   // at least one; all collected, fixed order
```

The functions:
- `comparabilityKey(state: SkinState, fieldPath, region): ComparabilityKey` is pure. It copies values and never infers one.
- `compareKeys(a, b, table = COMPARABLE_QUANTITIES): ComparabilityVerdict` is pure. Every null key part and every missing table entry adds a reason.
- `compareStates(a, b, fieldPath, region, table?)` checks the uid, then calls `compareKeys`.

Behaviour to note:
- With the production table, `comparable` cannot be reached.
- There is no "comparable-with-caveats" verdict (Q-1).
- The only stand-ins for "quality" are the server-derived `regionStatus` and `lowPixelCount` (Q-2).
- `noiseThreshold` stays `unknown` until C07 delivers a versioned table keyed by field × region × tone band × engine build.

---

## 3. Files

### Add (all owned by capture)

| File | What |
|---|---|
| `lib/capture-quality/types.ts` | Types from §2.1–2.5 |
| `lib/capture-quality/settings.ts` | `CAPTURE_QUALITY_SETTINGS`, `settingsVersion` |
| `lib/capture-quality/luma.ts` | `LUMA_REC601` and `lumaOf(frame)`. A fixed standard, not a threshold |
| `lib/capture-quality/exposure.ts` | `checkExposure(frame, settings)`: clip fractions and mean luma |
| `lib/capture-quality/blur.ts` | `checkBlur(frame, captureMethod, settings)`: variance of a 3×3 Laplacian on luma |
| `lib/capture-quality/resolution.ts` | `checkResolution(frame, settings)` |
| `lib/capture-quality/gate.ts` | `runCaptureGate(frame, ctx): CaptureQuality`, plus the pure retake/pending reducer that PhotoCapture uses |
| `lib/capture-quality/retake.ts` | `RetakeReason`, `RETAKE_COPY`, `retakeReasonFromServerCode`, `isRetakeError` |
| `lib/capture-quality/frame.ts` | Browser only: `frameFromBlob(blob): Promise<Frame>`. Kept apart so the pure modules never import DOM code |
| `lib/capture-quality/synthetic-frames.ts` | Synthetic frame builders (flat, gradient, checkerboard, clipped, blurred) for the tests. No faces. Imported only by tests |
| `lib/comparability.ts` | §2.7 |
| `tests/capture-exposure.test.ts`, `tests/capture-blur.test.ts`, `tests/capture-resolution.test.ts`, `tests/capture-gate.test.ts`, `tests/capture-retake.test.ts`, `tests/capture-settings.test.ts` | §4 |
| `tests/capture-api-code.test.ts` | Only if O-5 is approved |
| `tests/comparability.test.ts`, `tests/comparability-wording.test.ts` | §4 |
| `tests/capture.e2e.test.ts` | Only if O-2 is approved: a round trip through the local stack |
| `scripts/seed-lane-capture.ts` | §1 |

### Change

| File | Owner | Change |
|---|---|---|
| `components/skin-check/inputs/PhotoCapture.tsx` | capture | Run the gate after each capture, on both paths. Disable Analyze until a result exists, and on `retake` (and on `unchecked`, per O-4). Show the retake reason. With O-5, map server codes to reasons in the existing `.catch`. Consent behaviour is unchanged: the two boxes are still reset on retake, and the copy still comes from `lib/consent.ts` |
| `hooks/useCameraStream.ts` | capture | No change planned |
| `lib/scan-analysis-record.ts` | capture | Only if O-2 = A: optional `captureQuality` in `ScanAnalysisMeta`. `schemaVersion` stays 1 |
| `types/skin-scan.ts` | shared, additive | Optional `quality?` on the success and error variants, and `retakeReason?` on error. `SkinScanResultSchema` is untouched |
| `lib/api.ts` | shared | Without O-5: only, if O-2 = A, an optional `captureQuality` parameter on `runSkinScan`, appended as a form field. With O-5: also read `code` from a non-OK JSON body into the existing `ApiError(status, message, code)` |
| `app/api/skin-scan/route.ts` | shared, capture part only | Only if O-2 = A: read the optional `captureQuality` form field after `formData`, validate it, and pass it to `persistScanAnalysis`. This adds one optional parameter to that private function in the same file (`route.ts:400`). That is outside "the call and the form fields it reads" by one parameter; the report will say so. The preamble is untouched |
| `lib/skin-check-draft.ts` | shared, additive | Optional `quality` on the stored scan state |
| `lib/useSkinCheckFlow.ts` | shared, scan-state part only | Carry `quality` along the photo → `SkinScanState` path, and drop it on the retake reset. Answers, sections and the age gate are untouched |
| `lib/firebase/skin-checks.ts` | shared, additive | Only if O-2 = B: one optional `capture` field |
| `lib/skin-check-session-context.tsx` | shared | No change expected |

### Requests to other lanes (go into `capture-report.md`; not edited here)

- **routine** (owns `SkinCheckDashboard.tsx`): when `scan.status === "error"` and `scan.retakeReason` is set, show the existing message with a "Retake photo" action. PhotoCapture already sets the message text, so even without this change the dashboard shows the right words.
- **firestore.rules**: no request. Option B needs no rule change, and Option A is written by the server.

---

## 4. Tests

All tests are vitest unit tests that run in `npm run test:local`, except the e2e file. Frames are synthetic only.

**Exposure (`capture-exposure.test.ts`)**
- A mid-grey frame passes.
- An all-black frame fails with `too_dark`. An all-white frame fails with `too_bright`.
- Boundaries:
  - a clipped fraction exactly at `clipLowFracMax` passes, and one pixel over fails;
  - the same holds for the high-side fraction and for both edges of the mean band.
- A frame that is half black and half white fails. The larger clip fraction gives the reason; a tie goes to `too_dark`.
- Failure cases:
  - a zero-size frame gives `not_measured` (`frame_empty`), never `pass`;
  - `data.length !== width*height*4` gives `not_measured`;
  - alpha is ignored.

**Blur (`capture-blur.test.ts`)**
- A checkerboard passes.
- A flat frame and a blurred checkerboard fail with `blurry`.
- The boundary is tested per capture method: at `laplacianVarMin.<method>` passes, below it fails.
- The same frame can pass for one method and fail for the other.
- A frame smaller than 3×3 gives `not_measured`.

**Resolution (`capture-resolution.test.ts`)**
- A short side at the minimum passes. One pixel below fails with `too_small`.

**Gate (`capture-gate.test.ts`)**

The result:
- Always seven checks, in the fixed order.
- pose, expression, distance and framing are `not_measured` with `no_landmark_model`.

The verdict:
- It is `pass` only when exposure was measured and nothing failed.
- If exposure is `not_measured`, it is `unchecked`. This is a failure case.
- When several checks fail, the primary reason follows the fixed order and every reason is listed.

The fields:
- `assertedBy` is always `client`.
- `producerVersion` is always `cq-1`.
- `settingsVersion` matches the settings module.
- Every `fail` has a reason, and every non-fail has none.

The reducer:
- Analyze is disabled while the gate is pending.
- A `retake` verdict blocks the scan request.
- Retake clears both consent booleans and the quality result.
- After a retake, a passing photo unblocks Analyze.
- A late gate result for a photo that has since been retaken is ignored.

**Settings (`capture-settings.test.ts`)**
- Every setting has `status: "provisional"` and a non-empty `source`.
- `exposure.ts`, `blur.ts` and `resolution.ts` contain no numeric literal other than 0, 1, 2, 3, 4 and 255. `luma.ts` is excluded, because it holds the named standard weights.

**Retake (`capture-retake.test.ts`)**
- Every `RetakeReason` has copy.
- No copy contains a digit (`\p{Nd}`) or a comparative or causal word (the same lexicon as the wording test).
- `retakeReasonFromServerCode` maps all **five** codes. `IMAGE_TOO_LARGE` and `IMAGE_DIMENSIONS_TOO_LARGE` both map to `engine_too_large`.
- Failure case: these codes give `null`, because they are not photo problems and must not ask for a retake:
  - an unknown code
  - `SCAN_TIMEOUT`
  - `SCAN_CAPACITY_EXCEEDED`
  - `SCAN_SERVICE_ERROR`
  - `auth/required`
- `isRetakeError` returns false for a plain `Error`, and for an `ApiError` without a code.

**api.ts code pass-through (`capture-api-code.test.ts`, only with O-5)**
- A 400 with `{code:"NO_FACE_DETECTED"}` throws an `ApiError` with that code and the same message as today.
- A non-JSON error body throws exactly as today.
- A 401 still gives `auth/required`.
- `isAuthError` and `isUploadError` stay false for every server code.

**Comparability (`comparability.test.ts`)**

Key-pair table (each row lists the verdict and its exact reasons):

| Case | Table | Result |
|---|---|---|
| identical keys, non-null build | a test table **with** the entry | `comparable`, noise `unknown` |
| identical keys | the **production** (empty) table | `quantity_not_validated` |
| entry for another pipeline version | test table | `quantity_not_validated` |
| entry for another region only | test table | `quantity_not_validated` |
| build null on either side | — | `engine_build_unknown` |
| builds differ | — | `engine_build_differs` |
| pipeline versions differ | — | `pipeline_version_differs` |
| input variants differ | — | `input_variant_differs` |
| capture method null | — | `capture_method_unknown` |
| capture methods differ | — | `capture_method_differs` |
| native field with `statsPath: "corrected"` | — | `native_stats_missing` |
| absent region | — | `region_absent` |
| low pixel count | — | `region_low_pixel_count` |
| `cheek_image_left` native vs canvas | — | `capture_method_differs` and `lr_cheek_cross_capture_method` |
| unknown fieldPath | — | `field_not_defined` |
| several failures at once | — | every reason, in fixed order |

State-pair tests:
- Different uid gives `different_user`. This is checked in `compareStates`, because the key has no uid.
- **Real SkinState pairs** built with `toSkinState` from `tests/synthetic-scan.ts` give `not_comparable`, with `quantity_not_validated` and `engine_build_unknown`, even when `captureMethod` matches. This pins today's honest answer.
- A gate result of `pass` or `override` changes nothing, because comparability never reads it.

Purity:
- The same input gives deep-equal output.
- Inputs are not mutated.
- `COMPARABLE_QUANTITIES` is empty.

**Wording (`comparability-wording.test.ts`)**
- Every verdict from the table is serialised and checked.
- No output contains `%`, a digit next to a change word, or any of these words: improve, worse, better, reduce, increase, decrease, because, caused, due to, effect, works.
- No exported function returns a number derived from two scans.

**Seed**
- `scripts/seed-lane-capture.ts` runs without error inside `npm run test:local`, after the base seed.
- The unit tests do **not** read seeded data. They run first, with no emulator (`scripts/local-stack.sh:34-38`). They build their own pairs.

**e2e (`capture.e2e.test.ts`, only with O-2)**
- Skips itself with `describe.skipIf(!LOCAL_STACK_WEB)` (the `tests/local-stack.e2e.test.ts` pattern), because the unit pass collects every test file.
- A synthetic scan posted with `captureQuality` reads back unchanged:
  - Option A: from `scanAnalyses`;
  - Option B: from `skinChecks`.
- `toSkinState` still returns `kind: "skinstate"`, with `quality.*` still null.
- A malformed `captureQuality` is dropped, and the scan still returns `ok: true`.

---

## 5. Not built in this lane

**No engine or contract changes**
- No engine change (D-18), including returning a build or digest. That path is C12.
- No change to `lib/skin-state.ts` or to skinstate-1, and no `skinstate-2`. Mapping `engine_build` and filling `quality.*` belong to the main session.

**No change output or calibration**
- No deltas, percentages, trends, baselines or tiers, and no "different from your starting checks" copy (D-12, D-13). Tier 1 needs C07.
- No noise thresholds, and no entries in `COMPARABLE_QUANTITIES`. Both wait for C05–C07.

**No features the owner has not cleared**
- No pose, expression, distance or framing check without O-3.
- No new npm dependency without approval.
- No live per-frame exposure overlay on the desktop preview. A later step can reuse the same pure functions.
- No device-family detection, and no use of EXIF or the device model.

**No edits outside the lane**
- No `firestore.rules` change.
- No dashboard edit (that is a request to routine).
- No consent change.
- No tracker or DECISION_LOG edit.

**Never used for comparability:** the client gate result, because it is client-asserted (D-26).

---

## 6. Steps

All steps wait for the owner to approve this design. Every code step ends with:
- `npm run test:local` green;
- typecheck and lint green;
- one commit.

**Steps that need no further owner decision**

| Step | Work | Tests | Commit |
|---|---|---|---|
| S1 | `types.ts`, `settings.ts` (values `provisional`, with sources), `luma.ts`, `retake.ts` (enum, copy, server-code map, `isRetakeError`), `synthetic-frames.ts` | capture-settings, capture-retake | `feat(capture): quality types, provisional settings, retake reasons` |
| S2 | `exposure.ts` (first, as the dominant Phase 0 risk) | capture-exposure | `feat(capture): exposure check` |
| S3 | `blur.ts` (per-path setting), `resolution.ts` | capture-blur, capture-resolution | `feat(capture): blur and resolution checks` |
| S4 | `gate.ts`: seven checks, the four landmark checks `not_measured`, verdict incl. `unchecked`, primary reason, pending/retake reducer | capture-gate | `feat(capture): capture gate and retake reducer` |
| S5 | `lib/comparability.ts`: empty `COMPARABLE_QUANTITIES`, key extractor, `compareKeys`, `compareStates` | comparability, comparability-wording | `feat(capture): key-based comparability (C02), fails closed` |
| S6 | `scripts/seed-lane-capture.ts`: synthetic pairs | the seed runs inside `test:local` | `chore(capture): local seed for comparability pairs` |

**Steps that need an owner decision**

| Step | Work | Blocked by | Tests | Commit |
|---|---|---|---|---|
| S7 | PhotoCapture wiring: `frame.ts`; gate on both paths; Analyze pending/blocked; retake copy; `quality` and `retakeReason` on `SkinScanState`, the draft and the flow's scan state | **O-4** | capture-gate reducer cases for the chosen O-4 option; typecheck covers the wiring | `feat(capture): retake loop in PhotoCapture` |
| S8 | `lib/api.ts` code pass-through; map server codes in PhotoCapture's `.catch` | **O-5** (and S7) | capture-api-code; capture-retake mapping | `feat(capture): surface scan error codes as retake reasons` |
| S9 | Persist `CaptureQuality` (A: record field and route form field; B: `skinChecks.capture`) | **O-2** | capture.e2e | `feat(capture): persist client capture quality` |
| S10 | Pose, expression, distance and framing checks | **O-3** | capture-gate cases for the four checks | `feat(capture): landmark-based checks` |
| S11 | Adjust the `captureMethod` part of the key to the O-1 outcome. Empty if the frozen contract is kept | **O-1** | comparability table rows for capture method | `fix(capture): comparability key per D-26` |
| S12 | `capture-report.md`, written last and reporting whatever has landed: link to this design, owner approval, what was built, commits, test results, requests, open questions | none (last) | none (document task) | `docs(lanes): capture report` |

S5 can be built entirely now, to the frozen contract. If O-1 removes `captureMethod`, only the extractor and a few table rows change.

---

## 7. Owner decisions

### O-1. Can the browser's own claim about how the photo was taken be part of the comparability check? (D-26 open item)

**In plain words**
- The browser tells the server whether the photo came from the phone camera app (`native`) or the desktop webcam (`canvas`). The server stores that claim without checking it.
- The frozen contract puts this value in the comparability key, so two scans taken different ways are never compared.
- D-26 says the browser is never trusted for measured skin state. It lists two ways out:
  1. stop storing the value;
  2. amend the contract to mark it client-asserted, **and keep it out of the key** until the server can derive it.
- `persistAttempt` ("was this a background retry?") is also sent by the browser. It is not in the key, so it only affects which record is chosen. D-26 option 2 covers it.

**Options**
- **A. Keep it in the key, marked client-asserted.** This is a third option, not one of D-26's two.
- **B. D-26 option 2.** Mark it client-asserted and drop it from the key until the server derives it (for example from EXIF in the stored original, or from image dimensions).
- **C. D-26 option 1.** Stop storing it.

**Recommendation: A, departing from D-26's listed options on purpose.**
- With the value in the key, an honest value can only remove pairs, never add them.
- A forged value can make a webcam scan and a phone scan look like the same method. The pair must still match on engine build, pipeline version, input variant and the validated-quantity table, and nothing is shown before C07. The damage is bounded, and the amendment should say so.
- B makes every honest desktop-vs-phone pair pass this part of the check. Phase 0 points to large differences between the two paths, so B is less safe than A.
- C loses the stratification the dataset needs.
- D-26 is an open item, not a frozen decision, so the owner may choose A.

**Blocks:** S11 only.
**Can start without it:** S1–S10. S5 follows the frozen contract (capture method in the key).

### O-2. Do we save the on-device quality result, and where?

**In plain words**
- For every capture the app will work out "was this photo too dark, too blurry". Today nothing like that is saved.
- If it is saved, it can later explain why a scan looked odd, and the R05 exposure study can use it to set real thresholds.
- Both possible places are write-once, so a badly shaped field stays as it is in every document already written.

**Options**
- **A. On the server-written analysis record (`scanAnalyses`)**, as an optional field marked client-asserted.
  - It sits next to the exact bytes it describes (same `inputSha256`).
  - Schema version stays 1.
  - The server drops an invalid value.
  - Cost: it adds a **third client-asserted field** to the server record, after `captureMethod` and `persistAttempt`. That widens the D-26 open item. The field must be named in the same contract amendment as client-asserted, and never used for comparability.
- **B. On the browser-written questionnaire record (`skinChecks.capture`).**
  - Written at save time, so it is lost when the user does not finish the questionnaire.
  - Not tied to the image hash.
  - Also create-only: only future documents can take a new shape.
- **C. Don't save it.** Show it to the user only.

**Recommendation: A.**
- The result describes one exact image, and only the analysis record is keyed by that image's hash.
- Scan-time writes survive abandoned questionnaires, which is the lesson of D-02.
- The cost to D-26 is small if the result is labelled `assertedBy: "client"` and kept out of comparability.
- The risk of a wrong permanent shape is limited three ways: the shape is fixed in §2.5, `producerVersion` lets a later shape coexist, and the server drops anything invalid.

**Blocks:** S9.
**Can start without it:** S1–S8, S10–S12.

### O-3. Can we add a face-landmark library for the pose, expression, distance and framing checks?

**In plain words**
- Exposure, blur and size can be checked by counting pixels.
- These need a model that finds the face's key points in the browser:
  - "Is the face turned?"
  - "Is the person smiling?"
  - "Is the face too near or too far?"
  - "Is the face centred?"
- None is installed, and the lane rules forbid adding one without approval.
- Until then those four checks report "not measured". The engine still refuses a photo with no face (`NO_FACE_DETECTED`), but only after upload.

**Options**
- **A. `@mediapipe/tasks-vision` (Face Landmarker).**
  - Same model family as the engine (mediapipe face mesh).
  - Runs in the browser with WASM.
  - The model is a few MB, loaded only on the capture step.
- **B. The browser's built-in `FaceDetector`.** No dependency, but it is missing on iOS Safari and most browsers, so most users would get `not_measured` anyway.
- **C. None for now.** Ship exposure, blur and resolution.

**Recommendation: C now, A as a follow-up.**
- Exposure is the dominant measured risk, and the pixel checks cover it with no dependency.
- A adds a few MB to every capture, plus a model version that must be pinned and recorded. Decide after the R05 sweep shows how often pose and distance fail in real captures.
- If A is chosen, pin it to the engine's mediapipe 0.10.x line and bump `producerVersion`.

**Blocks:** S10.
**Can start without it:** everything else.

### O-4. When a check fails, must the user retake, or can they continue anyway?

**In plain words**
- When a photo is too dark, there are two ways to respond:
  - refuse to analyse it until the user retakes (hard block);
  - warn them, and after a set number of tries offer "use this photo anyway" (soft block).
- A hard block protects data quality. But a user with a poor phone camera in a dim room may never pass, and gives up.
- The thresholds are still provisional guesses, so a hard block may reject good photos.
- The same question applies to `unchecked`, when the image could not be checked at all.

**Options**
- **A. Hard block.** Analyze stays disabled until nothing fails. `unchecked` is also blocked.
- **B. Soft block.** Analyze is disabled on a failure. After `gate.retakesBeforeOverride` retakes (a provisional setting), "Use this photo anyway" appears and the result is recorded as `override`. `unchecked` is allowed and recorded as `unchecked`.
- **C. Warn only.** Never block.

**Recommendation: B.**
- Thresholds stay provisional until R05, and a hard block based on guessed numbers can lock real users out of the product.
- B still stops the common case (one dark photo) and keeps the data honest: an override is stored as `override` and a failed decode as `unchecked`, never as `pass`.

**Blocks:** S7, which also blocks S8.
**Can start without it:** S1–S6, S9–S12. If O-4 lands later, S9 can save the verdict once S7 is in.

### O-5. May the scan helper pass the server's error code through to the app?

**In plain words**
- When the engine refuses a photo ("no face found", "unreadable"), the server already sends a named code. The browser helper in `lib/api.ts` discards it and reports a generic "Failed to analyze photo".
- Without the code, the app cannot tell the user *why* to retake.
- The lane rules let capture add optional parameters to that shared file, but not change its behaviour.
- The change: a failed scan's error object would carry the server's code. The status and message stay the same.

**Options**
- **A. Allow it** as a one-function exception for the capture lane.
- **B. Make it a request in the capture report**, done by the main session after merge.
- **C. Don't do it.** Engine refusals keep the generic message.

**Recommendation: A.**
- No current caller depends on the code being missing. `isAuthError` and `isUploadError` match only `auth/required` and `upload/failed`, which the server never sends as a scan code. A test pins that.
- It is the only way the engine's refusals get a named retake reason, which the lane rules require.

**Blocks:** S8.
**Can start without it:** S1–S7, S9–S12.

### Blockers outside this lane

Until these land, C02 can never say "comparable" for real data.
- **The COMPARABLE quantity table (C05–C07).** Until then, `COMPARABLE_QUANTITIES` stays empty and `noiseThreshold` stays `unknown`.
- **A new SkinState contract version that maps `engine_build`.** skinstate-1 hard-codes `engine.build: null`. This belongs to the main session and the owner (D-23), not to this lane.
- **Deploy of 0.1.6 and gate 04 (A12, A13).** Paused under TD-04.

### Open questions to record (not lane decisions)

**Q-1. Capture method: a different key, or a caveat?**
- LONGITUDINAL_METHOD §3 step 2 calls a different capture method "comparable-with-caveats".
- The frozen contract (§7.1) and D-13 put it in the key, which makes it "not comparable".
- This design follows the frozen contract and has no caveats tier.

**Q-2. The quality gate in comparability.**
- LONGITUDINAL_METHOD §3 says a quality failure means "not comparable" (step 2), and that "both scans must pass the quality gate" (step 5). The capture brief also puts "quality" in the C02 key.
- Under D-26, a client-asserted gate result cannot decide comparability. So steps 2 and 5 stay unmet until a **server-side** quality producer exists (engine-side or server-side checks, D-18).
- Until then, the server-derived `regionStatus` and `lowPixelCount` are the only quality inputs.
- The owner may want LONGITUDINAL_METHOD and the brief to say so.
