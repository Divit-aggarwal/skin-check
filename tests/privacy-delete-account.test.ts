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

// H26 (red team D F1): the delete copy promises only what the system does.
describe("delete copy (H26)", () => {
  it("does not promise a permanent delete of Google's copy or of another browser's draft", async () => {
    const { ERASE_COPY } = await import("@/lib/consent");
    const all = Object.values(ERASE_COPY).join(" ");
    expect(src).not.toMatch(/permanently deletes/i);
    expect(all).not.toMatch(/permanent/i);
    expect(ERASE_COPY.gemini).toMatch(/Google/);
    expect(ERASE_COPY.gemini).toMatch(/can't delete Google's copy/);
    expect(ERASE_COPY.otherBrowsers).toMatch(/another browser/);
    for (const key of ["explain", "gemini", "otherBrowsers", "done", "doneLate"] as const) expect(src).toContain(`ERASE_COPY.${key}`);
  });

  it("the promised time covers the sweep delay plus the longest gap between two runs of the configured cron", async () => {
    const { ERASE_LATE_DATA_DAYS, ERASE_SWEEP_SCHEDULE, ERASE_COPY } = await import("@/lib/consent");
    const { ERASE_SWEEP_DELAY_SECONDS } = await import("@/lib/erase");
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons?: { path: string; schedule: string }[] };
    expect(vercel.crons).toContainEqual({ path: "/api/account/erase/sweep", schedule: ERASE_SWEEP_SCHEDULE });
    // A fixed minute and hour, every day: one run a day (the Hobby plan limit),
    // and Hobby may fire anywhere in that hour, so two runs can be up to 24 h 59 min apart.
    expect(ERASE_SWEEP_SCHEDULE).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/);
    const longestGapSeconds = 24 * 3600 + 59 * 60;
    expect(ERASE_SWEEP_DELAY_SECONDS + longestGapSeconds).toBeLessThanOrEqual(ERASE_LATE_DATA_DAYS * 86400);
    expect(ERASE_COPY.explain).toContain(`within ${ERASE_LATE_DATA_DAYS} days`);
    expect(ERASE_COPY.doneLate).toContain(`within ${ERASE_LATE_DATA_DAYS} days`);
  });
});
