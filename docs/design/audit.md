# UI audit (before the redesign)

- Date: 2026-10-05.
- Branch: redesign/ui at dc1a23d, local stack, seeded users from tests/browser/seed-users.ts.
- Screenshots: [before/](before/), named `<page>-<state>-<width>.png` at 390 (iPhone 13), 768 (iPad Mini) and 1280 (desktop Chrome, no touch).
- Made by `SHOTS=before npx playwright test -c tests/design/playwright.config.ts`.

What is wrong for the user, page by page, in plain words.

## Across the whole app

1. **No navigation at all.** No page has a menu, a header or a bar. Each page reaches at most one or two others through underlined text links. The browser's Back button is the main way around.
2. **A narrow strip in the middle of large screens.**
   - The dashboard, account and routine pages are capped at 448px wide.
   - Echo is capped at 512px and the check flow at 576px.
   - At 1280px about two thirds of the screen is empty white. On a tablet the column floats in the centre with wide empty margins.
3. **Four brands in one app, none of them the store's.**
   - The check flow uses italic Fraunces and a mauve "blush" label.
   - The dashboard, account and routine pages use a third font.
   - Echo uses a magenta plus mark.
   - The store uses Bai Jamjuree headings, Plus Jakarta Sans body text and near-black buttons (system.md §1).
4. **Everything is plain text.** Sections are headings with grey paragraphs under them: no cards, no grouping, no hierarchy. The page reads like a document, not a home screen.
5. **Actions look like body text.**
   - Most actions are small underlined links: "Take your first Skin Check", "Open your routine", "Delete your account and data".
   - Their tap height is about 20–24px, under the 44px minimum.
   - The one real button per page (Chat with Echo, Send verification code) sits among them with no priority.
6. **Two history lists that disagree.**
   - The dashboard's "Past checks" and the account page's "Your previous scans" show the same checks in different styles.
   - They use different wording ("check" against "scan") and different actions.
7. **Loading, empty and error states are a grey sentence.**
   - Loading is a sentence plus three blank boxes.
   - Error is one line with no action.
   - Empty is "You have no skin checks yet." and a text link.
   - None of them looks designed, and none offers a way on.
8. **Viewport zoom is locked** (`maximumScale: 1, userScalable: false` in app/layout.tsx). Users with low vision cannot pinch to zoom. This is an accessibility failure under WCAG 1.4.4.
9. **No skip link, no landmarks beyond `<main>`, and no visible focus style** on the text links beyond the browser default.

## Start (`/` → `/skin-check`, signed out)

- `/` always opens the questionnaire, even for a signed-in user who has checks. There is no home.
- The page is one italic question and one field at the top of a tall white page. There is no logo, no word about what this is or how long it takes, and no "Sign in" for a returning user.
- The progress bar has 8 grey dashes and the section name in small caps, with no step count.

## Check flow (questions, photo step, results)

- The back control is a bare chevron with no label. The top bar has no logo and no way to leave the flow.
- Questions build up down the page and auto-advance after a tap. On a desktop each answer card sits in the 576px column with large gaps.
- Retake (flow-retake-390.png, flow-retake-use-anyway-390.png): the reason is grey body text under a black box; "Use this photo anyway" appears after the set number of retakes with the same weight as Retake.
- Under 18 blocked (flow-under18-blocked-*.png): one grey sentence inside an Echo bubble on an empty page, no way out except the unlabeled back chevron.
- Under 18 confirm: the two choices are plain buttons with no visual difference between "change my answer" and "yes".
- Photo step:
  - On a phone the preview is a 280px black box with a faint camera icon.
  - The consent checkbox and "Analyze my skin" sit under it. The relation between them is hard to see.
  - The retake reasons are plain grey text.
- Desktop photo step: a live camera box and a Capture button, no file upload. When the photo has no face ("We couldn't find a face"), the results screen still opens with the headline "Your skin, understood." above the error (seen with a camera showing no face; the saved flow-results-1280.png is the normal case, with a face).
- Results:
  - **It shows numbers the rest of the app hides.** Every reading has a score "/100", there is a large "12 /100" headline number, and a "Dryness" row.
    - The dashboard shows band words only and has no Dryness row ("a photo cannot measure it", components/dashboard/state.ts; tests/dashboard-copy.test.ts allows no digits except counts and dates).
    - The same check therefore reads differently on two screens.
    - Question for the owner before step 3.8: should the restyled results screen follow the dashboard rule (band words only, no Dryness)? This is display only; the scan pipeline is unchanged.
  - The headline "Your skin, understood." in large italic serif does not match the rest of the app.
  - Three different exits sit side by side: "Take a new scan", "Your previous scans" (which goes to Account, not the dashboard) and "See all your skin checks".
  - The reading is a separate layout from the dashboard's reading of the same check.

## Dashboard (`/dashboard`)

- **It is not a home page.** It is a stacked list of six text sections:
  - newest reading;
  - starting point;
  - past checks;
  - Ask Echo;
  - routine, which is only a link;
  - privacy.

  Nothing tells the user what to do next. The routine, which the user logs daily, is one link near the bottom.
- The newest reading is a beige list of five rows. "Photo checks on your phone: passed" and the two "What this tells you / does not tell you" blocks are small grey text with equal weight.
- "Starting point: Not enough evidence. Starting checks: 2 of 3" is three lines of three sizes with no grouping. A user cannot tell it is one idea.
- Past checks are beige blocks that look like the reading rows above them but are links. Nothing tells the user they can be opened.
- "Take a new Skin Check" is a small text link under the list.
- The privacy section uses body-size grey text for status lines, and the delete link has the same weight as every other link.
- Empty (new user): "You have no skin checks yet." with a text link, then "Starting point: Nothing to show." Three sections say "nothing" in different words.
- Loading: the title plus three blank boxes. Error: one sentence, no retry button, no way Home.
- At 1280px all of it sits in a 448px column. Nothing uses the width.

## Opened past check (`/dashboard?check=…`)

- It shows only a date, "Photo reading", a photo-check line, and a paragraph explaining why no readings are shown. Most of the screen is empty.
- The paragraph "Readings are shown for your newest photo reading only…" now contradicts owner decision TD-24 (1).
- The only way on is "Back to your dashboard".

## Routine (`/routine`)

- No way back to the dashboard or to anywhere else.
- The purpose text is long and is the most prominent text on the page.
- A product card mixes three different controls:
  - Used and Skipped as outlined boxes;
  - Stop as a separate box on its own line;
  - "Swap for" as a select whose placeholder is "…".
- The "Today, Morning: Used" status sits on the same line as the buttons that set it.
- Add a product uses three native controls with labels in body grey. The "Add" button is greyed out until a product is chosen, with no hint why.
- Dates show as 2026-10-05 here but as "3 Oct 2026" on the dashboard.
- "Your last 7 days" is a dot-separated line of counts and a raw list.
- Signed out: "Sign in to see your routine." with a text link, at the top of a blank page.

## Echo (`/echo`)

- **Dead end on a direct visit or after a refresh.**
  - It says "We lost your check-in — … that session doesn't survive a refresh yet."
  - The only button is "Back to Skin Check", which restarts the questionnaire.
  - Echo cannot be reached from Account or Routine.
- In a session it is a 512px column on every screen.
  - The region tabs are spaced capitals, and the first one is clipped at the left edge ("FOREHEAD" loses its F).
  - The greeting is a large italic serif heading.
  - The reading being discussed is not on screen at all, so the user has to remember it.
  - The back chevron has no label.
  - The send button is a grey circle that looks disabled even when it is not.
- The Echo mark is a magenta plus, a brand colour used nowhere else.

## Account (`/account`)

- Signed out: the form is vertically centred in a tall page, and nothing on it explains why to sign in.
- After sign-in the user stays on the same page. They are not taken to their dashboard.
- Signed in, it stacks:
  - the phone status;
  - a link to the dashboard;
  - a second history list ("Your previous scans");
  - the privacy block (the same as on the dashboard);
  - delete.

  The page mixes "account" with "history".
- Delete (account-delete-confirm-*.png): the typed confirmation opens inline under the history list; the destructive button is not set apart from the rest of the page.
- The +91 prefix box and the field have different corner radii and fills. The disabled "Send verification code" button is mid-grey with white text, which has low contrast.

## Wording that is unclear

| Where | Text | Problem |
|---|---|---|
| Dashboard | "Starting point" / "Not enough evidence." | Says what is missing, not what it means or what to do. |
| Dashboard | "Photo checks on your phone: passed." | "Photo checks" reads like the user's checks; it means the photo-quality checks. |
| Opened check | "Readings are shown for your newest photo reading only…" | Now wrong (TD-24 (1)). |
| Results / Account | "scan" and "check" both used | One word: "check". |
| Echo | "We lost your check-in" | Sounds like data loss; the data is safe. |
| Routine | "Swap for …" | The placeholder "…" does not say what to choose. |
| Routine purpose | "DRAFT: …" | Owner copy pending (TD-24 (2)); must be visible as draft until replaced. |
