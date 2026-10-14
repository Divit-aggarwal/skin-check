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

## Hand-back
