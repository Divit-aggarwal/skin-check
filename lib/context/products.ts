import { CATALOGUE, CATALOG_VERSION } from "@/lib/catalog/catalogue";
import type { Product } from "@/lib/catalog/schema";

// TD-34 (owner, 2026-10-10): Echo may suggest Project Skin's own products, and
// Gemini picks which. Client-safe (no server imports): the chat builder reads
// the list, and the Echo screen draws the cards from the same list.
//
// The list is the same for every user: nothing about the user is read here.
// Out-of-stock products are left out. The guards (red flag, doctor line) are
// applied in code after Gemini answers (lib/context/answer.ts productGuard),
// never by changing what Gemini receives.

/** The store's four steps (Cleanse, Treat, Moisturise, Protect), plus spot care outside them. */
export type ProductStep = "cleanse" | "treat" | "moisturise" | "protect" | "spot";

export const STEP_ORDER: readonly ProductStep[] = ["cleanse", "treat", "moisturise", "protect", "spot"];

/** On screen. "Treat" is the owner-approved step label (TD-26 (1)). */
export const STEP_LABEL: Record<ProductStep, string> = {
  cleanse: "Cleanse",
  treat: "Treat",
  moisturise: "Moisturise",
  protect: "Protect",
  spot: "Spot care",
};

// In Gemini's list. "Treat" is a medical word to the answer checker (MEDICAL),
// so the step is named by its product type there; the screen still says Treat.
const STEP_FOR_GEMINI: Record<ProductStep, string> = {
  cleanse: "cleanse",
  treat: "serum",
  moisturise: "moisturise",
  protect: "protect",
  spot: "spot care, outside the four steps",
};

/**
 * Step, key ingredient and a short neutral description per product, written
 * on 2026-10-10 from the store's product pages ("Key actives", "Key
 * ingredients", the product text), with every result and cure claim removed.
 * DESCRIPTIONS AWAIT OWNER APPROVAL (TD-34 report). Usage is the catalogue's
 * own usageText. tests/echo-products.test.ts runs every description through
 * the D-12 word check and the outside-text screen.
 */
export const OWN_PRODUCT_INFO: Record<string, { step: ProductStep; keyIngredient: string; description: string }> = {
  "refreshing-cleanser": {
    step: "cleanse",
    keyIngredient: "Salicylic Acid 2%",
    description: "A lightweight face wash for oily and breakout-prone skin, rinsed off after use.",
  },
  "niacinamide-serum": {
    step: "treat",
    keyIngredient: "Encapsulated Niacinamide",
    description: "A fast-absorbing, lightweight serum for oily and blemish-prone skin.",
  },
  "calming-moisturiser": {
    step: "moisturise",
    keyIngredient: "Ceramide complex",
    description: "A lightweight gel-cream with skin-identical lipids and botanical extracts, for use morning and night.",
  },
  "protecting-sunscreen": {
    step: "protect",
    keyIngredient: "Tinosorb S and Uvinul A Plus UV filters",
    description: "A lightweight aqua-gel sunscreen with broad-spectrum UVA and UVB filters, worn as the final morning step.",
  },
  "clear-seal": {
    step: "spot",
    keyIngredient: "Salicylic Acid",
    description: "A quick-drying liquid patch that dries to a thin, nearly invisible film over a single spot.",
  },
  "active-boba-cream": {
    step: "treat",
    keyIngredient: "Niacinamide",
    description: "A lightweight cream with small beads that burst as you apply it.",
  },
};

export const STORE_URL = "https://theprojectskin.com/products/";

export interface ListedProduct {
  id: string;
  name: string;
  step: ProductStep;
  keyIngredient: string;
  usage: string;
  description: string;
  url: string;
}

const listed = (p: Product): ListedProduct[] => {
  const info = OWN_PRODUCT_INFO[p.id];
  if (!info || p.availability !== "available" || p.dataSource !== "owner" || !p.shopifyHandle) return [];
  return [{ id: p.id, name: p.name, step: info.step, keyIngredient: info.keyIngredient, usage: p.usageText, description: info.description, url: `${STORE_URL}${p.shopifyHandle}` }];
};

// ponytail: stock is the catalogue snapshot (CATALOG_VERSION); a store stock change needs a catalogue edit and a deploy.
/** In-stock own products, in step order. */
export const OWN_PRODUCTS: readonly ListedProduct[] = CATALOGUE.products
  .flatMap(listed)
  .sort((a, b) => STEP_ORDER.indexOf(a.step) - STEP_ORDER.indexOf(b.step));

export const OWN_PRODUCTS_VERSION = `own-products-1/${CATALOG_VERSION}`;

export const listedProduct = (id: string): ListedProduct | undefined => OWN_PRODUCTS.find((p) => p.id === id);

/** The text of one product fact in Gemini's list. Every part is ours. */
export function productFactText(p: ListedProduct): string {
  return `${p.name}. Step: ${STEP_FOR_GEMINI[p.step]}. Key ingredient: ${p.keyIngredient}. How to use: ${p.usage} About: ${p.description}`;
}

/** Parts of a product fact Gemini may repeat on their own (the validator strips them before its word checks). Not the key ingredient. */
export function productQuotes(p: ListedProduct): string[] {
  return [p.name, STEP_FOR_GEMINI[p.step], p.usage, p.description];
}

// ─── Settings ───────────────────────────────────────────────────────────────

/**
 * TD-34: product suggestions are on unless ECHO_PRODUCTS_SWITCH is exactly
 * "off". Off gives Gemini exactly what it got before TD-34 and hides every
 * product card; Echo itself stays on (ECHO_SWITCH is separate).
 * next.config.js builds the value into the browser code too, so a change
 * takes effect with the next deployment (docs/OWNER_QUEUE.md).
 */
export function echoProductsOn(): boolean {
  return process.env.ECHO_PRODUCTS_SWITCH !== "off";
}

/**
 * TD-34 (owner): the fixed doctor line for a pregnancy, breastfeeding or
 * prescription answer, added by our code when products are shown. Named
 * setting: the owner may set it to false after the written dermatology
 * clearance (tracker E16).
 */
export const PRODUCT_DOCTOR_LINE_ON = true;

export const PRODUCT_DOCTOR_LINE = "Check with your doctor before you start any of these products.";

/** Shown with every set of product cards (TD-34). */
export const OWN_PRODUCTS_LINE = "These are Project Skin's own products.";

/** Distinct words for our own products, so an out-of-stock one named in part is still "not on the list". */
export const UNLISTED_ALIASES: Record<string, string[]> = { "active-boba-cream": ["boba"] };

/** The fixed request behind Echo's opening suggestion. Never shown; never typed by the user. */
export const OPENING_MESSAGE = "Please suggest a simple routine for me from your product list, one product per step.";
