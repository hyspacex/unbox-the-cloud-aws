// Captures README screenshots: reseeds the folder, then shows all-clear, drift and certification states.
//   cd keel && ./dev.sh --prod &   then   cd keel/demo && npm run screens
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const BASE = process.env.KEEL_URL || "http://localhost:3000";
const OUT = path.join(HERE, "screenshots");

execSync("python3 -m keel_runner.seed --connect", { cwd: path.join(ROOT, "runner"), stdio: "inherit" });
const users = Object.fromEntries((await (await fetch(`${BASE}/api/users`)).json()).map((u) => [u.name, u.id]));
const folder = (await (await fetch(`${BASE}/api/folders`)).json())[0].folder_id;
const F = `/folders/${folder}`;
const upload = (who, file) => execSync(`PYTHONPATH=. python3 - <<'EOF'
from keel_runner.boxclient import BoxClient
b = BoxClient().acting_as("${users[who]}")
items = {i["name"]: i for i in b.folder_items("${folder}")}
data = open("${path.join(ROOT, "content", "lantern", file)}", "rb").read()
name = "${path.basename(file)}"
b.upload_version(items[name]["id"], name, data) if name in items else b.upload("${folder}", name, data)
EOF`, { cwd: path.join(ROOT, "runner") });

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: "keel_user", value: users["Maya Chen"], url: BASE }]);
const p = await ctx.newPage();
const shot = async (url, name, wait) => {
  await p.goto(BASE + url, { waitUntil: "networkidle" });
  if (wait) await p.locator(wait).waitFor({ timeout: 30000 });
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, `${name}.png`) });
};

await shot(F, "overview-all-clear");
await shot(`${F}/decisions`, "decisions");
upload("J. Park", "drift/architecture.md");
await shot(F, "overview-proposed-change", "[data-testid=overview-status][data-tone=blue]");
await shot(`${F}/decisions/p99_latency`, "decision-proposed");
await fetch(`http://127.0.0.1:8787/api/folders/${folder}/decisions/p99_latency`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "adopt", actor_id: users["Maya Chen"] }),
});
await p.goto(BASE + F, { waitUntil: "networkidle" });
await p.locator("[data-testid=overview-status][data-tone=ok]").waitFor({ timeout: 30000 });
await shot(`${F}/decisions/p99_latency`, "decision-adopted");
await shot("/box/tasks", "box-task");
await shot(`/box/folders/${folder}`, "box-folder");
await shot(`${F}/packs`, "certifications");
await shot(`${F}/activity`, "activity");
await b.close();
