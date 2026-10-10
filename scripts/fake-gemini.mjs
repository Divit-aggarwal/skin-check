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

// TD-34: with no scripted reply, a request that carries the own-product list
// gets a valid structured suggestion built from that request's own package
// (one product per step, each reason quoting what the user told us), so the
// browser tests can see real cards. Everything else gets the plain sentence.
function productReply(request) {
  const instruction = request?.systemInstruction?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!request?.generationConfig?.responseJsonSchema?.properties?.products) return null;
  const json = instruction.split("CONTEXT PACKAGE:\n")[1]?.split("\n\nYour previous answer")[0];
  let pkg;
  try {
    pkg = JSON.parse(json);
  } catch {
    return null;
  }
  const items = pkg?.recommendation?.items ?? [];
  const told = (pkg?.selfReported ?? []).find((s) => s.id === "self.all.skin_type") ?? pkg?.selfReported?.[0];
  if (items.length === 0 || !told) return null;
  return JSON.stringify({
    claims: [{ claim_type: "product", text: "Here is a simple routine from Project Skin's products.", fact_ids: [items[0].id] }],
    products: items.slice(0, 4).map((i) => ({ product_id: i.productId, reason: told.text, fact_ids: [told.id] })),
    needs_referral: false,
    distress: false,
  });
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
    const queued = nextReply();
    const text = queued === DEFAULT_REPLY ? (productReply(JSON.parse(body || "{}")) ?? DEFAULT_REPLY) : queued;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP", index: 0 }] }));
  });
}).listen(PORT, "127.0.0.1", () => console.log(`fake-gemini on 127.0.0.1:${PORT}`));
