# Rules lane report (E02, E05)

Branch `lane/rules`, worktree `../skin-check-rules`. Design: [rules-design.md](rules-design.md). Date: 2026-10-04.

## Owner decisions this lane worked under (2026-10-04)

- D-08 and D-09 are approved: rules are plain code, and selection uses quiz answers only, never image readings.
- Library only: no product cards, no routes, no saved recommendation record.
- No clinical reviewer is named yet. Every clinical list is a named, provisional setting, and the feature is off in production builds. A test proves this.

## 1. Steps done, steps skipped

| Step | Status | Commit |
|---|---|---|
| 1. Design, verifier check, fixes | Done | `b83ce45`, `469bbd6` |
| 1a. Owner approval of the design | Taken from the owner's lane instruction (build every step that needs no new decision once the verifier findings are fixed). The owner should still read the design with this report | — |
| 2. Settings, provisional clinical lists, answer reading | Done | `8cd98f9` |
| 3. Red-flag interlock, `evaluateSafety` (E05) | Done | `619dd7c` |
| 4. Deterministic recommender, `recommend` (E02), production-switch tests | Done | `d0a7409` |
| 5. Import-boundary test | Done | `45b6231` |
| 6. Review (verifier and security reviewer), fixes | Done | `1b0741f` |
| 6. This report | Done | this commit |

**No step was skipped.** None needed a new owner decision. The items the owner left out of this lane (cards, routes, the D-10 saved record, clinical sign-off) were not built.

What was built, all in `lib/rules/` with no new dependency:
- `settings.ts`: `RULESET_VERSION = "rules-0-provisional"`, `REVIEW_STATUS = "provisional"`, the production switch, every clinical list and every user-facing string.
- `input.ts`: reads untrusted saved answers into one reading per rule field, and computes `inputSha256`.
- `safety.ts`: `evaluateSafety(input) → SafetyState`.
- `recommend.ts`: `recommend(input, catalogue) → RecommendationResult`. It builds its own `SafetyState`, so a red flag and the selection cannot disagree.

The input is `{ answers, confirmedThisScan }`. Any field not listed as confirmed on this scan counts as reused, which is the cautious default.

## 2. Test results

| Check | Result |
|---|---|
| `npm test` (unit) | 59 files passed, 7 skipped; **758 passed**, 41 skipped. This includes 143 new rules tests in 5 files |
| `npm run test:local` (run once, at the end, on a cleared `.next/`) | Exit 0. Unit: 758 passed, 41 skipped. Local stack: 7 files, **41 passed** |
| `npm run typecheck` | Clean |
| `npm run lint` | No warnings or errors |
| `npm run build` | Exit 0 (run after the last code change) |
| `git diff --stat longitudinal-platform...HEAD` | Only `lib/rules/**`, `tests/rules-*.test.ts`, `docs/lanes/rules-*.md` |

New test files: `tests/rules-settings.test.ts`, `rules-input.test.ts`, `rules-safety.test.ts`, `rules-recommend.test.ts`, `rules-boundary.test.ts`. No existing test was edited.

The production-switch test sets `NODE_ENV` to `production`, unset, empty and `staging`. In each case `RULES_ENABLED` is false, and both public functions throw. The switch is on only for `test` and `development`, so it fails closed.

## 3. What the reviewers found, and what was fixed

### Design check (verifier): FAIL, then fixed in `469bbd6`

| # | Finding | Fix |
|---|---|---|
| 1 | The D-12 word check over "every string in every result" would hit trigger values (`prescription`, `dark_mark_fades` matches `fade*`) | The check covers only user-facing text: limit and notice texts, unknown texts, exclusion reasons |
| 2 | The confirmation gate as written would withhold the active from every male user | Reworded: `female_skin_context` counts only when it is asked, or when gender is missing. Tests show a male gets the active |
| 3 | `position` is "order within the slot" in the contract, but the design numbered items across slots | Kept one order key and explained why: an AM_PM item cannot have two ranks, and the order is the same in both slots. Request to main (§6) |
| 4 | The hash covered only the catalogue version, and "exact inputs" was read loosely | The hash now includes a digest of the catalogue's content. The normalised-input reading is a proposed interpretation (§5) |
| 5 | Several user-facing strings were not written in the design | Every limit, notice and exclusion string is quoted in the design |
| 6 | No owner-approval step | Step 1a added (see §1) |
| 7 | The switch did not fail closed when `NODE_ENV` is unset | It is now on only for `test` and `development`, with tests |
| 8 | Two rule ids were not named | The red-flag exclusion uses the first `raisedBy` id; extra caution is `extra_caution` |
| 9 | This lane does not close E05 (the chat pre-filter with EN and Hinglish tests is elsewhere) | Stated in the design §7 and below. The caution sentence and the pregnancy-inference question added to the clinical list |
| 10 | Nothing says where `confirmedThisScan` comes from | Open question §5.3 |
| 11 | TD-13 is cited but has no tracker row | Proposed row (§7) |

### Code check (fresh verifier): FAIL, then fixed in `1b0741f`

| # | Finding | Fix |
|---|---|---|
| 1 | Trimming and lower-casing happened before the validity check, so `"PIGMENT"` counted as valid and could unlock the active | Validity now uses the exact strings. Normalised values are used only to match rules, so a sloppy caution value still counts |
| 2 | Duplicate keys meant four limit strings skipped the word-check test | Each copy constant is listed separately; a count assertion added |
| 3 | The version pin left out the contraindication map, the active and base definitions, and the copy | All are now pinned |
| 4 | Exclusion reasons and limit/notice texts were not compared | Compared against literal design strings, not against `COPY` |
| 5 | Some gate-order branches were untested | Added rows: pregnant with a reused female context; missing answer with no trigger; prescription contraindication; missing gender with a reused female context; male never needs the female context |
| 6 | Catalogue-content hash not tested at the recommender level | Added |
| 7 | A `__proto__` test passed for the wrong reason | Replaced |
| 8 | The import scan missed bare `import "x"` and `require` | Extended, and a test shows the scan sees real imports |
| 9 | No recorded test result or report | This report; `test:local` and build run |
| 10 | Changed files not checked | Checked: only owned files |

### Security review: "can any input make it ignore a red flag?" and "same input, same result?"

**Answer to both, for any data that can come out of JSON or Firestore:**
- No input ignores a red flag. A red-flag value fires whether it is a string or a list, any case or surrounding spaces, next to garbage elements, next to an exclusive "none", stale, or under any gender.
- Under a red flag, only the base routine and the referral line come out.
- The same input always gives the same result: no clock, no randomness, no locale-dependent sorting, no input mutation, and no dependence on key order.

| Severity | Finding | Fix |
|---|---|---|
| Medium (real, latent) | Base and active products were chosen by `category` alone. A schema-valid "moisturiser" with a retinoid would have been selected as base under a red flag or pregnancy. A serum with niacinamide plus a retinoid would have passed as "the active" | Fixed. A base product must have no declared active and no ingredient class in `ACTIVE_CLASSES`. The active must have niacinamide as its only active class. Anything else is excluded as `catalogue.not_in_ruleset`. Tested with both products |
| Low (real) | A wrongly shaped `answers` (a snapshot or wrapper) returned "no red flag" instead of throwing | Fixed: `answers` with none of the rule fields throws |
| Low | `maxSelections` was not enforced | Fixed |
| Low | The hash depends on the catalogue's key order, so a hash change can be a false alarm. Equal hashes still mean equal results | Not changed. It errs safe |
| Info | `confirmedThisScan` is trusted as given | Already an open question (§5.3) |
| Theoretical | In-process tricks: a Proxy or getters, an array with its own `filter`, a huge sparse array, mutating the exported settings arrays. Stored data cannot produce any of them | Not changed. Read the catalogue once so the hash matches what was used. Freezing the settings is left for integration if wanted |

## 4. Clinical list for the reviewer (all PROVISIONAL, version `rules-0-provisional`)

The labels are the quiz text from `lib/skin-check-steps.ts`. The reviewer signs both what triggers a rule and what deliberately does not. Source: `lib/rules/settings.ts`, pinned by `tests/rules-settings.test.ts`.

### 4.1 Red flags: the base routine and the line "What you described is worth showing a dermatologist." only

| Rule id | Field = value (quiz label) |
|---|---|
| `red_flag.deep_painful_breakouts` | `breakout_pattern` includes `deep_painful` ("Deep or painful breakouts") |
| `red_flag.scarring_breakouts` | `breakout_pattern` includes `leaves_scars` ("Breakouts that leave scars or indentations") |
| `red_flag.scar_or_indent` | `pih_scar_tendency` = `scar_or_indent` ("Leaves a scar or indentation") |
| `red_flag.lingering_dark_mark` | `pih_scar_tendency` = `dark_mark_lingers` ("Leaves a dark mark that lingers") |
| `red_flag.irregular_periods_with_breakouts` | `female_skin_context` includes `irregular_periods` ("My periods are irregular") **and** `primary_concerns` includes `blemishes` ("Breakouts") |

**Deliberately not red flags:**
- `breakout_pattern`: `small_bumps` ("Small bumps or clogged pores"), `red_inflamed` ("Red or inflamed pimples"), `leaves_dark_marks` ("Breakouts that leave dark marks").
- `pih_scar_tendency`: `fades_no_trace` ("Fades with no trace"), `dark_mark_fades` ("Leaves a dark mark that fades over time").
- `female_skin_context`: `period_related_breakouts`, `hormonal_contraception`, `menopause`, and `pregnant_or_breastfeeding` (extra caution instead).
- `irregular_periods` without a "Breakouts" concern.

### 4.2 Extra caution: no active, and the line "Ask a doctor before starting anything new."

| Field = value |
|---|
| `female_skin_context` includes `pregnant_or_breastfeeding` ("I'm currently pregnant or breastfeeding") |
| `current_products` includes `prescription` ("A prescription product") |

This is the same list as `lib/gemini.ts` `EXTRA_CAUTION_TRIGGERS`, and a test keeps them equal. The tracker E05 note also asks the reviewer to judge two things:
- The sentence Echo receives: "Extra caution applies to this user. Do not suggest any active ingredients. Advise them to ask a doctor before starting anything new. Never guess at or mention a reason for this."
- Whether the residual pregnancy inference is acceptable. A user who did not tick "prescription" and sees the caution can infer the pregnancy answer. The options are to accept it, to drop the flag, or to drop the trigger.

### 4.3 Constraints and notices

| Rule id | Trigger | Effect |
|---|---|---|
| `constraint.prescriber_routine` | `current_products` includes `prescription` | No active. Limit: "Keep following your prescriber's routine." |
| `notice.pregnancy_actives` | `female_skin_context` includes `pregnant_or_breastfeeding` **and** `current_products` includes `actives` | Notice: "If any of your current products contain a retinoid, check with your doctor while pregnant or breastfeeding." |
| Product contraindications | The catalogue field `contraindications`: `pregnant_or_breastfeeding` matches that quiz answer; `prescription_in_use` matches `current_products` `prescription` | The product is excluded, even from the base routine |

### 4.4 The one conditional active: niacinamide serum

- **Triggered by any of:** `primary_concerns` includes `pigment` ("Dark marks") or `blemishes` ("Breakouts"); `pih_scar_tendency` is `dark_mark_fades` or `dark_mark_lingers`. The last one is also a red flag, so it never reaches the active.
- **Not triggers:** `leaves_dark_marks`, and the concerns `redness`, `texture`, `pores`, `hydration`, `oiliness`.
- **Withheld, in this order:** any red flag; a prescription; extra caution; a re-confirm answer not confirmed on this scan; any missing or unreadable answer; no trigger.
- When it is added, the notice "Add one new product at a time." is shown.

### 4.5 Base routine and what counts as an active

- Cleanser, moisturiser and sunscreen for everyone, including under a red flag.
- A base product declares no active and has none of these ingredient classes: `niacinamide`, `retinoid`, `aha`, `bha`, `vitamin-c`. **The reviewer should confirm this list.**
- The active must be a serum whose only active class is `niacinamide`.

### 4.6 Stale and missing answers

- A reused, unreadable or contradicted answer **can add caution and never remove it.** Red flags, extra caution, the prescriber line and the notices all still apply.
- The active needs `current_products` confirmed on this scan, and `female_skin_context` too when it is asked (D-19).
- A missing or unreadable answer in any field the rules read (`gender`, `primary_concerns`, `breakout_pattern`, `pih_scar_tendency`, `current_products`, `female_skin_context`) withholds the active and is listed under unknowns. It is never guessed.

### 4.7 Not evaluable, never inferred

Mood or distress, non-response to treatment, fulminant acne, and lesion signs (ABCDE) from images. No rule reads images.

## 5. New owner decisions

None of these blocked the build. Each has a provisional default in the code.

1. **Pregnancy and the active.**
   - RECOMMENDATION_MODEL §2 gives pregnancy a notice only. Privacy decision 8 tells Echo "no actives" under extra caution.
   - Options: (a) extra caution withholds the active; (b) pregnancy gives the notice only and niacinamide stays.
   - **Recommendation: (a)**, which is built. Otherwise the recommendation lists a serum while Echo is told to suggest no actives. This is also a question for the clinical reviewer.
2. **Red flag and the prescriber line.**
   - Under a red flag the user sees only the referral line and the base-only limit. The prescriber line is recorded in `fired` but not shown.
   - Options: (a) as built, following RECOMMENDATION_MODEL §4 strictly; (b) also show the prescriber line.
   - **Recommendation: (a)** until the clinical reviewer says otherwise.
3. **Where `confirmedThisScan` comes from at integration.**
   - No stored record says today which steps were confirmed on a scan, and a client claim is not authoritative (D-26).
   - Options: (a) the questionnaire-save route records the step ids answered on this scan, server-side, next to the answers; (b) treat everything as reused, which means no active, ever.
   - **Recommendation: (a)**, as part of the D-10 record task. Until then, an empty list is safe.
4. **`inputSha256` scope** (proposed reading of RECOMMENDATION_MODEL §6, "canonical JSON of the exact inputs").
   - It hashes the ruleset version, the catalogue version, a digest of the catalogue content, and the normalised reading of only the six fields the rules read. Name, phone and other answers are left out.
   - **Recommendation:** accept this. Equal hashes give equal results, and no personal data the rules do not use goes into it.

## 6. Requests to other lanes or to main

1. **Main, contract comment:** `RecommendedItem.position` says "order within the slot". The lane emits one order key per item. Sorting any slot's items by it gives that slot's order, because an AM_PM item cannot carry two ranks. Please confirm this, or change the comment.
2. **Main, contract comment:** `inputSha256` "of the exact inputs" — confirm the reading in §5.4.
3. **Main, at integration:** keep one extra-caution list. Today there are two equal copies, `lib/gemini.ts` (context lane) and `lib/rules/settings.ts`, kept equal by `tests/rules-settings.test.ts`. After the merge, the context builder should take `SafetyState.extraCaution` from `evaluateSafety` and drop its own list.
4. **Main, at integration:** call `recommend` only where `RULES_ENABLED` is true. It throws `RulesDisabledError` otherwise, and the caller should catch that and show nothing, not "no red flag". The same applies to `evaluateSafety`.
5. **Owner, E01:** the synthetic catalogue has no niacinamide serum. Today the active rule can fire, but the result has no item and carries the limit "No matching product is available right now."

## 7. Proposed tracker rows and updates (for main at merge; this lane does not edit the tracker)

| Row | Proposal |
|---|---|
| E02 | Library built and tested on `lane/rules` (`rules-0-provisional`). Still BLOCKED for shipping on E01 (real catalogue) and E05 (sign-off); off in production builds. Evidence: commits below, 143 rules tests, `test:local` green |
| E05 | Quiz red-flag interlock and provisional list built; **not closed**. Remaining: a named clinical reviewer signs §4 (and the extra-caution questions), and the chat red-flag pre-filter with EN and Hinglish tests (GEMINI_BOUNDARY §6, not this lane). Status stays OWNER ACTION |
| New | TD-13 (shared shapes in `lib/contracts/`) is cited in README and the contract headers but has no tracker row. Add it |
| New | Record `confirmedThisScan` server-side at questionnaire save (owner decision §5.3), with the D-10 record task |
| New | Contract comment clarifications for `position` and `inputSha256` (§6.1, §6.2) |
| New | One extra-caution source after integration (§6.3) |
| New | Clinical sign-off flips `REVIEW_STATUS` to `clinically_reviewed` in a reviewed commit with a `RULESET_VERSION` bump; no environment override exists |

## 8. Commits

| Commit | What |
|---|---|
| `b83ce45` | docs(rules): lane design for E02/E05, owner decisions and provisional clinical list |
| `469bbd6` | docs(rules): design fixes from the verifier |
| `8cd98f9` | feat(rules): settings, provisional clinical lists and answer reading (step 2) |
| `619dd7c` | feat(rules): red-flag interlock, evaluateSafety (step 3) |
| `d0a7409` | feat(rules): deterministic recommender and production-switch tests (step 4) |
| `45b6231` | test(rules): import boundary, no clock or randomness (step 5) |
| `1b0741f` | fix(rules): review fixes |
| (this commit) | docs(rules): lane report |

Nothing was pushed.
