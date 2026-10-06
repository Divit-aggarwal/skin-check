import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bannedWordsIn } from "@/lib/catalog/wording";

// Routine lane request (report §4, row T6): the root description is inherited
// by every page that does not set its own, so it must make no D-12 claim.
describe("root layout description", () => {
  const src = readFileSync("app/layout.tsx", "utf8");
  const descriptions = Array.from(src.matchAll(/description:\s*(?:\/\/[^\n]*\n\s*)?"([^"]+)"/g)).map((m) => m[1]!);

  it("finds every description (page and Open Graph)", () => {
    expect(descriptions.length).toBeGreaterThanOrEqual(2);
  });

  it.each(["working", "results"])("no description says %s", (word) => {
    for (const d of descriptions) expect(d.toLowerCase()).not.toContain(word);
  });

  it("every description passes the D-12 word check", () => {
    for (const d of descriptions) expect(bannedWordsIn(d), d).toEqual([]);
  });
});
