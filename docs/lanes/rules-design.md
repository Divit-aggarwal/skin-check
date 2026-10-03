# Rules lane design (E02, E05)

Branch `lane/rules`. Brief: [rules.md](rules.md). Shapes: `lib/contracts/recommendation-result.ts`, `lib/contracts/safety-state.ts` (read only).

## 1. Owner decisions recorded (2026-10-04)

| # | Decision |
|---|---|
| OD-1 | **D-08 approved.** Rules are plain TypeScript: pure functions plus version constants. No rules engine. |
| OD-2 | **D-09 approved.** Selection uses self-reported quiz answers only, never image readings (bands, scores, SkinState). |
| OD-3 | **Library only.** No product cards, no routes, no saved recommendation record (the D-10 record at questionnaire save is a later task). |
| OD-4 | **No clinical reviewer is named yet.** Every clinical list is a named setting marked provisional (`reviewStatus: "provisional"`). The feature is off in production builds, and a test proves it. |

## 2. What is built

Four files in `lib/rules/`, no new dependencies, no edits outside `lib/rules/**` and `tests/rules-*.test.ts`.

| File | Contents |
|---|---|
| `lib/rules/settings.ts` | `RULESET_VERSION`, `REVIEW_STATUS`, `RULES_ENABLED` (the production switch), every clinical list (§5), and every user-facing string as a constant. The only file that reads `process.env`. |
| `lib/rules/input.ts` | `RulesInput` type, `readInput()`: turns raw answers into one reading per field the rules use (values, present, valid, fresh, asked). `inputSha256()`. |
| `lib/rules/safety.ts` | `evaluateSafety(input): SafetyState` (E05). |
| `lib/rules/recommend.ts` | `recommend(input, catalogue): RecommendationResult` (E02). Calls `evaluateSafety` itself. |

`lib/catalog/**` is not changed. Tests use a fixture catalogue parsed through `CatalogueSchema`, and one test runs against the real synthetic `CATALOGUE`.

## 3. Data shapes

### 3.1 Input

```ts
type RawAnswer = unknown;                       // as stored; never trusted
interface RulesInput {
  answers: Record<string, RawAnswer>;           // the saved questionnaire
  confirmedThisScan: readonly string[];         // step ids answered or re-confirmed on this scan
}
```

- **Freshness is opt-in.** A field not listed in `confirmedThisScan` counts as reused (`fresh: false`). A caller who forgets the list gets the cautious result.
- **Fields the rules read** (`RULE_INPUT_FIELDS`): `gender`, `primary_concerns`, `breakout_pattern`, `pih_scar_tendency`, `current_products`, `female_skin_context`. Nothing else is read, and nothing else goes into the hash.
- **Normalisation (`readInput`)**, per field:
  - Own properties only (`Object.hasOwn`); `__proto__` and inherited keys are never read.
  - A string becomes a one-item list. Non-string elements are dropped and make the field invalid.
  - `present`: at least one string value. An empty list or blank string is "not answered" (same as `isStepAnswerValid`).
  - `valid`: present, every value is an option of that step in `SECTIONS`, a single-select step has exactly one value, and an exclusive value (`none`, `none_not_sure`) is not combined with another.
  - `asked`: the step's `condition` from `SECTIONS` (only `female_skin_context` has one: gender is female).
  - `fresh`: listed in `confirmedThisScan`.
  - `answers` that is null or not an object throws. It never returns `redFlag: false`.

### 3.2 Output

Exactly the contract shapes. `RecommendationResult.safety` is the `SafetyState` that `recommend` computed itself, so a red flag and the selection cannot disagree.

## 4. Evaluation rules

**The core safety principle:** a stale, invalid or contradictory answer can add caution, never remove it.

- Any known caution value present in a field fires its rule, even if the field is reused, invalid, or contradicted by an exclusive value. The trigger records `fresh: false` when reused.
- Red-flag evaluation **never** checks gender or `step.condition`. `irregular_periods` with `gender: "male"` still raises the flag. `asked` is used only to decide whether a missing field is "not asked" or "unknown".

### 4.1 `evaluateSafety`

1. If `RULES_ENABLED` is false, throw.
2. `redFlag`: each rule in `RED_FLAG_RULES` fires when all its conditions match. `raisedBy` lists the fired rule ids in list order.
3. `extraCaution`: any condition in `EXTRA_CAUTION_TRIGGERS` matches.

### 4.2 `recommend` (order is fixed)

1. If `RULES_ENABLED` is false, throw.
2. `safety = evaluateSafety(input)`.
3. **Unknowns.** For each rule input field that is asked (or whose asking cannot be decided because `gender` is missing): not present → "Not answered."; present but invalid → "Could not be read."; a re-confirm field (`RECONFIRM_EACH_SCAN_IDS`, imported from `lib/skin-check-validation.ts`) that is present but not fresh → "Not confirmed on this check." Never guessed.
4. **Fired rules** (audit, in this order): red-flag rules, extra-caution triggers, `constraint.prescriber_routine`, `notice.pregnancy_actives`, `active.niacinamide` (when its trigger matched), `base.routine` (always, no triggers).
5. **Catalogue pass**, every product in catalogue order, first matching reason wins:
   1. `availability` is not `available` → excluded `catalogue.unavailable`.
   2. A product contraindication matches an answer (`pregnant_or_breastfeeding` ↔ `female_skin_context`, `prescription_in_use` ↔ `current_products` `prescription`) → excluded `catalogue.contraindicated`.
   3. Base category (`cleanser`, `moisturiser`, `sunscreen`): first eligible product of the category is selected by `base.routine`; any later one → excluded `base.one_per_step`.
   4. The active (`category: "serum"` with ingredient class `niacinamide`): first eligible one is selected by `active.niacinamide` only if every gate passes, checked in this order, first failure is the exclusion reason:
      - `red_flag.*` (any red flag),
      - `constraint.prescriber_routine` (`current_products` has `prescription`),
      - `extra_caution` (the flag is on),
      - `active.needs_confirmation` (a re-confirm field is reused, or `female_skin_context` is asked and reused),
      - `active.needs_answers` (any rule input field is in `unknowns`),
      - `active.not_triggered` (no active trigger matched).
      A later eligible serum → `active.one_only`.
   5. Anything else → excluded `catalogue.not_in_ruleset`.
6. **Limits.**
   - Red flag: `red_flag.base_routine_only` only.
   - Otherwise, in order: `constraint.prescriber_routine` ("Keep following your prescriber's routine."), `extra_caution` ("Ask a doctor before starting anything new."), `active.needs_confirmation`, `active.needs_answers`, and `catalogue.gap` for each base category, or a triggered active, with no eligible product.
7. **Notices.**
   - Red flag: only `red_flag.referral` ("What you described is worth showing a dermatologist.").
   - Otherwise: `notice.pregnancy_actives` when it fired, and `notice.one_at_a_time` ("Add one new product at a time.") when an active is selected.
8. **Positions.** Selected items are sorted by the convention cleanser → serum → moisturiser → sunscreen and numbered from 1 (RECOMMENDATION_MODEL §2 step 5; a convention). The slot is the product's own slot.
9. `inputSha256` = SHA-256 of canonical JSON of `{rulesetVersion, catalogVersion, fields}`, where `fields` is each rule input field's normalised reading (sorted values, present, valid, fresh). Name, phone and every other answer are left out. Equal hashes imply equal results.

**Invariant:** every catalogue product is in exactly one of `items` or `excluded`.

## 5. Clinical list for the reviewer (all PROVISIONAL, `rules-0-provisional`)

Labels are the quiz text from `lib/skin-check-steps.ts`. The reviewer signs both what triggers and what deliberately does not.

### 5.1 Red flags (`RED_FLAG_RULES`): base routine plus referral line only

| Rule id | Field = value (quiz label) | Effect |
|---|---|---|
| `red_flag.deep_painful_breakouts` | `breakout_pattern` includes `deep_painful` ("Deep or painful breakouts") | Red flag |
| `red_flag.scarring_breakouts` | `breakout_pattern` includes `leaves_scars` ("Breakouts that leave scars or indentations") | Red flag |
| `red_flag.scar_or_indent` | `pih_scar_tendency` = `scar_or_indent` ("Leaves a scar or indentation") | Red flag |
| `red_flag.lingering_dark_mark` | `pih_scar_tendency` = `dark_mark_lingers` ("Leaves a dark mark that lingers") | Red flag |
| `red_flag.irregular_periods_with_breakouts` | `female_skin_context` includes `irregular_periods` ("My periods are irregular") **and** `primary_concerns` includes `blemishes` ("Breakouts") | Red flag |

**Deliberately not red flags:** `breakout_pattern` `small_bumps`, `red_inflamed`, `leaves_dark_marks`; `pih_scar_tendency` `fades_no_trace`, `dark_mark_fades`; `female_skin_context` `period_related_breakouts`, `hormonal_contraception`, `menopause`, `pregnant_or_breastfeeding` (extra caution instead); `irregular_periods` without a "Breakouts" concern.

### 5.2 Extra caution (`EXTRA_CAUTION_TRIGGERS`): no active, "Ask a doctor before starting anything new."

| Field = value | Note |
|---|---|
| `female_skin_context` includes `pregnant_or_breastfeeding` | Same list as `lib/gemini.ts` (privacy decision 8); a test keeps them equal |
| `current_products` includes `prescription` | Same |

### 5.3 Constraints and notices

| Rule id | Trigger | Effect |
|---|---|---|
| `constraint.prescriber_routine` | `current_products` includes `prescription` | No active; limit "Keep following your prescriber's routine." |
| `notice.pregnancy_actives` | `female_skin_context` includes `pregnant_or_breastfeeding` **and** `current_products` includes `actives` | Notice "If any of your current products contain a retinoid, check with your doctor while pregnant or breastfeeding." |
| Product contraindications | The catalogue's own `contraindications` field | Product excluded |

### 5.4 The one conditional active (`ACTIVE_TRIGGERS`)

Niacinamide serum, when any of: `primary_concerns` includes `pigment` ("Dark marks") or `blemishes` ("Breakouts"); `pih_scar_tendency` is `dark_mark_fades` or `dark_mark_lingers` (the latter is also a red flag, so it never reaches the active). Not triggers: `leaves_dark_marks`, `redness`, `texture`, `pores`, `hydration`, `oiliness`.

### 5.5 Base routine (`BASE_CATEGORIES`)

Cleanser, moisturiser, sunscreen for everyone, including under a red flag.

### 5.6 Stale and missing answers

- A reused answer can add caution (red flag, extra caution, prescriber limit, notices). It can never allow an active: the active needs `current_products` confirmed on this scan, and `female_skin_context` too when it is asked (D-19).
- A missing or unreadable answer in any rule input field withholds the active and is listed in `unknowns`.

### 5.7 Not evaluable, never inferred

Mood or distress, non-response to treatment, fulminant acne, lesion signs (ABCDE) from images. No rule reads images.

## 6. Tests (all `tests/rules-*.test.ts`)

| File | What it proves | Failure cases included |
|---|---|---|
| `rules-settings.test.ts` | Switch is off with `NODE_ENV=production` and on in `test` and `development` (`vi.stubEnv` + `vi.resetModules` + dynamic import); both public functions throw in production. Every trigger value exists as an option of its step in `SECTIONS`. Clinical lists pinned with `RULESET_VERSION`. Extra-caution list equals `lib/gemini.ts`. Every copy constant passes `bannedWordsIn`. | Renamed quiz value; list edit without updating the pin |
| `rules-input.test.ts` | Normalisation: string vs list, non-strings, unknown values, exclusive conflicts, empty list, `__proto__`, inherited keys, null input throws. Hash ignores name, phone and array order; pinned hex value. | Garbage elements, prototype keys |
| `rules-safety.test.ts` | Each red-flag criterion: the answer that raises it and the answer just outside it. Gender bypass (`male` + `irregular_periods` + `blemishes` still flags). Reused and invalid fields still raise flags. Extra caution on/off. | Exclusive `none_not_sure` combined with `irregular_periods` still flags |
| `rules-recommend.test.ts` | Table of answer sets → fired rules, triggers (with `fresh`), items and positions, limits, notices, unknowns, exclusions with reasons. A red flag gives base routine plus referral only, whatever else is true. Prescription removes the active and adds the prescriber limit. Missing answers appear in `unknowns`. `result.safety` deep-equals `evaluateSafety(input)`. Every product is in items or excluded. Real `CATALOGUE` (no serum): active fires, `catalogue.gap` limit. Determinism: shuffled keys and arrays, repeated calls give identical output. D-12 word check over every string in every result. | Stale `current_products` without prescription withholds the active |
| `rules-boundary.test.ts` | No file in `lib/rules/` imports `skin-check-rules`, `skin-check-skus`, `skin-state*`, `comparability`, `gemini`, routine modules, scan types or `lib/contracts` beyond the two rules shapes; no `Date`, `Math.random` or `process.env` outside `settings.ts`. | |

## 7. Not built

- Product cards, routes, UI (OD-3, R-2 B).
- The saved recommendation record at questionnaire save (D-10; later task).
- Real catalogue data and a niacinamide serum product (E01). With today's synthetic catalogue the active can fire but has no product: the result carries a `catalogue.gap` limit.
- Clinical sign-off (E05). `REVIEW_STATUS` stays `"provisional"`. Turning on in production is a code change to that constant after sign-off, never an environment variable.
- Wiring into the context builder or Echo (main-session integration step).
- Any change to `lib/gemini.ts`, `lib/contracts/**`, `lib/catalog/**`, the tracker or DECISION_LOG.

## 8. Steps

| Step | Deliverable | Needs a new owner decision? |
|---|---|---|
| 1 | This design, committed, checked by the verifier | No |
| 2 | `settings.ts`, `input.ts` + `rules-settings`, `rules-input` tests | No |
| 3 | `safety.ts` + `rules-safety` tests | No |
| 4 | `recommend.ts` + `rules-recommend` tests | No |
| 5 | `rules-boundary` test | No |
| 6 | Review (verifier, security reviewer), fixes, `npm run test:local` and `npm run build`, `rules-report.md` | No |

## 9. Open questions (do not block the build; provisional defaults chosen)

1. **Pregnancy and the active.** RECOMMENDATION_MODEL §2 gives only a notice for pregnancy; privacy decision 8 tells Echo "no actives" under extra caution. Default: extra caution withholds the active, so the recommendation and Echo agree.
2. **Red flag and the prescriber line.** Under a red flag the only notice is the referral line and the only limit is base-routine-only; the prescriber limit is still in `fired` for audit but not shown. Default: follow RECOMMENDATION_MODEL §4 strictly.
3. **Stale answers.** Default as in §5.6.
