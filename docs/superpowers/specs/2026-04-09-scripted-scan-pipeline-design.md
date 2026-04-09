# Scripted Scan Pipeline Design

**Date:** 2026-04-09
**Status:** Approved
**Goal:** Replace agent-driven scan decision-making with API-served check definitions and thin Node.js scripts, achieving consistent scan results, lower token costs, and instant check updates without user reinstallation.

---

## Problem

The current scan skill loads markdown check definitions containing all 4 framework subsections (~1,633 lines across 6 files) into the agent's context. The agent reasons about platform detection, skip conditions, finding formatting, slug collection, and output assembly. This causes:

1. **Inconsistent results** — the agent sees content for all frameworks and occasionally mixes platform-specific patterns (e.g., iOS patterns in an Expo scan)
2. **High token cost** — ~80-120K tokens per full scan, with ~70% of loaded check content irrelevant to the detected framework
3. **Resolution guides skipped or substituted** — the agent sometimes forgets the batch-fetch step or generates its own advice instead of presenting API guides verbatim
4. **Stale check definitions** — skills packages cache at install time; updating checks requires users to re-run `npx skills add`

## Approach

**API-Served Check Graph (Approach A):** Check definitions, graph ordering, and skip conditions move to Convex tables served via new API endpoints. The skills package ships 4 thin Node.js scripts that handle deterministic logic (platform detection, skip evaluation, slug collection, report formatting). The agent becomes a script runner that executes grep patterns from API-served JSON and adds codebase-specific context.

---

## Data Model

### `scanChecks` table

Stores individual check definitions. Each check belongs to a section and contains execution rules keyed by framework.

```typescript
{
  checkId: string,              // unique identifier, e.g. "missing_privacy_manifest"
  section: string,              // groups checks, e.g. "privacy", "payments"
  guideline: string,            // guideline code, e.g. "5.1.1"
  risk: "HIGH" | "MED" | "LOW",
  confidence: "HIGH" | "MEDIUM" | "LOW",
  findingTemplate: string,      // e.g. "PrivacyInfo.xcprivacy missing — required since Spring 2024"
  contextTemplate: string,      // template with {placeholders} for context field
  slug: string | null,          // links to rejections table for resolution guides
  platforms: string[],          // ["ios"], ["android"], or ["ios", "android"]
  executionRules: {
    native_ios?: string,        // grep/glob/read instructions for this framework
    expo_managed?: string,
    react_native_cli?: string,
    native_android?: string,
  },
  active: boolean,              // allows disabling without deletion
  order: number,                // sort order within section
}
```

### `scanGraph` table

Stores the section walk order per platform with structured skip conditions.

```typescript
{
  platform: "ios" | "android",
  section: string,              // matches scanChecks.section
  priority: "HIGH" | "MEDIUM" | "LOW",
  order: number,                // walk order
  label: string,                // human-readable, e.g. "Privacy (Guidelines 5.1.x)"
  skipCondition: {
    allOf: Array<
      | { noImports: string[] }       // none of these import patterns found in source
      | { noDependencies: string[] }  // none of these in package.json/Podfile/build.gradle
      | { noFiles: string[] }         // none of these file patterns exist
    >
  },
  active: boolean,
}
```

**Key decisions:**
- `executionRules` values are human-readable instruction strings (not structured tool commands) — the agent interprets "Grep for X, check Y" but only sees one framework's rules
- `skipCondition` is structured JSON so scripts can evaluate it deterministically
- `slug` links checks to the existing rejections table for resolution guide fetching
- `platforms` array allows checks to be iOS-only, Android-only, or both

---

## API Endpoints

Two new endpoints added to Convex HTTP actions in `http.ts`.

### `GET /api/scan/graph?platform=ios`

Returns ordered section list with structured skip conditions. **No auth required** — graph structure is not sensitive, and the agent needs it before the auth gate to plan the scan.

Response:
```json
{
  "platform": "ios",
  "sections": [
    {
      "section": "privacy",
      "label": "Privacy (Guidelines 5.1.x)",
      "priority": "HIGH",
      "order": 1,
      "skipCondition": {
        "allOf": [
          { "noImports": ["fetch", "axios", "URLSession", "Alamofire"] },
          { "noDependencies": ["firebase", "analytics", "sentry"] },
          { "noFiles": ["PrivacyInfo.xcprivacy"] }
        ]
      }
    }
  ]
}
```

### `GET /api/scan/checks?section=privacy&framework=expo_managed&platform=ios`

Returns checks for a section, filtered to the requested framework's execution rules. Checks where `platforms` doesn't include the requested platform are excluded. **Auth required** — execution rules are the product's value.

Response:
```json
{
  "section": "privacy",
  "framework": "expo_managed",
  "checks": [
    {
      "checkId": "missing_privacy_manifest",
      "guideline": "5.1.1",
      "risk": "HIGH",
      "findingTemplate": "PrivacyInfo.xcprivacy missing — required since Spring 2024",
      "contextTemplate": "No PrivacyInfo.xcprivacy found in project...",
      "slug": "guideline-511-privacy-missing-privacy-manifest-2",
      "executionRule": "Read app.json or app.config.js / app.config.ts\nCheck for expo.ios.privacyManifests key\nIf missing, flag. If present, verify NSPrivacyAccessedAPITypes array is non-empty\nExpo SDK 51+ auto-generates a privacy manifest, but custom API usage still requires declaration"
    }
  ]
}
```

### Resolution Guides

Uses the existing `GET /api/rejections/batch?slugs=slug1,slug2,...` endpoint. No new endpoint needed — `collect-slugs.js` constructs the call and `format-report.js` merges the response with findings.

---

## Scripts

Four Node.js scripts in `skills/appstorereject-scan/scripts/`. Each takes CLI args or stdin, writes JSON to stdout.

### `detect-platform.js <project-path>`

Runs locally. No API call. Checks project files in priority order:

1. `app.json` with `"expo"` key → check for `ios/` and `android/` dirs → `expo_managed` or `expo_bare`
2. `react-native.config.js` or `"react-native"` in `package.json` → `react_native_cli`
3. `.xcodeproj` or `.xcworkspace` (without react-native) → `native_ios`
4. `build.gradle` with android namespace (without react-native) → `native_android`

Extracts bundleId from the appropriate config file.

Output:
```json
{
  "framework": "expo_managed",
  "platforms": ["ios", "android"],
  "bundleId": "com.example.myapp",
  "detectedFiles": {
    "appJson": true,
    "packageJson": true,
    "iosDir": false,
    "androidDir": false,
    "xcodeproj": false,
    "buildGradle": false
  }
}
```

`detectedFiles` is included so skip conditions can reference file existence without additional lookups.

### `evaluate-section.js <project-path> --section <name> --skip-condition '<json>'`

Takes a skip condition from the graph API response and evaluates it against the project files. Each condition type maps to a concrete file check:
- `noImports` → grep source files for the listed patterns
- `noDependencies` → check package.json, Podfile, build.gradle
- `noFiles` → glob for the listed file patterns

Output:
```json
{
  "section": "privacy",
  "skip": false,
  "reason": "Found axios in package.json dependencies"
}
```

### `collect-slugs.js --findings '<findings-json>'`

Takes the agent's accumulated findings array and extracts slugs for HIGH and MED findings where slug is not null.

Output:
```json
{
  "slugs": ["guideline-511-privacy-missing-privacy-manifest-2", "guideline-311-in-app-purchase-requirement-2"],
  "skipped": ["missing_accessibility_labels"],
  "skippedReason": "slug is null — no resolution guide available",
  "fetchCommand": "curl -s -H \"Authorization: Bearer $ASR_API_KEY\" \"https://api.appstorereject.com/api/rejections/batch?slugs=guideline-511-privacy-missing-privacy-manifest-2,guideline-311-in-app-purchase-requirement-2\""
}
```

### `format-report.js --findings '<findings-json>' --guides '<guides-json>'`

Merges findings with API guide responses and produces the final output structure.

Output:
```json
{
  "findingsTable": "| # | Guideline | Risk | Finding |\n|---|---|---|---|\n| 1 | 5.1.1 | HIGH | ...",
  "guideSections": [
    {
      "finding": "PrivacyInfo.xcprivacy missing...",
      "guideline": "5.1.1",
      "risk": "HIGH",
      "resolutionSteps": "## Step 1: Create PrivacyInfo.xcprivacy\n...",
      "prevention": "Add a CI check...",
      "codebaseContextPrompt": "Search the developer's project for: PrivacyInfo.xcprivacy, app.json privacyManifests config. Report what you find."
    }
  ],
  "unguidedFindings": [
    { "checkId": "missing_accessibility_labels", "note": "No community guide available yet" }
  ],
  "analyticsPayload": { "scanToken": "...", "bundleId": "...", "findings": [] }
}
```

---

## Scan Flow

The agent executes this sequence. Each step is a script call or API curl — no architectural decisions.

```
1. node detect-platform.js ./
   → Confirm framework, platforms, bundleId with user
   → Ask: first submission or update?

2. curl POST /api/scans/start (with bundleId, scanType, platform)
   → Save scanToken (or handle 403/401)

3. curl GET /api/scan/graph?platform=<detected>
   → Get ordered section list

4. For each section in order:
   a. node evaluate-section.js ./ --section <name> --skip-condition '<json>'
      → If skip: true, move to next section
   b. curl GET /api/scan/checks?section=<name>&framework=<detected>&platform=<detected>
      → Get checks with single-framework execution rules
   c. Execute each check's executionRule (Grep, Glob, Read against developer's project)
   d. Record findings using exact JSON fields (guideline, risk, findingTemplate, slug)

5. node collect-slugs.js --findings '<accumulated-findings>'
   → Get fetchCommand

6. Run the fetchCommand from step 5
   → Get resolution guides from API

7. node format-report.js --findings '<findings>' --guides '<guides-response>'
   → Get formatted output

8. For each guideSections entry, run codebaseContextPrompt searches
   → Fill in "In your codebase" subsections

9. Present findingsTable + guideSections + unguidedFindings to developer

10. curl POST /api/scans/complete with analyticsPayload
```

---

## Updated SKILL.md

The scan SKILL.md reduces from ~156 lines to ~60-70 lines. It becomes a script execution sequence with these key instructions:

- Run scripts in order, read JSON output, proceed to next step
- When executing `executionRule` strings: use Grep, Glob, Read tools against the developer's project
- Record findings using exact field values from the check JSON — do not override risk, guideline, or slug
- Present `resolutionSteps` from format-report output verbatim — do not paraphrase or substitute
- Fill in "In your codebase" using the `codebaseContextPrompt` for each guided finding
- For `unguidedFindings`: note that no community guide exists yet, provide brief guidance from the check's contextTemplate

All platform detection logic, skip condition evaluation, finding format rules, slug collection, and output formatting are handled by scripts — not by the agent.

---

## Resolve Skill Impact

The resolve skill (`appstorereject-resolve`) stays mostly unchanged — it's already a linear flow (extract code → fetch by guideline code → display → plan fixes). One enhancement: when the resolve skill fetches a rejection, the response can include the structured `executionRule` for the detected framework from the `scanChecks` table, giving the agent concrete search patterns for the "Plan Fix in Codebase Context" step instead of relying on the generic `resolution-workflow.md`.

---

## Token Impact

Comparing a full 6-section iOS scan on an Expo managed project:

| Component | Current | With scripts | Savings |
|---|---|---|---|
| SKILL.md | ~3,000 | ~1,200 | 1,800 |
| Graph file | ~800 | ~200 (JSON) | 600 |
| Check files (6 sections, all frameworks) | ~12,000 | ~3,500 (1 framework) | 8,500 |
| Agent reasoning: platform detection | ~1,500 | ~200 | 1,300 |
| Agent reasoning: skip conditions | ~2,000 | ~300 | 1,700 |
| Agent reasoning: finding format | ~1,500 | ~400 | 1,100 |
| Agent reasoning: slug collection | ~800 | ~100 | 700 |
| Agent reasoning: output formatting | ~1,000 | ~200 | 800 |
| **Total overhead** | **~22,600** | **~6,100** | **~16,500 (73%)** |

Full scan token cost (including grep/glob execution, API responses, and presentation) estimated to drop from **80-120K to 30-50K**.

---

## Migration Path

1. **Parse existing markdown** — migration script reads 6 `checks-*.md` files, extracts each check into structured JSON
2. **Seed `scanChecks` table** — insert 47 checks with execution rules split by framework
3. **Seed `scanGraph` table** — 12 entries (6 sections x 2 platforms) with structured skip conditions
4. **Deploy new API endpoints** — `scan/graph` and `scan/checks` as Convex HTTP actions
5. **Write and test scripts** — 4 Node.js scripts in `skills/appstorereject-scan/scripts/`
6. **Rewrite SKILL.md** — streamlined script execution sequence
7. **End-to-end test** — run scan with new flow against a real project

Existing markdown files remain in the repo as reference documentation but are no longer read during scans.

---

## Risks

1. **Execution rules as strings** — the agent still interprets natural language instructions ("Grep for X, check Y"). This is intentional — fully structured tool commands would be more deterministic but much harder to author and maintain. The win is that the agent only sees one framework's rules instead of four.

2. **API dependency** — if the API is down, the scan already fails at step 2 (auth gate). This design doesn't introduce new failure modes but does increase the number of API calls per scan (graph + checks per section). Latency impact is minimal since each call returns small JSON payloads.
