# Kit requests (redesign lanes)

Lanes append here; the main session merges them in batches and marks each
row. Format: lane · what · why · screen · status.

| # | Lane | Request | Why / screen | Status |
|---|---|---|---|---|
| E1 | E account | `ToggleRow`: a `disabled` prop (aria-disabled, dimmed, no hover, not "busy"); today the flagged "Comes later" switches use `busy` | 20 (G31 types), 22 (H36 consents) | open |
| E2 | E account | `SettingsRow`: a `disabled` look for a row that is not a link yet (e.g. H37 "Download my data" with "Comes later"); today it renders as a plain row with the value | 22 (H37) | open |
