# Lane E: account and privacy (20, 21, 22)

Read [redesign-lanes.md](redesign-lanes.md) first. Branch `lane/redesign-account`,
worktree `../skin-check-rd-account`, PORT_BASE 4400.

## Screens

| # | Mockup | Becomes | Route / components |
|---|---|---|---|
| 20 | 20-notifications.png | Notifications: the existing reminders switch live (allowed / not now / refused / unsupported, TD-47); per-type switches (routine morning/evening, weekly check, product reminders, summary, tips, marketing) **behind `notificationTypesUi()`** (G31), rendered disabled with "Comes later". No times or "Add reminder" | `/account` section or `/account?tab=notifications` (no new route), `components/dashboard/HomeSettingsSection.tsx`, `homeSettings.ts` |
| 21 | 21-profile.png | Account with tabs Profile / Skin / Privacy (Goals has no data: omit the tab and log it): Profile = phone ending, city (existing), sign out; Skin = the saved answers card and "Update your answers" (`QuestionsCard` → `/questions`); Privacy → screen 22 | `app/(marketing)/account/AccountView.tsx`, `copy.ts` |
| 22 | 22-privacy.png | Privacy and data: live = AI sharing on/off (`ConsentSection`, `ai_share`), the photo kept / not kept line, location and reminders state, delete account (the real `/api/account/erase` flow with typed confirmation, destructive styling). **Behind `consentsUi()`** (H36): image processing, personalisation, Echo context, research, marketing as separate disabled switches with "Comes later". **Behind `dataExportUi()`** (H37): Export my data, disabled. No "never shared with third parties" (untrue: Gemini, AWS) | `components/dashboard/ConsentSection.tsx`, `app/(marketing)/account/DeleteAccount.tsx` |

You own: `app/(marketing)/account/**`, `components/dashboard/ConsentSection.tsx`,
`HomeSettingsSection.tsx`, `homeSettings.ts` (presentation only), their copy,
tests for them. Read-only: `lib/consent.ts`, `lib/erase.ts`, `lib/home/*`,
`app/api/**`, `components/dashboard/PermissionsScreen.tsx` (Phase 2).

## Data

- Have: phone number (auth), city and location/reminder permission states
  (`settings/home`), consent ledger purposes `image_retention`, `processing`,
  `ai_share`, `age_18_plus` (only `ai_share` revocable in the UI), saved
  answers, erase flow (typed "DELETE MY DATA", recent sign-in, daily sweep).
- Don't have: name/email/gender/birth-date profile fields beyond the
  questionnaire answers, goals, per-type notification settings and times
  (G31), the new consent purposes (H36), export (H37).

## Locked here

TD-47(3) permissions asked once after the first results; H29 legal review
for new consent copy (the H36 switches carry DRAFT wording); H34 location
line (LEGAL REVIEW NEEDED) unchanged; TD-19/H26 the delete copy's 2-day
promise; ROUTINE_PURPOSE_COPY is a statement, not a switch; never claim no
third-party processing.

## Tests

`tests/browser/dashboard.spec.ts` (privacy states), `home-v2.spec.ts`
(account location and reminders), `flows.spec.ts` (delete), `tests/privacy*.test.ts`,
`tests/erase*.test.ts`, `tests/home-v2*.test.ts`, `tests/ui-wording.test.ts`.

## Log

- **Structure (21):** `/account` keeps one route; tabs Profile / Skin / Privacy are `TabBar` links (`/account`, `?tab=skin`, `?tab=privacy`); Notifications (20) is `?tab=notifications`, reached from Profile's Settings card, with a back link. The tab is read in the browser (`useSearchParams`) inside a `Suspense` boundary in `page.tsx`, so the page stays static and `tests/privacy-delete-account.test.ts` (which pins `<AccountView />` in the page source) still holds. Old links to `/account#delete-account` open the Privacy tab.
- **Goals tab omitted (21):** no goals data (TD-50 f, report §3 item 9).
- **Data gap (21 Profile):** no name, email, gender or birth date (phone-only auth); Profile shows the existing "Signed in as <phone>" + Sign out (full number, as today; the mockup's avatar initials and Edit are not built), the Home link, and a Settings card: City (value from `settings/home`, only while weather is on), Notifications, Privacy and data.
- **Data gap (21 Skin):** there is no saved-answers view: answers belong to a check, and `/questions` only answers the newest check's waiting questions. Skin shows `QuestionsCard` (→ `/questions`) while questions wait; otherwise a card saying answers are kept with each check and can be changed at the next check, with "Start a new check". No "Update your answers" link that would dead-end.
- **Location and reminders kept whole (22):** `HomeSettingsSection` stays one section ("Location and reminders", pinned by `home-v2.spec.ts`) on the Privacy tab. Notifications (20) renders the same component with `part="reminders"` (heading "Daily reminder", the live reminders control only; when reminders are off it shows the existing "not available yet" line instead of nothing, so 20 always has content). Location stays on Privacy, not on 20.
- **Live controls unchanged:** "Stop sharing", "Turn reminders on/off", city change/remove, delete with typed "DELETE MY DATA" keep their roles, names and behaviour; AI sharing and reminders are not turned into switches (AI sharing can only be withdrawn here; reminders have four states, TD-47).
- **Flags:** `notificationTypesUi()` (G31): seven types (morning routine, evening routine, weekly check, product reminders as one row, weekly summary, tips from Echo, product launches and offers) as `ToggleRow`s, never on, `busy` (aria-disabled), "Comes later", plus "Nothing here is saved yet". No times, no "Add reminder", no per-product rows. `consentsUi()` (H36): "More sharing choices" with a **Draft** tag, five rows (processing my photos, personalising my routine and Echo, Echo using my past checks, research without my name, product news and offers), same disabled pattern; DRAFT wording pending H29. `dataExportUi()` (H37): "Download my data" as a plain, non-interactive row with "Comes later".
- **Not built (22):** "Your data belongs to you" / "We keep your data safe… never shared with third parties" (untrue: Gemini, AWS); "Skin Twin" title (banned); per-data "Manage" rows (no backend). The delete card keeps `ERASE_COPY` including the Gemini line and the 2-day promise (TD-19/H26).
- **Corners:** `DeleteAccount` `rounded-2xl` → `rounded-card`, input `rounded-tile`; the destructive card has a red border, a Trash icon on the `error-soft` well, red primary "Delete permanently".
- **Kit requests:** E1 (`ToggleRow` disabled), E2 (`SettingsRow` disabled look), in `kit-requests.md`.
- **Browser-test edits (add-only, one line each, a tab click before assertions that moved):**
  - `dashboard.spec.ts`: `accountAs` helper (privacy tests) and the "empty" test: click Privacy.
  - `flows.spec.ts`: "Echo asks for AI-share consent first", "withdraw AI-share consent…", "account: sign-in lands on Home…" (after the "Signed in as" check), "one history list…" (×3 via the loop): click Privacy.
  - `home-v2.spec.ts`: "never asked…", "reminders: Account turns them on…", "Account: change the city and remove it": click Privacy.
  - `questionnaire.spec.ts`: "skipped check: Home and Account cards…": click Skin.
  - The delete test (`/account#delete-account`) needed no edit.

## Hand-back

**Changelog**

| File | Change |
|---|---|
| `app/(marketing)/account/page.tsx` | `Suspense` boundary around `AccountView` (tab read with `useSearchParams`) |
| `app/(marketing)/account/AccountView.tsx` | 21: tabs Profile / Skin / Privacy (`TabBar`), Profile (tint card: Signed in, phone, Sign out, Go to Today; Settings card: City, Notifications, Privacy and data), Skin (`QuestionsCard` or the answers card); 22: Privacy tab (`ConsentSection`, H36 rows behind `consentsUi()`, `HomeSettingsSection`, H37 row behind `dataExportUi()`, delete); 20: `?tab=notifications` (back link, daily reminder live, G31 rows behind `notificationTypesUi()`); `#delete-account` opens Privacy |
| `app/(marketing)/account/copy.ts` | New strings (tabs, settings rows, notifications, draft consents, export) |
| `app/(marketing)/account/DeleteAccount.tsx` | Destructive card on 16px corners, Trash icon well, tokens; logic unchanged |
| `components/dashboard/ConsentSection.tsx` | Shield icon well; the (unused) delete link points at `?tab=privacy#delete-account` |
| `components/dashboard/HomeSettingsSection.tsx`, `homeCopy.ts` | Icon well; `part="reminders"` for screen 20 ("Daily reminder", with loading and "not available yet" states) |
| `tests/browser/*.spec.ts` | Add-only tab clicks (Log) |
| `tests/design/redesign-account.shots.ts` | 375px shots into `docs/design/redesign/account/` |

**Deviations and why:** see Log (no Goals tab, no name/email/avatar/Edit, no saved-answers view, no times or per-product reminders, no "Manage" rows, no "never shared" or "data belongs to you" banners, no "Skin Twin"). Notifications is a view of `/account`, not a new route. Full-page shots show the fixed bottom bar mid-page (screenshot artefact, as in Phase 2).

**Flags used:** `notificationTypesUi()` (G31), `consentsUi()` (H36), `dataExportUi()` (H37); all off by default; with them on nothing saves (switches `aria-disabled`, never on; export is not a link). Flag-on shots were taken on a stack started with `NEXT_PUBLIC_UI_NOTIFICATION_TYPES=on NEXT_PUBLIC_UI_CONSENTS=on NEXT_PUBLIC_UI_DATA_EXPORT=on` through the slot wrapper (`*-flags.png`; the spec fails if the flagged rows are missing).

**Browser-test edits:** 10 added lines, listed in the Log; nothing deleted or weakened.

**Kit requests:** E1 `ToggleRow` disabled, E2 `SettingsRow` disabled look.

**Open questions:** (1) Should the questions card also show on Profile while questions wait (TD-33 (1) put it on Account's first screen; it is now on the Skin tab)? (2) Profile shows the full phone number (existing component); the brief says "phone ending": masking needs a `PhoneOtpForm` change (not owned by this lane). (3) H36 draft labels need H29 legal wording.

**Tests**

- Baseline before changes: `npx tsc --noEmit && npx vitest run`: 2367 passed, 85 skipped (126 files: 108 passed, 18 skipped).
- Final: `npx tsc --noEmit` clean; `npm run lint` no errors (existing `<img>` warnings in the kit only); `npx vitest run`: 2367 passed, 85 skipped.
- `PW_ARGS="tests/browser/dashboard.spec.ts tests/browser/flows.spec.ts tests/browser/home-v2.spec.ts tests/browser/questionnaire.spec.ts" bash scripts/with-stack-slot.sh npm run test:browser`: exit 0; stack part 28 passed, browser 77 passed (17.7 min).
- Shots: `PW_ARGS="-c tests/design/playwright.config.ts tests/design/redesign-account.shots.ts --project=390" bash scripts/with-stack-slot.sh npm run test:browser`: 1 passed (flags off), 1 passed (flags on).
