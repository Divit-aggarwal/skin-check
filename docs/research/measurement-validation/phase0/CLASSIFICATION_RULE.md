# Phase 0 classification rule (written before analysis)

Written on 2026-10-03, after the matrix was scored but **before any field value was inspected or analysed**. Every threshold comes from ACCEPTANCE_CRITERIA §A. Nothing here adds a threshold.

## Inputs
- `results/matrix.json`: one row per perturbation level, plus the realised input change measured per region on the bytes `/scan` received.
- `results/skinstates.json`: each response mapped through the frozen `toSkinState` (skinstate-1).
- `results/determinism.json`: 100 × 5 submissions, one fresh container per batch, concurrency 4.

## Slopes
- **Engine slope** = OLS slope of Δfield (vs baseline) on Δrealised (the regional mean of the injected channel on the transmitted image, in the engine's own native units), across the baseline and every level. Fitted through the origin.
- **Harness slope** = Δrealised over the nominal level. It is reported separately. It is not a gate: it measures attenuation from 8-bit rounding, gamut clipping and JPEG.
- Both are point estimates from one image. **No CI is computed**, because a CI across images needs more than one image.

## Rules per field group

| Group | Gate | KEEP FOR HUMAN VALIDATION | DROP | INCONCLUSIVE |
|---|---|---|---|---|
| Colour location fields with a pre-registered intended change: `aStarMean` and `aStarP90` (face a*), `lStarMean` and `lStarMeanPostClahe` (face L*), both paths | A3: engine slope 0.8–1.2 **in every region**, plus monotone in the expected direction across levels. A4: \|Δ\| at a background ±10 cast ≤ 10% of the cast (≤ 1.0 unit) **in every region**, for both the a* and b* casts | Passes A3 and A4 | Fails A3 or A4 in any region, **and** the failure has an identified mechanism in the engine (a whole-frame or per-image operation), so one image is enough to show it | Fails without an identified mechanism |
| `bStarMean` (both paths) | A4 only. The protocol defines no face-only b* perturbation; the `faceB` rows are EXPLORATORY | Not possible from this protocol | Fails A4 with a mechanism | Default |
| Spread fields: `aStarSd`, `lStarSd`, `lStarSdPostClahe` | None. A uniform shift is not a change in spread, so no pre-registered intended change exists | Not possible | Fails A4 with a mechanism | Default |
| Histograms: `aStarHist`, `localLContrastHist` (both paths) | Same as their scalar counterparts. Clip mass is reported | Not possible (redundant with the scalar, which is screened instead) | — | Default |
| Texture: `laplacianVarMean`, `lbpEntropy`, `gradientMean` | A5: report the response to blur σ 1 and scale 0.8 (and to the other levels). The provisional MDC95 does not exist, so "condition-sensitive" cannot be decided | Not possible. No intended texture change is pre-registered | Non-deterministic beyond the A1 maximum, **or** a degenerate response (identical for every perturbation) | Default |
| `specular.fraction` | Same as texture; exposure is reported | Not possible | Same as texture | Default |
| D1 ITA (cheeks, native) | Follows its inputs. It needs native L* KEEP **and** native b* screened by A3 | Not possible while b* lacks a pre-registered A3 | If an input is DROP | Default |
| `pixelCount` | Not a candidate. It is a quality covariate (contract: DERIVED `lowPixelCount`) | — | — | Reported only |
| Deprecated `scores` and `region_scores` | Not candidates. Their response is recorded only to document failure (ANALYSIS_PLAN §7) | — | Already deprecated | — |

## Determinism (A1)
- **Bit-identical** canonical JSON across all 100 submissions of each input means A1 is met.
- **Otherwise**, report the maximum \|diff\| per field. The A1 tolerance (1% of the provisional MDC95) cannot be evaluated until the pilot exists, so any non-identical field is **INCONCLUSIVE on A1**.

## What KEEP means at n = 1
**KEEP means only: proceed to the complete Phase 0** (10 images, across tone bands) and then to Phase 1 data collection as a primary endpoint. It is never "validated" and never "a skin measurement".

**DROP is asymmetric.** It can rest on one image, because it rests on an engine mechanism (for example, whole-frame gray-world) that does not depend on the image. Even so, it applies to this engine version only (ACCEPTANCE §G).

## Not run, by necessity (recorded, never imputed)
- **A2** real-device input fidelity: no devices in the loop. The harness uses PIL's JPEG encoder, not Chromium's.
- **§4.5** ColorChecker under real capture: no hardware.
- **9 of the 10 bench images.** Only one image with a known in-repo history exists: `skin-scan/fixtures/input_face.png`, a retouched studio portrait whose licence provenance is unrecorded. No other face images were sourced: their consent is unknown.
- **Fresh linux/amd64 containers on native hardware.** The pinned digest runs under emulation on an arm64 Mac (Docker Desktop).
