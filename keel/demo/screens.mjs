// Captures README screenshots from the running stack (run after `npm run record`, which leaves
// the Project Lantern folder at run #5).
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.KEEL_URL || "http://localhost:3000";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto(BASE + "/", { waitUntil: "networkidle" });
const href = await p.getByTestId("folder-card").first().getAttribute("href");
const users = async (name) => {
  const sw = p.getByTestId("user-switcher");
  const v = await sw.evaluate((el, n) => [...el.options].find((o) => o.text.startsWith(n)).value, name);
  await sw.selectOption(v);
  await p.waitForLoadState("networkidle");
};
const shots = [
  [`${href}/runs/4`, "checks-regression"],
  [`${href}/runs/4/rules/R3`, "rule-detail"],
  [`${href}`, "checks-with-gdpr-pack"],
  [`${href}/history`, "run-history"],
  [`${href}/packs`, "rule-packs"],
  [`/box/folders/${href.split("/").pop()}`, "fake-box-folder"],
];
for (const [u, n] of shots) {
  await p.goto(BASE + u, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(HERE, "screenshots", `${n}.png`) });
}
await p.goto(BASE + "/box/tasks", { waitUntil: "networkidle" });
await users("J. Park");
await p.waitForTimeout(400);
await p.screenshot({ path: path.join(HERE, "screenshots", "fake-box-task.png") });
await users("Maya Chen");
await b.close();
