# Phase 0 bench re-run on scan-0.1.6: PARTIAL (1 of 10 images)

| | |
|---|---|
| Date | 2026-10-03 |
| Status | **Partial Phase 0, repeated exactly on the new engine build.** The same items were run and the same items were not run as in the 0.1.5 run ([PHASE_0_RESULTS.md](PHASE_0_RESULTS.md)). This is signal screening: **not clinical validation, not longitudinal, and not evidence that skin changes** |
| Classification rule | [phase0/CLASSIFICATION_RULE.md](phase0/CLASSIFICATION_RULE.md), verbatim, plus the 0.1.6 addendum [phase0/CLASSIFICATION_RULE_0_1_6.md](phase0/CLASSIFICATION_RULE_0_1_6.md). The addendum was committed (`fb9dfc2`) **before the 0.1.6 image existed and before any response was scored** |
| Engine | `scan-0.1.6-provisional`. skin-scan commit `8dc37dc501ea974825427c665acd7019120c20ec` (gate 04) |
| **Pinned image** | **`sha256:ce51ed2dce3e2d4a3c3a00deadcd123e2f799ec785f348a4bd98802e2760088c`** (linux/amd64, built 2026-10-03T10:50:50Z). Every container was created **by this ID**, never by tag |
| Build identity in every response | `engine_build: "bench-local-8dc37dc501ea974825427c665acd7019120c20ec"`. This is deliberately **not** `sha-…`: no CI build or ECR artifact of 0.1.6 exists, so claiming that tag would be fabricated |
| How the image was built | `git archive 8dc37dc` into scratch, then `docker build --platform linux/amd64 --no-cache --build-arg ENGINE_BUILD=bench-local-…` from that clean export. Not built from the working tree, which holds `.env` and `.venv` (also excluded by `.dockerignore`) |
| Engine runtime | Identical to the 0.1.5 run: emulated amd64 on an arm64 Mac (Docker Desktop), `--cpus 2 --memory 4g`, `ENV=production` (so the cv2-pin startup assertion ran and passed: cv2 4.11.0), `MAX_CONCURRENT_SCANS=4`, `SCAN_TIMEOUT_SECONDS=300`, a local bench secret, bound to `127.0.0.1:18016` |
| Production | **No production endpoint or deployed service was called.** The 0.1.5 comparison image `668b1f56…` was already local and was used only for a package inventory |
| Scoring path | `POST /scan?stats=both` over HTTP for every value (PROTOCOL §4.1) |
| Mapping | Frozen `toSkinState`: `lib/skin-state.ts` at `fb9dfc2`, byte-identical to `dd9a3fe` (see §2.4) |
| Source image | `skin-scan/fixtures/input_face.png`, sha256 `c1ec1f361a38aa66…`. The same single retouched studio portrait |

**Pinned inputs** (sha256, first 16 hex characters). Every one is **identical** to the 0.1.5 run:

| File | sha256 |
|---|---|
| PROTOCOL.md | `b9b1078736cc8d57` |
| DATA_SPEC.md | `bff3c86e4da4952e` |
| ANALYSIS_PLAN.md | `ed370e3b31ff7c74` |
| ACCEPTANCE_CRITERIA.md | `57a7884f13fe1a34` |
| MEASUREMENT_VALIDATION_STATUS.md | `4f209085989629b7` |
| SKIN_STATE_CONTRACT_FINAL.md | `b2d194c554c0e32a` |
| phase0/CLASSIFICATION_RULE.md | `ca42472a59f337b0` |

---

## 0. Correction to the premise of the request

The request says 0.1.6 "introduces native colour statistics through `stats=both`". **It does not.**

**OBSERVED** (`git diff 7f3695e 8dc37dc`):
- `stats=both` and the native path existed in 0.1.5 (skin-scan `3c56b7f`, an ancestor of the deployed `7f3695e`). The 0.1.5 Phase 0 already scored every value through `/scan?stats=both`.
- 0.1.6 changes only these things:
  - the response gains `engine_build` (`src/app/{deps,main,schemas}.py`);
  - `PIPELINE_VERSION` becomes `scan-0.1.6-provisional`;
  - the Dockerfile gains `ARG`/`ENV ENGINE_BUILD`;
  - CI passes the build arg.
- **No file under `src/pipeline/` changed except `version.py`.** `requirements.txt` did not change.
- What is new in production is that gate 04 makes the **frontend request** `stats=both` (D-07). That is a client change, not an engine change.

The 0.1.5 results are still provisional for 0.1.6, because a digest change restarts Phase 0 (PROTOCOL §8, ACCEPTANCE §G). So the full protocol was re-run below, not inferred from the diff.

## 1. What was run against the protocol (unchanged from 0.1.5)

| Protocol item | Run? | Detail |
|---|---|---|
| §4.1 pinned build | **Yes, deviated** (same as 0.1.5) | Pinned local digest. Emulated amd64 on arm64, not native linux/amd64 |
| §4.2 input fidelity (A2) | **NOT RUN, impossible here** | No devices. PIL's JPEG encoder approximates the mobile client transform; it is not Chromium's |
| §4.3 determinism (A1) | **Yes, deviated** (same as 0.1.5) | 100 submissions × 5 inputs at concurrency 4, in 5 batches, **each in a newly created container** of the pinned ID. The inputs are the source plus 4 perturbed variants |
| §4.4 responsiveness | **Yes, on 1 of 10 images** | Every pre-registered perturbation and level, plus the same EXPLORATORY face-b\* rows |
| §4.5 ColorChecker under real capture | **NOT RUN, impossible here** | No hardware |
| 9 of 10 bench images | **NOT RUN, impossible here** | No consented face images exist |

**The method is unchanged:** same `bench.py`, the same face and background masks (`meta` is identical: face 133,057 px, background 225,784 px), the same client transform (long side ≤ 1280, JPEG q0.92), and the same slope definitions.

**The only harness change** is a `RESULTS_DIR` override, so the 0.1.6 output went to `phase0/results_0_1_6/` and the 0.1.5 evidence was not overwritten. It defaults to `results/`. Neutrality was checked: re-running `analyse.py` on `results/` reproduced the committed `summary.md` and `summary.json` byte for byte.

## 2. OBSERVED

### 2.1 Validity guards (pre-registered §4)
- All 30 matrix rows returned HTTP 200.
- All 30 report `pipeline_version: "scan-0.1.6-provisional"` and `engine_build: "bench-local-8dc37dc…"`. The right service was scored.
- No 0.1.5 row carries `engine_build`, as expected.

### 2.2 Build content versus the 0.1.5 production image (`668b1f56`)
The same code with a fresh build does **not** give the same image.
- **12 packages differ:**
  - 11 transitive pip packages: anyio, fonttools, idna, ImageIO, lazy-loader, matplotlib, pyparsing, starlette, uvloop, watchfiles, all minor or patch bumps;
  - one apt package, `libglib2.0-0t64` (`deb13u3` → `deb13u5`).
- **Identical:**
  - numpy 1.26.4, opencv-contrib-python 4.11.0.86, mediapipe 0.10.21, scikit-image 0.26.0, pillow 12.3.0 (every package in the measurement path);
  - Debian 13.6 and Python 3.11.16 (the base image is pinned by digest).

### 2.3 Equivalence hypothesis H-EQ (pre-registered §3): **HOLDS**

| Check | Result |
|---|---|
| Transmitted bytes (sha256) per row, 0.1.6 vs 0.1.5 | identical on 30/30. **No re-scoring on 0.1.5 was needed** |
| Realised input change per row and region | identical on 30/30 |
| Response with `pipeline_version` and `engine_build` removed | **bit-identical (canonical JSON) on 30/30** |
| Keys added | exactly one: `engine_build`. None removed |
| `analyse.py` output (`summary.md`, `summary.json`) on 0.1.6 vs 0.1.5 | **byte-identical**: every slope, leakage, monotonicity flag, confounder response and clip mass |

**The build drift in §2.2 did not reach any measured value on this bench.**

### 2.4 SkinState mapping
- All 30 responses map to `kind: "skinstate"`.
- **Frozen view:** the mapping ran in a detached worktree at `fb9dfc2`, where `lib/skin-state.ts` is byte-identical to `dd9a3fe`.
- **Why a worktree:** during this run another session changed `lib/skin-state.ts` and `phase0/to_skinstate.mts`, adding a third `toSkinState` argument and a new `analysisRef` format. Those edits were later committed as gate 02 (`155cb69`).
  - A first mapping in the live working tree picked them up. It was **discarded**, because it was not the frozen contract.
- **Proof:** the same worktree reproduced the committed 0.1.5 `skinstates.json` byte for byte.
- **Cross-check against gate 02's view (`155cb69`):** mapping the same 30 responses gives identical `regions`, `quality` and `uncertainty`. Only `identity` differs (the `analysisRef` format). The measurement blocks do not depend on which of the two views is used.
- **0.1.6 vs 0.1.5 SkinStates:**
  - `regions`, `quality`, `uncertainty` and `input` are identical in all 30 rows.
  - Only `engine` differs:
    - `pipelineVersion` changes to 0.1.6;
    - `landmarkModel` and `opencvVersion` are **null**, because the skinstate-1 verified table has only a 0.1.5 entry, as gate 04 stated;
    - `build` stays **null**, because skinstate-1 has no source key for `engine_build`.

### 2.5 Determinism (A1): **MET on this platform**

| Input | Submissions | Distinct canonical responses | Batches (fresh containers) |
|---|---|---|---|
| `baseline_0` | 100 | 1 | 5 |
| `faceA_4` | 100 | 1 | 5 |
| `faceL_-4` | 100 | 1 | 5 |
| `exposure_-1` | 100 | 1 | 5 |
| `blur_1` | 100 | 1 | 5 |

- All 500 returned 200.
- Each input's single response equals its matrix-run response.
- Without the provenance keys, the five responses equal the 0.1.5 determinism responses.

**So determinism holds within 0.1.6, and outputs are identical across 0.1.5 → 0.1.6, on this platform.**

### 2.6 Focus items requested
All values come from the 0.1.6 data and equal the 0.1.5 values (§2.3). Regions are cheeks, forehead, nose and chin.

**Background leakage (A4: worst \|Δ\| at a background ±10 cast, as % of the cast):**
- native a\*: 0–2%
- native L\*: 1–5%
- native b\*: 0–1%
- corrected a\*: **48–59%**, opposite sign
- corrected b\*: **57–71%**
- corrected L\*: 5–12% (chin fails)
- `specular.fraction`: a background-only cast moves it **21.4–57.4%**

**Exposure** (Δ at −1 / −0.5 / +0.5 / +1 EV):

| Field | Cheeks | Forehead | Nose | Chin |
|---|---|---|---|---|
| native L\* | −13.9 / −7.1 / +8.4 / +17.3 | −14.3 / −7.7 / +8.6 / +17.6 | −14.5 / −7.7 / +9.0 / +17.8 | −11.4 / −5.9 / +7.1 / +14.5 |
| native a\* | −2.3 / −1.2 / +1.3 / **+1.3** | −2.1 / −1.1 / +1.2 / **−0.8** | −2.5 / −1.4 / +1.3 / **−1.0** | −2.6 / −1.4 / +1.4 / +3.2 |
| native b\* | −4.8 / −2.4 / +2.9 / +5.6 | −4.5 / −2.4 / +2.7 / +4.5 | −4.5 / −2.4 / +2.7 / +4.2 | −3.9 / −2.1 / +2.4 / +5.2 |
| ITA (°) | −37.9 / −18.7 / +16.9 / +29.2 | −41.0 / −21.1 / +16.8 / +28.9 | −41.3 / −20.2 / +16.2 / +27.3 | −27.0 / −15.2 / +19.5 / +37.5 |

- Native a\* is **not monotone in exposure** on forehead and nose (it reverses at +1 EV). On cheeks it is flat (+1.34 → +1.30), which the 0.1.5 report did not mention. The data are identical; the 0.1.5 text listed only forehead and nose.
- Native L\* and b\* are monotone in exposure in every region.

**JPEG q0.75 instead of q0.92** (Δ from baseline):

| Field | Cheeks | Forehead | Nose | Chin |
|---|---|---|---|---|
| native L\* | +0.30 | +0.10 | −0.25 | +0.59 |
| native a\* | +0.10 | −0.01 | +0.08 | −0.04 |
| native b\* | +0.04 | +0.06 | +0.05 | −0.20 |
| ITA (°) | +0.73 | +0.23 | −0.64 | +1.17 |
| `lbpEntropy` (bits) | +0.06 | +0.05 | +0.08 | +0.04 |
| `laplacianVarMean` | +79 (+28.6%) | +76 | +78 | +99 |

Native colour moves ≤ 0.6 units under this compression change: an order of magnitude below 0.5 EV of exposure.

**Monotonicity (A3, intended change):**
- Native a\*, P90 and L\*, and exploratory native b\*: monotone in every region.
- Corrected `aStarP90`: non-monotone on forehead and nose.

**Region consistency (engine slope on the intended change):**
- native a\*: 0.991–1.001
- native P90: 1.002–1.005
- native L\*: 0.967–1.046
- exploratory native b\*: 1.002–1.015
- corrected a\*: 0.491–0.577
- corrected L\*: 0.310–0.826

**ITA:**
- **Background:** ≤ 1.4° under any background cast.
- **Injected change:** face L\* −2 / −4 / −8 gives ΔITA of −4.3 / −9.2 / −19.0° on cheeks. All regions track the realised change within 1.1°.
- **Exposure:** ±0.5 EV moves it **15–21°**, about the same as the −8 L\* injection.

**Deviation conditions (pre-registered §2):**
- **(a)** `hydration.py`, `oiliness.py` and `preprocess.py` are byte-identical between `7f3695e` and `8dc37dc`.
- **(b)** Both signatures reproduce:
  - `gradientMean`'s chroma-only spread is 20.7% (cheeks), 44.1% (forehead), 58.8% (nose) and 41.5% (chin). Every region is ≥ 20%; cheeks only narrowly.
  - A background-only cast moves `specular.fraction` 33.7% / 43.3% / 21.4% / 57.4%.
- **Both declared deviations are therefore re-declared** under the pre-registered rule.

## 3. Classification (rule applied unchanged)

| Field | Regions | 0.1.5 class | **0.1.6 class** | Basis |
|---|---|---|---|---|
| `colour.native.aStarMean` | C F N Ch | KEEP | **KEEP FOR HUMAN VALIDATION** | A3 0.991–1.001, monotone. A4 ≤ 2% |
| `colour.native.lStarMean` | C F N Ch | KEEP | **KEEP FOR HUMAN VALIDATION** | A3 0.967–1.046, monotone. A4 ≤ 5% |
| `colour.native.aStarP90` | C F N Ch | KEEP (secondary) | **KEEP (secondary, not an endpoint)** | A3 1.002–1.005. A4 0%. Integer-valued |
| `colour.native.bStarMean` | C F N Ch | INCONCLUSIVE | **INCONCLUSIVE** | A4 ≤ 1%. **No pre-registered A3** (the face-b\* amendment was never adopted); the exploratory slope of 1.00–1.02 cannot be used |
| D1 ITA | cheeks | INCONCLUSIVE | **INCONCLUSIVE** | One input (b\*) is unscreened by rule |
| `colour.native.aStarSd`, `lStarSd` | all | INCONCLUSIVE | **INCONCLUSIVE** | No intended change exists |
| `colour.native.aStarHist`, `localLContrastHist` | all | INCONCLUSIVE | **INCONCLUSIVE** | Redundant with the scalars |
| `colour.corrected.aStarMean` | all | DROP | **DROP (confirmed)** | A3 0.49–0.58. A4 48–59%, opposite sign. Whole-frame gray-world, unchanged |
| `colour.corrected.aStarP90` | all | DROP | **DROP (confirmed)** | A3 0.59–0.75, non-monotone. A4 40–50% |
| `colour.corrected.bStarMean` | all | DROP | **DROP (confirmed)** | A4 57–71% |
| `colour.corrected.lStarMeanPostClahe` | all | DROP | **DROP (confirmed)** | A3 0.31–0.83 (CLAHE plus gamma). A4 12% on chin |
| `colour.corrected.aStarSd` | all | DROP | **DROP (confirmed)** | A4 up to 11.7% |
| `colour.corrected.lStarSdPostClahe` | all | INCONCLUSIVE | **INCONCLUSIVE** | No intended change exists |
| `colour.corrected.aStarHist`, `texture.localLContrastHist` | all | INCONCLUSIVE | **INCONCLUSIVE** | By rule |
| `texture.laplacianVarMean` | all | INCONCLUSIVE | **INCONCLUSIVE** | Blur σ 1 gives −28% to −37%; scale 0.8 gives +36% to +62%; JPEG 0.75 gives +27% to +32%. A framing and compression statistic |
| `texture.lbpEntropy` | all | INCONCLUSIVE | **INCONCLUSIVE** | About 1% chroma-only spread. JPEG +1.3% to +3.7%; −1 EV +1.8% to +5.0%. Blur response region-inconsistent. No intended texture change is pre-registered |
| `texture.gradientMean` | all | DROP (deviation 1) | **DROP (deviation 1, re-declared)** | Same definition defect; the mechanism code and signature are unchanged |
| `specular.fraction` | all | DROP (deviation 2) | **DROP (deviation 2, re-declared)** | Same mechanism (whole-frame gray-world gain into a fixed V threshold) |
| `pixelCount` | all | not a candidate | not a candidate | Quality covariate |
| `scores`, `region_scores` | — | not a candidate | not a candidate | Image-relative, deprecated |

**No class changed.** No field moved into or out of the candidate set.

## 4. OBSERVED / INFERRED / NOT ESTABLISHED

**OBSERVED**
- The 0.1.6 engine at the pinned digest returns, for identical bytes, the same measurement output as the 0.1.5 production digest, bit for bit, on 30 bench inputs and on 500 repeated submissions in 5 fresh containers. The only differences are the version string and the new `engine_build` key.
- A fresh build of the same pinned requirements resolves 11 transitive pip packages and one apt package differently. None of them affected any measured value here.
- Every Phase 0 number reported for 0.1.5 holds for 0.1.6. That includes the native-path pass-through, the corrected-path suppression and background import, the size of the exposure effect, texture's sensitivity to compression and framing, and the specular collapse.

**INFERRED**
- Phase 0 classifications are a property of the measurement code and the measurement-path packages. Neither changed, so MD-1's classes transfer to 0.1.6 **for this bench**.
- **The re-run adds no new evidence about any field.** It confirms only that 0.1.6 did not disturb what 0.1.5 showed, which was the purpose of the §8 restart.
- **Native-path KEEP is still close to guaranteed by construction:** the native path only resizes, and the realised shift is measured the same way. The tests that can really fail L\* and a\* (§4.5, ACCEPTANCE C4) remain unrun.
- **Exposure stays the dominant risk.** Half a stop moves native L\* by 5.9–9.0 units and ITA by 15–21°, against ≤ 0.6 units and ≤ 1.2° for JPEG q0.75 and ≤ 5% leakage for background casts.
- **Build drift is a real risk class.** Identical code did not produce an identical image. CI's eventual build of `8dc37dc` will have yet another digest. By PROTOCOL §8 it needs this replay again, and the result should be expected to hold only if the measurement-path packages are again identical.

**NOT ESTABLISHED**
- Anything about skin, or any clinical meaning of a signal response.
- That a surviving field is a **validated** measurement of L\* or a\*. These are photo statistics that passed a bench screen on one image.
- Behaviour on other faces, other MST tones (not rated), beards, or real phones (A2 and §4.5 not run).
- Identity on native linux/amd64 hardware, on CI's build of `8dc37dc`, or on the live ECS tasks.
- Between-capture or between-day noise. No user-facing threshold exists, and none is proposed.
- Whether `native.bStarMean` and ITA pass A3. The protocol cannot test it until the face-b\* amendment is pre-registered.

## 5. Reproduce
From the skin-check repo root:

```
# 1. Build: clean export of 8dc37dc, linux/amd64, visibly local build id
git -C ../skin-scan archive 8dc37dc | tar -x -C <scratch>/ss
docker build --platform linux/amd64 --no-cache \
  --build-arg ENGINE_BUILD=bench-local-8dc37dc501ea974825427c665acd7019120c20ec \
  -t skin-scan-bench:0.1.6-8dc37dc <scratch>/ss
#    expect Id sha256:ce51ed2dce3e…
# 2. Engine by ID, local only
docker run -d --name p016-engine --platform linux/amd64 -p 127.0.0.1:18016:8000 \
  -e ENV=production -e SCAN_API_SECRET=<local> -e MAX_CONCURRENT_SCANS=4 -e SCAN_TIMEOUT_SECONDS=300 \
  --cpus 2 --memory 4g sha256:ce51ed2dce3e2d4a3c3a00deadcd123e2f799ec785f348a4bd98802e2760088c
# 3. Matrix and determinism (skin-scan's pinned venv)
cd docs/research/measurement-validation/phase0
RESULTS_DIR=results_0_1_6 ENGINE_URL=http://127.0.0.1:18016 SKIN_SCAN_REPO=../../../../../skin-scan \
  SCAN_SECRET=<local> OUT_IMG=<scratch> ../../../../../skin-scan/.venv/bin/python bench.py matrix
RESTART_CMD=<recreate p016-engine by ID; wait for /health/ready> … bench.py determinism
# 4. Map through the FROZEN skinstate-1 (a clean checkout of fb9dfc2, where lib/skin-state.ts == dd9a3fe), then analyse
RESULTS_DIR=results_0_1_6 npx vite-node docs/research/measurement-validation/phase0/to_skinstate.mts
RESULTS_DIR=results_0_1_6 ../../../../../skin-scan/.venv/bin/python analyse.py > results_0_1_6/summary.md
```

**Committed:**
- `phase0/results_0_1_6/`: `matrix.json` (full responses, realised shifts and transmitted-image hashes), `skinstates.json`, `determinism.json`, `summary.json`, `summary.md`
- the `RESULTS_DIR` override in `bench.py`, `analyse.py` and `to_skinstate.mts`
- this file and the MD-1 addendum

**Images are not committed.**

---

## FINAL 0.1.6 CANDIDATE SET

**Unchanged from MD-1. Two metrics.** The new experiment gives no grounds to change it.

| # | Field | Regions | Class on 0.1.6 |
|---|---|---|---|
| 1 | `colour.native.lStarMean` | cheeks, forehead | KEEP FOR HUMAN VALIDATION |
| 2 | `colour.native.aStarMean` | cheeks, nose | KEEP FOR HUMAN VALIDATION |

- **Not in the set:**
  - `native.bStarMean` and ITA: INCONCLUSIVE until the face-b\* A3 is pre-registered.
  - `lbpEntropy` and `laplacianVarMean`: INCONCLUSIVE.
  - `gradientMean`, `specular.fraction` and all corrected colour location fields: DROP.
- **What KEEP means:** proceed to the complete Phase 0, then to Phase 1 as primary endpoints. It is **not** a validated skin measurement, not comparable across captures, and not showable to users.
- **No participant study has started.** No longitudinal claim and no user-facing threshold exist.
