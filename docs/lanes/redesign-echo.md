# Lane D: Echo (18, 19)

Read [redesign-lanes.md](redesign-lanes.md) first. Branch `lane/redesign-echo`,
worktree `../skin-check-rd-echo`, PORT_BASE 4300.

## Screens

| # | Mockup | Becomes | Route / components |
|---|---|---|---|
| 18 | 18-echo-home.png | Echo's opening: Echo mark hero, what Echo does (explains your checks; it does not decide), face-area chooser (Forehead, Cheeks, Nose, Chin: one thread each), starter chips (TD-41), input. "Recent conversations" and "Today's insight" have no data: leave them out | `/echo`, `components/skin-check/EchoPage.tsx`, `EchoMark.tsx`, `echoStarters.ts`, `echoCopy.ts` |
| 19 | 19-echo-conversation.png | The chat on the kit's `ChatBubble`, `SuggestionChips`, `ChatInput` (replace EchoPage's inline copies); product cards inline (lane C's `ProductCards`, as they are); the referral and red-flag notes; "Open this check" link | same files, `EchoBubble.tsx` |

You own: `components/skin-check/EchoPage.tsx`, `EchoBubble.tsx`, `EchoMark.tsx`,
`echoStarters.ts`, `echoCopy.ts`, `app/(marketing)/echo/**`, tests for them.
Read-only: `ProductCards.tsx` (lane C), `components/dashboard/echo-session.ts`,
`lib/context/**`, `lib/gemini.ts`, `app/api/skin-check/chat/route.ts` (the
chat API and its answer shape stay exactly as they are).

## Data

- Have: `POST /api/skin-check/chat` → `{ ok, reply: string, products?:
  {productId, reason?}[], historyToken }` and the opening mode; starters; the
  per-area threads; the AI-share consent gate and the daily limit states;
  referral and red-flag notes (TD-45, F27, F29).
- Don't have: structured reply cards (reasons list, quick tip) — the reply is
  text; a recent-conversations list endpoint; "today's insight"; photo
  analysis by Echo.

## Locked here

Echo explains, never decides; Gemini is the explanation layer, not a source
of truth (CLAUDE.md); TD-34 product cards from code, no price; TD-41
starters; TD-46 area threads; no "analysing your photos", no causes ("likely
reasons… a recent product"), no "AI insights" wording; the consent and limit
gates keep working; `role="log"` + `aria-live="polite"` on the message list.

## Tests

`tests/browser/echo-products.spec.ts`, `dashboard.spec.ts` (Echo parts),
`tests/echo-*.test.ts`, `tests/skin-check-chat*.test.ts`,
`tests/fake-gemini.e2e.test.ts` (stack), `tests/ui-wording.test.ts`.

## Log

Locked decisions and data gaps met while building 18 and 19 (rule 9: logged, no workaround).

1. **Recent conversations** (18): no list endpoint (chat turns have a 90-day TTL and no read API). Left out.
2. **Today's insight** (18): no source. Left out.
3. **Quick actions** (18: analyse my skin, review my routine, view my progress, product recommendations): not in the brief's list. Each is either a nav item already (New check, Routine, Checks) or blocked ("progress", TD-29(1) on-screen recommendations). Left out.
4. **Mockup wording** "Your AI skin coach", "personalised advice", "Understand your results", "next best step": these read as deciding, or use banned words ("results", "AI insights"). Replaced with "Talks you through your checks", "Goes through your readings", "Answers in plain words" and "Never decides for you". The words "explain" and "explains" cannot be used either: `lib/context/lexicon.ts` lists `explain\w*` as a cause word, and `ui-wording` fails on it.
5. **Reasons list and quick tip cards** (19): the reply is plain text (`{reply, products?, historyToken}`). No structured cards are drawn. "Likely reasons… a recent product" is also a causal claim.
6. **Timestamps, read ticks and the "Today" pill** (19): thread messages have no time. Left out. The compact header says "Check from <date>" instead, which is the check Echo is talking about.
7. **"View your skin profile"** (19) is "Open this check" (`/checks/<id>`, as the brief asks). It is a pill in the compact header on phones; desktop keeps it in the side panel.
8. **"+" attach button** (19): Echo does not analyse photos. Left out.
9. **Product carousel with images and "View details"** (19): the cards belong to lane C (`ProductCards.tsx`), shown as they are, with no price (TD-34). They still use `rounded-2xl` (20px), which is lane C's file.
10. **Input placement** (18): the mockup puts the input in the hero with chips under it. Here it stays at the bottom with the starters above it, the same as on 19. One textbox and one starter list per page (browser tests are strict). The page is one fixed-height chat column, so the input never scrolls away.
11. **Mockup 18 vs 19 switch**: per area thread. An area with no question yet opens on the introduction (hero, what Echo does, area chooser, readings fold, greeting, opening suggestion). After the first question, the compact Echo header and the area chips sit above the chat. Switching to an empty area shows the introduction again (TD-46: one thread per area).
12. **EchoBubble.tsx is not changed.** It is the question text of the check flow (`SkinCheckFlow`, `LaterQuestions`, pinned in `privacy-age-memory.test.ts`), not a chat bubble. The chat uses the kit's `ChatBubble`.
13. **EchoMark** is now the mockup's face mark (a soft circle with two eyes) in place of the "+". Its only other user is the dev kit page.
14. **Kit gaps** (kit-requests.md #1 and #2): `ChatBubble` corners are 20px, and `TypingIndicator` animates without regard to reduced motion. Meanwhile EchoPage wraps itself in `MotionConfig reducedMotion="user"`, uses an instant scroll under reduced motion, and overrides the typing bubble's corner by class.

## Hand-back

### Changelog

| File | Change |
|---|---|
| `components/skin-check/EchoPage.tsx` | 18 and 19 on the kit. Header: back link (K-1 target kept), centred wordmark, Account. **Empty area thread (18)**: "Meet / Echo ✦ / Talks you through your checks", the face mark, the intro line (not a medical opinion), three "what Echo does" tiles, area chooser (kit `Chip`, `aria-pressed`, one thread each, TD-46), then the readings fold, greeting, opening suggestion and cards. **After the first question (19)**: compact header (mark, "Echo", "Check from <date>", "Open this check" pill on phones), area chips above the chat. Chat on kit `ChatBubble` with the Echo mark avatar; `SuggestionChips` for starters; `ChatInput` (maxLength 2000, disabled while sending or at the daily limit). Referral note as a tinted `role="note"` with a stethoscope icon; consent and error alerts on `card`; Retry as a secondary pill. `role="log"` + `aria-live="polite"` kept on the message list (the scroller now wraps it and the introduction). `MotionConfig reducedMotion="user"`; instant scroll under reduced motion. No 20px corners left in the file. All logic (sends, retry, consent, opening, ?ask=, area threads, gates, history token) unchanged |
| `components/skin-check/EchoMark.tsx` | Face mark (soft circle, two eyes) replaces the "+"; same `className` API |
| `components/skin-check/echoCopy.ts` | `meet`, `tagline`, `does`, `doesLabel`, `areaHint` (all existing keys kept; lane C's `ProductCards` reads several) |
| `tests/echo-switch-and-limit.test.ts` | Pinned-source anchor `<form` → `<ChatInput` (the form is inside the kit now), plus `toContain("<ChatInput")` so the check is not weakened |
| `tests/design/redesign-echo.shots.ts` (new) | 375px shots into `docs/design/redesign/echo/` |
| `docs/lanes/kit-requests.md` | #1 ChatBubble 16px corners, #2 TypingIndicator reduced motion |

Not touched: `EchoBubble.tsx` (check-flow question text, Log 12), `ProductCards.tsx` (lane C), the chat API, `echo-session.ts`, `lib/**`.

### Deviations (why in the Log)

No recent conversations, today's insight, quick actions, timestamps or ticks, reasons list or quick tip, "+" attach, product images or carousel (Log 1–3, 5, 6, 8, 9). The mockup wording is replaced (Log 4). The input stays at the bottom on 18 (Log 10). "View your skin profile" becomes "Open this check" (Log 7). The bottom bar stays visible (Echo is not a focused flow). On a phone the compact header's date can truncate ("Check from 13 Oct …") beside the pill.

### Flags used

None (no backend-gated control).

### Browser-test edits

None. `tests/browser/*` is unchanged. The only test edit is the unit source pin above.

### Screenshots (375px), `docs/design/redesign/echo/`

`compare-18-echo-home.png` and `compare-19-echo-conversation.png` (mockup left, app right). Also `18-echo-home`, `18-echo-home-opening`, `19-echo-conversation`, `19-echo-conversation-end`, `19-echo-other-area`, `echo-red-flag`, `echo-consent`, `echo-no-reading`, and `echo-desktop-1280` (the side panel layout kept).

### Open questions

1. Is "Never decides for you" the right claim for the third tile? Or would "Not a medical opinion" be better? The intro line already says the second.
2. When an area's thread is empty, Echo shows the introduction again. Is that right, or should the introduction appear only on the first visit?

### Tests

- Baseline before changes: `npx tsc --noEmit && npx vitest run`: 2367 passed, 85 skipped (126 files).
- Final: `npx tsc --noEmit` clean. `npm run lint` shows no errors (warnings only, all in files this lane did not touch). `npx vitest run`: 2367 passed, 85 skipped.
- Touched unit tests (ui-wording, echo-switch-and-limit, dashboard-copy, five-readings, context-route, privacy-age-memory, echo-*, skin-check-chat*, brand-contrast): 405/405.
- Browser, one fresh stack: `PW_ARGS="tests/browser/echo-products.spec.ts tests/browser/flows.spec.ts tests/browser/dashboard.spec.ts tests/browser/home-v2.spec.ts" bash scripts/with-stack-slot.sh npm run test:browser`: 69 passed (14.6 min).
- Shots: `PW_ARGS="-c tests/design/playwright.config.ts tests/design/redesign-echo.shots.ts --project=390" bash scripts/with-stack-slot.sh npm run test:browser`: 5 passed.
- `tests/fake-gemini.e2e.test.ts` (a stack test) was not run separately. It covers the chat route, which this lane did not change.
