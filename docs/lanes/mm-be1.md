# BE1: notification preferences (G31) and separate consents (H36)

Read `docs/lanes/mm-README.md` first. Contracts: `lib/feature-contracts/notifications.ts`,
`lib/feature-contracts/consents.ts` (read-only; request changes).

## Build
1. `GET/PATCH /api/account/notifications` (`app/api/account/notifications/route.ts`) exactly as the contract says.
   - Doc `users/{uid}/settings/notifications`, written only by this route (Admin SDK).
   - On GET with no doc: return the defaults. A user whose `settings/home.reminders` is `"allowed"` reads `routine_morning: true` (no migration; computed on read).
   - Use the patterns of `app/api/home/reminders/route.ts` and `app/api/home/_auth.ts`: rate limit, `verifiedUid`, erased and under-18 markers, small JSON body.
   - 409 `NOT_SENDABLE` and `NEEDS_CONSENT` as in the contract.
2. The daily push (`lib/home/push.ts` `sendReminders`) sends only to users whose prefs have `routine_morning` or `weekly_checkin` on (and, for `weekly_checkin`, only on `weeklyCheckinDay`).
   - With no prefs doc, the current behaviour stays.
3. `GET/POST /api/account/consents` (`app/api/account/consents/route.ts`) over the existing ledger (`app/api/account/_ledger.ts` `appendConsent`).
   - New purposes go into `ConsentPurpose` (`lib/consent.ts`); the copy and versions come from the contract.
   - GET also reads `ai_share`.
   - Each grant and withdrawal is one ledger entry with its timestamp and version, and the newest wins.
4. Wire each withdrawal as the contract says:
   - `personalisation` off hides the routine and Echo's product suggestions (Echo itself still answers).
   - `marketing` off forces the `marketing` notification type off.
   - Keep the code paths small, and test each one.
5. `firestore.rules`, inside your `mm:be1` block:
   - `settings/notifications`: owner may `get`, no client write.
   - The existing `settings/{name}` rule only allows `home`, so check that it still denies `notifications` for writes.
   - Add rules tests (emulator) next to `tests/firestore-rules-home.test.ts`.
6. Erase: make sure account erase removes `settings/notifications`. The `users/{uid}` tree sweep may already cover it; prove it with a test.
7. Flags: leave `NEXT_PUBLIC_UI_NOTIFICATION_TYPES` and `NEXT_PUBLIC_UI_CONSENTS` off in code. The main session turns them on for the preview.

## Not yours
Screens 20 and 22 (agent E), `lib/feature-contracts/*`.

## Tests
Unit tests for the route (auth, validation, 409s, defaults, computed `routine_morning`), sendReminders filtering, the consent route (versions, stale version, newest wins) and the withdrawal effects; rules tests; one stack test: grant then withdraw, then read back.

## Log

## Hand-back
