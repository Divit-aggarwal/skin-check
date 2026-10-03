# Phase 0 bench results: PARTIAL (1 of 10 images)

| | |
|---|---|
| Date | 2026-10-03 |
| Status | **Partial Phase 0.** §4.3 and §4.4 were run in full on **one** image. §4.2 (A2) and §4.5 were **not run**. This is a signal-screening experiment: **not clinical validation, not longitudinal, and not evidence that skin changes** |
| Classification rule | `phase0/CLASSIFICATION_RULE.md`, written **after scoring and before any value was inspected**. Two declared deviations from it are listed in §6 |
| Authoritative decision | `docs/architecture/MEASUREMENT_METRIC_DECISION.md` |
| Engine | Production digest `sha256:668b1f56c4405b4aacad3b77076ac12c7d8e59a09bacc95693952a2e09455005` (`skin-scan:sha-7f3695e…`, `scan-0.1.5-provisional`, cv2 4.11.0), pulled read-only from ECR and run locally |
| Engine runtime | linux/amd64 image **under emulation on an arm64 Mac** (Docker Desktop 29.5.2): `--cpus 2 --memory 4g`, `ENV=production`, `MAX_CONCURRENT_SCANS=4`, a local bench secret. No production endpoint was called |
| Scoring path | `POST /scan?stats=both` over HTTP for every value (PROTOCOL §4.1). Never the offline scripts |
| Mapping | Every response was mapped through the frozen `toSkinState` (`lib/skin-state.ts`, unchanged since `dd9a3fe`). All 30 mapped to `kind: "skinstate"` |
| Source image | `skin-scan/fixtures/input_face.png`, sha256 `c1ec1f36…3f07`. 514 × 736 RGBA (alpha 255 everywhere), ICC "Display" (ignored, as the engine ignores it), no EXIF orientation. A **retouched studio portrait of one person**; licence provenance unrecorded. It is the only face image with a known in-repo history |

**Pinned inputs** (sha256, first 16 hex characters):

| File | sha256 |
|---|---|
| PROTOCOL.md | `b9b1078736cc8d57` |
| DATA_SPEC.md | `bff3c86e4da4952e` |
| ANALYSIS_PLAN.md | `ed370e3b31ff7c74` |
| ACCEPTANCE_CRITERIA.md | `57a7884f13fe1a34` |
| MEASUREMENT_VALIDATION_STATUS.md | `4f209085989629b7` |
| SKIN_STATE_CONTRACT_FINAL.md | `b2d194c554c0e32a` |

---

## 1. What was run against the protocol

| Protocol item | Run? | Detail |
|---|---|---|
| §4.1 pinned build | **Yes, deviated** | The exact production digest, but emulated amd64 on arm64, not native linux/amd64 hardware |
| §4.2 input fidelity (A2) | **NOT RUN** | No devices. The harness approximates the mobile client transform in PIL (long side ≤ 1280, JPEG q0.92), **not Chromium's encoder**. The source has no EXIF orientation, so "orientation applied once" is trivially true and was not tested |
| §4.3 determinism (A1) | **Yes, deviated** | 100 submissions × 5 inputs at concurrency 4, in 5 batches, each in a **freshly created container**. The 5 inputs are the source plus 4 perturbed variants, because only one source image exists (§3.7) |
| §4.4 responsiveness | **Yes, on 1 of 10 images** | Every pre-registered perturbation and level. One EXPLORATORY row was added (face-only b*), marked, and never used for a gate |
| §4.5 ColorChecker under real capture | **NOT RUN** | No hardware |

## 2. Method

1. **Masks:**
   - The engine's own steps (preprocess, MediaPipe detect, `make_region_masks`) were run in-process on the source (pinned skin-scan venv: mediapipe 0.10.21, opencv 4.11.0), **only** to place injections and to measure what was injected.
   - **Face injection** used the face-oval hull dilated by 12 px: 133,057 px, 35% of the frame.
   - **Background casts** were applied ≥ 40 px outside the face oval: 225,784 px.
   - Two assertions held: the face injection covers 100% of every region mask, and the background cast touches 0 region pixels.
2. **Perturbation:** applied to the original. Colour shifts were made in CIE L\*a\*b\* (skimage, D65) and converted back to 8-bit sRGB. Exposure was applied in linear light (× 2^EV). Blur used a Gaussian σ on the whole frame. Scale was a whole-frame `INTER_AREA` resize.
3. **Client transform:** long side ≤ 1280 (a no-op at 736 px), then JPEG q0.92. For the JPEG row, q0.75 **replaced** q0.92.
4. **Realised change:** the regional mean of the injected channel was measured on the bytes `/scan` received, decoded the way the engine decodes (PIL to BGR, OpenCV 8-bit Lab, decoded to CIE scale).
5. **Engine slope** is Δfield over Δrealised, OLS through the origin across all levels. **Harness slope** is Δrealised over the nominal level.
6. **One image means no confidence interval.** Every number below is a point observation.

## 3. OBSERVED

### 3.1 Harness fidelity
Realised over nominal, per region (cheeks, forehead, nose, chin):

| Shift | Ratio |
|---|---|
| Face a\* | 0.994–0.997 |
| Face L\* | 0.993–1.002 |
| Face b\* (exploratory) | 0.999–1.018 |

The injected change reached the engine essentially intact. Attenuation below is the engine's own.

### 3.2 Intended change (A3) and background leakage (A4)
Columns: engine slope (Δfield / Δrealised) · monotone across levels · worst \|Δ\| at a background ±10 a\* or b\* cast, as a % of the cast. **Bold** = the pre-registered gate fails (A3 outside 0.8–1.2; A4 > 10%).

| Field | Cheeks | Forehead | Nose | Chin |
|---|---|---|---|---|
| `colour.native.aStarMean` | 0.997 · mono · 1% | 1.000 · mono · 0% | 1.001 · mono · 1% | 0.991 · mono · 2% |
| `colour.native.aStarP90` | 1.004 · mono · 0% | 1.002 · mono · 0% | 1.003 · mono · 0% | 1.005 · mono · 0% |
| `colour.native.lStarMean` | 0.967 · mono · 3% | 1.014 · mono · 1% | 1.046 · mono · 4% | 0.973 · mono · 5% |
| `colour.native.bStarMean` (A3 exploratory) | *1.015* · mono · 1% | *1.008* · mono · 0% | *1.002* · mono · 1% | *1.007* · mono · 1% |
| `colour.corrected.aStarMean` | **0.514** · mono · **55%** | **0.491** · mono · **56%** | **0.506** · mono · **59%** | **0.577** · mono · **48%** |
| `colour.corrected.aStarP90` | **0.589** · mono · **50%** | **0.744 · non-mono** · **40%** | **0.745 · non-mono** · **40%** | **0.591** · mono · **50%** |
| `colour.corrected.lStarMeanPostClahe` | **0.429** · mono · 5% | **0.622** · mono · 8% | **0.310** · mono · 8% | 0.826 · mono · **12%** |
| `colour.corrected.bStarMean` (A3 exploratory) | *0.836* · mono · **69%** | *0.802* · mono · **71%** | *0.729* · mono · **71%** | *0.943* · mono · **57%** |

**Sign of the corrected-path leakage:**
- A background a\* cast of +10 moved the untouched face's corrected a\* by **−5.5** (cheeks).
- A background b\* cast of +10 moved corrected b\* by **−6.9**.

The background's colour is subtracted from the face.

### 3.3 Exposure (global, linear light)
Δ in field units at −1 / −0.5 / +0.5 / +1 EV:

| Field | Cheeks | Chin (most extreme) |
|---|---|---|
| native `lStarMean` | −13.9 / −7.1 / +8.4 / +17.3 | −11.4 / −5.9 / +7.1 / +14.5 |
| native `bStarMean` | −4.8 / −2.4 / +2.9 / +5.6 | −3.9 / −2.1 / +2.4 / +5.2 |
| native `aStarMean` | −2.3 / −1.2 / +1.3 / +1.3 | −2.6 / −1.4 / +1.3 / +3.2 |
| corrected `lStarMeanPostClahe` | −6.8 / −3.0 / +2.5 / +5.5 | −7.1 / −3.3 / +3.3 / +6.5 |
| corrected `aStarMean` | −0.3 / −0.1 / +0.2 / −0.1 | −1.0 / −0.5 / +0.3 / +1.5 |

**Native `aStarMean` is non-monotone at +1 EV** on forehead (+1.23 at +0.5 → −0.78 at +1) and nose. That is consistent with highlight clipping. All regions are in `results/summary.md`.

### 3.4 Texture and specular confounders
For each field: the chroma-only spread (the worst \|Δ\| under face or background a\*/b\* shifts, which change no texture), then the response to each confounder, as % of baseline. Cheeks are shown; all regions are in `results/summary.md`.

| Field (cheeks baseline) | Chroma-only spread | Blur σ 0.5 / 1 / 2 | Scale 0.8 / 0.6 | JPEG 0.75 | Exposure −1 / +1 EV |
|---|---|---|---|---|---|
| `laplacianVarMean` (277.6) | 2.3% | −7.7 / −32.1 / −52.9% | +46.9 / +181.9% | +28.6% | −11.6 / +11.6% |
| `lbpEntropy` (2.731 bits) | 0.9% | −0.3 / −2.0 / −2.6% | −1.0 / −1.2% | +2.0% | +3.6 / −1.3% |
| `gradientMean` (2276) | **20.7%** | +9.4 / +34.5 / +107.8% | −34.4 / −74.6% | +98.2% | +62.4 / +36.1% |
| `specular.fraction` (0.170) | **33.7%** | +1.8 / +5.0 / +3.4% | +3.4 / +13.6% | −0.5% | **−92.1 / +74.0%** |
| `pixelCount` (42,164) | 1.8% | 0.0 / −0.1 / +0.7% | −38.1 / −67.2% | +0.9% | +0.1 / +0.3% |

**Across all regions:**
- **`gradientMean`'s chroma-only spread is 21–59%.** It reaches +654% (forehead) and +1,639% (nose) at +1 EV.
- **`specular.fraction`** moves 21–57% under the chroma-only perturbations; the largest single cause is a background-only a\* cast of −10 (+33.7% on cheeks). It reaches −100% (chin) at −1 EV.
- **`lbpEntropy`:**
  - Chroma-only spread is 0.8–1.3%.
  - Blur σ 2 gives −0.1% (chin) to −7.8% (nose). On chin the response is non-monotone and inside the chroma-only spread.
  - JPEG q0.75 gives +1.3% to +3.7% in every region.
  - −1 EV gives +1.8% to +5.0% in every region.

**Mechanism check, `gradientMean`** (`hydration.py`: `grad_raw = mean(1/(|∇| + 1e-6))`). Recomputed in-process on the transmitted baseline, it reproduces the engine value (cheeks 2278.0 vs 2276). **More than 99.99% of the value comes from pixels whose gradient is exactly 0**: 96 of 42,143 on cheeks, 166 of 31,524 on forehead. Each such pixel contributes 10⁶. Over the non-zero pixels the mean is 0.04–0.08. The field is a scaled count of flat pixels, not a gradient mean.

**Mechanism, `specular.fraction`** (`oiliness.py`): fixed thresholds (V > 200, S < 80, |∇| < 50) on the **gray-world + CLAHE + gamma** image. A background-only cast changes the whole-frame gray-world gains, and so changes the face's V.

### 3.5 D1 ITA (derived from native L\* and b\*)
- **Face L\* shift −2 / −4 / −8:**
  - The engine's ΔITA on cheeks was −4.3 / −9.2 / −19.0°.
  - The ITA expected from the realised L\* and b\* change was −4.9 / −9.8 / −19.4°.
  - Every region agrees within 1.1°.
- **Exposure ±0.5 EV moved cheek ITA by −18.7° / +16.9°.** That is as much as the −8 L\* face shift.
- **Exploratory face b\* +8:** cheek ITA −0.5°, chin +7.9°. Chin's baseline ITA is −26.7°, at L\* 40.

### 3.6 Histogram adequacy
- **Baseline clip mass** (underflow + overflow per pixel) is 0 in every region and histogram, except two on the nose:
  - corrected `aStarHist` nose: 0.32%
  - native `localLContrastHist` nose: 0.32%
- **Under face a\* +8,** corrected `aStarHist` clip mass on the nose rose to **1.6%**, above the C6 1% line. Native `aStarHist` stayed at 0.
- **Histogram centroid shift under face a\* +8:**
  - native: +7.85 to +7.91 (about the realised shift)
  - corrected: +3.97 to +4.62

### 3.7 Determinism (A1)
- **Setup:** 5 batches. Each batch ran in a **newly created container** of the pinned digest and sent 20 copies of each of the 5 inputs (100 requests) at concurrency 4. All 500 returned HTTP 200.

| Input | Submissions | Distinct canonical responses |
|---|---|---|
| `baseline_0` | 100 | 1 |
| `faceA_4` | 100 | 1 |
| `faceL_-4` | 100 | 1 |
| `exposure_-1` | 100 | 1 |
| `blur_1` | 100 | 1 |

- **Bit-identical.** Each input's response also equals the one from the earlier matrix run, in a different container.
- **A1 is met on this platform** (emulated amd64): max \|diff\| = 0 for every field.
- **Not established:** identity on native linux/amd64 hardware, or against the live ECS tasks.
- **Note:** the container's own healthcheck (2 s timeout) reported `unhealthy` under concurrency-4 load while every request still succeeded. That is a load observation, not a measurement issue.
- **This answers Q3 only for the engine itself.** It says nothing about noise from re-positioning or from day to day.

### 3.8 Deprecated scores (documenting failure only; ANALYSIS_PLAN §7)
- **Face a\* +8:** `redness` went from 0.307 to 0.362. **+1 EV with no colour change** moved it to 0.369.
- **`hydration`:** 0.199 at baseline, 0.006 at +1 EV, 0.131 at −1 EV.
- **`oiliness`:** 0.163 at baseline, 0.038 at −1 EV, 0.314 at +1 EV.

A score moves at least as much under a pure exposure change as under the injected change it names.

## 4. Answers to the eight questions

| # | Question | OBSERVED | INFERRED | NOT ESTABLISHED |
|---|---|---|---|---|
| 1 | Expected direction? | Native a\*, L\* and P90 (and exploratory b\*): yes, slope 0.97–1.05 everywhere. Corrected a\*, L\* and P90: right sign, 31–83% of the change | The native path passes injected colour straight through. The corrected path discards about half of a face-only a\* change | Any direction for texture or specular: no texture or shine change is pre-registered |
| 2 | Monotone? | Every native colour field: yes. Corrected `aStarP90` is non-monotone on forehead and nose. Native `aStarMean` is non-monotone at +1 EV (forehead, nose) | Integer quantisation (P90 has a resolution of 1 unit) plus suppression breaks monotonicity on the corrected path. Highlight clipping breaks it at +1 EV | Monotonicity under real skin change |
| 3 | Distinguishable from numerical instability? | **Determinism:** 500/500 bit-identical (§3.7). **Small-input sensitivity:** `gradientMean` (spread 21–59%) and `specular.fraction` (21–57%) are not; `lbpEntropy` (≈1%) and `laplacianVarMean` (2–7%) are, for blur (σ ≥ 1, except `lbpEntropy` chin), scale (`laplacianVarMean`; for `lbpEntropy`, scale 0.8 stays inside the chroma-only spread except on cheeks, and scale 0.6 just exceeds it on 3 of 4 regions with inconsistent sign) and JPEG | `gradientMean` is unstable **by definition**: one flat pixel adds 10⁶ | Between-capture, between-day noise. Bit-identity says nothing about re-positioning noise |
| 4 | Stable across regions? | Native colour slopes are within 0.967–1.046 in all 4 regions. Corrected L\* ranges 0.31–0.83 | CLAHE is tile-local, so suppression depends on where the region sits | Regions on other faces, beards, or other tones (one image; MST not rated) |
| 5 | Collapses under lighting or exposure? | Native colour does not collapse, but is **dominated**: 0.5 EV ≈ 5.9–9.0 L\* units, about the whole −8 L\* injection; 2.0–2.9 b\* units; 1.1–1.4 a\* units. `specular.fraction` collapses (−92% to −100% at −1 EV) | An unnoticed half-stop exposure difference between two captures exceeds the injected changes this bench used. C4 (illuminant and exposure) is the dominant risk for every surviving field | Real-illuminant behaviour (not run, §4.5). Whether phone auto-exposure holds face L\* stable |
| 6 | Does the corrected path suppress the change? | Yes. About 50% of a face-only a\* shift is removed. The background cast is **subtracted** from the face (48–59% a\*, 57–71% b\*) | Whole-frame gray-world (the face is 35% of the frame here, versus 100% in CALIBRATION.md's 93% figure). Suppression therefore depends on how much of the frame the face fills, which is a framing confound | The exact suppression on other framings |
| 7 | Does the uncorrected path behave differently? | Yes. Slope about 1, leakage ≤ 5%. It is far more exposure-sensitive than the corrected L\* | Native is scene-independent, but its slope of about 1 was **close to guaranteed by construction**: the native path only resizes, and the realised shift was measured with the same 8-bit Lab conversion. The bench shows nothing hidden (normalisation, mask coupling) breaks it, **not** that phones deliver face colour faithfully. It carries the camera's exposure and white balance | Whether phones' own auto white balance re-introduces a gray-world-like effect (needs real capture, §4.5 and Phase 1) |
| 8 | `lbpEntropy` stable enough? | The smallest chroma-only spread of any texture field (≈1%). At scale 0.8, inside its chroma-only spread on 3 of 4 regions; at 0.6, just outside it on 3 of 4, with inconsistent sign. **JPEG +1.3% to +3.7% and −1 EV +1.8% to +5.0% everywhere.** The blur response is region-inconsistent, and inside the noise on chin. The dynamic range on this image is 2.26–2.91 bits | Stable to colour and scale. Sensitive to compression and exposure (noise adds micro-pattern). The source is retouched, so its texture is not representative | **That it responds to skin texture at all.** No pre-registered texture change exists. Its noise floor relative to between-person spread is unknown |

## 5. Per-field classification
Regions: C = cheeks, F = forehead, N = nose, Ch = chin. "Surface?" means whether the field should ever be shown to users.

| Field | Regions | Experiment | Observed response | Failure mode | Interpretation | Surface? | Class |
|---|---|---|---|---|---|---|---|
| `colour.native.aStarMean` | C F N Ch | §4.4 face a\*, bg casts, exposure | Slope 0.991–1.001, monotone, leakage ≤ 2% | Exposure ±0.5 EV ≈ ±1.1–1.4 a\* units. Non-monotone at +1 EV | Passes A3 and A4 on one image. Responsive to a face-only a\* change and blind to the background | Not now. At most "beyond measurement noise", after Phases 1–3 **and** production `stats=both` (D-07) | **KEEP FOR HUMAN VALIDATION** |
| `colour.native.lStarMean` | C F N Ch | face L\*, bg, exposure | Slope 0.967–1.046, monotone, leakage ≤ 5% | 0.5 EV ≈ 5.9–9.0 L\* units, about the whole −8 injection | Passes A3 and A4. The most exposure-confounded KEEP field | Same as above | **KEEP FOR HUMAN VALIDATION** |
| `colour.native.aStarP90` | C F N Ch | face a\*, bg | Slope 1.002–1.005, leakage 0% | Integer-valued (resolution 1 a\* unit) | Passes the gates. Carries the same information as `aStarMean` at coarser resolution | Same as above | **KEEP** (secondary; not in the final set, §7) |
| `colour.native.bStarMean` | C F N Ch | bg casts (A4); face b\* EXPLORATORY | A4 leakage ≤ 1%. Exploratory slope 1.002–1.015 | 0.5 EV ≈ 2.0–2.9 b\* units. **No pre-registered A3 exists** | Probably responsive; not screened by the protocol | Not now | **INCONCLUSIVE** (protocol gap) |
| D1 ITA (native) | C (primary) | face L\*, exposure | Tracks the realised ITA change within 1° | ±0.5 EV ≈ ±17–19° | Follows its inputs. b\* is unscreened | No | **INCONCLUSIVE** |
| `colour.native.aStarSd` | C F N Ch | bg, all | Leakage ≤ 2.7%. +1 EV adds +3.3 to +5.6 | No intended change exists | Not screened | No | **INCONCLUSIVE** |
| `colour.native.lStarSd` | C F N Ch | bg, all | Leakage ≤ 4.5%. Exposure ±3.3–3.9 | No intended change exists | Not screened | No | **INCONCLUSIVE** |
| `colour.native.aStarHist`, `colour.native.localLContrastHist` | all | face a\* | Centroid +7.9 under +8. Clip mass 0 (nose 0.32% for contrast) | Redundant with the scalars | Not screened separately | No | **INCONCLUSIVE** |
| `colour.corrected.aStarMean` | C F N Ch | face a\*, bg | Slope 0.49–0.58. Leakage 48–59%, opposite sign | Fails A3 and A4 everywhere | Whole-frame gray-world: it measures the face **relative to the scene** | Never (this engine) | **DROP** |
| `colour.corrected.aStarP90` | C F N Ch | face a\*, bg | Slope 0.59–0.75, non-monotone on F and N, leakage 40–50% | Fails A3 and A4 | Gray-world plus integer quantisation | Never (this engine) | **DROP** |
| `colour.corrected.lStarMeanPostClahe` | C F N Ch | face L\*, bg | Slope 0.31–0.83. Leakage 5–12% | Fails A3 everywhere; fails A4 on chin | CLAHE (tile-local) plus gamma compress lightness change, in a way that depends on the region | Never (this engine) | **DROP** |
| `colour.corrected.bStarMean` | C F N Ch | bg (A4) | Leakage 57–71%, opposite sign | Fails A4 everywhere | Gray-world | Never (this engine) | **DROP** |
| `colour.corrected.aStarSd` | C F N Ch | bg (A4) | Leakage up to 11.7% (N), 10.7% (F) | Fails A4 with a mechanism | Gray-world gain changes alter chroma spread | Never (this engine) | **DROP** |
| `colour.corrected.lStarSdPostClahe` | C F N Ch | bg | Leakage ≤ 3.8%. Exposure −2.2 to +2.5 | No intended change exists | CLAHE redistributes lightness by design | No | **INCONCLUSIVE** |
| `colour.corrected.aStarHist` (+clip) | all | face a\* | Centroid +4.0–4.6 under +8. Nose clip mass reached 1.6% | Same suppression as the mean; clips at C6 | Redundant with a dropped scalar | No | **INCONCLUSIVE** (by rule; same mechanism as the dropped mean) |
| `texture.localLContrastHist` (corrected) | all | confounders | Clip mass 0 | No intended change exists | Not screened | No | **INCONCLUSIVE** |
| `texture.laplacianVarMean` | C F N Ch | blur, scale, JPEG | Monotone with blur (−28% to −37% at σ 1). Scale 0.8 gives +36% to +62%; JPEG +27% to +32%. Chroma-only spread 2–7% | **Condition-sensitive:** camera distance and compression move it more than blur does | Sharpness and framing statistic | No | **INCONCLUSIVE** |
| `texture.lbpEntropy` | C F N Ch | blur, scale, JPEG, exposure | See Q8 | JPEG and exposure sensitivity. Blur response region-inconsistent | Weakly confounded, but no evidence it tracks texture | No | **INCONCLUSIVE** |
| `texture.gradientMean` | C F N Ch | all + mechanism check | Chroma-only spread 21–59%. Up to +1,639% at +1 EV | A defect in the statistic's definition: > 99.99% of the value is 10⁶ × (count of zero-gradient pixels) / N | Not a gradient measurement. A flat-pixel counter dominated by quantisation | Never (this engine) | **DROP** (declared deviation 1, §6) |
| `specular.fraction` | C F N Ch | bg, exposure | Background-only cast moves it 21–57%. −1 EV gives −24% to −100% | Fixed V threshold on the gray-world-corrected image | Measures scene and exposure as much as the face | Never (this engine) | **DROP** (declared deviation 2, §6) |
| `pixelCount` | all | all | Scale −36% to −38% at 0.8. Otherwise ≤ 2.8% | — | Quality covariate, not a candidate | n/a | Not a candidate |
| Deprecated `scores` / `region_scores` | — | §3.8 | Exposure moves them as much as the named change | Image-relative | Deprecated already | Never | Not a candidate (failure documented) |

## 6. Declared deviations from CLASSIFICATION_RULE.md
The pre-written rule listed only "non-deterministic or degenerate response" as DROP triggers for texture and specular. Both deviations below use the rule's own general principle: DROP may rest on one image when it rests on an identified engine mechanism.

1. **`texture.gradientMean` → DROP.**
   - The mechanism is a defect in the statistic's definition, verified numerically (§3.4).
   - The contract already records the inverse-gradient domination for hydration (SKIN_STATE_CONTRACT_FINAL §2), but keeps `grad_raw` as "grey-level per px". This bench shows the value is not in those units.
   - The contract is **not** changed here. A future contract version should deprecate the field.
2. **`specular.fraction` → DROP.**
   - The mechanism is a whole-frame gray-world gain feeding a fixed brightness threshold.
   - It is shown by a background-only cast moving the face statistic by up to 57%, with no face pixel changed.
   - This is the same class of evidence that drops the corrected colour fields under A4.

Without these deviations, both fields would be INCONCLUSIVE. Neither is in the final candidate set either way.

## 7. What this does and does not support

**OBSERVED:**
- On one retouched image of one person, on the production digest under emulation:
  - native-path a\* and L\* pass a face-only injected change through with slope about 1;
  - they ignore background-only casts;
  - they respond strongly to global exposure.
- The corrected path removes about half of a face-only change, and imports the background's colour with opposite sign.

**Caveat on the KEEP result:** the native path only resizes, so slope ≈ 1 and near-zero leakage were close to guaranteed by construction. The informative Phase 0 results are the corrected-path DROPs and the size of the exposure effect. The tests that can really fail the KEEP fields are §4.5 (ColorChecker under real capture) and ACCEPTANCE C4.

**INFERRED:**
- Only the native colour path can carry a face colour change in this engine.
- Exposure and illuminant control or detection (ACCEPTANCE C4) will decide whether even native fields survive real capture.
- Texture fields are framing and compression statistics until shown otherwise.

**NOT ESTABLISHED:**
- Anything about skin.
- Behaviour on other faces, on other tones (the subject's MST was not rated), or with beards.
- Behaviour on real phones (A2, §4.5 not run).
- Between-capture or between-day noise.
- Whether any surviving field tracks a real physiological change (Phase 4).

**Surviving fields are photo statistics, not skin measurements.**

## 8. Reproduce
From the skin-check repo root:

```
# 1. Engine: pinned digest, local only
docker run -d --name p0-engine --platform linux/amd64 -p 127.0.0.1:18000:8000 \
  -e ENV=production -e SCAN_API_SECRET=<local> -e MAX_CONCURRENT_SCANS=4 -e SCAN_TIMEOUT_SECONDS=300 \
  --cpus 2 --memory 4g <ecr>/skin-scan@sha256:668b1f56…
# 2. Matrix and determinism (skin-scan's pinned venv)
cd docs/research/measurement-validation/phase0
SKIN_SCAN_REPO=../../../../../skin-scan SCAN_SECRET=<local> OUT_IMG=<scratch> \
  ../../../../../skin-scan/.venv/bin/python bench.py matrix
RESTART_CMD=<recreate container and wait for /health/ready> … bench.py determinism
# 3. Map through skinstate-1, then analyse
cd - && npx vite-node docs/research/measurement-validation/phase0/to_skinstate.mts
cd docs/research/measurement-validation/phase0 && ../../../../../skin-scan/.venv/bin/python analyse.py > results/summary.md
```

**Committed:**
- `bench.py`, `to_skinstate.mts`, `analyse.py`, `CLASSIFICATION_RULE.md`
- `results/`: `matrix.json` (full responses, with realised shifts and transmitted-image hashes), `skinstates.json`, `determinism.json`, `summary.json`, `summary.md`

**Images are not committed.**
