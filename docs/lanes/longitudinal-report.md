# Longitudinal lane report (A20, D01, D02, D03)

Branch `lane/longitudinal`, 2026-10-04. Design: [longitudinal-design.md](longitudinal-design.md). Contract text: `docs/architecture/SKIN_STATE_CONTRACT_2.md`. Not pushed. The tracker is not edited.

## Owner decisions this lane worked under (2026-10-04)

1. A new SkinState contract version is approved, next to skinstate-1, and skinstate-1 keeps working unchanged.
2. The baseline rule is the first 3 comparable scans, as a named setting marked provisional.
3. With the empty noise table, every real pair answers "not enough evidence". This is accepted.

The owner's instruction was to design, have the verifier check the design, and then build every step that needs no new owner decision. That instruction served as the design gate (lanes README rule 3).

## 1. Steps done and skipped

| # | Step | Status |
|---|---|---|
| 1 | Design, verifier check, fixes | Done |
| 2 | skinstate-2 (`lib/skin-state-2.ts`), contract document, tests | Done |
| 3 | `lib/comparability.ts` accepts skinstate-2 (additive, types only) | Done |
| 4 | D01 baseline window (`lib/longitudinal/settings.ts`, `baseline.ts`) | Done |
| 5 | D02/D03 engine (`lib/longitudinal/engine.ts`) and guard test | Done |
| 6 | Emulator seed and e2e test | Done |
| 7 | Verifier review, fixes, this report | Done |

**No step was skipped.** No step needed a new owner decision. Where the owner's words left room, I took the stricter choice, which can only give "not enough evidence" more often. Those choices are listed in section 4 as questions.

What was built:

- **skinstate-2** reads the same stored record through the frozen skinstate-1 reader. It changes only three things:
  - `contractVersion`
  - `engine.build`, taken from the record's `engine_build`, or null
  - a fixed `clientAsserted` list:
    - `captureMethod`: in the key, and a forged value can only merge the two capture paths
    - `persistAttempt`: provenance only
    - `captureQuality`: never mapped
- **Legacy and invalid records** pass through unchanged, so a legacy record is never upgraded.
- **The engine** compares the latest scan with a 3-scan baseline window, for one quantity in one region:
  - Its answer is "not enough evidence" or "pairwise", the only two levels.
  - Persistence is only ever a reason (`persistence_not_available`).
  - Every pairwise answer names all ten confounders.
  - Reason texts contain no digits, no percentages and no word from the GEMINI_BOUNDARY change lexicon.
- **Two gates stop a change answer in production.** Each is enough on its own:
  - The empty `COMPARABLE_QUANTITIES` makes every pair `quantity_not_validated`.
  - The empty, frozen `NOISE_TABLE` makes every floor unknown (`noise_table_empty`).
  - On top of both, the shared `LongitudinalResult` type refuses a pairwise answer without a known floor.
- **The baseline never crosses an engine change.** Candidates are picked by time and known build, never by matching the latest. So builds A A A then B give `engine_boundary` until D05.
- **Nothing new is stored.** No route, UI or loader was added.

## 2. Test results

| Check | Result |
|---|---|
| `npm test` (unit) at 330991f | 59 files passed, 8 skipped; **699 passed**, 42 skipped |
| `npm run typecheck` | exit 0 |
| `npm run lint` | no warnings or errors |
| `npm run test:local` at 8095b72 | exit 0. Unit 689 passed / 42 skipped. Stack 8 files, 42/42, including `tests/longitudinal-series.e2e.test.ts` (seed read back through both contract versions; "not enough evidence" for every quantity in every region) |
| `npm run test:local` at 330991f (final) | exit 0. Unit 699 passed / 42 skipped. Stack 8 files, 42/42, including the longitudinal e2e test |
| `npm run build` | exit 0 (at 330991f) |
| Frozen files | `lib/skin-state.ts`, `lib/skin-state-loader.ts`, their tests, `lib/contracts/**` and `tests/contracts.test.ts`: no diff against `longitudinal-platform` |
| Existing tests | None edited. `tests/contracts.test.ts` and `tests/comparability.test.ts` are green unchanged |

New tests:
- `tests/skin-state-2.test.ts` (11)
- `tests/comparability-2.test.ts` (7)
- `tests/longitudinal-baseline.test.ts` (7)
- `tests/longitudinal-engine.test.ts` (54)
- `tests/longitudinal-guard.test.ts` (5)
- `tests/longitudinal-series.e2e.test.ts` (1, stack only)

The engine tests cover:
- the brief's ten cases, with test-only tables
- each reachable not-comparable reason, with the unreachable ones pinned as the complement
- every case again with the production tables, all "not enough evidence"
- an adversarial set: identical hashes, huge differences, forged client fields, 40-scan series, and a polluted `Object.prototype`
- wording and determinism

## 3. What the verifier found and what I fixed

**Design check (FAIL on 70c8e31, fixed in f858250):**
1. Early-stop answers had no valid `comparability` value. Fixed:
   - The engine narrows the comparability result to the shared shape.
   - With no pair to check, it uses a written convention: the latest checked against itself, or an all-unknown key.
   - A "not evaluated" arm in the shared shape is requested in section 5.
2. There was no owner-approval step. Fixed: the design records the owner's instruction as the gate. The contract text still needs sign-off (section 4).
3. The baseline rule read "first 3 comparable scans" too strictly. Fixed: a scan that is unusable on its own (missing region, too few pixels, no native stats, unknown capture method) is now skipped. A scan is still never skipped for its engine identity. The remaining reading is an owner question.
4. The minor findings were all fixed in the design text: reason lists are fully determined, the window status is defined, the e2e test uses `skipIf`, the trusted-loader request was added, and the ownership exception and the retake question were noted.

**Building against the existing guard.** `tests/comparability.test.ts` (capture lane) bans passing a table to `compareStates` or `compareKeys` outside `tests/`. So the engine calls them with the production default. It applies a test-only comparable table only to lift `quantity_not_validated`, by the same rule as `lib/comparability.ts`. Allowing the engine to forward the table directly is a request in section 5.

**Code review (fresh verifier): PASS. Main attack: no way found.**

The verifier tried to make the engine state a change for a real pair with the empty noise table. It found no way. Its findings:
- Theoretical only: a polluted `Object.prototype` could have supplied tables. Fixed: tables are read as own properties only, with a test.
- The skip rule was not tested through the engine. Fixed: four skip cases, plus a capture-method case that is not skipped.
- An unreadable-scalar branch did not match design step 1. Fixed: it now uses the step-1 shape, with a test.
- The same record passed twice could fill the baseline. Fixed: a duplicate `analysisRef` gives `bad_raw_data`, with a test.
- The regex guard could be bypassed. Fixed: a new test says no file outside `lib/longitudinal/` imports the engine yet, and the noise-row scan now allows whitespace.
- The confounder test and the reason order were not pinned to literals. Fixed.
- A baseline test name claimed more than it checked. Fixed: assertion added.
- The design text disagreed with the test on `*_unknown` reachability, and histograms never get `identical_scan`. Fixed in the design.
- A stale comment in `lib/comparability.ts`. Fixed.
- The e2e test had not run when the review started. Resolved: `npm run test:local` passed.

## 4. New owner decisions (none block this lane)

1. **Contract text sign-off.** `docs/architecture/SKIN_STATE_CONTRACT_2.md` is a draft. The version is approved, the wording is not. *Recommendation:* approve it as written.

2. **What happens after an engine change (D05).** The baseline stays in the old epoch, so after the 0.1.6 deploy, or any later build change, a user gets "not enough evidence" with `engine_boundary` for good.
   - Options:
     - (a) Keep this until D05 is designed.
     - (b) Start a new 3-scan window in each new epoch.
     - (c) Re-process stored originals under the new engine (LONGITUDINAL_METHOD §6a).
   - *Recommendation:* (a) now, because nothing can be compared before C07 anyway. Decide (b) or (c) together with D05.

3. **How "first 3 comparable scans" is read.** Today a scan is skipped only for its own faults. A baseline scan whose capture method differs from the latest blocks the comparison instead of being skipped.
   - Options:
     - (a) Keep it.
     - (b) Also skip scans whose capture method differs from the latest.
   - *Recommendation:* (b) once a quantity is validated. Capture method is not an epoch, so skipping cannot cross an engine change. It does lean on a client-asserted field, and the TD-05 bound covers that.

4. **Retakes in the baseline.** Each retake is its own record (D-21). Three retakes in one sitting can therefore form the whole baseline, which undoes the point of a baseline (people start at their worst).
   - Options:
     - (a) Keep it.
     - (b) Count at most one record per `scanId`.
     - (c) Count at most one per calendar day.
   - *Recommendation:* (c). `scanId` is set by the browser, while `analyzedAt` comes from the server.

5. **Baseline rule** stays `first_3_comparable_scans`, marked provisional. The `first_14_days` rule is in the shared type and unused.

## 5. Requests to other lanes or to main

1. **Shared shape (`lib/contracts/longitudinal-result.ts`):**
   - Add a "not evaluated" comparability arm, for answers where no pair exists (no state, or `bad_raw_data`). The lane uses a convention until then.
   - Add a reason code for histogram quantities. Today they answer `noise_table_empty`, which is true but incomplete.
2. **`tests/comparability.test.ts`:** allow `lib/longitudinal/engine.ts` to forward its test-only `tables.comparable` to `compareStates`. The `reasonsOf` workaround in the engine can then be deleted. `tests/longitudinal-guard.test.ts` already stops production callers from passing tables to the engine.
3. **Trusted skinstate-2 loader (wiring, main session):** D-26 requires a SkinState to come from a path-built server read. `lib/skin-state-loader.ts` is frozen, so wiring needs a new server-only loader, for example one series read of `users/{uid}/scanAnalyses` mapped with `toSkinState2`.
4. **`processingConsentVersion`:** the scan route checks it but does not store it on `scanAnalyses`, so skinstate-2 keeps it null. Storing it needs a route change, and then a contract version.
5. **D-24** is cited by the brief and the shared shape, but `DECISION_LOG.md` has no D-24 entry.
6. **Ownership table:** add `docs/lanes/<lane>-design.md` for lane designs (capture-design.md is the precedent).
7. **Context lane:** `REASON_TEXT` is internal. The context package needs its own number-free sentences. The engine's pairwise answer always carries `persistence_not_available`, and every confounder in a fixed order.

## 6. Proposed tracker rows (for main to apply at merge)

| ID | Proposed status | Note |
|---|---|---|
| A20 | DONE (code), CHECKED LOCAL | skinstate-2 in `lib/skin-state-2.ts`, and contract text drafted for sign-off. Commits 1b0dd32, 1d69f61 |
| C02 | stays BLOCKED on C07 only | A20 landed. Real pairs can now match on the build, and are still `quantity_not_validated` |
| D01 | DONE (provisional), CHECKED LOCAL | `BASELINE_RULE` first 3 comparable scans, provisional. Commit 0bd5c08 |
| D02 | DONE, CHECKED LOCAL; output is always "not enough evidence" until C07 | Commits 087fb2c, 330991f |
| D03 | DONE, CHECKED LOCAL | Two levels only. `persistence_not_available` on every pairwise answer |
| new | Owner: SKIN_STATE_CONTRACT_2 sign-off | Section 4.1 |
| new | D05 window after an engine change | Section 4.2. Links to D05 |
| new | Baseline: capture-method skip and retake grouping | Sections 4.3 and 4.4 |
| new | Shared shape: no-pair comparability arm, histogram reason | Section 5.1 |
| new | Comparability guard: allow engine forwarding | Section 5.2 |
| new | Trusted skinstate-2 series loader (wiring) | Section 5.3 |
| new | Store processingConsentVersion on scanAnalyses | Section 5.4 |
| new | D-24 missing from DECISION_LOG | Section 5.5 |

## 7. Commits

| Commit | What |
|---|---|
| 70c8e31 | Design (owner decisions recorded) |
| f858250 | Design fixes from the verifier |
| 1b0dd32 | skinstate-2, contract document, tests |
| 1d69f61 | Comparability accepts skinstate-2 (additive) |
| 0bd5c08 | D01 baseline window |
| 087fb2c | D02/D03 engine, guard test |
| 8095b72 | Emulator seed and e2e test |
| 330991f | Review fixes |
| (this file) | Report |

`git diff --stat longitudinal-platform...HEAD` lists only lane-owned files, plus the design and report documents. The branch is based on bbe02da. `longitudinal-platform` is one tracker-only commit ahead.
