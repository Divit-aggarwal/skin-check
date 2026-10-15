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

## Hand-back
