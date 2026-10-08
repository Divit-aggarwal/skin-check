// Client-safe Echo limit settings (no server imports): lib/echo-quota.ts
// enforces them on the server, components/skin-check/echoCopy.ts states them.

/** Questions one user may send Echo per day. Named setting, PROVISIONAL (owner decision TD-29 (5), 2026-10-09). */
export const ECHO_DAILY_QUESTIONS_PER_USER = 20;

/** What a user sees once they reach the limit (the chat route's ECHO_DAILY_LIMIT). */
export const ECHO_DAILY_LIMIT_COPY = `You have asked Echo ${ECHO_DAILY_QUESTIONS_PER_USER} questions today. You can ask more tomorrow.`;
