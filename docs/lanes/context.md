# Lane brief: context (F01, F02, F03, F04)

Branch `lane/context`, worktree `../skin-check-context`, `PORT_BASE=3700`. Read [README.md](README.md) first: lane rules, ports, shared files, shared shapes.

## Tasks

| ID | Task | Starts as | Deliverable in this lane |
|---|---|---|---|
| F01 | Context package builder | BLOCKED (D02, E03, E04, E05) | 1. Design brief. 2. After approval: a deterministic, versioned builder producing a `ContextPackage` (`lib/contracts/context-package.ts`). |
| F02 | Gemini renderer | BLOCKED (F01) | The prompt and structured output over the package, with a versioned prompt (GEMINI_BOUNDARY §3, §5). |
| F03 | Output validator | BLOCKED (F02) | A pure validator for every Gemini answer, with the reject, retry and fallback path. |
| F04 | User-statement separation | NOT STARTED | Self-reported answers are labelled and never become measured data, in the package or in the answer. |

The BLOCKED rows can be built now: build against the shared shapes with test data. **Do not wait for the other two lanes.** After all three merge, the main session wires the real producers into the builder.

## Rules

- **Gemini explains. It is never the source** for measurements, history, adherence, product eligibility or safety (D-14; GEMINI_BOUNDARY §2).
- **Send only the fields needed for the user's question.** Safety, uncertainty and missing are always sent; every other section is optional, and `missing` says what was left out and why.
- **The package is the only data Gemini receives.**
  - Build every field explicitly and serialise through an allowlist. Never spread an internal result into the package; TypeScript does not stop extra keys.
  - Add a test that fails on any key outside the allowlist.
  - Stay inside the privacy pin (privacy-report §5, `tests/privacy-gemini-inventory.test.ts`). That test is add-only for this lane.
  - Bands go for the whole face plus the focus region only, as today.
  - The longitudinal, recommendation and uncertainty sections are new data to Gemini (D-14 additions). Build and test them with the fake; extend the pin test and send them for real only after the owner approves D-14.
- **Every citable item is a fact** with a stable `id` (`{kind}.{region|all}.{metric}`) and a pre-rendered `text` (GEMINI_BOUNDARY §4). Every number and band word Gemini may repeat is in our `text`. Version strings are labels, never citable numbers.
- **No red-flag signal reaches Gemini.** `ContextSafety` is the extra-caution flag only: a quiz red flag can come from `female_skin_context`, so even a bare boolean would point at a hidden answer. Red flags reach the user through fixed referral copy and the base routine; chat red flags are caught by the pre-filter before Gemini.
- **Longitudinal facts name a metric and region, never an internal quantity path.** Until the owner settles the tier-1 wording, the builder emits only "not enough evidence": the method's sentence ("by more than photo-to-photo variation") trips the §5 rule 4 lexicon ("more than"). A pairwise fact also carries its confounders as citable facts (LONGITUDINAL_METHOD §5).
- **Uncertainty is always sent** (`uncertainty` facts), so an uncertainty claim always has something to cite.
- **While `extraCaution` is on, the answer that set it is left out** of the self-reported statements (privacy-report §5).
- **Routine and adherence data are not sent** (owner R-1 A, TD-07; users are told so in `ROUTINE_PURPOSE_COPY`). The shape allows only `{ status: "not_shared" }`. Routine data next to a "beyond noise" result also invites an attribution claim (D-12). Do not build a shared routine path.
- **The validator checks every Gemini answer for:**
  - made-up numbers;
  - made-up past events;
  - cause claims;
  - product claims;
  - anything that disagrees with the context package;
  - missing uncertainty;
  - user statements presented as measurements.

  The GEMINI_BOUNDARY §5 checks apply as well: unknown fact id, citation rule, the change and comparative lexicon (EN and Hinglish), non-Latin script, the medical and efficacy lexicon, and band mismatch. Each check maps to a `ForbiddenClaim` name, so a failure says which check failed.
- **A failed answer is rejected.** Retry once only when it is safe: never after a red flag, and never when the failure came from the user's own premise. Otherwise use a fixed fallback answer built only from package text.
- **Record** the context package version, the prompt version, the model name and the validation result for every answer: chatTurns (D-15), server-written, 90-day TTL.
- **Red-flag and comparison-intent pre-filters** run before generation, with no Gemini call on a hit (GEMINI_BOUNDARY §6, §6b).
- No Search grounding, no tool calls that write, and no agent loops (CLAUDE.md).
- Locally, Gemini is a test fake. No production key is used (decision 6 and G1 are open).

## Files you own

- new `lib/context/**`: builder, renderer, validator, pre-filters, fallback, user-statement separation
- `lib/gemini.ts`, `lib/echo-trusted-context.ts`, `lib/skin-check-format.ts`, `lib/echo-history-token.ts`
- `app/api/skin-check/chat/route.ts`, `components/skin-check/EchoPage.tsx`
- `firestore.rules`: only a new `// ── lane:context ──` section (chatTurns)
- new tests: `tests/context-*.test.ts`, `tests/firestore-rules-context.test.ts`; add-only edits to `tests/privacy-gemini-inventory.test.ts`, `tests/privacy-chat-gate.test.ts` and the existing chat tests
- new seed: `scripts/seed-lane-context.ts`

## Do not touch

- `lib/contracts/**` and `tests/contracts.test.ts` (requests to the main session).
- `lib/longitudinal/**` and `lib/rules/**` (other lanes). Use fixtures of the shared shapes instead.
- `lib/consent.ts`: AI-share copy and versions belong to H06 (owner).
- The chat route's 18+ and AI-share gates: keep them as they are, before any package is built.
- Everything under "No lane edits" in README.md.

## Tests you must add

- Builder:
  - fixtures of every shape produce the expected package;
  - the allowlist test;
  - no number, date, scan id, rule id or trigger appears in a package built from internal results that contain them;
  - routine is always `not_shared`.
- Validator: one passing and one failing answer for every `ForbiddenClaim`, plus the "user premise" bypass from GEMINI_BOUNDARY §5.
- Reject, retry and fallback: one retry at most; no retry after a red flag; the fallback uses package text only.
- Pre-filters: the English and Hinglish cases in GEMINI_BOUNDARY §6 and §6b, with false-positive and false-negative cases.
- Record: package version, prompt version, model name and validation result are stored for every answer (emulator round trip).
- The chat gates (18+, AI share) still refuse before any package is built.

## Exit conditions

- Design brief approved by the owner (recorded in `context-report.md`).
- `npm run test:local` green; typecheck, lint and `npm run build` green.
- Only owned files and the marked `firestore.rules` section changed (`git diff --stat longitudinal-platform...`).
- `docs/lanes/context-report.md`: what was built, commits, test results, the prompt and validator lists, open questions, proposed decisions and tracker rows.
