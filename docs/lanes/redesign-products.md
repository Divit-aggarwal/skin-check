# Lane C: products and routine setup (06, 14, 15)

Read [redesign-lanes.md](redesign-lanes.md) first. Branch `lane/redesign-products`,
worktree `../skin-check-rd-products`, PORT_BASE 4200.

## Screens

| # | Mockup | Becomes | Route / components |
|---|---|---|---|
| 06 | 06-personalised-routine.png | The routine **setup** on `/routine`: "Add a product" and "Your products" (add, swap, stop) restyled as step cards; the user builds the routine (no recommendation on `/routine`, R-2 B) | `components/routine/RoutinePage.tsx` (the AddProduct and Your-products parts only), `lib/routine/copy.ts` |
| 14 | 14-product-recommendation.png | Echo's product cards (TD-34: chosen by code, own products, store link, no price) restyled to the mockup's card; the step filter chips only if they map to existing data (steps, not concerns: "Acne" is banned) | `components/skin-check/ProductCards.tsx` |
| 15 | 15-product-detail.png | **Product page** from the catalogue: name, step, pack size, how to use and the other fields `lib/catalog` actually has, "Buy on the store" link (Shopify handle). No price (TD-34), no cart, no other users' photos (D-12), no benefit claims beyond whitelisted catalogue claims | **new page** `app/(marketing)/products/[id]/page.tsx` (UI over the static catalogue, no API). Reached from the product cards and "Your products". Owner question for the review: confirm a new page route is fine |

You own: `components/skin-check/ProductCards.tsx`, the AddProduct and Your
products parts of `components/routine/RoutinePage.tsx` (leave the slot switch,
steps, guided mode and Routine Complete as Phase 2 built them),
`app/(marketing)/products/**`, a products copy module, tests for them.
Read-only: `lib/catalog/*`, `lib/context/products.ts`, `lib/rules/*`,
`components/routine/RoutineSteps.tsx`, `RoutineFlow.tsx`, Echo files (lane D:
it renders your cards).

## Data

- Have: six own products (`lib/catalog/catalogue.ts`: name, step, packSize,
  shopifyHandle, `price.mrpInr` (**do not show**), claims whitelist,
  cautions); routine items and events.
- Don't have: product photography (E20; show a neutral tile with the step
  icon, never stock imagery), timings ("30 seconds"), ratings, other users'
  results.

## Locked here

TD-34 (cards from code, no price, no buy button, reason may not claim a
result); TD-29(1) recommendations off outside Echo; R-2 B no product cards on
`/routine`; D-12 no efficacy ("Targets acne…", "Repairs…" only if the exact
claim is in the catalogue whitelist, else drop); TD-45 red-flag dermatologist
panel; E08 names the context screen drops ("Sample Sunscreen SPF 50",
"Clear Seal").

## Tests

`tests/browser/echo-products.spec.ts`, `flows.spec.ts` (routine test),
`tests/echo-products*.test.ts`, `tests/privacy-product-names.test.ts`,
`tests/routine-*.test.ts`, `tests/ui-wording.test.ts`.

## Log

- **Store link wording (locked, TD-50 (g) keeps TD-34).** The brief says "Buy on the store" for 15; TD-34 says no buy button, and the card test and Echo spec ban "buy". Product page and cards both say "See it on the store" (opens a new tab).
- **No price** anywhere (`price.mrpInr` never read by the UI; `packSize` only). No cart, no checkout.
- **No product photos (E20).** Neutral 12px tile with a step icon (`components/products/ProductTile.tsx`); kit request C1 to move it into the kit and let `StepRow` take it.
- **06: no "Use this routine" button and no product picks on `/routine`** (R-2 B, TD-29 (1)): the user builds the routine. No "30 seconds" (no timing data), no benefit lines (D-12; the claims whitelist is empty for all six products).
- **14: no step filter chips.** Echo shows at most one card per step (four), so chips would filter nothing; concern chips ("Acne", "Pigmentation"…) are banned or not data. No "Best for you" tags, no ✓ benefit lists (D-12), no "Based on your latest skin analysis" panel (TD-29 (1), no such source). No "Adjust recommendations".
- **15: dropped from the mockup:** price and Add to Cart (TD-34), "Visible results" before/4w/8w photos (D-12), benefit tiles and "For clearer, calmer…" (D-12, banned words), "Key ingredients" grid with claims (only the one key ingredient we have, no claim), "Recommended for you" panel (TD-29 (1)), three-step how-to pictures (no images; the catalogue's usage text instead).
- **Data gap: step of Active Boba and Clear Seal.** `/routine` takes the step from the catalogue category (`other` → "Other products"); `lib/context/products.ts` `OWN_PRODUCT_INFO` gives them Treat and Spot care. The product page and Echo cards use `OWN_PRODUCT_INFO` (the cards link there); `/routine` is unchanged. Owner to pick one source.
- **Data gap: product description.** `OWN_PRODUCT_INFO.description` is marked "awaits owner approval" and is not on any screen; the product page does not show it. Once approved it is the natural subtitle under the name.
- **Cautions** come from the catalogue `warnings` (three products have them), shown as "Cautions". "Before you use it" was rejected by the wording scan (CHANGE lexicon: "before").
- Out-of-stock product (Active Boba) still has a page (a user may have it in their routine) with "Out of stock on the store right now." and the store link; a discontinued one would get no link.
- Browser-test edits (add-only): `tests/browser/echo-products.spec.ts` (each card has a Product details link to `/products/<id>`), `tests/browser/flows.spec.ts` (routine test: the added product's card links to its product page). `tests/ui-wording.test.ts`: `components/products` and `app/(marketing)/products` added to `DIRS`.

## Hand-back
