# Agent D: Today, environment, routine and Echo (01, 02, 03, 18, 19)

Read `docs/lanes/mm-README.md` first. Kit: `EchoAvatar` (replaces the Echo mark on 18 and 19), `HeroCard`, `TintCard`, `ProgressRing`.

## Build
**01 Today** (`components/dashboard/PhoneHome.tsx`, `HomeCards.tsx`)
- Match the mockup.
- The "Skin Twin insight" card ("Your skin appears calmer") is removed: a change claim and a before/after.
- In its place, a "Skin Twin" card: the latest check's level words with a link to /checks.
- The hero shows a store product photo (`lib/store/products.ts`) only if you request it as a server prop. Otherwise keep the kit hero without a photo.

**02 Environment** (the existing weather page or card, `lib/home/open-meteo.ts`, `lib/home/weather.ts`, `scripts/fake-weather.mjs` is yours)
- Add temperature (`current=temperature_2m`), an hourly UV curve for today (`hourly=uv_index`), and "UV high until <time>": the last hour today with UV ≥ 6.
- Use the same paid hosts and key.
- Without `OPEN_METEO_API_KEY` (or with `WEATHER_SWITCH` off) the tiles stay hidden, as today.
- The UV curve is a small SVG chart of real hourly values.
- No line links the weather to the skin (`tests/home-v2-wording.test.ts` rules).

**03 Today's routine** (`components/routine/RoutinePage.tsx`, `RoutineSteps.tsx`)
- Match the mockup.
- Store product photos where the mockup has bottles.
- Done, Skipped and Not logged stay three separate states.

**18 Echo home, 19 conversation** (`components/skin-check/EchoPage.tsx`, `EchoBubble.tsx`, `EchoMark.tsx`)
- Match the mockups with `EchoAvatar`.
- Quick actions only for things that exist.
- "Recent conversations" only if chat turns are stored (`chatTurns`); otherwise leave it out.
- Product cards on 19 come from agent C's `ProductCards`. Don't edit it; request changes.

## Tests
- Unit tests: the UV-until rule, hourly parsing, hidden without the key, copy checks.
- Browser: the existing `home-v2.spec.ts`, `home-v3.spec.ts` and echo specs still pass (add-only edits).
- Overlay shots.

## Log
- 2026-10-15: abc87cd (now 2ced6f7 after the rebase): 01-03, 18, 19; 02 adds temperature, hourly UV curve, "UV high until" (fake weather server only).
- c48c320 (now d46c43a): home-v3 fold fit; kit requests D-1 to D-4.
- Rebased onto build/mockup-match (lane C merged). One conflict, `docs/lanes/kit-requests.md` (both sides kept). `RoutinePage.tsx` merged clean: lane C's "Your products" store photos kept.
- dfabe5d: the step photos on 03 now use lane C's client path (`useStoreProducts` + `ProductPhoto`) instead of lane D's server prop. One path for store photos on /routine; `NEXT_PUBLIC_UI_ROUTINE_PHOTOS` removed (it was never in `lib/ui-flags.ts`). D-3 superseded by C-mm-4, D-4 withdrawn.
- H36: Echo and Today get `productsOn` from lane C's `EchoWithConsent` / `DashboardWithConsent`; lane D's starters and opening already gate on `productsOn`, and lane D has no other product entry (no product quick action on 18, no product photo in the 01 hero). Nothing more needed.
- home-v3 fold failed by 9 px after the rebase (two-line Echo starters). Fixed: the Ask Echo card's padding and the chip's vertical padding (lane ready commit).
- echo-products opening test fails at 3 widths: a base spec/label mismatch, filed as D-5. Not lane D code.
- Time-boxed by the orchestrator: one overlay pass, no further pixel iteration.

## Hand-back

### Changelog
- 01 Today (`PhoneHome.tsx`, `HomeCards.tsx`, `homeCopy.ts`): wordmark and account, date, greeting, dark "Your next step" hero (kit, no product photo), conditions row (UV, city), Today ring and Next check tiles, routine row, Skin Twin card (latest check's level words, link to the check; the mockup's "Your skin appears calmer" card is removed), Ask Echo card with two starters.
- 02 Environment (`lib/home/open-meteo.ts`, `lib/home/weather.ts`, `scripts/fake-weather.mjs`): `current=temperature_2m`, `hourly=uv_index` for today, "UV high until <time>" (last hour today with UV >= 6), a small SVG UV curve of the real hourly values. Hidden without `OPEN_METEO_API_KEY` or with `WEATHER_SWITCH` off. No line links weather to skin.
- 03 Today's routine (`RoutinePage.tsx`, `RoutineSteps.tsx`, `app/(marketing)/routine/page.tsx`): the slot title as the page title with the due count, step cards with number, store photo (lane C's `ProductPhoto`) or step tile, product name, today's status; Done, Skipped and Not logged stay separate; the purpose note at the foot.
- 18, 19 Echo (`EchoPage.tsx`, `echoCopy.ts`; `EchoMark.tsx` deleted, `EchoAvatar` from the kit): header with avatar, "what Echo does" tiles, quick actions to pages that exist only (check, routine, checks). No "Recent conversations" (chat turns are not stored for listing). Product cards are lane C's `ProductCards`, unchanged.

### Overlays (393, one pass, time-boxed)
| Screen | Mean diff | Remaining differences and reasons |
|---|---|---|
| 01 Today | 48.1 | Status bar (allowed). Hero: real state ("Time for your check") instead of the sample morning routine, and no product photo (brief: kit hero unless requested). Mockup's "skin looks stable" line left out (Home never says how the skin is). Skin Twin insight card with before/after removed (data rules 2, 3); Skin Twin level-words card in its place. Extra lines from real data (home-screen hint, routine row). Greeting on one line (home-v3 fold). Bottom bar until integration. |
| 02 Environment | 17.2 | Status bar; real fake-server values instead of sample values; sun colours use the nearest tokens until D-1. |
| 03 Today's routine | 41.9 | Status bar. Seeded user has one product (Cleanse), so steps 2-4 show "Add a product" (real data). No "~3 minutes" or per-step seconds (no time is stored). Morning/Evening switch kept (the app has both slots). Used/Skipped buttons on the card (three-state logging). Footer note is the routine's purpose, not "better results" (no efficacy copy). Bottom bar. |
| 18 Echo home | 21.5 | Status bar; "View your skin profile" is "Open this check" (the page that exists); face-area chips (Echo is per area); real opening instead of sample chat; no "Recent conversations" (not stored); bottom bar. |
| 19 Echo conversation | 33.8 | Status bar; real fake-Gemini answer; no reason list with icons or "Quick tip" (Echo renders backend text only); product cards are lane C's full cards (price, ingredient, usage, store action) instead of the mockup's mini carousel; the input field draws icon and send apart until D-2; bottom bar. |

320, 375 and 430 shots in `docs/design/mockup-match/shots/` (not committed): no horizontal scroll (the specs assert it), nothing clipped seen.

### Flags
None new. `NEXT_PUBLIC_UI_ROUTINE_PHOTOS` was added in c48c320 and removed in dfabe5d (one store-photo path, lane C's). Weather uses the existing `WEATHER_SWITCH` and `OPEN_METEO_API_KEY`.

### Kit requests
D-1 weather sun colour tokens (open), D-2 `ChatInput` leading icon and inner send (open), D-3 superseded by C-mm-4, D-4 withdrawn, D-5 echo-products line 63 regex vs "(opens in a new tab)" (open).

### Contract changes
None.

### Assets
None (Lucide icons only; store photos come from the store feed through lane C's `ProductPhoto`).

### Browser-test edits
None to existing specs. Lane D's own: `tests/design/d.match.ts`.

### Open questions
- Should the 01 hero show a store product photo (needs a server prop, brief)? Left out.

### Test commands and results (2026-10-15, after the rebase)
- `npx tsc --noEmit`: pass. `npm run lint`: no errors (3 existing `<img>` warnings, not lane D files).
- `npx vitest run`: 122 files passed, 23 skipped; 2513 tests passed, 102 skipped (includes `tests/mm-d.test.ts`: UV-until rule, hourly parsing, hidden without key, copy and banned words).
- `PW_ARGS="tests/browser/home-v2.spec.ts tests/browser/home-v3.spec.ts tests/browser/echo-products.spec.ts tests/browser/flows.spec.ts" bash scripts/with-stack-slot.sh npm run test:browser`: 52 passed, 4 failed (echo-products opening at 390/768/1280: D-5, base; home-v3 fold by 9 px: fixed).
- `PW_ARGS="tests/browser/home-v3.spec.ts" ...`: 6 passed (after the fold fix).
- `PW_ARGS="-c tests/design/match.config.ts tests/design/d.match.ts" ...`: 12 passed (5 screens at 4 widths).
- `python3 -I tests/design/overlay.py .../design/mockups NN` for 01, 02, 03, 18, 19: means above.
