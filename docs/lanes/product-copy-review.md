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

**Already in use, not on screen:** since TD-34, Echo's product list sends each
in-stock product's description to Gemini as "About: …" (`lib/context/products.ts`
`productFactText`), so an Echo reply can repeat it. This is TD-34 behaviour from
master, which the redesign did not change. Keeping the descriptions away from
Gemini as well would change the chat logic, so it needs a separate decision.

## The texts

| Product (id) | Text | Echo cards (14) | Product page (15) | Gemini today |
|---|---|---|---|---|
| Refreshing Cleanser (`refreshing-cleanser`) | A lightweight face wash for oily and breakout-prone skin, rinsed off after use. | after approval | after approval | yes |
| 5% Niacinamide Serum (`niacinamide-serum`) | A fast-absorbing, lightweight serum for oily and blemish-prone skin. | after approval | after approval | yes |
| Calming Moisturiser (`calming-moisturiser`) | A lightweight gel-cream with skin-identical lipids and botanical extracts, for use morning and night. | after approval | after approval | yes |
| Protecting Sunscreen SPF 50 PA++++ (`protecting-sunscreen`) | A lightweight aqua-gel sunscreen with broad-spectrum UVA and UVB filters, worn as the final morning step. | after approval | after approval | yes |
| Clear Seal (`clear-seal`) | A quick-drying liquid patch that dries to a thin, nearly invisible film over a single spot. | after approval | after approval | yes |
| Active Boba Encapsulated Cream (`active-boba-cream`) | A lightweight cream with small beads that burst as you apply it. | no (out of stock, no card) | after approval | no (out of stock) |

## Owner decision

- [ ] Approved as written / edited above (date, name):
- [ ] Also keep them away from Gemini until approved (changes the chat logic; new tracker row)
