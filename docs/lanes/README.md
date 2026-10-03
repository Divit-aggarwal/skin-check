# Lanes: parallel feature work under TD-04

Owner decision TD-04 (2026-10-03): the Phase 0 deploy is paused after runbook step C1. Features are built first, on lane branches, and tested on the local stack. The full deploy happens at the end with docs/PHASE_0_RUNBOOK.md.

| Lane | Branch | Worktree | Tasks | Brief | Report |
|---|---|---|---|---|---|
| capture | `lane/capture` | `../skin-check-capture` | C01, C02 | [capture.md](capture.md) | `capture-report.md` |
| routine | `lane/routine` | `../skin-check-routine` | E01, E03, E04 | [routine.md](routine.md) | `routine-report.md` |
| privacy | `lane/privacy` | `../skin-check-privacy` | H01, H02, H03 | [privacy.md](privacy.md) | `privacy-report.md` |

## Rules for every lane

1. **Never edit the tracker** (`docs/PROJECT_SKIN_EXECUTION_TRACKER.md` or `.xlsx`). Write results to `docs/lanes/<lane>-report.md`. The tracker is updated only when the lane is merged.
2. **Never edit `docs/architecture/DECISION_LOG.md`.** Propose decisions in your report. The owner records them.
3. **Design gate first.** The first deliverable is a design brief in your report. Write implementation code only after the owner approves that brief (CLAUDE.md; tracker rows C01, E03, H02).
4. **Local stack only.** Use `npm run dev:local` and `npm run test:local`. Never use production keys, and never call production services.
5. **Stay in your files.** Edit only the files your brief says you own. For a shared file, edit only your marked part (see below). Anything else goes into your report as a request.
6. **No new npm dependencies** without the owner's approval. Name the package and the reason in your report.
7. **Frozen contracts stay frozen.** `lib/skin-state.ts` and the skinstate-1 contract (D-23), D-12 (no attribution, efficacy or forecasting) and D-26 (client input never authoritative) are not changed by a lane.
8. All CLAUDE.md hard rules apply: no terraform apply, no database delete or reset, no production deploy, no secret values.

## Starting a lane (once per worktree)

```bash
cd ../skin-check-<lane>
npm ci                      # the worktree has no node_modules
npm run test:local          # must pass before you change anything
```

`.env.lane` (already in the worktree, gitignored) sets the lane's `PORT_BASE`. The stack script copies `.env.development.example` to `.env.development.local` on the first run.

## Ports

Port = `PORT_BASE` + offset. Three lanes and the main checkout can run at the same time.

| Checkout | PORT_BASE | web | auth | firestore | fs websocket | hub | logging | emulator UI | engine | S3Mock |
|---|---|---|---|---|---|---|---|---|---|---|
| main (`skin-check`) | 3100 | 3100 | 3101 | 3102 | 3103 | 3104 | 3105 | 3106 | 3107 | 3108 |
| capture | 3200 | 3200 | 3201 | 3202 | 3203 | 3204 | 3205 | 3206 | 3207 | 3208 |
| routine | 3300 | 3300 | 3301 | 3302 | 3303 | 3304 | 3305 | 3306 | 3307 | 3308 |
| privacy | 3400 | 3400 | 3401 | 3402 | 3403 | 3404 | 3405 | 3406 | 3407 | 3408 |

- Each checkout runs its own Docker containers: `skin-scan-dev-<PORT_BASE>` and `s3mock-dev-<PORT_BASE>`.
- The engine image is amd64 under emulation on this Mac (about 2 GB each). Running all four stacks at once is heavy. Start a stack only while you need it.

## File ownership

Found by grepping each lane's terms across `app/`, `components/`, `lib/`, `hooks/`, `types/` and `firestore.rules`:
- capture: captureMethod, retake, camera, quality;
- routine: SKU, routine, catalogue, recommend;
- privacy: consent, under-18, attestation, erasure, retention, Gemini prompt, `female_skin_context`, `current_products`, `phone_verify`.

A file matched by two or more lanes is in the shared table below.

| Lane | Owns (may edit) |
|---|---|
| capture | `components/skin-check/inputs/PhotoCapture.tsx`, `hooks/useCameraStream.ts`, `lib/scan-analysis-record.ts`, new `lib/capture-quality/**`, new `lib/comparability.ts`, new tests `tests/capture-*.test.ts`, `tests/comparability*.test.ts`, new seed `scripts/seed-lane-capture.ts` |
| routine | `lib/skin-check-skus.ts`, `components/skin-check/SkinCheckDashboard.tsx`, new `lib/routine/**`, new `lib/catalog/**`, new `app/api/routine/**`, new `app/(marketing)/routine/**`, new `components/routine/**`, new tests `tests/routine-*.test.ts`, `tests/catalog-*.test.ts`, `tests/firestore-rules-routine.test.ts`, new seed `scripts/seed-lane-routine.ts` |
| privacy | `lib/consent.ts`, `app/api/skin-scan/upload/route.ts`, `lib/s3.ts`, `lib/s3-key.ts`, `app/(marketing)/account/page.tsx`, new `app/api/account/**`, `lib/skin-check-steps.ts`, `lib/skin-check-validation.ts`, `components/skin-check/inputs/PhoneAuthStep.tsx`, `app/(marketing)/echo/page.tsx`, `components/skin-check/EchoPage.tsx`, `lib/gemini.ts`, `lib/gemini-key.ts`, `lib/echo-trusted-context.ts`, `lib/skin-check-format.ts`, `app/api/skin-check/chat/route.ts`, new tests `tests/privacy-*.test.ts`, `tests/firestore-rules-privacy.test.ts`, new seed `scripts/seed-lane-privacy.ts` |

**No lane edits:**
- `lib/skin-state.ts`, `lib/skin-state-loader.ts` (D-23 frozen).
- `lib/skin-check-rules.ts` (D-08 recommender; E02 is not in a lane).
- `lib/firebase/admin.ts`, `lib/firebase/client.ts`, `lib/dev-env-guard.cjs` and `next.config.js` (local-stack and guard plumbing).
- `scripts/local-stack*.sh`, `scripts/seed-local.ts`, `firebase.json`.
- `CLAUDE.md`, the tracker, `DECISION_LOG.md`.
- `package.json` and `package-lock.json`, except with owner approval (rule 6).

## Shared files and how each clash is avoided

These are the files more than one lane needs to change.

| Shared file | Lanes | Plan |
|---|---|---|
| `firestore.rules` | routine (routines, routine events), privacy (consent ledger, erasure) | Each lane adds **new `match` blocks only**, inside a marked section: `// ── lane:routine ──` … `// ── end lane:routine ──` (and the same for privacy), placed just before the closing brace of `match /users/{uid}`. Neither lane edits existing blocks. Each lane writes its rules tests in its own file (`tests/firestore-rules-<lane>.test.ts`), not in `tests/firestore-rules.test.ts`. Merge routine first; privacy rebases. The conflict is two adjacent inserts, resolved by keeping both. |
| `app/api/skin-scan/route.ts` | privacy (server-side 18+ attestation, H02), capture (store capture-quality metadata with the analysis, C01/C02) | privacy edits only the request preamble, before `request.formData()`. capture edits only the `persistScanAnalysis` call and the form fields it reads, after `formData`. Merge capture first; privacy rebases. |
| `lib/firebase/skin-checks.ts` | privacy (consent fields), capture (optional capture-quality summary) | Additive only. capture adds one optional `capture` field to the saved document. privacy owns the `consent` block and its rules. Neither renames or removes fields. Merge capture first. |
| `types/skin-scan.ts` | capture (quality result on `SkinScanState`), privacy (consent/attestation types if needed) | New optional fields or new types only. No change to `SkinScanResultSchema`, which is the engine contract. |
| `components/skin-check/inputs/PhotoCapture.tsx` | capture (owner), privacy (consent UI lives in it) | capture owns the file. privacy changes consent **copy and versions in `lib/consent.ts`** (already imported by PhotoCapture). If privacy needs a layout change in PhotoCapture, it writes the request in its report; capture makes it, or it is done after both lanes merge. |
| `lib/useSkinCheckFlow.ts` | privacy (18+ gate, per-scan re-confirmation, answers), capture (scan state on retake, quality result) | privacy owns the answers, sections and age-gate code. capture edits only the scan-state handling (the photo → `SkinScanState` path and the retake reset). Merge capture first. |
| `lib/api.ts` (client helpers for scan and upload) | capture (send quality fields), privacy (send attestation, consent) | Additive only: new optional parameters on the existing helpers. No signature or behaviour change for current callers. Merge capture first. |
| `lib/skin-check-draft.ts` | privacy (draft answers and consent), capture (draft scan state incl. `captureMethod`) | privacy owns the answers and consent parts. capture may add an optional quality field to the stored scan state only. |
| `lib/skin-check-session-context.tsx` | capture, privacy | New optional context fields only. No renames. |
| `components/skin-check/SkinCheckDashboard.tsx` | routine (owner: products, routine), capture (low-quality notice), privacy (consent and retention display) | routine owns it. capture and privacy write the change they need in their report; routine makes it, or it is done after both merge. |
| `lib/skin-check-skus.ts` | routine (owner); its exports are used by PhotoCapture (capture), EchoPage (privacy) and the dashboard | routine keeps the names and shapes of `METRIC_LABELS`, `BAND_STYLE`, `OVERLAY_CATEGORIES` and `resolveStatedConcern`. New catalogue data goes in `lib/catalog/**`. |
| `.env.development.example` | any lane that adds a variable | Append only, one block per lane with a `# lane:<name>` comment. Add the same name to your own `.env.development.local`: the stack script refuses to start when a name in the example is missing from the copy. Every new variable gets a safe local value. If a new variable could point at production, the guard (`lib/dev-env-guard.cjs`) must learn it. That file is not lane-owned, so the lane writes a request in its report. |
| `scripts/seed-local.ts` | all | Not edited. Each lane adds `scripts/seed-lane-<lane>.ts`. The stack script runs it automatically after the base seed. |
| `scripts/local-stack-e2e.sh` | all | Not edited. It already runs every `tests/firestore-rules*.test.ts` and every `tests/*.e2e.test.ts`. |
| `package.json`, `package-lock.json` | any lane needing a dependency | Not edited without owner approval (rule 6). At merge, the lockfile is regenerated once, by whoever merges. |

## Merge order (when lanes finish)

1. **capture**: it owns PhotoCapture and is the first writer to the shared parts of the scan route and `skin-checks.ts`.
2. **routine**: it adds its section to `firestore.rules`.
3. **privacy**: it rebases on both and adds its rules section and the scan-route preamble.

Each merge: rebase on `longitudinal-platform`, `npm run test:local` green, typecheck, lint and build green, report complete. Then the tracker is updated from the report (by the main session, not the lane).

## What the lanes need from the owner before they can start

| Lane | Needed before | Item |
|---|---|---|
| all | implementation | Approval of each lane's design brief (rule 3) |
| capture | C02 key-based comparability | **D-26 open item:** may client-asserted `captureMethod` and `persistAttempt` be in the comparability key? |
| capture | C02 per-metric thresholds | C07 noise tables (research; not available). Until then C02 can only do key-based comparability, with thresholds left as unknown |
| routine | E01 | **Catalogue master data:** products, ingredients, classes, claims, constraints, availability. Also the **OPEN-R1 decision** (do product cards return?) |
| routine | E03 and E04 UI copy | Confirmation that D-12 applies: no attribution or efficacy language next to routine events |
| privacy | H01 implementation | **Erasure IAM principal** (ListBucket on prefix + DeleteObject on `users/*`), and a **retention period** for originals. Locally, S3Mock stands in, so the design can proceed |
| privacy | H03 | **PREFLIGHT G1 answer:** which Google project and tier own the production Gemini key. Plus the consent copy for the "AI share" purpose (D-16) |
| privacy | H02 | Approval of D-19's server-side 18+ attestation and per-scan re-confirmation (PROPOSED) |
