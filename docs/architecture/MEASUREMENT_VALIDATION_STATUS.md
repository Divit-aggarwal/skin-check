# MEASUREMENT_VALIDATION_STATUS

Status as of 2026-10-03:
- **No validation evidence exists.**
- Every SkinState field has `uncertainty: unknown` (SKIN_STATE_CONTRACT_FINAL §6).
- No longitudinal change claim is permitted.

The design is in `docs/research/measurement-validation/`:

| File | Contents |
|---|---|
| PROTOCOL.md | phases, participants, capture design, ethics, budget tiers |
| DATA_SPEC.md | records, exclusion codes, study namespace in India |
| ANALYSIS_PLAN.md | variance components, SEM, MDC95, ICC, κ, user-level split, sample size |
| ACCEPTANCE_CRITERIA.md | pass/fail thresholds, each labelled as evidence, design choice or statistical necessity |

This design **supersedes EVALUATION_PLAN.md Track 1.** Research only; no production code changed.

> Note: `docs/research/**/*.md` is matched by `.gitignore` (`*.md`, re-included only for `docs/architecture/*.md`). The four research files stay untracked unless the owner adds `!docs/research/**/*.md`.

---

## The answer

**What evidence would allow this specific CV engine to produce a defensible longitudinal change signal?**

Six things, in order. Each is necessary, and none exists today.

1. **The engine must measure something that can change.** The 7 `scores` are image-relative (face z-score or percentile, then min-max), so they cannot carry change by construction. The corrected colour path removes most real colour change: whole-frame gray-world shrank a synthetic +20 a* shift to 1.3 (CALIBRATION.md). The evidence needed is a **bench responsiveness test** (Phase 0): known face-only perturbations must come through with slope about 1, and background-only casts must not leak. **Only native-path colour** (resize only, `/scan?stats=both`) **and possibly `lbpEntropy` are expected to pass.**

2. **Production must actually produce and identify those quantities.** Three things are missing today:
   - **`stats=both`** is never sent, so no production record carries native L*/a*/b*.
   - **`engine.build`** is not returned.
   - **`captureMethod`** is not sent.

   So the comparability key is null for every record. These are engineering prerequisites, not research, but without them no study result can be applied to real scans.

3. **A between-day noise floor measured under production capture**, per field × region × tone band:
   - a multi-day test–retest (D0, D7, D28; AM and PM; re-positioned captures)
   - on participants' own phones at home through the production capture UI
   - yielding SEM and MDC95 from variance components

   Same-day repeats or lab captures alone would understate the noise a real user sees. Needs **about 30 completers per band** in calibration (ICC ≥ 0.70 vs 0.85, 3 days; SEM to ±18%).

4. **Proof that the noise floor transfers to new people.** A held-out set of users (split **by user**, about 15 per band) must show the frozen MDC95 flagging about 5% of stable pairs (≤ 10% upper bound). Otherwise the MDC is overfitted.

5. **Equity across tone.** Every band (MST 1–4, 5–6, 7–10, rated in person) must pass on its own. Pooling must not hide a failing band, and a field that fails in one band fails for everyone.

6. **For any claim that the *skin* changed** (not just the photo statistic), **criterion validity and responsiveness** against a reference colorimeter under a benign induced change (Phase 4). Without it, the ceiling is "differs from your baseline by more than measurement noise".

Two limits apply even after all six:
- **A minimal important change is not knowable** from this study, so the product can never say the change is meaningful.
- **Causal attribution to products remains banned** (CLAUDE.md).

## Current evidence inventory

| Evidence | Exists? | Notes |
|---|---|---|
| Repeated captures of the same person | **No** | No study images exist in either repo. The skin-scan `fixtures/` hold one retouched studio portrait, and `results/` holds load tests only |
| CALIBRATION.md | 3 photos of 3 people | Predates the 0.1.4 mask rebuild: the 2000 px floor and the histogram ranges were derived on obsolete masks. It contradicts itself on collecting a calibration set (`:54` vs `:112-123`). **Not usable as validation evidence** |
| Frontend `scan-response.json` | 0.1.1 output | Pre-mask-rebuild. Superseded by skin-scan `fixtures/scan-response.json` (0.1.5) |
| Determinism | Partial | Bit-identical across 3 runs in one process (macOS arm64). Differs from the stored fixture by up to 1.6e-4 (blemishes). linux/amd64, fresh-process and concurrent runs not tested |
| Capture-quality signals | **None** | No blur, exposure, pose, face-scale, glare or occlusion signal in the engine |
| Literature SEM/MDC for photo skin metrics | **None** (per research doc) | Literature figures quoted in the repo's docs are not verified by this team. The Ouyang figures are inconsistent across docs (0.85 / "L 0.95" / 0.15–0.24) and **no threshold here rests on them** |

## Engine and input facts that constrain the study

| Fact | Where | Effect on the study |
|---|---|---|
| Scores are [0,1] floats; the 0–100 value is frontend-only (`toConcern`, hydration inverted) | `compose.py:71-118`; `SkinCheckDashboard.tsx:202`; `skin-check-score.ts:8-13` | Scores are analysed only to document their failure |
| All maps run on the gray-world + CLAHE + gamma image | `preprocess.py:6-47` | Corrected-path colour is a control, not a candidate |
| `stats` accepts only `corrected` or `both`; the proxy never sends it | skin-scan `app/main.py:218-266`; `route.ts:162-164` | Native fields need `stats=both`. A prerequisite for any production use |
| The HTTP path ignores EXIF orientation and ICC (PIL); the offline scripts use `cv2.imread`, which rotates | `utils_io.py:51-99`; `calibrate.py:53` | The study scores through HTTP on a pinned digest, after the exact client transform. **Never through the offline scripts** |
| Mobile sends a 1280/q0.92 re-encode; desktop sends the full video frame | `PhotoCapture.tsx:65-85,204`; `useCameraStream.ts:45-49` | The production arm is fixed to mobile native. Desktop and canvas are a separate stratum |
| Fixed-pixel mask dilations and texture kernels on a ≤1024 frame | `face_mesh.py:150-159`; `texture.py` | Texture is face-scale dependent. Face width is recorded as a study covariate |
| No guide overlay or quality gate in the capture UI | `PhotoCapture.tsx`; `skin-check-steps.ts:85` | The production MDC comes from the naturalistic arm. The controlled arm quantifies what a guide would buy |

## Conflicts in the existing docs, resolved here

| Conflict | Resolution |
|---|---|
| Tone strata: MST 3–5/6–7/8–10 (EVAL) vs 4–9 (research doc) vs 1–3/4–6/7–10 (research doc) | **MST 1–4 / 5–6 / 7–10** [design choice for the Indian population; each band recruited to quota] |
| Retest interval: 7 days vs 4 weeks | **D0, D7 and D28** (three days; both intervals) |
| ICC acceptance: point estimate ≥ 0.70 vs lower bound ≥ 0.70 | **Lower bound**, per band |
| "n = 30 gives ICC CI ±0.1" | True pooled; about ±0.2–0.25 per band at n ≈ 10. Replaced by about 30 calibration + 15 validation per band (≈ 135 completers, ≈ 160 enrolled) |
| "≥ 3 captures" as the repeat factor | Captures inform σ²_cap only. **Days** are the longitudinal repeat factor |
| "Absolute L* is destroyed" (LONGITUDINAL_METHOD) vs CALIBRATION's corrected-vs-native L* gap of −16 vs −17 | Becomes an empirical item (Phase 0 responsiveness of `lStarMeanPostClahe`). The contract field name and class do not change |

## Prerequisites before Phase 1 can start

| # | Prerequisite | Owner | Type |
|---|---|---|---|
| 1 | Ethics committee (IEC) review; study consent text; LEGAL view on DPDP for study data | LEGAL / owner | governance |
| 2 | A pinned linux/amd64 skin-scan digest used for the whole study | INFRA | engineering |
| 3 | Study namespace: ap-south-1 bucket, asia-south1 table, no production access (DEV_PROD_BOUNDARY) | INFRA | engineering |
| 4 | Study capture page (separate, flagged route) plus the client-transform harness | ENG | engineering; separate gate |
| 5 | Hardware: ColorChecker, LED panels (daylight and warm), lux/CCT meter, reference Android. Colorimeter for Phase 4 (buy or rent) | owner | procurement |
| 6 | Two trained MST raters | owner | staffing |

## Prerequisites before any production change claim (even after the study passes)

1. Production sends `stats=both` (D-07), returns `engine.build` (C12), and sends `captureMethod`.
2. A versioned calibration table loaded by `calibrationId` (contract §6), using the most-conservative-band policy.
3. If C4 depends on it: a versioned quality producer (contract §7.2) that detects the confounding conditions.

## Cost and effort tiers

See PROTOCOL §11 for detail.

| Tier | What it can unlock |
|---|---|
| Phase 0 bench only (no participants) | Already decides which fields are worth a human study. **Recommended first step** |
| Pilot (18 people) | Feasibility and a recalculated n. Unlocks nothing user-facing |
| Single band | Unlocks nothing, because production has no validated tone classifier and must use the most conservative band |
| Full study (about 160 enrolled) | Unlocks the "beyond measurement noise" wording for passing fields |
| Phase 4 colorimeter subset | Needed for any wording about the skin itself |

## Predicted outcome (to be falsified)

| Field group | Prediction |
|---|---|
| All 7 scores and the current bands | Fail (image-relative) |
| Corrected-path a* and L* | Fail on bench responsiveness |
| Native L*, b* and ITA on cheeks | The most likely to pass, if lighting is detectable or controlled (C4 is the main risk) |
| Native a* | Repeatable but at risk on C4 and on E (the literature reports poor agreement with clinical imaging; not verified by this team) |
| `lbpEntropy` | Possible pass in the controlled arm; at risk in the naturalistic arm (blur and scale) |
| `specular.fraction` | Expected to fail C4 (light direction) |
| Hydration, pores, breakouts | No candidate field exists. Not studied |
