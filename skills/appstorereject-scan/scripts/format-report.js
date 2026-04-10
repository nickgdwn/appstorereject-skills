#!/usr/bin/env node
"use strict";

const fs = require("fs");

const args = process.argv.slice(2);
let findingsFilePath = null;
let guidesFilePath = null;
let scanToken = null;
let bundleId = null;
let platform = null;
let framework = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--findings-file" && args[i + 1]) { findingsFilePath = args[i + 1]; i++; }
  if (args[i] === "--guides-file" && args[i + 1]) { guidesFilePath = args[i + 1]; i++; }
  if (args[i] === "--scan-token" && args[i + 1]) { scanToken = args[i + 1]; i++; }
  if (args[i] === "--bundle-id" && args[i + 1]) { bundleId = args[i + 1]; i++; }
  if (args[i] === "--platform" && args[i + 1]) { platform = args[i + 1]; i++; }
  if (args[i] === "--framework" && args[i + 1]) { framework = args[i + 1]; i++; }
}

if (!findingsFilePath) {
  process.stderr.write("Usage: format-report.js --findings-file <path> [--guides-file <path>] [--scan-token <t>] [--bundle-id <id>] [--platform <p>] [--framework <f>]\n");
  process.exit(1);
}

let findings;
try {
  findings = JSON.parse(fs.readFileSync(findingsFilePath, "utf8"));
} catch (e) {
  process.stderr.write(`Error reading findings file: ${e.message}\n`);
  process.exit(1);
}

let guides = [];
if (guidesFilePath) {
  try {
    const guidesResponse = JSON.parse(fs.readFileSync(guidesFilePath, "utf8"));
    guides = guidesResponse.data || [];
  } catch {}
}

const guideMap = new Map();
for (const guide of guides) {
  if (guide.slug) guideMap.set(guide.slug, guide);
}

const riskOrder = { HIGH: 0, MED: 1, LOW: 2 };
const sorted = [...findings].sort(
  (a, b) => (riskOrder[a.risk] ?? 3) - (riskOrder[b.risk] ?? 3)
);

const rows = sorted.map((f, i) => `| ${i + 1} | ${f.guideline} | ${f.risk} | ${f.finding} |`);
const findingsTable = [
  "| # | Guideline | Risk | Finding |",
  "|---|-----------|------|---------|",
  ...rows,
].join("\n");

const guideSections = [];
const unguidedFindings = [];

for (const finding of sorted) {
  if (finding.slug && guideMap.has(finding.slug)) {
    const guide = guideMap.get(finding.slug);
    guideSections.push({
      finding: finding.finding,
      guideline: finding.guideline,
      risk: finding.risk,
      resolutionSteps: guide.resolutionSteps || null,
      prevention: guide.prevention || null,
      codebaseContextPrompt: finding.contextTemplate
        ? `Using the check context as guidance: ${finding.contextTemplate}`
        : `Search the developer's project for files related to guideline ${finding.guideline}. Report what you find.`,
    });
  } else if (!finding.slug) {
    unguidedFindings.push({
      checkId: finding.checkId,
      guideline: finding.guideline,
      risk: finding.risk,
      finding: finding.finding,
      note: "No community guide available yet",
    });
  }
}

const FRAMEWORK_MAP = {
  expo_managed: "expo",
  expo_bare: "react-native",
  react_native_cli: "react-native",
  native_ios: "native",
  native_android: "native",
};

const analyticsPayload = {
  scanToken: scanToken || null,
  bundleId: bundleId || null,
  platform: platform || null,
  framework: FRAMEWORK_MAP[framework] || framework || null,
  findings: sorted.map((f) => ({
    guidelineCode: f.guideline,
    confidence: (f.confidence || "medium").toLowerCase(),
    checkId: f.checkId,
    context: (f.context || "").slice(0, 200),
  })),
};

process.stdout.write(JSON.stringify({
  findingsTable,
  guideSections,
  unguidedFindings,
  analyticsPayload,
}, null, 2) + "\n");
