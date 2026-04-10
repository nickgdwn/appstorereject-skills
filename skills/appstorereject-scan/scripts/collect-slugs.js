#!/usr/bin/env node
"use strict";

const fs = require("fs");

const args = process.argv.slice(2);
let findingsFilePath = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--findings-file" && args[i + 1]) {
    findingsFilePath = args[i + 1];
    i++;
  }
}

if (!findingsFilePath) {
  process.stderr.write("Usage: collect-slugs.js --findings-file <path>\n");
  process.exit(1);
}

let findings;
try {
  findings = JSON.parse(fs.readFileSync(findingsFilePath, "utf8"));
} catch (e) {
  process.stderr.write(`Error reading findings file: ${e.message}\n`);
  process.exit(1);
}

const slugs = [];
const skipped = [];

for (const finding of findings) {
  if (finding.risk !== "HIGH" && finding.risk !== "MED") continue;
  if (finding.slug) {
    slugs.push(finding.slug);
  } else {
    skipped.push(finding.checkId);
  }
}

const uniqueSlugs = [...new Set(slugs)];

const output = {
  slugs: uniqueSlugs,
  skipped,
  skippedReason: skipped.length > 0 ? "slug is null — no resolution guide available" : null,
};

if (uniqueSlugs.length > 0) {
  output.fetchCommand = `curl -s -H "Authorization: Bearer $ASR_API_KEY" "https://api.appstorereject.com/api/rejections/batch?slugs=${uniqueSlugs.join(",")}"`;
} else {
  output.fetchCommand = null;
}

process.stdout.write(JSON.stringify(output, null, 2) + "\n");
