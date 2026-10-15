// Lane mm/a browser test users (scripts/seed-lane-mm-a.ts writes them).
// Phone numbers +9199999043xx. Screens 09-12 with 0, 1 and 4 checks.

export type MmaUser = { uid: string; phoneNumber: string; checksDaysAgo: number[]; routine: boolean };

export const MMA_SEED = {
  empty: { uid: "seed-mma-empty", phoneNumber: "+919999904301", checksDaysAgo: [], routine: false },
  one: { uid: "seed-mma-one", phoneNumber: "+919999904302", checksDaysAgo: [2], routine: false },
  // Four measured checks a week apart, each with a kept photo (the engine's test face), and a routine.
  four: { uid: "seed-mma-four", phoneNumber: "+919999904303", checksDaysAgo: [23, 16, 9, 2], routine: true },
} as const satisfies Record<string, MmaUser>;
