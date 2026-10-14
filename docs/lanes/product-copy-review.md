# Product copy for owner review

Status: **waiting for the owner.** Approve, edit or strike each line here. Until
this file is approved, none of these texts is shown on any screen.

Source: `OWN_PRODUCT_INFO[id].description` in `lib/context/products.ts`, written
on 2026-10-10 from the store's product pages with every result and cure claim
removed (TD-34, tracker E15 "descriptions approval"). Each one already passes the
D-12 word check (`tests/echo-products.test.ts`).

## Where they would show after approval

- **Screen 14:** Echo's product cards (`components/skin-check/ProductCards.tsx`), as the subtitle under the name.
- **Screen 15:** the product page `/products/<id>` (`components/products/ProductDetail.tsx`), under the name.

Today neither screen shows them; `tests/browser/echo-products.spec.ts` checks that the product page does not.

**Gemini:** none reaches Gemini until approved (owner 2026-10-15). Before that,
Echo's product list sent each in-stock description as "About: …" (TD-34). Now
`lib/context/products.ts` sends only the ids in `APPROVED_DESCRIPTIONS` (empty),
which `tests/echo-products.test.ts` checks against the package Gemini receives.
On approval, the approved ids are added there and the texts appear on 14 and 15.

## The texts

| Product (id) | Text | Echo cards (14) | Product page (15) | Gemini |
|---|---|---|---|---|
| Refreshing Cleanser (`refreshing-cleanser`) | A lightweight face wash for oily and breakout-prone skin, rinsed off after use. | after approval | after approval | after approval |
| 5% Niacinamide Serum (`niacinamide-serum`) | A fast-absorbing, lightweight serum for oily and blemish-prone skin. | after approval | after approval | after approval |
| Calming Moisturiser (`calming-moisturiser`) | A lightweight gel-cream with skin-identical lipids and botanical extracts, for use morning and night. | after approval | after approval | after approval |
| Protecting Sunscreen SPF 50 PA++++ (`protecting-sunscreen`) | A lightweight aqua-gel sunscreen with broad-spectrum UVA and UVB filters, worn as the final morning step. | after approval | after approval | after approval |
| Clear Seal (`clear-seal`) | A quick-drying liquid patch that dries to a thin, nearly invisible film over a single spot. | after approval | after approval | after approval |
| Active Boba Encapsulated Cream (`active-boba-cream`) | A lightweight cream with small beads that burst as you apply it. | no (out of stock, no card) | after approval | no (out of stock) |

## Owner decision

- [ ] Approved as written / edited above (date, name):
