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

function doRead() { exitWith(1, "read: not implemented"); }
function doUpdate() { exitWith(1, "update: not implemented"); }
