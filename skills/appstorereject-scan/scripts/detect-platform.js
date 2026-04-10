#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const projectPath = process.argv[2] || ".";

function fileExists(relativePath) {
  return fs.existsSync(path.join(projectPath, relativePath));
}

function dirExists(relativePath) {
  try {
    return fs.statSync(path.join(projectPath, relativePath)).isDirectory();
  } catch {
    return false;
  }
}

function readJson(relativePath) {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(projectPath, relativePath), "utf8")
    );
  } catch {
    return null;
  }
}

function findFiles(pattern) {
  const { execSync } = require("child_process");
  try {
    const result = execSync(
      `find ${JSON.stringify(projectPath)} -name "${pattern}" -maxdepth 3 2>/dev/null`,
      { encoding: "utf8", timeout: 5000 }
    );
    return result.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

const detectedFiles = {
  appJson: fileExists("app.json") || fileExists("app.config.js") || fileExists("app.config.ts"),
  packageJson: fileExists("package.json"),
  iosDir: dirExists("ios"),
  androidDir: dirExists("android"),
  xcodeproj: findFiles("*.xcodeproj").length > 0 || findFiles("*.xcworkspace").length > 0,
  buildGradle: fileExists("android/app/build.gradle") || fileExists("app/build.gradle") || fileExists("build.gradle.kts"),
};

const pkg = readJson("package.json");
const appJson = readJson("app.json");

let framework = null;
let platforms = [];
let bundleId = null;

// 1. Expo detection
if (appJson && appJson.expo) {
  if (detectedFiles.iosDir || detectedFiles.androidDir) {
    framework = "expo_bare";
  } else {
    framework = "expo_managed";
  }
  if (appJson.expo.ios) platforms.push("ios");
  if (appJson.expo.android) platforms.push("android");
  if (platforms.length === 0) platforms = ["ios", "android"];
  bundleId = appJson.expo.ios?.bundleIdentifier || appJson.expo.android?.package || null;
}

// 2. React Native CLI
if (!framework && pkg) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps["react-native"] || fileExists("react-native.config.js") || fileExists("react-native.config.ts")) {
    framework = "react_native_cli";
    if (detectedFiles.iosDir) platforms.push("ios");
    if (detectedFiles.androidDir) platforms.push("android");
    if (detectedFiles.iosDir) {
      const infoPlistFiles = findFiles("Info.plist").filter((f) => f.includes("/ios/"));
      for (const plist of infoPlistFiles) {
        try {
          const content = fs.readFileSync(plist, "utf8");
          const match = content.match(/<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/);
          if (match && !match[1].includes("$")) { bundleId = match[1]; break; }
        } catch {}
      }
    }
    if (!bundleId && detectedFiles.androidDir) {
      for (const gf of ["android/app/build.gradle", "android/app/build.gradle.kts"]) {
        try {
          const content = fs.readFileSync(path.join(projectPath, gf), "utf8");
          const match = content.match(/applicationId\s+["']([^"']+)["']/);
          if (match) { bundleId = match[1]; break; }
        } catch {}
      }
    }
  }
}

// 3. Native iOS
if (!framework && detectedFiles.xcodeproj && !pkg?.dependencies?.["react-native"]) {
  framework = "native_ios";
  platforms = ["ios"];
  const infoPlistFiles = findFiles("Info.plist");
  for (const plist of infoPlistFiles) {
    try {
      const content = fs.readFileSync(plist, "utf8");
      const match = content.match(/<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/);
      if (match && !match[1].includes("$")) { bundleId = match[1]; break; }
    } catch {}
  }
}

// 4. Native Android
if (!framework && detectedFiles.buildGradle && !pkg?.dependencies?.["react-native"]) {
  framework = "native_android";
  platforms = ["android"];
  for (const gf of ["android/app/build.gradle", "app/build.gradle", "app/build.gradle.kts", "build.gradle.kts"]) {
    try {
      const content = fs.readFileSync(path.join(projectPath, gf), "utf8");
      const match = content.match(/applicationId\s+["']([^"']+)["']/);
      if (match) { bundleId = match[1]; break; }
    } catch {}
  }
}

process.stdout.write(JSON.stringify({
  framework: framework || "unknown",
  platforms,
  bundleId,
  detectedFiles,
}, null, 2) + "\n");
