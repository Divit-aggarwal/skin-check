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
| B1 | capture | `AppHeader`: an `onBack` callback and a `backDisabled` (invisible, still in the tree) state, besides link/history | The check flow's back is the hook's `back()`, and the first screen keeps a disabled "Go back" (questionnaire.spec); the check-in's back closes a view. Until then `SkinCheckFlow` and `WeeklyCheckin` put the kit `Wordmark` beside their own back button · 05, 07, 08 | open |
