# Phase 0 on scan-0.1.6: release candidate (Part I, authoritative) and bench build (Part II)

**Status: PARTIAL Phase 0 (1 of 10 images), run twice on 0.1.6.**
- **Part I** scores the **release candidate**: the exact image ENGINE_0_1_6_DEPLOYMENT_PLAN §5 will push. **It is authoritative for 0.1.6.**
- **Part II** is the earlier run the same day on a separately built bench image (`ce51ed2d…`). It is kept as history.

This is signal screening only: not clinical validation, not longitudinal, and not evidence that skin changes. **No surviving field is a validated skin measurement.**

---

# Part I: release candidate `sha256:9a8f96c0…`

## I.1 Identity (recorded before scoring; rule addendum B, `ebbe755`)

| Item | Value |
|---|---|
| Git SHA | **`8dc37dc501ea974825427c665acd7019120c20ec`** (skin-scan, branch `engine-build-identity`; not pushed) |
| Source | a fresh `git archive 8dc37dc` export, untouched before the build (0 `__pycache__` directories) |
| Docker tag (local only) | **`550428926515.dkr.ecr.ap-south-1.amazonaws.com/skin-scan:sha-8dc37dc501ea974825427c665acd7019120c20ec`** |
| Image digest (local image ID, containerd store) | **`sha256:9a8f96c0a54025c4137b89dee181ba7fb140db1431fa95156cc20d8880e1fc2c`**, linux/amd64, created 2026-10-03T11:41:51Z |
| Engine version | `pipeline_version: "scan-0.1.6-provisional"` (all 30 rows and `/health/ready`). cv2 4.11.0 |
| `engine_build` | **`sha-8dc37dc501ea974825427c665acd7019120c20ec`**, equal to the tag, in every response |
| Build command | `docker build --platform linux/amd64 --no-cache --build-arg ENGINE_BUILD=sha-8dc37dc… -t <tag> .` (Docker 29.5.2, arm64 Mac, containerd snapshotter) |
| `/app` contents | `.env.example`, `.gitignore`, `LICENSE`, `pyproject.toml`, `requirements.txt`, `src`, `uv.lock`. **No `egg-info`, no `__pycache__`.** The 0.1.5 image carried a stray `src/skin_scan.egg-info` |
| Pushed? | **No.** It is held locally so the deployment can push **these bytes** (plan §5 step 5). It must not be rebuilt |
| Production | **Not called.** The engine ran locally only (`127.0.0.1:18017`, `ENV=production`, `--cpus 2 --memory 4g`, `MAX_CONCURRENT_SCANS=4`, `SCAN_TIMEOUT_SECONDS=300`, emulated amd64) |

**Pre-flight on a clean export of `8dc37dc`:** ruff clean, pyright 0 errors, pytest **81 passed**.

**Smoke test** (plan §5 step 3):
- `/health/ready` returns 200 with `scan-0.1.6-provisional`.
- Fixture `/scan` returns 200 with 7 scores and `engine_build` equal to the tag.
- No native block is returned without `stats`, as expected.
- The cv2-pin startup assertion passed under `ENV=production`.

**Package inventory:**
- **Identical to the bench build `ce51ed2d`** (pip and dpkg).
- **Against the live 0.1.5 image `668b1f56`:** the same 12 differences found in Part II (11 transitive pip packages and `libglib2.0-0t64`).
- Every measurement-path package is identical: numpy 1.26.4, opencv-contrib 4.11.0.86, mediapipe 0.10.21, scikit-image 0.26.0, pillow 12.3.0, Python 3.11.16, Debian 13.6.

## I.2 What was run

The full feasible protocol, identical to the 0.1.5 run and to Part II:
- **Harness:** the same committed `bench.py`, source image, masks (`meta` identical to 0.1.5), client transform (≤ 1280, PIL JPEG q0.92), matrix and levels.
- **Scoring:** HTTP `POST /scan?stats=both` on the release image.
- **Mapping:** the frozen skinstate-1 view (`lib/skin-state.ts` at `fb9dfc2`, identical to `dd9a3fe`).
- **Analysis:** the unchanged `analyse.py`.
- **Output:** `phase0/results_0_1_6_release/`.

**About "the exact preprocessing path expected in production":**
- The engine side is exact: the production image, its HTTP decode (PIL, no EXIF transpose, ICC ignored) and its preprocessing.
- The client side is approximated by PIL (≤ 1280, q0.92), the same as every earlier run. It is **not** the browser's `createImageBitmap` + canvas encoder (A2, impossible here).

| Protocol step | Status |
|---|---|
| §4.1 pinned build | **Run.** The release digest, by image ID. Emulated amd64, not native hardware |
| §4.3 determinism (A1) | **Run.** 100 × 5 at concurrency 4, 5 fresh containers |
| §4.4 responsiveness | **Run, 1 of 10 images.** Every pre-registered row, plus the EXPLORATORY face-b\* rows |
| §4.2 A2 real-device input fidelity | **IMPOSSIBLE here.** No iOS Safari or Android Chrome device in the loop |
| §4.5 ColorChecker under real capture | **IMPOSSIBLE here.** No target or illuminants |
| Images 2–10 across MST bands and beards | **IMPOSSIBLE here.** No consented face images exist |
| Native linux/amd64 hardware | **IMPOSSIBLE here.** arm64 Mac only. Fargate is native amd64; cross-platform identity is NOT ESTABLISHED |
| ECR digest equals the local ID | **Not checkable before push.** It is plan §5 step 5. If it differs, this replay must be repeated on the pulled ECR digest |

## I.3 OBSERVED

- **Validity guards:** 30/30 rows returned 200, with `scan-0.1.6-provisional` and `engine_build` equal to the tag.
- **H-EQ against 0.1.5 (`668b1f56`):**
  - Transmitted bytes, realised shifts and masks are identical.
  - All 30 responses are **bit-identical** apart from `pipeline_version` and the added `engine_build`. No key was removed.
  - **Against the bench build (Part II):** also bit-identical, apart from the `engine_build` value.
- **Determinism (A1): MET.**
  - Each of the 5 inputs gives 1 distinct canonical response across 100 submissions in 5 fresh containers, 500/500 HTTP 200.
  - Each equals its matrix response.
  - Without the provenance keys, the set equals the 0.1.5 determinism set.
- **Analysis:** `summary.md` and `summary.json` are **byte-identical to 0.1.5's**. That covers every slope, leakage figure, monotonicity flag, confounder response, ITA value and clip mass.
- **SkinState (frozen view):** `regions`, `quality`, `uncertainty`, `input` and `provenance` are identical to 0.1.5 in all 30 rows. Only `engine` differs:
  - `pipelineVersion` is 0.1.6;
  - `landmarkModel` and `opencvVersion` are **null** (the verified table has 0.1.5 only);
  - `build` is null (skinstate-1 has no source key for it).
- **Deviation conditions** (`CLASSIFICATION_RULE_0_1_6.md` §2):
  - **(a)** `hydration.py`, `oiliness.py` and `preprocess.py` are unchanged.
  - **(b)** reproduces with the same values as Part II §2.6. It is implied by H-EQ, so it is not independent evidence.

### Focus items (release image; every value identical to 0.1.5)

| | native L\* | native a\* | native b\* |
|---|---|---|---|
| A3 slope, intended change (C / F / N / Ch) | 0.967 / 1.014 / 1.046 / 0.973 | 0.997 / 1.000 / 1.001 / 0.991 | *1.015 / 1.008 / 1.002 / 1.007* (exploratory; no pre-registered A3) |
| Monotone in the intended change | yes, all regions | yes, all regions | yes (exploratory) |
| A4 background leakage (worst, % of a ±10 cast) | 1–5% | 0–2% | 0–1% |
| Exposure, Δ at ±0.5 EV | 5.9–9.0 units | 1.1–1.4 units | 2.0–2.9 units |
| Exposure monotone (−1 … +1 EV) | yes, all regions | **no**: reverses at +1 EV on forehead and nose, flat on cheeks | yes, all regions |
| JPEG q0.75 instead of q0.92 (Δ) | −0.25 to +0.59 | −0.04 to +0.10 | −0.20 to +0.06 |
| Regional consistency | slope spread 0.967–1.046 | 0.991–1.001 | 1.002–1.015 |
| Deterministic | yes (500/500) | yes | yes |

**ITA (cheeks; derived):**
- background ≤ 0.8° (≤ 1.4° in any region);
- JPEG ≤ 1.2°;
- ±0.5 EV moves it **15–21°**;
- a −8 L\* face shift moves it −19.0°.

**Texture and shine:** unchanged from 0.1.5.
- `lbpEntropy`: JPEG +1.3% to +3.7%; −1 EV +1.8% to +5.0%.
- `laplacianVarMean`: JPEG +27% to +32%.
- `gradientMean`: chroma-only spread 21–59%.
- `specular.fraction`: background-only cast 21–57%.

## I.4 Comparison with the previous Phase 0 (0.1.5), per candidate

Categories were pre-defined in addendum B §3. Every field's values are bit-identical to 0.1.5 on every row, so "improved" and "degraded" cannot occur.

| Field | 0.1.5 class | 0.1.6 release class | Category |
|---|---|---|---|
| `colour.native.lStarMean` | KEEP | KEEP FOR HUMAN VALIDATION | **same behaviour** |
| `colour.native.aStarMean` | KEEP | KEEP FOR HUMAN VALIDATION | **same behaviour** |
| `colour.native.aStarP90` | KEEP (secondary) | KEEP (secondary, not an endpoint) | **same behaviour** |
| `colour.native.bStarMean` | INCONCLUSIVE | INCONCLUSIVE | **same behaviour.** Not newly eligible: the protocol still has no face-b\* A3 |
| D1 ITA | INCONCLUSIVE | INCONCLUSIVE | **same behaviour** |
| `colour.native.aStarSd`, `lStarSd`, native histograms | INCONCLUSIVE | INCONCLUSIVE | **same behaviour** |
| `colour.corrected.aStarMean`, `aStarP90`, `bStarMean`, `lStarMeanPostClahe`, `aStarSd` | DROP | DROP | **same behaviour** (drops confirmed) |
| `colour.corrected.lStarSdPostClahe`, `aStarHist`, `texture.localLContrastHist` | INCONCLUSIVE | INCONCLUSIVE | **same behaviour** |
| `texture.laplacianVarMean`, `texture.lbpEntropy` | INCONCLUSIVE | INCONCLUSIVE | **same behaviour** |
| `texture.gradientMean`, `specular.fraction` | DROP (declared deviations) | DROP (re-declared) | **same behaviour** |

**Improved: none. Degraded: none. Newly inconclusive: none. Newly eligible: none.**

## I.5 OBSERVED / INFERRED / NOT ESTABLISHED

**OBSERVED:**
- On the exact release-candidate image, every Phase 0 measurement is bit-identical to the live 0.1.5 engine and to the bench build.
- Output is deterministic across fresh containers.
- The release image reports the identity the deployment needs (`engine_build` equal to the ECR tag).

**INFERRED:**
- Deploying this image changes no measured value for any input exercised here.
- The 0.1.6 rollout is a provenance change, not a measurement change.
- The 12-package build drift did not reach the measurement path, in this image or in the bench build.

**NOT ESTABLISHED:**
- Anything about skin, or any clinical meaning of a signal response.
- Validity of L\* or a\* as skin measurements.
- Behaviour on other faces, tones, beards or real phones.
- Identity on Fargate's native amd64 (production) against this emulated bench.
- That the pushed ECR digest will equal `9a8f96c0…`.
- Between-capture and between-day noise.

## I.6 Answers

**WHICH METRICS DESERVE HUMAN VALIDATION?**

| # | Field | Regions | Why |
|---|---|---|---|
| 1 | `colour.native.lStarMean` | cheeks, forehead | Passes A3 (slope 0.97–1.05) and A4 (≤ 5%) in every region, monotone, deterministic. **Exposure is its main risk** (0.5 EV ≈ the whole −8 L\* injection) |
| 2 | `colour.native.aStarMean` | cheeks, nose | Passes A3 (0.99–1.00) and A4 (≤ 2%) in every region, deterministic. Exposure ±1.1–1.4 units, non-monotone at +1 EV |

These two only.
- They are **photo statistics that earn a human test–retest study.** They are not validated skin measurements.
- KEEP was close to guaranteed by construction (the native path only resizes). The tests that can really fail them (§4.5, ACCEPTANCE C4) remain impossible here.
- Native b\* and ITA would need the face-b\* amendment pre-registered first. Texture, shine and corrected colour are not candidates.

**DOES 0.1.6 CHANGE ANY ARCHITECTURAL DECISION?**

**No.** MD-1, D-07, D-23 (the skinstate-1 freeze), D-24 and the deployment plan all stand unchanged. 0.1.6 makes four pending items concrete; it does not change them:

1. **The skinstate-1 engine table has a 0.1.5 entry only.** Records from 0.1.6 will get `landmarkModel` and `opencvVersion` null.
   - This release image supplies verifying evidence for an entry: cv2 4.11.0 from `/health/ready`, mediapipe 0.10.21 from the image.
   - Adding it is a SkinState code change and needs owner approval. It is **not** made here.
2. **`engine.build` is still null in skinstate-1.** Mapping it needs skinstate-2 or an approved amendment. That was already open in gate 04.
3. **0.1.5 and 0.1.6 records are not comparable under the contract key,** because `pipelineVersion` is a component. This run shows them measurement-identical on the bench, which could support a future **declared equivalence** between the two versions. That would be a contract decision, **not** made here; until then, the key keeps them apart.
4. **Deployment plan §5:** steps 1–4 are now done for `9a8f96c0…`. **Push this image, do not rebuild it.** A rebuild is a new digest and needs another replay.

---

# Part II: bench build `ce51ed2d…` (earlier run, same day)

The header below is from the bench run. Its results are identical to Part I.


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
- **Cross-check against gate 02's view (`155cb69`):** mapping the same 30 responses gives identical `regions`, `quality` and `uncertainty`. Only `identity` differs, because gate 02's `toSkinState` validates `analysisRef` against the `users/{uid}/scanAnalyses/{docId}` grammar. The bench script therefore now **passes** a different ref string. The output shape is unchanged (IMPLEMENTATION_GATE_02: "skinstate-1 is still frozen"), and the measurement blocks do not depend on which view is used.
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
- **Caveat on (b):** it is a reproduction check that H-EQ already implies, with thresholds (20%) set in view of the 0.1.5 values (cheeks `gradientMean` was 20.7%). It is not a test that could fail on its own. Classification is unaffected: neither field is in the candidate set under either class.

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
- **The deviation re-declarations add nothing independent.** Condition (b) follows from H-EQ, and its thresholds were set knowing the 0.1.5 values.
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
#    A rebuild will NOT reproduce Id sha256:ce51ed2dce3e… (§2.2: a --no-cache build of the
#    same commit resolves different transitive packages). The pinned image exists only in this
#    machine's local Docker store; keep it (or `docker save` it) if this evidence must stay
#    re-runnable. Any rebuild is a new digest and needs the PROTOCOL §8 replay.
# 2. Engine by ID, local only
docker run -d --name p016-engine --platform linux/amd64 -p 127.0.0.1:18016:8000 \
  -e ENV=production -e SCAN_API_SECRET=<local> -e MAX_CONCURRENT_SCANS=4 -e SCAN_TIMEOUT_SECONDS=300 \
  --cpus 2 --memory 4g sha256:ce51ed2dce3e2d4a3c3a00deadcd123e2f799ec785f348a4bd98802e2760088c
# 3. Matrix and determinism (skin-scan's pinned venv)
cd docs/research/measurement-validation/phase0
RESULTS_DIR=results_0_1_6 ENGINE_URL=http://127.0.0.1:18016 SKIN_SCAN_REPO=../../../../../skin-scan \
  SCAN_SECRET=<local> OUT_IMG=<scratch> ../../../../../skin-scan/.venv/bin/python bench.py matrix
RESTART_CMD=<recreate p016-engine by ID; wait for /health/ready> … bench.py determinism
# 4. Map through the FROZEN skinstate-1, then analyse. The committed results_0_1_6/skinstates.json was produced by
#    lib/skin-state.ts from fb9dfc2 (== dd9a3fe) plus fb9dfc2's to_skinstate.mts with ONLY the one-line
#    RESULTS_DIR change (detached worktree of fb9dfc2 + that edit). Do NOT use HEAD's to_skinstate.mts:
#    since gate 02 (155cb69) it passes a different analysisRef (required by gate 02's path validation).
#    Running HEAD's script with the default directory would overwrite the committed 0.1.5 skinstates.json.
RESULTS_DIR=results_0_1_6 npx vite-node docs/research/measurement-validation/phase0/to_skinstate.mts
RESULTS_DIR=results_0_1_6 ../../../../../skin-scan/.venv/bin/python analyse.py > results_0_1_6/summary.md
```

**Committed:**
- `phase0/results_0_1_6/`: `matrix.json` (full responses, realised shifts and transmitted-image hashes), `skinstates.json`, `determinism.json`, `summary.json`, `summary.md`
- the `RESULTS_DIR` override in `bench.py`, `analyse.py` and `to_skinstate.mts`
- this file and the MD-1 addendum

**Images are not committed.**

---

## Bench-run candidate set (superseded by Part I)

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
