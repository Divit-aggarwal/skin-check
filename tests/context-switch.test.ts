import { afterEach, describe, expect, it, vi } from "vitest";
import { contextChatEnabled } from "@/lib/context/switch";

// Owner decision F12 (TD-20): the context path ships in every build. Today's
// Echo runs only with ECHO_CONTEXT_PATH=off in development or test.
afterEach(() => vi.unstubAllEnvs());

describe("context chat switch", () => {
  it.each([
    ["production", "off", true],
    ["production", undefined, true],
    ["production", "on", true],
    ["development", "off", false],
    ["development", undefined, true],
    ["development", "on", true],
    ["development", "OFF", true],
    ["test", "off", false],
    ["test", undefined, true],
    // Fails toward the context path: anything but development or test ignores "off".
    ["", "off", true],
    ["staging", "off", true],
    ["Development", "off", true],
    [" test", "off", true],
  ])("NODE_ENV=%s ECHO_CONTEXT_PATH=%s -> context path %s", (nodeEnv, flag, expected) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("ECHO_CONTEXT_PATH", flag ?? "");
    expect(contextChatEnabled()).toBe(expected);
  });
});
