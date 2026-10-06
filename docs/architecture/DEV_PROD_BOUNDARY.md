# DEV_PROD_BOUNDARY: what local development can reach in production

Inspected 2026-10-03. The source is the developer `.env.local`, read for **variable names and non-secret targets only**; no secret values were printed. It was cross-checked against the code paths that consume each variable. Nothing was provisioned or changed.

Expands PREFLIGHT_AUDIT T8 / G3.5 ("`.env.local` uses production bucket, Firestore and CV").

## Classification

- **SAFE:** local-only, or touches no production resource.
- **SHARED:** a production resource that dev also uses, with limited blast radius.
- **PRODUCTION-ACCESS:** dev holds a credential that can read or write production data, or spend production money.

| Resource | Local config (`.env.local`) | What dev can do | Class |
|---|---|---|---|
| **Firestore** `projectskin-a202c` `(default)` | `NEXT_PUBLIC_FIREBASE_PROJECT_ID=projectskin-a202c`; no emulator vars | The browser SDK reads and writes production data as the signed-in user, under rules | SHARED |
| **Firebase Admin service account** | `FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@…`, `FIREBASE_PRIVATE_KEY` | **Bypasses rules.** Per PREFLIGHT G3 it holds `datastore.entities.*` (create/update/delete/get/list on every document) plus `firebaseauth.users.get/delete`. Any local script or bug can rewrite or erase production records or delete Auth users | **PRODUCTION-ACCESS** |
| **Firebase Auth** (phone OTP) | same project web config | Real SMS OTPs to real numbers (billed per SMS); creates real Auth users | SHARED |
| **S3** `projectskin-skin-originals-prod` (ap-south-1) | `S3_SKIN_IMAGES_BUCKET`, `_REGION`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY` | `s3:PutObject` on `users/*/scans/*/original.jpg` only: no read, list or delete. Dev **writes face images into the production dataset** bucket, indistinguishable from real captures | **PRODUCTION-ACCESS** (write-only) |
| **CV service** `https://api.theprojectskin.com` (ECS ap-south-1) | `SKIN_SCAN_API_URL`, `SCAN_API_SECRET` (the production secret) | Calls the production `/scan`; consumes production capacity (`MAX_CONCURRENT_SCANS=4`). Stateless: it stores no images | SHARED |
| **Gemini** | `GEMINI_API_KEY` | Billed or quota'd calls on whichever project owns the key (unknown, PREFLIGHT G1). Prompts carry quiz answers | SHARED |
| **Vercel OIDC** | `VERCEL_OIDC_TOKEN` (written by `vercel env pull`) | A short-lived token scoped to this Vercel project. Not used by app code | SHARED (expires; low) |
| Firestore rules tests | `npm run test:rules`, project `demo-rules-check`, emulator | Emulator only | SAFE |
| Unit tests (`npm test`) | `vi.mock` of Firebase/S3/fetch; CI runs them with no secrets | No network | SAFE |
| Local CV container | `SKIN_SCAN_API_URL=http://127.0.0.1:8000` (`.env.example` default) | Local only, when used. Today's `.env.local` points to production instead | SAFE (not currently used) |

Housekeeping: `.env.local` contains a stray non-assignment line (`key sh`). dotenv ignores it, but it is worth deleting.

## Effect of the asia-south1 reset on this boundary

- **None.** Local dev will reach the *new* `(default)` the moment it exists.
- It uses the same project, the same service account and the same web config, so test traffic from laptops lands in the "clean production foundation" from day one.
- That is the main reason for the minimum separation below.

## Minimum separation before the next engineering gates

These are ordered by risk reduction per unit of effort. None is provisioned yet.

1. **Remove the Admin private key from developer machines** (highest risk).
   - Local server routes that need Admin (`/api/skin-scan` token verification, C2 writes) should run against the **Firebase emulators**: Auth plus Firestore, `FIREBASE_AUTH_EMULATOR_HOST` / `FIRESTORE_EMULATOR_HOST`, and a `demo-*` project ID. A demo project needs no credentials.
   - Production keeps its key only in Vercel (Sensitive).
   - Rotate the current key afterwards, since copies exist on disk.
2. **Point local Firestore and Auth at the emulators** by default.
   - It is the same switch as item 1, plus the web SDK's `connectFirestoreEmulator` / `connectAuthEmulator` when an env flag is set.
   - This stops test records and test Auth users entering production, and stops real SMS spend.
   - It needs a small, dev-only code change in `lib/firebase/client.ts` and `admin.ts`, guarded by an env var. That belongs to a separate approved gate, not this infrastructure change.
3. **Separate the S3 destination for dev.**
   - Either a `projectskin-skin-originals-dev` bucket with its own PutObject-only IAM user, or simply leave the `S3_SKIN_IMAGES_*` variables unset locally. Upload then fails closed, and the scan still works.
   - Unsetting them is zero-cost and available today.
4. **Use the local CV container** (`SKIN_SCAN_API_URL=http://127.0.0.1:8000`) with a dev-only `SCAN_API_SECRET`, so the production secret leaves laptops. Production CV stays reachable only from Vercel.
5. **Gemini:** use a separate dev key on a separate (or capped) project once G1 settles who owns the production key.
6. **Vercel Preview environment:** confirm what Preview deployments use (PREFLIGHT G3.5). If Preview carries the production Firebase/S3/CV values, Preview has the same exposure as local and needs the same separation.

The **minimum before the next gate** is items 1–3. They are what stand between a laptop bug and the production dataset. Items 4–6 can follow.
