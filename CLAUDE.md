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
  truth. Update it after every finished task.
- A task is done only when it has a commit and a test result.
- Never run terraform apply.
- Never delete or reset a database.
- Never deploy to production. Prepare the command and stop. The owner runs it.
- Never print or copy secret values.
- Do not change a frozen decision. Write the concern in the tracker and stop.
- New problems found outside the current task become new tracker rows. They do
  not expand the current task.
