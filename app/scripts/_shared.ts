/**
 * Shared helpers for the integration scripts. Run scripts from app/: `npx tsx scripts/<name>.ts`.
 * Loads app/.env.local (then app/.env) when present, never anything outside the repo.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { BoxMap } from "../src/lib/box/real";

export const APP_DIR = resolve(__dirname, "..");
export const LANTERN = resolve(APP_DIR, "..", "demo-data", "lantern");
export const BOX_MAP_PATH = join(APP_DIR, "data", "box-map.json");

export function loadEnv(): string[] {
  const loaded: string[] = [];
  for (const f of [".env.local", ".env"]) {
    const p = join(APP_DIR, f);
    if (existsSync(p)) {
      process.loadEnvFile(p); // Node >= 21.7; does not override variables already set
      loaded.push(`app/${f}`);
    }
  }
  return loaded;
}

export const has = (k: string) => !!(process.env[k] && process.env[k]!.trim());
export const flag = (name: string) => process.argv.includes(`--${name}`);

export function fixtureText(file: string): string {
  return readFileSync(join(LANTERN, file), "utf8");
}

export function readBoxMap(): BoxMap | null {
  return existsSync(BOX_MAP_PATH) ? (JSON.parse(readFileSync(BOX_MAP_PATH, "utf8")) as BoxMap) : null;
}

export function writeBoxMap(map: BoxMap): void {
  mkdirSync(dirname(BOX_MAP_PATH), { recursive: true });
  writeFileSync(BOX_MAP_PATH, JSON.stringify(map, null, 2) + "\n");
}

// ---- checklist output ------------------------------------------------------

export type Status = "PASS" | "FAIL" | "SKIP" | "INFO";
export interface Check {
  name: string;
  status: Status;
  reason: string;
}

const COLOR: Record<Status, string> = { PASS: "\x1b[32m", FAIL: "\x1b[31m", SKIP: "\x1b[33m", INFO: "\x1b[36m" };
const tty = process.stdout.isTTY;

export class Checklist {
  readonly checks: Check[] = [];
  add(name: string, status: Status, reason: string): Check {
    const c = { name, status, reason };
    this.checks.push(c);
    const tag = tty ? `${COLOR[status]}${status}\x1b[0m` : status;
    console.log(`${tag.padEnd(tty ? 13 : 4)}  ${name}: ${reason}`);
    return c;
  }
  pass = (n: string, r: string) => this.add(n, "PASS", r);
  fail = (n: string, r: string) => this.add(n, "FAIL", r);
  skip = (n: string, r: string) => this.add(n, "SKIP", r);
  info = (n: string, r: string) => this.add(n, "INFO", r);
  /** Run fn; any thrown error becomes FAIL with its message. */
  async run(name: string, fn: () => Promise<{ status: Status; reason: string }>): Promise<Check> {
    const t = Date.now();
    try {
      const { status, reason } = await fn();
      return this.add(name, status, `${reason} (${Date.now() - t} ms)`);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      return this.fail(name, `${code ? code + ": " : ""}${e instanceof Error ? e.message : String(e)}`);
    }
  }
  summary(): number {
    const n = (s: Status) => this.checks.filter((c) => c.status === s).length;
    console.log(`\n${n("PASS")} PASS, ${n("FAIL")} FAIL, ${n("SKIP")} SKIP`);
    return n("FAIL") ? 1 : 0;
  }
}
