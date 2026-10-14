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

## Hand-back
