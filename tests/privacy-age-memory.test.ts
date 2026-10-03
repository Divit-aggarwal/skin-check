import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGE_ATTESTATION_VERSION,
  attestedAgeBucket,
  markUnder18Chosen,
  postAgeAttestation,
  under18ChosenOnThisDevice,
} from "@/lib/consent";

// H02a: the browser blocks an under-18 answer before sign-in, so the device
// remembers it and the attestation after sign-in still says "under-18", even
// if the user went back and picked another bucket (verifier finding 2).
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

beforeEach(() => {
  vi.stubGlobal("sessionStorage", fakeStorage());
});
afterEach(() => vi.unstubAllGlobals());

describe("under-18 memory", () => {
  it("before any under-18 choice, the answered bucket is attested", () => {
    expect(under18ChosenOnThisDevice()).toBe(false);
    expect(attestedAgeBucket("25-34")).toBe("25-34");
    expect(attestedAgeBucket("")).toBeNull();
    expect(attestedAgeBucket(undefined)).toBeNull();
  });

  it("bypass: under-18 chosen, then back and 18-24 picked: still attests under-18", () => {
    markUnder18Chosen();
    expect(attestedAgeBucket("18-24")).toBe("under-18");
  });

  it("blocked storage never throws and falls back to the answer", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => markUnder18Chosen()).not.toThrow();
    expect(attestedAgeBucket("25-34")).toBe("25-34");
  });

  it("the marker is tab-scoped (sessionStorage), never localStorage", () => {
    const src = readFileSync("lib/consent.ts", "utf8");
    const block = src.slice(src.indexOf("const UNDER18_CHOSEN_KEY"), src.indexOf("export function attestedAgeBucket"));
    expect(block).not.toContain("localStorage.");
    expect(block).toContain("sessionStorage.");
  });

  it("postAgeAttestation sends the bucket and the current version with the bearer token", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    await postAgeAttestation("tok", "under-18");
    expect(fetchSpy).toHaveBeenCalledWith("/api/account/attestation", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer tok" },
      body: JSON.stringify({ ageBucket: "under-18", version: AGE_ATTESTATION_VERSION }),
    });
  });

  it("once the under-18 record is accepted, the marker is cleared: the next account on this device attests its own answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    markUnder18Chosen();
    expect(await postAgeAttestation("tok", attestedAgeBucket("18-24")!)).toBe(true);
    expect(attestedAgeBucket("35-44")).toBe("35-44");
  });

  it("a failed under-18 post keeps the marker, so the next attempt still says under-18", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    markUnder18Chosen();
    expect(await postAgeAttestation("tok", "under-18")).toBe(false);
    expect(attestedAgeBucket("18-24")).toBe("under-18");
  });

  it("an 18+ post never clears a marker", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    markUnder18Chosen();
    await postAgeAttestation("tok", "25-34");
    expect(under18ChosenOnThisDevice()).toBe(true);
  });

  // No DOM renderer (vitest runs in node): pin the wiring at the source.
  it("the flow's age block marks the device and posts under-18 when signed in", () => {
    const hook = readFileSync("lib/useSkinCheckFlow.ts", "utf8");
    const block = hook.slice(hook.indexOf('answers.age === "under-18") {'), hook.indexOf("setBlocked(true);"));
    expect(block).toContain("markUnder18Chosen();");
    expect(block).toContain('postAgeAttestation(token, "under-18")');
  });

  it("the phone step attests through attestedAgeBucket", () => {
    const src = readFileSync("components/skin-check/inputs/PhoneAuthStep.tsx", "utf8");
    expect(src).toContain("attestedAgeBucket(answered)");
    expect(src).toContain("void attestAge(user, answers.age);");
  });
});
