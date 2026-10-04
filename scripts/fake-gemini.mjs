// Local stack only (scripts/local-stack.sh): a stand-in for the Gemini API so
// tests and the red team can see exactly what the app sends, with no key and
// no request leaving the machine. lib/gemini.ts points at it through
// GEMINI_LOCAL_BASE_URL, which production builds ignore.
//
// Every generateContent request body is appended to
// .local-stack/fake-gemini/requests.jsonl. The reply text is the next entry of
// .local-stack/fake-gemini/replies.json (a JSON array of strings, consumed in
// order) or, when that is empty, a fixed plain sentence.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

const DIR = ".local-stack/fake-gemini";
const PORT = Number(process.env.FAKE_GEMINI_PORT ?? 3109);
const DEFAULT_REPLY = "This is the local stand-in for Gemini.";
mkdirSync(DIR, { recursive: true });

function nextReply() {
  const file = `${DIR}/replies.json`;
  if (!existsSync(file)) return DEFAULT_REPLY;
  const queue = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(queue) || queue.length === 0) return DEFAULT_REPLY;
  const [first, ...rest] = queue;
  writeFileSync(file, JSON.stringify(rest));
  return String(first);
}

createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.method !== "POST" || !/:generateContent$/.test(req.url ?? "")) {
      res.writeHead(404).end();
      return;
    }
    appendFileSync(`${DIR}/requests.jsonl`, JSON.stringify({ at: new Date().toISOString(), path: req.url, body: JSON.parse(body || "{}") }) + "\n");
    const text = nextReply();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP", index: 0 }] }));
  });
}).listen(PORT, "127.0.0.1", () => console.log(`fake-gemini on 127.0.0.1:${PORT}`));
