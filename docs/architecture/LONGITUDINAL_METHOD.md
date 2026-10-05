# LONGITUDINAL_METHOD: when the system may say something changed

Status: PLANNING.

**Headline:** with the engine as it is today, the honest longitudinal output for every metric is "not comparable". This is by construction, not a validation gap. All 7 stored scores are normalised within each photo, so a score difference between two photos measures nothing about the skin.

This document defines:
- the gates a metric must pass before change can be reported, and
- what the product shows until then.

## 1. Why the current scores cannot be trended

| Mechanism | Effect | Evidence |
|---|---|---|
| Per-image z-score, then min-max | Each photo is stretched to fill 0–1. Severity is divided out | redness.py:83-99; score_semantics.py (all `image_relative`) |
| Face-percentile thresholds (blemishes p70/p60) | About 30–40% of pixels fire *by construction*, on any face | blemishes.py |
| Whole-frame gray-world + CLAHE + gamma | Background and clothing shift face colour; absolute L* is destroyed | preprocess.py; CALIBRATION.md |
| Whole frame resized to 1024 px | Face pixel scale varies with camera distance; fixed-pixel kernels change meaning | compose.py |
| Phone ISP (AWB/AE/tone curve/beauty mode) | Runs before both corrected and native paths | arXiv 2512.21988 (ΔE00 10.6–13.3 vs DSLR) |

**Consequence:**
- No delta, arrow, "improving", sparkline or side-by-side numeric comparison may be shown.
- Gemini may not narrate change. Its package never contains two scans' values (GEMINI_BOUNDARY.md §4).
- The previous-scans list may show dates and photos only. An opened past check may show its own readings, always with the fixed line "Photos differ in light and angle. Differences between checks are not yet a measured change." (owner decision TD-24 (1), 2026-10-05; replaces O-D4).

## 2. The comparability table (code constant, all empty today)

```
COMPARABLE: Record<ComparableQuantity, { pipelineVersions: string[], calibrationId: string, mdc95ByToneBand: … }>
```

- A **ComparableQuantity** is a named absolute quantity drawn from SkinState `raw` / `rawNative`. One example is `pigment.native_lab_l_mean.{region}`. It is never an entry from `scores`.
- A quantity enters the table only after it passes the test–retest acceptance criteria in EVALUATION_PLAN.md §1. Its entry lists the pipeline versions over which the quantity's formula and masks are unchanged.
- Version boundaries already known:
  - 0.1.2: opencv provenance
  - 0.1.4: region masks rebuilt
  - 0.1.5: pores formula changed
  - Any future cheek split or eyebrow subtraction will also be a boundary.
- **Prediction (Agent 2, an assumption):** native L*/ITA per region (pigment) and `lbp_entropy` (texture) are the only plausible early entries. Redness agreement with clinical imaging is poor in the literature: a* ICC 0.15–0.24 against VISIA, even though phone test–retest ICC was 0.85 (Ouyang 2026). Hydration and pores have no salvageable quantity.

## 3. Gate sequence (applies only to quantities in the table)

For a pair or series of SkinStates of the same user:

1. **Same comparability key.** The two states must match on all of:
   - `pipelineVersion`, listed for this quantity
   - `engineBuild` (image digest), because `PIPELINE_VERSION` is hand-edited and deploys are manual
   - `inputVariant`
   - `captureMethod`

   Cross-version continuity is possible only by re-running the stored `scored.jpg` under the new engine (exact replay). It is never possible by comparing across versions.
2. **Pairwise comparability verdict, per region:**
   - **comparable**
   - **comparable-with-caveats**: e.g. a different capture method, or lighting covariates outside a band
   - **not comparable**: e.g. `regionLowConfidence`, a different device class for colour quantities, or a quality failure

   The verdict is computed on read from capture metadata. Until a capture-quality block exists, the only inputs are `captureMethod`, coarse device family and `regionLowConfidence`. A metadata-only verdict is weak, which is why tiers stay conservative.
3. **Noise floor:** |Δ| > MDC95 for that quantity × region × tone band, taken from the calibration table. Never from a guessed constant.
4. **Baseline:** the median of the first 3 comparable scans, or of the first 14 days, never scan one. This guards against regression to the mean: users start at their worst.
5. **Primary output is pairwise.** The question is: "Is the latest comparable scan different from the baseline beyond MDC95, yes or no?" Both scans must pass the quality gate. This is the only tier designed for how people actually use the product (rare, irregular scans).
6. **Persistence is research-dependent.** Anhøj run/crossing tests need at least 10 regularly spaced points under one comparability key. Under the observed version churn (six versions, 0.1.0–0.1.5) and informative sampling, almost no user reaches that. Do not design UI for it yet. The five-point trend rule must never ship.

**Output tiers, user-facing:**

| Tier | Label |
|---|---|
| 0 | Can't compare yet (not comparable, no passed quantity, or no baseline) |
| 1 | Pairwise: "different from your starting checks by more than photo-to-photo variation" or "within photo-to-photo variation". Never "improved" or "worse" without the noise statement, and never attributed to a product |
| 2 | Pattern (LATER, research-dependent) |

- **Tone band for the noise lookup.** Do not use the self-reported Fitzpatrick answer (it describes burn response and fits MST 8–10 poorly), and do not use per-photo ITA (it is lighting-confounded). Use the **most conservative MDC95 across tone bands** until per-user data justifies more.
- **L/R regions** (if the cheek split is approved) are never displayed or compared across capture methods. Front-camera mirroring differs by OS, vendor and path, which would create fake asymmetry.

- Tier 3 ("association" with a product) and Tier 4 (on/off tests) from the research doc are **not adopted**. CLAUDE.md bans causal product-effect claims without explicit approval, and even "observed alongside" invites attribution in a brand's own app.

## 4. Sparse data, informative sampling, missingness

- **Expected reality:** users scan rarely and irregularly, mostly when their skin is bad. That is the informative-visit problem.
  - Persistence tiers need about 10 weeks of weekly compliance under one engine build. Most users will never reach that, which is why pairwise is the primary tier.
  - Users scan during flares, so the next scan will often look "better" through regression to the mean, whatever they did. The copy must never attribute a change.
  - The honest product mostly says "can't compare yet", and the plan must not promise more.
- **Mitigation by design:**
  - an optional scheduled check-in reminder (OPTIONAL, not CORE)
  - each SkinState tagged `scheduled | ad_hoc` (a field on skinChecks, added when reminders exist)
  - coverage shown in words, e.g. "4 checks over 6 weeks"
- Missing scans are treated as missing-not-at-random. Before any "improving" message, the result must hold under a pessimistic assumption about the missing points. Statistical weighting is LATER and research-dependent.

## 5. Confounders the method must name, not adjust away

- Lighting and background (gray-world)
- Device and capture-path change
- Camera distance
- Makeup
- Beard or fringe occlusion
- Menstrual cycle (the doc cites +25% inflammatory lesions in the luteal phase)
- Season / monsoon
- Stress and sleep
- Regression to the mean
- Settling after starting tracking

These are surfaced as named alternative explanations next to any Tier 1–2 statement. No harmonisation:
- No ComBat.
- No histogram matching across sessions. It deletes the signal by construction.

## 6. Engine change and re-baselining

- A `pipelineVersion` bump that affects a quantity closes its epoch. Trends are never drawn across epochs.
- **Re-baselining options:**
  - (a) Re-process consented originals under the new engine. This creates *new* SkinStates with `inputVariant: original_reprocessed`, which are their own epoch because the input differs from the live downscale.
  - (b) Start a new baseline window.
- A transition period of running both engines on new scans lets per-user offsets be estimated. This is LATER.

## 7. What ships before the study completes

- Single-scan bands with proxy labels and the existing disclaimer. Hydration and pores are hidden.
- A previous-scans list: dates, photos, statuses. No numbers across scans.
- Echo explains only the current scan, and says plainly that earlier checks can't be compared yet.
- Stored SkinStates with full `raw` data, so that whatever the study finds can be applied retroactively. **This is the only longitudinal deliverable that is time-sensitive:** every scan stored without `raw` is permanently unrescorable.
