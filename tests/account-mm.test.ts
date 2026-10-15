import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { exportFileName, fetchExport, retryIn, getConsents, getPrefs, optimistic, patchType, postConsent, rowState } from "@/app/(marketing)/account/accountApi";
import { answerText, initials, profileFrom } from "@/app/(marketing)/account/profile";
import { ACCOUNT_COPY } from "@/app/(marketing)/account/copy";
import { consentsFixture, dataExportFixture, notificationPrefsFixture } from "@/lib/feature-contracts/fixtures";
import { CONSENT_TEXTS } from "@/lib/feature-contracts/consents";
import { SENDABLE_TYPES, WAITS_ON, type NotificationType } from "@/lib/feature-contracts/notifications";
import { bannedWordsIn } from "@/lib/catalog/wording";

// G37 lane E (mockups 20, 21, 22): the calls to the G31/H36/H37 routes against the
// contract fixtures, the optimistic roll-back, the profile's stored fields, and copy.

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("notifications (20)", () => {
  it("disables every type outside SENDABLE_TYPES, with its WAITS_ON line", () => {
    const all = Object.keys(notificationPrefsFixture.types) as NotificationType[];
    for (const t of all) {
      const s = rowState(t);
      expect(s.disabled).toBe(!SENDABLE_TYPES.includes(t));
      expect(s.waitsOn).toBe(s.disabled ? WAITS_ON[t] : undefined);
      if (s.disabled) expect(s.waitsOn).toBeTruthy();
    }
  });

  it("GETs the prefs and PATCHes one type with the bearer token", async () => {
    const f = vi.fn().mockResolvedValueOnce(json(200, notificationPrefsFixture)).mockResolvedValueOnce(json(200, notificationPrefsFixture));
    expect(await getPrefs(f, "tok")).toEqual({ ok: true, data: notificationPrefsFixture });
    await patchType(f, "tok", "weekly_checkin", false);
    const [url, init] = f.mock.calls[1]!;
    expect(url).toBe("/api/account/notifications");
    expect(init.method).toBe("PATCH");
    expect(init.headers.authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({ types: { weekly_checkin: false } });
  });

  it("rolls back on error and keeps the value on success", async () => {
    const seen: boolean[] = [];
    const failed = await optimistic((v) => seen.push(v), true, () => patchType(vi.fn().mockResolvedValue(json(409, { code: "NOT_SENDABLE" })), "t", "marketing", true));
    expect(seen).toEqual([true, false]);
    expect(failed).toEqual({ ok: false, status: 409, code: "NOT_SENDABLE" });
    const offline: boolean[] = [];
    await optimistic((v) => offline.push(v), false, () => patchType(vi.fn().mockRejectedValue(new TypeError("offline")), "t", "routine_morning", false));
    expect(offline).toEqual([false, true]);
    const ok: boolean[] = [];
    await optimistic((v) => ok.push(v), true, () => patchType(vi.fn().mockResolvedValue(json(200, notificationPrefsFixture)), "t", "routine_morning", true));
    expect(ok).toEqual([true]);
  });

  it("never shows a clock time: the daily push picks its own hour", () => {
    const src = readFileSync("app/(marketing)/account/NotificationsScreen.tsx", "utf8");
    expect(src).not.toMatch(/morningTime|eveningTime|AM"|PM"/);
    expect(ACCOUNT_COPY.notify.weekly("Sunday")).toBe("Sundays");
  });
});

describe("consents (22)", () => {
  it("reads the fixture and sends the version of the wording on screen", async () => {
    const f = vi.fn().mockResolvedValueOnce(json(200, { consents: consentsFixture })).mockResolvedValueOnce(json(200, consentsFixture[2]));
    expect(await getConsents(f, "t")).toEqual({ ok: true, data: { consents: consentsFixture } });
    await postConsent(f, "t", "research", true);
    const [url, init] = f.mock.calls[1]!;
    expect(url).toBe("/api/account/consents");
    expect(JSON.parse(init.body)).toEqual({ purpose: "research", granted: true, version: CONSENT_TEXTS.research.version });
  });

  it("passes VERSION_STALE through so the screen reloads", async () => {
    expect(await postConsent(vi.fn().mockResolvedValue(json(409, { code: "VERSION_STALE" })), "t", "marketing", true)).toEqual({ ok: false, status: 409, code: "VERSION_STALE" });
  });

  it("never claims the data is never shared (H36)", () => {
    const src = ["copy.ts", "PrivacyScreen.tsx", "AccountView.tsx"].map((f) => readFileSync(`app/(marketing)/account/${f}`, "utf8")).join("\n");
    expect(src).not.toMatch(/never shared|third part|encrypted|only to provide/i);
  });
});

describe("export (22)", () => {
  it("returns the file with its server name", async () => {
    const body = JSON.stringify(dataExportFixture);
    const f = vi.fn().mockResolvedValue(json(200, body, { "content-disposition": 'attachment; filename="project-skin-data-2026-10-15.json"' }));
    const r = await fetchExport(f, "t");
    expect(f.mock.calls[0]![0]).toBe("/api/account/export");
    expect(r.ok && r.data.name).toBe("project-skin-data-2026-10-15.json");
    expect(r.ok && JSON.parse(await r.data.blob.text())).toEqual(dataExportFixture);
  });

  it("names the file by date without a header, and reports 429", async () => {
    expect(exportFileName(null, new Date("2026-10-15T10:00:00Z"))).toBe("project-skin-data-2026-10-15.json");
    expect(await fetchExport(vi.fn().mockResolvedValue(json(429, { code: "TOO_MANY" }, { "retry-after": "7300" })), "t")).toEqual({ ok: false, status: 429, code: "TOO_MANY", retryAfter: 7300 });
    expect(await fetchExport(vi.fn().mockResolvedValue(json(403, { code: "NOT_ALLOWED" })), "t")).toEqual({ ok: false, status: 403, code: "NOT_ALLOWED" });
    expect(retryIn(7300)).toEqual({ hours: 3 });
    expect(retryIn(90)).toEqual({ minutes: 2 });
    expect(retryIn(undefined)).toBeNull();
  });
});

describe("profile (21)", () => {
  const ts = (iso: string) => ({ toDate: () => new Date(iso) });
  const checks = [
    { id: "old", data: { createdAt: ts("2026-09-01T00:00:00Z"), answers: { name: "Old", age: "18-24", gender: "female", skin_type: "oily", primary_concerns: ["breakouts", "nonsense"], female_skin_context: ["pregnancy"] } } },
    { id: "new", data: { createdAt: ts("2026-10-01T00:00:00Z"), questionnaire: "skipped", answers: { name: " Asha Rao ", age: "25-34", gender: "female" } } },
  ];

  it("takes about-you from the newest check and skin answers from the newest one that has them", () => {
    const p = profileFrom(checks, []);
    expect(p.about.map((f) => f.text)).toEqual(["Asha Rao", "25–34", "Female"]);
    expect(p.skin.map((f) => f.id)).toContain("skin_type");
    expect(JSON.stringify(p)).not.toMatch(/nonsense|pregnan/i);
  });

  it("prefers answers given later for the newest check", () => {
    const p = profileFrom(checks, [{ id: "new", data: { answers: { skin_type: "dry" } } }]);
    expect(p.skin.find((f) => f.id === "skin_type")?.text).toBe(answerText("skin_type", "dry"));
  });

  it("is empty with no checks; initials from the name", () => {
    expect(profileFrom([], [])).toEqual({ about: [], skin: [] });
    expect(initials("asha rao kumar")).toBe("AR");
    expect(initials("")).toBe("");
  });
});

describe("copy", () => {
  it("has no banned words in the new account copy (contract texts are the main session's, see the hand-back)", () => {
    const strings = (v: unknown): string[] => (typeof v === "string" ? [v] : typeof v === "function" ? [String((v as (s: string) => string)("x"))] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : []);
    const { notify, data, profile } = ACCOUNT_COPY;
    const found = strings({ notify, data, profile }).flatMap((s) => bannedWordsIn(s).map((w) => `${w}: ${s}`));
    expect(found).toEqual([]);
  });
});
