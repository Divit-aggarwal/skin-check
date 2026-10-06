# Lane brief: longitudinal (A20, D01, D02, D03)

Branch `lane/longitudinal`, worktree `../skin-check-longitudinal`, `PORT_BASE=3500`. Read [README.md](README.md) first: lane rules, ports, shared files, shared shapes.

## Tasks

| ID | Task | Starts as | Deliverable in this lane |
|---|---|---|---|
| A20 | New SkinState contract version | NOT STARTED | 1. Design brief and a contract document for owner approval. 2. After approval: a new version (for example `skinstate-2`) next to skinstate-1. It maps `engine_build` and names `captureMethod`, `persistAttempt` and `captureQuality` as client-asserted, with the bound from TD-05. |
| D01 | Baseline window | BLOCKED (C07) | A baseline window, never a single scan: the first 3 comparable scans, or the first 14 days (owner picks). |
| D02 | Change against noise | BLOCKED (C02, C07, D01) | The pairwise answer, latest comparable scan against the baseline window, as a `LongitudinalResult` (`lib/contracts/longitudinal-result.ts`). |
| D03 | Persistence and evidence levels | BLOCKED (D02) | Evidence levels "not enough evidence" and "pairwise" only. Persistence is research-dependent (LONGITUDINAL_METHOD §3.6): it shows as the reason `persistence_not_available`, never as a level. |

The BLOCKED rows can be built now because the result is honest without the research: with no noise table, the answer is always "not enough evidence".

## Rules

- **The noise table is empty today.** With an empty table, the engine must answer "not enough evidence" for every real pair. The shape enforces this: a `pairwise` result needs a known noise floor.
- **No percentage change as the main result.** No direction words either ("better", "worse", "improved"). The only change words are "within" or "beyond" photo-to-photo variation (LONGITUDINAL_METHOD §3).
- **Compare against a baseline window,** not just the previous scan.
- **Old records stay marked as legacy.** They are never upgraded (D-23).
- **An engine version change is a visible boundary.** Pipeline version or engine build changing inside the window gives the reason `engine_boundary`. No trend is drawn across it.
- **The old contract version keeps working.** The new version is added next to it: a new file. `lib/skin-state.ts`, `lib/skin-state-loader.ts` and their tests stay byte-identical.
- No "comparable-with-caveats" tier (owner Q-1, TD-06). The browser's capture-quality result never feeds comparability (Q-2).
- The noise floor comes from a calibration table, never a guessed constant. Use the most conservative value across tone bands (LONGITUDINAL_METHOD §3).
- Everything is computed on read (D-23). Nothing new is stored, and no UI is built in this lane.
- A pairwise result names at least one confounder (LONGITUDINAL_METHOD §5: lighting, device, distance, makeup, occlusion, cycle, season, stress or sleep, regression to the mean, settling). Its reasons are only `within_noise`, `beyond_noise`, `identical_scan` or `persistence_not_available`; every other reason means "not enough evidence".
- The baseline window has a status. "pairwise" needs `established`; one scan is never a baseline.
- A known noise floor names its calibration, its table version and the tone-band policy `most_conservative`. Test-only tables use `NoiseTableEntry`.
- `LongitudinalDetail` (numbers, dates, scan references) is internal. It is never shown or sent; the context lane makes its own number-free view.

## Files you own

- new `lib/skin-state-2.ts` (or the name your design picks, next to `lib/skin-state.ts`)
- new `lib/longitudinal/**`
- `lib/comparability.ts`: additive only. The skinstate-1 path and its reason names stay (pinned by `tests/contracts.test.ts`).
- new `docs/architecture/SKIN_STATE_CONTRACT_2.md`
- new tests: `tests/longitudinal-*.test.ts`, `tests/skin-state-2*.test.ts`, `tests/comparability-2*.test.ts`
- new seed: `scripts/seed-lane-longitudinal.ts` (series of scans per user on the emulator)

## Do not touch

- `lib/contracts/**` and `tests/contracts.test.ts` (requests to the main session).
- `lib/skin-state.ts`, `lib/skin-state-loader.ts`, `docs/architecture/SKIN_STATE_CONTRACT_FINAL.md` (skinstate-1 is frozen).
- The engine (D-18), the scan route, and everything under "No lane edits" in README.md.

## Tests you must add

Each case is a fixture series of SkinStates, run through the engine, with the expected `LongitudinalResult`:

1. **Identical scan:** the same input compared with itself; reason `identical_scan`.
2. **Tiny noisy difference:** within the noise floor of a test-only table; `within_noise`, `passedNoiseFloor: false`.
3. **Real detectable difference:** beyond the noise floor of a **test-only** noise table; `beyond_noise`. The production table stays empty.
4. **Scans that cannot be compared:** each `NotComparableReason` that can arise gives `not_comparable` with that reason.
5. **Engine version change** inside the window: `engine_boundary`, never a change across it.
6. **Missing region:** `not_comparable` with the comparability reason `region_absent`.
7. **Legacy record:** stays legacy; `legacy_record`; never upgraded.
8. **Bad raw data:** `bad_raw_data`; no partial answer.
9. **Too few scans for a baseline:** `too_few_scans_for_baseline`.
10. **Conflicting scans:** baseline scans disagree beyond noise; `conflicting_scans`, not enough evidence.

Also:
- With the production (empty) table, every one of these series answers `not_enough_evidence`.
- No output text contains a percentage, a digit or a direction word.
- skinstate-1 tests still pass unchanged, and both contract versions read the same stored record.

## Exit conditions

- Design brief and the contract document approved by the owner (recorded in `longitudinal-report.md`).
- `npm run test:local` green; typecheck, lint and `npm run build` green.
- Only owned files changed (`git diff --stat longitudinal-platform...`).
- `docs/lanes/longitudinal-report.md`: what was built, commits, test results, open questions, proposed decisions and tracker rows.
