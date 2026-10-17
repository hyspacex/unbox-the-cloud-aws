// One store file per vitest worker: test files run in parallel and service tests persist to disk.
import os from "node:os";
import path from "node:path";
process.env.KEEL_STORE_PATH = path.join(os.tmpdir(), `keel-store-test-${process.pid}-${process.env.VITEST_POOL_ID ?? "0"}-${process.env.VITEST_WORKER_ID ?? "0"}.json`);
