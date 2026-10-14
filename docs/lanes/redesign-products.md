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

## Hand-back
