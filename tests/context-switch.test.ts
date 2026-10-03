import { afterEach, describe, expect, it, vi } from "vitest";
import { contextChatEnabled } from "@/lib/context/switch";

// Owner decision O-4: the context-package Echo path is local only.
afterEach(() => vi.unstubAllEnvs());

describe("context chat switch", () => {
  it.each([
    ["production", "on", false],
    ["production", undefined, false],
    ["development", "on", true],
    ["development", undefined, false],
    ["development", "true", false],
    ["test", undefined, false],
  ])("NODE_ENV=%s ECHO_CONTEXT_PATH=%s -> %s", (nodeEnv, flag, expected) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("ECHO_CONTEXT_PATH", flag ?? "");
    expect(contextChatEnabled()).toBe(expected);
  });
});
