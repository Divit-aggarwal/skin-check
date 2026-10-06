import { createHmac, hkdfSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signHistory, verifyHistory, type EchoHistoryTurn } from "@/lib/echo-history-token";
import { AdminNotConfiguredError } from "@/lib/firebase/admin";

const SCAN = "0f8fad5b-d9cb-469f-a165-70867728950e";
const TURNS: EchoHistoryTurn[] = [
  { role: "user", text: "hi" },
  { role: "echo", text: "hello" },
  { role: "user", text: "more" },
  { role: "echo", text: "sure" },
];

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("FIREBASE_PRIVATE_KEY", "test-private-key");
});

describe("echo history token", () => {
  const token = () => signHistory("u", SCAN, "cheeks", TURNS);

  it("verifies the exact signed history", () => {
    expect(verifyHistory("u", SCAN, "cheeks", TURNS, token())).toBe(true);
  });

  it("rejects tampered text", () => {
    const t = TURNS.map((x, i) => (i === 1 ? { ...x, text: "hellO" } : x));
    expect(verifyHistory("u", SCAN, "cheeks", t, token())).toBe(false);
  });

  it("rejects reordered turns", () => {
    const t = [TURNS[2]!, TURNS[3]!, TURNS[0]!, TURNS[1]!];
    expect(verifyHistory("u", SCAN, "cheeks", t, token())).toBe(false);
  });

  it("rejects a role flip", () => {
    const t = TURNS.map((x, i) => (i === 0 ? { ...x, role: "echo" as const } : x));
    expect(verifyHistory("u", SCAN, "cheeks", t, token())).toBe(false);
  });

  it("rejects truncated or extended history", () => {
    expect(verifyHistory("u", SCAN, "cheeks", TURNS.slice(0, 2), token())).toBe(false);
    expect(verifyHistory("u", SCAN, "cheeks", [...TURNS, { role: "echo", text: "x" }], token())).toBe(false);
  });

  it("rejects a token of the wrong length without throwing", () => {
    expect(verifyHistory("u", SCAN, "cheeks", TURNS, token().slice(0, 10))).toBe(false);
    expect(verifyHistory("u", SCAN, "cheeks", TURNS, `${token()}AAAA`)).toBe(false);
    expect(verifyHistory("u", SCAN, "cheeks", TURNS, "")).toBe(false);
  });

  it("is keyed: a different credential rejects the token", () => {
    const t = token();
    vi.stubEnv("FIREBASE_PRIVATE_KEY", "rotated-key");
    expect(verifyHistory("u", SCAN, "cheeks", TURNS, t)).toBe(false);
  });

  it("text that shifts content across turn boundaries doesn't collide", () => {
    const a: EchoHistoryTurn[] = [{ role: "user", text: "a\",\"b" }];
    const b: EchoHistoryTurn[] = [{ role: "user", text: "a" }, { role: "user", text: "b" }];
    expect(verifyHistory("u", SCAN, "cheeks", b, signHistory("u", SCAN, "cheeks", a))).toBe(false);
  });

  it("unset key → AdminNotConfiguredError", () => {
    vi.stubEnv("FIREBASE_PRIVATE_KEY", "");
    expect(() => signHistory("u", SCAN, "cheeks", TURNS)).toThrow(AdminNotConfiguredError);
  });
});

describe("echo history token v2 (privacy R-F)", () => {
  // The v1 scheme, verbatim, as it signed threads before the H03 minimisation.
  const v1 = (secret: string) => {
    const key = Buffer.from(hkdfSync("sha256", secret, "skin-check/echo-history/v1", "skin-check/echo-history/v1", 32));
    const canonical = JSON.stringify(["echo-history-v1", "u", SCAN, "cheeks", TURNS.map((t) => [t.role, t.text])]);
    return createHmac("sha256", key).update(canonical).digest().toString("base64url");
  };

  it("a thread signed with v1 no longer verifies", () => {
    expect(verifyHistory("u", SCAN, "cheeks", TURNS, v1("test-private-key"))).toBe(false);
    expect(verifyHistory("u", SCAN, "cheeks", TURNS, signHistory("u", SCAN, "cheeks", TURNS))).toBe(true);
  });
});
