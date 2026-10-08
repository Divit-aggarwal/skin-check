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

// TD-29 (5): the Echo off switch lives in lib/echo-limits.ts (client-safe,
// so pages outside the chat layer can read it too).
export { ECHO_OFF_COPY, echoOn } from "@/lib/echo-limits";
