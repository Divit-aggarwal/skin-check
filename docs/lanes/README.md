# Lanes: parallel feature work under TD-04

Owner decision TD-04 (2026-10-03): the Phase 0 deploy is paused after runbook step C1. Features are built first, on lane branches, and tested on the local stack. The full deploy happens at the end with docs/PHASE_0_RUNBOOK.md.

## Wave 2 (prepared 2026-10-04)

| Lane | Branch | Worktree | Tasks | Brief | Report |
|---|---|---|---|---|---|
| longitudinal | `lane/longitudinal` | `../skin-check-longitudinal` | A20, D01, D02, D03 | [longitudinal.md](longitudinal.md) | `longitudinal-report.md` |
| rules | `lane/rules` | `../skin-check-rules` | E02, E05 | [rules.md](rules.md) | `rules-report.md` |
| context | `lane/context` | `../skin-check-context` | F01, F02, F03, F04 | [context.md](context.md) | `context-report.md` |

Wave 1 (capture, routine, privacy) merged on 2026-10-03/04. Its briefs, designs and reports stay in this folder as history; its worktrees are removed and its `lane/*` branches are kept.

## Shared shapes: `lib/contracts/` (TD-13)

The lanes meet through four type-only files, written before the lanes start:

| File | Produced by | Read by |
|---|---|---|
| `lib/contracts/longitudinal-result.ts` | longitudinal | context |
| `lib/contracts/recommendation-result.ts` | rules | context |
| `lib/contracts/safety-state.ts` | rules | context |
| `lib/contracts/context-package.ts` | context | Gemini renderer and validator |

- **No lane edits `lib/contracts/`.** If a shape is wrong or missing something, write the request in your report. The main session changes it, with a test, between waves.
- `tests/contracts.test.ts` pins the shapes to the live code (comparability reasons, the Gemini field inventory, the Echo regions). It must stay green in every lane.
- The context package types are standalone, not `Omit<>` views of the internal results, so numbers, dates, scan references, rule ids and triggers cannot pass into them by assignment.
- Each lane builds against the shapes with its own test data. No lane waits for another.

## Rules for every lane

1. **Never edit the tracker** (`docs/PROJECT_SKIN_EXECUTION_TRACKER.md` or `.xlsx`). Write results to `docs/lanes/<lane>-report.md`. The tracker is updated only when the lane is merged.
2. **Never edit `docs/architecture/DECISION_LOG.md`.** Propose decisions in your report. The owner records them.
3. **Design gate first.** The first deliverable is a design brief in your report. Write implementation code only after the owner approves that brief (CLAUDE.md).
4. **Local stack only.** Use `npm run dev:local` and `npm run test:local`. Never use production keys, and never call production services.
5. **Stay in your files.** Edit only the files your brief says you own. Anything else goes into your report as a request.
6. **No new npm dependencies** without the owner's approval. Name the package and the reason in your report.
7. **Frozen contracts stay frozen.**
   - `lib/skin-state.ts`, `lib/skin-state-loader.ts` and skinstate-1 (D-23).
   - D-12: no attribution, efficacy or forecasting.
   - D-26: client input is never authoritative.
   - The owner decisions in tracker section 5 (TD-04 to TD-13).
8. **No test is removed or weakened.** Edits to an existing test are add-only, and the report names them.
9. All CLAUDE.md hard rules apply: no terraform apply, no database delete or reset, no production deploy, no secret values.

## Starting a lane (once per worktree)

```bash
cd ../skin-check-<lane>
npm ci                      # the worktree has no node_modules
npm run test:local          # must pass before you change anything
```

`.env.lane` (already in the worktree, gitignored) sets the lane's `PORT_BASE`. The worktree also has its own `.env.development.local` with local-only values.

## Ports

Port = `PORT_BASE` + offset. The three lanes and the main checkout can run at the same time.

| Checkout | PORT_BASE | web | auth | firestore | fs websocket | hub | logging | emulator UI | engine | S3Mock |
|---|---|---|---|---|---|---|---|---|---|---|
| main (`skin-check`) | 3100 | 3100 | 3101 | 3102 | 3103 | 3104 | 3105 | 3106 | 3107 | 3108 |
| longitudinal | 3500 | 3500 | 3501 | 3502 | 3503 | 3504 | 3505 | 3506 | 3507 | 3508 |
| rules | 3600 | 3600 | 3601 | 3602 | 3603 | 3604 | 3605 | 3606 | 3607 | 3608 |
| context | 3700 | 3700 | 3701 | 3702 | 3703 | 3704 | 3705 | 3706 | 3707 | 3708 |

- Each checkout runs its own Docker containers, `skin-scan-dev-<PORT_BASE>` and `s3mock-dev-<PORT_BASE>`.
- The engine image is amd64 under emulation on this Mac (about 2 GB each). Start a stack only while you need it.

## File ownership

| Lane | Owns (may edit) |
|---|---|
| longitudinal | new `lib/skin-state-2.ts` (the new contract version, next to skinstate-1), new `lib/longitudinal/**`, `lib/comparability.ts` (additive: skinstate-2 keys; the skinstate-1 path keeps working), new `docs/architecture/SKIN_STATE_CONTRACT_2.md`, new tests `tests/longitudinal-*.test.ts`, `tests/skin-state-2*.test.ts`, `tests/comparability-2*.test.ts`, new seed `scripts/seed-lane-longitudinal.ts` |
| rules | new `lib/rules/**` (eligibility, safety and red-flag rules, their settings), `lib/catalog/**` (additive), new tests `tests/rules-*.test.ts`, new seed `scripts/seed-lane-rules.ts` if needed |
| context | new `lib/context/**` (builder, renderer, validator, pre-filters, user-statement separation), `lib/gemini.ts`, `lib/echo-trusted-context.ts`, `lib/skin-check-format.ts`, `app/api/skin-check/chat/route.ts`, `components/skin-check/EchoPage.tsx`, `lib/echo-history-token.ts`, new tests `tests/context-*.test.ts`, `tests/firestore-rules-context.test.ts`, new seed `scripts/seed-lane-context.ts` |

**No lane edits:**
- `lib/contracts/**` (shared shapes, TD-13) and `tests/contracts.test.ts`.
- `lib/skin-state.ts`, `lib/skin-state-loader.ts` (D-23 frozen).
- `lib/skin-check-rules.ts`: the per-photo bands the display and Echo use today. The rules lane writes new code in `lib/rules/**`, and never selects from image bands (D-09).
- The scan, upload, account and routine routes; `lib/consent.ts`; PhotoCapture; the dashboard; `lib/useSkinCheckFlow.ts`.
- `lib/firebase/admin.ts`, `lib/firebase/client.ts`, `lib/dev-env-guard.cjs`, `next.config.js`.
- `scripts/local-stack*.sh`, `scripts/seed-local.ts`, `firebase.json`.
- `CLAUDE.md`, the tracker, `DECISION_LOG.md`.
- `package.json` and `package-lock.json`, except with owner approval (rule 6).

## Shared files and how each clash is avoided

| Shared file | Lanes | Plan |
|---|---|---|
| `lib/contracts/**` | all (read only) | Nobody edits. Requests go to the main session (see above). |
| `firestore.rules` | context (chatTurns, D-15); longitudinal and rules write nothing | context adds **new `match` blocks only**, inside `// ── lane:context ──` … `// ── end lane:context ──`, just before the closing brace of `match /users/{uid}`. Its rules tests go in `tests/firestore-rules-context.test.ts`. |
| `tests/privacy-gemini-inventory.test.ts` | context | Add-only. The pinned list of what Gemini may receive cannot shrink its "not sent" side. A new field sent to Gemini needs an owner decision first. |
| `lib/catalog/**` | rules (owner); read by context for product names and whitelisted claims | Additive only. Keep the existing names and shapes. |
| `lib/comparability.ts` | longitudinal (owner); its reason names are pinned by `tests/contracts.test.ts` | Additive only. A new reason name is a request for the main session (the shape and its test change together). |
| `.env.development.example` | any lane that adds a variable | Append only, one block per lane with a `# lane:<name>` comment. Add the same name to your own `.env.development.local`. If a new variable could point at production, write a request: the guard (`lib/dev-env-guard.cjs`) is not lane-owned. |
| `scripts/seed-local.ts`, `scripts/local-stack-e2e.sh` | all | Not edited. Add `scripts/seed-lane-<lane>.ts`; the stack runs every seed and every `tests/*.e2e.test.ts` and `tests/firestore-rules*.test.ts`. |
| `package.json`, `package-lock.json` | any lane needing a dependency | Not edited without owner approval (rule 6). |

**Integration is a main-session step.** The context builder takes a `LongitudinalResult`, a `RecommendationResult` and a `SafetyState` as inputs and is tested with fixtures. After all three lanes merge, the main session wires the real producers into the builder, in one commit with an end-to-end test. No lane imports another lane's code.

## Merge order (when lanes finish)

1. **longitudinal**: the new contract version and the additive `lib/comparability.ts` change.
2. **rules**: independent library; additive `lib/catalog/**`.
3. **context**: rebases on both, adds its `firestore.rules` section, and owns the chat route.
4. **Main session**: the integration commit (real producers into the builder), then the tracker update from the three reports.

Each merge: rebase on `longitudinal-platform`, `npm run test:local` green, typecheck, lint and build green, report complete.

## What the lanes need from the owner before they start

| Lane | Needed before | Item |
|---|---|---|
| all | implementation | Approval of each lane's design brief (rule 3) |
| longitudinal | A20 | Approval of a new SkinState contract version next to skinstate-1 (D-23): it maps `engine_build` and names `captureMethod`, `persistAttempt` and `captureQuality` as client-asserted (TD-05) |
| longitudinal | D01 | The baseline rule: first 3 comparable scans, or the first 14 days (LONGITUDINAL_METHOD §3.4) |
| longitudinal | D02 | Acceptance that, with the noise table empty (C05–C07), every real pair answers "not enough evidence" |
| rules | E05 | A named clinical reviewer. Until sign-off, every clinical list is provisional and the feature is off in production builds |
| rules | E02 | D-08 and D-09 (plain TypeScript, quiz-keyed selection, not image bands) are PROPOSED: approve them. Catalogue data stays synthetic until E01 |
| rules | output | Where the result goes: R-2 B says no product cards now. Confirm the lane builds the library only, and the D-10 audit record at questionnaire save is a later task |
| context | routine section | R-1 A (TD-07) says routine data is not sent to Gemini, and users are told so. The shape allows only "not shared". Sending routine or adherence data needs the owner to reopen R-1 A **and** change `ROUTINE_PURPOSE_COPY` (tracker row F05) |
| context | F02, F03 | D-14 and D-15 (ContextPackage, pre-filters, chatTurns with a 90-day TTL) are PROPOSED: approve them. The longitudinal, recommendation and uncertainty sections are new data sent to Gemini beyond the privacy pin, so they wait for this approval |
| context | production use | G1 (decision 6) and the final AI-share copy (H06). Locally the lane uses a test fake for Gemini |
| context | pairwise wording | The tier-1 sentence "different from your starting checks by more than photo-to-photo variation" trips the GEMINI_BOUNDARY §5 change lexicon. Until the owner settles the wording, the package carries only "not enough evidence". The wording is about a photo statistic, not the skin (D-24) |
| context | live Echo | Whether the new path replaces today's Echo prompt in this lane or stays behind a flag (default off) until the integration commit |
