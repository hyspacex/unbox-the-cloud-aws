(function (root, factory) {
  const evidence = typeof module === "object" && module.exports ? require("./widget-evidence.js") : root.KeelEvidence;
  const state = factory(evidence);
  if (typeof module === "object" && module.exports) module.exports = state;
  else root.KeelWidget = state;
})(typeof globalThis === "object" ? globalThis : this, function (evidence) {
  "use strict";

  // Compact fixture summaries from demo-data/lantern, not live compliance results.
  const controls = [
    { id: "SEC-ARCH-01", title: "Approved services", status: "VERIFIED_HOLDS", reason: "The reviewed services list is unchanged.", source: "approved-services-and-exceptions.md v1" },
    { id: "SEC-ARCH-02", title: "Data classification", status: "VERIFIED_HOLDS", reason: "The reviewed per-store classification still holds.", source: "data-flow-and-classification.md v1" },
    { id: "SEC-ARCH-04", title: "Identity and MFA", status: "VERIFIED_HOLDS", reason: "The reviewed identity evidence still holds.", source: "architecture.md v3" },
    { id: "SEC-ARCH-05", title: "Privilege boundaries", status: "ACKNOWLEDGE", reason: "The surrounding section changed. A human acknowledgment is due.", source: "architecture.md v3" },
    { id: "SEC-ARCH-07", title: "Key management", status: "NEEDS_REVIEW_WEAKENED", reason: "Customer-managed keys and rotation no longer have supporting clauses.", source: "architecture.md v3" },
    { id: "SEC-ARCH-17", title: "Security logging", status: "VERIFIED_HOLDS", reason: "The reviewed SIEM evidence still holds.", source: "architecture.md v3" },
    { id: "SEC-ARCH-20", title: "Third-party review", status: "VERIFIED_HOLDS", reason: "The reviewed vendor evidence still holds.", source: "vendor-contract-summary.md v1" },
    { id: "SEC-ARCH-22", title: "Recovery and rollback", status: "NEEDS_REVIEW_BINDING", reason: "Support remains in the runbook, but that evidence binding needs review.", source: "runbook.md v2" }
  ].map(control => ({ ...control, ...evidence[control.id] }));

  const events = {
    changed: {
      id: "fixture-s4-evaluation", snapshot: "S4", kind: "changed",
      actor: "J. Park", file: "architecture.md v3", time: "2026-10-17T08:00:00Z",
      title: "3 need review", beforeVerified: 8, beforeReview: 0,
      note: "A teammate's upload changed the evidence. No new human verification is implied.",
      affected: ["SEC-ARCH-05", "SEC-ARCH-07", "SEC-ARCH-22"],
      controls
    },
    reviewed: {
      id: "fixture-s4-human-responses", snapshot: "S4", kind: "reviewed",
      actor: "Dana Okafor", file: "runbook.md v2", time: "2026-10-17T08:01:00Z",
      title: "1 re-verified", beforeVerified: 5, beforeReview: 3,
      note: "The fixture reviewer re-verified recovery and returned key management to the author. Two items remain open.",
      affected: ["SEC-ARCH-22", "SEC-ARCH-07"],
      controls: controls.map(control => {
        if (control.id === "SEC-ARCH-22") return { ...control, status: "VERIFIED", verifiedBy: "Dana Okafor", reason: "Re-verified by Dana Okafor against runbook.md v2 (fixture)." };
        if (control.id === "SEC-ARCH-07") return { ...control, status: "RETURNED_TO_AUTHOR", reason: "Returned to the author; the key-management gap remains open." };
        return { ...control };
      })
    }
  };

  const defaults = {
    folderId: "318840021",
    topic: "lantern/318840021",
    webUrl: "",
    notifications: true,
    alwaysOnTop: true,
    autoHideBorder: true,
    edgeAutoHide: false
  };

  function isVerified(control) {
    return control.status === "VERIFIED" || control.status === "VERIFIED_HOLDS";
  }

  function counts(event) {
    const verified = event.controls.filter(isVerified).length;
    return { verified, review: event.controls.length - verified };
  }

  function validatePreferences(input) {
    if (!input || typeof input !== "object") throw new Error("Settings are missing.");
    const folderId = String(input.folderId || "").trim();
    const topic = String(input.topic || "").trim();
    const webUrl = String(input.webUrl || "").trim();
    if (!/^\d{1,24}$/.test(folderId)) throw new Error("Use a numeric Box folder ID.");
    if (!/^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,127}$/.test(topic)) throw new Error("Use a topic path, for example lantern/318840021.");
    if (webUrl) {
      let url;
      try { url = new URL(webUrl); } catch { throw new Error("The details URL must be an absolute HTTPS address."); }
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("Use HTTPS without credentials for the details URL.");
    }
    const result = { folderId, topic, webUrl };
    for (const key of ["notifications", "alwaysOnTop", "autoHideBorder", "edgeAutoHide"]) {
      if (typeof input[key] !== "boolean") throw new Error(`Invalid ${key} setting.`);
      result[key] = input[key];
    }
    return result;
  }

  function detailsUrl(base, eventKey, filter, controlId = "") {
    if (!Object.hasOwn(events, eventKey)) throw new Error("Unknown event.");
    if (!["verified", "review", "all"].includes(filter)) throw new Error("Unknown detail filter.");
    if (controlId && !events[eventKey].controls.some(control => control.id === controlId)) throw new Error("Unknown control.");
    const url = new URL(base);
    url.searchParams.set("view", "details");
    url.searchParams.set("event", eventKey);
    url.searchParams.set("snapshot", events[eventKey].snapshot);
    url.searchParams.set("filter", filter);
    if (controlId) url.hash = controlId;
    return url.href;
  }

  function validateProjectState(value, projectId) {
    const string = (input, max = 256) => typeof input === "string" && input.length > 0 && input.length <= max;
    const statuses = ["VERIFIED", "VERIFIED_HOLDS", "ACKNOWLEDGE", "PENDING", "NOT_EVALUATED",
      "NEEDS_REVIEW_BINDING", "NEEDS_REVIEW_WEAKENED", "NEEDS_REVIEW_ABSENT", "NEEDS_REVIEW_CONFLICT",
      "RETURNED_TO_AUTHOR", "EXCEPTION", "NOT_APPLICABLE", "SUPERSEDED"];
    if (!value || value.projectId !== projectId || !string(value.projectName, 128) || !string(value.snapshotId, 128)
      || !Number.isSafeInteger(value.sequence) || value.sequence < 0
      || !string(value.observedAt, 64) || !Number.isFinite(Date.parse(value.observedAt))
      || !Array.isArray(value.controls) || value.controls.length === 0 || value.controls.length > 500) {
      throw new Error("Invalid project snapshot. No status was applied.");
    }
    const ids = new Set();
    for (const control of value.controls) {
      if (!control || !string(control.id, 128) || !/^[A-Za-z0-9_-]{1,128}$/.test(control.id) || ids.has(control.id)
        || !string(control.title) || !statuses.includes(control.status) || !string(control.reason, 2000) || !string(control.source)
        || (isVerified(control) && !string(control.verifiedBy))) {
        throw new Error("Invalid or unbound control evidence. No status was applied.");
      }
      for (const [key, limit] of [["snippet", 4000], ["author", 128], ["section", 128], ["verifiedAt", 64]]) {
        if (control[key] != null && !string(control[key], limit)) throw new Error(`Invalid ${key} in project evidence.`);
      }
      if (control.sourceUrl != null) {
        let source;
        try { source = new URL(control.sourceUrl); } catch { throw new Error("Invalid evidence link."); }
        if (source.protocol !== "https:" || source.username || source.password) throw new Error("Evidence links must use HTTPS without credentials.");
      }
      ids.add(control.id);
    }
    const event = value.event;
    if (!event || !string(event.id, 128) || !["changed", "reviewed"].includes(event.kind)
      || !string(event.actor, 128) || !string(event.file) || !string(event.title, 128)
      || !string(event.note, 2000) || !Array.isArray(event.affected) || event.affected.some(id => !ids.has(id))
      || !Number.isSafeInteger(event.beforeVerified) || event.beforeVerified < 0 || event.beforeVerified > 500) {
      throw new Error("Invalid project change event. No status was applied.");
    }
    return {
      ...event, snapshot: value.snapshotId, controls: value.controls,
      projectName: value.projectName, time: value.observedAt, sequence: value.sequence
    };
  }

  return { events, defaults, counts, isVerified, validatePreferences, detailsUrl, validateProjectState };
});
