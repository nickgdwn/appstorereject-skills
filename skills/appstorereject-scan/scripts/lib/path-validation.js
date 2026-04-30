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

function isUnderCwd(target) {
  const cwd = path.resolve(process.cwd());
  if (target === cwd) return true;
  return target.startsWith(cwd + path.sep);
}

function validateProjectPath(input) {
  if (typeof input !== "string" || !input) {
    return { ok: false, error: "unsafe project path: <empty>" };
  }
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

  // 2. Deny-list (wins): refuse system dirs and $HOME itself.
  // Deny-list operates on the resolved path; trailing slashes in the input
  // are normalized away by path.resolve and have no security significance.
  for (const prefix of DENY_PREFIXES) {
    if (isUnderPrefix(resolved, prefix)) {
      return { ok: false, error: `unsafe project path: ${resolved}` };
    }
  }
  if (resolved === path.resolve(os.homedir())) {
    return { ok: false, error: `unsafe project path: ${resolved}` };
  }

  // 3. Allow-list: any /Users/<name>/<subdir>... or /home/<name>/<subdir>...,
  // or cwd subtree. The regex requires at least one path segment AFTER the
  // username — bare /Users/<name> or /home/<name> would be someone's $HOME
  // and must remain denied (step 2 catches the current user; this regex
  // keeps the rule consistent for other users on shared systems).
  const allowed =
    /^\/(Users|home)\/[^/]+\/[^/]+/.test(resolved) ||
    isUnderCwd(resolved);
  if (!allowed) {
    return { ok: false, error: `unsafe project path: ${resolved}` };
  }

  return { ok: true, resolved };
}

module.exports = { validateProjectPath };
