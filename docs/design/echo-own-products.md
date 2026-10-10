# Echo suggests Project Skin's own products (TD-34)

Status: built on `feat/echo-own-products`, not merged. Owner decision TD-34
(2026-10-10). Tracker rows E15 (build), E16 (written clearance), F20 (an
older retry difference found during this work).

## 1. What changed, and what did not

| | Before | Now |
|---|---|---|
| Who picks products | Nobody in production (recommend() off until E05) | Gemini, from the in-stock own products only, using the readings and answers it already received (TD-34 (2)) |
| Instruction to Gemini | "Do not suggest any active ingredients or new products…" (TD-17 (1)) | While suggestions are on: "Suggest only products from the product list in the package…". Still one sentence for every user. |
| What reaches Gemini about the user | Unchanged | Unchanged. Hidden answers and typed product names never reach Gemini. |
| D-12 (no change, cause, efficacy or forecast claims) | LOCKED | LOCKED. The checker gained four checks. |
| recommend(), E05 | Off in production | Unchanged and still off |

This overrides CLAUDE.md's "deterministic recommendation rules / Gemini as an
explanation layer" for product choice among these products, by explicit owner
decision. The concern is recorded in TD-34; CLAUDE.md is not edited. The
deterministic parts are the list, the checker, the guards and the cards.

## 2. The list (lib/context/products.ts)

- One entry per catalogue product: step, key ingredient and a short neutral
  description, written from the store's product pages on 2026-10-10 with every
  result and cure claim removed. **The descriptions await owner approval.**
  How to use is the catalogue's own `usageText`.
- Out-of-stock products are left out. Today that is Active Boba, so Gemini gets
  five products. Stock is the catalogue snapshot: a change needs a catalogue
  edit and a deploy.
- The list is the same for every user. Nothing about the user is read.
- Gemini sees the serum's step as "serum", because "Treat" is a medical word
  to the checker. The screen says "Treat" (TD-26 (1)). Clear Seal is "Spot
  care", outside the four steps.
- The list goes to Gemini only with a product question (PRODUCT_INTENT,
  widened for Hinglish) or the opening.

## 3. The answer format and the checker

- Gemini answers with `products: [{product_id, reason, fact_ids}]` next to the
  claims. Ids are plain strings, so the format's size does not depend on the
  facts (F19).
- Rejected:
  - any id not on this package's list, or the same id twice;
  - any product id at all while suggestions are off.
- Each reason is checked as its own claim. It must cite only what the user
  told us (owner decision TD-35, 2026-10-10: readings may inform the choice
  but never stand beside a product) and use only those words.
- New claim type `product`: cites rec facts only, and uses the words of those
  facts.
- New checks, run only while suggestions are on, on claims, reasons and the
  joined text:
  - `efficacy_claim` (result or cure claims, in English and Hinglish);
  - `made_up_price`;
  - `purchase_pressure`;
  - `product_not_in_list` (other brands, shops, our kit, our out-of-stock products).
- Every existing check is kept.
- Narrow changes, each tested in tests/echo-products.test.ts:
  1. The name and the verbatim whole fact of a cited product do not trip the ingredient check. Its key ingredient alone still does.
  2. A refusal that names prices or discounts ("I cannot share prices") passes the price and buying checks only.
  3. "Project Skin" is our own name in an uncited claim.

## 4. The guards (code, after the call)

- **Red flag** (quiz): the dermatologist line ("What you described is worth
  showing a dermatologist.") comes first. Every product card and every claim
  citing a product is removed.
- **Pregnancy, breastfeeding or a prescription answer** (the extra-caution
  list): products are shown, and the fixed line "Check with your doctor before
  you start any of these products." follows. The named setting
  `PRODUCT_DOCTOR_LINE_ON` can be switched off after the written clearance (E16).
- The guards change only what the user sees. The stored turn, which becomes
  Gemini's later history, keeps the unguarded answer. So two users who differ
  only in a hidden answer send Gemini the same requests over two turns
  (tests/echo-products-chat.test.ts).
- Self-harm and red-flag messages keep their fixed replies. Questions skipped:
  F11 as before, and no opening.

## 5. The opening

- `POST /api/skin-check/chat {scanId, region, opening: true}`, with a strict
  shape. It sits behind every gate a question passes: auth, Echo on,
  suggestions on, newest check, 18+, AI-share consent, the key.
- The server sends the fixed request `OPENING_MESSAGE` about the whole face and
  stores the answer as the opening of that check. A later request shows it
  again under today's guards and today's list, with no Gemini call and no
  question spent. Only a new opening counts one of the 20 daily questions.
- With no consent yet, /echo asks for it first, then loads the opening.

## 5b. A question whether a product works (stricter guard, added after the live run)

A card next to "Is niacinamide good for me?", "serum for my redness?" or
"works fastest?" reads as "yes". For such a question (RESULT_QUESTION in
lib/context/products.ts, English and Hinglish, on the user's own message;
our product names are removed first), the app shows no card and no product
line, only "Echo can't say what a product will do for your skin, so no
product is shown for this question." Gemini's input is unchanged.

## 6. The cards (components/skin-check/ProductCards.tsx)

- Drawn by our code from the list by id: step, name, key ingredient, how to
  use, and "See it on the store" (a new tab).
- Gemini's checked reason appears as "Echo's note".
- One line above the cards: "These are Project Skin's own products."
- No price and no buy button. An id not on today's list draws nothing.
- Checked at 390, 768 and 1280 px (tests/browser/echo-products.spec.ts).

## 7. Switches

- `ECHO_PRODUCTS_SWITCH=off`: Gemini gets exactly the ctx-2 / ctx-prompt-4
  input, no product cards appear, and there is no opening. Echo stays on.
- It is built into the browser code like `ECHO_SWITCH`, so it takes effect
  with the next deployment (docs/OWNER_QUEUE.md, section TD-34).
