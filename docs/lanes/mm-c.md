# Agent C: products (06, 14, 15, 16)

Read `docs/lanes/mm-README.md` first. Data: `lib/store/products.ts` (`storeProducts`, `storeProduct`; server only, 10-minute cache) with `lib/feature-contracts/store-products.ts` (`cartUrl`, `productUrl`). Kit: `PriceBlock`. Readings: `lib/readings/series.ts` `sinceStarted`. Product start dates: routine events (`lib/routine/events.ts` `currentRoutine` → `since`).

## Build
**06 Personalised routine** (`components/routine/RoutineFlow.tsx` setup)
- Match the mockup, with store photos (next/image) in place of the step-icon tiles.
- Keep the step icon as the fallback when the store cannot be read.

**14 Echo product cards** (`components/skin-check/ProductCards.tsx`)
- Store photo, live price (`PriceBlock`).
- Add to Cart only with `cartUi()`: a link to `cartUrl(variantId)`. Otherwise "View in store" (`productUrl`).
- Out of stock: a disabled "Out of stock" button.
- No store description here.

**15 Product detail** (`components/products/ProductDetail.tsx`, `app/(marketing)/products/[id]`)
- Store image gallery, `PriceBlock`, and Add to Cart with the cart flag and the out-of-stock rule.
- The store's description (`descriptionHtml`, already sanitised) in a section headed "From the store". This is the only place it shows.
- How to use and the step, from the catalogue, as today.
- The "results from similar users" block is removed (data rule 2).
- Unknown id stays a 404 (`echo-products.spec.ts`).

**16 Since you started** (new: `app/(marketing)/products/[id]/since/page.tsx`, `components/products/SinceStarted.tsx`)
- Product chips: the products the user has started (routine), store photos.
- Header: product name and "Started on <date>".
- No claim tags.
- Readings since then: the level word per reading plus a `ChangeSlot`, and a `LevelTimeline` per reading.
- "Your photos" (own photos since the start, `PhotoStrip`).
- Title per TD-53: "Since you started <name>". Never "Product Response", "Overall response", "How it's working", "Key insight", or Improving pills.
- No product started: an empty state that links to /routine.
- Linked from 15 when the user has started that product.

## Tests
- Unit tests: price and was-price rendering, the cart flag on and off, out of stock, `bannedWordsIn` over the new copy (the store description is exempt on 15 only), and the 16 empty state.
- Browser specs for 15 (signed out, known id) and 16 (seeded user with a routine and checks: `scripts/seed-mm-c.ts`).
- The local stack cannot reach the store. Give `storeProducts()` the saved feed (`tests/fixtures/store-products-2026-10-15.json`) when `STORE_LOCAL_FEED` is set. Request it in kit-requests if you need `lib/store/products.ts` changed.
- Overlay shots.

## Log

## Hand-back
