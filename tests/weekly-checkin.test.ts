import { afterEach, describe, expect, it, vi } from "vitest";
import { canSubmitCheckin, checkinBody, checkinOutcome, submitCheckin } from "@/components/skin-check/checkinSubmit";
import { CHECKIN_COPY } from "@/components/skin-check/flowCopy";
import { CHECKIN_QUESTIONS, CHECKINS_ROUTE } from "@/lib/feature-contracts/checkin";
import { bannedWordsIn } from "@/lib/catalog/wording";

// Screen 08 (E19): the request body and what each answer means on screen.

describe("check-in payload", () => {
  it("keeps only known questions and options, adds scanId only when there is one", () => {
    const body = checkinBody({ overall: "bit_better", new_breakouts: "nope", skin_feel: "dry" } as never, null, "Asia/Kolkata");
    expect(body).toEqual({ answers: { overall: "bit_better", skin_feel: "dry" }, timeZone: "Asia/Kolkata" });
    expect(checkinBody({ routine_changed: "no" }, "scan-1", "UTC")).toEqual({ answers: { routine_changed: "no" }, scanId: "scan-1", timeZone: "UTC" });
  });
  it("cannot be sent with no answer (the server would refuse it)", () => {
    expect(canSubmitCheckin({})).toBe(false);
    expect(canSubmitCheckin({ overall: "x" } as never)).toBe(false);
    expect(canSubmitCheckin({ existing_spots: "not_sure" })).toBe(true);
  });
  it("every contract option is accepted", () => {
    for (const q of CHECKIN_QUESTIONS) for (const o of q.options) expect(checkinBody({ [q.id]: o.id }, null, "UTC").answers[q.id]).toBe(o.id);
  });
});

describe("check-in states", () => {
  it("maps each answer from the route", () => {
    expect(checkinOutcome(201)).toBe("saved");
    expect(checkinOutcome(409)).toBe("already");
    expect(checkinOutcome(401)).toBe("signed_out");
    expect(checkinOutcome(403)).toBe("not_allowed");
    expect(checkinOutcome(429)).toBe("too_many");
    expect(checkinOutcome(400)).toBe("failed");
    expect(checkinOutcome(500)).toBe("failed");
  });

  afterEach(() => vi.unstubAllGlobals());
  it("posts once with the token, and a network failure is 'failed'", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 409 });
    vi.stubGlobal("fetch", fetchMock);
    expect(await submitCheckin("tok", checkinBody({ overall: "no_change" }, null, "UTC"))).toBe("already");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(CHECKINS_ROUTE);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({ answers: { overall: "no_change" }, timeZone: "UTC" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await submitCheckin("tok", checkinBody({ overall: "no_change" }, null, "UTC"))).toBe("failed");
  });

  it("the screen's own sentences pass the word check (answer labels are the user's words, TD-51 (2))", () => {
    const strings = (v: unknown): string[] => (typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : []);
    for (const s of strings(CHECKIN_COPY)) expect(bannedWordsIn(s), s).toEqual([]);
  });
});
