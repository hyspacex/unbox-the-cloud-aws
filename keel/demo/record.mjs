// Records the Keel demo videos from the running local stack:
//   keel-demo.mp4            the main story (~1 min): all clear → proposed change → adopted → on the record
//   keel-keep.mp4            ~30 s: the owner keeps the decision; the author reverts
//   keel-certifications.mp4  ~30 s: install a certification pack, close the gap
//
//   cd keel && ./dev.sh --prod &
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

// Injected into every page: a visible cursor and a caption bar that survive navigations.
const overlay = () => {
  const ensure = () => {
    let c = document.getElementById("__cursor");
    if (!c && document.body) {
      c = document.createElement("div");
      c.id = "__cursor";
      Object.assign(c.style, {
        position: "fixed", zIndex: 2147483647, width: "22px", height: "22px", borderRadius: "50%",
        border: "2px solid #0a0a0a", background: "rgba(255,255,255,.55)", pointerEvents: "none",
        transform: "translate(-50%,-50%)", transition: "transform .08s ease",
        left: (window.__cx ?? -50) + "px", top: (window.__cy ?? -50) + "px", boxShadow: "0 2px 8px rgba(0,0,0,.18)",
      });
      document.documentElement.appendChild(c);
    }
    const text = sessionStorage.getItem("__caption");
    let cap = document.getElementById("__caption");
    if (text && !cap && document.body) {
      cap = document.createElement("div");
      cap.id = "__caption";
      cap.className = "caption";
      document.documentElement.appendChild(cap);
    }
    if (cap) { if (!text) cap.remove(); else if (cap.innerHTML !== text) cap.innerHTML = text; }
  };
  window.addEventListener("mousemove", (e) => {
    window.__cx = e.clientX; window.__cy = e.clientY;
    const c = document.getElementById("__cursor");
    if (c) { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }
  }, true);
  window.addEventListener("mousedown", () => { const c = document.getElementById("__cursor"); if (c) c.style.transform = "translate(-50%,-50%) scale(.7)"; }, true);
  window.addEventListener("mouseup", () => { const c = document.getElementById("__cursor"); if (c) c.style.transform = "translate(-50%,-50%)"; }, true);
  setInterval(ensure, 120);
};

async function session(browser, name, script) {
  const raw = path.join(HERE, ".raw");
  const context = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: raw, size: { width: W, height: H } } });
  await context.addInitScript(overlay);
  const page = await context.newPage();
  const users = Object.fromEntries((await (await fetch(`${BASE}/api/users`)).json()).map((u) => [u.name, u.id]));

  const h = {
    page,
    caption: async (html, hold = 0) => {
      await page.evaluate((t) => { if (t) sessionStorage.setItem("__caption", t); else sessionStorage.removeItem("__caption"); }, html);
      await sleep(250 + hold);
    },
    go: async (url, text = null, hold = 0) => {
      await page.evaluate((t) => { try { if (t) sessionStorage.setItem("__caption", t); else sessionStorage.removeItem("__caption"); } catch {} }, text).catch(() => {});
      await page.goto(BASE + url, { waitUntil: "networkidle" });
      await sleep(400 + hold);
    },
    card: async (html, hold) => {
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
    },
    glide: async (locator) => {
      const box = await locator.boundingBox();
      if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 16 });
      await sleep(160);
    },
    // Switch the signed-in user silently (cookie), for scene changes.
    as: async (name) => { await context.addCookies([{ name: "keel_user", value: users[name], url: BASE }]); },
    // Switch visibly with the user switcher.
    switchTo: async (name) => {
      const sw = page.getByTestId("user-switcher");
      await h.glide(sw);
      await sw.selectOption(users[name]);
      await page.waitForLoadState("networkidle");
      await sleep(500);
    },
  };
  h.click = async (locator) => { await locator.scrollIntoViewIfNeeded(); await h.glide(locator); await locator.click(); };
  h.upload = async (file) => {
    const chooser = page.waitForEvent("filechooser");
    await h.click(page.getByTestId("box-upload"));
    await (await chooser).setFiles(file);
    await sleep(700);
  };
  h.toast = async (kind) => { await page.locator(`[data-testid=toast][data-kind=${kind}]`).waitFor({ timeout: 30000 }); await sleep(400); };

  await script(h);
  const video = page.video();
  await context.close();
  const webm = path.join(OUT, `${name}.webm`);
  fs.copyFileSync(await video.path(), webm);
  fs.rmSync(raw, { recursive: true, force: true });
  try {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", "-preset", "medium", "-movflags", "+faststart", path.join(OUT, `${name}.mp4`)]);
    fs.rmSync(webm);
    console.log("wrote", `${name}.mp4`);
  } catch {
    console.log("ffmpeg not available; kept", `${name}.webm`);
  }
}

const TITLE = (big, small) => `<div><div style="font-weight:700;letter-spacing:.32em;font-size:15px;color:#0a0a0a">KEEL</div>
  <div style="font-size:60px;font-weight:650;letter-spacing:-.045em;margin-top:18px;color:#0a0a0a;line-height:1.08">${big}</div>
  <div style="font-size:21px;color:#6e6e73;margin-top:18px;letter-spacing:-.015em">${small}</div></div>`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f));
  execSync("python3 -m keel_runner.seed --connect", { cwd: path.join(ROOT, "runner"), stdio: "inherit" });
  const browser = await chromium.launch();
  const folder = (await (await fetch(`${BASE}/api/folders`)).json())[0].folder_id;
  const F = `/folders/${folder}`;

  await session(browser, "keel-demo", async (h) => {
    const { page } = h;
    await h.as("Maya Chen");
    await h.go(F);
    await h.card(TITLE("One source of truth<br/>for every project decision.", "Checked on every upload to Box."), 3000);

    // 1 · All clear
    await h.caption("Keel reads every document in this Box folder.<br/><b>8 decisions agreed. 7 security &amp; privacy checks pass.</b>", 3200);
    await h.click(page.getByTestId("pillar-decisions"));
    await h.caption("The decisions come straight from the documents — nobody keeps a list.", 3200);

    // 2 · A teammate uploads a change
    await h.as("J. Park");
    await h.go(`/box/folders/${folder}`, "In Box, J. Park uploads a rewrite of <b>architecture.md</b>.", 1400);
    await h.upload(path.join(CONTENT, "drift", "architecture.md"));

    // 3 · Keel surfaces it as a proposed change
    await h.as("Maya Chen");
    await h.go(F, "Keel re-checks the folder automatically…");
    await h.toast("drift");
    await h.caption("<b>Proposed change.</b> The team agreed on 50 ms; the new architecture doc says 200 ms.", 3600);
    await h.click(page.getByTestId("attention-p99_latency").getByRole("link", { name: "Compare" }));
    await h.caption("Both sides, quoted from the exact file versions. Maya owns the decision.", 3800);

    // 4 · The owner adopts it — changes are welcome, just never silent
    await h.caption("The change is intended, so she adopts it.", 800);
    await h.click(page.getByTestId("adopt-p99_latency"));
    await h.toast("adopted");
    await h.caption("<b>Decision updated: 200 ms.</b> The old statements are kept as superseded history.", 3800);
    await h.go("/box/tasks", "Keel asks the proposal’s author to update it. The meeting transcript stays as the record.", 3800);
    await h.go(F, "<b>All clear</b> — and the change is on the record: who proposed it, who adopted it, when.", 3600);
    await h.card(TITLE("Changes are welcome.<br/>Silent changes are not.", "Keel keeps every decision in agreement and on the record — in Box."), 3400);
  });

  execSync("python3 -m keel_runner.seed --connect", { cwd: path.join(ROOT, "runner"), stdio: "inherit" });
  const folder2 = (await (await fetch(`${BASE}/api/folders`)).json())[0].folder_id;
  const F2 = `/folders/${folder2}`;

  await session(browser, "keel-keep", async (h) => {
    const { page } = h;
    await h.as("J. Park");
    await h.go(`/box/folders/${folder2}`, "If a change is <b>not</b> intended…", 600);
    await h.upload(path.join(CONTENT, "drift", "architecture.md"));
    await h.as("Maya Chen");
    await h.go(F2, "");
    await h.toast("drift");
    await h.caption("…Maya keeps the current decision.", 900);
    await h.click(page.getByTestId("keep-p99_latency"));
    await h.toast("kept");
    await h.as("J. Park");
    await h.go("/box/tasks", "J. Park gets a Box task to change it back.", 3200);
    await h.go(`/box/folders/${folder2}`, "He reverts and uploads again…", 400);
    await h.upload(path.join(CONTENT, "fix", "architecture.md"));
    await h.as("Maya Chen");
    await h.go(F2, "");
    await h.toast("resolved");
    await h.caption("<b>Back in agreement.</b>", 2600);
  });

  await session(browser, "keel-certifications", async (h) => {
    const { page } = h;
    const F = F2, folder = folder2;
    await h.as("Maya Chen");
    await h.go(`${F}/packs`, "Certifications: install a standard as a set of checks.", 2400);
    await h.click(page.getByTestId("install-gdpr-design-review"));
    await page.waitForURL(`**${F}`);
    await h.toast("fail");
    await h.caption("<b>GDPR: 4 of 5.</b> One gap — no data protection impact assessment in the folder.", 3600);
    await h.go(`/box/folders/${folder}`, "Privacy adds the DPIA summary to the Box folder…", 1200);
    await h.upload(path.join(CONTENT, "certify", "dpia.md"));
    await h.go(F, "");
    await h.toast("resolved");
    await h.glide(page.getByTestId("badge-gdpr-design-review"));
    await h.caption("<b>GDPR ready.</b> And Keel keeps checking it on every upload.", 3600);
  });

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
