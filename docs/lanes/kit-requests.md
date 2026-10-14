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
