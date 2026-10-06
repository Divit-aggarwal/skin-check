# Design system: The Project SKIN app

Status: built (G03). Section 0 (2026-10-06) replaces the colour, type and
button values of sections 1–5 wherever they differ. Applies to every signed-in
page, the check flow and the signed-out pages.

## 0. Match the live site (2026-10-06)

The values in sections 1–5 came from the store theme's `:root` variables
(brand-source-root.css). The live pages do not use all of them. On 2026-10-06
the computed styles of https://theprojectskin.com/ (home, at 390 and 1280px)
and of one product page (Refreshing Cleanser) were read in Chromium with
Playwright `getComputedStyle`. The raw readings are saved in
[live-styles-2026-10-06.json](live-styles-2026-10-06.json), because the store
can change.

**The greens.** The live site uses three:

- `#1f473e`. This is the `<meta name="theme-color">`. It is also on the main
  pill button (`.ps-button`), the active tab and the callout text. It is the
  most-used green as a text colour on the home page (73 elements).
- `#0f6e56`. This is used on small uppercase labels (eyebrows, active
  ingredients), the Checkout button and some home CTAs. The `:root`
  `--color-forest` still says `#0f6e56`.
- `#0f9b8e`. This is the Add to Cart button on product pages. White text on it
  is only 3.4:1, which fails for text.

The app takes `#1f473e` as its one brand green. The only exception is
eyebrows, which keep the live `#0f6e56`.

| Value | App before | Live site | App now |
|---|---|---|---|
| Browser theme colour | `#ffffff` | `#1f473e` (`meta theme-color`) | `#1f473e` |
| Brand green: links, focus ring, selected nav text | forest `#0f6e56` | `#1f473e` (theme colour, `.ps-button`, active tab) | `#1f473e` |
| Primary button | Pill, `#252724` fill, white text, 16px weight 500, min height 48px (44px from tablet), padding 0 24px | `.ps-button`: pill, `#1f473e` fill and 1px border, white text, Plus Jakarta Sans 16px weight 500, 52px tall, padding 0 24px, no letter case change | As live: pill, `#1f473e`, 16px weight 500, 52px tall, padding 0 24px. Hover `#17362f` (assumed: the store has no hover value for it) |
| Secondary button | Pill, 1px ink border, transparent, ink text, 16px weight 500 | `.button--secondary`: pill, 1px `#ddd8ce` border, transparent, ink text, 15px weight 600, 48px tall, padding 0 22px | As live. Hover: the border turns ink |
| Shop buttons | Not used | ADD TO BAG: `#111` fill, square, 12px weight 700, uppercase, +0.1em. Checkout: `#0f6e56` pill. Product page Add to Cart: `#0f9b8e` pill | Not used. The app sells nothing, and white on `#0f9b8e` fails contrast |
| Page background | White `#ffffff` | Linen `#f5f3ee` (`body`) | Linen `#f5f3ee` |
| Cards | Linen fill, no border, 16px corners | Product card: white, 1px `#ece8e1` border, 12px corners. Menu and learn cards: 16px corners | White, 1px `#ece8e1` border, 16px corners |
| Selected tint (nav item, chosen face area, selected chip) | Mist `#e1f5ee` | `:root --color-mist` `#e1f5ee` (barely used). Lines and borders are `rgba(31,71,62,.12)` | `#e4e9e8`, which is `#1f473e` at 12% on white |
| Ink (body text) | `#2c2c2a` | `#2c2c2a` | `#2c2c2a` |
| Title colour (h1, h2) | `#2c2c2a` | `#111111` (section titles), `#252422` (product h1) | `#111111` |
| Muted text | `#6b6862` | `#6b6862` | `#6b6862` |
| Body text | Plus Jakarta Sans 16px, weight 400, line height 1.55 | Plus Jakarta Sans 15px, weight 500, line height 1.5 | 15px, weight 500, 1.5. Form fields stay 16px, because iOS zooms into smaller fields |
| Page title (h1) | Bai Jamjuree 28px → 36px, weight 600, tight tracking | Bai Jamjuree 30px (390) → 43.5px (1280), weight 600, −0.025em | Bai Jamjuree 30px → 40px, weight 600, −0.025em, `#111` |
| Section title (h2) | Bai Jamjuree 20px → 22px, weight 600, as written | Bai Jamjuree 22px (390) → 34px (1280), weight 600, UPPERCASE, +0.04em, `#111` | Bai Jamjuree 20px → 22px, weight 600, UPPERCASE, +0.04em, `#111`. Kept smaller, because app cards are smaller than store sections |
| Card title (h3) | Plus Jakarta Sans 16px weight 600 | Bai Jamjuree 14px (390) → 18px (1280), weight 600, −0.01em | Bai Jamjuree, weight 600, −0.01em, at the size each card sets (mostly 16px) |
| Small label (eyebrow) | Plus Jakarta Sans 12px, weight 600, uppercase, +0.06em, muted | Plus Jakarta Sans 10–11px, weight 700, uppercase, +0.06 to +0.08em, `#0f6e56` | 12px, weight 700, uppercase, +0.08em, `#0f6e56`. 12px is the app's smallest size |
| Navigation | Plus Jakarta Sans 16px weight 500, ink. Selected: mist, `#0f6e56` | Header links: Plus Jakarta Sans 16px weight 500, `#1d1d1f`. Menu links: 14px weight 500, `#4f4c49` | 16px weight 500, ink. Selected: tint `#e4e9e8`, `#1f473e` |
| Focus ring | 2px `#0f6e56`, 2px offset | Browser default | 2px `#1f473e`, 2px offset |
| Form field | 48px tall, 8px corners, 1px `#ddd8ce`, white, 16px text | Select: 4px corners, 1px `#dcd7ce`, 13px | Kept: 48px, 8px, 16px (tap size and iOS zoom) |
| Logo | The words "The Project SKIN" in Bai Jamjuree | Image wordmark "project SKIN" | Kept as words. The wordmark image is not in the repository |

**Fonts.** Both live fonts are on Google Fonts and already load through
`next/font`: Bai Jamjuree for headings and Plus Jakarta Sans for text. The
store's own fallbacks, "Purity Editorial" and "Purity Sans", are not public
fonts and are not needed. No font had to be substituted.

**Contrast.** `tests/brand-contrast.test.ts` checks every text pair at 4.5:1
or more and every UI part at 3:1 or more, using the token values in
tailwind.config.ts:

| Pair | Ratio |
|---|---|
| White on `#1f473e` (primary button) | 10.4 |
| `#1f473e` on linen / on white | 9.3 / 10.4 |
| `#1f473e` on the tint `#e4e9e8` | 8.4 |
| Ink on the tint | 11.4 |
| Muted on linen / on white | 5.0 / 5.5 |
| `#0f6e56` eyebrow on linen / on white | 5.6 / 6.2 |
| `#111` titles on linen | 17.0 |
| Error `#b42318` on linen | 5.9 |

## 1. Brand source (what was found, and where)

The app must look like the owner's Shopify store. Nothing below is invented
unless it says so.

**In the repository first.** The repo has no Shopify theme file. It holds four
palettes and four font pairs from earlier work, and none of them is the store's:

| Repo value | Where | Store? |
|---|---|---|
| Sage `#3D6B52`, Rebel `#E84830`, confidence greens/ambers/reds | tailwind.config.ts (comment: "UPDATE THESE if you have official brand guidelines") | No |
| Magenta `#e02d79`, blush `#f7e3e3`, rosewood `#98415a` | app/(marketing)/home.css, components/ui/button.tsx, EchoMark.tsx | No |
| Blush `#9C6B76`, canvas `#FAF4EF`, Echo teal `#1D9E75` | tailwind.config.ts | No |
| Fraunces + Plus Jakarta Sans | app/layout.tsx | Body font only |
| Space Grotesk + Inter | app/(marketing)/layout.tsx | No |

**From the public store** (read 2026-10-05, https://theprojectskin.com/):

- Theme "Project Skin UX 2026-09-20", id 195299475827, assets under `/cdn/shop/t/25/`.
- The `<html>` tag has `data-font-strategy="brand"`.
- The colour and font values come from the inline `:root` block in the page head, saved verbatim in [brand-source-root.css](brand-source-root.css) because the store can change.
- Button, radius and shadow values come from `theme.css` and `purity-home.css` under the same theme.

| Token | Store value | Store variable |
|---|---|---|
| Page | `#ffffff` | `--color-paper` / `--color-canvas` |
| Surface | `#f5f3ee` | `--color-linen` / `--color-surface` |
| Surface 2 | `#eeeae5` | `--color-surface-alt` |
| Border | `#ddd8ce` | `--color-border` |
| Ink (text) | `#2c2c2a` | `--color-ink` |
| Muted text | `#6b6862` | `--color-muted` |
| Action (primary button) | `#252724`, hover `#111210`, on-action `#ffffff` | `--color-action*` |
| Forest | `#0f6e56` | `--color-forest` |
| Mist (forest tint) | `#e1f5ee` | `--color-mist` |
| Accent | `#b98783`, soft `#f3e9e7`, secondary `#c58f65` | `--color-accent*` |
| Decorative | blush `#fb8cb3`, lilac `#6a479e`, sky `#0096d6`, mint `#0f9b8e`, gold `#ffe300`, taupe `#b7a58f`, cyan `#00a3b1` | `--color-*` |
| Highlight | `#e6b84a` | `--highlight` |
| Body font | "Plus Jakarta Sans" (variable, 400–800) | `--font-body-family` |
| Heading font | "Bai Jamjuree" 500, 600, 700 | `--font-heading-family` |
| Mono | "IBM Plex Mono" | `--font-mono-family` |
| Body size | 15px | `--body-size` |
| Radius | 8px; buttons `999px` (pill); home cards 16px, small 9px (scoped to `purity-home.css` sections) | `--radius`, `.ps-button` |
| Raised shadow | `0 18px 50px rgba(20,20,15,.1)` (scoped to `purity-home.css` sections) | `--shadow` |
| Page width | 1440px, page padding 30px | `--page-width`, `--page-pad` |
| Button | pill, action fill, 13–16px weight 500, min-height 42–52px, padding 0 24px | `.ps-button` |

Root values win over the `color-mix` fallbacks in the CSS. For example, blush
is `#fb8cb3`, not the fallback `#e8a9b6`.

Both fonts are on Google Fonts and load through `next/font/google`, which is
already in use, so no package is needed.

## 2. Colour rules

Contrast was measured against WCAG 2.1. Text needs 4.5:1, or 3:1 for large text and UI parts.

| Use | Token | On white | On surface |
|---|---|---|---|
| Body text, headings, band words | ink `#2c2c2a` | 14.0 | 12.6 |
| Secondary text | muted `#6b6862` | 5.6 | 5.0 |
| Primary button | action `#1f473e` with white text (§0) | 10.4 | – |
| Links, focus ring, selected nav item | green `#1f473e` (§0) | 10.4 | 9.3 |
| Eyebrows (small uppercase labels) | `#0f6e56` (§0) | 6.2 | 5.6 |
| Selected nav background, chosen face area, info panel | tint `#e4e9e8` (with ink or green text) (§0) | – | – |
| Decorative only, never text | accent, blush, gold, taupe, sky, mint, cyan | 1.3–3.4 | – |
| Error text and border | `#b42318` (assumed; the store has no error colour) | 6.5 | 5.9 |

The error colour is the one value not taken from the store. The repo's
`status.error` `#DC2626` reaches only 4.8:1 on white and 4.3:1 on surface, so it
fails on cards. The owner may replace it.

Hard rules (D-12, TD-24 (4), LONGITUDINAL_METHOD §1):

- A reading (Low, Moderate, Elevated) is always ink text on a neutral surface,
  and all three look the same. Nothing is coloured to mean better or worse:
  no green, amber or red, no fill length, no gauge. The repo's `confidence`
  and `subscore` palettes are never used on readings.
- No arrows, deltas, sparklines or side-by-side numbers between checks.
- The face drawing's chosen area gets the brand tint `#e4e9e8` and a solid
  2.5px `#1f473e` outline (10:1 on the tint). The tint follows the user's
  choice only, never a band or a reading.
- Decorative colours are allowed only on things that carry no meaning about
  skin, such as an illustration, the Echo mark or a routine product dot.

## 3. Type

| Role | Font | Size (phone → desktop) | Weight | Line height |
|---|---|---|---|---|
| Page title (h1) | Bai Jamjuree, −0.025em, `#111` (§0) | 30 → 40px | 600 | 1.15 |
| Section title (h2) | Bai Jamjuree, UPPERCASE, +0.04em, `#111` (§0) | 20 → 22px | 600 | 1.25 |
| Card title (h3) | Bai Jamjuree (§0) | 16px | 600 | 1.4 |
| Body | Plus Jakarta Sans | 15px (§0) | 500 | 1.5 |
| Secondary / meta | Plus Jakarta Sans | 14px | 400 | 1.45 |
| Label / eyebrow | Plus Jakarta Sans, `#0f6e56` (§0) | 12px, +0.08em, uppercase | 700 | 1.3 |

- Body text is 15px weight 500, as on the live site (§0). Form fields stay
  16px, because iOS zooms into any field under 16px.
- Nothing on screen is smaller than 12px.
- Line length is at most 70 characters, about `max-w-prose`.

## 4. Space, corners, shadows

- Spacing uses a 4px base and these steps: 4, 8, 12, 16, 24, 32, 48, 64.
- Page gutter: 16px on phones, 24px on tablets, 32px on desktop.
- Gap between cards: 16px on phones, 24px from tablet up.
- Corners:
  - 8px (store `--radius`) for inputs, list rows and chips.
  - 16px for cards (store home cards).
  - Pill (999px) for buttons and the selected nav item.
- Shadows:
  - None on cards. Cards are separated by surface colour or a 1px border.
  - The store's raised shadow `0 18px 50px rgba(20,20,15,.1)` is only for
    floating layers: a menu, a dialog, and the phone bottom bar (at 6%).

## 5. Components

| Component | Rules |
|---|---|
| Primary button | Pill shape, `#1f473e` fill, white text. 16px, weight 500. 52px tall. Padding 0 24px. One per view (§0). |
| Secondary button | Pill shape with a 1px `#ddd8ce` border, transparent fill and ink text, 15px weight 600, 48px tall (§0). |
| Text link | Forest colour, underlined on hover and focus. Tap area at least 44px tall in lists. |
| Card | White on the linen page, 1px `#ece8e1` border, 16px corners, 16–24px padding (§0). A card's h3 is the card's name. |
| Face drawing | One drawing on Home, an opened check and the results screen (components/dashboard/FaceDrawing.tsx). Each area with a reading (forehead, nose, cheeks, chin) is a button: `role="button"`, `aria-pressed`, the area's name, Enter and Space. Choosing the chosen area again, or the "Whole face" button, shows the whole face. Labels sit inside the areas: no pointer lines. Unchosen areas: dashed ink outline. Chosen: tint fill and a solid green outline. Keyboard focus: a solid 3px green outline. An area without a reading is faint and cannot be chosen. Fits 390px: the drawing scales to the card, up to 300px wide. |
| Reading row | Metric on the left, band word on the right, both in ink, divided by a 1px border. Never a bar or a colour. |
| List row (checks, timeline) | Min height 56px. Date first, then kind, then the photo check. The whole row is the link. A thumbnail (48px, 8px corners) appears only when the user chose to keep the photo. |
| Form field | 48px tall, 8px corners, 1px border, 16px text, label above. Focus ring 2px forest. Errors below the field in the error colour, with `aria-describedby`. |
| Choice chip | 44px tall, pill shape. Selected: ink fill, white text. |
| Status line | Muted 14px text with an icon (lucide, 16px), for example "Photo checks on your phone: passed." |
| Fixed line (TD-24 (1)) | On every opened past check, in a mist panel with ink text, not hidden behind a toggle: "Photos differ in light and angle. Differences between checks are not yet a measured change." |
| Skeleton | Surface-2 blocks shaped like the content. The loading text stays for screen readers (`role="status"`). |
| Empty state | A short sentence, one primary action, and an optional line illustration in a decorative colour. |
| Error state | `role="alert"` and a plain sentence, with no codes. One action: "Try again" (reload) or a way back Home. |

Focus: every interactive element shows a 2px forest outline with a 2px
offset on keyboard focus. Nothing removes the outline without replacing it.

Motion: 150–250ms ease-out fades. Every motion is turned off under
`prefers-reduced-motion`.

## 6. App shell and screen widths

| Width | Navigation | Content |
|---|---|---|
| Phone, under 640px | Bottom bar, 64px plus the safe area. Five items: Home, Checks, New check (centre, primary), Routine, Echo. Account is a round icon button in the top-right of the page header. | One column, 16px gutter. Page header with title and account button. |
| Tablet, 640–1023px | Side rail, 88px wide. The same six places with icon and label stacked: Home, Checks, New check, Routine, Echo, Account (at the bottom). | One column up to 720px, or two where a page says so. 24px gutter. |
| Desktop, 1024px and up | Side bar, 240px. Logo, the six places with icon and label, and New check as a primary button at the top. Account at the bottom with the phone number's last 4 digits. | Content up to 1200px, 32px gutter, a 12-column grid. The dashboard uses two columns (8/4). The checks list uses a list and detail split. Echo uses a chat area plus a context panel. |

- Nav items are links with `aria-current="page"`, inside `<nav aria-label="Main">`.
- A skip link ("Skip to content") is the first focusable element on every page.
- Signed-out pages have no app navigation. They have a top bar with the logo
  and "Sign in". After sign-in the user lands on Home (TD-24 (3)).
- The check flow keeps the shell for a signed-in user, so they can always
  leave. Before sign-in, the flow shows only the logo bar.
