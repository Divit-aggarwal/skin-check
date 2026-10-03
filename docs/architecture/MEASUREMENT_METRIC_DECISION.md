# MEASUREMENT_METRIC_DECISION

**Authoritative record of which SkinState fields proceed into the human measurement-validation study.**

| | |
|---|---|
| Decision | **MD-1**, 2026-10-03 |
| Status | **ACCEPTED** for study design. It changes **no production behaviour and no contract**. The `skinstate-1` field names and classes are untouched |
| Evidence | [PHASE_0_RESULTS.md](../research/measurement-validation/PHASE_0_RESULTS.md): a **partial** Phase 0, on one image, on the production digest `sha256:668b1f56…`. Determinism: 500/500 bit-identical |
| Applies to | Engine `scan-0.1.5-provisional` only. Any engine change re-opens every row (ACCEPTANCE §G, PROTOCOL §8) |
| Supersedes | The P1–P5/D1 primary list in PROTOCOL §2.2, **for the human study only** (see §3) |
| DECISION_LOG | Not edited here, because uncommitted entries D-22 and D-24 belong to another session. Add **D-25 → this file** when those are committed |

**Nothing in this record is a skin measurement.** KEEP means "a photo statistic that passed bench screening and earns a human test–retest study". It does not mean valid, calibrated, comparable or showable.

---

## 1. Classes

| Class | Meaning | Consequence |
|---|---|---|
| **KEEP FOR HUMAN VALIDATION** | Passed the pre-registered bench gates A3 (slope 0.8–1.2) and A4 (leakage ≤ 10%) in every region | A primary endpoint in Phases 1–3, **conditional on** the complete Phase 0 confirming it (§4) |
| **DROP** | Failed a gate, or carries a defect, through an identified engine mechanism | Excluded from any change claim **for this engine version**. Not a study endpoint. Its raw values are still stored verbatim (DATA_SPEC §5) |
| **INCONCLUSIVE** | Not screenable under the frozen protocol, or confounded without a mechanism | Recorded passively in the study. **Not an endpoint**, no claim. Promotion needs a new pre-registered bench test |

## 2. Decision table

| Field | Regions | Class | Failure mode / limit | Ever surfaced to users? |
|---|---|---|---|---|
| `colour.native.aStarMean` | cheeks, forehead, nose, chin | **KEEP** | Exposure: ±0.5 EV ≈ ±1.1–1.4 a\* units | Only after Phases 1–3 pass, production sends `stats=both` (D-07), and the comparability key is complete. Wording ceiling: "beyond measurement noise" |
| `colour.native.lStarMean` | cheeks, forehead, nose, chin | **KEEP** | Exposure: 0.5 EV ≈ 5.9–9.0 L\* units, about the whole −8 L\* bench injection. **C4 is the main risk** | Same as above |
| `colour.native.aStarP90` | all | KEEP (secondary) | Integer-valued and redundant with `aStarMean`. **Not an endpoint** | No |
| `colour.native.bStarMean` | all | INCONCLUSIVE | No pre-registered face-b\* perturbation. Exploratory slope about 1 | Not until screened |
| D1 ITA | cheeks | INCONCLUSIVE | Depends on unscreened b\*. ±0.5 EV ≈ ±17–19° | Not until screened |
| `colour.native.aStarSd`, `colour.native.lStarSd` | all | INCONCLUSIVE | No intended change exists | No |
| `colour.native.aStarHist`, `colour.native.localLContrastHist` | all | INCONCLUSIVE | Redundant with the scalars | No |
| `colour.corrected.aStarMean` | all | **DROP** | Gray-world: slope about 0.5; background leakage 48–59%, opposite sign | Never (this engine) |
| `colour.corrected.aStarP90` | all | **DROP** | Gray-world plus quantisation: slope 0.59–0.75, non-monotone | Never (this engine) |
| `colour.corrected.bStarMean` | all | **DROP** | Gray-world: background leakage 57–71% | Never (this engine) |
| `colour.corrected.lStarMeanPostClahe` | all | **DROP** | CLAHE plus gamma: slope 0.31–0.83, region-dependent | Never (this engine) |
| `colour.corrected.aStarSd` | all | **DROP** | Gray-world: background leakage up to 11.7% | Never (this engine) |
| `colour.corrected.lStarSdPostClahe` | all | INCONCLUSIVE | CLAHE redistributes lightness by design | No |
| `colour.corrected.aStarHist`, `texture.localLContrastHist` | all | INCONCLUSIVE | Corrected a\* histogram clips above 1% on the nose under a +8 shift | No |
| `texture.laplacianVarMean` | all | INCONCLUSIVE | Blur σ 1: −28% to −37%. Scale 0.8×: +36% to +62%. JPEG 0.75: +27% to +32%. A framing and compression statistic | No |
| `texture.lbpEntropy` | all | INCONCLUSIVE | About 1% chroma-only spread. JPEG +1.3% to +3.7%; −1 EV +1.8% to +5.0%. Blur response region-inconsistent. **No evidence it tracks texture** | No |
| `texture.gradientMean` | all | **DROP** | Definition defect: > 99.99% of the value is 10⁶ × (zero-gradient pixel count) / N | Never (this engine). A future contract version should deprecate it |
| `specular.fraction` | all | **DROP** | Fixed V threshold on the gray-world image. A background-only cast moves it up to 57%; −1 EV gives up to −100% | Never (this engine) |
| `pixelCount` | all | not a candidate | Quality covariate | n/a |
| `scores`, `region_scores` (deprecated) | — | not a candidate | Image-relative. Exposure moves them as much as the named change | Never |

**Two DROPs are declared deviations** from the pre-written classification rule: `gradientMean` and `specular.fraction` (PHASE_0_RESULTS §6). Both rest on a verified mechanism. Neither would be in the candidate set either way.

## 3. FINAL CANDIDATE SET

**Two metrics.**

| # | Field | Regions (unchanged from PROTOCOL §2.2) | Replaces |
|---|---|---|---|
| 1 | `colour.native.lStarMean` | cheeks, forehead | P1 |
| 2 | `colour.native.aStarMean` | cheeks, nose | P3 |

**Removed from the primary endpoints, versus PROTOCOL §2.2:**
- **P2 `native.bStarMean` and D1 ITA → INCONCLUSIVE.** The protocol has no face-b\* perturbation. They can re-enter only through the amendment in §4.
- **P4 `texture.lbpEntropy` → INCONCLUSIVE.** Nothing shows it responds to texture, and it moves with JPEG and exposure.
- **P5 `specular.fraction` → DROP.**

**Effect on the human study.**
- Fewer primary endpoints means less multiplicity. ANALYSIS_PLAN §8's sample size was driven by the per-band ICC precision of each field, not by the number of fields, so n does not shrink.
- **All raw fields are still captured**, because responses are stored verbatim. The excluded fields are analysed only as exploratory.

**The central risk to the candidate set is exposure.**
- Half a stop of global exposure moves native L\* by about the whole −8 L\* injected change, and a\* by about 1.3 units.
- Production has no exposure or illuminant signal. So either ACCEPTANCE C4 passes in the COND block, or a versioned quality producer must exist before any calibration is published.
- **Expect L\* to be the more likely of the two to fail C4.**

## 4. Conditions that bind this decision

1. **Complete Phase 0 before Phase 1 counts.** This decision rests on one retouched image of one person, whose MST tone was not rated.
   - KEEP must be confirmed on the remaining **9 images, spread across MST bands, with and without beards**.
   - Also required: A2 on real iOS Safari and Android Chrome; the §4.5 ColorChecker under 3 illuminants; native linux/amd64 hardware.
   - **A KEEP field that fails A3 or A4 on any image or band becomes DROP.** (No DROP can be revived by more images: each rests on a mechanism.)
2. **Protocol amendment (pre-register before the complete Phase 0):**
   - add a face-only b\* shift (+1, +2, +4, +8) as the A3 test for `native.bStarMean`, and so for ITA;
   - add a pre-registered **chroma-only spread** criterion for texture fields (§3.4 of the results), so that "indistinguishable from small-input instability" is a rule, not a judgement.
   - If native b\* then passes A3 and A4 on all 10 images, `bStarMean` (cheeks, forehead) and ITA (cheeks) may re-enter as primary.
3. **Production prerequisites (unchanged, STATUS doc):**
   - `stats=both` (D-07). Without it, every production record has `colour.native = null`, and **neither candidate exists in production**.
   - `engine.build`, and `captureMethod`.
4. **Wording ceiling:** even after Phases 1–3 pass, at most "this photo measurement differs from your baseline by more than measurement noise". Anything about skin needs Phase 4 (ACCEPTANCE §E).

## 5. What this decision does NOT change
- The `skinstate-1` contract: no rename, no reclassification, no new field. `texture.gradientMean`'s documented unit is now known to be wrong. That is recorded here for the **next** contract version, not edited.
- Any production code, route, rule, prompt or engine setting.
- Any user-facing threshold. **No longitudinal threshold is introduced.**
