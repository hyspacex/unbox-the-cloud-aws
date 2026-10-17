"use strict";

const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const root = join(__dirname, "..");
const fixture = JSON.parse(readFileSync(join(root, "..", "demo-data", "lantern", "expected-findings.json"), "utf8"));
const evidence = Object.fromEntries(fixture.findings.map(finding => {
  const current = finding.evidence[0];
  const prior = finding.prior_evidence[0];
  return [finding.control_id, {
    source: `${current.fileName} ${current.versionLabel}`,
    snippet: current.quote,
    section: current.section,
    verifiedBy: prior.verified_by,
    verifiedAt: prior.verified_at,
    author: current.fileName === fixture.trigger.fileName ? fixture.trigger.confluenceEditor : null
  }];
}));
const serialized = JSON.stringify(evidence, null, 2);
writeFileSync(join(root, "widget-evidence.js"),
  `"use strict";\n// Generated from the repository's synthetic Lantern fixture; run npm run fixture:sync.\n(function (root) {\n  const evidence = ${serialized};\n  if (typeof module === "object" && module.exports) module.exports = evidence;\n  else root.KeelEvidence = evidence;\n})(globalThis);\n`);
console.log(`Refreshed ${Object.keys(evidence).length} source-bound accordion excerpts.`);
