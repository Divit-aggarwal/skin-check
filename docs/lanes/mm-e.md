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

- 2026-10-15 base: `npx tsc --noEmit` and `vitest` failed on `tests/store-products.test.ts` (old import path), not lane E's; fixed by the main session in d1c2af3, rebased onto `build/mockup-match`.
- Kept, because existing specs pin them (edits to specs are add-only): tab labels Profile / Skin / Privacy (eight specs click "Privacy" exactly); `PhoneOtpForm` untouched (H38 source test, "Signed in as", "Sign out"); `ConsentSection` stays the ai_share control on its existing route (its Stop/saving/failed/stale states are pinned, and a switch would grant ai_share without the consent text Echo shows); `HomeSettingsSection` unchanged and on the Privacy tab; `DeleteAccount` at `#delete-account`.
- 21 decisions: rows come from the newest check's answers (`checkAnswers`, so later answers count), labels from our own option labels only, unknown values dropped. Shown: name (as typed), age band (never years or a date of birth), gender, phone ending (H38), city (link to Privacy, where it is changed), skin type, main concerns, sun response, lifestyle factors. Not shown: hormonal context answers and product names (shared-screen privacy, as H38), Goals, Language, Appearance, email, photo avatar, header Edit (no edit path: answers change only at a new check, so a "Start a new check" link).
- 20 decisions: the per-type screen replaces the old flagged "Comes later" list; the live daily reminder (TD-47) stays, after the types. Custom reminder and row chevrons left out (no backend, no detail screens). Weekly chip shows the day only (the contract has no weekly time). Product rows are the `prefs.products` keys joined to store titles and first photos (read on the server in `page.tsx`, only with the flag on); no photo → kit `ProductTile`.
- 22 decisions: mockup lines "We use your information only to…", "encrypted … never shared with third parties" and "Learn more about our privacy practices" left out (untrue or nowhere to link; H36). "Your data" rows only with real destinations; "Lifestyle information" became "Your answers" → `/account?tab=skin`. Consents: the four `CONSENT_TEXTS` switches, each with "Draft wording" (H29); ai_share stays in `ConsentSection` below.
- BE2 note (orchestrator): export fetches with the ID token and saves a blob; 429 shows when to try again from Retry-After; 403 NOT_ALLOWED named.
- Follow-ups (orchestrator, after merge 7afc581): 20 shows no clock time ("Once a day" for the routine types, "Sundays" for the weekly check-in; stored times stay in the data only); product reminder rows are the current routine's products (`useRoutine`, the existing `/api/routine/events` read, which returns `currentRoutine`), each on/off from `prefs.products` (default off), disabled with `WAITS_ON.product_usage`; the name stays as typed (owner answer: their own input). Open questions 1-3 are answered by this.

## Hand-back

### Changelog
- `f29f4dc` feat(account): mockups 20, 21, 22 against the contracts, behind their flags; profile from stored fields.
- `d385e38` test(design): `tests/design/e.match.ts` shots and flag-on checks against the contract fixtures.
- `2ce2aa5` feat(account): export Retry-After and 403 lines.
- `042b915` style(account): type scale and spacing toward the mockups; kit requests E3-E5.
- Files: `app/(marketing)/account/{AccountView.tsx,copy.ts,page.tsx,profile.ts,accountApi.ts,NotificationsScreen.tsx,PrivacyScreen.tsx}`, `tests/account-mm.test.ts`, `tests/design/e.match.ts`.

### Per screen (overlay at 393, flags on, last run)
| Screen | Mean diff | Remaining differences and why |
|---|---|---|
| 20 Notifications | 23.8 | iOS status bar and header offset (allowed); the mockup's type is about 0.8× ours (10–13px) and the app's smallest size is 12px and the kit `ToggleRow` sets 16/14px, so rows are taller and fewer fit; sample routine lines ("Cleanser · Serum…") replaced by neutral notes; disabled types show their `WAITS_ON` line and an off, dimmed switch instead of green; no Custom reminder, no chevrons; weekly chip has no time; product rows only for stored product ids (fixture: one); bottom bar until integration. |
| 21 Profile | 20.8 | Status bar; title "Profile and settings"; kit `TabBar` pills and our three tabs (no Goals; "Privacy" not "Privacy & Data", pinned by specs); the header card keeps "Signed in as phone ending…", Sign out and Go to Today (pinned) and has no email, camera badge or Edit; rows only for stored fields (age band instead of DOB; no Goals/Language/Appearance); no answer-row chevrons; larger type as above; bottom bar. |
| 22 Privacy | 21.5 | Status bar; no "Your data belongs to you" card and no "We keep your data safe" card (untrue claims, H36; no privacy page to link); "Your data" rows differ (real destinations only); switch titles and copy from `CONSENT_TEXTS` (drafts) with "Draft wording"; `ConsentSection` (Echo sharing) and Location/reminders cards follow; larger type as above; bottom bar. |
320, 375 and 430 checked by eye: no horizontal scroll, nothing clipped; at 320 the 20 rows wrap the label beside the chip and switch.

### Flags
`notificationTypesUi()` (20), `consentsUi()` (22 Your data + Data controls), `dataExportUi()` (22 Download row). With 22's two flags off the Privacy tab is as today; with both 20/22 flags off only Profile/Skin changed (21 is not flagged by the brief).

### Contract changes needed (requests)
- E5: `CONSENT_TEXTS.product_improvement` uses "improve" (a `BANNED_WORDS` entry); reword at H29.

### Kit requests
E3 (`SettingsRow` note + action word), E4 (`ToggleRow` media slot), E5 (above) in `docs/lanes/kit-requests.md`.

### Assets
None downloaded. Icons are Lucide (already a dependency); product photos are the store's live images (TD-52), not files in the repo.

### Browser-test edits
None to existing specs. New: `tests/design/e.match.ts` (shots; with flags on it asserts the switches, the disabled evening type, "Every Sunday", the consent switch states and the Download row, routes answered from the fixtures).

### Open questions
1. 20 shows `morningTime`/`eveningTime` next to an on switch, but the contract says the daily push picks its own hour. Shown as the contract asks; it may read as a promise.
2. Product reminder rows exist only for ids already in `prefs.products`; nothing writes them yet. Should the list come from the user's routine products instead?
3. Name on Profile is the free text typed at the newest check. Keep, or show only initials?

### Test commands and results
- `npx tsc --noEmit`: pass (after the rebase onto `build/mockup-match`).
- `npm run lint`: no errors (only existing `<img>` warnings elsewhere).
- `npx vitest run`: 118 files passed, 21 skipped; 2456 tests passed, 98 skipped. Lane tests: `tests/account-mm.test.ts` (13: disabled types and WAITS_ON, PATCH body and token, roll-back on error and offline, consent version sent, VERSION_STALE, export blob and file name, Retry-After and 403, profile fields and dropped values, banned words in the new copy).
- Flags on, shots and flag-on checks: `NEXT_PUBLIC_UI_NOTIFICATION_TYPES=on NEXT_PUBLIC_UI_CONSENTS=on NEXT_PUBLIC_UI_DATA_EXPORT=on PW_ARGS="-c tests/design/match.config.ts tests/design/e.match.ts" bash scripts/with-stack-slot.sh npm run test:browser`: 4 passed (393, 320, 375, 430).
- Flags off, existing account specs: `PW_ARGS="tests/browser/flows.spec.ts tests/browser/dashboard.spec.ts tests/browser/home-v2.spec.ts" bash scripts/with-stack-slot.sh npm run test:browser`: 63 passed.
- After those runs, `page.tsx` changed only to keep `<AccountView />` as the flag-off element (`tests/privacy-delete-account.test.ts` pins it); unit tests re-run green. Stacks were stopped after each run (the script tears down).
- Overlays: `python3 -I tests/design/overlay.py /Users/divit/Projects/frontend/skin-check/design/mockups 20 21 22` → `docs/design/mockup-match/{20-notifications,21-profile,22-privacy}.png`.

Follow-up run (commit 175eb30, rebased on 7afc581):
- `npx tsc --noEmit` pass; `npm run lint` no errors; `npx vitest run` 120 files passed, 23 skipped; 2489 tests passed, 102 skipped.
- Flags-on `tests/design/e.match.ts` (now also asserts "Once a day" and no clock time): 4 passed.
- Flags-off `flows.spec.ts`, `dashboard.spec.ts`, `home-v2.spec.ts` (after the `page.tsx` change): 63 passed.
- Overlay mean diff: 20 = 23.9, 21 = 20.8, 22 = 21.5. Screen 20's remaining differences now also include "Once a day" / "Sundays" in place of the mockup's clock times (no promise the push cannot keep), and product rows from the routine.
