// Owner decision O-4 (docs/lanes/context-design.md §3.1): the context-package
// Echo path is on for local development only. `next build` / `next start` run
// with NODE_ENV=production, so it is off in every production build whatever
// ECHO_CONTEXT_PATH says. Off, the chat route runs today's Echo unchanged.
export function contextChatEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.ECHO_CONTEXT_PATH === "on";
}
