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

- 2026-10-15 Base check: `npx tsc --noEmit` failed on `tests/store-products.test.ts` (moved contract import), so `test:local` stopped at its unit step. Filed as BE1-2 (commit 2211c1b's message still names it), dropped at rebase as a duplicate of BE2-1; fixed by the main session in d1c2af3; rebased onto `build/mockup-match`. One earlier stack attempt ran with a temporary, uncommitted one-line patch to that file; it was stopped while still waiting for a slot, the file reverted, nothing committed.
- Found: `CONSENT_TEXTS.product_improvement` (title and copy) hits `BANNED_WORDS` (`improve*`). Kit request BE1-1; pinned with `it.fails` in `tests/mm-be1-account.test.ts`.
- Open (rule 10, not built): "personalisation off hides the routine". No recommended routine exists outside `app/dev`; the only routine is the user's own record (`/api/routine/events`, chosen by the user, reads no scans, used by 8 components on other lanes' screens). Hiding a user's own record on a guess was not done. Question below.
- Browser-test edits: none. Existing test files: none edited.

## Hand-back

### Changelog
- `GET/PATCH /api/account/notifications` (`app/api/account/notifications/route.ts`): `_auth` helpers (rate limit, `verifiedUid`, per-uid cap, small JSON). Strict zod body (known types only, `HH:MM`, day 0..6 integer, catalogue product ids). No doc: defaults, `routine_morning` = `settings/home.reminders === "allowed"` (computed, nothing written), `updatedAt: ""`. PATCH merges onto what GET shows (so a first save keeps the computed `routine_morning`); `products` merge per id. 409 `NEEDS_CONSENT` is checked before `NOT_SENDABLE`; switching off is always allowed. 403 `NOT_ALLOWED` on PATCH for an erased account, and for an under-18 account switching a type on; an under-18 account can always switch off (as `DELETE /api/home/reminders`). GET stays readable. `types.marketing` reads off without the marketing grant (read-time AND; nothing rewritten on withdrawal).
- `lib/home/push.ts` `sendReminders`: also reads `settings/notifications`. No doc: today's rule. With a doc: sends when `routine_morning` and a routine step is due, or `weekly_checkin` and today (subscription's time zone) is `weeklyCheckinDay`. `home.reminders === "allowed"` stays the master gate. New pure `wanted()`.
- `GET/POST /api/account/consents` (`app/api/account/consents/route.ts`): GET returns the five switches in screen order (ai_share read at `AI_SHARE_CONSENT_VERSION`, default false). POST strict, `NewConsentPurpose` only, 409 `VERSION_STALE`, 403 for an erased account or an under-18 grant (an under-18 account can always withdraw; personalisation starts on), 500 `LEDGER_UNAVAILABLE`; one `appendConsent` entry per change with the contract copy (hashed). Newest entry at the current version wins; older versions give the default with `version: null`.
- `lib/consent.ts`: `ConsentPurpose` gains `personalisation`, `product_improvement`, `research`, `marketing`. `_ledger.ts`: `latestEntry()` (grant + ISO time); `latestGrant` now uses it (same behaviour).
- Personalisation withdrawn: `handleContextChat({ personalised })` drops own products (no product list to Gemini, `products: []`), Echo still answers; the opening (new or stored) returns 404 `ECHO_PRODUCTS_OFF` before anything is spent. Read via `latestGrant ?? default (on)`; an unreadable ledger means no products (fails closed), the answer still goes out.
- Marketing withdrawn: the marketing type reads off (above). product_improvement / research: recorded only, as the contract says.

### Rules change (`firestore.rules`, inside `// ── mm:be1 ──` only)
```
match /settings/notifications {
  allow get: if request.auth != null && request.auth.uid == uid;
}
```
Owner get only. Writes stay denied: the existing `settings/{name}` rule allows writes to `home` only (proved by tests). Nothing outside the block changed.

### Migration
None. `routine_morning` for existing reminder users is computed on read.

### Erase
`settings/notifications` is under `users/{uid}`, removed by the erase's recursive delete; proved on the stack (`tests/mm-be1.e2e.test.ts`: doc exists, erase, doc gone).

### Flags
`NEXT_PUBLIC_UI_NOTIFICATION_TYPES`, `NEXT_PUBLIC_UI_CONSENTS` untouched (off).

### Contract requests
BE1-1 (product_improvement copy hits `improve*`). No contract file edited.

### Assets / screens / overlays
None (backend lane).

### Open questions
1. "personalisation off hides the routine": which routine? The only one is the user's own record. Options: (a) leave it (consent copy is about our suggestions; Echo products already off), (b) `/api/routine/events` returns an empty `routine` plus a flag and the UI shows a designed state. BE1 did (a) pending a decision.
2. `weekly_checkin` sends on the chosen weekday whether or not a check is due (nextCheck "today" is one exact day, so ANDing would almost never fire). Confirm.
3. Marketing: with the grant it is still `NOT_SENDABLE` (not in `SENDABLE_TYPES`), so it can never be stored on today. Intended?
4. Defaults carry `updatedAt: ""` (the type needs a string).
5. `app/(marketing)/echo/page.tsx` and `app/(marketing)/dashboard/page.tsx` pass `productsOn={echoProductsOn()}` from the switch alone. With personalisation withdrawn an entry to the opening may still show, and the opening now answers 404 `ECHO_PRODUCTS_OFF`. UI follow-up: pass the personalisation state (from `GET /api/account/consents`) to those screens.

### Tests (all pass)
- `npx tsc --noEmit`: clean (after rebase onto d1c2af3).
- `npx vitest run`: 117 files passed, 21 skipped; 2445 tests passed. New: `tests/mm-be1-account.test.ts` (28), `tests/mm-be1-echo-personalisation.test.ts` (5).
- `bash scripts/with-stack-slot.sh npm run test:local`: unit step as above; stack step 20 files, 89 tests passed, including `tests/firestore-rules-notifications.test.ts` (3) and `tests/mm-be1.e2e.test.ts` (1: grant then withdraw marketing, read back, NEEDS_CONSENT, save switches, erase removes the doc). Stack stopped. This stack run was at 58f7a86, before the under-18 withdrawal fix (the e2e does not touch the markers; the fix is covered by unit tests).
- `npx next lint` on touched files: clean.
