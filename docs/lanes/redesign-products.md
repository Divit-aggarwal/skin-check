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

### Changelog

| File | Change |
|---|---|
| `components/skin-check/ProductCards.tsx` | 14: card = neutral step tile, step tag, name, key ingredient, how to use, Echo's note (12px well), "Product details" link to `/products/<id>`, store link. 16px card, no 20px corners. Same region, list items, heading and store link as before |
| `app/(marketing)/products/[id]/page.tsx` (new), `components/products/ProductDetail.tsx` (new) | 15: product page for the six own products (static params, `dynamicParams = false`, unknown id 404, own metadata description). Step, name, pack size, when to use, key ingredient, out-of-stock line, how to use, cautions, "See it on the store" (new tab). Body is a client module because `components/ui/page.tsx` class strings are client exports |
| `components/products/copy.ts`, `ProductTile.tsx` (new) | Products copy module; neutral step tile and `productHref` (E20, kit request C1) |
| `components/routine/RoutinePage.tsx`, `lib/routine/copy.ts` | 06: "Your products" first, as step cards in step order (tile, step, name, slot tag, days or "Every day", since, chevron to the product page for our products, Change or stop under a rule); "Add a product" with an icon header, one intro line, the chosen step's tile beside the Step select. Slot switch, steps, guided mode and Routine Complete untouched. Copy: `everyDay`, `addIntro` added |
| `tests/redesign-products.test.ts` (new) | Page per product, 404, no price/cart/buy/₹/MRP number/unapproved description/img, store link only when sold, out-of-stock line, own metadata, products copy word check, card links |
| `tests/ui-wording.test.ts` | Add-only: `components/products`, `app/(marketing)/products` in `DIRS` |
| `tests/browser/echo-products.spec.ts`, `tests/browser/flows.spec.ts` | Add-only assertions (see Log) |
| `tests/design/redesign-products.shots.ts` (new) | 375px shots into `docs/design/redesign/products/` |

### Screenshots (375px), `docs/design/redesign/products/`

`compare-06-routine-setup.png`, `compare-14-product-cards.png`, `compare-15-product-detail.png` (mockup left, app right); full pages `06-routine-setup`, `14-product-cards`, `15-product-detail`, `15-product-out-of-stock`; first-screen views `*-view.png`, `06-routine-add-view.png`.

### Deviations

See the Log: store link says "See it on the store", not "Buy on the store" (TD-34 kept by TD-50 (g)); no price, cart, photos, timings, benefit lines, "Use this routine", recommendation panels, filter chips, before/after or ingredient claims. On `/routine`, "Your products" now comes before the add form on phones (the setup cards lead, as in the mockup).

### Flags

None (no backend gap needs a disabled control).

### Open questions for the owner

1. Is a new page route `/products/[id]` acceptable for screen 15? (Static catalogue, no API, reachable signed out.)
2. One step source for Active Boba and Clear Seal: catalogue category ("Other products" on `/routine`) or `OWN_PRODUCT_INFO` (Treat / Spot care on the cards and product page)?
3. Approve `OWN_PRODUCT_INFO.description` for display? It would be the subtitle under the name on 15 and 14.
4. Kit request C1 (product tile in the kit, `StepRow` taking it).

### Tests

- Baseline before changes: `npx tsc --noEmit && npx vitest run`: 2367 passed, 85 skipped.
- Final: `npx tsc --noEmit` clean; `npm run lint` no errors (3 existing `<img>` warnings elsewhere); `npx vitest run`: 109 files passed, 18 skipped; 2373 passed, 85 skipped.
- Browser: `PW_ARGS="tests/browser/echo-products.spec.ts tests/browser/flows.spec.ts" bash scripts/with-stack-slot.sh npm run test:browser`: 28 passed (5.6 min). Run before the ProductDetail client split; that change is presentation only and the cards and `/routine` were unchanged by it.
- Shots: `PW_ARGS="-c tests/design/playwright.config.ts tests/design/redesign-products.shots.ts --project=390" bash scripts/with-stack-slot.sh npm run test:browser`: 3 passed.
