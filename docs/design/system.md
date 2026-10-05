# Design system: The Project SKIN app

Status: draft for the owner's choice of direction (G03 step 2). One system, two
layout directions (see options/). Applies to every signed-in page, the check
flow and the signed-out pages.

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
| Primary button | action `#252724` with white text | 15.1 | – |
| Links, focus ring, selected nav item | forest `#0f6e56` | 6.2 | 5.6 |
| Selected nav background, info panel | mist `#e1f5ee` (with ink or forest text) | – | – |
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
- Decorative colours are allowed only on things that carry no meaning about
  skin, such as an illustration, the Echo mark or a routine product dot.

## 3. Type

| Role | Font | Size (phone → desktop) | Weight | Line height |
|---|---|---|---|---|
| Page title (h1) | Bai Jamjuree | 28 → 36px | 600 | 1.15 |
| Section title (h2) | Bai Jamjuree | 20 → 22px | 600 | 1.25 |
| Card title (h3) | Plus Jakarta Sans | 16px | 600 | 1.4 |
| Body | Plus Jakarta Sans | 16px | 400 | 1.55 |
| Secondary / meta | Plus Jakarta Sans | 14px | 400 | 1.45 |
| Label / eyebrow | Plus Jakarta Sans | 12px, +0.06em, uppercase | 600 | 1.3 |

- Body text is 16px, not the store's 15px. Phone readability is better, and
  iOS zooms into any input under 16px.
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
| Primary button | Pill shape, action fill, white text. 16px, weight 500. Min height 48px on phones and 44px from tablet up. Padding 0 24px. One per view. |
| Secondary button | Pill shape with a 1px ink border, transparent fill and ink text. Same size as the primary. |
| Text link | Forest colour, underlined on hover and focus. Tap area at least 44px tall in lists. |
| Card | Surface `#f5f3ee` or white with a 1px border, 16px corners, 16–24px padding. A card's h3 is the card's name. |
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
