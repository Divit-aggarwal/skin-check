const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");
const { assertDevEnvSafe } = require("./lib/dev-env-guard.cjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [],
  },

  compress: true,

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
  return nextConfig;
};
