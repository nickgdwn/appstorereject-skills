#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const args = process.argv.slice(2);
const projectPath = args[0] || ".";
let graphFilePath = null;

for (let i = 1; i < args.length; i++) {
  if (args[i] === "--graph-file" && args[i + 1]) {
    graphFilePath = args[i + 1];
    i++;
  }
}

if (!graphFilePath) {
  process.stderr.write("Usage: evaluate-section.js <project-path> --graph-file <path>\n");
  process.exit(1);
}

let graph;
try {
  graph = JSON.parse(fs.readFileSync(graphFilePath, "utf8"));
} catch (e) {
  process.stderr.write(`Error reading graph file: ${e.message}\n`);
  process.exit(1);
}

// Reject patterns with shell-unsafe characters (only allow alphanumeric, dots, stars, hyphens, underscores, slashes, spaces)
const SAFE_PATTERN = /^[a-zA-Z0-9_.*?\-\/ @<>:{}()+,]+$/;
function sanitizePattern(p) {
  if (typeof p !== "string" || !SAFE_PATTERN.test(p)) return null;
  return p;
}

function grepProject(patterns) {
  for (const pattern of patterns) {
    const safe = sanitizePattern(pattern);
    if (!safe) continue;
    try {
      const cmd = `grep -rl ${JSON.stringify(safe)} ${JSON.stringify(projectPath)} --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.swift" --include="*.m" --include="*.h" --include="*.kt" --include="*.java" --include="*.xml" --include="*.json" -m 1 2>/dev/null`;
      const result = execSync(cmd, { encoding: "utf8", timeout: 10000 });
      if (result.trim()) return { found: true, pattern, file: result.trim().split("\n")[0] };
    } catch {}
  }
  return { found: false };
}

function checkDependencies(patterns) {
  const depFiles = [
    "package.json", "ios/Podfile", "ios/Podfile.lock",
    "android/app/build.gradle", "Podfile", "app/build.gradle",
  ];
  for (const file of depFiles) {
    try {
      const content = fs.readFileSync(path.join(projectPath, file), "utf8").toLowerCase();
      for (const pattern of patterns) {
        if (content.includes(pattern.toLowerCase())) {
          return { found: true, pattern, file };
        }
      }
    } catch {}
  }
  return { found: false };
}

function checkFiles(patterns) {
  for (const pattern of patterns) {
    const safe = sanitizePattern(pattern);
    if (!safe) continue;
    try {
      const cmd = `find ${JSON.stringify(projectPath)} -name ${JSON.stringify(safe)} -maxdepth 5 2>/dev/null | head -1`;
      const result = execSync(cmd, { encoding: "utf8", timeout: 5000 });
      if (result.trim()) return { found: true, pattern, file: result.trim() };
    } catch {}
  }
  return { found: false };
}

const results = [];
const sectionsToScan = [];

for (const section of graph.sections) {
  const conditions = section.skipCondition?.allOf || [];

  if (conditions.length === 0) {
    results.push({ section: section.section, skip: false, reason: "Always checked" });
    sectionsToScan.push(section.section);
    continue;
  }

  let allMet = true;
  let failReason = "";

  for (const condition of conditions) {
    if (condition.noImports) {
      const result = grepProject(condition.noImports);
      if (result.found) { allMet = false; failReason = `Found ${result.pattern} in ${result.file}`; break; }
    }
    if (condition.noDependencies) {
      const result = checkDependencies(condition.noDependencies);
      if (result.found) { allMet = false; failReason = `Found ${result.pattern} in ${result.file}`; break; }
    }
    if (condition.noFiles) {
      const result = checkFiles(condition.noFiles);
      if (result.found) { allMet = false; failReason = `Found ${result.pattern} at ${result.file}`; break; }
    }
  }

  if (allMet) {
    results.push({ section: section.section, skip: true, reason: `No matching imports, dependencies, or files found for ${section.label}` });
  } else {
    results.push({ section: section.section, skip: false, reason: failReason });
    sectionsToScan.push(section.section);
  }
}

process.stdout.write(JSON.stringify({ results, sectionsToScan }, null, 2) + "\n");
