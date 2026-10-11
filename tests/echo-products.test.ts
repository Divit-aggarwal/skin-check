import { afterEach, describe, expect, it, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductCards, splitDoctorLine } from "@/components/skin-check/ProductCards";
import { bannedWordsIn as _b, stepLabelIsExcepted } from "@/lib/catalog/wording";
import { buildContextPackage, packageJson, screenExternalText, type BuildInput } from "@/lib/context/builder";
import { renderSystemInstruction, responseSchema } from "@/lib/context/renderer";
import { validateAnswer } from "@/lib/context/validator";
import { guardedReply, oneLeadIn, openingNote, productGuard, type ShownProduct } from "@/lib/context/answer";
import { hidesProductsAfter } from "@/lib/context/chat-turns";
import { DOCTOR_REFERRAL_COPY, REFERRAL_COPY } from "@/lib/context/prefilter";
import { CATALOGUE } from "@/lib/catalog/catalogue";
import { bannedWordsIn } from "@/lib/catalog/wording";
import { evaluateSafety } from "@/lib/rules/safety";
import { COPY } from "@/lib/rules/settings";
import { ECHO_PRODUCTS_INSTRUCTION, ECHO_SAFETY_INSTRUCTION } from "@/lib/gemini";
import {
  echoProductsOn,
  OWN_PRODUCT_INFO,
  OWN_PRODUCTS,
  OWN_PRODUCTS_LINE,
  PRODUCT_DOCTOR_LINE,
  PRODUCT_DOCTOR_LINE_ON,
  productFactText,
  cardsFor,
  RESULT_QUESTION_LINE,
  STEP_LABEL,
} from "@/lib/context/products";

const escapeHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
void _b;
// The component uses the automatic JSX runtime under Next; vitest compiles it with the classic one.
(globalThis as { React?: typeof React }).React = React;
import { CHEEK_SCORES, SCORES } from "./context-fixtures";

// TD-34 (owner, 2026-10-10): Echo may suggest Project Skin's own products, and
// Gemini picks which. The list, the checker and the guards are code.

const SKIN = { scores: SCORES, regionScores: { cheeks: CHEEK_SCORES }, regionLowConfidence: {}, pipelineVersion: "scan-0.1.6-provisional", schemaVersion: 1 };
const ANSWERS = { skin_type: "oily", primary_concerns: ["redness", "oiliness"], current_products: ["cleanser_moisturizer"] };
const input = (over: Partial<BuildInput> = {}): BuildInput => ({ regionFocus: "cheeks", message: "Which products should I use?", skin: SKIN, answers: ANSWERS, ownProducts: true, ...over });
const pkg = buildContextPackage(input());

const answer = (a: { claims?: unknown[]; products?: unknown[]; needs_referral?: boolean; distress?: boolean }) =>
  JSON.stringify({ claims: [{ claim_type: "product", text: "Here is a simple routine from Project Skin's products.", fact_ids: ["rec.refreshing-cleanser"] }], needs_referral: false, distress: false, ...a });
const check = (raw: string, message = "Which products should I use?", p = pkg) => validateAnswer(raw, p, message);
const failed = (raw: string, message?: string, p = pkg) => check(raw, message, p).failures.map((f) => f.check);

const SKIN_TYPE = "self.all.skin_type";
const GOOD_PRODUCTS = [
  { product_id: "refreshing-cleanser", reason: "You told us your skin type: Oily", fact_ids: [SKIN_TYPE] },
  { product_id: "protecting-sunscreen", reason: "You told us your main skin concerns: Redness; Excess oil", fact_ids: ["self.all.primary_concerns"] },
];

describe("the product list Gemini receives (TD-34, build part 1)", () => {
  it("covers all six catalogue products, and lists the in-stock ones only (Active Boba is out of stock)", () => {
    expect(Object.keys(OWN_PRODUCT_INFO).sort()).toEqual(CATALOGUE.products.map((p) => p.id).sort());
    const inStock = CATALOGUE.products.filter((p) => p.availability === "available").map((p) => p.id);
    expect(OWN_PRODUCTS.map((p) => p.id).sort()).toEqual(inStock.sort());
    expect(OWN_PRODUCTS.map((p) => p.id)).not.toContain("active-boba-cream");
    expect(pkg.recommendation?.items.map((i) => i.productId).sort()).toEqual(inStock.sort());
  });

  it("each product has an id, name, step, key ingredient, how to use and description, and a store link", () => {
    for (const p of OWN_PRODUCTS) {
      const text = productFactText(p);
      for (const part of [p.name, p.keyIngredient, p.usage, p.description]) expect(text).toContain(part);
      expect(p.url).toMatch(/^https:\/\/theprojectskin\.com\/products\/[a-z0-9-]+$/);
    }
  });

  it("every description passes the D-12 word check and the outside-text screen; no result or cure word", () => {
    for (const { description } of Object.values(OWN_PRODUCT_INFO)) {
      expect(bannedWordsIn(description), description).toEqual([]);
      expect(screenExternalText(description), description).toBe(true);
      expect(description).not.toMatch(/\b(?:help|helps|control|target|prevent|sooth|purif|refine|repair|results?|clearer|healthier|acne)\b/i);
    }
  });

  it("is the same for every user: answers, readings and safety never change it", () => {
    const pregnant = { ...ANSWERS, gender: "female", female_skin_context: ["pregnant_or_breastfeeding"] };
    const other = buildContextPackage(input({ answers: pregnant, safety: evaluateSafety({ answers: pregnant, confirmedThisScan: [] }), skin: { ...SKIN, scores: CHEEK_SCORES } }));
    expect(JSON.stringify(other.recommendation)).toBe(JSON.stringify(pkg.recommendation));
  });

  it("goes with a product question or the opening, not with every question", () => {
    expect(buildContextPackage(input({ message: "what does my cheek reading mean?" })).recommendation).toBeUndefined();
    expect(buildContextPackage(input({ message: "what does my cheek reading mean?", opening: true })).recommendation).toBeDefined();
    for (const m of ["Mere liye kaunsa face wash sahi hai?", "which one should i get", "how often should I apply it", "SPF kitna lagana chahiye"]) {
      expect(buildContextPackage(input({ message: m })).recommendation, m).toBeDefined();
    }
  });
});

describe("the product switch (TD-34, build part 7)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is on unless ECHO_PRODUCTS_SWITCH is exactly 'off'", () => {
    expect(echoProductsOn()).toBe(true);
    vi.stubEnv("ECHO_PRODUCTS_SWITCH", "Off");
    expect(echoProductsOn()).toBe(true);
    vi.stubEnv("ECHO_PRODUCTS_SWITCH", "off");
    expect(echoProductsOn()).toBe(false);
  });

  it("off: Gemini receives exactly what it received before TD-34 (package, instruction and format)", () => {
    for (const message of ["Which products should I use?", "what does my cheek reading mean?"]) {
      const off = buildContextPackage(input({ message, ownProducts: false }));
      const before = buildContextPackage({ regionFocus: "cheeks", message, skin: SKIN, answers: ANSWERS });
      expect(packageJson(off)).toBe(packageJson(before));
      // TD-40: ctx-2 with five readings is ctx-6.
      expect(off.packageVersion).toBe("ctx-6");
      expect(renderSystemInstruction(off)).toBe(renderSystemInstruction(before));
      expect(renderSystemInstruction(off)).toContain(ECHO_SAFETY_INSTRUCTION);
      expect(renderSystemInstruction(off)).not.toContain(ECHO_PRODUCTS_INSTRUCTION);
      expect(JSON.stringify(responseSchema(off))).not.toContain("products");
    }
  });

  it("off: an answer that suggests a product is rejected", () => {
    const off = buildContextPackage(input({ ownProducts: false }));
    expect(failed(answer({ products: GOOD_PRODUCTS }), undefined, off)).toContain("product_not_in_list");
  });

  it("on: one instruction for every user, and the product rules; the old 'no products' sentence is gone", () => {
    const text = renderSystemInstruction(pkg);
    expect(text.split(ECHO_PRODUCTS_INSTRUCTION)).toHaveLength(2);
    expect(text).not.toContain(ECHO_SAFETY_INSTRUCTION);
    expect(ECHO_PRODUCTS_INSTRUCTION).not.toMatch(/pregnan|breastfeed|prescri|caution|doctor/i);
  });
});

describe("the answer checker (TD-34, build parts 2 and 6)", () => {
  it("a good suggestion passes: listed ids, reasons that repeat the user's facts, an uncertainty claim with a reading", () => {
    const v = check(answer({ claims: [{ claim_type: "uncertainty", text: "These readings compare areas within one photo. They are not a measurement scale.", fact_ids: ["uncert.all.within_photo"] }], products: GOOD_PRODUCTS }));
    expect(v.failures).toEqual([]);
    expect(v.passed).toBe(true);
  });

  it("a product claim may use the product's own exact name and words", () => {
    const v = check(answer({ claims: [{ claim_type: "product", text: "Refreshing Cleanser: Massage onto damp skin in the morning, at night or both, then rinse thoroughly.", fact_ids: ["rec.refreshing-cleanser"] }] }));
    expect(v.failures).toEqual([]);
    expect(check(answer({ claims: [{ claim_type: "product", text: "Use 5% Niacinamide Serum: After cleansing, apply 2 to 3 drops to dry skin, then moisturiser, and sunscreen in the morning.", fact_ids: ["rec.niacinamide-serum"] }] })).failures).toEqual([]);
  });

  it("one sentence of a product's how-to-use, quoted as it is, passes (live run n07, a03)", () => {
    expect(check(answer({ claims: [{ claim_type: "product", text: "Clear Seal: Apply a thin layer on a clean, dry spot and let it dry to a film.", fact_ids: ["rec.clear-seal"] }] })).failures).toEqual([]);
  });

  it("a product claim may not rearrange its product's words into a result (safety review)", () => {
    for (const [text, id] of [["Use Clear Seal, then the single spot is nearly invisible.", "rec.clear-seal"], ["5% Niacinamide Serum: then your oily skin is dry skin.", "rec.niacinamide-serum"], ["5% Niacinamide Serum is for your oily and blemish-prone skin.", "rec.niacinamide-serum"]] as const) {
      expect(check(answer({ claims: [{ claim_type: "product", text, fact_ids: [id] }] })).passed, text).toBe(false);
    }
  });

  it("a reason may not borrow its product's words, nor claim a fit (safety review)", () => {
    for (const reason of ["You told us your main skin concerns: Redness; Excess oil, so a single spot is nearly invisible", "You told us your skin type: Oily, so this is for you"]) {
      expect(check(answer({ products: [{ product_id: "clear-seal", reason, fact_ids: [reason.includes("concerns") ? "self.all.primary_concerns" : SKIN_TYPE] }] })).passed, reason).toBe(false);
    }
  });

  it("the refusal exemption is narrow: a negated sale phrase is no exemption (safety review)", () => {
    for (const text of ["I won't hide these deals from you.", "Don't miss these deals.", "You can't beat these prices."]) {
      expect(check(answer({ claims: [{ claim_type: "out_of_scope", text, fact_ids: [] }] })).passed, text).toBe(false);
    }
  });

  it.each([
    ["an id not on the list", [{ product_id: "cerave-cleanser", reason: "You told us your skin type: Oily", fact_ids: [SKIN_TYPE] }]],
    ["an out-of-stock product", [{ product_id: "active-boba-cream", reason: "You told us your skin type: Oily", fact_ids: [SKIN_TYPE] }]],
    ["the same product twice", [GOOD_PRODUCTS[0], GOOD_PRODUCTS[0]]],
  ])("rejects %s (product_not_in_list)", (_, products) => {
    expect(failed(answer({ products }))).toContain("product_not_in_list");
  });

  it.each([
    ["another brand", "I can only talk about our products, not CeraVe.", "product_not_in_list"],
    ["a shop", "You can find similar ones on Nykaa.", "product_not_in_list"],
    ["our out-of-stock product", "Active Boba Encapsulated Cream is another option.", "product_not_in_list"],
    ["our kit", "The routine kit has all four.", "product_not_in_list"],
    ["a result claim", "This routine helps control oil.", "efficacy_claim"],
    ["a cure claim", "These products cure acne.", "medical_or_efficacy_term"],
    ["a product-caused change", "After using it your redness went down.", "comparative_or_change"],
    ["a made-up price", "Each one costs very little.", "made_up_price"],
    ["a made-up discount", "There is a discount on these right now.", "made_up_price"],
    ["a number price", "It is only Rs 399.", "made_up_number"],
    ["pressure to buy", "Buy them now before they sell out.", "purchase_pressure"],
    ["an ingredient", "Look for niacinamide.", "product_claim"],
    ["a Hinglish result claim", "Isse aapki skin saaf ho jayegi.", "efficacy_claim"],
  ])("rejects %s in a claim", (_, text, check) => {
    expect(failed(answer({ claims: [{ claim_type: "out_of_scope", text, fact_ids: [] }] }))).toContain(check);
  });

  it.each([
    ["says what the product does", "You told us your skin type: Oily, and this keeps oil away", "product_claim"],
    ["a result claim", "It works well for oily skin you told us about", "efficacy_claim"],
    ["a reason with no fact of the user's", "A simple daily step", "citation_rule"],
    ["an answer presented as measured", "Your skin type: Oily", "self_report_as_measurement"],
    // Owner decision 2026-10-10: a reason quotes the user's answers only, never a reading.
    ["a reading, even quoted exactly", "Oiliness, photo-based estimate for the whole face: Elevated", "citation_rule"],
    ["a band the reading does not hold", "Oiliness, photo-based estimate for the whole face: Low", "citation_rule"],
    ["a reason citing another product", "You told us your skin type: Oily", "citation_rule"],
  ])("rejects a reason that %s", (name, reason, check) => {
    const fact_ids = name === "a reason with no fact of the user's" ? [] : name.includes("band") || name.includes("reading") ? ["state.all.oiliness"] : name.includes("another product") ? ["rec.clear-seal"] : [SKIN_TYPE];
    expect(failed(answer({ products: [{ product_id: "refreshing-cleanser", reason, fact_ids }] }))).toContain(check);
  });

  it("a reason that quotes the user's answer and a reading together is rejected (owner decision 2026-10-10)", () => {
    expect(failed(answer({ products: [{ product_id: "refreshing-cleanser", reason: "You told us your skin type: Oily", fact_ids: [SKIN_TYPE, "state.all.oiliness"] }] }))).toContain("citation_rule");
  });

  it("the new checks run only while products are on, so an off package is checked exactly as before", () => {
    const off = buildContextPackage(input({ ownProducts: false }));
    const raw = answer({ claims: [{ claim_type: "out_of_scope", text: "I cannot say what works for you.", fact_ids: [] }] });
    expect(check(raw, "what works?", off).passed).toBe(true);
  });
});

describe("the guards, in code (TD-34, build part 5)", () => {
  const products: ShownProduct[] = [{ productId: "refreshing-cleanser", reason: "You told us your skin type: Oily" }];
  const withProducts = { reply: "Here is a simple routine. Refreshing Cleanser: rinse well.", withoutProducts: "Here is a simple routine.", products, productContent: true };
  const safety = (answers: Record<string, unknown>) => evaluateSafety({ answers: { primary_concerns: ["blemishes"], ...answers }, confirmedThisScan: [] });

  it("TD-45: a questionnaire red flag no longer blocks products; the opening note is added once", () => {
    const flagged = safety({ breakout_pattern: ["deep_painful"] });
    expect(productGuard(flagged)).toBe(null);
    expect(guardedReply(withProducts, productGuard(flagged))).toEqual({ reply: withProducts.reply, products: withProducts.products });
    expect(openingNote(flagged, "Here is a simple routine.")).toBe(`${COPY.referral}\nHere is a simple routine.`);
    expect(openingNote(safety({}), "Here is a simple routine.")).toBe("Here is a simple routine.");
  });

  it("the red_flag guard (a red-flag chat message): the dermatologist line comes first and no product at all", () => {
    const shown = guardedReply(withProducts, "red_flag");
    expect(shown.products).toEqual([]);
    expect(shown.reply.split("\n")[0]).toBe(COPY.referral);
    expect(shown.reply).not.toContain("Refreshing Cleanser");
  });

  it("red flag from a hidden answer (irregular periods with blemishes) gets the opening note too", () => {
    expect(openingNote(safety({ gender: "female", female_skin_context: ["irregular_periods"] }), "x").split("\n")[0]).toBe(COPY.referral);
  });

  it("red flag on the opening: the line first even when Gemini suggested nothing", () => {
    const shown = guardedReply({ reply: "Here is a simple routine.", withoutProducts: "Here is a simple routine.", products: [], productContent: false }, "red_flag", true);
    expect(shown.reply.split("\n")[0]).toBe(COPY.referral);
  });

  it.each([
    ["pregnancy or breastfeeding", { gender: "female", female_skin_context: ["pregnant_or_breastfeeding"] }],
    ["a prescription", { current_products: ["prescription"] }],
  ])("%s: products shown, with the fixed doctor line", (_, answers) => {
    const guard = productGuard(safety(answers));
    expect(guard).toBe("doctor_line");
    const shown = guardedReply(withProducts, guard);
    expect(shown.products).toEqual(products);
    expect(shown.reply.split("\n").at(-1)).toBe(PRODUCT_DOCTOR_LINE);
  });

  it("the doctor line is a named setting, on, and passes the D-12 word check", () => {
    expect(PRODUCT_DOCTOR_LINE_ON).toBe(true);
    expect(bannedWordsIn(PRODUCT_DOCTOR_LINE)).toEqual([]);
    expect(bannedWordsIn(OWN_PRODUCTS_LINE)).toEqual([]);
  });

  it("no guard, or no product in the answer: the reply is unchanged", () => {
    expect(guardedReply(withProducts, null)).toEqual({ reply: withProducts.reply, products });
    const plain = { reply: "Hello.", withoutProducts: "Hello.", products: [], productContent: false };
    expect(guardedReply(plain, "doctor_line")).toEqual({ reply: "Hello.", products: [] });
    expect(guardedReply(plain, "red_flag")).toEqual({ reply: "Hello.", products: [] });
    // Live run p16: a refusal with no product, whose uncited lines are left out under a red flag, gets no doctor line.
    expect(guardedReply({ reply: "I can only talk about Project Skin's products.", withoutProducts: "", products: [], productContent: false }, "doctor_line").reply).not.toContain(PRODUCT_DOCTOR_LINE);
  });
});

describe("the answer format stays fixed in size with products on (F19)", () => {
  it("the schema does not depend on the package's facts or list, and stays small", () => {
    const minimal = buildContextPackage({ regionFocus: null, message: "hi", skin: null, answers: {}, ownProducts: true });
    const schema = JSON.stringify(responseSchema(pkg));
    expect(schema).toBe(JSON.stringify(responseSchema(minimal)));
    for (const item of pkg.recommendation!.items) expect(schema).not.toContain(item.productId);
    expect(schema.length).toBeLessThanOrEqual(900);
  });
});

describe("narrow checker changes found in the live run (TD-34, named)", () => {
  const says = (text: string) => failed(answer({ claims: [{ claim_type: "out_of_scope", text, fact_ids: [] }] }));
  it("a refusal that names prices or discounts passes; any other price or buying word still fails", () => {
    expect(says("I cannot provide discount codes or pricing details.")).toEqual([]);
    expect(says("I can't share prices, discounts or offers.")).toEqual([]);
    expect(says("I cannot share prices, but it is cheap.")).toContain("made_up_price");
    expect(says("I don't know the price but buy it now.")).toContain("purchase_pressure");
  });
  it("'Project Skin' is our own name in an uncited claim; another brand still fails", () => {
    expect(says("I can only talk about Project Skin's products.")).toEqual([]);
    expect(says("I can only talk about CeraVe products.")).toContain("product_not_in_list");
  });
  it("a verbatim quote of a cited product's whole fact passes; its key ingredient alone does not", () => {
    const fact = pkg.recommendation!.items[0]!;
    expect(failed(answer({ claims: [{ claim_type: "product", text: fact.text, fact_ids: [fact.id] }] }))).toEqual([]);
    expect(failed(answer({ claims: [{ claim_type: "product", text: "Refreshing Cleanser has Salicylic Acid 2%.", fact_ids: [fact.id] }] }))).toContain("product_claim");
  });
});

describe("the card drawing (TD-34, build part 3)", () => {
  it("cardsFor: listed products only, once each, in step order whatever the input order", () => {
    const cards = cardsFor([
      { productId: "protecting-sunscreen", reason: "b" },
      { productId: "made-up" },
      { productId: "active-boba-cream", reason: "out of stock" },
      { productId: "refreshing-cleanser", reason: "a" },
      { productId: "refreshing-cleanser", reason: "again" },
    ]);
    expect(cards.map((c) => c.id)).toEqual(["refreshing-cleanser", "protecting-sunscreen"]);
    expect(cards[0]!.reason).toBe("a");
  });

  it("the cards: name, step, key ingredient, how to use, Echo's note and a store link in a new tab; the own-products line; no price", () => {
    const html = renderToStaticMarkup(createElement(ProductCards, { products: [{ productId: "niacinamide-serum", reason: "You told us your skin type: Oily" }, { productId: "refreshing-cleanser" }] }));
    const serum = OWN_PRODUCTS.find((p) => p.id === "niacinamide-serum")!;
    for (const part of [escapeHtml(OWN_PRODUCTS_LINE), serum.name, "Treat", "Cleanse", escapeHtml(serum.keyIngredient), escapeHtml(serum.usage), "Echo&#x27;s note", "You told us your skin type: Oily"]) expect(html, part).toContain(part);
    expect(html.indexOf("Cleanse")).toBeLessThan(html.indexOf("Treat"));
    expect(html).toContain(`href="${serum.url}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toMatch(/₹|\bRs\b|price|buy|cart/i);
    expect(html).not.toContain(PRODUCT_DOCTOR_LINE);
    expect(html.match(/Echo&#x27;s note/g)).toHaveLength(1); // no note for a card without a reason
  });

  it("the doctor line is its own panel only when the reply carries it; nothing is drawn for no listed product", () => {
    expect(splitDoctorLine(`Here.\n${PRODUCT_DOCTOR_LINE}`)).toEqual({ text: "Here.", doctorLine: true });
    expect(splitDoctorLine("Here.")).toEqual({ text: "Here.", doctorLine: false });
    expect(renderToStaticMarkup(createElement(ProductCards, { products: [{ productId: "refreshing-cleanser" }], doctorLine: true }))).toContain(PRODUCT_DOCTOR_LINE);
    expect(renderToStaticMarkup(createElement(ProductCards, { products: [{ productId: "active-boba-cream" }] }))).toBe("");
  });

  it("every key ingredient and step label on a card passes the D-12 word check ('Treat' is the owner's exact-label exception)", () => {
    for (const p of OWN_PRODUCTS) expect(bannedWordsIn(p.keyIngredient), p.keyIngredient).toEqual([]);
    for (const label of Object.values(STEP_LABEL)) expect(stepLabelIsExcepted(label) || bannedWordsIn(label).length === 0, label).toBe(true);
  });
});

describe("a question whether a product works or is good for something gets no product (TD-34, stricter guard)", () => {
  const none = evaluateSafety({ answers: { primary_concerns: ["blemishes"] }, confirmedThisScan: [] });
  const withProducts = { reply: "Massage onto damp skin.", withoutProducts: "", products: [{ productId: "refreshing-cleanser", reason: "r" }], productContent: true };
  it.each(["Which of your products works fastest on oily skin?", "Which serum is good for my redness?", "Is niacinamide good for me?", "Niacinamide serum mere liye theek hai kya?", "Will the cleanser fix my blemishes?", "Kya yeh serum mere daag mita dega?"])("%s", (message) => {
    const guard = productGuard(none, message);
    expect(guard).toBe("result_question");
    expect(guardedReply(withProducts, guard)).toEqual({ reply: RESULT_QUESTION_LINE, products: [] });
  });
  it.each(["Can you suggest a routine for me?", "What is Clear Seal for?", "How do I use the Refreshing Cleanser?", "Mere liye kaunsa routine sahi rahega?", "Oily skin ke liye kaunsa face wash lun?", "Which moisturiser do you have?",
    // Owner brief 2026-10-11: naming one's own concern in a product question gets the cards.
    "what shall i use for my acne ?", "Which serum should I buy for my redness?", "Kaunsi cream lagaun redness ke liye?"])("not for an ordinary product question: %s", (message) => {
    expect(productGuard(none, message)).toBeNull();
  });
  it("it applies with a questionnaire red flag too (TD-45); the line passes the D-12 word check", () => {
    expect(productGuard(evaluateSafety({ answers: { primary_concerns: ["blemishes"], breakout_pattern: ["deep_painful"] }, confirmedThisScan: [] }), "Is it good for me?")).toBe("result_question");
    expect(bannedWordsIn(RESULT_QUESTION_LINE)).toEqual([]);
  });
});

describe("F28 and F29 (owner, 2026-10-11)", () => {
  it("F28: a card reason never repeats its lead-in", () => {
    expect(oneLeadIn("You told us You told us your main skin concerns: Breakouts")).toBe("You told us your main skin concerns: Breakouts");
    expect(oneLeadIn(" you told us: You told us your skin type: Oily ")).toBe("you told us your skin type: Oily");
    expect(oneLeadIn("Aapne bataya Aapne bataya: skin type Oily")).toBe("Aapne bataya: skin type Oily");
    expect(oneLeadIn("You told us your skin type: Oily")).toBe("You told us your skin type: Oily");
  });

  it("F29: a doctor-line reply hides products in that reply only; self-harm and red-flag referrals still hide them afterwards", () => {
    expect(hidesProductsAfter({ role: "echo", redFlag: true, text: DOCTOR_REFERRAL_COPY })).toBe(false);
    expect(hidesProductsAfter({ role: "echo", redFlag: true, text: REFERRAL_COPY })).toBe(true);
    expect(hidesProductsAfter({ role: "echo", redFlag: true, text: "an older referral wording" })).toBe(true);
    expect(hidesProductsAfter({ role: "echo", redFlag: false, text: "Here is a simple routine." })).toBe(false);
    expect(hidesProductsAfter({ role: "user", redFlag: true, text: "what medicine should i take" })).toBe(false);
  });
});
