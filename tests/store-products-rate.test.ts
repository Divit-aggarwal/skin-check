import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// /api/store/products (TD-52) is public: per-IP 60 a minute and 2000 a day on
// top of the 10-minute store cache. A refused request never reaches the store.
const storeProducts = vi.hoisted(() => vi.fn(async () => []));
vi.mock("@/lib/store/products", () => ({ storeProducts }));

import { GET } from "@/app/api/store/products/route";

const get = (ip: string) => GET(new NextRequest("http://localhost/api/store/products", { headers: { "x-forwarded-for": ip } }));

describe("GET /api/store/products rate limit", () => {
  it("the 61st request in a minute from one IP is a 429 with Retry-After; another IP is not affected", async () => {
    for (let i = 0; i < 60; i++) expect((await get("203.0.113.7")).status).toBe(200);
    storeProducts.mockClear();
    const res = await get("203.0.113.7");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too many requests. Please try again shortly." });
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(storeProducts).not.toHaveBeenCalled();
    expect((await get("203.0.113.8")).status).toBe(200);
  });

  it("2000 a day per IP, even when spread over minutes", async () => {
    vi.useFakeTimers();
    try {
      let ok = 0;
      for (let i = 0; i < 2001; i++) {
        if (i % 60 === 0) vi.advanceTimersByTime(61_000);
        if ((await get("198.51.100.9")).status === 200) ok++;
      }
      expect(ok).toBe(2000);
    } finally {
      vi.useRealTimers();
    }
  });
});
