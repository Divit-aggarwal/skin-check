// Where lib/rules and the public store's products do not fit (G03 part 4).
// Questions for the clinical reviewer; the rules are not changed here.
// tests/dev-recommendations.test.ts runs recommend() on the store catalogue and
// checks the "rules" sentence of every entry that can be checked.

export interface Mismatch {
  id: string;
  products: string[];
  store: string;
  rules: string;
  question: string;
}

export const MISMATCHES: Mismatch[] = [
  {
    id: "cleanser-has-acids",
    products: ["Refreshing Cleanser"],
    store: "The store's only cleanser lists 2% Salicylic Acid (BHA) and 1% Glycolic Acid (AHA).",
    rules: "A base product must have no active ingredient class and no declared active, so the cleanser is not base. It is not the one allowed active either (a niacinamide serum). It is left out as 'not part of the current routine rules', and every routine has no cleanser, including the basic routine under a red flag.",
    question: "May a rinse-off cleanser with 2% salicylic acid be the base cleanser for everyone, including after a red flag? If not, what should the cleanse step be?",
  },
  {
    id: "sunscreen-has-niacinamide",
    products: ["Protecting Sunscreen"],
    store: "The sunscreen lists Niacinamide (and 0.5% Zinc PCA) among its key filters and supports.",
    rules: "Niacinamide is an active class, so the sunscreen is not base and is left out. No routine has a sunscreen.",
    question: "Does a supporting niacinamide in a sunscreen make it an active, or should a sunscreen count as base whatever its supporting ingredients?",
  },
  {
    id: "base-is-moisturiser-only",
    products: ["Refreshing Cleanser", "Calming Moisturiser", "Protecting Sunscreen"],
    store: "The store's routine is four steps: Cleanse, Treat, Moisturise, Protect.",
    rules: "With the store's products the base routine is the moisturiser alone, and the result carries the 'No matching product is available right now' limit.",
    question: "Is a moisturiser-only routine acceptable as what the basic routine shows, or must the cleanser and sunscreen questions above be settled first?",
  },
  {
    id: "one-treat-product",
    products: ["5% Niacinamide Serum", "Clear Seal", "Active Boba"],
    store: "The store has three Treat products: the serum, a spot product and a treatment cream.",
    rules: "The rules know one optional active: a serum whose only active class is niacinamide. Clear Seal and Active Boba have no rules category (written as 'other') and are never chosen.",
    question: "Should Clear Seal (spot use) and Active Boba ever be recommended? If yes, for which answers, and may they be used with the serum?",
  },
  {
    id: "active-boba-two-actives",
    products: ["Active Boba"],
    store: "Active Boba contains Niacinamide, Salicylic Acid and Zinc PCA together. It was sold out on 2026-10-06.",
    rules: "It is left out as unavailable. If it were in stock and written as a serum, it would still be left out, because it has two active classes (niacinamide and bha).",
    question: "If Active Boba is meant to be the Treat step for some users, which rule should choose it over the serum?",
  },
  {
    id: "serum-concentration-and-extras",
    products: ["5% Niacinamide Serum"],
    store: "5% encapsulated Niacinamide with Zinc PCA, SEPICONCONTROL A5 and PDRN.",
    rules: "The serum fits the rules' one active and is chosen when a trigger fires (blemishes or pigment, or a dark mark that fades or lingers). The rules do not check the concentration, and Zinc PCA, SEPICONCONTROL A5 and PDRN have no ingredient class.",
    question: "Is 5% niacinamide with these supporting actives what the rules mean by 'the niacinamide serum'? Should any of the supporting actives be a class of their own?",
  },
  {
    id: "salicylic-pregnancy",
    products: ["Refreshing Cleanser", "Clear Seal", "Active Boba"],
    store: "Three products contain salicylic acid. The product pages list no warnings or contraindications.",
    rules: "The only pregnancy notice is about retinoids. The catalogue's contraindications are empty for every store product, so nothing is left out for a pregnant or breastfeeding user.",
    question: "Should salicylic acid (and glycolic acid) products carry a pregnancy or breastfeeding contraindication or notice? Which products, at which strengths?",
  },
  {
    id: "reactive-barrier",
    products: ["5% Niacinamide Serum", "Refreshing Cleanser", "Active Boba"],
    store: "The pages say: start once daily if the barrier is reactive, patch test first, reduce the cleanser to once daily if skin feels tight.",
    rules: "No rule reads sensitivity or barrier answers, and the routine items have no frequency.",
    question: "Should the rules show 'start once daily' or a patch test line for any answer, and from which quiz answers?",
  },
  {
    id: "names-with-banned-words",
    products: ["Calming Moisturiser", "Clear Seal", "Refreshing Cleanser"],
    store: "Product names as sold: 'Calming Moisturiser', 'Clear Seal'.",
    rules: "The D-12 word check bans calm* and clear*. Only 'Clear Seal' has an owner name exception, and only for owner data. 'Calming Moisturiser' has none, so it fails the routine word check once it is owner data.",
    question: "For the owner and D-12 rather than the clinical reviewer: may 'Calming Moisturiser' get the same registered-name exception as 'Clear Seal'?",
  },
  {
    id: "kit-not-modelled",
    products: ["Project Skin Complete 4-Step Skincare Routine Kit"],
    store: "The store sells the cleanser, serum, moisturiser and sunscreen as one kit for Rs. 1,699.00.",
    rules: "The rules have no bundle. The kit is left out of this catalogue.",
    question: "For the owner: should a recommendation ever point to the kit instead of the single products?",
  },
  {
    id: "treat-word",
    products: [],
    store: "The store names the second step 'Treat'.",
    rules: "D-12 bans treat* in routine wording, so the app labels the step 'Serum', the store kit's own word for it.",
    question: "For the owner: may 'Treat' be used as a step name (a D-12 exception), or does 'Serum' stay?",
  },
];
