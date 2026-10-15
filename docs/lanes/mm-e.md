# Agent E: account (20, 21, 22)

Read `docs/lanes/mm-README.md` first. Contracts: `lib/feature-contracts/notifications.ts`, `consents.ts`, `data-export.ts`. Backends: BE1 (notifications, consents) and BE2 (export) build the routes. Build against the contracts and unit-test with the fixtures; the real routes arrive at integration.

## Build
**20 Notifications** (`app/(marketing)/account/*`, `components/dashboard/HomeSettingsSection.tsx`)
- Behind `notificationTypesUi()`.
- Sections as in the mockup: daily routine, weekly check-in, product usage, updates, marketing.
- Use `ToggleRow` with `icon` and a time chip in `trailing`.
- Types outside `SENDABLE_TYPES` are disabled, with their `WAITS_ON` line.
- PATCH on change, with optimistic state and roll-back on error.
- "Custom reminder": no backend, so it is not shown.
- Product rows use store photos.

**21 Profile**
- Match the mockup with real fields only: phone last 4 digits (H38), city, and the questionnaire answers we store.
- No made-up fields: no name or date of birth unless they are stored.
- "Edit" only where an edit path exists.

**22 Privacy & Skin Twin data controls**
- Behind `consentsUi()` and `dataExportUi()`.
- Consent switches from `CONSENT_TEXTS`, each with a small "Draft wording" note until the legal review (H29).
- `ai_share` uses the existing route.
- "Download my data" fetches `/api/account/export` and saves the file.
- "Delete my data" goes to the existing delete flow.
- The mockup line "never shared with third parties" is not used (it is untrue: H36 row).
- "Your Data" rows: only "Manage" links that go somewhere real.

## Tests
- Unit tests: disabled types, the roll-back on error, consent version sent, the export download, copy checks.
- Browser: flags off, the screens as today; flags on, the controls render. Use add-only edits to existing account specs.
- Overlay shots.

## Log

## Hand-back
