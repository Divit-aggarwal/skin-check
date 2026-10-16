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

- 2026-10-15 Base check: `npx tsc --noEmit` failed on the base:
  `tests/store-products.test.ts` imported `@/lib/contracts/store-products`,
  which moved to `lib/feature-contracts/` in 4e61bf7 (`npx vitest run`: that
  one file failed, 112 passed). Purely the rename. I fixed it locally in
  a298954. The orchestrator fixed it on build/mockup-match (d1c2af3); after
  `git rebase build/mockup-match`, git dropped a298954 as already upstream.
- Rules: two marked `mm:be3` blocks, not one. `sideImagesOk` has to be AND-ed
  into the existing `skinChecks` `allow create` expression (a second
  `allow create` would be OR-ed and let a record with valid sides skip every
  front check), so one line sits inside that expression with its own
  `// ── mm:be3 ──` markers; the functions and the `checkins` match are in the
  second block under `/users/{uid}`. No character outside the markers changed.
- Production IAM (owner action, not a code change): the live upload principal
  `skin-check-uploader` may only `s3:PutObject` on `users/*/scans/*/original.jpg`,
  and the reader `skin-check-photo-reader` only `s3:GetObject` on the same
  pattern (tracker G04/H01, `.env.example`, runbook S7). Left and right
  uploads and reads will be refused in production until both policies also
  name `left.jpg` and `right.jpg`. Locally S3Mock does not enforce policies.
  Logged here, not changed (`.env.example` policy text and the runbook are
  the owner's). BE2 found the same for the reader. No IAM changed.
- Migration: none. `sideImages` is a new optional field, `checkins` a new
  collection; nothing existing is rewritten.
- Erase: no erase code change. `eraseSteps(uid).firestore()` is
  `recursiveDelete(users/{uid})`, which takes `checkins` with the rest; the
  stack test proves it.

## Hand-back

### Changelog
(After the rebase onto build/mockup-match.)
- f099c8e feat(checkins): `POST/GET /api/checkins` (`app/api/checkins/route.ts`);
  rules `mm:be3` blocks (checkins, `skinChecks.sideImages`); `tests/checkins-route.test.ts`,
  `tests/firestore-rules-be3.test.ts`.
- f1e8a76 feat(photos): `angle` on `POST /api/skin-scan/upload` and
  `GET /api/checks/photo`; `saveSkinCheck(..., productNames, sidesStored?)`
  writes `sideImages`; `tests/side-photos.test.ts`; add-only cases in
  `tests/upload-route.test.ts` and `tests/checks-photo-route.test.ts` (the
  photo test's fake `DocumentSnapshot.get` now resolves dotted paths, as
  Firestore does).
- 2f31681 test(e2e): `tests/three-angle.e2e.test.ts` (stack test).
- last commit: this Log and Hand-back.

### What was built
- `POST /api/checkins` `{ answers, scanId?, timeZone? }` → 201 `CheckinRecord`.
  Doc `users/{uid}/checkins/{YYYY-Www}`: ISO week (ISO week-year) of today in
  `timeZone` (default Asia/Kolkata), `create()`, so the second submit that week
  is 409 `ALREADY_THIS_WEEK`. Strict body (a `uid`, `checkinId` or `createdAt`
  is 400); every question id and option id checked against `CHECKIN_QUESTIONS`;
  at least one answer. `scanId` malformed → 400; not one of the caller's own
  checks → 403 `NOT_ALLOWED`. Erased account or under-18 record → 403
  `NOT_ALLOWED` (the Admin SDK skips the rules' gates, so the route repeats
  them). Per-IP burst limit plus 30 posts per uid per day → 429 `TOO_MANY`.
  `createdAt` is `Timestamp.now()` on the server, so the reply equals the record.
- `GET /api/checkins?limit=12` (1 to 52) → `{ checkins }` newest first, own only.
- Upload: optional `angle` (absent = front; `front`, `left`, `right`; anything
  else, `null` included, is 400 `INVALID_ANGLE`). Same rate, token, consent,
  size and age checks; each angle writes its own image-retention ledger entry
  (event shape unchanged, no angle field in it).
- Photo: `angle=left|right` reads `sideImages.<angle>.stored === true` on the
  caller's own record and checks the object exists; any other angle is the
  same uniform 404.
- `saveSkinCheck`: `sidesStored?: { left: boolean; right: boolean }`. Absent →
  no `sideImages` field. Present → both sides; `{ stored: true, storage: "s3", key }`
  only for a side the caller says landed AND retention consent at the current
  version; otherwise `{ stored: false }`.
- Engine: unchanged. Test posts extra `left`/`right` files and `angle` to
  `/api/skin-scan`; the one upstream call carries only `image` with the front
  bytes. The stack test checks the only analysis record's `inputSha256` is the front's.
- Gemini: test that `lib/echo-trusted-context.ts`, `lib/context/builder.ts`,
  `lib/context/chat.ts` and the chat route never mention check-ins, and the
  route imports nothing from Gemini or the context.

### S3 key layout
- `users/{uid}/scans/{scanId}/original.jpg` front (unchanged)
- `users/{uid}/scans/{scanId}/left.jpg`, `.../right.jpg` new, built only by
  `sideImageKey` from the verified uid; same bucket, same consent, same erase
  prefix `users/{uid}/`.

### Rules diff (firestore.rules)
- In `skinChecks` `allow create`, between `questionnaireIsKnown()` and
  `productNamesOk(...)`: `&& sideImagesOk(uid, checkId)`, wrapped in `mm:be3` markers.
- New `mm:be3` block before `lane:routine` under `/users/{uid}`:
  - `sideImagesOk`: absent, or a map with exactly `left` and `right`.
  - `sideImageOk`: `stored` is a bool; `{ stored: false }` alone, or
    `{ stored: true, storage: 's3', key }` with key exactly
    `users/<uid>/scans/<checkId>/<left|right>.jpg`, plus `sideRetentionConsented()`.
  - `sideRetentionConsented`: the front's consent clause, same version list
    (a unit test pins both lists to `IMAGE_RETENTION_CONSENT_VERSIONS`).
  - `match /checkins/{checkinId}`: owner `get, list`; `write: if false`.
- Create-only is unchanged (`allow update, delete: if false`).

### Flags
`NEXT_PUBLIC_UI_WEEKLY_CHECKIN`, `NEXT_PUBLIC_UI_THREE_ANGLE`: untouched, off in code.
No UI in this lane.

### Contract changes needed
None. Requests for others (no shared file touched):
- Lane B: `lib/api.ts` `uploadOriginalImage` has no `angle` yet; the client
  needs to send `angle` and pass `sidesStored` to `saveSkinCheck`. Left to
  lane B, who owns the capture flow.

### Assets
None.

### Browser-test edits
None.

### Open questions
1. Owner item: extend the uploader and reader IAM policies to `left.jpg` and
   `right.jpg` before three-angle goes live (see Log). Without it, side
   uploads fail in production while the front keeps working.
2. Owner review of the rules change above before any rules deploy.
3. BE2: `lib/feature-contracts/data-export.ts` already lists `checkins`; the
   export should also include the side photos (`sideImages` keys).
4. One ledger entry per angle (three per three-angle check). Fine, or should
   the side presigns skip the ledger write?

### Tests
All on the rebased tree (base build/mockup-match 7cecd64):
- `npx tsc --noEmit`: exit 0. `npm run lint`: no errors (existing `<img>` warnings in `components/ui/kit.tsx` only).
- `npx vitest run`: 117 files passed, 21 skipped; 2443 tests passed, 98 skipped.
- `bash scripts/with-stack-slot.sh npm run test:local`: exit 0. Unit phase as above,
  then stack phase 20 files / 97 tests passed, including
  `tests/firestore-rules-be3.test.ts` (11) and `tests/three-angle.e2e.test.ts` (1).
  Before the rebase the same run also passed (stack 19 files / 96 tests).
- New or changed unit tests: `tests/checkins-route.test.ts` (12), `tests/side-photos.test.ts` (6),
  add-only cases in `tests/upload-route.test.ts` (+11) and `tests/checks-photo-route.test.ts` (+4).
- No browser specs (no UI in this lane). The stack was stopped after each run.
