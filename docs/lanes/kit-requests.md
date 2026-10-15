# Kit requests (redesign lanes)

Lanes append here; the main session merges them in batches and marks each
row. Format: lane · what · why · screen · status.

| # | Lane | Request | Why / screen | Status |
|---|---|---|---|---|
| C1 | C products | A `ProductTile` (neutral 12px tile with a step icon, no photo) and a step-icon map in the kit; `StepRow` to take it (or any node) in place of `image` | E20: no product photos. Used by screens 06 (Your products, add form), 14 (Echo cards) and 15 (product page); built for now in `components/products/ProductTile.tsx` (lane C owned). Icons: Cleanse ShowerHead, Treat Pipette, Moisturise Hand, Protect Sun, Spot care Dot, other Package (none of the reading icons) | done (batch 1) |
| E1 | E account | `ToggleRow`: a `disabled` prop (aria-disabled, dimmed, no hover, not "busy"); today the flagged "Comes later" switches use `busy` | 20 (G31 types), 22 (H36 consents) | done (batch 1) |
| E2 | E account | `SettingsRow`: a `disabled` look for a row that is not a link yet (e.g. H37 "Download my data" with "Comes later"); today it renders as a plain row with the value | 22 (H37) | done (batch 1) |

Batch 1 (main session, during integration): C1 `ProductTile` in the kit, `StepRow.media`;
E1 `ToggleRow.disabled`; E2 `SettingsRow.disabled`; D's two requests (filed in
lane D's copy): `ChatBubble` 16px corners, `TypingIndicator` stops its JS loop
under reduced motion and drops its 20px corner. Also from lane C's report: the
shared class strings moved from the `"use client"` `components/ui/page.tsx` to
`components/ui/classes.ts` (page.tsx re-exports them), so a server page gets
the strings.
| 1 | D echo | `ChatBubble`: 16px corners (`rounded-card`, tail corner `rounded-br-md` / `rounded-bl-md` kept) instead of `rounded-2xl` (20px), for both sides | Rule 10 (no 20px on touched screens); 19, also the opening on 18 | done (batch 1) |
| 2 | D echo | `TypingIndicator` (`components/primitives`): honour reduced motion itself (the dots loop in JS; framer ignores the CSS rule) and drop its own `rounded-2xl` | Rule 10; 18/19. EchoPage wraps itself in `MotionConfig reducedMotion="user"` and overrides the corner by class meanwhile | done (batch 1) |
| B1 | capture | `AppHeader`: an `onBack` callback and a `backDisabled` (invisible, still in the tree) state, besides link/history | The check flow's back is the hook's `back()`, and the first screen keeps a disabled "Go back" (questionnaire.spec); the check-in's back closes a view. Until then `SkinCheckFlow` and `WeeklyCheckin` put the kit `Wordmark` beside their own back button · 05, 07, 08 | done (batch 2) |
| A1 | A checks | `PhotoTile`: pass `referrerPolicy="no-referrer"` and an `onError` (or accept a rendered `<img>` child), and a fallback when the image fails | The kept photo is a short-lived signed URL; `Thumb` sets no-referrer and drops a failed image. Until then the Photos view (12) keeps `Thumb`'s own `<img>` with the tile look (`size="tile"`) and a date pill drawn in `ChecksTabs.tsx` | done (batch 2) |
| A2 | A checks | `MetricTile`: optional `href` (whole tile a link, hover tint, `h-full`) | Tiles on 10 and 12 open 11 (`/checks?reading=<key>`); today `ChecksTabs.tsx` wraps the tile in a `Link` and stretches it with `[&>div]:h-full` | done (batch 2) |

Batch 2 (main session, after all lanes merged): B1 `AppHeader` back as a
function and `backDisabled`; A1 `PhotoTile` no-referrer and a fallback on load
error; A2 `MetricTile.href` (lane A's wrapper moved onto it). Not migrated yet:
the check flow's own back button (lane B) stays as built, because
`questionnaire.spec.ts` pins its disabled-and-hidden first-screen state; the
Photos view keeps `Thumb`'s image (lane A). Both are follow-ups, not new local
patterns.

## Mockup-match (G37)

| # | Agent | Request | Why / screen | Status |
|---|---|---|---|---|
| BE2-1 | BE2 | `tests/store-products.test.ts` line 4 imports `@/lib/contracts/store-products`, which moved to `@/lib/feature-contracts/store-products` in the base (4e61bf7). Fix the import. | Base `npx tsc --noEmit` fails and `npm run test:local` stops at its unit step (set -e) before the stack starts, for every lane. BE2 ran its stack test with the one-line fix applied locally and reverted, uncommitted. No screen | open |
| BE2-2 | BE2 | `lib/feature-contracts/data-export.ts`: decide whether the export also carries the profile doc `users/{uid}` (phoneNumber, lastSeenAt) and `pushSubscriptions`. Today they are not in `EXPORT_COLLECTIONS`, and the file names them in `notIncluded`. | H37 completeness: both are our data about the user. Owner decision; BE2 left the contract as is. No screen | open |
