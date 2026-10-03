import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Step 6 (H01b UI). vitest runs in node with no DOM renderer, so the
// component's request and its success path are pinned at the source. The
// route behind it is covered by privacy-erase and privacy.e2e.
const src = readFileSync("app/(marketing)/account/DeleteAccount.tsx", "utf8");
const page = readFileSync("app/(marketing)/account/page.tsx", "utf8");

describe("DeleteAccount", () => {
  it("is a client component rendered on /account", () => {
    expect(src.startsWith('"use client";')).toBe(true);
    expect(page).toContain("<DeleteAccount />");
  });

  it("posts only the confirmation phrase, with a bearer token, to the erase route", () => {
    expect(src).toContain('fetch("/api/account/erase"');
    expect(src).toContain("authorization: `Bearer ${await user.getIdToken()}`");
    expect(src).toContain("body: JSON.stringify({ confirm: ERASE_CONFIRMATION })");
    expect(src).not.toMatch(/uid/);
  });

  it("only enables the button once the phrase is typed exactly", () => {
    expect(src).toContain("disabled={state.typed !== ERASE_CONFIRMATION}");
  });

  it("on success clears this device's draft, then signs out", () => {
    const ok = src.slice(src.indexOf("if (res.ok) {"), src.indexOf('setState({ kind: "done" })'));
    expect(ok.indexOf("await clearDraft();")).toBeGreaterThan(-1);
    expect(ok.indexOf("await signOut()")).toBeGreaterThan(ok.indexOf("await clearDraft();"));
    // The tab's under-18 marker goes with the erased account's record.
    expect(ok).toContain("clearUnder18Chosen();");
  });

  it("explains a stale sign-in using the shared limit, not a hard-coded number", () => {
    expect(src).toContain('body.code === "REAUTH_REQUIRED"');
    expect(src).toContain("ERASE_MAX_AUTH_AGE_SECONDS");
    expect(src).not.toMatch(/within 5 minutes/);
  });
});
