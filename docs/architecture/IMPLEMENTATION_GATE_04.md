# IMPLEMENTATION_GATE_04: measurement inputs (native colour, engine build, capture method)

| | |
|---|---|
| Branch | skin-check `longitudinal-platform`; skin-scan `engine-build-identity` (off `prod-hardening`) |
| Driven by | MEASUREMENT_VALIDATION_STATUS "Prerequisites before any production change claim" item 1; PROTOCOL §2.1.3 and §8; DATA_SPEC §3 and §5; SKIN_STATE_CONTRACT_FINAL §7.1 (comparability key) |
| Implementation commits | skin-scan `8dc37dc` (`feat(scan): return exact engine_build; pipeline 0.1.6`). skin-check: the commit that adds this file |
| Depends on | Gate 01 (`scanAnalyses` record) and gate 03 (`toSkinState`, skinstate-1) |
| Deployed? | **No.** Nothing has been deployed or pushed |

**Gate numbering, reconciled from the repository:**
- On disk: `IMPLEMENTATION_GATE_01.md` and `_03.md`. No `_02.md` exists on any branch, in any worktree, or in `git log --all`.
- The `infra/india-region` worktree (`ff08107`, data locality, D-22) is the likely unfiled gate 02, as gate 03 already noted.
- This gate is **04**. Nothing is renumbered, and nothing here depends on gate 02.

**Out of scope, not implemented:** longitudinal comparison, noise thresholds, quality scoring, SkinState changes, recommendations, Gemini, dashboard, forecasting. No user-facing text, score or band changed.

---

## 1. Decisions taken by this gate

| # | Decision | Status before | Now |
|---|---|---|---|
| D-07 | Request `stats=both` and persist native stats | NEEDS-APPROVAL (latency) | **Approved by the gate-04 brief. Implemented, not deployed** |
| C12 (part) | CV returns an exact engine build identity | NEEDS-APPROVAL (engine response contract) | **Approved by the brief for `engine_build` only. Implemented in skin-scan, not deployed.** The `request_id` half of C12 is not done |
| new | `engine_build` = the immutable ECR tag `sha-<git commit>`, baked into the image at build time | open question in C12 ("digest or SHA?") | Decided; see §3 |
| new | skin-scan `PIPELINE_VERSION` 0.1.5 → **0.1.6** | — | Required by `version.py`'s own rule for any payload-shape change. No measurement changed |
| new | skinstate-1 does **not** surface the stored build | — | The frozen contract has no source key for `engine.build`. Mapping it needs `skinstate-2` or an owner-approved amendment (§6) |

The D-07 status line in DECISION_LOG.md is updated in this commit. That file also holds another session's uncommitted D-22/D-24 edits, which are not part of this commit.

## 2. Uncorrected colour path (`stats=both`)

**Change:** `app/api/skin-scan/route.ts` always calls `/scan?stats=both`, plus `&overlays=…` when the client asks for overlays. The query is built with `URLSearchParams`. The background recovery re-request goes through the same route, so it gets native stats too.

**Backward compatibility (proven, not assumed):**
- skin-scan pytest `test_stats_both_adds_native_without_changing_corrected_output` runs the real engine on its fixture under both modes. These keys are **identical**: `scores`, `region_scores`, `region_low_confidence`, `regions`, `score_types`, `region_raw`, `region_hist`, `region_hist_bin_edges`, and every `*_corrected` key. `region_raw` still aliases `region_raw_corrected`.
- The client's `skinChecks` write (`persistableResult`) is an allowlist (scores, regions, region_scores, score_types, region_low_confidence, pipeline_version). Native data and `engine_build` never reach it, and `firestore.rules` is untouched.
- The UI reads only scores, region scores, overlays and low-confidence flags. No interpretation changed.

**Persistence:** `region_raw_native`, `region_hist_native` and `region_hist_bin_edges_native` were already in the gate-01 allowlist. They are now populated instead of absent.

**Cost:**
- D-07 records +43% p95 for `stats=both` (CALIBRATION.md).
- skin-scan `deps.py` measured `stats=both` with all 7 overlays at 2.87 s against 1.55 s for the default request shape, at concurrency 1 on QEMU amd64 (about 1.85×). The 25 s service timeout was sized with that multiplier included.
- Production requests do carry all 7 overlays, so the 1.85× figure is the relevant one. Not re-measured on real Fargate in this gate.
- Record size on the real fixture without overlays: 11.1 KB (corrected) → 16.0 KB (both). The guard is 900 KB.

## 3. Exact engine build identity (`engine_build`)

**What it is:** the immutable ECR image tag `sha-<full git commit>`.

**How it gets into the response (skin-scan):**
- CI: `docker build --build-arg ENGINE_BUILD=sha-${GITHUB_SHA}`.
- Dockerfile: `ARG ENGINE_BUILD=""` / `ENV ENGINE_BUILD`.
- `Settings.engine_build`, read at startup and returned as `engine_build` on every `/scan` 200.
- `ScanResponse` declares the field. Without that, `response_model` would strip it.
- The CI container smoke test now asserts `engine_build == image_tag`.

**Why it identifies code, model and configuration:**

| Component | Pinned by |
|---|---|
| Code | the git commit |
| Base OS and Python | `Dockerfile` `FROM python:3.11-slim@sha256:…` (digest-pinned) |
| Direct dependencies, including the landmark model | `requirements.txt` exact pins. The face-mesh model ships inside the `mediapipe==0.10.21` wheel |
| Runtime configuration | No `Settings` field affects measurement (timeouts, concurrency, CORS, auth, logging only) |
| Built image | CI builds **once** per commit and pushes to an **IMMUTABLE** ECR repo (`ecr.tf`), so a live tag names exactly one image digest |

**Why not the image digest:** the digest cannot be known inside the image at build time. Injecting it via the task definition at deploy time would make `deploy.yml` and `ecs.tf` drift. CI already logs tag → digest at push.

**Never fabricated:**
- A build made without the build arg (local `docker build`, `uvicorn` dev) returns **no** `engine_build`. An empty string is coerced to absent, in both the service and the frontend record builder.
- The frontend persists it only when it is a non-empty string. It is never derived from the request id, the pipeline version or deploy history.

**Ceiling (known, documented):**
1. Transitive dependencies are not locked at build time (`uv.lock` is not enforced). A **rebuild** of the same commit could resolve different transitive versions. That is safe only while CI never rebuilds a tag that exists.
2. The ECR lifecycle policy expires `sha-` tags beyond the newest 20. After expiry, re-running CI for that commit could push a *different* image under the *same* tag. To close this, persist the tag → digest map at deploy time (CI already prints it). Not done here.
3. The **currently deployed** image (`sha-7f3695e`, 0.1.5) does not return `engine_build`. Every record stays build-null until the skin-scan change is deployed (deploy path: §8).

**PIPELINE_VERSION 0.1.6:**
- The changelog entry in `version.py` says it is additive and measurement-identical to 0.1.5.
- Consequence: skinstate-1's verified engine table has an entry for 0.1.5 only. For 0.1.6 records `landmarkModel` and `opencvVersion` come out **null** (unknown, not wrong).
- Adding a verified 0.1.6 entry is a SkinState change and is left to the owner.

## 4. Capture method (`captureMethod`)

**Traced implementation:** `components/skin-check/inputs/PhotoCapture.tsx`.

| Value | Branch that produced the CV bytes | CV input |
|---|---|---|
| `native` | `isMobileCaptureDevice()` true → `<input type="file" accept="image/*" capture="user">` → `downscaleToJpeg(file, 1280, 0.92)` with `imageOrientation: "from-image"` | ≤1280 px JPEG q0.92 re-encode of the picked file |
| `canvas` | `isMobileCaptureDevice()` false → `getUserMedia` → `canvas.toBlob(…, 0.92)` | the full video frame, no downscale |

**Change:** the value already existed in client state, was draft-persisted, and was accepted and allowlisted by the route, but `lib/api.ts` never sent it.
- `runSkinScan` now **requires** `captureMethod`, and `requestSkinScan` appends it.
- It is sent on the primary request, on the dashboard retry, and on the background recovery re-request (same capture, second CV run).
- `getSkinScanResult` (no production caller) sends none, so its record stays null.

**Exact limitation, so the value is not over-read.** `captureMethod` records **which code branch produced the bytes**. That is all it records.
- **`native` does not prove a live camera shot.** `capture="user"` is a hint. Some Android browsers offer the gallery or file chooser, so `native` can be a pre-existing photo of any age or source.
- **The branch is chosen by user-agent sniffing.** `navigator.userAgentData.mobile`, else a regex for Android, iPhone, iPad or iPod. The consequences:
  - iPadOS Safari reports a Mac user agent and has no `userAgentData`, so it takes `canvas`.
  - Android tablets report `mobile: false`, so they take `canvas`.
  - Desktop browsers spoofing a mobile user agent take `native`.
- **The value is client-asserted.** The route accepts only `native` or `canvas`; anything else is stored as absent. It is not verified server-side.
- **Records written before this gate** have no `captureMethod`, so they stay null and not comparable.

**Related contract finding (not fixed here):** skinstate-1 sets `input.variant` to the constant `"cv_downscale_1280"`, but `canvas` sends the full frame. `input.captureMethod` sits next to `input.variant` in the comparability key, so the two paths never compare with each other. The `variant` label is still inaccurate for `canvas` records. Fixing it is a contract change.

## 5. Persistence

All three values are written by the server in the immutable `users/{uid}/scanAnalyses/{scanId}_{sha16}` record (`.create()`, never update):

| Record key | Source | When absent |
|---|---|---|
| `engine_build` | CV response `engine_build`, if it is a non-empty string | the CV image has no build id (today's production image), or a pre-gate-04 record |
| `captureMethod` | form field, allowlisted `native` or `canvas` | old client bundle, `getSkinScanResult`, or a pre-gate-04 record |
| `region_raw_native`, `region_hist_native`, `region_hist_bin_edges_native` | CV response under `stats=both` | a pre-gate-04 record |

`SCAN_ANALYSIS_SCHEMA_VERSION` stays **1**. Every change is an optional additive key, so old and new records share one reader.

## 6. SkinState-1 handling (no SkinState code changed)

| New record content | skinstate-1 output | Why |
|---|---|---|
| `captureMethod: native` / `canvas` | `input.captureMethod` set | already mapped by the frozen contract (§8) |
| native blocks present | `engine.statsPath: "both"`, `regions.*.colour.native` populated | already mapped (§5.3) |
| `engine_build` | **`engine.build` stays null** | The frozen mapping (§7.1, §10) has no source key for it. Surfacing it is a mapping change, so it needs `skinstate-2` or an owner-approved amendment. The value is preserved on the raw record, which is the only stored truth, so nothing is lost |
| `pipeline_version: scan-0.1.6-provisional` | `landmarkModel`, `opencvVersion` null | one-entry verified table (gate 03) |

**Comparability:** until `engine.build` is surfaced and calibration exists, no two SkinStates are comparable. This gate removes the *data* gap for `captureMethod` and native stats, and leaves the `engine.build` *mapping* gap explicit.

## 7. Tests

**skin-check (vitest):**

| Test | File | Proves |
|---|---|---|
| always requests `stats=both` upstream, with or without overlays | `skin-scan-route-persist.test.ts` | native statistics are requested |
| request → response → persisted record → `toSkinState` | same | engine build, capture method and the three native blocks survive the route into the `.create()` payload. The corrected output is passed through untouched. skinstate-1 reads method and native, with `statsPath: "both"`, and keeps `build` null |
| `engine_build` kept when a non-empty string; absent for undefined, null, `""` or a number | `scan-analysis-record.test.ts` | never a fake build id |
| primary **and** recovery request bodies carry `captureMethod` | `api-persist-retry.test.ts` | capture method survives the client path, including recovery |
| old records stay readable (native null **or** keys absent; no build; no method) | `skin-state.test.ts` | backward compatibility |
| a stored `engine_build` leaves the SkinState output byte-identical | same | skinstate-1 is not silently changed |

The synthetic fixture builders moved from `skin-state.test.ts` to `tests/synthetic-scan.ts` so the route test can use them. Values are unchanged, and the 23 existing skin-state tests still pass.

**skin-scan (pytest, `tests/test_api.py`):**
- `engine_build` is returned verbatim when baked in, under both stats modes.
- It is absent when unset **or** `""`.
- Under `stats=both`, native is added and the corrected output is unchanged.

**Real-output checks (local, not committed; no production access):**
1. **Real engine output.** The real engine (`/scan` via TestClient on `fixtures/input_face.png`), in `stats=corrected` and `stats=both`, went through the frontend zod schema → record builder → `toSkinState`. Both gave `kind: "skinstate"` with no `_json` keys. `both` gave `statsPath: "both"` and all 10 native fields per region. An unknown top-level `engine_build` was not rejected.
2. **Firestore emulator round trip.** The real `stats=both` output plus `engine_build` went through the builder → `.create()` in the Firestore emulator → read back → `toSkinState`. `engine_build` and `captureMethod` were stored; native data was present on all 4 regions; there were no `_json` keys; and the output was deterministic across two reads.
3. **Docker build.** `docker build --build-arg ENGINE_BUILD=sha-localverify` (linux/amd64), then a container `/scan?stats=both`, returned `engine_build: "sha-localverify"`, `pipeline_version: "scan-0.1.6-provisional"` and native stats.

**Suites at the implementation commits:**

| Check | Result |
|---|---|
| skin-check `npx vitest run` | **123 passed**, 24 skipped (the emulator rules suite; no rules touched). Was 118 |
| skin-check `npx tsc --noEmit`, `npx next lint` | clean |
| skin-scan `pytest -q` | **81 passed** (was 78) |
| skin-scan `ruff check src/ tests/`, `pyright src/` | clean |

## 8. Deploy order and what this enables

- **The order is independent.** The frontend works against the deployed 0.1.5 image: `stats=both` is already supported there (since `3c56b7f`), and `engine_build` is simply absent, so it is stored as absent.
- **The skin-scan deploy path is the owner's call. It is not a one-commit merge.**
  - `engine-build-identity` branches from `prod-hardening@56a48be`.
  - `deploy.yml` runs only on pushes to `main`. Local `main` is at `b10e682`, and `engine-build-identity` is 24 commits ahead of it (25 ahead of `origin/main`).
  - Those commits include the deployed `7f3695e` and the **undeployed** `56a48be` ("reconcile phase 2 aws infrastructure"). So a merge to `main` would ship the whole hardening line, not just `8dc37dc`.
  - The live `sha-7f3695e` was therefore not deployed through the `main` route.
  - **Nothing was pushed or deployed.**
- **Once both are deployed,** new records carry the full comparability inputs on the raw record: pipeline version, exact build, colour path, capture method. They also carry native L\*/a\*/b\*, the only colorimetry candidates in PROTOCOL §2.2.
- **This does not enable:** any change claim, a noise threshold, a quality signal or comparison. Uncertainty stays `unknown`, and every SkinState remains non-comparable until `engine.build` is mapped by a new contract version **and** calibration exists (D-24).

## 9. Files changed

```
skin-check
  app/api/skin-scan/route.ts            stats=both on every upstream call
  lib/scan-analysis-record.ts           persist engine_build (non-empty string only)
  lib/api.ts                            send captureMethod (primary, retry, recovery)
  components/skin-check/inputs/PhotoCapture.tsx   pass captureMethod to runSkinScan
  components/skin-check/SkinCheckDashboard.tsx    pass captureMethod on retry
  tests/synthetic-scan.ts               (new) shared synthetic fixture
  tests/skin-state.test.ts, skin-scan-route-persist.test.ts,
  tests/scan-analysis-record.test.ts, api-persist-retry.test.ts,
  tests/api-scan-id.test.ts, api-upload-client.test.ts
  docs/architecture/IMPLEMENTATION_GATE_04.md (new)
  docs/architecture/DECISION_LOG.md     D-07 status line only

skin-scan
  src/app/deps.py, schemas.py, main.py  engine_build setting and response field
  Dockerfile, .github/workflows/deploy.yml   ENGINE_BUILD build arg; smoke assert
  src/pipeline/version.py               0.1.6 + changelog
  tests/test_api.py                     3 tests
```
