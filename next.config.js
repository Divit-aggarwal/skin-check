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
};

module.exports = nextConfig;
