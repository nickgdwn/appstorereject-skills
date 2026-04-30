"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");

const DENY_PREFIXES = [
  "/",
  "/etc",
  "/tmp",
  "/var",
  "/System",
  "/Library",
  "/Applications",
];

function isUnderPrefix(target, prefix) {
  if (prefix === "/") {
    // Special-case: only refuse if target is exactly "/"
    return target === "/";
  }
  if (target === prefix) return true;
  return target.startsWith(prefix + path.sep);
}

function isUnderHome(target) {
  const home = path.resolve(os.homedir());
  // Refuse $HOME itself; allow subdirs
  if (target === home) return false;
  return target.startsWith(home + path.sep);
}

function isUnderCwd(target) {
  const cwd = path.resolve(process.cwd());
  if (target === cwd) return true;
  return target.startsWith(cwd + path.sep);
}

function validateProjectPath(input) {
  if (typeof input !== "string" || !input) {
    return { ok: false, error: "unsafe project path: <empty>" };
  }

  // Check if input had a trailing slash before normalization
  const hadTrailingSlash = input.endsWith(path.sep);
  const resolved = path.resolve(input);

  // 1. Must be an existing directory
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return { ok: false, error: `unsafe project path: ${resolved}` };
  }
  if (!stat.isDirectory()) {
    return { ok: false, error: `unsafe project path: ${resolved}` };
  }

  // 2. Deny-list (wins): refuse system dirs
  for (const prefix of DENY_PREFIXES) {
    if (isUnderPrefix(resolved, prefix)) {
      return { ok: false, error: `unsafe project path: ${resolved}` };
    }
  }

  // 2b. Special case: reject $HOME with trailing slash
  const home = path.resolve(os.homedir());
  if (resolved === home && hadTrailingSlash) {
    return { ok: false, error: `unsafe project path: ${resolved}` };
  }

  // 3. Allow-list: under $HOME subdir, /home/<name>/..., /Users/<name>, or cwd subtree
  const allowed =
    isUnderHome(resolved) ||
    resolved.startsWith("/home/") ||
    resolved.startsWith("/Users/") ||
    isUnderCwd(resolved);
  if (!allowed) {
    return { ok: false, error: `unsafe project path: ${resolved}` };
  }

  return { ok: true, resolved };
}

module.exports = { validateProjectPath };
