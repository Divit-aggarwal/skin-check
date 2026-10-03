# Lane brief: privacy (H01, H02, H03)

Branch `lane/privacy`, worktree `../skin-check-privacy`, `PORT_BASE=3400`. Read [README.md](README.md) first: lane rules, ports, shared files.

## Tasks

| ID | Task | Starts as | Deliverable in this lane |
|---|---|---|---|
| H01 | Consent, retention and deletion fan-out: a server-written consent ledger (D-16), and user erasure in the order S3, then Firestore `recursiveDelete`, then Auth (D-17) | BLOCKED (IAM, retention) | Design brief, then ledger and erasure route against the local stack, with S3Mock standing in for S3. Production needs the owner's erasure IAM principal and a retention decision; record both as open |
| H02 | 18+ gate and safety UX: server-side 18+ attestation; re-confirm `female_skin_context` and `current_products` on every scan; stop storing the phone number in answers (D-19) | NOT STARTED | 1. Gate brief for D-19. 2. After owner approval: implementation and tests |
| H03 | Gemini data audit: what reaches Gemini, where it is processed and logged; consent and minimisation | OWNER ACTION (G1) | A field inventory of every prompt input, from `lib/gemini.ts`, `lib/echo-trusted-context.ts` and `lib/skin-check-format.ts`, plus a minimisation proposal (for example, the user's name in the system instruction, GATE_02 §7.12). Key ownership and tier stay with the owner (G1) |

## Files you own

- `lib/consent.ts`, `app/api/skin-scan/upload/route.ts`, `lib/s3.ts`, `lib/s3-key.ts`
- `app/(marketing)/account/page.tsx`, new `app/api/account/**`
- `lib/skin-check-steps.ts`, `lib/skin-check-validation.ts`, `components/skin-check/inputs/PhoneAuthStep.tsx`
- `app/(marketing)/echo/page.tsx`, `components/skin-check/EchoPage.tsx`
- `lib/gemini.ts`, `lib/gemini-key.ts`, `lib/echo-trusted-context.ts`, `lib/skin-check-format.ts`, `app/api/skin-check/chat/route.ts`
- new tests: `tests/privacy-*.test.ts`, `tests/firestore-rules-privacy.test.ts`, and optionally `tests/privacy.e2e.test.ts` (erasure against the local stack)
- new seed: `scripts/seed-lane-privacy.ts` (consent ledger entries for the seed users)

## Shared files: your part only

- `firestore.rules`: new `match` blocks only, between `// ── lane:privacy ──` and `// ── end lane:privacy ──`. The consent ledger is **server-written**: clients may read their own entries, and `write: if false` for clients.
- `app/api/skin-scan/route.ts`: only the request preamble, before `request.formData()`, for the server-side 18+ attestation check.
- `lib/firebase/skin-checks.ts`: the `consent` block only. Do not touch the capture lane's `capture` field.
- `lib/useSkinCheckFlow.ts`: the answers, sections, age gate and per-scan re-confirmation. The scan-state and retake handling belong to capture.
- `lib/skin-check-draft.ts`: the answers and consent parts. `lib/skin-check-session-context.tsx`: new optional fields only.
- `lib/api.ts`: new optional parameters (attestation, consent) on the existing helpers only.
- `components/skin-check/SkinCheckDashboard.tsx` (routine owns it): for a consent or retention display, write the request in your report.
- `components/skin-check/inputs/PhotoCapture.tsx`: owned by the capture lane. Change consent copy and versions in `lib/consent.ts`. For a layout change, write the request in your report.

## Do not touch

- `lib/firebase/admin.ts` and `lib/firebase/client.ts`. Erasure uses `adminDb()` and Admin Auth through new code in `app/api/account/**`. If admin.ts needs a new export, write the request in your report.
- `lib/skin-state.ts` (D-23 frozen). `lib/dev-env-guard.cjs` (if you add a variable that could point at production, write the request in your report).
- Everything listed under "No lane edits" in README.md.

## Tests you must add

- **Consent ledger:**
  - written only by the server;
  - a client create, update or delete is refused (rules test);
  - presign writes a retention entry even if the flow is abandoned (D-16).
- **Erasure:**
  - S3 objects under `users/<uid>/` are gone, then Firestore `users/<uid>` recursively, then the Auth user;
  - a failure in one step stops later steps and is reported;
  - another user's data is untouched.
  - Run end to end on the local stack: seed user, erase, check S3Mock, the emulator and Auth.
- **18+:**
  - the server refuses a scan or upload without attestation;
  - an under-18 answer cannot be bypassed by skipping the client gate;
  - the phone number is not stored in answers.
- **H03:**
  - a test that pins the exact set of fields sent to Gemini;
  - a new field must fail the test until it is added to the inventory on purpose.

## Exit conditions

- H02 gate brief and H01 design approved by the owner (recorded in `privacy-report.md`).
- `npm run test:local` green; typecheck, lint and `npm run build` green.
- Only owned files and your marked parts of shared files changed.
- `docs/lanes/privacy-report.md` has: what was built, commits, test results, the H03 field inventory, the IAM principal and retention period the owner must decide, and proposed decisions.
