# mm/visual: header and type scale round (kit only), 2026-10-16

Owner order 2026-10-16. Branch `mm/visual` off `build/mockup-match`. No tracker edit.

## Measured scale

Measured on the mockup screens at 393 x 852 points (crops from `tests/design/overlay.py`),
by ink extent on capital letters, then checked against text width with the app font's
metrics. Plus Jakarta Sans cap height is 0.745 em, so px = cap / 0.745.

| Screen | Header top (wordmark cap, pt) | Wordmark cap | Title cap | Title size | Subtitle cap | Section heading cap |
|---|---|---|---|---|---|---|
| 01 | 46.2 (frameless render) | 7.9 | 19.4 | 24-26 px | 10.6 (14 px) | none in the first screenful |
| 03 | 67.3 | 8.7 | 21.9 | 29 px | 10.2 (14 px) | none |
| 10 | 56.4 | 8.5 | 18.0 | 24-25 px | 9.0 (12 px) | 10.0 (13-14 px) |
| 12 | 55.8 | 8.5 | 18.9 | 24-25 px | 9.0 (12 px) | 10-11 (14 px) |
| 15 | 55.3 | 8.5 | 16.9 | 22.6 px | 8.0 (11 px) | 10-11 (14 px) |
| 20 | 54.4 | 8.0 | 15.5 | 20-21 px | 8.0 (11 px) | 9.0 (12 px) |
| 22 | 54.0 | 8.5 | 16.5 | 22 px | 8.5 (11.5 px) | 10.5 (14 px) |

Also checked: 02, 05 and 06 have display titles (cap 20.4-22.9). 07, 08 and 16 have page titles (cap 18-19.4).
09, 11, 14 and 21 have sub-page titles (cap 15.4-17). The header row is 44 pt in every mockup. Its centre (the
wordmark cap centre) is at 59-61 pt, and the title cap top is 21-28 pt below that centre.

Scale (in `components/ui/classes.ts`, nothing below 12 px; the `sm:` sizes are the desktop layout and have no mockup):

| Class | Phone | Used on |
|---|---|---|
| `Wordmark` | 12 px medium, 0.30 em (mockup 11.4 px by cap and width, raised to the 12 px floor) | every header |
| `appBar` | 44 px header row | `AppHeader`, the check flow's own row, Home's weather sheet |
| `titleDisplay` | 28 px / 600 / 1.05 | 02, 03, 05 |
| `titlePage` | 24 px / 600 / 1.05 | 01, 07, 08, 10, 12, 16, `PageHeader` |
| `titleSub` | 22 px / 600 / 1.05 | 09, 11, 15, 20, 21, 22 |
| `subtitle` | 12 px / 1.25 | under page and sub-page titles |
| `lead` | 14 px / 1.3 | under display titles (02, 03, 05, 18) |
| `h2` (section heading) | 14 px / 600 | every section heading (was 18 px) |

## Changes

- Kit: the classes above. `Wordmark` takes `centred` (it replaces the `pl-[0.35em]` copies). `AppHeader` is
  `h-11`, down from `h-14`. `PageHeader` uses `titlePage` and `subtitle`, and `phoneCompact` adds no
  space above the content on phones.
- B-mm-1: the capture header (05, 07, 08) is 12 px shorter (`appBar`). The lane `-mt-1.5` and `pt-*`
  nudges are gone from 10, 11, 12, 15, 16, Today and Echo, so every phone header starts with its
  wordmark cap 17.5 pt below the viewport top. The other ~20 pt against the old 59 pt reading is the
  status-bar band: the mockups draw their header inside it. It is an allowed difference, and a 44 px
  tap target cannot go higher.
- Screens: hard-coded title, subtitle and section-heading sizes are replaced with kit classes in ChecksView,
  ChecksTabs, ProgressView, SinceStarted, ProductDetail, RoutinePage, GuidedCapture, WeeklyCheckin,
  ProgressHeader, PhoneHome, HomeCards (02 sheet), SkinCheckFlow (05 lead), EchoPage (18 tagline),
  AccountView `ScreenTitle`, PrivacyScreen and NotificationsScreen section headings.
- `tests/design/overlay.py`:
  - The mockup and the app are aligned on content top: the mockup's ink run at or after y 59 (walked up
    to its start), and the app's first ink row.
  - 01 is read as frameless, and the top bezel is found per mockup (02, 03 and 06 were cropped about
    20 pt off).
  - Writes `<state>.png` (the whole page) and `<state>-first.png` (the first 852 pt).
  - The mean-diff number is removed.
- `tests/design/match.ts`: shots are full page, and a shot fails if the page scrolls sideways.

## Tests

- `npx tsc --noEmit`: pass.
- `npm run lint`: 0 errors (only the `<img>` warnings that were already there).
- `npx vitest run`: 2551 passed, 102 skipped.
- Match shots at 393, with all five flags: 14 passed. At 320 (a, d, e): 7 passed, no sideways scroll.
- `home-v3`, `questionnaire` and `dashboard` specs (slot wrapper, final code): 44 passed. No exact-pixel assertion broke.

## Per screen, first screenful (393)

- 01: wordmark and greeting line up. The app greeting is one line (home-v3 fold); the mockup has two lines and its pitch is 28 pt.
- 02: title and lead size match. The mockup sets its header about 10 pt lower (the alignment takes the chevron).
- 03: title and lead line up. The app has one meta line where the mockup has two (no time estimates are stored).
- 05: title is 28 px on one line. The mockup is 29 px on two lines, with more space above it (screen spacing, lane B).
- 06: the shot is /routine (03's layout); the mockup's "Your personalised routine" title is lane C's screen.
- 07: header, stepper and title line up. The camera frame size is the lane's.
- 08: title is 24 px against about 26 px in the mockup. The app has no stepper when opened without a check (data).
- 09: header, title and date chip line up. The mockup's report blocks are removed by the data rules.
- 10: wordmark, title, subtitle and chip line up. The tabs sit 7 pt lower because the TabBar keeps 44 px tap targets (mockup about 30 pt).
- 11: title and subtitle line up. The reading picker is the lane's.
- 12: header, title and subtitle line up. The tabs are 44 px as on 10.
- 14: Echo header now starts at the kit height. The "Product Recommendations" page title does not exist in the app (cards in Echo).
- 15: eyebrow, title and subtitle line up. The tags ("Acne control" and so on) are removed by rule 4.
- 16: title and subtitle line up. The product strip is the lane's.
- 18: header lines up. The app's "Echo" hero is 56 px (lane D), and its tagline is now `lead`.
- 19: header and avatar row line up. The chips row is the lane's.
- 20: header, title and subtitle line up. The card headings are 14 px against 12 px in the mockup (one section-heading size). The toggle rows are lane E's density.
- 21: title and subtitle line up. The tabs are the TabBar (44 px).
- 22: title and subtitle line up. The section headings are now `h2`.
