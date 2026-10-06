import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { AdminNotConfiguredError } from "@/lib/firebase/admin";
import type { EchoRegion } from "@/lib/echo-regions";

// SERVER ONLY. Gate 02: Echo chat history lives only in the browser (chat
// text is deliberately never persisted server-side), so the server can't look
// up "what Echo actually said". Instead every reply returns a MAC over the
// whole thread so far, and the next request must present it — a client can't
// forge or edit a prior `echo` turn (or a prior user turn) without the key.
//
// Bound to uid + scanId + region, so a token can't be replayed across users,
// scans, or region threads.
//
// Key: HKDF from FIREBASE_PRIVATE_KEY — the admin credential this route
// already requires — domain-separated by LABEL so this MAC key is never the
// raw credential nor reusable for anything else. Rotating the service-account
// key invalidates every live thread's token; acceptable, since threads are
// in-memory client-side and don't survive a refresh anyway.
//
// v2 (privacy R-F): threads signed before the H03 Gemini minimisation stop
// verifying, so no pre-minimisation history is carried into a new prompt.

const LABEL = "skin-check/echo-history/v2";

export interface EchoHistoryTurn {
  role: "user" | "echo";
  text: string;
}

function historyKey(): Buffer {
  const secret = process.env.FIREBASE_PRIVATE_KEY;
  if (!secret) throw new AdminNotConfiguredError(["FIREBASE_PRIVATE_KEY"]);
  return Buffer.from(hkdfSync("sha256", secret, LABEL, LABEL, 32));
}

function mac(uid: string, scanId: string, region: EchoRegion, turns: EchoHistoryTurn[]): Buffer {
  // JSON array encoding is unambiguous (no delimiter collisions between
  // fields or turns), and the version tag lets the format change later.
  const canonical = JSON.stringify(["echo-history-v2", uid, scanId, region, turns.map((t) => [t.role, t.text])]);
  return createHmac("sha256", historyKey()).update(canonical).digest();
}

export function signHistory(uid: string, scanId: string, region: EchoRegion, turns: EchoHistoryTurn[]): string {
  return mac(uid, scanId, region, turns).toString("base64url");
}

export function verifyHistory(
  uid: string,
  scanId: string,
  region: EchoRegion,
  turns: EchoHistoryTurn[],
  token: string
): boolean {
  const expected = mac(uid, scanId, region, turns);
  const given = Buffer.from(token, "base64url");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
