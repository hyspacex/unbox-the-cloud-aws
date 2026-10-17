"use strict";

const { copyFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const root = join(__dirname, "..");
const output = join(root, "dist");
mkdirSync(output, { recursive: true });
for (const file of ["widget.html", "widget.css", "widget-evidence.js", "widget-state.js", "widget.js"]) {
  copyFileSync(join(root, file), join(output, file));
}
console.log("Prepared five local UI assets. No bundler or frontend runtime dependencies.");
