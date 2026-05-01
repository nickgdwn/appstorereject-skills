#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { validateProjectPath } = require(path.join(__dirname, "lib/path-validation.js"));

// SECURITY: every constant below MUST be hardcoded `const` arrays. Do NOT load
// patterns from project files. Project file CONTENTS may appear in JSON output
// `evidence` fields but MUST NEVER be interpolated into shell commands.
//
// AUTH_PATTERNS are checked against BOTH package.json dep names AND source
// file contents. The pattern `firebase/auth` matches `@react-native-firebase/auth`
// in deps via String.includes(), and matches `from 'firebase/auth'` in source.
// Bare `firebase` is intentionally NOT a pattern — many Firebase users don't
// use auth (Firestore-only, Realtime DB, etc.) and would false-positive.
const AUTH_PATTERNS = [
  "firebase/auth",
  "next-auth",
  "@auth/",
  "clerk",
  "supabase",
];
// AUTH_SOURCE_KEYWORDS are source-only signals for custom or library-less auth.
const AUTH_SOURCE_KEYWORDS = [
  "signInWithEmailAndPassword",
  "createUserWithEmailAndPassword",
];
// PAID_PATTERNS are checked against BOTH deps AND source.
const PAID_PATTERNS = [
  "react-native-iap",
  "expo-in-app-purchases",
  "react-native-purchases",
  "StoreKit",
];
const PERMISSION_KEYS = {
  camera: { ios: "NSCameraUsageDescription", android: "android.permission.CAMERA" },
  microphone: { ios: "NSMicrophoneUsageDescription", android: "android.permission.RECORD_AUDIO" },
  location: { ios: "NSLocationWhenInUseUsageDescription", android: "android.permission.ACCESS_FINE_LOCATION" },
  contacts: { ios: "NSContactsUsageDescription", android: "android.permission.READ_CONTACTS" },
  photos: { ios: "NSPhotoLibraryUsageDescription", android: "android.permission.READ_MEDIA_IMAGES" },
  health: { ios: "NSHealthShareUsageDescription", android: "android.permission.BODY_SENSORS" },
};
const UGC_TABLE_NAMES = ["comments", "posts", "messages", "chat", "reviews"];
const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".swift", ".kt", ".java", ".m"]);
const ROUTE_ROOTS = ["src/app", "app", "src/pages", "pages"];
const SOURCE_FILE_LIMIT = 200; // Cap walked files for perf

const projectInput = process.argv[2];
if (!projectInput) {
  process.stderr.write("Usage: detect-recording-features.js <project-path>\n");
  process.exit(1);
}
const validated = validateProjectPath(projectInput);
if (!validated.ok) {
  process.stderr.write(validated.error + "\n");
  process.exit(1);
}
const PROJECT = validated.resolved;

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function readTextSafe(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function listSourceFiles() {
  const files = [];
  const queue = [{ dir: PROJECT, depth: 0 }];
  while (queue.length) {
    const { dir, depth } = queue.shift();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile() && SOURCE_EXTS.has(path.extname(e.name))) {
        files.push(full);
        if (files.length >= SOURCE_FILE_LIMIT) return files;
      } else if (e.isDirectory() && depth < 4 && e.name !== "node_modules" && !e.name.startsWith(".")) {
        queue.push({ dir: full, depth: depth + 1 });
      }
    }
  }
  return files;
}

function searchSourceFor(patterns) {
  const files = listSourceFiles();
  for (const f of files) {
    const text = readTextSafe(f);
    if (!text) continue;
    for (const pat of patterns) {
      if (text.includes(pat)) {
        return { found: true, evidence: `${pat} in ${path.relative(PROJECT, f)}` };
      }
    }
  }
  return { found: false };
}

function checkDeps(patterns) {
  const pkg = readJsonSafe(path.join(PROJECT, "package.json"));
  if (!pkg) return { found: false };
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const name of Object.keys(deps)) {
    // SAFETY: name is from package.json (untrusted). We compare it against
    // hardcoded patterns via String.includes — NEVER pass it to shell.
    for (const pat of patterns) {
      if (name.includes(pat)) {
        return { found: true, evidence: `${pat} in package.json (${name})` };
      }
    }
  }
  return { found: false };
}

function detectAuth() {
  const dep = checkDeps(AUTH_PATTERNS);
  if (dep.found) return { detected: true, evidence: dep.evidence };
  const src = searchSourceFor([...AUTH_PATTERNS, ...AUTH_SOURCE_KEYWORDS]);
  if (src.found) return { detected: true, evidence: src.evidence };
  return { detected: false, evidence: null };
}

function detectPaid() {
  const dep = checkDeps(PAID_PATTERNS);
  if (dep.found) return { detected: true, evidence: dep.evidence };
  const src = searchSourceFor(PAID_PATTERNS);
  if (src.found) return { detected: true, evidence: src.evidence };
  return { detected: false, evidence: null };
}

function findFirstFile(filename, maxDepth = 3) {
  const queue = [{ dir: PROJECT, depth: 0 }];
  while (queue.length) {
    const { dir, depth } = queue.shift();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile() && e.name === filename) return full;
      if (e.isDirectory() && depth < maxDepth && e.name !== "node_modules") {
        queue.push({ dir: full, depth: depth + 1 });
      }
    }
  }
  return null;
}

function detectPermissions() {
  const detected = [];
  const evidence = {};
  const infoPlist = findFirstFile("Info.plist");
  const plistText = infoPlist ? readTextSafe(infoPlist) : "";
  const manifest = findFirstFile("AndroidManifest.xml");
  const manifestText = manifest ? readTextSafe(manifest) : "";
  for (const [perm, keys] of Object.entries(PERMISSION_KEYS)) {
    if (plistText.includes(keys.ios)) {
      detected.push(perm);
      evidence[perm] = `${keys.ios} in Info.plist`;
      continue;
    }
    if (manifestText.includes(keys.android)) {
      detected.push(perm);
      evidence[perm] = `${keys.android} in AndroidManifest.xml`;
    }
  }
  return { detected, evidence: detected.length ? evidence : null };
}

function findRouteSegment(rootDir, segmentName, maxDepth) {
  const queue = [{ dir: rootDir, depth: 0 }];
  while (queue.length) {
    const { dir, depth } = queue.shift();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const baseName = e.name.replace(/\.(tsx?|jsx?)$/, "");
      if (baseName === segmentName) return full;
      if (e.isDirectory() && depth < maxDepth && e.name !== "node_modules") {
        queue.push({ dir: full, depth: depth + 1 });
      }
    }
  }
  return null;
}

function detectUgc() {
  // Schema files
  const candidates = [
    path.join(PROJECT, "convex/schema.ts"),
    path.join(PROJECT, "prisma/schema.prisma"),
  ];
  for (const file of candidates) {
    const text = readTextSafe(file);
    if (!text) continue;
    for (const name of UGC_TABLE_NAMES) {
      const cap = name[0].toUpperCase() + name.slice(1);
      const re = new RegExp(`(?:^|\\s)${name}:|model\\s+${cap}\\s*\\{`, "m");
      if (re.test(text)) {
        return { detected: true, evidence: `${name} in ${path.basename(file)}` };
      }
    }
  }
  // Route segments — directories or files under app router / pages router
  for (const root of ROUTE_ROOTS) {
    const fullRoot = path.join(PROJECT, root);
    if (!fs.existsSync(fullRoot)) continue;
    for (const name of UGC_TABLE_NAMES) {
      const found = findRouteSegment(fullRoot, name, 3);
      if (found) {
        return {
          detected: true,
          evidence: `${name} as route segment (${path.relative(PROJECT, found)})`,
        };
      }
    }
  }
  return { detected: false, evidence: null };
}

const result = {
  authFlows: detectAuth(),
  paidContent: detectPaid(),
  sensitivePermissions: detectPermissions(),
  userGeneratedContent: detectUgc(),
};

process.stdout.write(JSON.stringify(result) + "\n");
process.exit(0);
