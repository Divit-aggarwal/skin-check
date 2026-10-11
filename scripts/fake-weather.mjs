// Local stack only (scripts/local-stack.sh): a stand-in for Open-Meteo and for
// a web push service (TD-47), so no request leaves the machine.
// lib/home/open-meteo.ts points at it through WEATHER_LOCAL_BASE_URL, and
// lib/home/push.ts accepts its /push/ addresses through
// PUSH_LOCAL_ENDPOINT_PREFIX; production builds ignore both.
//
// Every request is appended to .local-stack/fake-weather/requests.jsonl
// (method and URL; push requests also the Authorization header's scheme).
// While .local-stack/fake-weather/down exists, the weather answers 503.
// POST /push/gone answers 410 (a subscription the service no longer has).
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";

const DIR = ".local-stack/fake-weather";
const PORT = Number(process.env.FAKE_WEATHER_PORT ?? 3110);
mkdirSync(DIR, { recursive: true });

createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  appendFileSync(`${DIR}/requests.jsonl`, JSON.stringify({ method: req.method, url: req.url, auth: (req.headers.authorization ?? "").split(" ")[0] }) + "\n");
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };
  if (url.pathname.startsWith("/push/")) return send(url.pathname === "/push/gone" ? 410 : 201);
  if (existsSync(`${DIR}/down`)) return send(503, { error: true });
  if (url.pathname === "/v1/forecast")
    return send(200, { utc_offset_seconds: 19800, current: { time: "2026-10-11T09:30", relative_humidity_2m: 68 }, daily: { uv_index_max: [7.4] } });
  if (url.pathname === "/v1/air-quality") return send(200, { current: { time: "2026-10-11T09:00", us_aqi: 85 } });
  send(404, { error: true });
}).listen(PORT, "127.0.0.1", () => console.log(`fake weather on ${PORT}`));
