# Measurement validation: PROTOCOL

Status: **DRAFT for owner and ethics review** (2026-10-03). Research design only; no production implementation.

Companion docs:
- DATA_SPEC.md: what is recorded.
- ANALYSIS_PLAN.md: how it is analysed.
- ACCEPTANCE_CRITERIA.md: what passes.
- Summary and the answer to the governing question: `docs/architecture/MEASUREMENT_VALIDATION_STATUS.md`.

**Supersedes** EVALUATION_PLAN.md Track 1 (test–retest). That plan's design is kept where it holds and changed where the engine facts below break it (§9).

---

## 1. The question, split in two

"Has this user's skin changed?" contains two separate claims, which need separate evidence.

| Claim | What it says | Evidence required | Engine can make it after this protocol? |
|---|---|---|---|
| **(a) Measurement change** | "This photo statistic differs from your baseline by more than its measurement noise" | Multi-day test–retest under **production-like capture** → SEM, MDC95 per field × region × tone band (Phases 0–3) | **Yes**, for fields that pass |
| **(b) Skin change** | "Your skin's redness / lightness actually changed" | (a) **plus** criterion validity against a reference instrument and responsiveness to a known change (Phase 4) | Only if Phase 4 runs and passes |

SKIN_STATE_CONTRACT_FINAL §1: MEASURED fields "measure the photo, not the skin". Until Phase 4 passes, the product may say only "larger than measurement noise". It may never say "improved", "worsened" or "meaningful".

**A minimal important change (MIC) is not knowable from this study.** Nothing here establishes how much change matters to a person, and none of these photo statistics has a published MIC. That needs anchor-based work: patient-reported anchors and clinician ratings. It is out of scope, and causal product-effect claims are banned anyway (CLAUDE.md).

## 2. What is under test

### 2.1 Engine facts that shape the design

Verified in code at `scan-0.1.5-provisional`, skin-scan `7f3695e`. See the STATUS doc for file:line references.

1. **All 7 `scores` and every `region_scores` value are image-relative** (face z-score or percentile, then min-max). They are deprecated PROXY under the contract. They are **not candidates.** They are run only to document their failure (ANALYSIS_PLAN §7).
2. **The corrected colour path** applies whole-frame gray-world, then CLAHE, then gamma 1.1.
   - CALIBRATION.md: a synthetic +20 a* shift shrank from 17.7 to **1.3** after gray-world.
   - So corrected-path colour is expected to be **repeatable but unresponsive**: a real whole-face colour change is mostly normalised away.
   - Responsiveness is therefore tested on the bench (Phase 0) **before** any human repeatability is spent on it.
3. **The native path** (resize only) is the only colorimetry candidate. It is produced only with `/scan?stats=both`, and **production never sends `stats`**.
4. **There are no capture-quality signals.** Blur, exposure, pose, face scale, glare and occlusion do not exist. The only one is `pixelCount`.
5. **Region masks use fixed-pixel dilations** on a frame resized to ≤1024 px. Texture kernels are fixed in pixels, so texture statistics depend on face scale (camera distance).
6. **Input-path divergence:**
   - The HTTP path decodes with PIL **without EXIF transpose** and drops ICC, so Display-P3 is read as sRGB.
   - The offline scripts (`calibrate.py`, `extract_native_stats.py`, `scan_image.py`) decode with `cv2.imread`, which **does** rotate.
   - Mobile production sends a browser re-encode (`createImageBitmap(imageOrientation:"from-image")`, ≤1280 px, JPEG q0.92).
   - Desktop production sends the full `getUserMedia` frame with no 1280 downscale.
7. **Determinism:**
   - Bit-identical JSON was shown for 3 runs in one process on macOS-arm64.
   - Not bit-identical across environments: blemishes differed by 1.6e-4 against the fixture.
   - Fresh-process, threadpool and linux/amd64 runs were not tested.

### 2.2 Primary fields (pre-registered)

These are taken from SKIN_STATE_CONTRACT_FINAL §5.6, the defensible proxy routes. Every other MEASURED field is **exploratory**.

| # | Field (contract path) | Region(s) | Unit | Why primary |
|---|---|---|---|---|
| P1 | `colour.native.lStarMean` | cheeks, forehead | CIE L* | The only lightness candidate. It feeds evenness and ITA |
| P2 | `colour.native.bStarMean` | cheeks, forehead | CIE b* | ITA input |
| P3 | `colour.native.aStarMean` | cheeks, nose | CIE a* | Redness proxy |
| P4 | `texture.lbpEntropy` | cheeks, forehead | bits | The most scale-robust texture statistic |
| P5 | `specular.fraction` | forehead, nose | fraction | Shine proxy. Bounded and zero-inflated (ANALYSIS_PLAN §5) |
| D1 | ITA° = atan((L*−50)/b*)·180/π | cheeks | degrees | DERIVED from P1 and P2. Analysed as a derived endpoint |

The corrected-path twins of P1–P3 are analysed as **exploratory controls**, to show the gray-world and CLAHE effect on repeatability and responsiveness. Chin is exploratory everywhere because it is beard-sensitive.

## 3. Phases

| Phase | Humans | Purpose | Gate to next phase |
|---|---|---|---|
| **0 Bench** | none | Input fidelity, determinism, responsiveness to known perturbations, device and illuminant behaviour on a colour target | ACCEPTANCE §A |
| **1 Internal pilot** | 18 (6 per tone band) | Feasibility, attrition, quality-failure rate, first variance-component estimates → **re-estimate n** | ACCEPTANCE §B (feasibility only; no field passes or fails here) |
| **2 Main test–retest** | about 160 enrolled → about 135 completers | SEM, MDC95, ICC per field × region × band, in the naturalistic and controlled arms | — |
| **3 Held-out validation** | users partitioned out of Phase 2 | Do the calibrated MDCs transfer to unseen users? | ACCEPTANCE §C–D |
| **4 Criterion and responsiveness** (optional; needed for claim (b)) | a subset of 30–45 | Phone vs reference colorimeter; response to a known, benign induced change | ACCEPTANCE §E |

## 4. Phase 0: bench (no humans)

### 4.1 Pinned build
- One linux/amd64 image digest of skin-scan, recorded for the whole study.
- Every study image is scored through the **HTTP `/scan?stats=both`** of that digest, never through offline scripts. A **digest change restarts Phase 0** and requires a replay (§8).

### 4.2 Input fidelity
- A harness applies the production client transform to the original:
  - `createImageBitmap(..., {imageOrientation:"from-image"})`
  - long side ≤1280
  - canvas → JPEG q0.92, in a pinned headless Chromium, plus one real iOS Safari and one Android Chrome spot check
- Assert:
  - the harness output decodes to the same pixels as a real-device upload of the same original (ΔRGB ≤ 1 on ≥99.9% of pixels), on 10 test originals per OS
  - EXIF orientation is applied once, not zero or two times
  - P3-tagged originals are flagged. The engine ignores ICC, so P3 iPhone images are **a device stratum, not an error**

### 4.3 Determinism
- 100 identical submissions of each of 5 images, from fresh containers and under concurrent load (`MAX_CONCURRENT_SCANS=4`).
- Expect bit-identical output; a tolerance is set in ACCEPTANCE §A.

### 4.4 Responsiveness on synthetic perturbations
On 10 consented or licensed face images, inject known changes **inside the face mask only**, and separately **in the background only**:

| Perturbation | Levels | Fields expected to respond |
|---|---|---|
| Face-only a* shift | +1, +2, +4, +8 CIE a* | a* fields |
| Face-only L* shift | −2, −4, −8 L* | L* fields |
| Background-only a*/b* cast | ±5, ±10 | none (should be invariant) |
| Global exposure | ±0.5, ±1 EV | describes a confounder |
| Gaussian blur | σ 0.5, 1, 2 px | texture fields (confounder) |
| Downscale (face scale) | 0.6, 0.8 × | texture and `pixelCount` (confounder) |
| JPEG quality | 0.92 → 0.75 | texture (confounder) |

Output per field: response slope to the intended change, and leakage from the unintended ones. **Prediction:** corrected a* and L* fail (slope ≪ 1, background leakage). Native passes for colour; texture is confounded by blur and scale.

### 4.5 Colour target under real capture
- An X-Rite ColorChecker Classic (or equivalent) is held at face position.
- 3 illuminants (window daylight, warm LED about 2700 K, cool LED about 5000 K) × the study device set × 5 captures.
- This separates **device and illuminant** variance from skin. Patch ΔE00 against the reference values per device and illuminant tells which device-illuminant combinations can ever be compared.

## 5. Participants (Phases 1–3)

**Inclusion:**
- adults 18+, Indian residents, owning a smartphone with a front camera
- able to attend 3 study days over 4 weeks
- informed consent to the **study** purpose. This is separate from product consent, and no production account is involved.

**Exclusion:**
- active dermatological treatment or planned procedures
- planned sun holiday or tanning during the window
- pregnancy-related pigmentation change not stable (self-declared)
- facial tattoo or makeup that cannot be removed on capture days

**Stable-routine instruction (critical):**
- no new skincare, sunscreen change, facial or shave-style change during the 4 weeks
- deviations are logged (DATA_SPEC §4)

The noise floor deliberately **includes** normal day-to-day biological fluctuation. That is the variation a production user's "change" must exceed. Logged deviations go to sensitivity analysis, not to the noise floor.

**Tone stratification (never self-report, never the engine's own ITA):**
- Primary: Monk Skin Tone (MST) rated **in person by 2 trained raters** with the MST card under the controlled illuminant. Disagreement > 1 step goes to a third rater. Inter-rater weighted κ is reported.
- Secondary, if a colorimeter is available (Phase 4 hardware): instrument ITA on the **inner upper arm** (constitutive) and on the cheek.
- Bands (design choice):
  - **T1: MST 1–4**
  - **T2: MST 5–6**
  - **T3: MST 7–10**
- The cut points are a design choice for an Indian population:
  - MST 1–3 alone is unlikely to fill, so it is merged with 4.
  - The darker half is split, so the darkest tones are powered separately. That is where published colour metrics degrade (research doc, citing Daneshjou 2022; not verified by this team).
- **Each band is recruited to quota.** Pooling cannot hide a failing band (ACCEPTANCE: a field that fails in any band fails).

**Other recruitment quotas (minimums per band):**
- ≥ 30% beard or stubble (chin and cheek masks)
- ≥ 40% iOS and ≥ 40% Android
- age spread across 18–29, 30–44 and 45+

## 6. Capture design

### 6.1 Arms
- **Naturalistic (N), the production arm.**
  - Own phone, own home, own lighting, the **production capture UI** (mobile, front camera, `captureMethod: native`), with only the production guidance text.
  - **MDC tables for the product come from this arm only.** The production app has no face guide and no quality gate, so this arm's noise is the product's noise.
- **Controlled (C), the best case.**
  - Study site, one reference Android **and** the participant's own phone.
  - Fixed illuminant: daylight-balanced LED panel at a fixed distance, with a plain grey background.
  - Fixed distance marker (about 35 cm), fixed head support, beauty mode, HDR and flash off.
  - Shows what capture standardisation (a future face guide or quality gate) could buy.

### 6.2 Schedule
Three study days per participant: **D0, D7 ± 1 and D28 ± 3.**
- This resolves the existing conflict (EVALUATION_PLAN: same day plus 7 days; research doc: 4 weeks).
- Three distinct days give the day-level variance component df = 2 per participant. Two days would give only 1.

| Block | When | Arm | Captures |
|---|---|---|---|
| N-AM | each day, morning | N | 3 re-positioned captures (phone lowered and raised between them) |
| N-PM | each day, ≥ 4 h later | N | 3 re-positioned captures |
| C | D0 and D28 | C, reference phone | 3 re-positioned |
| C-own | D0 and D28 | C, own phone | 3 re-positioned |
| COND | D0 only | C site | 2 illuminants (daylight LED, warm 2700 K LED) × 2 backgrounds (grey, patterned) × 2 captures = 8 |
| BURST | D0 only | C, reference phone | 5 captures **without** re-positioning (sensor plus engine noise floor) |

Per participant this is 18 N (6 per day × 3 days) + 6 C + 6 C-own + 8 COND + 5 BURST = **43 captures**. Across about 135 completers that is about 5,800 images. The N blocks are self-administered at home through a study build of the capture page (§7).

### 6.3 Pre-capture standardisation (both arms)
- face washed and dried ≥ 15 min before capture
- no makeup or sunscreen
- hair off the forehead
- neutral expression
- glasses off

Each item is recorded as a yes/no checklist.

## 7. Study software (research build, not production)

- **A study-only page**, built from the production capture components but writing to a **separate study namespace**: never the production `users/` tree, and never production accounts (DEV_PROD_BOUNDARY.md).
- **Storage:**
  - a dedicated ap-south-1 bucket (`projectskin-study-mv1-*`)
  - a study Firestore database or plain object storage in asia-south1
- **Each capture sends:**
  - the original file
  - the production client transform output
  - the `/scan?stats=both` response from the pinned digest
  - capture metadata (DATA_SPEC §3)
- **No production code changes.** If the study page needs a code path in this repo, it goes in a separate, flagged route reviewed as its own gate.

## 8. Engine changes during or after the study

- MDC tables are keyed by `(pipelineVersion, engine.build, colourPath, input.variant, captureMethod)` (contract §7.1).
- **Engine-only change:** replay all archived study originals through the new digest, through the same client-transform harness. Recompute the tables; no new participants are needed.
- **Capture-side change** (UI guidance, resolution, JPEG quality, capture API): needs **new** human data, at least a Phase-1-sized re-run in all three bands.

## 9. What this changes from EVALUATION_PLAN Track 1

| EVALUATION_PLAN | Here | Why |
|---|---|---|
| S1 and S2 the same day, S3 at +7 days | D0, D7 and D28, with AM and PM blocks each day | The longitudinal noise floor is **between days**; same-day repeats understate it |
| n=30, about 10 per band, "ICC CI ±0.1 at 0.8" | about 135 completers, about 30 per band in calibration plus about 15 per band held out | ±0.1 holds only for the pooled n=30. Per band (n≈10) the CI is about ±0.2–0.25 (ANALYSIS_PLAN §8) |
| Scores, corrected raw and native raw, all on equal footing | Native primary; corrected is a control; scores only to document failure | Contract: scores are deprecated; corrected colour is unresponsive by construction |
| Offline scripts on the 1280/q0.92 downscale | The HTTP `/scan` on a pinned digest, after the exact client transform | `imread` vs PIL orientation difference; desktop path differs |
| One pooled lighting × background factorial | Split into a production arm (N) and a controlled arm (C), plus a condition block | The product's MDC must reflect production capture |
| MST 3–5 / 6–7 / 8–10 | MST 1–4 / 5–6 / 7–10 | Indian-population fill; the darkest band powered alone |

## 10. Ethics, consent and data protection

- **Independent Ethics Committee review** under the ICMR National Ethical Guidelines (2017) before Phase 1.
  - Whether a non-clinical cosmetic-measurement study strictly requires it is a LEGAL question. This protocol assumes yes, because it collects face images and health-adjacent context.
- **Study consent covers:**
  - face images, including retention period and location (India)
  - optional colorimeter contact
  - no diagnosis given
  - withdrawal and erasure at any time
- Consent is DPDP-compliant: purpose-limited and separate from product consent.
- **Pseudonymous participant IDs.** The key table is held separately with restricted access. Images are biometric, so they never leave the study bucket, and Gemini never sees study data.
- **Compensation** per session, not contingent on completing.

## 11. Budget-tiered alternative (owner is cost-sensitive)

| Tier | n (completers) | What it can claim |
|---|---|---|
| 0 Bench only | 0 | Which fields respond at all; device and illuminant behaviour on a colour target. **No user-facing change claim** |
| 1 Pilot only | 18 | Feasibility and rough variance components. **No calibrated field.** Uncertainty stays `unknown` |
| 2-lite: one band | about 45 (30 calibration + 15 validation) in the dominant band of the user base | Calibrated MDC **for that band only**. Under the most-conservative-band policy, the product can show change only to users classified in that band. That needs a production tone classifier, which does not exist, so **in practice nothing is unlocked** |
| **2 Full (recommended)** | about 135 completers, 3 bands | Claim (a) for passing fields, for all users |
| 2 + 4 | plus a 30–45 subset with a colorimeter | Claim (b) for colour fields that pass criterion validity |
