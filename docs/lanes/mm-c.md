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
- Base: `npx tsc --noEmit` failed on `tests/store-products.test.ts` (old `@/lib/contracts` path). Fixed locally, then dropped in the rebase onto build/mockup-match (d1c2af3 has the same fix).
- `scripts/local-stack.sh` runs `seed-lane-*.ts` only, so `scripts/seed-mm-c.ts` is called from the spec and the match file in `beforeAll` (C-mm-3).
- `lib/store/products.ts` has no `STORE_LOCAL_FEED` yet (C-mm-1): on the stack, next dev reads the live store (public, no key). Unit tests use the saved feed through a mock.
- "since you started" is in `BANNED_WORDS` and "since" in the CHANGE lexicon: only the title template and the route are waived, in the tests (C-mm-2). Other copy avoids "since" and "over time".
- 14 runs inside Echo (EchoPage, lane D) and 06 inside RoutinePage (lane D's 03). To keep out of D's files and keep the store description server-only, the browser reads store price, stock and photos from a new public route `/api/store/products` (cached 10 minutes, description dropped by an explicit field list). 15 reads `storeProduct()` on the server.
- Orchestrator follow-up (H36, after BE1): `/echo` and `/dashboard` pass `productsOn && personalisation` through `components/products/PersonalisedProducts.tsx` (GET /api/account/consents; loading, signed out or any failure = products off; Echo itself unchanged).
- Red after the change, filed as C-mm-4 (add-only specs): `echo-products.spec.ts` opening test at 390/768/1280 (expects the TD-34 "See it on the store" link and no price on cards) and `flows.spec.ts` routine test (`main img` count 0; the 06 store photos are product photos).

## Hand-back
**Commits** (on build/mockup-match ab7cf34): 395bdf9 build of 06/14/15/16 + store route; 17e2c58 seed, spec, match shots; 723def8 seriesChecks reads side photos (C10); 96f0714 15 hero photo, stock line, C-mm-4; 5c537db overlay tweaks; 454b193 + 99206bf H36 personalisation gate; 29f64de 15 small-phone title; last: lane ready.

**Changelog**
- New: `app/api/store/products/route.ts`, `components/products/{useStoreProducts.ts,ProductPhoto.tsx,StoreAction.tsx,SinceStarted.tsx,PersonalisedProducts.tsx}`, `app/(marketing)/products/[id]/since/page.tsx`, `scripts/seed-mm-c.ts`, `tests/mm-c-products.test.ts`, `tests/browser/mm-c.spec.ts`, `tests/design/c.match.ts`.
- 06 (`RoutinePage.tsx`, "Your products" cards only): step number, store photo (step tile fallback).
- 14 (`ProductCards.tsx`): store photo column, `PriceBlock`, one `StoreAction` (Add to cart with `cartUi()`, else View in store; out of stock = disabled button); store not read = step tile + old store link, no price. No description.
- 15 (`ProductDetail.tsx`, page now async): first store photo beside the title, the rest as a sideways gallery, price bar (sticky above the bottom bar), store action, "From the store" with the sanitised description (only here), catalogue facts/how to use/cautions as before, link to 16 when the product is in the user's routine. Store not read = page as before.
- 16: title "Since you started <name>", intro, started-product chips (store photos), product card with "Started on <date>", per reading `MetricTile` (latest level word, early-estimate tag) + `ChangeSlot` (all "Needs more checks"), `LevelTimeline` per reading, own kept photos (`PhotoStrip` via /api/checks/photo). Empty: no product started → /routine; product not in routine → says so with chips; no checks yet → link to a check. Loading, error, signed-out states.
- Shared-ish edits: `components/dashboard/state.ts` + `seriesChecks()` (appended; lane A may add the same), `lib/routine/events.ts` + `startedProducts()`.

**Overlay mean difference** (393, final run): see table below.
| Shot | Mean diff |
|---|---|
| 06-products | 28.5 |
| 14-cards | 28.5 |
| 15-detail (sunscreen, in stock) | 43.3 |
| 15-out-of-stock (Boba, the mockup's product) | 36.8 |
| 16-since | 33.1 |
| 16-timelines | 29.4 |
Remaining differences, all allowed: iOS status bar; bottom bar until integration; real names ("Active Boba Encapsulated Cream", "5% Niacinamide Serum") and real store photos/prices in place of sample data; 06 is a scrolled shot of the "Your products" section (the mockup's header, Morning/Evening control and "Use this routine" are lane D's 03 part; no "30 seconds" or benefit line, the catalogue has neither; "Change or stop" stays); 14 lives inside Echo (no page title, "Based on your latest skin analysis", filter chips, "Best for you"/claim tags and check lists removed: no claims, Gemini is not the source); 15 drops claim chips, "Recommended for you", "Visible results" (rule 2), benefit icons, ingredient tiles and how-to photos (no data), adds catalogue facts and "From the store"; 16 drops "Last 8 weeks", claim tags, "Overall response Positive", percentages/arrows/bars, "How it's working", "Key insight" (rules 3, 4), and shows tiles in 2 columns (5 readings) plus one timeline per reading.

**Flags**: `cartUi()` (NEXT_PUBLIC_UI_CART) for Add to cart. No new flag.

**Kit requests**: C-mm-1 (STORE_LOCAL_FEED, and an open question about CDN images on the stack), C-mm-2 (TD-53 title exception in wording.ts), C-mm-3 (stack runs seed-mm-*.ts), C-mm-4 (stale TD-34/E20 lines in echo-products.spec.ts and flows.spec.ts).

**Assets**: none downloaded. Product photos are the store's own images from cdn.shopify.com (`/s/files/1/1006/6100/2611/**`, already in next.config remotePatterns), source theprojectskin.com/products.json, owned by the brand; ASSETS.md row: "store product photos | cdn.shopify.com via products.json | owner's store | 06, 14, 15, 16 product images". The 16 seed photo reuses `tests/browser/fixtures/kept-photo.jpg` (synthetic).

**Test edits**: `tests/redesign-products.test.ts` (async page, store and routine mocked, `sinceTitle` left out of the word loop); `tests/ui-wording.test.ts` (`TD53_EXACT`: two exact literals); `tests/echo-switch-and-limit.test.ts` (/echo renders `EchoWithConsent`, which passes `echoOn` through). No browser spec edited. `tests/design/redesign-products.shots.ts` (old, not in test:browser) still expects the store link on 15.

**Open questions**: (1) the new public route `/api/store/products` is an architecture choice to document (alternative: server props through lane D's pages); (2) duplicate of `seriesChecks` with lane A; (3) personalisation is read client-side, so for a moment products are off before the read answers (safe direction); Home's Echo chips pick starters once, so they can stay product-free until the next visit.

**Tests**: `npx tsc --noEmit` clean; `npm run lint` 0 errors; `npx vitest run` all pass (2491 + my 14 in mm-c-products). Browser (slot wrapper, one stack): `mm-c.spec.ts` 3/3; with echo-products, flows, home-v2, home-v3: 55 passed, 4 failed (the C-mm-4 lines above). Match shots: 16/16 at 393/320/375/430; 320/375/430 checked by eye, no sideways page scroll (the 15 gallery and 16 chips scroll inside their own row).
