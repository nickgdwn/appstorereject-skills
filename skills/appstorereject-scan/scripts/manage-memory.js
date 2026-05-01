#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require(path.join(__dirname, "vendor/js-yaml.cjs"));
const { validateProjectPath } = require(path.join(__dirname, "lib/path-validation.js"));

const TEMPLATE_DIR = path.join(__dirname, "templates");
const SCHEMA_VERSION = "1";
const ITEM_KEYS = [
  "appPurpose",
  "testCredentials",
  "externalServices",
  "regional",
  "regulated",
  "screenRecording",
];

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      args[a.slice(2)] = argv[i + 1];
      i++;
    } else {
      args._.push(a);
    }
  }
  return args;
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function exitWith(code, msg) {
  if (msg) process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
  process.exit(code);
}

const subcommand = process.argv[2];
const args = parseArgs(process.argv.slice(3));

if (!subcommand) {
  exitWith(1, "Usage: manage-memory.js <init|read|update> [flags]");
}

// Common preflight: validate --project for all subcommands
const projectInput = args.project;
if (!projectInput) {
  exitWith(1, "manage-memory: --project is required");
}
const validated = validateProjectPath(projectInput);
if (!validated.ok) {
  exitWith(1, validated.error);
}
const PROJECT = validated.resolved;
const ASR_DIR = path.join(PROJECT, ".appstorereject");
const MEMORY_FILE = path.join(ASR_DIR, "memory.md");
const README_FILE = path.join(ASR_DIR, "README.md");
const GITIGNORE_FILE = path.join(PROJECT, ".gitignore");

// Subcommand handlers stub
switch (subcommand) {
  case "init": doInit(); break;
  case "read": doRead(); break;
  case "update": doUpdate(); break;
  default: exitWith(1, `unknown subcommand: ${subcommand}`);
}

function doInit() {
  const bundleId = args["bundle-id"];
  if (!bundleId) exitWith(1, "init: --bundle-id is required");

  // 1. Create .appstorereject/ (idempotent)
  fs.mkdirSync(ASR_DIR, { recursive: true });

  // 2. Write memory.md ONLY if it doesn't exist
  if (!fs.existsSync(MEMORY_FILE)) {
    const tpl = fs.readFileSync(path.join(TEMPLATE_DIR, "memory.md.tpl"), "utf8");
    const content = tpl
      .replace("{{BUNDLE_ID}}", bundleId)
      .replace("{{TODAY}}", todayUtc());
    fs.writeFileSync(MEMORY_FILE, content);
  }

  // 3. Always: chmod 600 (heals legacy installs)
  try { fs.chmodSync(MEMORY_FILE, 0o600); } catch { /* Windows / non-POSIX no-op */ }

  // 4. Write README.md ONLY if it doesn't exist
  if (!fs.existsSync(README_FILE)) {
    const readmeTpl = fs.readFileSync(path.join(TEMPLATE_DIR, "README.md.tpl"), "utf8");
    fs.writeFileSync(README_FILE, readmeTpl);
  }

  // 5. Always: ensure .gitignore line
  ensureGitignoreLine();

  process.exit(0);
}

function ensureGitignoreLine() {
  const LINE = ".appstorereject/";
  let existing = "";
  try {
    existing = fs.readFileSync(GITIGNORE_FILE, "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") {
      // Permission or other; the write below may also fail; we'll handle that
    }
  }
  const lines = existing.split("\n").map((l) => l.trim());
  if (lines.includes(LINE)) return; // Idempotent
  const append = (existing.length === 0 ? "" : (existing.endsWith("\n") ? "" : "\n")) + LINE + "\n";
  try {
    fs.appendFileSync(GITIGNORE_FILE, append);
  } catch (e) {
    process.stderr.write(`warning: could not append to .gitignore (${e.code}); add '${LINE}' manually\n`);
  }
}

function parseMemoryFile(filepath) {
  const raw = fs.readFileSync(filepath, "utf8");
  // Frontmatter is between the first two `---` lines
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) {
    throw Object.assign(new Error("missing frontmatter"), { code: 5 });
  }
  // Reject custom YAML tags as a defense-in-depth check (FAILSAFE_SCHEMA also refuses, but be explicit)
  if (/!![a-zA-Z]+\/?[a-zA-Z]*/.test(m[1])) {
    throw Object.assign(new Error("custom YAML tag"), { code: 5 });
  }
  let parsed;
  try {
    parsed = yaml.load(m[1], { schema: yaml.FAILSAFE_SCHEMA });
  } catch (e) {
    throw Object.assign(new Error("malformed YAML: " + e.message), { code: 5 });
  }
  if (!parsed || typeof parsed !== "object") {
    throw Object.assign(new Error("frontmatter is not a mapping"), { code: 5 });
  }
  return parsed;
}

function doRead() {
  const expectedBundleId = args["bundle-id"];

  if (!fs.existsSync(MEMORY_FILE)) {
    process.exit(2);
  }

  let parsed;
  try {
    parsed = parseMemoryFile(MEMORY_FILE);
  } catch (e) {
    if (e.code === 5) exitWith(5, e.message);
    throw e;
  }

  // Schema version check
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    exitWith(4, `expected<=${SCHEMA_VERSION}, got=${parsed.schemaVersion}`);
  }

  // Bundle ID check
  if (expectedBundleId && parsed.bundleId !== expectedBundleId) {
    exitWith(3, `expected=${expectedBundleId} got=${parsed.bundleId}`);
  }

  // Warnings for unknown keys (non-fatal)
  const KNOWN_TOP = ["schemaVersion", "bundleId", "lastScanDate", "lastScanToken", "items"];
  for (const key of Object.keys(parsed)) {
    if (!KNOWN_TOP.includes(key)) {
      process.stderr.write(`warning: unknown frontmatter key: ${key}\n`);
    }
  }
  if (parsed.items && typeof parsed.items === "object") {
    for (const key of Object.keys(parsed.items)) {
      if (!ITEM_KEYS.includes(key)) {
        process.stderr.write(`warning: unknown item key: ${key}\n`);
      }
    }
  }

  process.stdout.write(JSON.stringify(parsed) + "\n");
  process.exit(0);
}

function doUpdate() {
  const answersFile = args["answers-file"];
  const draftFile = args["draft-file"];

  // Mutual exclusion
  if (answersFile && draftFile) {
    exitWith(1, "update: pass exactly one of --answers-file or --draft-file");
  }
  if (!answersFile && !draftFile) {
    exitWith(1, "update: pass exactly one of --answers-file or --draft-file");
  }

  // Memory.md must exist for any update
  if (!fs.existsSync(MEMORY_FILE)) {
    exitWith(1, "update: memory.md does not exist; run init first");
  }

  // Parse existing (rejects malformed with exit 5)
  let parsed;
  try {
    parsed = parseMemoryFile(MEMORY_FILE);
  } catch (e) {
    if (e.code === 5) exitWith(5, e.message);
    throw e;
  }

  // Always update lastScanDate
  parsed.lastScanDate = todayUtc();

  let newBody = null;

  if (answersFile) {
    const payload = JSON.parse(fs.readFileSync(answersFile, "utf8"));
    validateAnswersPayload(payload); // exits 1 on non-string leaf
    deepMergeAnswers(parsed, payload);
  }

  if (draftFile) {
    newBody = fs.readFileSync(draftFile, "utf8");
  }

  // Write back: frontmatter (always) + body (replaced if draft, preserved otherwise)
  writeMemoryFile(parsed, newBody);

  // Heal pass
  try { fs.chmodSync(MEMORY_FILE, 0o600); } catch {}
  if (!fs.existsSync(README_FILE)) {
    const readmeTpl = fs.readFileSync(path.join(TEMPLATE_DIR, "README.md.tpl"), "utf8");
    fs.writeFileSync(README_FILE, readmeTpl);
  }
  ensureGitignoreLine();

  process.exit(0);
}

function writeMemoryFile(parsed, newBody) {
  const dumped = yaml.dump(parsed, { schema: yaml.FAILSAFE_SCHEMA, lineWidth: 0 });
  // If draft was provided, use it; else preserve existing body
  let body;
  if (newBody !== null) {
    body = newBody.endsWith("\n") ? newBody : newBody + "\n";
  } else {
    const existing = fs.readFileSync(MEMORY_FILE, "utf8");
    const m = existing.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
    body = m ? m[1] : "\n";
  }
  fs.writeFileSync(MEMORY_FILE, `---\n${dumped}---\n${body}`);
}

function validateAnswersPayload(payload) {
  // Stub for now — Task 7 implements full validation
  if (!payload || typeof payload !== "object") {
    exitWith(1, "update: answers payload must be an object");
  }
}

function deepMergeAnswers(target, source) {
  if (source.lastScanToken !== undefined) {
    target.lastScanToken = source.lastScanToken;
  }
  if (source.items && typeof source.items === "object") {
    target.items = target.items || {};
    for (const [k, v] of Object.entries(source.items)) {
      target.items[k] = { ...(target.items[k] || {}), ...v };
    }
  }
  // Preserve any other top-level keys from source
  for (const [k, v] of Object.entries(source)) {
    if (k !== "items" && k !== "lastScanToken") {
      target[k] = v;
    }
  }
}
