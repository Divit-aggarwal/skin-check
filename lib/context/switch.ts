// Owner decision F12 (TD-20, 2026-10-05): the context-package path is the
// chat that ships. It is on in every build. Today's Echo stays in the code
// behind this switch: it runs only when ECHO_CONTEXT_PATH is exactly "off"
// AND NODE_ENV is exactly "development" or "test". A production build never
// runs it, whatever ECHO_CONTEXT_PATH says, so a typo in a production setting
// cannot fall back to the weaker path; going back to it in production is a
// code change and a redeploy.
export function contextChatEnabled(): boolean {
  const devOrTest = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  return !(devOrTest && process.env.ECHO_CONTEXT_PATH === "off");
}

/**
 * Owner decision TD-29 (5), 2026-10-09: a production setting that turns Echo
 * off quickly. Echo is on unless ECHO_SWITCH is exactly "off" (unset, empty
 * or anything else is on). Off stops Echo: the chat route refuses every
 * question with ECHO_OFF before any Gemini call (a red-flag message still gets
 * the referral first), and /echo shows ECHO_OFF_COPY instead of the input. It
 * never falls back to the older Echo (contextChatEnabled above is separate).
 * A Vercel setting takes effect on the next deployment: flip it, then
 * redeploy production (docs/OWNER_QUEUE.md).
 */
export function echoOn(): boolean {
  return process.env.ECHO_SWITCH !== "off";
}

export const ECHO_OFF_COPY = "Echo is turned off for now. Please try again later.";
