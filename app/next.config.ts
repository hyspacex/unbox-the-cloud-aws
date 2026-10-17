import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Parallel dev servers in one checkout: NEXT_DIST_DIR=.next-b PORT=3001 npm run dev
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  devIndicators: false,
  // Live adapters (lib/live-adapters.ts) load these at runtime; Strands is ESM-only.
  serverExternalPackages: ["box-typescript-sdk-gen", "@strands-agents/sdk"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
