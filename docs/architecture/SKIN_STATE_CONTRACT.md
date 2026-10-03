# SKIN_STATE_CONTRACT — what one stored measurement means

Status: PLANNING. This contract applies to records created after it is implemented. Legacy `skinChecks.result` (schemaVersion 1) records are covered in §6.

## 1. Purpose

A SkinState is the **immutable, server-written record of what the engine returned for one input image, under one engine version**. It is the only measured fact in the system. Everything else is derived from it:
- bands
- recommendations
- comparability
- the Gemini context

It is never edited. A different engine version, a different input variant, or a re-score all produce a **new** record.

## 2. Identity and immutability

- Path: `users/{uid}/skinStates/{scanId}_{pipelineVersion}`
- Created with the Admin SDK `.create()`, which fails if the document exists.
  - Client rules: owner `get, list`; `write: if false`.
- `uid` comes only from the verified Firebase ID token. `scanId` comes from the request and is validated with `isValidScanId`.
- Readers must use the `scanId` / `pipelineVersion` **fields**, never parse the document id. `scanId` may contain `_`.
- Idempotency is on `inputSha256` of the exact bytes forwarded to the CV service:
  - Same id and same hash: return the stored state (a retry).
  - Same id and different hash (a retake on an old bundle reuses scanId, D6): the server writes under a server-minted id and returns it. **Never 409.** Old bundles in the wild must keep working. The new client also rotates scanId on retake.
- Missing `scanId` (old bundles): the server mints one. The client's skinChecks doc then falls back to its legacy `result`.
- Write failure (Admin SDK error): retry once, then return the CV result anyway with `persisted:false` and log `requestId`. **A scan never fails because persistence failed.** The client's legacy `result` on skinChecks remains the fallback copy.

## 3. Fields

| Field | Type | Source | Meaning / rule |
|---|---|---|---|
| `schemaVersion` | int | constant | Version of this contract. Starts at 1 |
| `scanId`, `uid` | string | request or server-minted, token | `uid` stored for erasure audits only; the path already scopes it |
| `requestedScanId` | string? | request | The scanId the client sent, which may differ from `scanId` when the server minted one on a hash mismatch. **Join rule:** a skinChecks doc resolves to the SkinState with the latest `capturedAt` among states whose `scanId` or `requestedScanId` equals its scanId. Old bundles that send no scanId produce states that never join to a questionnaire; that is acceptable, and they are still listed by `capturedAt` |
| `capturedAt` | server timestamp | route | Time the analysis ran. Use this for ordering, not the questionnaire save time |
| `source` | `"server"` | constant | Provenance. Legacy client-written results are `"client-reported-legacy"` (§6) |
| `pipelineVersion` | string | engine `pipeline_version` | Engine identity. **The comparability key** |
| `engineBuild` | string | CV `/scan` response (new: image tag / git SHA from the task env) | **Part of the comparability key** with `pipelineVersion`, because `PIPELINE_VERSION` is hand-edited and deploys are manual `terraform apply`. A dependency or preprocess change can ship without a bump. Null only on legacy |
| `scoringVersion` | — | — | **Not here.** Bands are derived on read from a versioned threshold table |
| `inputVariant` | `"cv_downscale_1280"` \| `"canvas"` \| `"scored_replay"` \| `"original_reprocessed"` | route | Which bytes were scored. `scored_replay` re-runs the stored `scored.jpg` (exact replay). `original_reprocessed` is a **new measurement, not a replay** |
| `inputSha256` | string | route | Hash of the scored bytes |
| `captureMethod` | `"native"` \| `"canvas"` | client form field | As today |
| `capture` | map | client form field + route | `{ widthPx, heightPx, userAgentFamily, osFamily }`. Coarse values only; no full UA string. Needed because front-camera mirroring and colour pipelines differ by OS and capture path. Interocular px is LATER (it needs an engine change) |
| `scoreTypes` | map<metric,string> | engine `score_types` | All `"image_relative"` today. **A consumer must refuse cross-scan comparison of any metric whose type is `image_relative`** |
| `scores` | map<metric,number> | engine | Whole-face per-image-relative 0–1. Display input for single-scan bands only |
| `regionScores` | map<region,map<metric,number>> | engine | Same semantics, per region |
| `regionLowConfidence` | map<region,bool> | engine | Pixel-count flag (<2000 px). Advisory only |
| `regions` | string[] | engine | `forehead, cheeks, nose, chin` today |
| `raw` | map | engine `region_raw_corrected`, `region_hist`, `region_hist_corrected`, `region_hist_bin_edges[_corrected]` | **The rescoring substrate**, about 6 KB. Stored under explicit names: `raw.regionRawCorrected`, … |
| `rawNative` | map? | engine `?stats=both` native fields | Only if `stats=both` is enabled (DECISION D-07). The colour-measurement candidate |
| `extraJson` | string? | any unknown passthrough field | Stored as a JSON string, because Firestore rejects nested arrays. Never `overlays` |
| `requestId` | string | route-generated, forwarded to CV | Correlation id joining Vercel and CV logs |

Excluded on purpose:
- `overlays` (base64 PNGs, size)
- landmarks (never returned; biometric)
- the alias keys `region_raw` and `region_hist_*` when they duplicate `_corrected`. Store the explicit `_corrected` name, per the locked decision in PROJECT_CONTEXT.md.

Measured size: about 10 KB per record, against Firestore's 1 MiB limit (fixture, Agent 3). The write must use an allowlist, never the parsed object.

## 4. Semantics every consumer must honour

1. **Scores are single-photo readings.** `scores` and `regionScores` are normalised within the photo. Two records' scores **must not** be subtracted, compared, ranked or plotted on one axis. This holds within the same `pipelineVersion` too.
2. **Labels are part of the contract.** The display and the ContextPackage must label each metric as follows:

   | Metric | Label | Displayed? |
   |---|---|---|
   | redness | Photo-based estimate | Yes |
   | oiliness | "Shine", photo-based estimate | Yes |
   | texture | Photo-based estimate | Yes |
   | blemishes | Photo-based estimate | Yes |
   | pigment | Photo-based estimate | Yes |
   | hydration | — | Not displayed (DECISION D-05) |
   | pores | — | Not displayed (already excluded) |

3. **The comparable quantity is not `scores`.** Any future change claim must come from a named absolute quantity in `raw` or `rawNative`, for example native `lab_l_mean` per region for pigment. It also needs a metric × pipelineVersion entry in the comparability table (LONGITUDINAL_METHOD.md §2) and a noise floor from the test–retest study (EVALUATION_PLAN.md §1). None exists today.
4. **Uncertainty is "unknown" until measured.** No per-metric interval is emitted, and none may be invented by the frontend or by Gemini. After the study, uncertainty is SEM / MDC95 per metric × region × tone band, from a versioned calibration table referenced by `pipelineVersion`.
5. **Version boundaries are hard.** Engine changes that alter what a value means:
   - 0.1.2: opencv provenance
   - 0.1.4: region masks
   - 0.1.5: pores formula

   Every future bump starts a new comparability epoch per affected metric.

## 5. Re-processing

**Preferred path: exact replay.** Store the scored bytes (`users/{uid}/scans/{scanId}/scored.jpg`, the EXIF-free 1280 px JPEG actually sent to CV) next to the original, under the same retention consent. Re-running it under a new engine gives a true cross-version comparison of the same input. This avoids EXIF orientation, HEIC and downscale mismatch. Decision D-11.

**Fallback: re-processing the original.**
- Allowed only when:
  - an original exists in S3,
  - the retention consent is on record, and
  - the user has not withdrawn consent or erased their data.
- The job reads the original, applies EXIF transpose, applies the **same deterministic downscale the live client uses** (to be specified as a server function), calls `/scan`, and `.create()`s a new SkinState with `inputVariant: "original_reprocessed"`.
- It never overwrites. If a re-processed state and a live state disagree under the same `pipelineVersion`, that is a measurement finding, not a bug to hide.
- Blocked today. Nothing holds S3 GetObject, and the CV service does no EXIF transpose (D7).

## 6. Legacy records (schemaVersion 1 `skinChecks.result`)

- **The fallback applies only to `schemaVersion: 1` docs.** A `schemaVersion ≥ 2` skinChecks doc with no SkinState means "measurement not persisted". It shows no measured facts, and the ContextPackage gets none. Its client-sent `result` is ignored even though the write is accepted (D-03). Without this rule, a client could avoid the server write and have a self-authored `result` trusted.

- Read-only. Never backfilled or edited.
- Readers expose them as a SkinState view with `source: "client-reported-legacy"`, `rescorable: false`, no `raw`. They are excluded from any comparison.
- Most are pre-0.1.4 or pre-0.1.5 in any case.

## 7. What a SkinState is NOT

- Not a diagnosis, disease grade, or "condition". There is no Condition entity (research doc §4, WP29).
- Not a skin-tone classification of the user. ITA, if added, is a photometric covariate of one photo, not an attribute of the person.
- Not a QualityReport. Today the only quality signal is `regionLowConfidence`. A separate quality block (blur, exposure, pose, face size) is LATER and will be versioned on its own.
