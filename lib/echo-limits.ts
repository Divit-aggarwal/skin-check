// Client-safe Echo settings (no server imports): the per-user limit, which lib/echo-quota.ts
// enforces on the server, and the off switch (TD-29 (5)).

/** Questions one user may send Echo per day. Named setting, PROVISIONAL (owner decision TD-29 (5), 2026-10-09). */
export const ECHO_DAILY_QUESTIONS_PER_USER = 20;

/** What a user sees once they reach the limit (the chat route's ECHO_DAILY_LIMIT). */
export const ECHO_DAILY_LIMIT_COPY = `You have asked Echo ${ECHO_DAILY_QUESTIONS_PER_USER} questions today. You can ask more tomorrow.`;

/**
 * Owner decision TD-29 (5), 2026-10-09: a production setting that turns Echo
 * off quickly. Echo is on unless ECHO_SWITCH is exactly "off" (unset, empty
 * or anything else is on). Off stops Echo: the chat route refuses every
 * question with ECHO_OFF before any Gemini call (a red-flag message still gets
 * the referral first), and /echo shows ECHO_OFF_COPY instead of the input. It
 * never falls back to the older Echo (contextChatEnabled in
 * lib/context/switch.ts is separate). Every "Ask Echo" button hides too.
 * next.config.js builds the value into the browser code as well.
 * A Vercel setting takes effect on the next deployment: flip it, then
 * redeploy production (docs/OWNER_QUEUE.md).
 */
export function echoOn(): boolean {
  return process.env.ECHO_SWITCH !== "off";
}

export const ECHO_OFF_COPY = "Echo is paused for now. Your checks and readings are still on your dashboard.";

/**
 * TD-34: product suggestions are on unless ECHO_PRODUCTS_SWITCH is exactly
 * "off". Here (client-safe) so Home's starter questions can read it without
 * importing the chat layer (TD-47); lib/context/products.ts re-exports it.
 */
export function echoProductsOn(): boolean {
  return process.env.ECHO_PRODUCTS_SWITCH !== "off";
}
