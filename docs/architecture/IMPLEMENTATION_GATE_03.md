# IMPLEMENTATION_GATE_03: SkinState-1 computed view

| | |
|---|---|
| Branch | `longitudinal-platform` |
| Contract | `skinstate-1`, [SKIN_STATE_CONTRACT_FINAL.md](SKIN_STATE_CONTRACT_FINAL.md), committed in `b049685` together with Amendment A1 and DECISION_LOG D-23 |
| Implementation commit | the commit that adds this file (`feat(skin-state): computed skinstate-1 view over scanAnalyses`) |
| Depends on | Gate 01 (`6e9081d`, `428c63d`): the `users/{uid}/scanAnalyses` record |
| Deployed? | No. The new code has **no runtime caller**: it is a pure library plus tests. Nothing is stored, no rules or routes change, and no user-visible behaviour changes |

**Gate numbering.** The brief cites `IMPLEMENTATION_GATE_02.md`, but no such file exists on this branch or in the working tree. The likely candidate is the other session's uncommitted data-locality work (`DATA_LOCALITY_DECISION.md`, DECISION_LOG D-22), which has no gate report yet. This gate is numbered 03 as instructed. Nothing in it depends on gate 02.

**Out of scope, not implemented:** trends and comparison, recommendations, Gemini changes, any stored SkinState, any reader route.

---

## 1. Audit: the real gate-01 record against the frozen contract

**Method.** The record builder from gate 01 (`lib/scan-analysis-record.ts`) was run on the real CV output fixture. The record was written with `.create()` to the **local Firestore emulator** and read back; no production access. The result was then compared field by field with SKIN_STATE_CONTRACT_FINAL.md. The fixture's numeric values are not reproduced in this document.

| Contract area | In the persisted record today | Status |
|---|---|---|
| Identity (`scanId`) | `scanId` field | **available** |
| `analysisRef` | not in the record; it is the doc path | supplied by the caller |
| Provenance: `source`, `schemaVersion`, `requestId`, `createdAt` (Timestamp) | present | **available** |
| `persistAttempt` | present only on background-recovery records (gate 01 round 2) | **available. Missing from the frozen contract, so added as Amendment A1** (§3) |
| `capturedAt`, `processingConsentVersion` | not collected | **UNKNOWN (null)** |
| `pipeline_version` | present | **available** |
| `engine.build` (image digest) | not returned by the CV service (C12) | **UNKNOWN (null)**. Never inferred. Deriving it from ECS deploy history is allowed by the contract but not implemented |
| `landmarkModel`, `opencvVersion` | not in the record | per-pipelineVersion table. Only `scan-0.1.5-provisional` is verified (PRODUCTION_BASELINE); any other version gives null |
| `score_types` | present | provenance (`engine.scoreTypes`) |
| `captureMethod` | accepted by the route but **never sent by the client** | **UNKNOWN (null)** in every record today |
| `inputSha256` | present (hash of the analysed downscale) | `input.analysedImageSha256` |
| `region_raw_corrected` (4 regions × 22 stats) | present | 11 stats map to canonical fields; 11 are deprecated |
| `region_hist_corrected` + `region_hist_bin_edges_corrected` | present; 20 counts against 21 edges for both histograms | `aStarHist`, `localLContrastHist`, plus their clip stats |
| `region_raw_native`, `region_hist_native`, `region_hist_bin_edges_native` | **null** (`stats=both` is never requested) | `colour.native = null`, `statsPath: "corrected"` |
| `region_raw`, `region_hist`, `region_hist_bin_edges` | present, identical to `_corrected` | **deprecated aliases**, never read |
| `scores`, `region_scores` | present | **deprecated PROXY**, never exposed |
| `region_low_confidence` | present | ignored; recomputed as DERIVED `quality.lowPixelCount` from `pixelCount` |
| `overlays` | absent (never stored) | n/a |
| Regions | `forehead, nose, chin, cheeks` | all defined in skinstate-1 |
| Missing-region behaviour | the engine writes `region_px: 0` and `0.0` for **every** stat of an empty mask | mapped to `absent_region` with null values. A 0.0 is never exposed |
| Quality (blur, exposure, pose, face scale, occlusion, device) | not produced | **UNKNOWN (null)** |
| Uncertainty | no calibration exists | `policy: "unknown"` |

**Classes produced:**
- **MEASURED:** 15 fields per available region.
  - `pixelCount`
  - 8 corrected-colour fields
  - 5 texture fields
  - `specular.fraction`
- **DERIVED:** `lowPixelCount`.
- **Provenance:** every `identity`, `provenance`, `engine` and `input` field.
- **UNKNOWN (null):**
  - `capturedAt`, `processingConsentVersion`
  - `engine.build`
  - `captureMethod`
  - the native colour block
  - the quality fields
  - `uncertainty`
- **PROXY:** no field.
- **SELF_REPORTED, INFERRED:** none appear in the output. SELF_REPORTED context is referenced, not copied. INFERRED region geometry is implicit in the masks.

## 2. Implementation

**Module:** `lib/skin-state.ts`. It is pure: no I/O, no Firebase, no clock, no randomness.

```
toSkinState(record: unknown, analysisRef: string):
    { kind: "skinstate", state: SkinState }
  | { kind: "legacy_display", pipelineVersion, scores, region_scores, label }
  | { kind: "invalid", reasons: string[] }
```

**Classification order:**

| Input | Result |
|---|---|
| Not an object | `invalid` |
| `source !== "server"` and it has `result` or `scores` (a client `skinChecks` doc, or any legacy reading) | `legacy_display`. **Never upgraded**, even if the legacy payload carries raw fields |
| `source !== "server"` with neither | `invalid` |
| `schemaVersion !== 1` | `invalid` (an unknown record schema needs a new mapping) |
| Any `<field>_json` key (the gate-01 nested-array encoding) | `invalid`. It cannot be mapped field for field, so the function refuses rather than guesses |
| A region key not defined in skinstate-1 | `invalid` (a new region set needs a new contract version) |

**Strict reading.** Every required stat must be a finite number. Every histogram must be numeric arrays with `edges.length === counts.length + 1`. Every clip block must have all four numbers. `createdAt` must be a Timestamp, a Date or an ISO string. **Any violation makes the whole result `invalid` with listed reasons**; values are never patched or partially trusted.

**Regions:**
- **Order** follows the engine's `regions` list, which keeps output deterministic.
- **`pixelCount === 0`:** the region is reported as `absent_region` with all values null.
- **Cheek split:** if the engine emits both `cheek_image_left` and `cheek_image_right`, `cheeks` is omitted (it is DERIVED, §4 of the contract).

**Engine:**
- `build` is always null.
- `landmarkModel` and `opencvVersion` come from a one-entry verified table, and are null for any other version.
- `statsPath` is `"both"` only when native data is present.

**Fixed constants (never derived from the record):**
- `uncertainty` is always `{ policy: "unknown", calibrationId: null, fields: { "*": { status: "unknown" } } }`, even if the record contains something that looks like uncertainty.
- `quality.lowPixelCount` uses threshold id `lowpx-2000-v0`. The other quality fields are always null.

**`deprecatedSourceFields`:** lists which of the contract's deprecated source keys existed in the record, in contract order.

**Not built:**
- A reader route or Firestore loader (no consumer yet).
- A stored SkinState: the contract makes it a computed view (D-23).
- Any proxy indicator, band or score re-computation.

## 3. Amendment A1 (contract change, documented)

Gate 01 round 2 (`428c63d`) added `persistAttempt: "recovery"` to records created by the client's background re-request. It was added **after** the contract freeze. Dropping it would lose provenance: a recovery record is a second CV run, which may differ from what the user saw.

At the time of the change, zero SkinStates had ever been produced and no consumer existed. So it was added under the same version as **Amendment A1**, recorded in the contract header and in §8:
- `provenance.persistAttempt`: `"recovery"` when the record carries the marker; `"primary"` when it is absent, because the route writes the marker only on recovery requests.

Any further change requires a new `contractVersion`.

## 4. Tests

**New file:** `tests/skin-state.test.ts`, 23 tests. **All fixtures are synthetic** round values built in the test file.

| Fixture | Assertions |
|---|---|
| **Current production scan** (gate-01 shape today: corrected only, aliases present, native null, no captureMethod, no build) | Output `toEqual` a full literal of the contract shape (§3–§8): every section, every key, the exact `deprecatedSourceFields` list (16 entries) |
| **Complete scan** (same, plus captureMethod, a Firestore-Timestamp-like `createdAt`, and the recovery marker) | Provenance preserved: `persistAttempt: "recovery"`, ISO `analyzedAt`, `captureMethod`. Forged marker and unknown capture method are not trusted |
| Determinism and immutability | Two calls give byte-identical JSON; the input is not mutated |
| Proxies are never measurements | Score values never appear anywhere in the output. The measurement sections (regions, uncertainty, quality) contain no skin-concept or score keys |
| **Missing region** | `region_px: 0` gives `absent_region` with null values (not the engine's 0.0) and `lowPixelCount: true`. A low but non-zero count keeps its values and only flags quality |
| **Legacy scan** | A schemaVersion-1 `skinChecks` doc gives exactly the `legacy_display` object. A legacy payload carrying raw fields is still not upgraded |
| **Malformed raw data** (11 cases) | Missing stat, NaN, string-typed stat, edges/counts mismatch, missing raw block, region listed but missing from raw, region not defined in skinstate-1, `_json` field, missing `createdAt`, incomplete clip stats, unsupported schemaVersion. Each gives `invalid` with a reason naming the field. Non-object and non-server records are also `invalid` |
| **Unknown uncertainty** | Uncertainty stays unknown even when the record contains `uncertainty` or `region_low_confidence` data |
| **Future engine version** (`scan-0.2.0`, split cheeks, native stats) | `landmarkModel` / `opencvVersion` / `build` are null (not guessed); `statsPath: "both"`; `cheeks` is dropped and left/right are kept; the native block is mapped exactly |

**End-to-end check (emulator, lead):**
- Real CV fixture → gate-01 builder → `.create()` in the Firestore emulator → read back → `toSkinState`.
- Result: `kind: "skinstate"`, 4 available regions, the exact canonical field paths, native null, build and captureMethod null, 16 deprecated source fields, uncertainty unknown, and the output deterministic across two reads.

**Suite at the implementation commit:**

| Check | Result |
|---|---|
| `npx vitest run` | **118 passed**, 24 skipped (the emulator rules suite; unchanged in this gate, no rules touched) |
| `npx tsc --noEmit` | clean |
| `npx next lint` | clean |

## 5. Limitations and what this enables

- **Nothing calls `toSkinState` yet.** No user-visible change, and nothing can be compared: `engine.build` and `captureMethod` are null and uncertainty is unknown, so the comparability key (contract §7.1) is incomplete for every record.
- **Every record today, once gate 01 is deployed, maps to corrected-path photo statistics only.** The only colorimetry candidate, the native colour block, stays null until D-07 (`stats=both`) is approved.
- **The engine metadata table covers only `scan-0.1.5-provisional`.** Each future engine version needs a verified entry. Until then the fields are null, by design.
- **Legacy readings are returned for display only.** No migration exists or is planned (DATA_LOCALITY D-22 recreates the database anyway).
- **Known engine hazards stay hazards.** The `lab_a_mean` double producer and the eyebrow-contaminated forehead are documented in the contract §2, not fixed here (engine changes need approval, D-18).

## 6. Files changed

```
lib/skin-state.ts            (new)  skinstate-1 pure view: toSkinState()
tests/skin-state.test.ts     (new)  23 tests, synthetic fixtures
docs/architecture/IMPLEMENTATION_GATE_03.md (new)
```

The contract itself (SKIN_STATE_CONTRACT_FINAL.md with Amendment A1, plus the D-23 entry) was committed separately in `b049685`.
