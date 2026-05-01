#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require(path.join(__dirname, "vendor/js-yaml.cjs"));

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const memFile = args["memory-file"];
const featFile = args["features-file"];

if (!memFile) {
  process.stderr.write("Usage: render-notes-draft.js --memory-file <path> [--features-file <path>]\n");
  process.exit(1);
}

let memory;
try {
  const raw = fs.readFileSync(memFile, "utf8");
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) throw new Error("missing frontmatter");
  if (/!![a-zA-Z]+\/?[a-zA-Z]*/.test(m[1])) throw new Error("custom YAML tag");
  memory = yaml.load(m[1], { schema: yaml.FAILSAFE_SCHEMA });
} catch (e) {
  process.stderr.write("malformed memory file: " + e.message + "\n");
  process.exit(5);
}

let features = null;
if (featFile) {
  try {
    features = JSON.parse(fs.readFileSync(featFile, "utf8"));
  } catch {
    features = null;
  }
}

function buildRecordingHint() {
  if (!features) return "show launch + main flow + permission prompts";
  const parts = ["launch", "main flow"];
  if (features.authFlows?.detected) parts.push("auth flow (sign-in)");
  if (features.paidContent?.detected) parts.push("purchase / IAP flow");
  if (features.sensitivePermissions?.detected?.length) {
    parts.push("permission prompts: " + features.sensitivePermissions.detected.join(", "));
  }
  if (features.userGeneratedContent?.detected) {
    parts.push("UGC reporting / blocking");
  }
  return parts.join(" → ");
}

function pendingHint(itemKey) {
  if (itemKey === "screenRecording") {
    const hint = buildRecordingHint();
    if (!features) {
      // No features file: use bare fallback
      return `[TODO: ${hint}]`;
    }
    // Features file provided: wrap with "Attach screen recording showing:"
    return `[TODO: Attach screen recording showing: ${hint}]`;
  }
  return "[TODO: fill in before submitting]";
}

function renderItem(itemKey, sectionTitle, naMsg) {
  const item = memory.items?.[itemKey] || { status: "pending", value: "" };
  let body;
  if (item.status === "na" && naMsg) {
    body = naMsg;
  } else if (item.status === "confirmed" && item.value) {
    body = item.value;
  } else {
    body = pendingHint(itemKey);
  }
  return `${sectionTitle}\n${body}`;
}

const sections = [
  renderItem("screenRecording", "1. Screen Recording", null),
  renderItem("appPurpose", "2. App Purpose", null),
  renderItem("testCredentials", "3. Test Credentials", null),
  renderItem("externalServices", "4. External Services", null),
  renderItem("regional", "5. Regional Differences", null),
  renderItem(
    "regulated",
    "6. Regulated Industry",
    "Not applicable — this app does not operate in a regulated industry."
  ),
];

process.stdout.write(sections.join("\n\n") + "\n");
process.exit(0);
