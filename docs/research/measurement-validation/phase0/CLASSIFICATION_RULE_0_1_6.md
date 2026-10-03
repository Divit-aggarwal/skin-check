# Phase 0 classification rule, re-run on scan-0.1.6 (written before scoring)

Written 2026-10-03, **before the 0.1.6 engine image had finished building, and before any 0.1.6 response existed.** It is committed on its own, ahead of the results.

## 1. The rule is unchanged
- [CLASSIFICATION_RULE.md](CLASSIFICATION_RULE.md) applies **verbatim**: the same gates (A3 slope 0.8–1.2 in every region plus monotone; A4 leakage ≤ 10% of the cast in every region), field groups, slope definitions and determinism criterion.
- Same matrix, levels, masks, client transform, source image and determinism design (`bench.py`, unchanged except an output-directory override).
- **`faceB` rows stay EXPLORATORY.** MD-1 §4.2 proposed making a face-only b\* shift the A3 test for `native.bStarMean`, and adding a chroma-only spread criterion for texture. Neither amendment was adopted in PROTOCOL.md or ACCEPTANCE_CRITERIA.md. So `native.bStarMean` and ITA stay **INCONCLUSIVE by rule**, whatever the exploratory slope shows.

## 2. The two 0.1.5 declared deviations
`texture.gradientMean` and `specular.fraction` were DROPped on 0.1.5 as declared deviations, each resting on a verified engine mechanism (PHASE_0_RESULTS §6).

**Decided now:** they are re-declared as the same deviations **only if** both conditions hold on 0.1.6:
1. **(a)** the mechanism's code is unchanged between the two builds (`hydration.py`, `oiliness.py`, `preprocess.py`);
2. **(b)** the mechanism's signature reproduces in the 0.1.6 data:
   - `gradientMean`: the chroma-only spread is ≥ 20% in every region;
   - `specular.fraction`: a background-only cast moves it by ≥ 20% in at least one region.

If either fails, the field reverts to the written rule's default, **INCONCLUSIVE**.

## 3. Pre-registered equivalence hypothesis (H-EQ)
- **Basis:** the code diff 7f3695e → 8dc37dc touches no file under `src/pipeline/` except the version string, and does not touch `requirements.txt`.
- **H-EQ:** for every matrix row whose transmitted sha256 equals the 0.1.5 `results/matrix.json` row, the 0.1.6 response equals the 0.1.5 response **bit for bit** on every key except `pipeline_version` (expected `scan-0.1.6-provisional`) and `engine_build` (expected to be the bench label).

**Pre-stated outcomes:**

| Outcome | Consequence |
|---|---|
| H-EQ holds on every row and in determinism | Every classification transfers to 0.1.6 by construction, and is also re-derived from the 0.1.6 data by the unchanged `analyse.py`. **The run adds no new evidence about any field.** It shows only that MD-1 holds for this build |
| H-EQ fails on any row | Report max \|Δ\| per field and region. Attribute it, if possible, to the build-content diff (pip freeze and dpkg against `668b1f56`). Classify **only from the 0.1.6 data** under §1 and §2 |
| Any transmitted sha256 differs from 0.1.5 | Re-score those exact bytes on the 0.1.5 digest `668b1f56` in the same session, so every A/B comparison uses identical inputs |

## 4. Validity guards (checked before analysis)
- Every 0.1.6 row reports `pipeline_version == "scan-0.1.6-provisional"` and `engine_build == "bench-local-8dc37dc501ea974825427c665acd7019120c20ec"`. Otherwise the run is void (wrong service scored).
- Every container is created **by image ID**, not by tag.
- **No production endpoint is called.** The engine runs locally only.

## 5. Not run, by necessity (unchanged; recorded, never imputed)
- **A2:** no real devices.
- **§4.5:** no ColorChecker hardware.
- **9 of 10 bench images:** no consented images.
- **Native linux/amd64 hardware:** emulated amd64 on an arm64 Mac only.
