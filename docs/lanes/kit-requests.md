# Kit requests (redesign lanes)

Lanes append here; the main session merges them in batches and marks each
row. Format: lane · what · why · screen · status.

| # | Lane | Request | Why / screen | Status |
|---|---|---|---|---|
| B1 | capture | `AppHeader`: an `onBack` callback and a `backDisabled` (invisible, still in the tree) state, besides link/history | The check flow's back is the hook's `back()`, and the first screen keeps a disabled "Go back" (questionnaire.spec); the check-in's back closes a view. Until then `SkinCheckFlow` and `WeeklyCheckin` put the kit `Wordmark` beside their own back button · 05, 07, 08 | open |
