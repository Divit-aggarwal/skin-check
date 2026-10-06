# Measurement validation: DATA_SPEC

What is recorded per participant, day, block and capture, and where it lives. Companion to PROTOCOL.md.

All study data lives in a **study namespace in India**:
- bucket `projectskin-study-mv1-*` in ap-south-1
- a study table or database in asia-south1

It never touches production `users/`, production accounts, Gemini, or developer `.env.local` credentials.

## 1. Entities

```
Participant 1─* StudyDay 1─* Block 1─* Capture 1─1 EngineRun
Participant 1─1 ToneAssessment
Participant 1─* DeviationLog
StudyDay    0─* ReferenceReading        (Phase 4)
BenchImage  1─* BenchRun                (Phase 0)
```

## 2. Participant and tone

| Field | Type | Notes |
|---|---|---|
| `pid` | string `MV1-0001` | pseudonymous. The key table is held separately |
| `split` | `calibration` \| `validation` \| `pilot` | assigned once at enrolment by the user-level procedure (ANALYSIS_PLAN §6). **Never per image** |
| `toneBand` | `T1` \| `T2` \| `T3` | from the MST consensus (PROTOCOL §5) |
| `mstRater1`, `mstRater2`, `mstRater3?` | int 1–10 | raw ratings, kept for κ |
| `mstConsensus` | int | median of the ratings |
| `itaArmInstrument?` | number, degrees | instrument ITA on the inner upper arm (constitutive) |
| `itaCheekInstrument?` | number, degrees | instrument ITA on the cheek |
| `ageBand` | `18-29` \| `30-44` \| `45+` | |
| `sex` | as self-described, optional | for descriptive balance only |
| `facialHair` | `none` \| `stubble` \| `beard` | recorded on each study day too |
| `ownDevice` | `{make, model, os, osVersion}` | from the study page user agent plus a participant check |
| `enrolledAt`, `withdrawnAt?`, `withdrawalReason?` | | |
| `studyConsentVersion` | string | |

Self-reported Fitzpatrick may be collected for descriptive comparison only. **It is never used as a band** (contract §8).

## 3. Capture

| Field | Type | Notes |
|---|---|---|
| `captureId` | uuid | |
| `pid`, `day` (`D0` \| `D7` \| `D28`), `block` (`N-AM` \| `N-PM` \| `C` \| `C-own` \| `COND` \| `BURST`), `rep` | | `rep` is the 1-based order within the block |
| `arm` | `N` \| `C` | |
| `device` | `own` \| `reference` | plus the `ownDevice` snapshot |
| `captureMethod` | `native` \| `canvas` | the production value. The N arm must be `native` (mobile) |
| `capturedAt` | ISO time, device clock **and** server receipt time | the contract's `provenance.capturedAt` is UNKNOWN in production; it is recorded here |
| `illuminant` | `home` \| `led_daylight` \| `led_warm` | `home` covers every N-arm capture |
| `background` | `home` \| `grey` \| `patterned` | |
| `luxAtFace?`, `cctAtFace?` | number | C and COND blocks: handheld meter. N arm: not available |
| `distanceCm?` | number | C arm: fixed. N: not available |
| `checklist` | `{washed, noMakeup, noSunscreen, hairOff, neutral, noGlasses}` booleans | PROTOCOL §6.3 |
| `beautyModeOff`, `hdrOff`, `flashOff` | boolean | confirmed by the participant (N) or the research assistant (C) |
| `originalKey` | S3 key | the untouched original, with EXIF |
| `originalSha256` | hex | |
| `originalColorProfile` | `sRGB` \| `DisplayP3` \| `other` \| `none` | parsed from ICC. **A stratum covariate**, because the engine ignores ICC |
| `exifOrientation` | int | |
| `analysedKey`, `analysedSha256` | | the production client-transform output that was sent to `/scan` |
| `analysedWidth`, `analysedHeight` | int | |
| `transformVersion` | string | the harness or study-page build id (PROTOCOL §4.2) |
| `exclusion` | null \| `{code, note}` | codes in §6. **The row is never deleted** |

## 4. Deviation log (per participant per day)

Records anything that breaks the stable routine: new product, sun exposure > 1 h unprotected, illness or fever, shaving-style change, menstrual phase (optional, self-declared), poor sleep (optional), or a medication change.

Used **only** for sensitivity analysis (ANALYSIS_PLAN §9). It is never used to exclude data after the fact without a pre-registered rule.

## 5. Engine run (one per capture; more after a replay)

| Field | Type | Notes |
|---|---|---|
| `captureId` | | |
| `engineDigest` | `sha256:…` | **pinned for the study**; a replay adds new rows |
| `pipelineVersion` | string | from the response |
| `request` | `/scan?stats=both`, no overlays | |
| `httpStatus`, `errorCode?` | | `NO_FACE_DETECTED` etc. count as failures (§6) |
| `response` | the full JSON, stored verbatim | including the deprecated fields, for failure documentation |
| `responseSha256` | hex | determinism audits |
| `skinState` | `toSkinState(response, "skinstate-1")` | computed by the frozen contract mapping. Analysis reads **only** from this plus the deprecated `scores` (ANALYSIS_PLAN §7) |
| `qualityStudy` | `{blurVarLaplacianFace, meanVFace, clipFracFace, faceWidthPx, yawDeg, pitchDeg}` | **study-only** quality covariates, computed by an analysis script on the analysed image. Never fed back into the engine; they are candidates for a future versioned quality producer (contract §7.2) |

### 5.1 Analysis-ready long table (one row per capture × region × field)

`pid, split, toneBand, day, block, arm, device, rep, captureMethod, illuminant, background, region, field, value, unit, status (available|absent_region|unknown), pixelCount, histClipMass, qualityStudy.*, deviationFlags, engineDigest, contractVersion`

- `histClipMass` = (underflow + overflow) / pixelCount for the field's histogram. It is a data-adequacy check: fixed edges that clip mass in darker or redder skin bias the histogram-derived fields.
- `ITA` is a derived row computed from the native L* and b* of the same capture and region.

## 6. Exclusion codes (pre-registered)

Excluded rows are **kept and reported**. Exclusion rates per band are an endpoint (ACCEPTANCE §B, §D).

| Code | Rule |
|---|---|
| `E_NOFACE` | The engine returned `NO_FACE_DETECTED` or another 4xx |
| `E_ABSENT` | The region status is `absent_region`. This excludes that region only |
| `E_PROTOCOL` | Any checklist item is false, or beauty mode, HDR or flash is on |
| `E_WRONGPATH` | The N arm was captured through desktop or canvas instead of mobile native |
| `E_DEVICE` | Own-device model changed mid-study. This becomes a separate device series and is not pooled |
| `E_DEVIATION` | Only under pre-registered sensitivity rules. **Never** in the primary analysis |

**No quality-based exclusion in the primary analysis.** Production has no quality gate, so excluding blurry or dark captures would understate production noise. Quality covariates are used only in the secondary "what a gate would buy" analysis (ANALYSIS_PLAN §5.4).

## 7. Phase 0 bench records

| Entity | Fields |
|---|---|
| `BenchImage` | `imageId`, `source` (licensed or consented), `toneBandEstimate` (MST, 2 raters), `width`, `height`, `colorProfile` |
| `BenchRun` | `imageId`, `perturbation` `{type: faceA\|faceL\|bgCast\|exposure\|blur\|scale\|jpeg, level}`, `engineDigest`, `response`, `skinState`, `runEnv` (container id, fresh or warm, concurrency) |
| `TargetCapture` | `device`, `illuminant`, `rep`, `patchLab[24]` measured from the image, `refLab[24]`, `deltaE00[24]` |

## 8. Phase 4 reference readings (optional)

| Field | Notes |
|---|---|
| `instrument` | model and serial. A tristimulus colorimeter or spectrophotometer reporting CIE L*a*b* (D65/10°), **or** an erythema/melanin meter. Pick one family and use it throughout |
| `site` | `cheek_L`, `cheek_R`, `forehead_centre`, `nose_dorsum`, `inner_upper_arm` |
| `reps` | 3 per site, averaged |
| `L`, `a`, `b`, `EI?`, `MI?` | |
| `instrumentCalibratedAt` | white-tile calibration time per session |
| `inducedChange?` | `{protocol, timepoint: pre\|post}` for the responsiveness sub-study (PROTOCOL Phase 4; IEC-approved procedure only) |

## 9. Retention and access

- **Retention:** originals and analysed images kept for **study duration + 3 years** (to support engine replays, PROTOCOL §8), unless the participant withdraws.
- **Erasure:** by `pid` across all tables and objects.
- **Access:** named research staff only. No production service account has access, and no study credential lives in any `.env.local`.
- **Export:** for analysis, de-identified long tables (§5.1) only. Images never leave the study bucket.
