# BE2: data export (H37)

Read `docs/lanes/mm-README.md` first. Contract: `lib/feature-contracts/data-export.ts` (read-only).

## Build
1. `GET /api/account/export` (`app/api/account/export/route.ts`): signed-in, rate limited (3 a day per uid plus the per-IP limiter), erased marker → 403.
2. Read every collection in `EXPORT_COLLECTIONS` under `users/{uid}` with the Admin SDK.
   - Firestore Timestamps become ISO strings.
   - `checkins` may not exist yet (BE3); an empty list is fine.
   - Never read another user's path; the uid comes only from the verified token.
3. Photos: for each check, add a signed GET (`EXPORT_LINK_SECONDS`) for every angle that exists.
   - Front uses `scanImageKey`, sides use `sideImageKey` (`lib/feature-contracts/check-photos.ts`); check existence with `originalExists`.
   - Add a presign helper in `lib/s3.ts` with the export TTL, next to `presignOriginalRead`.
4. Keep the JSON under `EXPORT_MAX_BYTES`. If it is over, cut the largest collection (oldest entries first), set `truncated: true`, and say so in `notIncluded`.
5. `notIncluded` names, in plain words, Google's copy of Echo messages and anything else that is not ours.
6. Response: `Content-Disposition: attachment; filename="project-skin-data-YYYY-MM-DD.json"`, `Cache-Control: no-store`.

## Not yours
The "Download my data" row on 22 (agent E).

## Tests
- Unit: auth, rate limit, timestamp conversion, truncation, only own paths.
- Stack test: a seeded user gets their own data, and a second user's data never appears.
- S3 presign test for the new helper.

## Log

- Base check: `npx tsc --noEmit` fails on the base (one error, `tests/store-products.test.ts` imports the old `@/lib/contracts/store-products`); `npx vitest run` 1 file failed (the same), 112 passed, 2392 tests passed. Not mine: kit-requests row BE2-1.
- Because of that, `npm run test:local` stops at its unit step. Both stack runs below had the one-line import fix applied locally, then reverted with `git checkout` (never committed).
- First stack run: my e2e timed out at vitest's 5 s default (next dev compiles the route on the first request); `longitudinal-series.e2e` also timed out once (base test, passed on the rerun). Added a 120 s timeout, as `routine.e2e` has. Second run green.
- No seed file: `scripts/local-stack.sh` only runs `scripts/seed-lane-*.ts`, so the e2e test seeds its own two users with the Admin SDK (uids `mm-be2-export-a/-b`, phones +919999937201/2).
- Contract has no slot for the profile doc and push subscriptions: named in `notIncluded`, kit-requests row BE2-2.

## Hand-back

### Changelog
- `app/api/account/export/route.ts` (new): `GET /api/account/export`. Order: per-IP burst (`checkRequestRate`, scope `account-export`, 10/min) → Bearer token, verified with revocation → uid must be one plain segment (else 403) → `erasedAccounts/{uid}` → 403 `NOT_ALLOWED` → 3 a day per uid → build, cut to size, send. 200 body is the exact string measured; headers `Content-Disposition: attachment; filename="project-skin-data-YYYY-MM-DD.json"` (India-time date, as Echo's quota day), `Cache-Control: private, no-store, max-age=0`, `Vary: Authorization`. Errors: 401 `AUTH_REQUIRED`, 403 `NOT_ALLOWED`, 429 `TOO_MANY` with `Retry-After`, 500 `EXPORT_FAILED`; all no-store; logs carry error names only.
- `app/api/account/_export.ts` (new, not routed, like `_ledger.ts`): `consumeExport` (durable per-uid limit), `toPlain` (Timestamps to ISO strings at any depth), `buildExport` (every `EXPORT_COLLECTIONS` list under `users/{uid}`, oldest first by document create time; photo links), `serializeWithinLimit` (cuts the largest collection's oldest entries, recounted every pass, sets `truncated`, adds a plain note per cut collection), `NOT_INCLUDED`.
- `lib/s3.ts`: `presignExportRead(key)`, the read pair, `EXPORT_LINK_SECONDS`, response private/no-store, `Content-Disposition: attachment`.
- Photos: a link per angle only when the record says kept (`image.stored === true` for front, `sideImages[angle].stored === true` for left/right) AND `originalExists` finds the object; keys only from `scanImageKey`/`sideImageKey` with the verified uid and a valid scan id. Photo links are listed for every kept photo even when the size cut drops older check records (a link is small; the photo is still the user's).
- `notIncluded` (always): Google's copy of Echo messages (H26 wording); the Firebase Auth sign-in account; the photos themselves (links only, expiry stated); the profile doc, push subscriptions and the daily Echo/download counters.

### New Firestore path (no rules change)
`users/{uid}/exportUsage/daily = { day, count }`, Admin SDK only. No rule matches it, so clients are denied by default; the account erase's recursive delete removes it; not in `EXPORT_COLLECTIONS`. `firestore.rules`: not touched. Migration: none. New S3 key layouts: none (reads the C10 layout from `check-photos.ts`).

### Screens, overlay, flags, assets, browser-test edits
None (backend only). No UI flag used. No assets. No browser specs touched.

### Contract changes needed (as requests)
None to `data-export.ts` to make this work. Kit-requests BE2-1 (stale base import) and BE2-2 (profile doc and push subscriptions in the export?).

### Open questions
1. Production IAM (owner): the read pair is scoped to `users/*/scans/*/original.jpg` (comment in `lib/s3.ts`). A HEAD on `left.jpg`/`right.jpg` then answers 403, which `originalExists` reads as "missing", so side-photo links will silently never appear in production until the read policy also covers `left.jpg` and `right.jpg` (also needed by BE3's photo route). S3Mock does not enforce this, so the tests pass.
2. Agent E: the route is Bearer only. The "Download my data" row must `fetch` with the ID token and save the response as a blob (filename from `Content-Disposition`); a plain `<a href>` cannot send the token. Handle 429 (`Retry-After`) and 403.
3. A failed build after the limit is counted still uses one of the 3 daily tries (fail closed, same as Echo). Fine for now?
4. BE2-2 above.

### Tests
- `npx tsc --noEmit`: only the base error in `tests/store-products.test.ts` (BE2-1); nothing from this lane.
- `npm run lint` scoped to my files (`next lint --file …`): no warnings or errors.
- `npx vitest run tests/account-export.test.ts tests/s3-export.test.ts tests/s3-read.test.ts`: 3 files, 21 tests passed (auth, plain uid, erased, 3 a day then 429, timestamp conversion, truncation incl. moving to the next collection, only own paths and keys, photo gating, no uid/key/URL in logs, banned words over `notIncluded`, presign TTL/headers/fail closed).
- `bash scripts/with-stack-slot.sh npm run test:local` (PORT_BASE 4100, with the BE2-1 fix applied locally and reverted): exit 0. Unit 115 files passed, 19 skipped, 2412 tests passed; stack 18 files, 85 tests passed, incl. `tests/account-export.e2e.test.ts` (two seeded users; each export holds only its own docs; both photo links fetch the user's own S3Mock objects; no token 401; erased marker 403). Stack stopped, no containers left.
