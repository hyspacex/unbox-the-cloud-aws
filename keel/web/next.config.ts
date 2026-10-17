import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page reads live local state (SQLite), so render on request rather than caching.
  cacheComponents: false,
  devIndicators: false,
  serverExternalPackages: ["better-sqlite3"],
  async rewrites() {
    // The runner's application API (API Gateway + Lambda in production).
    const runner = `http://127.0.0.1:${process.env.KEEL_RUNNER_PORT || "8787"}`;
    return [{ source: "/api/keel/:path*", destination: `${runner}/api/:path*` }];
  },
};

export default nextConfig;
