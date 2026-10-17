import { defineConfig } from "vitest/config";
import path from "node:path";
import os from "node:os";

const root = import.meta.dirname;

export default defineConfig({
  resolve: { alias: { "@": path.resolve(root, "src") } },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    env: { MOCK_MODE: "true", KEEL_MOCK_TIME_SCALE: "0", KEEL_STORE_PATH: path.join(os.tmpdir(), `keel-store-test-${process.pid}.json`) },
    testTimeout: 20000,
  },
});
