"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { Script } = require("node:vm");
const model = require("../widget-state.js");
const evidence = require("../widget-evidence.js");
const root = join(__dirname, "..");
const fixture = JSON.parse(readFileSync(join(root, "..", "demo-data", "lantern", "expected-findings.json"), "utf8"));

test("compact preview uses the current per-control fixture, not stale hardcoded counts", () => {
  for (const control of model.events.changed.controls) {
    const finding = fixture.findings.find(item => item.control_id === control.id);
    assert.equal(control.status, finding.expected_projection_code);
    assert.equal(model.events.reviewed.controls.find(item => item.id === control.id).status, finding.expected_projection_code_after_human_action);
  }
  assert.deepEqual(model.counts(model.events.changed), { verified: 5, review: 3 });
  assert.deepEqual(model.counts(model.events.reviewed), { verified: 6, review: 2 });
});

test("only recorded human verification contributes to the green counter", () => {
  assert.equal(model.isVerified({ status: "EVIDENCE_FOUND" }), false);
  assert.equal(model.isVerified({ status: "RETURNED_TO_AUTHOR" }), false);
  assert.equal(model.isVerified({ status: "ACKNOWLEDGE" }), false);
  assert.equal(model.isVerified({ status: "VERIFIED" }), true);
});

test("settings reject malformed or unsafe values explicitly", () => {
  assert.deepEqual(model.validatePreferences(model.defaults), model.defaults);
  for (const webUrl of ["file:///secret", "javascript:alert(1)", "http://example.com", "https://user:pass@example.com"]) {
    assert.throws(() => model.validatePreferences({ ...model.defaults, webUrl }));
  }
  assert.throws(() => model.validatePreferences({ ...model.defaults, folderId: "My folder" }));
  assert.throws(() => model.validatePreferences({ ...model.defaults, notifications: "yes" }));
  assert.throws(() => model.validatePreferences({ ...model.defaults, topic: "<img>" }));
});

test("details links preserve snapshot, filter and exact control context", () => {
  const result = new URL(model.detailsUrl("https://example.com/keel", "reviewed", "verified", "SEC-ARCH-22"));
  assert.equal(result.searchParams.get("event"), "reviewed");
  assert.equal(result.searchParams.get("snapshot"), "S4");
  assert.equal(result.searchParams.get("filter"), "verified");
  assert.equal(result.hash, "#SEC-ARCH-22");
  assert.throws(() => model.detailsUrl(result, "unknown", "review"));
  assert.throws(() => model.detailsUrl(result, "changed", "other"));
});

test("browser assets are local and JavaScript parses without a bundler", () => {
  const html = readFileSync(join(root, "widget.html"), "utf8");
  assert.ok(!/https?:\/\/[^"]+\.(js|css)/.test(html));
  for (const file of ["widget.js", "widget-state.js", "widget-evidence.js"]) new Script(readFileSync(join(root, file), "utf8"), { filename: file });
  for (const file of ["widget.css", "widget.js", "widget-state.js", "widget-evidence.js"]) assert.ok(existsSync(join(root, file)));
});

test("every accordion excerpt and reviewer is bound to the current repository fixture", () => {
  const normalize = text => text.replace(/\s+/g, " ").trim();
  for (const finding of fixture.findings) {
    const item = evidence[finding.control_id];
    assert.equal(item.snippet, finding.evidence[0].quote);
    assert.equal(item.verifiedBy, finding.prior_evidence[0].verified_by);
    const source = finding.evidence[0];
    const file = source.fileName === "architecture.md" ? `architecture-${source.versionLabel}.md` : source.fileName;
    const content = readFileSync(join(root, "..", "demo-data", "lantern", file), "utf8");
    assert.ok(normalize(content).includes(normalize(item.snippet)), `Quote missing for ${finding.control_id}`);
  }
});

const remoteState = () => ({
  mode: "mock",
  projectId: "lantern",
  projectName: "Project Lantern",
  snapshotId: "S4",
  observedAt: "2026-10-17T08:00:00Z",
  sequence: 4,
  controls: model.events.changed.controls.map(control => ({ ...control, ...(model.isVerified(control) ? { verifiedBy: "Fixture reviewer" } : {}) })),
  event: { ...model.events.changed, controls: undefined }
});

test("remote snapshots are project-bound and keep human verification provenance", () => {
  const normalized = model.validateProjectState(remoteState(), "lantern");
  assert.equal(normalized.snapshot, "S4");
  assert.deepEqual(model.counts(normalized), { verified: 5, review: 3 });
  assert.throws(() => model.validateProjectState(remoteState(), "another-project"));
  const missingReviewer = remoteState();
  delete missingReviewer.controls[0].verifiedBy;
  assert.throws(() => model.validateProjectState(missingReviewer, "lantern"));
});

test("incomplete, duplicate and unknown remote control states are not applied", () => {
  for (const mutate of [
    value => { value.controls = []; },
    value => { value.controls.push(value.controls[0]); },
    value => { value.controls[0].status = "PASSED_BY_AI"; },
    value => { value.sequence = -1; },
    value => { value.event.affected = ["UNKNOWN"]; },
    value => { value.observedAt = "yesterday"; }
  ]) {
    const value = remoteState();
    mutate(value);
    assert.throws(() => model.validateProjectState(value, "lantern"));
  }
});
