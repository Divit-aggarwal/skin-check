This repository contains a live skin-analysis product.

Do not replace the existing analysis engine without explicit approval.

The longitudinal system must preserve:
- measurement provenance
- engine versioning
- immutable historical states
- uncertainty
- comparability gates
- deterministic recommendation rules
- Gemini as an explanation layer, not source of truth

Do not implement forecasting, autonomous agent loops,
or causal product-effect claims without explicit approval.

All architectural decisions must be documented.

## Hard rules

- The tracker in docs/ (PROJECT_SKIN_EXECUTION_TRACKER.md) is the source of
  truth. Update it after every finished task. Exception: work on a lane
  branch (lane/*) never edits the tracker; it writes docs/lanes/<lane>-report.md,
  and the tracker is updated when the lane is merged.
- A code task is done only when it has a commit and a test result.
- A document task is done when the document is committed. No test is needed.
- Never run terraform apply.
- Never delete or reset a database.
- Never deploy to production. Prepare the command and stop. The owner runs it.
- Never print or copy secret values.
- Do not change a frozen decision. Write the concern in the tracker and stop.
- New problems found outside the current task become new tracker rows. They do
  not expand the current task.

## Execution order (TD-04, owner decision 2026-10-03)

1. Phase 0 deploy is paused after runbook step C1. The 0.1.6 image is in
   ECR; nothing else is switched.
2. Features are built first, on lane branches, and tested on the local stack
   (`npm run dev:local`, `npm run test:local`), which uses no production keys.
3. The full deploy happens at the end, with docs/PHASE_0_RUNBOOK.md (C2
   onward, then A, B, D). Do not mark a paused deploy task as done.

## Owner note, 2026-10-07: Stage 1 deploy
The owner authorises the agent to run every step of
docs/PHASE_0_RUNBOOK.md Stage 1 itself, including steps that change
production. This covers deleting and recreating the Firestore
(default) database in Job A1 only; the data is disposable test
data. No other database may be deleted. This note is removed when
the deploy ends.
