import { beforeEach, describe, expect, it } from "vitest";
import { demoSignIn, sessionForToken, desktopSession, issueTicket, exchangeTicket, canReview, checkOrigin, appOrigin } from "../src/lib/auth";
import { desktopView, uploadAndSubmit, uploadForm } from "../src/lib/desktop";
import { getRun, reset, act } from "../src/lib/service";
import { resetConfigCache } from "../src/lib/config";
import { fixture } from "../src/lib/fixture";

beforeEach(() => {
  process.env.MOCK_MODE = "true";
  process.env.KEEL_MOCK_TIME_SCALE = "0";
  resetConfigCache();
  globalThis.__keelAuth = undefined;
  globalThis.__keelDesktopProjection = undefined;
  reset();
});

describe("user and widget session separation", () => {
  it("issues a single-use, project-bound handoff; native token is not the browser token", () => {
    const { raw, session } = demoSignIn("author");
    expect(sessionForToken(raw)?.user.name).toBe(session.user.name);
    const code = issueTicket(session);
    const grant = exchangeTicket(code, "lantern");
    expect(grant.accessToken).not.toBe(raw);
    expect(desktopSession(grant.accessToken).user.id).toBe(session.user.id);
    expect(() => exchangeTicket(code, "lantern")).toThrow(/expired|already used/);
    expect(() => desktopSession(grant.accessToken, "other")).toThrow();
    expect(() => desktopSession(raw)).toThrow();
  });
  it("enforces reviewer roles and expires sessions", () => {
    const author = demoSignIn("author"), reviewer = demoSignIn("reviewer");
    expect(canReview(author.session)).toBe(false);
    expect(canReview(reviewer.session)).toBe(true);
    author.session.expiresAt = 1;
    expect(sessionForToken(author.raw)).toBeNull();
    expect(() => checkOrigin("https://evil.example", "https://keel.example")).toThrow();
  });
  it("disables fixture sign-in in live mode", () => {
    process.env.MOCK_MODE = "false"; resetConfigCache();
    expect(() => demoSignIn("author")).toThrow(/disabled/);
  });
  it("uses the actual loopback host when Next normalizes request.url", () => {
    delete process.env.KEEL_BASE_URL;
    expect(appOrigin(new Request("http://localhost:3100/api/auth/demo", { headers: { Host: "127.0.0.1:3100" } }))).toBe("http://127.0.0.1:3100");
  });
});

describe("upload -> review -> widget data", () => {
  it("runs the same engine after an authenticated file upload; human review changes the current count", async () => {
    expect(desktopView().controls.filter(control => control.status === "VERIFIED_HOLDS")).toHaveLength(8);
    const session = demoSignIn("author").session;
    const file = new File([fixture.text("architecture-v3.md")], "architecture.md", { type: "text/markdown" });
    const result = await uploadAndSubmit([file], session);
    while (!getRun(result.runId).done) await new Promise(resolve => setTimeout(resolve, 5));
    const before = desktopView();
    expect(before.mode).toBe("mock");
    expect(before.controls.filter(control => control.status === "VERIFIED_HOLDS")).toHaveLength(5);
    expect(before.controls.find(control => control.id === "SEC-ARCH-07")?.status).toBe("NEEDS_REVIEW_WEAKENED");
    expect(desktopView().sequence).toBe(before.sequence);
    await act({ action: "verify", finding_id: "", control_id: "SEC-ARCH-22", reason: "Evidence verified in runbook.", decision_snapshot_id: result.snapshotId });
    const after = desktopView();
    expect(after.controls.filter(control => ["VERIFIED", "VERIFIED_HOLDS"].includes(control.status))).toHaveLength(6);
    expect(after.sequence).toBeGreaterThan(before.sequence);
    expect(after.event.beforeVerified).toBe(5);
  });
  it("validates file type and duplicate names before upload", async () => {
    const form = new FormData();
    form.append("files", new File(["one"], "duplicate.md"));
    form.append("files", new File(["two"], "duplicate.md"));
    await expect(uploadForm(new Request("http://127.0.0.1/uploads", { method: "POST", body: form }))).rejects.toMatchObject({ code: "DUPLICATE_NAME" });
    const invalid = new FormData(); invalid.append("files", new File(["secret"], ".env"));
    await expect(uploadForm(new Request("http://127.0.0.1/uploads", { method: "POST", body: invalid }))).rejects.toMatchObject({ code: "UNSUPPORTED_FILE" });
  });
});
