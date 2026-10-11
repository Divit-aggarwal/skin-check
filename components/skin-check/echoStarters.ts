// Owner decision 2026-10-11: tappable starter questions above Echo's message
// box. Edit the pool here. tests/echo-starters.test.ts runs every question
// through Echo's own filters (comparison, red flag, result question,
// unsupported script): a question a filter would stop fails the test.

export type StarterGroup = "results" | "products" | "app" | "hinglish";

export const STARTER_POOL: Record<StarterGroup, readonly string[]> = {
  results: [
    "Explain my results in simple words",
    "What does my redness reading mean?",
    "What does my oiliness reading mean?",
    "Which areas of my face show the highest readings?",
    'What does "early estimate" mean?',
    "What can this photo not tell me?",
  ],
  // Hidden while product suggestions are off.
  products: [
    "Suggest a routine with your products",
    "In what order should I apply my products?",
    "How do I use each product in my routine?",
    "Which product is for which step?",
  ],
  // "Why can't you compare my checks yet?" hit the comparison filter (fixed answer, no Gemini): reworded.
  app: ["How do I take a better photo next time?", "Why does Echo talk about one check at a time?"],
  hinglish: ["Meri results simple shabdon mein samjhao", "Mere liye ek routine batao"],
};

/**
 * One question from each group where possible (three or four in all), never
 * one already asked in this chat. `random` is injectable for tests.
 */
export function pickStarters(opts: { productsOn: boolean; asked: readonly string[]; random?: () => number }): string[] {
  const random = opts.random ?? Math.random;
  const asked = new Set(opts.asked.map((q) => q.trim().toLowerCase()));
  const groups = (Object.keys(STARTER_POOL) as StarterGroup[]).filter((g) => opts.productsOn || g !== "products");
  const left = groups.map((g) => STARTER_POOL[g].filter((q) => !asked.has(q.toLowerCase())));
  const picked: string[] = [];
  // One per group first, then fill from what is left, up to four.
  for (let round = 0; round < 4 && picked.length < 4; round++) {
    for (const qs of left) {
      if (picked.length >= 4 || qs.length === 0) continue;
      picked.push(qs.splice(Math.floor(random() * qs.length), 1)[0]!);
    }
    if (picked.length >= 3) break;
  }
  return picked;
}
