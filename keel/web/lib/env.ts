import fs from "node:fs";
import path from "node:path";

// The web app and the Python runner share keel/.env. Next.js only reads .env files
// from its own directory, so load the shared file here (existing env vars win).
let loaded = false;

export const KEEL_ROOT = path.resolve(/* turbopackIgnore: true */ process.cwd(), "..");

function load() {
  if (loaded) return;
  loaded = true;
  for (const name of [".env", ".env.example"]) {
    const file = path.join(/* turbopackIgnore: true */ KEEL_ROOT, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      if (process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  }
}

export function env(name: string, fallback = ""): string {
  load();
  return process.env[name] ?? fallback;
}

export function dataDir(): string {
  const dir = path.resolve(/* turbopackIgnore: true */ KEEL_ROOT, env("KEEL_DATA_DIR", ".data"));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
