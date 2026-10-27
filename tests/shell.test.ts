import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SHELL_COPY } from "@/components/shell/copy";
import { bannedWordsIn } from "@/lib/catalog/wording";
import { CAUSE, CHANGE, DIAGNOSIS, FORECAST, MEDICAL } from "@/lib/context/lexicon";

// G03 part 1: the app shell (docs/design/system.md §6, map.md).

const strings = (v: unknown): string[] =>
  typeof v === "string" ? [v] : typeof v === "function" ? [String(v("4821"))] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];

describe("app shell", () => {
  it("every shell string passes the D-12 word checks", () => {
    const all = strings(SHELL_COPY);
    expect(all.length).toBeGreaterThan(8);
    // TD-51: the two exact bottom-bar labels from the mockup.
    const TD51 = ["Skin Twin", "Progress"];
    for (const s of all) {
      expect(bannedWordsIn(s), s).toEqual([]);
      if (TD51.includes(s)) continue;
      for (const re of [CHANGE, MEDICAL, DIAGNOSIS, CAUSE, FORECAST]) expect(re.test(s), s).toBe(false);
    }
  });

  it("the navigation reaches the six main places (TD-51: Progress in place of Routine), marks the current one, and is labelled", () => {
    const nav = readFileSync("components/shell/Nav.tsx", "utf8");
    for (const href of ["/dashboard", "/checks", "/skin-check", "/progress", "/echo", "/account"]) expect(nav).toContain(`href: "${href}"`);
    expect(nav).toMatch(/aria-current=\{current\(/);
    expect(nav.match(/aria-label=\{S\.navLabel\}/g)).toHaveLength(3);
  });

  it("every page is inside the shell, which starts with a skip link to the content", () => {
    expect(readFileSync("app/(marketing)/layout.tsx", "utf8")).toMatch(/<AppShell>\{children\}<\/AppShell>/);
    const shell = readFileSync("components/shell/AppShell.tsx", "utf8");
    expect(shell).toMatch(/href="#content"/);
    expect(shell).toMatch(/id="content"/);
  });

  it("TD-25 (6): pinch-to-zoom is on", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).not.toMatch(/maximumScale|userScalable/);
  });

  // TD-50: one sans (Plus Jakarta Sans); Bai Jamjuree is gone.
  it("the redesign font is loaded and the old ones are gone", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).not.toMatch(/Bai_Jamjuree/);
    expect(layout).not.toMatch(/Fraunces/);
    expect(readFileSync("app/(marketing)/layout.tsx", "utf8")).not.toMatch(/Space_Grotesk|Inter\b/);
  });

  // G35: Plus Jakarta Sans is served from the repo (no Google Fonts fetch at build), same weights, display and variable.
  it("Plus Jakarta Sans comes from the repo: one variable file for 400-700, swap, --font-jakarta, with its licence", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).not.toMatch(/next\/font\/google/);
    expect(layout).toMatch(/localFont\(\{\s*src: "\.\/fonts\/plus-jakarta-sans\/PlusJakartaSans-Variable\.woff2",\s*weight: "400 700",/);
    expect(layout).toMatch(/variable: "--font-jakarta"/);
    expect(layout).toMatch(/display: "swap"/);
    const dir = "app/fonts/plus-jakarta-sans";
    expect(readdirSync(dir).sort()).toEqual(["OFL.txt", "PlusJakartaSans-Variable.woff2"]);
    expect(readFileSync(`${dir}/PlusJakartaSans-Variable.woff2`).subarray(0, 4).toString("latin1")).toBe("wOF2");
    expect(readFileSync(`${dir}/OFL.txt`, "utf8")).toMatch(/SIL Open Font License, Version 1\.1/);
  });;

  it("one wordmark on screen: the page header's only on a signed-in phone or tablet (polish lane)", () => {
    // Signed out, the shell's top bar has the wordmark; signed in from 1024px, the side bar. The shell marks signed in with data-nav.
    expect(readFileSync("components/shell/AppShell.tsx", "utf8")).toMatch(/data-nav=\{user \? "" : undefined\} className="group\/shell /);
    expect(readFileSync("components/ui/kit.tsx", "utf8")).toContain('<Wordmark centred className="invisible group-data-[nav]/shell:visible lg:group-data-[nav]/shell:invisible" />');
  });
});
