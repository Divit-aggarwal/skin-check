# BE3: weekly check-in record (E19) and side-photo storage (C10)

Read `docs/lanes/mm-README.md` first. Contracts: `lib/feature-contracts/checkin.ts`,
`lib/feature-contracts/check-photos.ts` (read-only).

## Build
1. `POST/GET /api/checkins` (`app/api/checkins/route.ts`) as the contract says.
   - Doc `users/{uid}/checkins/{YYYY-Www}` (ISO week in the given time zone, default Asia/Kolkata), created with `.create()`, so a second submit in the same week is 409.
   - Validate every question id and option id against `CHECKIN_QUESTIONS`.
   - `scanId`, if given, must be a valid scan id of this user.
   - Never sent to Gemini: add a test that `lib/echo-trusted-context.ts` and the context builder never read `checkins`.
2. Side photos, upload: `POST /api/skin-scan/upload` accepts optional `angle` ("front" default, "left", "right").
   - Same consent, size and rate checks.
   - The key comes from `sideImageKey` for sides; front is unchanged.
3. Side photos, record: `skinChecks` gains optional `sideImages` (`lib/firebase/skin-checks.ts`).
   - Write `stored: true` only for an object the client watched land; see the front image's comment.
   - Rules, in your `mm:be3` block inside the `skinChecks` match: `sideImages` is optional; each key must equal `users/<uid>/scans/<scanId>/<left|right>.jpg` for this uid; it needs the same retention consent as the front.
   - Keep the create-only rule.
4. Side photos, read: `GET /api/checks/photo?scanId=…&angle=left|right`, same ownership checks as front.
5. The engine call is unchanged: only the front photo is analysed. Add a test that proves it.
6. Rules for `checkins`: owner may read, no client write. Erase covers it (prove with a test).
7. Migrations: none expected (new optional field, new collection). If you find you need one, stop and log it. Migrations go to the owner first.
8. Flags: `NEXT_PUBLIC_UI_WEEKLY_CHECKIN` and `NEXT_PUBLIC_UI_THREE_ANGLE` stay off in code.

## Not yours
Screens 05, 07, 08 (agent B), `lib/feature-contracts/*`, `lib/s3-key.ts` (request it if `sideImageKey` should move there).

## Tests
- Unit: route validation, the week id, 409, only own scanId.
- Upload `angle` and photo `angle`.
- Rules tests for `sideImages` and `checkins`.
- Stack test: three-angle upload, then save, then read each angle back.

## Log

## Hand-back
