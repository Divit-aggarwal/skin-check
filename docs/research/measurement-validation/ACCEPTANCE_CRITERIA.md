# Measurement validation: ACCEPTANCE_CRITERIA

These decide, per **field × region**, whether its `uncertainty` may move from `unknown` to `calibrated` (SKIN_STATE_CONTRACT_FINAL §6), and so whether it may ever enter a pairwise change comparison (LONGITUDINAL_METHOD).

**Passing changes nothing else in the frozen contract.**
- No field is renamed or reclassified. A rename or reclassification needs a new `contractVersion`.
- Nothing becomes a skin claim without §E.

Every threshold is labelled:
- **[E]** evidence-backed convention
- **[D]** design choice (owner may change it before pre-registration, never after)
- **[S]** statistical necessity

---

## A. Phase 0: bench gates (per field; must pass before any human data counts)

| # | Criterion | Threshold | Label |
|---|---|---|---|
| A1 | Determinism on the pinned digest (fresh containers, concurrency 4, 100 runs × 5 images) | Bit-identical, **or** max \|diff\| ≤ 1% of the field's provisional MDC95 (the pilot estimate) | [D] |
| A2 | Input fidelity: the harness transform matches real-device uploads | ΔRGB ≤ 1 on ≥ 99.9% of pixels; orientation applied exactly once | [S] |
| A3 | Responsiveness to an intended face-only change (colour fields) | Slope 0.8–1.2 (1.0 = the full injected change appears) | [D] |
| A4 | Background leakage (colour fields) | Response to a background-only ±10 cast ≤ 10% of the cast | [D] |
| A5 | Texture confounders | Response to σ = 1 px blur and 0.8× scale **reported**. A field whose blur or scale response exceeds its provisional MDC95 is marked **condition-sensitive**: it can pass only if a quality producer can detect that condition (§C4) | [D] |

**Fail on A3 or A4 means the field is excluded from the claim.** It may be repeatable, but it does not respond to the thing it names.

**Expected result:** the corrected-path a* and L* fields fail A3 and A4 (gray-world removed about 93% of a synthetic a* shift in CALIBRATION.md).

## B. Phase 1: feasibility gates (study-level, not field-level)

| # | Criterion | Threshold | Label | If it fails |
|---|---|---|---|---|
| B1 | Retention to D28 | ≥ 80% per band | [D] | Redesign compensation or schedule before Phase 2 |
| B2 | Engine failure rate (`E_NOFACE` + `E_ABSENT` on primary regions), N arm | ≤ 10% of captures per band | [D] | Investigate the band (mask failure on dark or bearded skin is itself a finding) |
| B3 | Protocol adherence (`E_PROTOCOL`), N arm | ≤ 15% | [D] | Improve the instructions |
| B4 | MST inter-rater agreement | weighted κ ≥ 0.60 | [D] | Retrain raters or add an instrument ITA |
| B5 | Sample-size re-estimation | done, and n adjusted upward if needed (ANALYSIS_PLAN §8.3) | [S] | — |

## C. Phase 2: per field × region, **every tone band**, N arm, single captures

All of C1–C5 must hold in **each** band (T1, T2, T3).

**A field that fails in any band fails for every user.** This follows the contract's most-conservative-band policy. It also avoids a product that detects change for lighter-skinned users only.

| # | Criterion | Threshold | Label |
|---|---|---|---|
| C1 | Relative reliability: ICC_long (ICC(A,1), between days) | **Lower** 95% bound ≥ **0.70** | [E] threshold (COSMIN), [D] applied to the lower bound |
| C2 | Precision of the noise floor | SEM upper 95% bound ≤ 1.25 × SEM point estimate. This needs df that n = 30 per band and 3 days provide | [S] |
| C3 | Usefulness: the noise floor relative to the population | MDC95 (from the SEM upper bound) ≤ **0.5 × σ_subj** for that band | [D]. EVALUATION_PLAN's reject line was > 1.5 σ_subj. 0.5 means the field can detect a change smaller than half the spread between people; anything larger is detectable only in extreme cases |
| C4 | Condition robustness | Illuminant effect (COND block) ≤ MDC95, **or** a versioned quality producer exists that detects the condition and makes such pairs "not comparable" | [D] |
| C5 | No systematic drift in a stable cohort | \|D28 − D0 mean difference\| ≤ 0.25 × MDC95 (point), with its CI including 0 | [D] |
| C6 | Histogram adequacy (histogram-derived fields only) | `histClipMass` ≤ 1% in that band | [D] |

**Averaging lever.** If a field fails C1–C3 at m = 1 but passes at m = 3 (ANALYSIS_PLAN §3.3), it is marked **pass-conditional-on-m3**. It becomes usable only if the product changes capture to take and average 3 frames. That is a capture-side change, so it needs Phase-1-sized confirmation in all bands (PROTOCOL §8).

**Controlled arm (C).** Reported, never used for the product table. A field passing in C but failing in N is the quantified case for building a face guide and quality gate.

## D. Phase 3: held-out validation (frozen calibration values, validation users only)

| # | Criterion | Threshold | Label |
|---|---|---|---|
| D1 | False-change rate on stable day pairs (\|Δ\| > calibration MDC95), pooled across bands | Point ≤ 7.5% **and** cluster-bootstrap upper 95% bound ≤ 10% | [D]. 5% is expected by construction; the margin covers estimation error at about 45 validation users |
| D2 | Per-band false-change ceiling | Point ≤ 12.5% in each band | [D] |
| D3 | SEM transfer | Validation SEM inside the calibration 95% CI | [S] |
| D4 | Band-flip rate (only if a band formula is proposed for display) | ≤ 15% of stable pairs flip, and ≤ 1% jump two or more bands; weighted κ lower bound ≥ 0.60 | [D] (κ ≥ 0.60 from EVALUATION_PLAN) |

**Fail on D1 or D2 means no calibration is published.** The calibrated MDC is overfitted to the calibration users and does not transfer.

## E. Phase 4: criterion validity and responsiveness (claim (b) only)

These are required before **any** wording implying that the skin changed. Until E passes, passing fields support only "this photo measurement differs from your baseline by more than measurement noise".

| # | Criterion | Threshold | Label |
|---|---|---|---|
| E1 | Agreement with the reference colorimeter (native L*, a* or b* vs instrument at the matched site) | Bland–Altman 95% limits of agreement (LoA) are reported. The **bias must be stable across bands** (between-band bias difference ≤ 0.5 × phone MDC95). A constant offset is acceptable; an offset that varies with tone is not | [D] |
| E2 | Responsiveness: phone Δ vs instrument Δ under a benign, IEC-approved induced change | Spearman ρ ≥ 0.50 (lower 95% bound ≥ 0.30) | [D] |
| E3 | Sensitivity to instrument-confirmed change | ≥ 70% of instrument-confirmed changes (> instrument MDC) flagged by the phone | [D] |
| E4 | Pre-registered construct hypotheses | ≥ 75% confirmed | [E] (COSMIN convention) |

## F. Production thresholds once fields pass

These rules bind LONGITUDINAL_METHOD when a calibration table is published.

1. **The calibration table is versioned** (`calibrationId`) and keyed by the comparability key. Its values are SEM and MDC95 **upper bounds**, per field × region × band.
2. **No tone classifier exists in production**, so use the most conservative band (the largest MDC95) for every user. A per-band MDC needs a validated tone classifier. That is a separate validation, and it may never be self-reported Fitzpatrick or per-photo engine ITA.
3. **A pair is comparable only if:**
   - all comparability-key components are non-null and equal
   - both captures pass any quality producer used in C4
   - the device model matches, or cross-device comparability was shown in the C arm (device effect ≤ 0.5 × MDC95)
4. **Pairwise verdict:** |Δ| > MDC95 means "beyond measurement noise". Otherwise it is "within measurement noise". There is no "trend" claim below 10 comparable points (LONGITUDINAL_METHOD).
5. **Wording ceiling:** without §E, "beyond measurement noise" is the maximum claim. Never "improved", "worse", "your redness increased", "the product worked".
6. **Expiry and re-test:**
   - An **engine digest change** triggers a replay (PROTOCOL §8). The table is republished or withdrawn.
   - A **capture-side change** triggers new human data.
   - **Phone OS ISP updates** cannot be detected. Re-run a Phase-1-sized check yearly. The cadence is a design choice.

## G. Failure cases, and what each means

| Failure | Meaning | Consequence |
|---|---|---|
| Field fails A3/A4 (unresponsive or leaky) | It measures the preprocessing or the scene, not the face | Excluded permanently for this engine. Fix in the engine, then bump the version and re-run Phase 0 |
| Fails C1 and C3 at all m | Day-to-day noise rivals between-person spread | Never shown as change. It may still be shown as a single-photo, labelled estimate |
| Passes C, fails N | Capture conditions dominate | Build a face guide and quality producer, then re-run the N arm |
| Fails C4 only | Lighting shifts exceed MDC, and production cannot see lighting | Needs a quality producer that detects the illuminant before any calibration is published |
| Fails in one band only | The engine or capture is tone-dependent (masking, exposure, histogram edges) | The field fails for everyone, and the band-specific cause is investigated. **Never ship band-differential change features** |
| Passes C1–C3, fails D1 | The calibrated MDC does not generalise | No table. Grow the calibration n and re-validate on new held-out users |
| C5 fails (drift) | Seasonal tanning, learning, or the device changes over 4 weeks | Shorten the baseline window, or add drift-aware baselines. Not publishable as is |
| B2 fails in one band | Masks fail on that band (beard, darker skin, low light) | **Blocks everything** until the engine is fixed: excluded captures bias the noise floor downward |
| Exploratory field looks good | Unconfirmed | Needs a new pre-registered confirmation run |

## H. What passing does NOT establish

- That the change matters to the user (MIC unknown).
- That any product caused a change (out of scope; banned).
- Validity for phone models, OS versions or capture flows that were not studied.
- Anything about the 7 legacy scores. They are documented as failing (ANALYSIS_PLAN §7) and remain deprecated.
