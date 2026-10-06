# Measurement validation: ANALYSIS_PLAN

This plan is pre-registered: it is frozen before any Phase 2 data is unblinded. It is analysed per **field × region × tone band × arm**. The primary endpoints are P1–P5 and D1 (PROTOCOL §2.2), in the **N arm**; everything else is exploratory.

**Inference uses estimates with 95% confidence intervals throughout.** There is no null-hypothesis testing for "reliability exists". Decisions are made by comparing CI bounds with ACCEPTANCE_CRITERIA.

---

## 1. Unit of comparison

- **Production compares one capture with another capture.** The primary analysis unit is therefore the **single capture** (m = 1).
- Averaging m captures per occasion is analysed as a **design lever** (§3.3). It is not an assumption.

## 2. Variance-component model (primary)

For each field × region × arm, fitted separately per tone band and also pooled with band interactions:

```
y_ijsr = μ + β·X_ijsr + u_i + v_ij + w_ijs + e_ijsr

  i: participant         u_i  ~ N(0, σ²_subj)    between-person (true differences)
  j: study day (D0,D7,D28) v_ij ~ N(0, σ²_day)     day-to-day within person (biology + capture)
  s: block within day    w_ijs ~ N(0, σ²_sess)   AM vs PM session within a day
  r: capture in block    e_ijsr ~ N(0, σ²_cap)   re-positioning, sensor and engine noise
  X: fixed effects: day (time trend), block (AM/PM), device (own vs reference, C arm),
     illuminant and background (COND block), colour profile (sRGB/P3)
```

- **Fit:** linear mixed model by REML (`lme4::lmer` or `glmmTMB`).
- **CIs:** parametric bootstrap, 2,000 resamples, **resampling participants** (cluster bootstrap) for every derived quantity (ICC, SEM, MDC).
- **BURST block:** gives a fifth component, σ²_burst (no re-positioning), which isolates sensor plus engine noise from re-positioning noise.

**Why days, not captures, set the floor.** A production user's two scans are on different days. Same-day repeats estimate only σ²_cap (and σ²_sess). Using them alone would **understate** the noise floor, and that is the most common error in test–retest designs.

## 3. Reliability and measurement-error statistics

### 3.1 SEM (primary)

The longitudinal SEM for single captures on different days:

```
SEM_long = sqrt(σ²_day + σ²_sess + σ²_cap)
```

- It is computed **from the variance components**, not from SD·√(1−ICC). The ICC route depends on between-subject spread and would let a heterogeneous sample shrink the reported error.
- It is reported in the field's native unit (L*, a*, bits, fraction).
- The calibration table carries the **upper 95% bootstrap bound** of SEM. This is a design choice: it is conservative, so an MDC is never underestimated because of sampling error.

### 3.2 MDC95

```
MDC95 = 1.96 · √2 · SEM_long
```

This is the smallest change between two single captures that exceeds measurement error with 95% confidence. The formula is the COSMIN and de Vet convention (an evidence-backed convention, per the research doc, citing COSMIN 2024; not verified by this team).

**Heteroscedasticity.** Check with Bland–Altman of day pairs (difference against mean), and by regressing |residual| on the subject mean.
- If the error scales with level, analyse on the log scale (or logit for `specular.fraction`) and report the MDC as a **ratio**.
- If the error differs by tone band, that is captured by the per-band fits.

### 3.3 The averaging lever

```
SEM_m = sqrt(σ²_day + σ²_sess + σ²_cap / m)        m ∈ {1, 2, 3, 5}
```

- This answers whether asking a user for 3 quick captures and averaging them would make a field pass.
- It only helps when σ²_cap dominates. When σ²_day dominates, no amount of within-session averaging helps; only a longer baseline does (§3.4).

### 3.4 Baseline length

For a baseline of b occasions (the research doc proposes the median of the first 3), the error of the baseline is √(σ²_day,…)/√b, so:

```
MDC95_vs_baseline = 1.96 · sqrt(SEM_long² + SEM_long² / b)
```

Report it for b = 1, 2, 3.

### 3.5 ICC (secondary)

- **ICC(A,1): two-way, absolute agreement, single measurement** (McGraw & Wong), equivalent to Shrout–Fleiss ICC(2,1). It is computed from the same model:

  ```
  ICC_long = σ²_subj / (σ²_subj + σ²_day + σ²_sess + σ²_cap)
  ```

  Fixed effects for day and block enter as squared mean differences in the absolute-agreement denominator.
- Also reported:
  - ICC_sameday = σ²_subj / (σ²_subj + σ²_sess + σ²_cap)
  - ICC_burst
- ICC answers "can the field rank people?". SEM and MDC answer "can it detect change in one person?". **The product's change claims rest on MDC.** ICC is a gate because a field with poor relative reliability (ICC < 0.70) is not trustworthy enough to show.
- Koo & Li descriptor bands (<0.50 poor, 0.50–0.75 moderate, 0.75–0.90 good, >0.90 excellent) are reported for readability only. The primary source was not verified by the research doc's authors, and the bands are not used for decisions.

### 3.6 Systematic effects

- **Day fixed effect (time trend):** if the D28 − D0 mean difference is non-zero, there is systematic drift (seasonal tanning, learning to use the camera). Report it with its CI.
- **Block (AM/PM):** a diurnal effect, such as sebum and specular shine in the afternoon.
- **Device** (own vs reference, C arm): whether cross-device comparison is possible at all.
- **Illuminant and background** (COND): the size of the condition effect against MDC95. If **|illuminant effect| > MDC95** and production cannot detect the illuminant, cross-condition comparisons are unsafe. That is a failure mode in ACCEPTANCE §C4.

## 4. Ordinal agreement

**This applies only to bands derived from MEASURED fields under a versioned formula** (contract §5.6). The current 0.20/0.45 bands on deprecated scores are analysed only in §7, to document their failure.

For each candidate band formula, fixed on the calibration split:
- **Quadratic-weighted κ** between day pairs (D0–D7, D7–D28, D0–D28), single captures. Cluster-bootstrap CIs.
- **Gwet AC2** alongside κ. κ collapses when the prevalence is skewed, which band distributions usually are.
- **Band-flip rate:** P(band differs between two stable-period captures of the same person). This is the user-visible noise.
- **P(|Δband| ≥ 2):** a two-step jump in a stable person is a severe failure.

## 5. Field-specific handling

1. **`specular.fraction`.** Bounded and zero-inflated. Use the logit with an offset of 0.5/pixelCount, and fit a hurdle model as a sensitivity check. Report MDC on the logit scale and back-transformed at the band median.
2. **ITA (D1).** Derived from native L* and b*, and unstable as b* → 0. Report its MDC in degrees, and check that the b* distribution is far from 0 in every band.
3. **Histogram-derived fields** (exploratory: fractions of a*Hist above fixed edges). Report `histClipMass` per band. A band with clip mass > 1% means the fixed edges are wrong for that band, and the field is invalid there.
4. **Quality covariates.** This is a secondary analysis only: "what a gate would buy."
   - Refit with the study-only quality covariates (blur, exposure, face scale, yaw) as fixed effects. Also refit after excluding the worst 10% / 20% by a calibration-split-derived quality score.
   - The gain in MDC is the case for building a versioned quality producer (contract §7.2). It **does not** change the primary MDC, because production has no gate.
5. **Region contamination.** Analyse the beard and stubble subgroup separately for chin and cheeks, and report the `absent_region` and low-`pixelCount` rates by region × band.

## 6. Calibration / validation split by USER

**Assignment:**
- At enrolment, each participant is randomised, stratified by tone band × OS, to **calibration (≈2/3)** or **validation (≈1/3)**.
- Pilot participants (Phase 1) go to calibration only.
- **All captures of a participant stay in one split.**
- An image-level split leaks the person, so between-person signal would masquerade as reliability. The research doc cites GMLP 2021 for this (not verified by this team).

**Calibration split** is used for **all choices**:
- which exploratory fields to promote (none are promoted to the claim without a new pre-registration)
- transforms (log or logit)
- the averaging m
- the baseline length b
- band formulas and cut points
- quality-score construction
- the MDC table values

**Validation split** is used **once**, with everything frozen:

1. **False-change rate (primary validation endpoint).**
   - For every validation participant, every stable-period day pair (D0–D7, D7–D28, D0–D28), every region and every primary field: is |Δ| > MDC95 (calibration value, the conservative bound)?
   - The pooled rate should be about 5%. It is estimated with a cluster bootstrap over participants.
   - It is reported per band, but decided on the pooled rate plus a per-band ceiling (ACCEPTANCE §D).
2. **SEM transfer:** the validation-split SEM point estimate should fall inside the calibration-split 95% CI.
3. **Band-flip rate** using the frozen band formulas.

**Precision of the validation endpoint.**
- About 45 validation participants × 3 day pairs gives 135 pairs per field-region.
- If the true rate is 5%, the 95% CI half-width is about ±4–5 percentage points, after a clustering design effect of about 1.5.
- So the endpoint can distinguish "about 5%" from "≥ 12%", but not from "8%". This is stated so the acceptance rule is not over-read.

## 7. Documenting the deprecated scores (not candidates)

Run the same model on `scores.*` and `region_scores.*`, and the current 0.20/0.45 bands. Report SEM, MDC, ICC, κ and band-flip rates.

**Prediction** (EVALUATION_PLAN §1): all fail, because image-relative normalisation divides out between-person and between-day differences.

These numbers go into the STATUS doc as evidence for the deprecation already decided in the contract. They are never used to "calibrate" the scores.

## 8. Sample size: what is evidence, what is choice, what is unknowable

### 8.1 The research doc's figure, challenged

The research doc proposes "≥ 30 users spanning MST 4–9, ≥ 3 captures each under two lighting conditions, a second session at 4 weeks". EVALUATION_PLAN proposes n = 30, about 10 per band, "ICC CI ±0.1 at ICC ≈ 0.8".

| Element | Status | Assessment |
|---|---|---|
| "30" | **Design choice** (DECISION_LOG B7: Henseler had n = 19, wrinkles only; the 30 is the doc's own number) | No power justification is given |
| "±0.1 at ICC 0.8" | **Arithmetic, pooled only** | Bonett (2002) gives a full CI width of 0.2 (±0.1) at ρ = 0.8 and k = 3 with n ≈ 36. Close for the **pooled** sample. But acceptance is **per band**, and at n ≈ 10 per band the half-width is about ±0.2–0.25 |
| "≥ 3 captures" | **Misapplied** | Same-session captures inform σ²_cap, not the between-day floor. The k that matters for a longitudinal ICC/SEM is **distinct days** |
| "Two lighting conditions" | Sound as a **condition effect** block | Must not be pooled into the noise floor unless production lighting varies the same way (it does, which is why the N arm exists) |
| "4-week session" | Sound | Captures biological plus seasonal drift. Kept, plus a D7 midpoint so there are 3 days |
| ICC ≥ 0.70 threshold | **Evidence-backed convention** (COSMIN) | Kept, applied to the **lower** 95% bound (a stricter design choice, already in EVALUATION_PLAN) |
| ICC targets 0.85 / 0.70 "from Ouyang" | **Not evidence** (DECISION_LOG B6: not in the paper) | Not used |
| Ouyang ICC figures (0.85 vs "L 0.95" vs 0.15–0.24) | **Inconsistent across the repo's docs; unverified** | No threshold here rests on them |

### 8.2 Formulas and inputs (each input labelled)

**(a) Testing ICC ≥ ρ₀ (Walter, Eliasziw & Donner 1998)**

```
n = 1 + 2(z_{1−α} + z_{1−β})² · k / ((ln C₀)² · (k − 1)),
C₀ = (1 + kθ₀)/(1 + kθ₁),  θ = ρ/(1 − ρ)
```

- one-sided α = 0.05, power 0.80 (convention)
- k = number of **days**

| ρ₀ (null) | ρ₁ (assumed true) | k = 2 | **k = 3** | k = 4 |
|---|---|---|---|---|
| 0.50 | 0.70 | 63 | 40 | 33 |
| 0.60 | 0.80 | 39 | 27 | 22 |
| **0.70** | **0.85** | 42 | **30** | 26 |
| 0.70 | 0.90 | 18 | 13 | 12 |

- ρ₀ = 0.70 is the COSMIN convention: **evidence-backed as a convention**.
- ρ₁ = 0.85 is **a design choice / assumption**. No published test–retest exists for these fields. The Phase 1 pilot re-estimates it.

**(b) Precision of SEM (the quantity the product uses)**
- The 95% CI of a within-person SD is roughly ±1.96/√(2·df).
- The between-day component has df ≈ n(k_days − 1).
- With n = 30 per band and 3 days, df ≈ 60, giving **±18%** on SEM, and hence on MDC.
- With n = 10 per band, df ≈ 20, giving **±31%**. That is too loose to publish an MDC.

**(c) Bonett (2002) CI width for ICC.** n per band for a full width w at k = 3:

| ρ | w = 0.3 | w = 0.2 | w = 0.15 |
|---|---|---|---|
| 0.7 | 31 | 68 | 120 |
| 0.8 | 17 | 36 | 63 |
| 0.9 | 6 | 12 | 19 |

### 8.3 Resulting design

| Component | n per band | × 3 bands | Basis |
|---|---|---|---|
| Calibration | **30** completers | 90 | (a) with ρ₀ 0.70 vs ρ₁ 0.85 and k = 3, plus (b) ±18% SEM |
| Validation | **15** completers | 45 | §6 precision. The validation endpoint is pooled across bands |
| Completers | 45 | **135** | |
| Enrolled (assumed 15% attrition over 4 weeks; **an assumption**, re-estimated in the pilot) | 53 | **≈ 160** | |
| Pilot (counts toward calibration) | 6 | 18 | Feasibility plus variance re-estimation |

- **Internal pilot rule (pre-registered):** after Phase 1, recompute (a) and (b) using the pilot σ² estimates. The calibration n may **increase**, never decrease, and is capped at 45 per band. No field-level pass/fail decisions are taken on pilot data.
- **Multiplicity:**
  - 6 primary fields × 2 regions × 3 bands = 36 primary decisions. They are made by CI bounds, not p-values.
  - The pre-registered primary set limits the garden of forking paths. Exploratory fields are reported with the same CIs but **cannot** be promoted to the claim without a new pre-registered confirmation run.

### 8.4 Unknowable from this study

- **MIC:** how much change matters to a person.
- **Long-horizon drift** beyond 4 weeks: seasons, ageing, phone OS updates that change the ISP pipeline.
- **Generalisation to phone models absent from the sample.** Device-model coverage is reported. Unseen models are "not comparable" until covered.

## 9. Sensitivity analyses

1. Exclude participant-days carrying an `E_DEVIATION` flag (pre-registered categories only).
2. Restrict to sRGB-profile captures, and separately to Display-P3 captures (the engine ignores ICC).
3. Use only N-AM blocks, so time of day is consistent.
4. Exclude the beard and stubble subgroup, for chin and cheeks.
5. Replace REML with a Bayesian hierarchical model (weakly-informative half-t priors) for the bands with the smallest σ²_subj. This checks that the ICC estimates are not boundary artefacts.

## 10. Phase 0 and Phase 4 analyses

**Phase 0 (bench):**
- Perturbation slope ± CI per field. Background leakage is the response to a background-only cast, as a percentage of the cast.
- Determinism: the count of non-identical outputs, and the maximum absolute difference per field.
- Colour target: ΔE00 per device × illuminant, and the between-device ΔE on neutral patches.

**Phase 4 (criterion and responsiveness):**
- **Criterion validity:**
  - Bland–Altman of phone native L*, a* and b* (region mean) against the colorimeter at the matched site. Report bias and 95% limits of agreement per band.
  - Deming regression slope.
  - Lin's concordance coefficient.
- **Responsiveness:**
  - Correlation of phone Δ with instrument Δ across the induced-change timepoints.
  - The proportion of instrument-confirmed changes > instrument MDC that the phone flags as > phone MDC95 (sensitivity).
  - The proportion of instrument-stable pairs the phone flags (1 − specificity).
- **COSMIN-style hypotheses,** pre-registered, for example: "phone ΔL* correlates ≥ 0.5 with instrument ΔL*". Pass if ≥ 75% are confirmed.
