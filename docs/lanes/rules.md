# Lane brief: rules (E02, E05)

Branch `lane/rules`, worktree `../skin-check-rules`, `PORT_BASE=3600`. Read [README.md](README.md) first: lane rules, ports, shared files, shared shapes.

## Tasks

| ID | Task | Starts as | Deliverable in this lane |
|---|---|---|---|
| E02 | Product eligibility and safety rules | BLOCKED (E01, E05) | 1. Design brief. 2. After approval: a pure, versioned function from self-reported answers and the catalogue to a `RecommendationResult` (`lib/contracts/recommendation-result.ts`). |
| E05 | Red-flag interlock | OWNER ACTION (clinical reviewer) | A pure, versioned function to a `SafetyState` (`lib/contracts/safety-state.ts`). Its criteria are a named provisional list for the clinical reviewer to sign off. |

Catalogue data is synthetic until E01. That is enough to build and test the rules.

## Rules

- **Rules are fixed code, versioned, and explain themselves.**
  - Plain TypeScript, no rules engine (D-08).
  - A `RULESET_VERSION` constant.
  - Every result names the rule that fired, the data that triggered it, the limits that applied, what is unknown, and why other options were excluded.
- **Gemini never picks a product.** Selection is this code only. Echo may mention only the items in a `RecommendationResult`, with whitelisted claim text (RECOMMENDATION_MODEL §7).
- **A red flag overrides normal recommendations.** The base routine and a referral line only, with `safety.redFlag: true` on the result (RECOMMENDATION_MODEL §4).
- **Every clinical list is a named setting marked provisional.** That covers red-flag triggers, contraindications and the extra-caution triggers.
  - The feature stays **off in production builds** until a clinical reviewer signs off (tracker E05).
  - The switch is a named constant tested to be off when `NODE_ENV` is `production`.
- **No product cards or other user interface in this lane** (owner R-2 B). This lane builds a library and its tests only.
- **No diagnosis wording, and no claim that a product worked** (D-12; GEMINI_BOUNDARY §2.5–2.6). Every user-facing string passes the D-12 word check in `lib/catalog/wording.ts`.
- **Inputs are self-reported quiz answers only** (RECOMMENDATION_MODEL §2, §4).
  - Never image bands (D-09): they are per-photo relative and change between photos of the same face.
  - Never the routine record: R-1 A keeps it to the user's own view (TD-07).
- **Every trigger records whether the answer was fresh or reused** (D-19). Pregnancy and prescription answers must be re-confirmed on the scan they are used for.
- **Fill the whole audit record** (RECOMMENDATION_MODEL §6): `inputSha256`, item `position`, `notices` apart from `limits`, the `SafetyState` the result was built under (so a red flag and the selection cannot disagree), and `extraCaution` on it.
- Not evaluable, and never inferred: mood, non-response to treatment, lesion signs from images (RECOMMENDATION_MODEL §4).

## Files you own

- new `lib/rules/**`: rules, red flags, settings, `RULESET_VERSION`
- `lib/catalog/**`: additive only; keep existing names and shapes
- new tests: `tests/rules-*.test.ts`
- new seed `scripts/seed-lane-rules.ts`, only if an end-to-end case needs one

## Do not touch

- `lib/contracts/**` and `tests/contracts.test.ts` (requests to the main session).
- `lib/skin-check-rules.ts`: today's per-photo bands. The display and Echo still use it.
- `lib/skin-check-steps.ts`: read the option values; do not change questions.
- `components/**`, `app/**` (no UI and no route in this lane), and everything under "No lane edits" in README.md.

## Tests you must add

- A table of answer sets to the expected `RecommendationResult`: fired rules, triggers, limits, unknowns and exclusions, each with its reason.
- Every red-flag criterion: the answer that raises it, and the answer just outside it.
- A red flag replaces normal recommendations (`safety.redFlag: true`, base routine plus referral only), whatever else is true.
- A prescription in `current_products` removes the actives and adds the "keep following your prescriber's routine" limit.
- Missing answers show up in `unknowns`; they are never guessed.
- Determinism: the same inputs and versions always give the same result.
- Image bands are not an input: no rule file imports `lib/skin-check-rules.ts` or the scan types (an import-boundary test).
- The D-12 word check passes on every user-facing string. There is no diagnosis wording and no efficacy wording.
- The production switch is off in a production build.

## Exit conditions

- Design brief approved by the owner, and the provisional clinical lists listed for the reviewer (recorded in `rules-report.md`).
- `npm run test:local` green; typecheck, lint and `npm run build` green.
- Only owned files changed (`git diff --stat longitudinal-platform...`).
- `docs/lanes/rules-report.md`: what was built, commits, test results, the clinical lists for review, open questions, proposed decisions and tracker rows.
