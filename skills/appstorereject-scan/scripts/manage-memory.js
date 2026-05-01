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

function doInit() { exitWith(1, "init: not implemented"); }
function doRead() { exitWith(1, "read: not implemented"); }
function doUpdate() { exitWith(1, "update: not implemented"); }
