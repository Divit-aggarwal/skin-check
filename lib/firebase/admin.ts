import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// SERVER ONLY. This module holds the service-account credential that can mint
// and inspect tokens for the whole Firebase project — the exact opposite of
// lib/firebase/client.ts, whose NEXT_PUBLIC_ config authorizes nothing.
//
// Nothing here may ever be imported from a "use client" file or a shared
// module a client component pulls in. The throw below is the tripwire: a
// bundler that dragged this into the browser chunk turns into a loud crash on
// first import instead of a private key sitting in a public JS file. The real
// proof is still the build-output grep documented in the Phase 2 report.
if (typeof window !== "undefined") {
  throw new Error("lib/firebase/admin.ts is server-only and must never be bundled for the browser.");
}

// The project id is deliberately read from the SAME variable the browser
// config uses, with a server-only override available. A project id is not a
// secret (it's in every client bundle already), and two independent sources
// for it is how a server ends up verifying tokens for a different project
// than the one the client signs into — which fails open-ish and confusingly.
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
// Env vars can't hold real newlines, so a service-account key is stored with
// literal backslash-n. cert() needs the real thing.
//
// The surrounding quotes are stripped first. A .env file needs them (dotenv
// consumes them when parsing), a dashboard env-var field does not — and a key
// pasted WITH them parses as an invalid PEM, which surfaces as every token
// being rejected rather than as a configuration error. Cheaper to tolerate
// than to diagnose in production.
const PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY?.trim()
  .replace(/^["']|["']$/g, "")
  .replace(/\\n/g, "\n");

export class AdminNotConfiguredError extends Error {
  constructor(missing: string[]) {
    // Names only — never a value. This string reaches server logs, never a client.
    super(`Firebase Admin is not configured. Missing: ${missing.join(", ")}`);
    this.name = "AdminNotConfiguredError";
  }
}

// Lazy for the same reason lib/firebase/client.ts is: initialising at module
// scope would run during `next build`'s page-data collection and turn an
// unset credential into a build failure rather than a runtime 500.
// getApps() keeps repeat calls and dev fast-refresh on one instance.
const APP_NAME = "admin";

export function usesEmulators(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    !!process.env.FIREBASE_AUTH_EMULATOR_HOST &&
    !!process.env.FIRESTORE_EMULATOR_HOST
  );
}

function adminApp(): App {
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) return existing;

  // Local stack only (npm run dev:local): both emulators set, never in
  // production. firebase-admin then talks to the emulators and needs no
  // credential; production keeps the fail-closed path below.
  if (usesEmulators()) {
    if (!PROJECT_ID) throw new AdminNotConfiguredError(["FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID)"]);
    return initializeApp({ projectId: PROJECT_ID }, APP_NAME);
  }

  const missing: string[] = [];
  if (!PROJECT_ID) missing.push("FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID)");
  if (!CLIENT_EMAIL) missing.push("FIREBASE_CLIENT_EMAIL");
  if (!PRIVATE_KEY) missing.push("FIREBASE_PRIVATE_KEY");
  // Fail closed. A missing credential must never degrade to "skip
  // verification" — that would silently restore the Phase 1 hole this whole
  // phase exists to close.
  if (missing.length > 0) throw new AdminNotConfiguredError(missing);

  return initializeApp(
    {
      credential: cert({
        projectId: PROJECT_ID!,
        clientEmail: CLIENT_EMAIL!,
        privateKey: PRIVATE_KEY!,
      }),
      projectId: PROJECT_ID!,
    },
    // Named so this can never collide with a default app another server
    // module might initialise for a different purpose.
    APP_NAME
  );
}

/**
 * Admin Firestore for server-written records (C2: users/{uid}/scanAnalyses).
 * Same lazy app and same AdminNotConfiguredError as token verification.
 * Bypasses firestore.rules entirely — every path it writes must be built
 * from a VERIFIED uid, never one read from the request.
 */
export function adminDb(): Firestore {
  return getFirestore(adminApp());
}

/**
 * Verifies a Firebase ID token and returns the uid it was issued for.
 *
 * The uid comes out of the token's verified signature, so it cannot be
 * asserted, overridden, or forged by the client — that is the entire point of
 * this function and the Phase 2 trust boundary.
 *
 * `checkRevoked: true` is deliberate. It costs one lookup against Firebase
 * Auth per call, which is negligible next to the 10-30s CV pipeline this
 * gates, and without it a revoked session (a disabled number, a forced
 * sign-out) would keep passing until the token's natural ~1h expiry.
 *
 * Throws on ANY verification failure — malformed, wrong signature, wrong
 * audience/issuer, expired, or revoked. Callers turn that into a 401 without
 * inspecting why; the reason stays server-side.
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<string> {
  // With FIREBASE_AUTH_EMULATOR_HOST set, firebase-admin accepts UNSIGNED
  // tokens. Never in a production build: fail closed as misconfigured.
  if (process.env.NODE_ENV === "production" && process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new AdminNotConfiguredError(["FIREBASE_AUTH_EMULATOR_HOST must be unset in production"]);
  }
  const decoded = await getAuth(adminApp()).verifyIdToken(idToken, true);
  return decoded.uid;
}

/**
 * Pulls the bearer token out of an Authorization header.
 * Returns null for missing, non-Bearer, or empty-token headers — every one of
 * which is a 401, decided before any credential is touched.
 */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1]! : null;
}
