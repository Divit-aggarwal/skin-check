# SKIN_STATE_CONTRACT_FINAL: canonical SkinState, contract version `skinstate-1`

**Status: FROZEN** (2026-10-03). Any change to a field, its mapping, its unit or its class requires a new `contractVersion`. Old versions are never edited.

**Supersedes** SKIN_STATE_CONTRACT.md (draft). The stored `skinStates` collection in DATA_MODEL.md, SYSTEM_MODEL.md and IMPLEMENTATION_MAP.md C2 is replaced by the computed view defined below (DECISION_LOG D-23).

**Sources:**
- the real CV output of `skin-scan` at `scan-0.1.5-provisional` (deployed image `sha-7f3695e`): every field, traced to the code that produces it;
- the gate-01 raw record `users/{uid}/scanAnalyses/{scanId}_{sha16}` (commit 6e9081d);
- the measurement research (LONGITUDINAL_METHOD.md, EVALUATION_PLAN.md, and the research doc).

No production code changed in producing this document.

> **Amendment A1 (2026-10-03, before the first implementation; no SkinState had ever been produced).** Gate 01 round 2 (`428c63d`) added the source field `persistAttempt` after this contract was frozen. That marker means the record came from a second CV run, triggered after a failed server save. `skinstate-1` therefore carries it as `provenance.persistAttempt` (§8). This is the only change, and it is made under the same version because no consumer or output existed yet. Any later change requires a new `contractVersion`.

---

## 0. What a SkinState is

A SkinState is a **pure, deterministic, versioned view** over one immutable `scanAnalyses` record:

```
SkinState = toSkinState(scanAnalysisRecord, contractVersion)
```

| Property | Rule |
|---|---|
| Identity | `(analysisRef, contractVersion)`. `analysisRef` is the scanAnalyses document path. A SkinState has no id of its own |
| Storage | **Not stored.** Computed on read. The raw record is the only stored truth. If it is ever cached, the cache is non-authoritative and keyed by identity |
| Immutability | The input is create-only (rules: `write: if false`). The mapping for a version is frozen. So a SkinState for a given identity can never change |
| New engine | A re-processed image is a new scanAnalyses record, which yields a new SkinState. Nothing is re-mapped in place |
| New mapping | A new `contractVersion` changes the output, while every old `(analysisRef, oldVersion)` pair stays reproducible. The mapping functions for every published version remain in code |
| Legacy `skinChecks.result` (schemaVersion 1) | **Produces no SkinState.** It has no raw data, no server provenance and no rescorable content. Readers may show it only as a labelled legacy display, never as a SkinState |
| Population today | **Zero SkinStates exist in production.** Gate 01 is committed but not deployed, and every existing record is legacy |

A SkinState describes **one photograph under one engine build**. It is not a description of the person's skin, a diagnosis, or a trend point. Whether a field means anything about skin is stated by its class (§1) and its uncertainty (§6).

---

## 1. Field classes (each field has exactly one)

| Class | Definition | Allowed field names |
|---|---|---|
| **MEASURED** | A deterministic statistic of pixel values inside a stated region, with a stated unit and a stated colour path (`corrected` or `native`). **It measures the photo, not the skin.** | Physical names only: `aStarMean`, `specularFraction`. Never `redness`, `oiliness`, `hydration` |
| **DERIVED** | Computable from other SkinState fields alone, under a stated, versioned formula. **Never stored as an authoritative measurement** | Any. The formula id is part of the field definition |
| **PROXY** | A value whose name claims a skin property that the computation does not physically measure, or a construction that cannot be recomputed from stored fields | Skin-property names, always rendered with "photo-based estimate". Legacy proxies are deprecated |
| **SELF_REPORTED** | Stated by the user | Never inside SkinState. SkinState references the questionnaire; it does not copy it |
| **INFERRED** | Output of a learned model, such as MediaPipe landmarks or a future lesion detector | Must carry model id and version |
| **UNKNOWN** | Defined by the contract, but not available for this record. The value is `null` with an explicit status | Present as `null`. Never omitted, never defaulted, never `0` |

**Status per field instance:**
- `available`: value present.
- `unknown`: the input record lacks it.
- `absent_region`: the region was not found in this photo (§4).
- `deprecated`: not exposed.

---

## 2. The CV output, challenged

What each current output actually computes is taken from the code at `scan-0.1.5-provisional`. The verdict follows from what it computes, not from whether the product currently displays it.

| Finding | Evidence | Consequence for the contract |
|---|---|---|
| All 7 `scores` and every `region_scores` value are normalised **within the photo** (z-score or percentile, then min-max). Severity is divided out | `score_semantics.py`: all `image_relative`. `redness.py:83-99`: score = (mean − min)/(max − min) over face pixels, so two extreme pixels set it | PROXY, **deprecated**. Not in SkinState. Retained only in scanAnalyses, to reproduce what a user was shown |
| "Hydration" is built from inverse-gradient terms. `mean(1/(g+1e-6))` is dominated by zero-gradient (flat or clipped) pixels | `hydration.py` | Hydration and its internals `smoothness_raw` and `evenness_raw` are **deprecated**. `grad_raw` survives as a texture statistic, renamed (§5) |
| "Pores": fixture `pore_count` is 0 in every region. At the 1024 px working size pores are below one pixel. `pore_density` and `pore_density_per_kpx` are the same value under two names | `pores.py:117-119`; `version.py` 0.1.5 note | All `pore_*` **deprecated** |
| "Blemishes": a ≥2-of-4 vote whose thresholds are face percentiles (a* > p70, colour variance > p60). About 30–40% of pixels pass **by construction** | `blemishes.py:251-272` | `blemish_pixel_frac` and `blemish_blob_count` are **deprecated** PROXY. The percentile values `lab_a_p70_value` and `color_var_p60_value` are image-relative threshold internals, also **deprecated**. Re-scoring uses the fixed-edge histograms instead (§5) |
| The corrected colour path applies a **whole-frame** gray-world (background and clothing shift face a*/b*), then **CLAHE** (destroys absolute L*), then gamma 1.1 | `preprocess.py` | Corrected-path colour is MEASURED on a transformed image. Its L* is **not lightness** and must never feed ITA or tone. Real colorimetry candidates exist only on the `native` path |
| `region_raw`, `region_hist` and `region_hist_bin_edges` are **identical copies** of their `_corrected` versions (verified on the fixture) | `compose.py:245-249`; fixture equality | Map **only** from `_corrected`. The aliases are deprecated: their meaning follows "the default path" and could silently change |
| `lab_a_mean` is written by **two producers** (`redness.py:34` and `pigment.py:64`). Both compute the mean of decoded a* over the same mask; the merge keeps whichever runs last | `compose.py:233` (`setdefault().update()`) | Canonical `aStarMean` is bound to **one** producer (`redness.py`). The collision is a known engine hazard: any formula change in either file silently changes the stored value |
| Units are mixed: `lab_l_std` and `lab_b_mean` are OpenCV 8-bit encodings; `*_decoded` are CIE scale. `color_var` is \|L − blurred L\| in **8-bit L units**, although its comment says "L* units" | `pigment.py:52-64`; `blemishes.py:96-110` | Decoded variants only. Encoded duplicates are deprecated. The `color_var` unit is stated truthfully |
| An **empty region yields `0.0` for every stat**, indistinguishable from a real zero | `pigment.py:68-73`, `redness.py:39`, and the other maps | `pixelCount == 0` maps to `status: absent_region` with every value `null`. A `0.0` from an empty mask is never exposed |
| The forehead mask includes the **eyebrows**. Cheeks are built left and right, then **merged**. There is no beard or fringe exclusion | `face_mesh.py:184,223` | Regional values are contaminated by hair (an image-quality dependency, §7). The cheek split is reserved (§4) |
| The whole frame is resized to 1024 px, so face pixel scale varies with camera distance. Texture kernels are fixed in pixels | `preprocess.py:6-29` | Texture statistics are **scale-dependent**. Comparison needs a face-scale covariate, which is UNKNOWN today |
| `region_low_confidence` = `region_px < 2000`, a threshold taken from 3 photos | `compose.py:68,245` | DERIVED (recomputable from `pixelCount`). Not authoritative |

---

## 3. Top-level shape

```
SkinState {
  contractVersion: "skinstate-1"
  identity:    { analysisRef, scanId }
  provenance:  { … §8 }
  engine:      { … §7 }
  input:       { … §8 }
  regions:     { [regionKey]: RegionState }        // §4–§5
  uncertainty: { … §6 }
  quality:     { … §7 }
  deprecatedSourceFields: string[]                 // which deprecated source keys existed in the record
}
```

## 4. Regional structure

| Region key | Status in `skinstate-1` | Source |
|---|---|---|
| `forehead` | Canonical. Contaminated by brows | engine region `forehead` |
| `nose` | Canonical | `nose` |
| `chin` | Canonical. Beard-sensitive | `chin` |
| `cheeks` | Canonical **for pipelines that emit only the union**. Left and right are combined | `cheeks` |
| `cheek_image_left`, `cheek_image_right` | **Reserved.** They come into use only when the engine emits them: needs approval under D-18 and a `PIPELINE_VERSION` bump. They are named by *image* side because front-camera mirroring is unverified. Once present, `cheeks` becomes DERIVED (the pixel-weighted union) and is never stored | — |
| Periorbital, jaw, whole face | Not defined. No whole-face value exists in SkinState. Whole-face aggregates are DERIVED at most, and discouraged | — |

**Rules:**
1. The region set is fixed per `pipelineVersion`. It is never inferred from data.
2. A region with `pixelCount == 0` is `absent_region` with every value `null`.
3. **Region geometry is INFERRED**: masks come from MediaPipe Face Mesh landmarks (`mediapipe==0.10.21`, `mp.solutions.face_mesh`, `refine_landmarks=True`, 478 points) plus the pipeline's mask rules. `pixelCount` is MEASURED given that mask.
4. Landmarks themselves are never stored or exposed, because they are biometric.

## 5. Canonical fields (per region)

Every field below is MEASURED unless stated otherwise. Source paths refer to the scanAnalyses record. `{r}` is the region key.

### 5.1 Geometry

| Field | Class | Unit | Source | Notes |
|---|---|---|---|---|
| `pixelCount` | MEASURED | px at working resolution (≤1024 long side) | `region_raw_corrected[{r}].region_px` | Depends on mask (INFERRED) and on distance. Not a size of skin |

### 5.2 Colour, corrected path (`colour.corrected`)

These are colour statistics of the photo after whole-frame gray-world, CLAHE and gamma. **This is not skin colorimetry.**

| Field | Class | Unit | Source | Notes |
|---|---|---|---|---|
| `aStarMean` | MEASURED | CIE a* (0 = neutral) | `region_raw_corrected[{r}].lab_a_mean`, producer `redness.py` | Background-confounded through gray-world |
| `aStarP90` | MEASURED | CIE a* | `…lab_a_p90` | |
| `aStarSd` | MEASURED | CIE a* | `…lab_a_std` | |
| `bStarMean` | MEASURED | CIE b* | `…lab_b_mean_decoded` | |
| `lStarMeanPostClahe` | MEASURED | CIE-scaled L after CLAHE | `…lab_l_mean` | **Not lightness.** Never an input to ITA, tone or pigment change. The name carries the warning on purpose |
| `lStarSdPostClahe` | MEASURED | CIE-scaled L after CLAHE | `…lab_l_std_decoded` | Inflated by CLAHE |
| `aStarHist` | MEASURED | counts per bin. Fixed edges: 21 values, −10…+20 a*, 20 bins | `region_hist_corrected[{r}].lab_a_hist` + `region_hist_bin_edges_corrected.lab_a_hist` | **The re-scoring substrate.** Absolute a* thresholds can be applied retroactively. Edges are stored with the counts |
| `aStarHistClip` | MEASURED | `{underflow, overflow: count; min, max: a*}` | `…lab_a_hist_clip` | Out-of-range mass; doubles as an exposure and colour-cast covariate |

### 5.3 Colour, native path (`colour.native`)

Resize only; no gray-world and no CLAHE. Still after the phone's own image processing.

| Field | Class | Unit | Source | Status today |
|---|---|---|---|---|
| `aStarMean`, `aStarP90`, `aStarSd`, `bStarMean` | MEASURED | CIE | `region_raw_native[{r}].*` (same stat names as corrected) | **UNKNOWN in every record.** `stats=both` is never requested (D-07) |
| `lStarMean` | MEASURED | CIE L* (0–100) | `region_raw_native[{r}].lab_l_mean` | UNKNOWN. **The only candidate for a lightness measurement** |
| `lStarSd` | MEASURED | CIE L* | `…lab_l_std_decoded` | UNKNOWN |
| `aStarHist`, `aStarHistClip`, `localLContrastHist`, `localLContrastHistClip` | MEASURED | as in §5.2 / §5.4 | `region_hist_native`, `region_hist_bin_edges_native` | UNKNOWN |

### 5.4 Texture and surface (`texture`, `specular`)

| Field | Class | Unit | Source | Notes |
|---|---|---|---|---|
| `texture.laplacianVarMean` | MEASURED | grey-level² | `…lap_var_mean` | Depends on scale, focus, JPEG and CLAHE. A sharpness statistic as much as a texture one |
| `texture.lbpEntropy` | MEASURED | bits | `…lbp_entropy` | More scale-robust. A test–retest candidate (EVALUATION_PLAN §1) |
| `texture.gradientMean` | MEASURED | grey-level per px | `…grad_raw` | Renamed from a hydration input. Kept as a texture/sharpness statistic, **not** hydration |
| `texture.localLContrastHist` | MEASURED | counts. Edges: 21 values, 0…100, **8-bit L units** | `region_hist_corrected[{r}].color_var_hist` + edges | \|L − blurred L\|. The unit is 8-bit L, not CIE L* |
| `texture.localLContrastHistClip` | MEASURED | `{underflow, overflow, min, max}` | `…color_var_hist_clip` | |
| `specular.fraction` | MEASURED | fraction 0–1 of region pixels with V>200, S<80, gradient<50 (fixed thresholds) on the corrected image | `…specular_frac` | Measures reflection geometry and lighting. **Not sebum** |

### 5.5 Deprecated: present in the record, never in SkinState

`scores.*`, `region_scores.*`, `blemish_pixel_frac`, `blemish_blob_count`, `lab_a_p70_value`, `color_var_p60_value`, `smoothness_raw`, `evenness_raw`, `pore_count`, `pore_density`, `pore_density_per_kpx`, `lab_l_std` (8-bit), `lab_b_mean` (8-bit), and the un-suffixed aliases `region_raw`, `region_hist`, `region_hist_bin_edges`.

Their names are listed in `deprecatedSourceFields` so a reader can see they existed. Their values stay in scanAnalyses for audit and to reproduce legacy displays.

### 5.6 Proxy indicators: the display layer, not SkinState fields

If the product shows a skin-concept indicator, it is a **DERIVED-from-MEASURED proxy** with:
- its own versioned formula id,
- the label "photo-based estimate",
- the single-photo caveat.

It is never an authoritative measurement and never stored.

| Indicator (display name) | May be derived from | Status |
|---|---|---|
| Redness | `colour.native.aStarMean` / `aStarHist` (preferred), or `colour.corrected.*` | PROXY. Literature: phone a* is repeatable (ICC 0.85) but agrees poorly with clinical imaging (ICC 0.15–0.24) |
| Shine | `specular.fraction` | PROXY (lighting geometry) |
| Texture | `texture.lbpEntropy` | PROXY |
| Evenness / dark marks | `colour.native.lStarMean`, `bStarMean` (ITA) | PROXY. The **only measurement candidate**, pending study |
| Breakouts | — | **None.** No valid producer exists. Needs a trained, validated detector (INFERRED) |
| Hydration / dryness | — | **Never.** RGB cannot measure it |
| Pores | — | **None** at this resolution |

## 6. Confidence and uncertainty

```
uncertainty: {
  policy: "unknown" | "calibrated",
  calibrationId: string | null,      // versioned noise table; null today
  fields: { [fieldPath]: { status: "unknown" } |
                         { status: "calibrated", sem: number, mdc95: number, unit: string,
                           toneBandPolicy: "most_conservative" } }
}
```

**Today, every field is `{status: "unknown"}`.** No interval or confidence number may be produced by the frontend, Gemini or any helper until a calibration table exists (EVALUATION_PLAN §1).

**Rejected representations:**

| Representation | Why it's rejected |
|---|---|
| A 0–1 "confidence" | Fabricated precision |
| `region_low_confidence` as uncertainty | It is a pixel-count flag. Sampling error of a mean over >2000 px is negligible next to capture variation |
| Sampling standard error from `pixelCount` | Same reason: capture variation dominates |
| Model self-reported confidence | Gemini must never assign confidence (GEMINI_BOUNDARY) |

Once calibrated, uncertainty is SEM and MDC95 in the field's native unit, per field × region × tone band. Until per-user tone data exists, the **most conservative band** applies. It is never chosen from self-reported Fitzpatrick or from per-photo ITA.

## 7. Engine, model and image-quality dependencies

### 7.1 Engine block (required for comparability)

| Field | Class | Today | Rule |
|---|---|---|---|
| `engine.pipelineVersion` | MEASURED (provenance) | available (`scan-0.1.5-provisional`) | Required. Hand-edited, so it is not sufficient on its own |
| `engine.build` (image digest or git SHA) | UNKNOWN | **null**. The CV service does not return it yet (C12) | Required for comparability once available. May be **DERIVED provenance** for gate-01 records by matching `analyzedAt` to the ECS deployment history. If so, mark it `derivedFrom: "ecs-deploy-history"` |
| `engine.landmarkModel` | INFERRED-source metadata | `mediapipe-0.10.21-face_mesh` (constant per pipelineVersion) | Taken from a per-pipelineVersion table in code |
| `engine.opencvVersion` | UNKNOWN per record | Exposed only on `/health` | Per-pipelineVersion table; null if unknown |
| `engine.scoreTypes` | provenance | `score_types` map | Kept to document the deprecated scores |
| `engine.statsPath` | MEASURED (provenance) | `corrected` always; `native` is null | — |

**Comparability key** (LONGITUDINAL_METHOD §3):

```
(fieldPath, pipelineVersion, engine.build, colourPath, input.variant, input.captureMethod)
```

A **null component means not comparable**. Today every SkinState has a null `engine.build` and a null `captureMethod`, so **no two SkinStates are comparable.** This is consistent with every metric lacking a calibration.

### 7.2 Image-quality dependencies

| Field family | Depends on | Signal available today |
|---|---|---|
| All colour (corrected) | Scene illuminant, **background and clothing** (whole-frame gray-world), exposure, phone AWB / tone curve / beauty mode | `aStarHistClip` only |
| All colour (native) | Illuminant, exposure, phone processing | UNKNOWN |
| `lStarMeanPostClahe` | CLAHE local equalisation | Not interpretable |
| Texture (`laplacianVarMean`, `gradientMean`, `localLContrastHist`) | Focus or blur, camera distance (scale), JPEG quality, beauty filters, hair | none |
| `lbpEntropy` | Blur, noise, beauty filters | none |
| `specular.fraction` | Light direction, flash, sweat or makeup, distance | none |
| All regional values | Mask accuracy (pose, occlusion), brows (forehead), beard (chin, cheeks), fringe | `pixelCount` |

**`quality` block (`skinstate-1`):**

| Field | Class | Today |
|---|---|---|
| `quality.lowPixelCount[r]` | DERIVED: `pixelCount < 2000`, threshold id `lowpx-2000-v0` | available |
| `quality.blur` | UNKNOWN | null |
| `quality.exposure` | UNKNOWN | null |
| `quality.pose` | UNKNOWN | null |
| `quality.faceScale` | UNKNOWN | null |
| `quality.occlusion` | UNKNOWN | null |
| `quality.device` | UNKNOWN | null |

The UNKNOWN fields are filled only by a separately versioned quality producer (C1).

## 8. Provenance and input

| Field | Class | Source | Today |
|---|---|---|---|
| `identity.analysisRef` | provenance | Firestore path of the scanAnalyses doc | available (gate-01 records) |
| `identity.scanId` | provenance | record `scanId` | available |
| `provenance.source` | provenance | record `source` (`"server"`) | available |
| `provenance.recordSchemaVersion` | provenance | record `schemaVersion` | available (1) |
| `provenance.requestId` | provenance | record `requestId` | available |
| `provenance.persistAttempt` | provenance | record `persistAttempt`: `"recovery"` → `"recovery"`; absent → `"primary"` (the route writes the marker only on the client's background re-request; Amendment A1) | available |
| `provenance.analyzedAt` | provenance | record `createdAt` (server timestamp of the analysis write) | available. **Not the capture time**: a retry after a refresh analyses later |
| `provenance.capturedAt` | UNKNOWN | — | null. No reliable capture timestamp is collected |
| `provenance.processingConsentVersion` | UNKNOWN | — | null. Processing consent is not versioned or stored (C4) |
| `input.variant` | provenance | constant `"cv_downscale_1280"` for live gate-01 records | available |
| `input.analysedImageSha256` | provenance | record `inputSha256` | available. Hashes the **analysed downscale**, not the original |
| `input.captureMethod` | UNKNOWN today | record `captureMethod` | null. The route accepts it but no client sends it |
| `input.originalRef` | provenance | — | Not linked in gate-01 records. The original S3 object is under `users/{uid}/scans/{scanId}/original.jpg` only when the questionnaire record says `image.stored` |
| `questionnaireRef` | provenance (link only) | `skinChecks/{scanId}` | Join only. Answers are SELF_REPORTED and never copied into SkinState |

**SELF_REPORTED context.** These are referenced, never part of SkinState:
- `skin_tone` (self-reported Fitzpatrick; never used as a tone band)
- `primary_concerns`, `acne_areas`, `breakout_pattern`, `pih_scar_tendency`
- `current_products`, `female_skin_context`, `skin_factors`

## 9. Immutable fields

**Every field of a SkinState is immutable for a given `(analysisRef, contractVersion)`.** This holds by construction: a frozen mapping over a create-only record.

Nothing in SkinState has an update path. Corrections happen by:
- a new contract version (mapping change),
- a new scanAnalyses record (re-processing), or
- the user-level erasure of the whole subtree.

## 10. Derived values that must never be stored as authoritative measurements

| Value | Why |
|---|---|
| `scores`, `region_scores` (any re-computation of them) | PROXY, image-relative, deprecated |
| Bands (Low / Moderate / Elevated) and their cut-offs | Display, from `SCORING_VERSION` |
| Summary lines, top concerns, "composite" | Display |
| ITA, tone band | DERIVED covariate of one photo, never an attribute of the person |
| `quality.lowPixelCount` | Threshold of 3-photo origin |
| `cheeks` when left and right exist | Union |
| Any whole-face aggregate | Region-weighted DERIVED |
| Any delta, trend, comparability verdict or evidence tier | LONGITUDINAL_METHOD |
| Proxy indicators (§5.6) | Display layer |
| Overlays | Visualisation, never stored |
| Recommendations, Gemini text | Downstream layers |

## 11. Synthetic examples

**All numbers below are invented** and are deliberately round. None comes from a real photo or from the repository fixture.

### 11.1 A gate-01 record today (corrected path only)

```json
{
  "contractVersion": "skinstate-1",
  "identity": { "analysisRef": "users/SYNTH_UID/scanAnalyses/SYNTHSCAN01_aaaaaaaaaaaaaaaa", "scanId": "SYNTHSCAN01" },
  "provenance": { "source": "server", "recordSchemaVersion": 1, "requestId": "synth-req-1", "persistAttempt": "primary",
                  "analyzedAt": "2026-10-10T10:00:00Z", "capturedAt": null, "processingConsentVersion": null },
  "engine": { "pipelineVersion": "scan-0.1.5-provisional", "build": null, "landmarkModel": "mediapipe-0.10.21-face_mesh",
              "opencvVersion": "4.11.0", "statsPath": "corrected",
              "scoreTypes": { "redness": "image_relative", "oiliness": "image_relative", "texture": "image_relative",
                              "pores": "image_relative", "blemishes": "image_relative", "hydration": "image_relative",
                              "pigment": "image_relative" } },
  "input": { "variant": "cv_downscale_1280", "analysedImageSha256": "aaaa…synthetic", "captureMethod": null, "originalRef": null },
  "regions": {
    "forehead": {
      "status": "available",
      "pixelCount": 30000,
      "colour": {
        "corrected": { "aStarMean": 2.0, "aStarP90": 6.0, "aStarSd": 3.0, "bStarMean": 10.0,
                       "lStarMeanPostClahe": 50.0, "lStarSdPostClahe": 15.0,
                       "aStarHist": { "edges": [-10, -8.5, "…21 edges…", 20], "counts": [0, 0, "…20 counts…"] },
                       "aStarHistClip": { "underflow": 0, "overflow": 0, "min": -5.0, "max": 12.0 } },
        "native": null
      },
      "texture": { "laplacianVarMean": 200.0, "lbpEntropy": 2.5, "gradientMean": 2000.0,
                   "localLContrastHist": { "edges": [0, 5, "…", 100], "counts": ["…20 counts…"] },
                   "localLContrastHistClip": { "underflow": 0, "overflow": 0, "min": 0.0, "max": 40.0 } },
      "specular": { "fraction": 0.10 }
    },
    "nose":   { "status": "available", "pixelCount": 8000,  "…": "same shape" },
    "chin":   { "status": "absent_region", "pixelCount": 0, "colour": null, "texture": null, "specular": null },
    "cheeks": { "status": "available", "pixelCount": 40000, "…": "same shape" }
  },
  "uncertainty": { "policy": "unknown", "calibrationId": null, "fields": { "*": { "status": "unknown" } } },
  "quality": { "lowPixelCount": { "forehead": false, "nose": false, "chin": true, "cheeks": false },
               "blur": null, "exposure": null, "pose": null, "faceScale": null, "occlusion": null, "device": null },
  "deprecatedSourceFields": ["scores", "region_scores", "blemish_pixel_frac", "blemish_blob_count", "lab_a_p70_value",
                             "color_var_p60_value", "smoothness_raw", "evenness_raw", "pore_count", "pore_density",
                             "pore_density_per_kpx", "lab_l_std", "lab_b_mean", "region_raw", "region_hist",
                             "region_hist_bin_edges"]
}
```

Comparable to anything? **No.** `engine.build` and `captureMethod` are null and `uncertainty` is unknown.

### 11.2 Future record: native stats, build id, calibration present (hypothetical)

Only the parts that differ from 11.1 are shown:

```json
{
  "engine": { "pipelineVersion": "scan-0.2.0", "build": "sha256:synthetic0000", "statsPath": "both", "…": "…" },
  "input":  { "variant": "cv_downscale_1280", "captureMethod": "native", "…": "…" },
  "regions": { "cheek_image_left":  { "status": "available", "pixelCount": 20000,
                                      "colour": { "native": { "lStarMean": 55.0, "bStarMean": 15.0, "aStarMean": 8.0, "…": "…" } } },
               "cheek_image_right": { "status": "available", "pixelCount": 20000, "…": "…" } },
  "uncertainty": { "policy": "calibrated", "calibrationId": "cal-2027-01-synthetic",
                   "fields": { "regions.*.colour.native.lStarMean": { "status": "calibrated", "sem": 1.0, "mdc95": 2.8,
                                                                       "unit": "CIE L*", "toneBandPolicy": "most_conservative" },
                               "*": { "status": "unknown" } } }
}
```

`cheeks` is absent here, because it is DERIVED when left and right exist. Only `lStarMean` is calibrated, so only it could ever enter a pairwise comparison.

### 11.3 Legacy schemaVersion-1 scan

`toSkinState(legacySkinCheck)` returns **no SkinState**. The reader receives `{ kind: "legacy_display", pipelineVersion, scores, region_scores, label: "client-reported legacy reading; not a SkinState" }` and may show it only as the past display.

## 12. Compatibility matrix

Columns:
- **CURRENT OUTPUT:** the CV `/scan` key, per region where applicable.
- **SkinState field:** its canonical path in `skinstate-1`.
- **Class / status:** the field class from §1, or DEPRECATED.
- **Populated in prod today?:** whether production records carry a value today.

Footnote markers in the "Populated in prod today?" column: † gate 01 is not deployed yet, so no production record exists; ‡ `stats=both` is never requested.

| CURRENT OUTPUT | SkinState field | Class / status | Populated in prod today? | Reason |
|---|---|---|---|---|
| `scores.redness` … `scores.pigment` (7) | — | PROXY, **DEPRECATED** | legacy client records only | Image-relative; cannot be recomputed from stored fields; not comparable |
| `region_scores.{r}.*` | — | PROXY, **DEPRECATED** | legacy only | Same |
| `score_types` | `engine.scoreTypes` | provenance | † | Documents why scores are deprecated |
| `regions` | keys of `regions` | provenance | † | Region set fixed per pipelineVersion |
| `region_low_confidence.{r}` | `quality.lowPixelCount.{r}` | DERIVED | † | Recomputable from `pixelCount` |
| `pipeline_version` | `engine.pipelineVersion` | provenance | † (legacy has it in `result`) | Required comparability key |
| `overlays.*` | — | never stored | never | Visualisation; size |
| `region_raw` / `region_hist` / `region_hist_bin_edges` (aliases) | — | **DEPRECATED** | † (gate 01 stores them; equal to `_corrected`) | Alias meaning can drift with the default path |
| `region_raw_corrected.{r}.region_px` | `regions.{r}.pixelCount` | MEASURED | † | Mask-dependent geometry |
| `….lab_a_mean` | `regions.{r}.colour.corrected.aStarMean` | MEASURED | † | Single producer bound (`redness.py`); collision hazard documented |
| `….lab_a_p90` | `….aStarP90` | MEASURED | † | |
| `….lab_a_std` | `….aStarSd` | MEASURED | † | |
| `….lab_b_mean_decoded` | `….bStarMean` | MEASURED | † | Decoded CIE b* |
| `….lab_b_mean` | — | **DEPRECATED** | † | 8-bit duplicate |
| `….lab_l_mean` | `….lStarMeanPostClahe` | MEASURED (restricted) | † | Post-CLAHE; never lightness, ITA or tone |
| `….lab_l_std_decoded` | `….lStarSdPostClahe` | MEASURED (restricted) | † | CLAHE-inflated |
| `….lab_l_std` | — | **DEPRECATED** | † | 8-bit duplicate |
| `….lab_a_p70_value` | — | **DEPRECATED** | † | Image-relative blemish threshold internal |
| `….color_var_p60_value` | — | **DEPRECATED** | † | Same |
| `….blemish_pixel_frac` | — | PROXY, **DEPRECATED** | † | ~30–40% positive by construction |
| `….blemish_blob_count` | — | PROXY, **DEPRECATED** | † | Same pipeline |
| `….specular_frac` | `regions.{r}.specular.fraction` | MEASURED | † | Fixed-threshold pixel fraction; lighting-dependent; not sebum |
| `….lap_var_mean` | `regions.{r}.texture.laplacianVarMean` | MEASURED | † | Scale, focus and JPEG dependent |
| `….lbp_entropy` | `regions.{r}.texture.lbpEntropy` | MEASURED | † | Test–retest candidate |
| `….grad_raw` | `regions.{r}.texture.gradientMean` | MEASURED | † | Renamed out of "hydration" |
| `….smoothness_raw` | — | **DEPRECATED** | † | Hydration internal; flat-pixel dominated |
| `….evenness_raw` | — | **DEPRECATED** | † | Hydration internal |
| `….pore_count` / `pore_density` / `pore_density_per_kpx` | — | **DEPRECATED** | † | Below pixel resolution; duplicate names |
| `region_hist_corrected.{r}.lab_a_hist` + `region_hist_bin_edges_corrected.lab_a_hist` | `regions.{r}.colour.corrected.aStarHist` | MEASURED | † | Fixed-edge re-scoring substrate |
| `….lab_a_hist_clip` | `….aStarHistClip` | MEASURED | † | Exposure and colour-cast covariate |
| `region_hist_corrected.{r}.color_var_hist` + edges | `regions.{r}.texture.localLContrastHist` | MEASURED | † | 8-bit L units, stated truthfully |
| `….color_var_hist_clip` | `….localLContrastHistClip` | MEASURED | † | |
| `region_raw_native.{r}.*` (same stat names) | `regions.{r}.colour.native.*` | MEASURED | **UNKNOWN** ‡ | The only colorimetry candidate |
| `region_hist_native` / `region_hist_bin_edges_native` | `regions.{r}.colour.native.*Hist` | MEASURED | **UNKNOWN** ‡ | |
| (not returned) image digest / build | `engine.build` | UNKNOWN | **null** | Needs C12, or derived from deploy history |
| (not sent) capture method | `input.captureMethod` | UNKNOWN | **null** | Route accepts it; client does not send it |
| (not collected) capture time, device, blur, exposure, pose, face scale, occlusion | `provenance.capturedAt`, `quality.*` | UNKNOWN | **null** | No producer |
| (not computed) per-field uncertainty | `uncertainty.fields.*` | UNKNOWN | **unknown** | Needs test–retest (EVALUATION_PLAN §1) |
| (record) `inputSha256` | `input.analysedImageSha256` | provenance | † | Hash of the analysed downscale |
| (record) `createdAt` | `provenance.analyzedAt` | provenance | † | Analysis time, not capture time |
| (questionnaire) `answers.skin_tone` etc. | `questionnaireRef` (link only) | SELF_REPORTED (outside SkinState) | legacy and new | Never copied; Fitzpatrick never used as a tone band |
| (MediaPipe landmarks) | region masks (implicit) | INFERRED | implicit | Never stored (biometric) |

**Summary of what is real today:**
- Once gate 01 is deployed, each new scan yields one SkinState with 15 MEASURED fields per region on the corrected path. All of them are photo statistics with unknown uncertainty, so nothing in it is comparable across scans.
- Of the 7 skin concepts the product shows, **none** is a measurement:
  - 4 have a defensible proxy route: redness, shine, texture, and evenness via native ITA.
  - 3 have none: hydration, pores, and breakouts.
