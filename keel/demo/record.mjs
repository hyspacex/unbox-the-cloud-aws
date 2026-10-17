// Records the Keel walkthrough as one continuous video, then (if ffmpeg is installed) cuts it into
// chapter clips and converts everything to MP4.
//
//   cd keel && ./dev.sh --prod &        # stack must be running
//   cd keel/demo && npm install && npx playwright install chromium && npm run record
import { chromium } from "playwright";
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const CONTENT = path.join(ROOT, "content", "lantern");
const OUT = path.join(HERE, "videos");
const BASE = process.env.KEEL_URL || "http://localhost:3000";
const W = 1440, H = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function reseed() {
  execSync("python3 -m keel_runner.seed", { cwd: path.join(ROOT, "runner"), stdio: "inherit" });
}

// Injected into every page: a visible cursor and a caption bar that survive navigations.
const overlay = () => {
  const ensure = () => {
    if (!document.body) return;
    let c = document.getElementById("__cursor");
    if (!c) {
      c = document.createElement("div");
      c.id = "__cursor";
      Object.assign(c.style, {
        position: "fixed", zIndex: 2147483647, width: "22px", height: "22px", borderRadius: "50%",
        border: "2px solid #0a0a0a", background: "rgba(255,255,255,.55)", pointerEvents: "none",
        transform: "translate(-50%,-50%)", transition: "transform .08s ease, width .15s, height .15s",
        left: (window.__cx ?? -50) + "px", top: (window.__cy ?? -50) + "px", boxShadow: "0 2px 8px rgba(0,0,0,.18)",
      });
      document.documentElement.appendChild(c);
    }
    const text = sessionStorage.getItem("__caption");
    let cap = document.getElementById("__caption");
    if (text && !cap) {
      cap = document.createElement("div");
      cap.id = "__caption";
      cap.className = "caption";
      document.documentElement.appendChild(cap);
    }
    if (cap) {
      if (!text) cap.remove();
      else if (cap.innerHTML !== text) cap.innerHTML = text;
    }
  };
  window.addEventListener("mousemove", (e) => {
    window.__cx = e.clientX; window.__cy = e.clientY;
    const c = document.getElementById("__cursor");
    if (c) { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }
  }, true);
  window.addEventListener("mousedown", () => { const c = document.getElementById("__cursor"); if (c) c.style.transform = "translate(-50%,-50%) scale(.7)"; }, true);
  window.addEventListener("mouseup", () => { const c = document.getElementById("__cursor"); if (c) c.style.transform = "translate(-50%,-50%)"; }, true);
  setInterval(ensure, 120);
  document.addEventListener("DOMContentLoaded", ensure);
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  reseed();

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: 1,
    recordVideo: { dir: path.join(HERE, ".raw"), size: { width: W, height: H } },
  });
  await context.addInitScript(overlay);
  const page = await context.newPage();
  const t0 = Date.now();
  const chapters = [];
  const chapter = (name, title) => chapters.push({ name, title, at: (Date.now() - t0) / 1000 });

  const caption = async (html, hold = 0) => {
    await page.evaluate((t) => { if (t) sessionStorage.setItem("__caption", t); else sessionStorage.removeItem("__caption"); }, html);
    await sleep(250 + hold);
  };
  // Navigate with the caption for the destination already set, so captions never lag a page.
  const go = async (url, text = null, hold = 0) => {
    await page.evaluate((t) => { try { if (t) sessionStorage.setItem("__caption", t); else sessionStorage.removeItem("__caption"); } catch {} }, text).catch(() => {});
    await page.goto(BASE + url, { waitUntil: "networkidle" });
    await sleep(500 + hold);
  };
  const card = async (html, hold) => {
    await page.evaluate((html) => {
      sessionStorage.removeItem("__caption");
      const el = document.createElement("div");
      el.id = "__card";
      Object.assign(el.style, { position: "fixed", inset: "0", zIndex: 2147483646, background: "#fff", display: "grid", placeItems: "center", textAlign: "center", fontFamily: "var(--sans)" });
      el.innerHTML = html;
      document.documentElement.appendChild(el);
    }, html);
    await sleep(hold);
    await page.evaluate(() => document.getElementById("__card")?.remove());
  };
  const glide = async (locator) => {
    const box = await locator.boundingBox();
    if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
    await sleep(180);
  };
  const click = async (locator) => { await locator.scrollIntoViewIfNeeded(); await glide(locator); await locator.click(); };
  const scrollTo = async (y) => { await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), y); await sleep(900); };
  const actAs = async (name) => {
    const sw = page.getByTestId("user-switcher");
    await glide(sw);
    const value = await sw.evaluate((el, name) => [...el.options].find((o) => o.text.startsWith(name)).value, name);
    await sw.selectOption(value);
    await page.waitForLoadState("networkidle");
    await sleep(700);
  };
  const upload = async (file) => {
    const chooser = page.waitForEvent("filechooser");
    await click(page.getByTestId("box-upload"));
    await (await chooser).setFiles(file);
    await sleep(900);
  };
  const waitHero = async (failing, timeout = 30000) => {
    await page.locator(`[data-testid=status-hero][data-failing="${failing}"]`).waitFor({ timeout });
    await page.waitForFunction(() => !document.querySelector("[data-testid=run-banner]"), null, { timeout });
    await sleep(600);
  };
  const folderId = () => page.evaluate(() => location.pathname.split("/")[3]);

  // ---------------------------------------------------------------- 1. connect + first run
  chapter("01-connect-first-run", "Connect a Box folder and run the checks");
  await go("/box");
  await card(`<div><div style="font-weight:700;letter-spacing:.32em;font-size:15px;color:#0a0a0a">KEEL</div>
    <div style="font-size:64px;font-weight:650;letter-spacing:-.045em;margin-top:18px;color:#0a0a0a">Every upload, checked.</div>
    <div style="font-size:22px;color:#6e6e73;margin-top:16px;letter-spacing:-.015em">CI-style checks for Box folders — rerun on every change, with citations.</div></div>`, 3200);
  await caption("<b>Project Lantern</b> lives in Box: a proposal, an architecture doc, a security checklist, a meeting transcript.", 1400);
  await click(page.getByTestId("box-folder").first());
  await page.waitForURL("**/box/folders/*");
  const fid = await folderId();
  await sleep(1200);
  await caption("<b>keel-rules.md</b> holds the folder’s checks — plain-language rules, like a CI workflow file.", 900);
  await click(page.getByTestId("box-file-keel-rules.md").getByRole("link").first());
  await sleep(1200);
  await page.mouse.wheel(0, 520);
  await sleep(2200);
  await go("/", "In Keel, Maya connects the folder. Keel registers a Box webhook and runs every rule.", 900);
  await click(page.getByTestId("connect-folder").first());
  await page.waitForURL(`**/folders/${fid}`);
  await caption("Run #1 reads the exact version of every file and judges each rule, with citations.");
  await waitHero(2);
  await caption("<b>6 of 8 passing.</b> Two rules fail: an open checklist item, and no retention period anywhere.", 2400);
  await click(page.getByTestId("rule-R6"));
  await caption("Each check explains itself: what is missing, and where Keel looked.", 2400);
  await go("/box/tasks", "Failures nobody “broke” go to the folder owner as a Box task.", 2600);

  // ---------------------------------------------------------------- 2. fixes rerun the checks
  chapter("02-uploads-rerun-checks", "Every upload reruns the checks");
  await go(`/box/folders/${fid}`, "J. Park adds <b>data-retention.md</b> in Box…");
  await actAs("J. Park");
  await upload(path.join(CONTENT, "2-fix", "data-retention.md"));
  await go(`/folders/${fid}`, "…Box’s webhook fires and Keel reruns every rule. Nobody pressed a button.");
  await waitHero(1);
  await caption("<b>7 of 8.</b> Data retention now passes — credited to J. Park’s upload.", 2400);
  await go(`/box/folders/${fid}`, "Dana closes the open checklist item by editing the file in Box. Saving makes a new version.");
  await actAs("Dana Okafor");
  await click(page.getByTestId("box-file-security-checklist.md").getByRole("link", { name: "Edit" }));
  const editor = page.getByTestId("box-editor");
  await editor.waitFor();
  await glide(editor);
  const value = await editor.inputValue();
  const box = value.indexOf("[ ] Data retention");
  await editor.evaluate((el, i) => { el.focus(); el.setSelectionRange(i + 1, i + 2); el.scrollTop = 0; }, box);
  await page.keyboard.type("x", { delay: 120 });
  const v2 = await editor.inputValue();
  const tbd = v2.indexOf("TBD", box);
  await editor.evaluate((el, i) => el.setSelectionRange(i, i + 3), tbd);
  await page.keyboard.type("data-retention.md (approved 2026-10-15)", { delay: 35 });
  await sleep(600);
  await click(page.getByTestId("box-save"));
  await page.waitForURL(`**/box/folders/${fid}`);
  await sleep(500);
  await go(`/folders/${fid}`, "Keel reruns on Dana’s new version…");
  await waitHero(0);
  await caption("<b>All 8 checks passing.</b>", 2000);
  await go(`/box/folders/${fid}`, "Back in Box, the folder’s metadata reads <b>Passing · 8 of 8</b>.");
  await glide(page.getByTestId("box-metadata"));
  await sleep(2400);

  // ---------------------------------------------------------------- 3. a regression
  chapter("03-regression-blame-notify", "A rewrite breaks two checks — Keel says who and why");
  await caption("A week later J. Park rewrites <b>architecture.md</b> “for clarity” and uploads v2.", 300);
  await actAs("J. Park");
  await upload(path.join(CONTENT, "3-regression", "architecture.md"));
  await go(`/folders/${fid}`, "Keel reruns on the new version…");
  await waitHero(2);
  await caption("<b>2 checks broke in this run.</b> Both trace back to J. Park’s upload of architecture.md v2.", 2600);
  await click(page.getByTestId("rule-R3"));
  await caption("architecture.md now says 200 ms. The proposal and the kickoff transcript say 50 ms — quoted, with versions.", 1400);
  await scrollTo(520);
  await sleep(2600);
  await scrollTo(0);
  await go(`/folders/${fid}`);
  await click(page.getByTestId("rule-R2"));
  await caption("Encryption at rest is still stated. The customer-managed keys and the rotation period are gone.", 2800);
  await go("/box/tasks", "J. Park gets one Box task listing both failures, with the quotes and a link back.", 3000);

  // ---------------------------------------------------------------- 4. rule packs
  chapter("04-rule-packs", "Install a standard as checks");
  await actAs("Maya Chen");
  await go(`/folders/${fid}/packs`, "Teams install standards as <b>rule packs</b> — pinned by version, like a CI action.", 1600);
  await click(page.getByTestId("install-gdpr-design-review"));
  await page.waitForURL(`**/folders/${fid}`);
  await caption("Installing adds <b>uses: gdpr-design-review@1.0.0</b> to keel-rules.md in Box, which triggers a run.");
  await page.waitForFunction(() => document.querySelectorAll("[data-testid^='rule-gdpr-design-review']").length === 5, null, { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector("[data-testid=run-banner]"), null, { timeout: 30000 });
  await sleep(600);
  await caption("Five GDPR checks join the folder’s own rules. Two fail: no DPIA, and no process for access requests.", 2600);
  await click(page.getByTestId("rule-gdpr-design-review/G3"));
  await caption("Deletion requests are covered in data-retention.md. Access requests are not mentioned anywhere.", 3000);

  // ---------------------------------------------------------------- 5. history
  chapter("05-run-history", "Run history: who changed what, and what it did");
  await go(`/folders/${fid}/history`, "Run history: every upload, what it broke or fixed, and when the rules changed.", 3400);
  await card(`<div><div style="font-weight:700;letter-spacing:.32em;font-size:15px;color:#0a0a0a">KEEL</div>
    <div style="font-size:44px;font-weight:650;letter-spacing:-.04em;margin-top:18px;color:#0a0a0a;max-width:980px">Rules in the folder. A run on every upload.<br/>The person who broke it hears first.</div>
    <div style="font-size:17px;color:#6e6e73;margin-top:22px">Local build: Fake Box + SQLite stand-ins for Box, Lambda, SQS FIFO and DynamoDB · offline judge (Bedrock-ready)</div></div>`, 3600);

  const video = page.video();
  await context.close();
  await browser.close();
  const raw = await video.path();
  const full = path.join(OUT, "keel-walkthrough.webm");
  fs.copyFileSync(raw, full);
  fs.rmSync(path.join(HERE, ".raw"), { recursive: true, force: true });
  const total = (Date.now() - t0) / 1000;
  fs.writeFileSync(path.join(OUT, "chapters.json"), JSON.stringify({ total, chapters }, null, 2));
  console.log(`recorded ${total.toFixed(1)} s → ${full}`);

  let ffmpeg = true;
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); } catch { ffmpeg = false; }
  if (!ffmpeg) { console.log("ffmpeg not found: keeping WebM only"); return; }
  const mp4 = (args, out) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-preset", "medium", "-movflags", "+faststart", out]);
  mp4(["-i", full], path.join(OUT, "keel-walkthrough.mp4"));
  chapters.forEach((c, i) => {
    const end = i + 1 < chapters.length ? chapters[i + 1].at : total;
    mp4(["-ss", String(c.at), "-to", String(end), "-i", full], path.join(OUT, `${c.name}.mp4`));
  });
  fs.rmSync(full);
  console.log("wrote MP4 walkthrough and chapters to", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
