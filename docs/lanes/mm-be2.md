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

## Hand-back
