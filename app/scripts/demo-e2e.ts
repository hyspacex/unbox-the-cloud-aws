import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(path.resolve("scripts/demo-e2e.ts"));
const widget = require("../../desktop-client/widget-state.js") as {
  validateProjectState(value: unknown, project: string): { mode: string; controls: { status: string }[] };
  counts(value: { controls: { status: string }[] }): { verified: number; review: number };
};

const origin = process.env.KEEL_DEMO_ORIGIN || "http://127.0.0.1:3100";
const parsed = new URL(origin);
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname), "This destructive fixture-reset test is loopback only.");

async function call(url: string, init?: RequestInit) {
  const response = await fetch(`${origin}${url}`, init);
  const value = await response.json();
  return { response, value };
}
async function signin(role: "author" | "reviewer") {
  const result = await call("/api/auth/demo", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ role }) });
  assert.equal(result.response.status, 200, `Sign-in: ${JSON.stringify(result.value.error)}`);
  const cookie = result.response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie, "Sign-in cookie missing");
  return cookie;
}
async function main() {
const session = await call("/api/auth/session");
assert.equal(session.value.mode, "mock", "Refuse to run fixture reset against live mode.");
assert.equal((await call("/api/package")).response.status, 401);
const reviewer = await signin("reviewer");
const resetResult = await call("/api/reset", { method: "POST", headers: { Cookie: reviewer, Origin: origin } });
assert.equal(resetResult.response.status, 200, `Reset: ${JSON.stringify(resetResult.value.error)}`);
const author = await signin("author");
const link = await call("/api/desktop/link", { method: "POST", headers: { Cookie: author, Origin: origin } });
assert.equal(link.response.status, 200);
const code = new URL(link.value.url).searchParams.get("code");
assert.ok(code);
const exchange = () => call("/api/desktop/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: "lantern", code }) });
const grant = await exchange();
assert.equal(grant.response.status, 200);
assert.equal((await exchange()).response.status, 401);
const authorization = { Authorization: `Bearer ${grant.value.accessToken}` };
const state = () => call("/api/desktop/projects/lantern/state", { headers: authorization });
const green = (value: { controls: { status: string }[] }) => value.controls.filter(control => ["VERIFIED", "VERIFIED_HOLDS"].includes(control.status)).length;
assert.equal(green((await state()).value), 8);
console.log("PASS: author/reviewer sign-in, authenticated reads and single-use desktop handoff.");

const form = new FormData();
form.append("files", new File([fs.readFileSync(path.resolve("..", "demo-data", "lantern", "architecture-v3.md"))], "architecture.md", { type: "text/markdown" }));
const upload = await call("/api/desktop/projects/lantern/uploads", { method: "POST", headers: authorization, body: form });
assert.equal(upload.response.status, 202, JSON.stringify(upload.value));
const deadline = Date.now() + 60_000;
let run;
do {
  await new Promise(resolve => setTimeout(resolve, 250));
  run = await call(`/api/run/${upload.value.runId}`, { headers: authorization });
} while (!run.value.done && Date.now() < deadline);
assert.equal(run.value.done, true, "Evaluation timed out");
assert.equal(run.value.status, "done", run.value.error || "Evaluation did not complete successfully.");
assert.equal(green((await state()).value), 5);
console.log("PASS: actual multipart fixture upload starts the review engine and updates widget data (8 -> 5).");

const action = { finding_id: "", control_id: "SEC-ARCH-22", decision_snapshot_id: upload.value.snapshotId, action: "verify", reason: "Recovery evidence reviewed in the runbook." };
assert.equal((await call("/api/action", { method: "POST", headers: { Cookie: author, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(action) })).response.status, 403);
assert.equal((await call("/api/action", { method: "POST", headers: { Cookie: reviewer, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(action) })).response.status, 200);
const reviewed = (await state()).value;
const widgetState = widget.validateProjectState(reviewed, "lantern");
assert.equal(widgetState.mode, "mock");
assert.equal(widget.counts(widgetState).verified, 6);
assert.equal(green(reviewed), 6);
assert.equal(reviewed.event.beforeVerified, 5);
const ledger = await call("/api/ledger", { headers: authorization });
assert.equal(ledger.value.chain_verification.ok, true);
console.log("PASS: author cannot impersonate a reviewer; a reviewer action updates the widget (5 -> 6); ledger chain validates.");
console.log("PASS: integrated demo end to end. Box/AWS adapters were MOCK, not live services.");
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : "Demo check failed.");
  process.exitCode = 1;
});
