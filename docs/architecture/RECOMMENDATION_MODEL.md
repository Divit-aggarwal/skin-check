# RECOMMENDATION_MODEL — deterministic, quiz-keyed, auditable

Status: PLANNING. **Product decision pending (OPEN-R1):** the SKU list was removed from the dashboard in commit e232b38. Today the app shows no product recommendation, and `SKU_DISPLAY` is dead code. Echo's free-text chat is the de-facto recommender, and nothing grounds it in the product catalogue. This document specifies what ships *if* recommendations return, and constrains Echo either way.

## 1. Current implementation (lib/skin-check-rules.ts)

- `runSkinCheckRules(result)` is a pure function. Its only input is the image `scores`; quiz answers are never read.
- It bands each metric with cut points at 0.20 and 0.45, then applies 4 rules over 4 placeholder SKUs:
  - sunscreen: always selected
  - niacinamide: if pigment or blemishes is not Low
  - cleanser: if oiliness is not Low
  - moisturiser: if hydration or texture is not Low
- It produces a `rule_trace` and `SCORING_VERSION`. Neither is persisted.
- No eligibility or safety constraint exists, even though pregnancy, prescription use and scarring answers are collected (lib/skin-check-steps.ts:236-245 says "collected for whenever that gate is built").
- Shopify handles are guesses (lib/skin-check-skus.ts:17-23).

**Why this must change:** the bands come from per-image-relative scores. Which SKUs fire depends on how contrast spreads across that particular photo, not on the person's skin. A repeat scan of the same face can flip the set. Selecting products from that signal is selecting from noise.

## 2. Target model

**Paradigm:** constraint-based selection, written as plain TypeScript.
- One pure function: `recommend(answers, catalog) → {items, firedRules, redFlags, notices}`.
- Version constants: `RULESET_VERSION` and `CATALOG_VERSION`.
- **No rules engine and no DMN** (DECISION D-08). There are 4 SKUs and about 6 rules. An interpreter would add a dependency, lose type checking, and add a second language to review. Revisit when non-engineers must author rules or the catalog exceeds about 20 SKUs.

**Evaluation order (explicit; this gives the same guarantee as a hit policy):**
1. **Red-flag gate.** From quiz answers only (§4). If it fires: base routine only, show the referral line, and record `redFlags`.
2. **Hard constraints.**
   - `current_products` includes `prescription`: drop actives, and show "keep following your prescriber's routine".
   - `pregnant_or_breastfeeding` together with `actives`: show a static notice ("If any of your current products contain a retinoid, check with your doctor while pregnant or breastfeeding"). Nothing in our catalog is contraindicated. That is an ASSUMPTION until the real INCI lists are entered.
3. **Base routine** for everyone: cleanser, moisturiser, sunscreen (the sunscreen cannot be removed). PRACT-India rates cleanser plus non-comedogenic moisturiser scaffolding at 100% consensus.
4. **One conditional active.** Add niacinamide 5% if `primary_concerns` includes pigment or blemishes, or `pih_scar_tendency` starts with `dark_mark`, and no red flag or prescription applies.
5. **Order (convention, labelled as such):** AM is cleanser → serum → moisturiser → sunscreen (sunscreen last). PM is cleanser → serum → moisturiser.
6. **Irritation budget copy:** "Add one new product at a time." No blocking.

Image bands are **not** inputs to selection. They stay on the "What we read" display only.

## 3. Catalog (static, versioned, in git)

File: `lib/catalog.ts`. A pull request is the review, the type-checker is the validator, and the deploy is the release.

```
Product { id, versionId, shopifyHandle (verified), name,
          slot: "AM"|"PM"|"AM_PM", ingredientClasses: string[],
          activeConcentrationPct?, inci?: string[], warnings: string[],
          claims: { text, evidenceLevel: "product-test"|"consumer-perception"|"ingredient+concentration",
                    source, date }[] }
```

- `versionId` changes only when the GS1 rule 263 two-condition test is met: the formulation change alters declared packaging information, *and* consumers are expected to distinguish the new version. Any other edit is a data revision tracked by git.
- The UI renders only `claims[].text`. That makes the claims list a whitelist.
- Deferred until scale: an ingredient master with CAS/ChEBI identifiers and per-jurisdiction status.

## 4. Red-flag interlock (deterministic, quiz-only)

| Trigger | Field and value |
|---|---|
| Nodulo-cystic proxy | `breakout_pattern` includes `deep_painful` |
| Scarring | `breakout_pattern` includes `leaves_scars`, or `pih_scar_tendency = scar_or_indent` |
| Persistent pigmentary change | `pih_scar_tendency = dark_mark_lingers` |
| Possible hormonal pattern | `female_skin_context` includes `irregular_periods`, together with a blemish concern |
| Under care (constraint, not a flag) | `current_products` includes `prescription` |

- **Not evaluable, and never inferred from images:** mood or distress, non-response to treatment, fulminant acne, ABCDE lesion signs. Scoring lesion risk from an image is a device function.
- **Behaviour:** one static line ("What you described is worth showing a dermatologist."), the base routine only, and `redFlags[]` recorded on the Recommendation record. No urgency tiers and no scoring.
- **Stale answers (D8):** pregnancy and current products are reused silently on repeat scans. `female_skin_context` and `current_products` join the per-scan set as a one-tap "still true?" confirmation. This is a hard requirement before any recommendation ships.

## 5. Claims compliance

**Basis:**
- India's D&C Act s.3(aaa) limits a cosmetic to "cleansing, beautifying, promoting attractiveness or altering the appearance".
- The ASCI Code requires substantiation (1.1), source and date for cited evidence (1.2), and no misleading implication (1.4).

Current copy that must not ship unchanged:

| Location | Wording | Issue |
|---|---|---|
| skus.ts:64 | "Targets uneven tone and post-breakout marks" | Efficacy, and links the product to acne/PIH. Use "Helps even the look of skin tone", and only with a ClaimEvidence entry |
| skus.ts:76 | "Restores moisture and softens rough texture" | Use "Moisturises; leaves skin feeling softer" |
| skus.ts:70 | "without stripping" | Needs a test |
| product name | "PA++++" | Needs UVA/PPD test evidence. Legal review |
| (removed UI) | `rule.detail` shown as the reason, e.g. "Pigment or blemish concern at Moderate" | Pairs a product with a detected condition from an uncalibrated score, which is misleading by implication. Reasons must be self-reported: "Because you said dark marks are a concern" |
| steps.ts:249 | "helps us personalize your skin recommendations" | Untrue today. That is a DPDP purpose-limitation issue. Either use the field or change the copy |

## 6. Audit record

Stored as an immutable `users/{uid}/recommendations/{recommendationId}` doc, written server-side **at questionnaire save** rather than at scan time, because the answers do not exist yet when the scan runs (DATA_MODEL.md):

```
recommendation: { rulesetVersion, catalogVersion, inputSha256 (canonical JSON of the exact inputs),
                  firedRules: string[], redFlags: string[], notices: string[],
                  items: { productId, versionId, slot, position }[] }
```

- This is written server-side and is reproducible from git + version + inputs.
- "Accepted" is not stored as an event. Shopify links carry an opaque `recommendationId`, never `scanId`: a scan id must not leak to Shopify or its third-party pixels.
  - That join must never be presented as an outcome ("users who bought X improved"). See the attribution ban in GEMINI_BOUNDARY.md.

## 7. Echo constraint (applies whether or not cards ship)

- Gemini may mention only products present as `rec.*` facts in the ContextPackage, using only the whitelisted claim text.
- It may not name other products or actives, suggest a dose or frequency outside the catalog's usage text, or say a product is "working" or "not working".

## 8. Deterministic now vs ML later

| Now (deterministic) | Later (needs data first) | Don't |
|---|---|---|
| Quiz-keyed selection, red flags, constraints, ordering | Ranking within a larger catalog (needs order and click logs with shown sets and positions) | Collaborative filtering, "users like you" |
| Static catalog with claim whitelist | Interaction tables over ingredient classes, if acids or retinoids enter the catalog | LLM-selected products |
| — | "Irritation reported" event, if irritant actives are added | Adherence logging for attribution |
| — | Expected-effect windows ("too early") | DMN / json-rules-engine at 4 SKUs |

Routine, ProductUse and Adherence collections are **LATER**. Attribution is banned (CLAUDE.md), and reorder timing comes from Shopify. Phase 1 has no legitimate consumer for adherence data, so collecting it would be a purpose-limitation problem.
