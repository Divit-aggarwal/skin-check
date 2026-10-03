# Lane brief: routine (E01, E03, E04)

Branch `lane/routine`, worktree `../skin-check-routine`, `PORT_BASE=3300`. Read [README.md](README.md) first: lane rules, ports, shared files.

## Tasks

| ID | Task | Starts as | Deliverable in this lane |
|---|---|---|---|
| E01 | Product catalogue normalisation: a versioned own-brand catalogue (ingredients, classes, claims, constraints, cost, availability) | OWNER ACTION (data, OPEN-R1) | The versioned **schema** and its validation, with synthetic sample data only. Real product data comes from the owner. The handles in `lib/skin-check-skus.ts` are marked as guesses there |
| E03 | Routine model and event history: products, routines, starts, stops, substitutions and schedule history, append-only | NOT STARTED | 1. Data-model design brief. 2. After owner approval: model, server routes, rules and tests, on the local stack only |
| E04 | Adherence summary: used, skipped, unknown. A missing log is never "skipped" | BLOCKED (E03) | A pure function over E03 events, plus tests. Starts once E03's model is approved |

## Files you own

- `lib/skin-check-skus.ts`
- `components/skin-check/SkinCheckDashboard.tsx`
- new: `lib/routine/**`, `lib/catalog/**`, `app/api/routine/**`, `app/(marketing)/routine/**`, `components/routine/**`
- new tests: `tests/routine-*.test.ts`, `tests/catalog-*.test.ts`, `tests/firestore-rules-routine.test.ts`, and optionally `tests/routine.e2e.test.ts`
- new seed: `scripts/seed-lane-routine.ts` (routines and events for the two seed users)

## Shared files: your part only

- `firestore.rules`: new `match` blocks only, between `// ── lane:routine ──` and `// ── end lane:routine ──`, just before the closing brace of `match /users/{uid}`. Event history is append-only: allow `create`, never `update` or `delete`.
- `.env.development.example`: append a `# lane:routine` block only if you add a variable.

## Do not touch

- `lib/skin-check-rules.ts` (D-08 recommender; E02 is not in this lane). If routine needs a change there, write the request in your report.
- `lib/skin-state.ts` (D-23 frozen).
- `app/(marketing)/account/page.tsx` (privacy lane). Routine gets its own page under `app/(marketing)/routine/`.
- Everything listed under "No lane edits" in README.md.

## Tests you must add

- Catalogue schema:
  - valid and invalid entries;
  - the version constant is present;
  - unknown fields are rejected.
- Routine events:
  - append-only (an update or delete of an event is refused by the rules, in `tests/firestore-rules-routine.test.ts`);
  - owner-only read and write;
  - a substitution is a new event, not an edit.
- Adherence:
  - used, skipped and unknown from event sequences;
  - **a missing log is "unknown", never "skipped"**;
  - date edges.
- No user-facing string links a product to a skin change. Assert that no copy contains causal or efficacy words (D-12).

## Exit conditions

- E03 data-model brief approved by the owner (recorded in `routine-report.md`).
- `npm run test:local` green; typecheck, lint and `npm run build` green.
- Only owned files and your marked parts of shared files changed.
- `docs/lanes/routine-report.md` has: what was built, commits, test results, the catalogue fields the owner must supply, and proposed decisions.
