// Owner decision O-4 (docs/lanes/context-design.md §3.1): the context-package
// Echo path is on for local development only. `next build` / `next start` run
// with NODE_ENV=production, so it is off in every production build whatever
// ECHO_CONTEXT_PATH says. Off, the chat route runs today's Echo unchanged.
// Fails closed (red team I02, area C): on only when NODE_ENV is exactly
// "development" or "test", as the rules switch does; unset, "staging" or a
// mistyped "Production" is off.
export function contextChatEnabled(): boolean {
  return (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") && process.env.ECHO_CONTEXT_PATH === "on";
}
