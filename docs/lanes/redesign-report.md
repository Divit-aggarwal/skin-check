# Lane report: redesign (mockup reskin)

Branch `lane/redesign` (from master 4d66a1f). Brief: the owner's "Production UI
Redesign Prompt" (2026-10-14) and the 19 mockups in `design/mockups/` (main
checkout, not committed: 27 MB). This file is the Phase 0 deliverable. Per lane
rule 3 and the brief's own rule 1, nothing else is committed until the owner
answers section 4.

## 1. Phase 0 audit

Status: **exists** = a screen does this job today; **partial** = some of it;
**missing** = nothing; **blocked** = a locked or decided owner rule forbids the
core of the mockup (section 2).

| # | Mockup file | Existing route / component | Status | Data available? | Gaps |
|---|---|---|---|---|---|
| 01 | 01-today.png | `/dashboard`: `components/dashboard/PhoneHome.tsx` (TD-48 Today card), `HomeCards.tsx`, `homeCopy.ts` | partial | Greeting, date, city; today's ring done/total (`lib/home/today.ts ringValues`); streak and `daysLoggedLast7` (`lib/routine/streak.ts`); next check (`lib/home/schedule.ts`, 7 days, provisional); UV/humidity/AQI (`POST /api/home/weather`, switch off, TD-49(3)); Echo starters | "Skin Twin insight" (banned word, no data, change claim); product image in the hero (no product photography); notification bell (no notification list) |
| 02 | 02-environment.png | Home "Today's conditions" card and phone sheet | partial | UV daily peak, humidity, US AQI, `observedAt`, UV/AQI categories and advice (`lib/home/weather.ts`) | Temperature, intraday UV curve and forecast are not fetched. Weather is off in production (TD-49(3)). "Forecast note" needs a source label; no link from weather to the user's skin (TD-47(4)) |
| 03 | 03-todays-routine.png | `/routine`: `components/routine/RoutinePage.tsx`, `RoutineSteps.tsx`, `useRoutine.ts` | exists | Steps by slot; `used / skipped / cleared` events (append-only); adherence `used / skipped / unknown` (= Not logged) | "Start routine" guided flow does not exist (the steps are marked in place). Product images and "30 seconds" durations do not exist. Benefit lines ("Targets acne…") are efficacy copy |
| 04 | none | none | missing | `mainAction` `allDone` / `slotDone`, streak, `daysLoggedLast7` | Whole screen (no mockup; the brief asks for one, flagged for review) |
| 05 | 05-weekly-skin-check.png | `/skin-check` plus the next-check tile | partial | Last check date, 7-day cadence | **One photo per check.** A 3-zone grid (front/left/right) has no capture, storage or engine path |
| 06 | 06-personalised-routine.png | `/routine` setup from the catalogue; Echo starter "Suggest a routine with your products" | partial | Six own products (`lib/catalog/catalogue.ts`); `lib/rules/recommend.ts` exists but is off | On-screen recommendations are off (TD-29(1)); no product cards on `/routine` (R-2 B) |
| 07 | 07-guided-capture.png | `components/skin-check/inputs/PhotoCapture.tsx`, `components/mesh/*`, `lib/capture-quality/gate.ts` | partial | Blur, exposure, resolution checked **after** capture; pose and framing "not_measured" | Front/Left/Right stepper; live indicators (lighting, position, distance, face clear). Not reusable as-is: the gate is not live |
| 08 | 08-weekly-checkin.png | `/questions` (later answers to the first-check questions) | missing | First-check question set (`lib/skin-check-steps.ts`), `laterAnswers` | No weekly 5-question check-in, no storage for it |
| 09 | 09-weekly-report.png | `/checks/[scanId]`: `components/checks/ChecksView.tsx` | blocked | Per-check readings as level words (Low / Moderate / Elevated) for 5 readings × whole face and 4 areas; mesh photo; the fixed "Photos differ in light and angle…" line | Before/after, % deltas, Improving pills, acne/hydration tiles, "insights", "It's working well" (D-12, TD-47(4), TD-24(1)(4), D-24) |
| 10 | 10-skin-twin-home.png | none | blocked | skinstate-1/-2 are internal contract views over immutable `scanAnalyses`; not stored, not user-facing | "Twin" is banned; no concerns, goals or learnings objects; goal % and "learns" wording; concern markers on the face need per-area data (exists as level words) |
| 11 | 11-concern-detail.png | none | blocked | Level words per area per check | Progress chart and deltas (no change claim allowed: `NOISE_TABLE` empty, D-24); "Active Boba Serum is working" (D-12) |
| 12 | 12-progress.png | Home "Your progress" tile (TD-49 label): days logged, checks taken, "Starting checks n of 3" | blocked | Counts only | Trends, % tiles, Routine Impact tab (D-12), before/after strip, "Improving" |
| 13 | none | `/checks?view=timeline`: `components/timeline/TimelineList.tsx`, `timeline.ts` | exists | Checks and routine events together (TD-24(2)) | Product start/stop exists as routine events; "Skin Twin version" items do not exist (versions are contract versions, not user states) |
| 14 | 14-product-recommendation.png | Echo product cards only (`components/skin-check/ProductCards.tsx`) | blocked | Six products, by step, chosen by code (TD-34) | Standalone recommendation screen (TD-29(1)); benefit ✓ lists are efficacy copy; filter chip "Acne" (banned word) |
| 15 | 15-product-detail.png | none | missing | `price.mrpInr`, `packSize`, `shopifyHandle` | No product photography; **no cart or checkout** in this app (the brief assumes one); other users' before/4w/8w photos (D-12); TD-34 cards have no price or buy button |
| 16 | 16-product-response.png | none | blocked | none | Whole screen is product attribution (D-12 LOCKED) |
| 17 | none | none | blocked | Routine events | An AI-proposed routine diff needs routine data in Gemini (R-1 A / TD-24(2)); deterministic rules are off (TD-29(1)). Approve/Decline UI is fine once there is an allowed source |
| 18 | 18-echo-home.png | `/echo`: `components/skin-check/EchoPage.tsx`, `echoStarters.ts` | exists | Starters (TD-41), face-area threads, chat turns | "Recent conversations" list (chatTurns exist, 90-day TTL; no list endpoint); "Today's insight" (no source); "analysing your latest photos" wording |
| 19 | 19-echo-conversation.png | `EchoPage.tsx`, `EchoBubble.tsx`, `ProductCards.tsx`; `POST /api/skin-check/chat` → `{reply, products?, historyToken}` | partial | Plain-text reply; code-chosen product cards | Reasons list and quick tip cards (reply is text only); price/carousel (TD-34: no price, no buy); "likely reasons… a recent product" is a causal claim |
| 20 | 20-notifications.png | Account `HomeSettingsSection.tsx`; `/api/home/reminders`, daily cron | partial | One setting `reminders: allowed / not_now / refused / unsupported`; one generic daily push | Per-type toggles, times, per-product reminders, weekly summary, marketing |
| 21 | 21-profile.png | `/account`: `AccountView.tsx`, `QuestionsCard` | partial | Phone, city, reminders, AI sharing, delete; answers per check | Tabs; editable profile/skin/goals (answers belong to a check; no goals); email (auth is phone only) |
| 22 | 22-privacy.png | Account `ConsentSection.tsx`, `DeleteAccount.tsx`; `lib/consent.ts`; `POST /api/account/erase` | partial | Purposes `image_retention`, `processing`, `ai_share`, `age_18_plus`; only `ai_share` revocable in the UI; real erase flow with typed confirmation | Personalisation, research/model-improvement and marketing consents do not exist (new ledger purposes + legal review H29); **no data export flow**; "never shared with third parties" is untrue (Gemini, AWS) |

Bottom nav in the mockups: 01–11 show Today · Skin Twin · [Camera] · Progress ·
Echo (the brief's choice); 14/18/21 show Home · Timeline · [Echo] · Products ·
Profile.

## 2. Blocked by owner decisions

| Decision | Rule (short) | Mockup items it blocks |
|---|---|---|
| D-12 (LOCKED) | No product attribution, efficacy claims or forecasting | 16 entirely; Routine Impact (12); "is working" (09, 11, 15, 16); other users' results (15); benefit lines (03, 06, 09, 11, 14); goal % (10) |
| TD-47(4) | No change claim between checks, no %, no arrows, no better/worse colours, no score, no weather-to-skin link | MetricTile deltas and status, Improving/Stable/Worse pills, 01 "skin looks relatively stable", 02 → skin links |
| TD-24(1)(4), system.md §2 | Fixed "Photos differ…" line; no arrows, deltas, sparklines, side-by-side numbers; readings in ink, no green/amber/red | Before/after (09, 11, 12), sparklines, TrendChart, coloured concern tiles |
| D-24 (PROPOSED) + D02 `NOISE_TABLE = []` | Change claims gated on validation; every pair is "not enough evidence" | Any trend or delta, even if the rules above were reopened |
| R-1 A / TD-24(2) | Routine data never sent to Gemini | 17 (AI routine diff), routine-aware Echo insights |
| R-2 B, TD-29(1) | No product cards on `/routine`; on-screen recommendations off | 06, 14 |
| TD-34 | Echo product cards come from code; no price, no buy | 15/19 price, Add to Cart, carousel with price |
| TD-49(3) | Weather stays off, nothing bought | 02 and the environment row on 01 (built, but dark in production) |
| `BANNED_WORDS` (`lib/catalog/wording.ts`), TD-26(1), TD-49(1) | "twin", "acne", "progress*", "improve*", "results", "before and after", "calm*", "works"… ; exact-label exceptions only | Nav labels "Skin Twin" and "Progress"; tile "Acne"; "Your skin appears calmer"; "Weekly Skin Report" insights |
| TD-37/39/40 | Five readings as level words; three marked "early estimate" | Four-concern model (acne, redness, texture, hydration): hydration is never shown, acne does not exist |
| map.md, TD-48 | No dead ends; desktop Home and the rail/side bar kept | Nav without Checks and Routine; "480px column only" removes the tablet rail and desktop layout |
| system.md §0, TD-26(4) | `#1f473e` store-matched green, Bai Jamjuree headings, accepted as v1 | The new palette and single font (section 4 a) |

## 3. Data not exposed (nothing invented)

1. Three-angle capture and live capture quality indicators.
2. Weekly 5-question check-in (questions, storage).
3. Temperature, intraday UV curve, weather forecast.
4. Product photography (catalogue has no image field; `public/` has none).
5. Cart and checkout (the app links to the store; no Shopify API).
6. Data export.
7. Per-type notification toggles, reminder times, notification inbox.
8. Personalisation, research/model-improvement and marketing consents.
9. Concerns, goals, learnings objects; user-facing Skin Twin versions.
10. Echo structured cards other than product cards; recent-conversation list endpoint.
11. Email on the profile (phone-only auth).

## 4. Owner decisions needed (answer by letter)

**a. Palette and single font.** The brief's palette (`#0B4A3E` / `#0A3029`,
`#FAFBFA` page, `#ECEEEC` border, `#111814` text) and one sans (Plus Jakarta
Sans, already loaded; Bai Jamjuree dropped) replace system.md §0 and TD-26(4).
Two values were changed for WCAG AA: `--text-subtle` `#8A918D` → `#6B726E`
(3.2:1 → 4.9:1 on white; white and page only), and each concern colour got a
darker `ink` shade for text (the mockup colours are 1.9–4.0:1 on white).
Approving this also approves editing two pinned tests:
`tests/brand-contrast.test.ts` ("the green is the live site's theme colour")
and `tests/shell.test.ts` ("the store fonts are loaded": expects Bai_Jamjuree).

**b. Navigation.** The brief's nav (Today · Skin Twin · Camera · Progress · Echo)
uses two banned labels and drops Checks and Routine. Proposal: **Today
(`/dashboard`) · Checks (`/checks`, history + timeline) · [Camera → `/skin-check`]
· Routine (`/routine`) · Echo (`/echo`)**, i.e. today's places with the new look,
camera raised in the centre; Account from the avatar in the Today header. Or
approve label exceptions ("Skin Twin", "Progress") and say where Routine and
Checks live. Also: keep the tablet rail and desktop side bar (TD-48), or
replace everything above 430px with a centred 480px column as the brief says?

**c. Concern colours.** The brief has four concerns; the product has five
readings (Redness, Oiliness, Breakouts, Texture, Dark marks), and system.md §2
says readings are ink only. Options: (1) no colours, readings stay ink
(current rule); (2) one identity colour per reading for its icon and chip only,
never meaning better/worse. Which?

**d. D-12 (LOCKED).** Screen 16, the Routine Impact tab (12), other users'
results (15), product benefit lines, and the AI routine diff (17, also R-1 A)
need D-12 reopened. Recommendation: keep D-12; drop 16; build 12 without
Routine Impact; build 17 only as "show a rule-made proposal, Approve/Decline"
once a deterministic source is allowed.

**e. Change displays.** Nothing may feed deltas, %, arrows, status pills,
sparklines, trend charts or before/after (TD-47(4), TD-24, system.md §2, D-24,
empty noise table). Recommendation: build **MetricTile as a level-word tile**
(reading, level word, "early estimate" tag, area), and **do not build
TrendChart, BeforeAfter or the status pill** now. Screens 09–12 become: the
opened check (09), a per-reading history list of level words by date with the
fixed "Photos differ…" line (11/12), and the timeline (13). Confirm.

**f. Missing backend (section 3).** Which of these, if any, should become
tracker rows / later lanes? Until then the screens that need them (05 grid, 07
live checks and angles, 08, 15 cart, 20 per-type toggles, 22 new consents and
export) are built only to their existing data or not at all.

**g. Commerce.** The brief says "wired to the existing cart and checkout"; none
exists. Keep TD-34 (store link, no price) or add price + "Buy on the store"
link-out?

## 5. Phase 1 status

Started, then stopped at this gate (nothing committed except this report).
Uncommitted in the worktree:

- `tailwind.config.ts`: new `brand.900/700/100/50`, `bg`, `surface`, `border`,
  `text`, `text-muted`, `text-subtle`; the old role names (`paper`, `linen`,
  `ink`, `forest`, …) point at the new values, so every screen takes the new
  look with no per-file edits; `concern.*` and `severity.*`; one font; near-zero
  card shadow; a small plugin writes the tokens as CSS variables (`--brand-900`,
  `--bg`, `--text-muted`, `--concern-acne`, …) from the same values.
- `app/globals.css`: shadcn variables re-pointed; focus ring uses `--brand-700`;
  global `prefers-reduced-motion` rule.
- `app/layout.tsx`: Plus Jakarta Sans only; theme colour `#0B4A3E`.
- `components/ds/layout.tsx`: first draft. It duplicates `components/ui/page.tsx`
  (PageHeader, `eyebrow`, `page`); after approval it is folded into the
  existing primitives instead of a second set.

Unit tests with these edits: 2312 passed, 4 failed. Two are the pins in 4 a.
Two (`dev-env-guard`, `face-mesh`) fail on master too in this worktree, because
it borrows the main checkout's `node_modules` (no `@mediapipe/tasks-vision`);
`npm ci` in the worktree fixes that before any test run that counts.

After approval, the components with no conflict go first: AppHeader, Card,
TintCard, HeroCard, Button, Chip, SegmentedControl, TabBar, ToggleRow,
SettingsRow, Stepper, ChatBubble, SuggestionChips, ChatInput, ProgressRing
(today's done/total), MetricTile (level words), and the existing Empty /
Loading / Error states restyled. Screenshots at 375px reuse
`tests/design/pages.shots.ts` (`SHOTS=redesign`).

## 6. Proposed decision (for the owner to record)

TD-50 (proposed): the mockup look (section 4 a) replaces the store-matched look
of system.md §0 / TD-26(4); data rules, wording rules and D-12 are unchanged.
