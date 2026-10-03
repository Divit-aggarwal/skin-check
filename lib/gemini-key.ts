// One place that decides which Gemini key the server uses (tracker B01).
// `next dev` (NODE_ENV=development) reads GEMINI_DEV_API_KEY only, so the
// production key in .env.local is never used locally; everything else
// (production, tests) reads GEMINI_API_KEY.
export function geminiApiKey(): string | undefined {
  return (process.env.NODE_ENV === "development" ? process.env.GEMINI_DEV_API_KEY : process.env.GEMINI_API_KEY) || undefined;
}
