import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

async function main() {
  const port = Number(process.env.KEEL_DEMO_TEST_PORT || 3101);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid demo test port.");
  const directory = mkdtempSync(join(tmpdir(), "keel-http-demo-"));
  const origin = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    MOCK_MODE: "true",
    KEEL_PROJECT_ID: "lantern",
    KEEL_BASE_URL: origin,
    KEEL_DEMO_ORIGIN: origin,
    KEEL_STORE_PATH: join(directory, "store.json"),
    KEEL_MOCK_TIME_SCALE: "0",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  const server = spawn(process.execPath, [fileURLToPath(import.meta.resolve("next/dist/bin/next")), "start", "--hostname", "127.0.0.1", "--port", String(port)], { env, stdio: "ignore" });
  let startError;
  server.on("error", error => { startError = error; });
  try {
    const deadline = Date.now() + 30_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (startError) throw startError;
      if (server.exitCode !== null) throw new Error(`Demo server exited with ${server.exitCode}.`);
      try {
        const response = await fetch(`${origin}/api/auth/session`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) { ready = true; break; }
      } catch (error) {
        if (!(error instanceof TypeError) && error.name !== "TimeoutError") throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!ready) throw new Error("Built demo did not become ready in 30 seconds.");
    const runner = spawn(process.execPath, ["--import", "tsx", "scripts/demo-e2e.ts"], { env, stdio: "inherit" });
    const [code] = await once(runner, "exit");
    if (code !== 0) throw new Error(`Demo transaction exited with ${code}.`);
  } finally {
    if (server.pid && server.exitCode === null) {
      const exited = once(server, "exit");
      server.kill();
      await exited;
    }
    rmSync(directory, { recursive: true });
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
