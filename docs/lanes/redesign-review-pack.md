# Redesign review pack: Phases 3–7 (owner review)

Branch `lane/redesign` (not pushed). Five lanes built in parallel off `8dc77ef`
and were merged one at a time, smallest first after readiness (C, E, D, B, A),
each followed by typecheck, lint and unit tests; then two kit batches; then
one full `npm run test:all` with the browser tests in two isolated shards.
Lane details, logs and hand-backs: `docs/lanes/redesign-{checks,capture,products,echo,account}.md`.

## 1. Every screen next to its mockup (375px; mockup left, app right)

All under `docs/design/redesign/`.

| Lane | Screen | Comparison |
|---|---|---|
| Phase 2 | 01 Today, 02 Environment, 03 Routine | `phase2/compare-01-today.png`, `compare-02-environment.png`, `compare-03-routine.png`; 04 Routine Complete `phase2/p2-04-routine-complete.png` (no mockup) |
| A checks | 09 opened check | `checks/compare-09-opened-check.png` |
| | 10 Checks overview ("Skin Twin" home) | `checks/compare-10-checks-overview.png` |
| | 11 one reading over time | `checks/compare-11-reading.png` |
| | 12 Readings / Photos tabs | `checks/compare-12-readings.png`, `checks/compare-12-photos.png` |
| | 13 timeline (no mockup) | restyled; in `checks/` full-page shots |
| B capture | 05 start of a check | `capture/compare-05-weekly-skin-check.png` |
| | 07 guided capture | `capture/compare-07-guided-capture.png` |
| | 08 weekly check-in (flag on) | `capture/compare-08-weekly-checkin.png` |
| C products | 06 routine set-up | `products/compare-06-routine-setup.png` |
| | 14 Echo product cards | `products/compare-14-product-cards.png` |
| | 15 product page | `products/compare-15-product-detail.png` (+ `15-product-out-of-stock.png`) |
| D Echo | 18 Echo home | `echo/compare-18-echo-home.png` |
| | 19 conversation | `echo/compare-19-echo-conversation.png` (+ red-flag, consent, no-reading, desktop shots) |
| E account | 20 notifications (flag on) | `account/compare-20-notifications.png` (+ `20-notifications.png` flag off) |
| | 21 profile | `account/compare-21-profile.png` (+ `21-skin.png`) |
| | 22 privacy (flags on) | `account/compare-22-privacy.png` (+ `22-privacy.png` flags off) |

Out of scope: 16 (D-12 LOCKED), 17 (blocked), the Routine Impact tab on 12.
Full-page shots show the fixed bottom bar part-way down: a screenshot artefact.
The lane shots were taken before kit batches 1–2 (16px chat bubbles, tile
links); those batches change corners and wrappers only.

## 2. Deviations from the mockups, and why

Common to all lanes (locked decisions, no data):
- No change between checks anywhere: no deltas, %, arrows, status pills, graphs,
  sparklines, before/after, "Improving" (TD-24, TD-47(4), D-24, empty noise table).
  Slots are left empty (`MetricTile.footer`, between the fixed line and the
  table on 09) so an allowed change display can drop in later.
- Banned words replaced: "Skin Twin" → Checks; "Progress" → Readings / Checks;
  "Acne" → the reading's own label (Breakouts); "results", "explain", "better",
  "calm", "before" phrasings rewritten.
- No product photos (E20): neutral step tiles. No price, cart or buy (TD-34).
- No efficacy, attribution or goal % (D-12).

Per lane (full lists in each brief's Log):
- **A checks:** the opened check keeps the one readings table, not reading
  tiles (TD-39, pinned by a browser test); 10's newest reading card and routine
  strip are phone-only (from 1024px the list + opened check layout stays so the
  routine never sits beside readings, D-12); 11 lists a reading's level per
  check by date with the software-version line; 12 Photos shows the user's own
  kept photos by date only; no goals, learnings, insights, "What to do next".
- **B capture:** one photo (no Front/Left/Right, C10), no live indicators (C11):
  the existing gate's result after capture (Light, Sharpness, Photo size:
  Fine / Retake / Not checked); 05 lives on the existing first screens (TD-44,
  TD-43); 08's questions are placeholders (E19 has no question set; the mockup's
  are better/worse scales); the 8-part bar stays.
- **C products:** "See it on the store" (not "Buy"); no filter chips (one card
  per step), no recommendation panels (TD-29(1)); "Your products" before the add
  form on `/routine`.
- **D Echo:** no recent conversations, today's insight, quick actions,
  timestamps, reasons list, quick tip, attach or carousel (no data, or causal);
  mockup copy ("AI skin coach", "personalised advice") replaced with
  "Talks you through your checks" / "Never decides for you"; "View your skin
  profile" → "Open this check"; new face mark replaces the "+".
- **E account:** no name, email, gender, birth date, avatar or Edit (phone-only
  sign-in); no Goals tab; no saved-answers view (answers belong to a check);
  no reminder times; no "never shared with third parties" (untrue: Gemini, AWS);
  AI sharing and reminders stay buttons (one-way withdraw; four reminder states).

## 3. Screens behind flags (all off by default; with a flag on, nothing saves)

| Flag (`lib/ui-flags.ts`) | Env var | Screen | What shows with it on | Waits on |
|---|---|---|---|---|
| `weeklyCheckinUi()` | `NEXT_PUBLIC_UI_WEEKLY_CHECKIN=on` | 08 | "Weekly check-in" button on 05, three placeholder questions, Save disabled ("Saving your answers comes later.") | E19 |
| `notificationTypesUi()` | `NEXT_PUBLIC_UI_NOTIFICATION_TYPES=on` | 20 | Seven type switches, disabled, "Comes later" | G31 |
| `consentsUi()` | `NEXT_PUBLIC_UI_CONSENTS=on` | 22 | "More sharing choices" (Draft): five disabled switches | H36 (+ H29 legal wording) |
| `dataExportUi()` | `NEXT_PUBLIC_UI_DATA_EXPORT=on` | 22 | "Download my data", not clickable, "Comes later" | H37 |

Live now (real backend): reminders on/off, AI sharing withdraw, city, delete
account (typed confirmation), everything else on the other screens.

## 4. Kit changes during the build (`docs/lanes/kit-requests.md`)

- **Batch 1:** shared class strings moved out of the `"use client"` `page.tsx`
  into `components/ui/classes.ts` (a server page got references, not strings:
  found by lane C); `ProductTile` and `StepRow.media` (C1); `ToggleRow.disabled`
  (E1); `SettingsRow.disabled` (E2); 16px `ChatBubble`; `TypingIndicator` stops
  its JS loop under reduced motion, 16px (D).
- **Batch 2:** `AppHeader` back as a function + `backDisabled` (B1);
  `PhotoTile` no-referrer + load fallback (A1); `MetricTile.href` (A2, used).
- **Follow-ups (not migrated):** the check flow's own back button (pinned
  first-screen state in `questionnaire.spec.ts`) and the Photos view's `Thumb`
  image could move onto B1/A1.
- Infra (before the lanes): browser tests in isolated parallel shards,
  `scripts/with-stack-slot.sh` (max 2 stacks), the H33 ping allowed by exact URL.

## 5. Open questions for you

1. **15:** a new page route `/products/[id]` (static catalogue, no API, open
   signed out). Acceptable? (I read "no route changes" as no API routes.)
2. **Step for Active Boba and Clear Seal:** `/routine` uses the catalogue
   category ("Other products"); Echo and the product page use
   `OWN_PRODUCT_INFO` (Treat / Spot care). Which source?
3. **Product description:** `OWN_PRODUCT_INFO.description` is marked "awaits
   owner approval". Approve it as the subtitle on 14 and 15?
4. **08:** the real E19 question set; and should 08 come after the photo (needs
   a flow logic change)?
5. **05:** the choice buttons fall below the fold at 375px on a first visit. OK?
6. **07:** gate words "Fine / Retake / Not checked": OK?
7. **11:** checks read by different engine versions: keep the one general line,
   or mark/hide rows one by one?
8. **12 Photos:** a grid of the user's own kept photos: OK under D-12, or one per row?
9. **Fixed line:** it now also shows on the Checks overview, Readings and
   Photos (every view with level words). Keep?
10. **10 on desktop:** the newest-reading card and routine strip are phone-only. OK?
11. **Echo 18:** third tile "Never decides for you" or "Not a medical opinion"?
    Show the introduction on every empty area thread, or first visit only?
12. **Account:** questions card only on the Skin tab (TD-33(1) had it on
    Account's first screen): also show on Profile? Mask the phone number
    ("ending 1234")? H36 draft labels need H29 legal wording.

## 6. Test results

`npm run test:all` on the integrated branch (`3cb3b5a`, all five lanes and both
kit batches), 17:04–17:22 (18 min), exit 0:

| Step | Result |
|---|---|
| Typecheck, lint | clean (lint: existing `<img>` warnings only) |
| Unit | 2379 passed, 85 skipped (111 files) |
| Stack (rules + end-to-end) | 84/84 |
| Browser, 2 isolated shards | 115/115 (71 + 44; 113 before + 2 new from lane A) |
| Build | compiled |

Each lane also ran its own screens' browser specs and screenshot spec before
hand-back (counts in each brief's Hand-back). Browser-test edits across lanes
are add-only (tab clicks, new locators, two new tests); nothing was removed or
weakened. No API route, Firestore rule or business logic changed.
