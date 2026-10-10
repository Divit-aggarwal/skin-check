const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");
const { assertDevEnvSafe } = require("./lib/dev-env-guard.cjs");
const fs = require("node:fs");
const path = require("node:path");

// TD-37 (2), (5): the face mesh library's wasm is served from our own site,
// at /mediapipe/<version>/wasm, copied from the pinned package on every dev
// start and build (docs/design/face-mesh.md). The version in the path is the
// installed one, so a version change can never serve stale files.
function copyMediapipeWasm() {
  const pkg = path.join(__dirname, "node_modules/@mediapipe/tasks-vision");
  const { version } = require(path.join(pkg, "package.json"));
  const to = path.join(__dirname, "public/mediapipe", version, "wasm");
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(path.join(pkg, "wasm"))) {
    if (!/^vision_wasm(_nosimd)?_internal\.(js|wasm)$/.test(f)) continue;
    fs.copyFileSync(path.join(pkg, "wasm", f), path.join(to, f));
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [],
  },

  compress: true,

  // TD-29 (5): the Echo off switch, built into both the server and the
  // browser code, so /echo, the chat route and every "Ask Echo" button read
  // the same value. Not a secret ("off" or unset). Like any Vercel setting it
  // takes effect with the next deployment (docs/OWNER_QUEUE.md).
  // TD-34: ECHO_PRODUCTS_SWITCH the same way: "off" hides product suggestions
  // and every product card, while Echo itself stays on.
  env: { ECHO_SWITCH: process.env.ECHO_SWITCH ?? "", ECHO_PRODUCTS_SWITCH: process.env.ECHO_PRODUCTS_SWITCH ?? "" },

  // "/" is app/(marketing)/page.tsx (G03, TD-24 (3)): Home when signed in,
  // the check flow when not. It replaced a fixed redirect to /skin-check.

  logging: {
    fetches: {
      fullUrl: process.env.NEXT_PUBLIC_APP_ENV === "development",
    },
  },

  // Baseline security headers. No Content-Security-Policy here on purpose —
  // a real one needs a nonce/hash architecture (Next.js inline scripts,
  // Google Fonts, the Gemini/skin-scan proxy calls are same-origin so CSP
  // doesn't touch them, but next/font and any future third-party embed
  // would) that's disproportionate to this app's current size; see
  // DEPLOYMENT.md for the tradeoff instead of a policy that's either so
  // loose it does nothing or so strict it silently breaks a render.
  async headers() {
    return [
      {
        // TD-37: the mesh files never change under their name (version or hash in the path).
        source: "/mediapipe/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // camera=(self) is required — PhotoCapture.tsx's desktop path uses
          // getUserMedia; the default-deny Permissions-Policy baseline would
          // silently break the app's own capture step.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          // No `preload` — that's a separate, effectively-irreversible
          // browser-preload-list submission, not something to opt into as
          // part of a header default.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

// `next dev` refuses to start when any variable points at production
// (tracker B01). Builds and `next start` are unaffected.
module.exports = (phase) => {
  if (phase === PHASE_DEVELOPMENT_SERVER) assertDevEnvSafe(process.env);
  copyMediapipeWasm();
  return nextConfig;
};
