# Longitudinal lane design (A20, D01, D02, D03)

Branch `lane/longitudinal`. Brief: [longitudinal.md](longitudinal.md). Shared shape: `lib/contracts/longitudinal-result.ts` (read only).

## 0. Owner decisions (2026-10-04)

Recorded as given:

1. **A20.** "A new SkinState contract version is approved, next to skinstate-1. skinstate-1 keeps working unchanged."
2. **D01.** "The baseline rule is the first 3 comparable scans, as a named setting marked provisional."
3. **D02.** "With the empty noise table, every real pair answers 'not enough evidence'. This is accepted."

The owner's instruction of 2026-10-04 is to write this design, have the verifier check it, fix what it finds, and then build every step that needs no new owner decision. That instruction is the design gate (lanes README rule 3) for this lane. The owner approved the contract version. The text of `docs/architecture/SKIN_STATE_CONTRACT_2.md` still needs the owner's sign-off. Under that instruction, the build does not wait for it.

This file is not in the lanes README ownership table. It is the design brief that rule 3 asks for, and it was named in the owner's instruction. capture-design.md is the precedent.

## 1. What will be built

| Task | What |
|---|---|
| A20 | `lib/skin-state-2.ts`: contract `skinstate-2`, a pure view over the same `scanAnalyses` record. It reuses the frozen skinstate-1 reader, maps `engine.build` from the record's `engine_build`, and declares the client-asserted fields. The contract text goes in `docs/architecture/SKIN_STATE_CONTRACT_2.md`. |
| A20 / C02 | `lib/comparability.ts`, additive only: `comparabilityKey` and `compareStates` also accept a skinstate-2 state. The skinstate-1 path, the reason names and the reason order stay unchanged. |
| D01 | `lib/longitudinal/settings.ts`: `BASELINE_RULE = "first_3_comparable_scans"`, marked provisional. `lib/longitudinal/baseline.ts` picks the baseline window. |
| D02 | `lib/longitudinal/engine.ts`: `longitudinalResult(series, quantity, region)` returns a `LongitudinalResult`. It compares the latest comparable scan with the baseline window, against the noise table. The production noise table is empty, and the production comparable-quantities table is empty. |
| D03 | Inside the engine. Only two evidence levels exist: `not_enough_evidence` and `pairwise`. Every pairwise answer carries the reason `persistence_not_available`. |
| Test data | `scripts/seed-lane-longitudinal.ts` seeds one series on the emulator under a new user, `seed-user-longitudinal`. `tests/longitudinal-series.e2e.test.ts` reads it back. |

Everything is computed on read. Nothing new is stored, and no UI or route is built.

## 2. Data shapes

### 2.1 skinstate-2 (`lib/skin-state-2.ts`)

```ts
export const SKIN_STATE_2_CONTRACT_VERSION = "skinstate-2";

/** The fields a browser can set. Fixed literal, not configuration. */
export const CLIENT_ASSERTED = Object.freeze({
  "input.captureMethod": "in the comparability key; a forged value can only merge the two capture paths (TD-05, O-1 A)",
  "provenance.persistAttempt": "provenance only; never in the comparability key",
  captureQuality: "stored on the record, not mapped; never feeds comparability (TD-06 Q-2)",
} as const);

export interface SkinState2 extends Omit<SkinState, "contractVersion" | "engine"> {
  contractVersion: "skinstate-2";
  engine: Omit<SkinState["engine"], "build"> & { build: string | null };
  clientAsserted: typeof CLIENT_ASSERTED;
}

export type SkinState2Result = { kind: "skinstate"; state: SkinState2 } | LegacyReading | { kind: "invalid"; reasons: string[] };

export function toSkinState2(record: unknown, analysisRef: string, expectedUid: string): SkinState2Result;
```

- It calls the frozen `toSkinState` with the same arguments. A legacy or invalid result passes through unchanged, so a legacy reading is never upgraded (D-23).
- `engine.build` is the record's `engine_build` when that is a non-empty string, and null otherwise. It is never guessed. Deriving it from the ECS deploy history (contract §7.1) is not built.
- Every other field maps exactly as in skinstate-1. That includes `provenance.processingConsentVersion: null`: the route checks the consent version but does not store it on `scanAnalyses`, so there is nothing to map (request to main).
- `captureQuality` is not copied into `quality`. The `quality` block stays as it is in skinstate-1 (Q-2).
- `lib/skin-state.ts`, `lib/skin-state-loader.ts` and their tests stay byte-identical.

### 2.2 Comparability (`lib/comparability.ts`, additive)

- `ComparabilityKey.contractVersion` becomes `"skinstate-1" | "skinstate-2"`.
- `comparabilityKey`, `compareStates` and the private `uidOf` take `SkinState | SkinState2`. Only the types change; the function bodies stay the same.
- Under skinstate-2 the build is real, so `engine_build_unknown` and `engine_build_differs` become meaningful.
- A skinstate-1 state compared with a skinstate-2 state gives `contract_version_differs`.
- `COMPARABLE_QUANTITIES` stays empty. Only tests pass a table.

### 2.3 Settings (`lib/longitudinal/settings.ts`)

```ts
/** D01, owner 2026-10-04: PROVISIONAL. LONGITUDINAL_METHOD §3.4 also names "first_14_days". */
export const BASELINE_RULE = { rule: "first_3_comparable_scans", scans: 3, status: "provisional" } as const;
/** Production noise table (LONGITUDINAL_METHOD §2). Empty until C05-C07. Only tests pass another table. */
export const NOISE_TABLE: readonly NoiseTableEntry[] = Object.freeze([]);
/** LONGITUDINAL_METHOD §5, in that order. Every pairwise answer names all of them. */
export const CONFOUNDERS = [...] as const;
```

### 2.4 Engine (`lib/longitudinal/engine.ts`)

```ts
export function longitudinalResult(
  series: readonly SkinState2Result[],   // one user's reads, any order
  quantity: QuantityPath,
  region: SkinStateRegionKey,
  tables?: { noise?: readonly NoiseTableEntry[]; comparable?: readonly ComparableQuantity[] }, // tests only
): LongitudinalResult;
```

The engine works in this order. Only step 1 stops early. Every other step adds each reason that applies, so a "not enough evidence" answer lists all of them. For example, A A A then B gives both `engine_boundary` and `not_comparable` (with `engine_build_differs`).

1. **Bad raw data.** If any entry is `invalid`, the answer is `bad_raw_data` and nothing else. Every detail number and reference is null, the arrays are empty, and nothing partial is given.
2. **Legacy.** Legacy readings are never used, and they never block a valid series. If the series contains any, the reason `legacy_record` is added only when the answer ends as "not enough evidence".
3. **Order.** Valid states are sorted by `analyzedAt`, then by `analysisRef`. The **latest** is the last one. With no valid state the answer is `too_few_scans_for_baseline` with an empty window.
4. **Baseline candidates (D01, "first 3 comparable scans").** These are the first 3 states before the latest, in time order, that have a known `engine.build` and are usable on their own for this quantity and region. A state is skipped when its check against itself names `region_absent`, `region_low_pixel_count`, `native_stats_missing` or `capture_method_unknown`. States with an unknown build (for example 0.1.5 records) are skipped too. They are unusable, but they are not a boundary: no two of them can ever be compared. A state is never skipped for its engine identity, and never for not matching the latest. A capture method that differs from the latest is not a skip reason, so it gives `not_comparable` (owner question, §7). Fewer than 3 candidates gives `too_few_scans_for_baseline`. The window is `{ status: "insufficient", scans: <comparable candidates> }`. One scan is never a baseline.
5. **Window and engine boundary.** The window runs from the first candidate to the latest, and includes every valid state in that time span. If it holds more than one `pipelineVersion`, or more than one known `engine.build`, the reason is `engine_boundary`. The baseline never moves past a boundary into a newer epoch: candidates are picked by time and known build, not by matching the latest. Re-baselining after an engine change is D05 (LATER).
6. **Comparability.** Each candidate is checked with `compareStates(candidate, latest, quantity, region)`, using the production default. A test-only comparable table can then lift `quantity_not_validated` (see the guard test, §4).
   - If any pair is not comparable, the reason is `not_comparable`. `comparability` carries the union of the reasons, in the fixed `NOT_COMPARABLE_REASONS` order.
   - If all 3 pairs are comparable, the window is `{ status: "established", scans: 3 }` and `comparability` is the comparable verdict with its key. Otherwise the window is `{ status: "insufficient", scans: <pairs that are comparable> }`. An established window can still give "not enough evidence", for example with a boundary or an unknown floor.
   - **Narrowing to the shared shape.** `compareStates` returns a plain reason array and a key with nullable parts. The engine copies the reasons as a non-empty tuple in the fixed order. It copies a comparable key field by field into `ComparableKey`, and checks at run time that no part is null (it throws if one is, which cannot happen). The `noiseThreshold` field is dropped.
   - **No pair to check (convention; request to main).** The shape needs a `comparability` value even when nothing was compared. In that case:
     - With a latest but no candidate, it is the latest checked against itself, which names what stops that state from pairing at all.
     - With no state, or `bad_raw_data`, it is an all-unknown key checked against itself. That gives `quantity_not_validated` and every `*_unknown` reason, plus `region_absent`. This is why `pipeline_version_unknown` and `input_variant_unknown` can appear, though only in this case.
     - A "not evaluated" comparability arm in the shared shape would be cleaner. That is a request to main.
7. **Noise floor.** Look up exactly one `NoiseTableEntry` for (quantity, region, latest `pipelineVersion`). The floor is the largest `mdc95ByToneBand` value (`most_conservative`), and it must be finite and greater than zero.
   - No entry, more than one entry, a bad value, or a histogram quantity (`*Hist`) gives `noise_table_empty` with `noiseFloor: unknown`.
   - Histograms have no scalar difference. The engine never subtracts arrays, and it ignores table rows for histogram paths. A dedicated reason code is a request to main.
8. **Values.** The baseline value is the median of the 3 baseline values. The difference is latest minus baseline. These go into `detail` (internal only).
9. **Identical scan.** If there are 3 candidates, and the latest and all 3 have the same `analysedImageSha256` and the same value, the reason `identical_scan` is added. Comparability does not matter for this step. It never skips the noise-floor check: with production tables the answer is "not enough evidence", with `identical_scan`, `noise_table_empty` and `not_comparable`.
10. **Conflicting baseline.** If the baseline values span more than the noise floor (max minus min > floor), the reason is `conflicting_scans`.
11. **Answer.**
    - A **pairwise** answer needs all of these: no invalid entry, an established window, no engine boundary, all pairs comparable, a known floor, a scalar quantity, and no conflicting scans. Then `change` is `beyond_noise` (with `passedNoiseFloor: true`) when |difference| > floor, and `within_noise` (with `passedNoiseFloor: false`) otherwise. The reasons are `[beyond_noise | within_noise | identical_scan, persistence_not_available]`, and the answer names every confounder.
    - Otherwise the answer is **not enough evidence**, with every reason that applied, in the `LongitudinalReasonCode` declaration order.

Reason texts are fixed, one plain sentence per code. They contain no digit, no percentage and no direction word. The only change words are "within" and "beyond" photo-to-photo variation.

With the production tables, step 6 always fails (`quantity_not_validated`) and step 7 always fails (`noise_table_empty`). Either one alone rules out a pairwise answer. The `LongitudinalResult` type also refuses a pairwise answer without a known floor.

## 3. Files

| Add | Purpose |
|---|---|
| `lib/skin-state-2.ts` | skinstate-2 view |
| `docs/architecture/SKIN_STATE_CONTRACT_2.md` | contract text (for owner sign-off) |
| `lib/longitudinal/settings.ts` | baseline rule, empty noise table, confounders |
| `lib/longitudinal/baseline.ts` | steps 3–5 |
| `lib/longitudinal/engine.ts` | steps 1–11, reason texts |
| `scripts/seed-lane-longitudinal.ts` | emulator series under `seed-user-longitudinal` |
| `tests/skin-state-2.test.ts` | contract tests |
| `tests/comparability-2.test.ts` | additive comparability tests |
| `tests/longitudinal-baseline.test.ts` | D01 |
| `tests/longitudinal-engine.test.ts` | D02/D03: the brief's 10 cases, wording, production tables |
| `tests/longitudinal-guard.test.ts` | source scan: only tests pass tables |
| `tests/longitudinal-series.e2e.test.ts` | the stack reads the seed through both contract versions |
| `docs/lanes/longitudinal-design.md`, `docs/lanes/longitudinal-report.md` | this file, the report |

| Change | How |
|---|---|
| `lib/comparability.ts` | Types widened (§2.2). No behaviour change for skinstate-1. |

Not changed: `lib/contracts/**`, `tests/contracts.test.ts`, `lib/skin-state.ts`, `lib/skin-state-loader.ts`, the tracker, `DECISION_LOG.md`, `package.json`, every route and every UI file. Before each commit: `git diff --stat longitudinal-platform...` lists only owned files.

## 4. Tests (each with its failure case)

The fixtures are synthetic records built with `tests/synthetic-scan.ts` (read only, imported) and `buildScanAnalysisRecord`. Test-only noise and comparable tables are defined inside the test files.

**skin-state-2**
- One record read by both versions: the output is skinstate-1 plus `contractVersion`, `engine.build` and `clientAsserted`, and nothing else differs. *Fails if* skinstate-2 drifts from the skinstate-1 mapping.
- `engine_build` is absent, empty or a non-string, and `engine.build` is null. *Fails if* a build is guessed.
- A legacy `skinChecks` record stays `legacy_display`, and an invalid record stays `invalid` with the same reasons as skinstate-1. *Fails if* a legacy record is upgraded.
- `captureQuality` is never in the output, and `quality` equals the skinstate-1 block.
- The skinstate-1 test files are not touched (checked by `git diff`, stated in the report).

**comparability-2**
- Two skinstate-2 states with the same build and a test table are `comparable`, and the key carries the build. *Fails if* the build is not in the key.
- Builds A and B give `engine_build_differs`. A null build gives `engine_build_unknown`.
- skinstate-1 against skinstate-2 gives `contract_version_differs`.
- Q-2 / TD-05: the same record with and without `captureQuality`, and with `persistAttempt` absent or `"recovery"`, gives an identical `comparabilityKey`. *Fails if* a client-asserted field other than captureMethod reaches the key.
- With production defaults, a skinstate-2 pair with equal builds is still `quantity_not_validated`.

**longitudinal-baseline (D01)**
- 0, 1, 2 or 3 states give `insufficient` windows. 4 states with a known build give 3 candidates.
- Leading unknown-build states are skipped, not counted.
- Builds A, A, A then B, B, B, B: the candidates are the 3 A scans and the window has a boundary. *Fails if* the baseline moves into epoch B.
- The rule constant is `first_3_comparable_scans` and marked provisional.

**longitudinal-engine (D02, D03)**: the brief's list, each a fixture series.
1. Identical scan: with test tables, `pairwise`, `within_noise`, reasons `identical_scan` and `persistence_not_available`. With production tables, `not_enough_evidence` with `identical_scan` and `noise_table_empty`.
2. Tiny difference within the test floor: `within_noise`, `passedNoiseFloor: false`.
3. Difference beyond the test floor: `beyond_noise`, `passedNoiseFloor: true`, and all confounders named.
4. Each reachable `NotComparableReason` gives `not_comparable` with that reason. The reachable set is `quantity_not_validated`, `engine_build_unknown`, `engine_build_differs`, `pipeline_version_differs`, `capture_method_unknown`, `capture_method_differs`, `native_stats_missing`, `region_absent`, `region_low_pixel_count`, `lr_cheek_cross_capture_method` and `different_user`. A test pins the unreachable set as exactly the complement, each with a reason:
   - `field_not_defined`: `QuantityPath` is the field list.
   - `input_variant_unknown` and `input_variant_differs`: the variant is a constant.
   - `pipeline_version_unknown`: a missing version makes the record invalid.
   - `contract_version_differs`: the engine reads skinstate-2 only.
5. Engine change: A A A then B gives `engine_boundary`, never a change. A A A, B, A also gives `engine_boundary`, even though the baseline and latest builds match.
6. Missing region in the latest: `not_comparable`, and comparability includes `region_absent`.
7. Legacy: a series of only legacy readings gives `legacy_record`, and so does legacy plus too few states. The legacy objects come back unchanged.
8. Bad raw data: one invalid entry anywhere gives `bad_raw_data`, every detail value is null, and there is no other reason.
9. Too few scans: 1 to 3 valid states give `too_few_scans_for_baseline`.
10. Conflicting scans: baseline values spread beyond the test floor give `conflicting_scans`, not enough evidence.
- Histogram quantity with test tables that include a row for it: `noise_table_empty`, never a difference.
- **Production tables:** each of the 10 series and the histogram case, run with no `tables` argument, gives `not_enough_evidence`.
- **Adversarial, production defaults only:** identical sha256 values, a huge difference, a forged `captureMethod`, `persistAttempt: "recovery"`, `captureQuality` saying pass, 3 matching-build baseline scans. Every case gives `not_enough_evidence`.
- **Wording:** every reason text from every result above, and the full reason-text map, contains no digit (checked with `\p{Nd}`), no `%`, and no word from the GEMINI_BOUNDARY §5 rule 4 change lexicon. A few more direction words are banned too (worse*, decreas*, down, up, gain, loss, rise, drop).
- **Determinism:** the same series in a shuffled order gives the same result.

**longitudinal-guard**
- No file under `lib/`, `app/`, `components/` or `scripts/` passes a table argument to `longitudinalResult`, `compareStates` or `compareKeys`. Only `tests/` may. The engine defines `longitudinalResult` with a fourth parameter, so its own file is not scanned. `tests/comparability.test.ts` (capture lane, unchanged) already bans tables at every `compareStates` and `compareKeys` call outside `tests/`, including in the engine. So the engine calls them with the production default, and applies a test-only comparable table only to lift `quantity_not_validated`, by the same rule as `lib/comparability.ts`. Request to main: allow the engine to forward the table instead. `NOISE_TABLE` and `COMPARABLE_QUANTITIES` are empty and frozen. *Fails if* production code ever supplies a table.

**longitudinal-series.e2e** (stack only)
- It uses `describe.skipIf(!WEB)`, like the other e2e tests, so `npm test` skips it.
- It reads the seeded series from the Firestore emulator. Every record maps under both skinstate-1 and skinstate-2. skinstate-2 carries the seeded build.
- For each region and each scalar quantity, `longitudinalResult` with production tables gives `not_enough_evidence`.

## 5. What this lane will NOT build

- Forecasting, trends, persistence (D03 shows it only as a reason), patterns, product attribution (D-12).
- Re-baselining after an engine change (D05, LATER), and the `first_14_days` rule (named in the type, not used).
- A production loader or any wiring into routes, the context builder or the UI. Wiring is a main-session step after merge. The e2e test reads the emulator itself. Under D-26, a SkinState may only come from a trusted, path-built server read. `lib/skin-state-loader.ts` is frozen, so wiring needs a new server-only skinstate-2 loader. That is a request to main.
- `engine.build` derived from ECS deploy history. `processingConsentVersion` mapping (not stored).
- Any change to the noise table or `COMPARABLE_QUANTITIES` (C05–C07).
- Any edit to `lib/contracts/` or `tests/contracts.test.ts`.

## 6. Steps

| # | Step | Commit |
|---|---|---|
| 1 | This design, verifier check, fixes (verifier FAIL on 70c8e31: findings fixed in the next commit) | docs |
| 2 | skinstate-2 code, contract doc, `tests/skin-state-2.test.ts` | feat |
| 3 | Comparability additive change, `tests/comparability-2.test.ts` | feat |
| 4 | Settings and baseline (D01), `tests/longitudinal-baseline.test.ts` | feat |
| 5 | Engine (D02, D03), `tests/longitudinal-engine.test.ts`, `tests/longitudinal-guard.test.ts` | feat |
| 6 | Seed and e2e test, then one `npm run test:local` | test |
| 7 | Verifier review, fixes, `docs/lanes/longitudinal-report.md` | docs |

Each code step ends with `npm test`, `npm run typecheck` and `npm run lint` green, then a commit. Nothing is pushed.

## 7. Questions for the owner (they do not block this lane)

- **D05 window wording.** After an engine change the baseline stays in the old epoch. That user gets "not enough evidence" until D05 decides how to re-baseline. The alternative, starting a new window in the new epoch, is D05's decision.
- **Contract text.** `SKIN_STATE_CONTRACT_2.md` needs sign-off.
- **D01 reading.** The design reads "first 3 comparable scans" as: the first 3 known-build scans that are usable on their own, each of which must then be comparable with the latest. One early scan with a different capture method therefore blocks that quantity until D05 or a new rule.
- **Retakes.** Each retake is its own record (D-21), so three retakes in one sitting can form the whole baseline. Grouping records by `scanId` would change that. Note that `scanId` is set by the browser.
- **D-24** is cited by the brief and the shared shape, but `DECISION_LOG.md` has no D-24 entry.
