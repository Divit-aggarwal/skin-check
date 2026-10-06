import { beforeEach, describe, expect, it, vi } from "vitest";

// The local Gemini stand-in is reachable only outside production builds.
const { ctor } = vi.hoisted(() => ({ ctor: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: async () => ({ text: "ok" }) };
    constructor(opts: unknown) {
      ctor(opts);
    }
  },
}));

beforeEach(() => {
  vi.resetModules();
  ctor.mockClear();
  vi.unstubAllEnvs();
  vi.stubEnv("GEMINI_API_KEY", "k");
  vi.stubEnv("GEMINI_DEV_API_KEY", "k");
  vi.stubEnv("GEMINI_LOCAL_BASE_URL", "http://127.0.0.1:3109");
});

async function clientOptions(nodeEnv: string) {
  vi.stubEnv("NODE_ENV", nodeEnv);
  const { generateContextAnswer } = await import("@/lib/gemini");
  await generateContextAnswer("x", [{ role: "user", text: "hi" }], {});
  return ctor.mock.calls[0]![0] as { httpOptions?: { baseUrl?: string } };
}

describe("GEMINI_LOCAL_BASE_URL", () => {
  it("is used outside production", async () => {
    expect((await clientOptions("development")).httpOptions?.baseUrl).toBe("http://127.0.0.1:3109");
  });
  it("is ignored in a production build", async () => {
    expect((await clientOptions("production")).httpOptions).toBeUndefined();
  });
});
