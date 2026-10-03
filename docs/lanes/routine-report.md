# Routine lane report (E01, E03, E04)

Branch `lane/routine`, worktree `../skin-check-routine`. Design: [routine-design.md](routine-design.md).

**Owner approval:** the E03 data-model design was approved on 2026-10-03, with R-1 A, R-2 B, R-3 A, R-4 A, R-5 B, R-6 A and an exact-name exception for real product names (design §0). This meets routine.md's exit condition 1.

## 1. Steps

| # | Step | Status | Commit |
|---|---|---|---|
| — | Owner decisions written into the design. Verifier re-check of the design (FAIL) and its fixes | done | 5b058e0, e45da38 |
| 1 | E01 catalogue schema, synthetic sample, template drift check, D-12 name exception | done | e45da38 |
| 2 | E03 event schemas and `currentRoutine()` | done | e9331f3 |
| 3 | E04 `adherence()` | done | 0e4bf16 |
| 4 | `lib/routine/copy.ts`, D-12 wording test and import-boundary test | done | 6f8c22c |
| 5 | `firestore.rules` lane:routine section and emulator rules tests | done | 0f56ea6 |
| 6 | `GET`/`POST /api/routine/events` | done | ac275fa |
| 7 | `scripts/seed-lane-routine.ts`, plus `tests/routine.e2e.test.ts` on the local stack | done | 0e37830 |
| 8 | `/routine` page and component; copy test extended to the UI | done | e08aa89 |
| — | Fixes from the final verifier and security review | done | 779e967 |
| 9 | Replace the synthetic catalogue with owner data | **skipped**: R-3 A, no owner data yet | — |
| 10 | Full typecheck, lint, build, and this report | done | this commit |

Notes:
- e45da38 also holds the design fixes from the first verifier pass. They were committed together with step 1.
- Step 8 "page works on the local stack" was checked this way:
  - `/routine` renders on `npm run dev:local` (title and purpose text).
  - The API returns 401 without a token.
  - The signed-in API flow (read the routine, append, replay, adherence) runs end to end in `tests/routine.e2e.test.ts`.
  - The signed-in page was **not** clicked through in a browser.

## 2. Test results (final run, after all fixes, at 779e967)

- `npm run test:local`: exit 0.
  - Unit phase: 26 files passed, 4 skipped; **320 tests passed, 34 skipped**.
  - Stack phase: 4 files, **34 passed**. This includes `firestore-rules-routine.test.ts` (8), the existing `firestore-rules.test.ts` (24) and `routine.e2e.test.ts` (1).
  - The seed wrote 5 events for Asha and 3 for Ravi.
- Routine unit tests:

  | File | Tests |
  |---|---|
  | `catalog-schema.test.ts` | 20 |
  | `routine-events.test.ts` | 18 |
  | `routine-adherence.test.ts` | 13 |
  | `routine-copy.test.ts` | 8 |
  | `routine-route.test.ts` | 19 |

- Checks:
  - `npm run typecheck`: green.
  - `npm run lint`: no warnings or errors.
  - `npm run build`: exit 0. It builds `/routine` and `/api/routine/events`.
- Not mine: `npx next lint --dir tests` reports two unused-variable errors in the existing `tests/api-chat-auth.test.ts`. `npm run lint` does not lint `tests/`.

## 3. Reviews and fixes

**Verifier, design re-check: FAIL.** Every finding was fixed in the design (e45da38):
- Leftover "open decision" text was updated: each R-x now has a Decision line, and the blocking notes are resolved.
- `GET ?tz=` now returns `routine` and 7-day `adherence`, so E04 has a caller.
- Product-id rules:
  - `start` and `substitute.toProductId` need an "available" product;
  - stop, usage and reschedule accept any catalogue row;
  - catalogue rows are never removed, only marked discontinued.
- `schedule.slot` is not checked against `Product.slot`, because the record is self-reported.
- The meaning of `since` is pinned.
- Idempotency compares input fields only, using `create()` plus a compare.
- Claim columns map by the `claim_<n>_*` pattern.
- The name exception was narrowed:
  - each entry carries owner approval, a date and a reason;
  - it applies only to `dataSource: "owner"` products with an exact whole-name match;
  - it is recorded as a proposed D-12 *clarification*, not a change.
- DECISION_LOG proposals and tracker rows were added.

**Verifier, code against design and decisions: FAIL.** Fixed in 779e967:
- The page inherited the root `<meta description>` from `app/layout.tsx`: "…whether your routine is actually working". That is a banned word and a results link. The page now sets its own `description` and `openGraph.description` from `ROUTINE_COPY.purpose`, and a test checks it.
- The JSX-text scan skipped text next to a `{…}` expression. Expressions are now blanked before the scan, and a planted `<p>Results {n}</p>` self-check was added.
- The UI wording and "no claims" tests passed even when they found no files. Both now require at least 2 files.
- The design listed a test that was missing: a second start of `OTHER_PRODUCT_ID` is ignored. It is now added.
- The seed used `.set()`. It now uses `create()` and skips docs that already exist, so it never rewrites an event.
- File ownership: `git diff --name-only a7103ec..HEAD` lists only lane-owned files plus `docs/lanes/routine-design.md` and this report. There is no tracker, DECISION_LOG or package change.

**Security reviewer: no cross-user read or write path.**
- Why no cross-user path exists:
  - The uid comes only from the verified token.
  - Schemas are strict, with no `uid` field.
  - Rules give owner-only get/list and `write: if false`.
  - A collection-group query is denied (tested).
  - An eventId is scoped to the caller's own subtree, so reusing another user's eventId cannot block or reveal their event.
- Low-severity hardening items:
  - The body-size cap trusted `Content-Length`. **Fixed:** the body is streamed with a hard 4 KB cap, and a chunked-body test was added.
  - There was no per-user volume limit; the per-IP limiter can be bypassed with `X-Forwarded-For`, and `perDay` was never enforced. **Fixed:** a cap of 200 writes per verified uid per day, tested. It is in-memory and per instance (a `ponytail:` comment marks the limit). See proposed tracker row T3.
  - The future-date check trusts the client's time zone, and there is no lower bound on dates. **Not changed.** Design §2.2 accepts this on purpose: the record is self-reported, not measured, and D-26 does not apply. It only affects the user's own record.
  - A note from the reviewer: one UUID could be written in two letter cases. **Fixed:** eventIds must be lowercase.

## 4. Requests to other lanes and to main

- **main (`app/layout.tsx`, not lane-owned):** the root description, "…whether your routine is actually working", links a routine to results. Every page that does not override it inherits that wording. Please review it under D-12. The routine page now overrides it.
- **privacy (H01):** add `users/{uid}/routineEvents/*` to the places where user data lives. `recursiveDelete` on `users/{uid}` covers it. The erasure test should seed one routine event.
- **privacy (D-16):** R-1 A purpose text for `lib/consent.ts`: "So you can keep a record of your own routine and see it back. Only you see it. It is not used for analytics, not sent to Gemini and not joined to your scans." Until privacy takes it, the page shows the same sentence from `lib/routine/copy.ts`.
- **owner:** record the proposed DECISION_LOG entries:
  - R-1 A: supersedes B14 for the user's own routine record only.
  - R-5 B.
  - R-6 A: replaces DATA_MODEL's client-written `events/{autoId}` and routine.md's "allow `create`".
  - D-12 clarification: a registered own-brand product name, listed with owner approval, is not by itself a claim.

## 5. Proposed tracker rows

- **T1.** Replace the synthetic CATALOGUE with owner data (R-3 A, lane step 9) before the Phase 0 deploy. The deploy is blocked while any product has `dataSource: "synthetic"`. Add "Clear Seal" to the catalogue as an owner row; its name exception is already listed.
- **T2.** Purpose conflict, now resolved by R-1 A. Update RECOMMENDATION_MODEL §8, DATA_MODEL (Events row), SYSTEM_MODEL C16 and B14 at merge.
- **T3.** Routine write limits are in-memory and per instance. Move them to a shared store if a hard global cap is needed (with the existing `lib/rate-limit.ts` limitation).
- **T4.** RECOMMENDATION_MODEL §3 and IMPLEMENTATION_MAP C8 name `lib/catalog.ts`. The lane uses the `lib/catalog/` folder, and the product shape changed (design §5). Update the docs at merge.
- **T5.** Update `docs/lanes/routine.md`:
  - list `docs/lanes/routine-design.md` and `routine-report.md` as owned;
  - replace "allow `create`" (line 23) with R-6 A.
- **T6.** `app/layout.tsx` root description: D-12 review (see §4).
- **T7.** Signed-in click-through of `/routine` in a browser on the local stack. It has not been done yet; the API flow is covered by e2e.

## 6. Catalogue fields the owner must supply

These go in `lib/catalog/catalogue-template.csv`, one row per product:
- id, version id, name;
- category, slot (AM / PM / AM_PM);
- verified Shopify handle;
- ingredient classes, full INCI list, active ingredient and %;
- label warnings, contraindications (pregnant_or_breastfeeding, prescription_in_use);
- MRP in whole rupees, pack size;
- availability, regions;
- usage text;
- each claim with its evidence level, source and date.

Fill-in rules are in design R-3. Names and usage text must pass the D-12 word check. The only exception is a registered brand name that the owner lists exactly in `PRODUCT_NAME_EXCEPTIONS`; usage text has no exception.

## 7. Commits

5b058e0, e45da38, e9331f3, 0e4bf16, 6f8c22c, 0f56ea6, ac275fa, 0e37830, e08aa89, 779e967, and the commit that adds this report. Nothing was pushed.
