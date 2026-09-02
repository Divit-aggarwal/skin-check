/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict React mode — catches side effects early
  reactStrictMode: true,

  // Images — add domains as you add external image sources
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [],
  },

  // Enables compression
  compress: true,

  // Standalone output for potential future containerization
  // output: "standalone",

  // Log only errors in production
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

module.exports = nextConfig;
