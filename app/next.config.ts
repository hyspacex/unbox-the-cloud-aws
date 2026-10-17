import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
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
