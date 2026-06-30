/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Persistent-container deployment (Render). Standalone output keeps the
  // image small and keeps the Playwright PDF path (phase 6) off serverless.
  output: "standalone",
  // Playwright is a native server dep — keep it out of the bundle.
  serverExternalPackages: ["playwright", "playwright-core"],
  experimental: {
    serverActions: {
      // Competitor .xlsx intake can be a few MB; lift the default 1MB cap.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
