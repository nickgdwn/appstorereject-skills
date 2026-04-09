# Scripted Scan Pipeline Design

**Date:** 2026-04-09
**Status:** Approved
**Goal:** Replace agent-driven scan decision-making with API-served check definitions and thin Node.js scripts, achieving consistent scan results, lower token costs, and instant check updates without user reinstallation.

**Prerequisites:** Node.js 18+, curl, bash 4+

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
    native_ios: optional string,     // grep/glob/read instructions for this framework
    expo_managed: optional string,
    react_native_cli: optional string,
    native_android: optional string,
  },
  active: boolean,              // allows disabling without deletion
  order: number,                // sort order within section
}
```

Convex schema validator:
```typescript
executionRules: v.object({
  native_ios: v.optional(v.string()),
  expo_managed: v.optional(v.string()),
  react_native_cli: v.optional(v.string()),
  native_android: v.optional(v.string()),
})
```

Note: Adding a new framework (e.g., Flutter) requires a schema migration to add the key. This is acceptable — the framework list is stable and changes are infrequent.

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

Convex schema validator for `skipCondition`:
```typescript
skipCondition: v.object({
  allOf: v.array(v.union(
    v.object({ noImports: v.array(v.string()) }),
    v.object({ noDependencies: v.array(v.string()) }),
    v.object({ noFiles: v.array(v.string()) }),
  ))
})
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

### `GET /api/scan/checks?sections=privacy,payments,completeness&framework=expo_managed&platform=ios&scanToken=<token>`

Returns checks for one or more sections in a single request, filtered to the requested framework's execution rules. Checks where `platforms` doesn't include the requested platform are excluded.

**Auth:** Uses the `scanToken` from step 2 (`POST /api/scans/start`) rather than a separate Bearer token. The scanToken already proves the user is authorized for this scan — re-checking the API key on every section request is redundant. The endpoint validates that the scanToken exists, belongs to a started scan, and hasn't expired (1-hour window).

**`sections` parameter:** Accepts a comma-separated list of section names. The agent runs `evaluate-section.js` for all sections locally first, determines which to skip, then makes **one** API call for all non-skipped sections. This reduces per-scan API calls from 8 sequential round-trips to 3 total (graph + bulk checks + guides).

Response:
```json
{
  "framework": "expo_managed",
  "sections": {
    "privacy": {
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
    },
    "payments": {
      "checks": [...]
    }
  }
}
```

### Resolution Guides

Uses the existing `GET /api/rejections/batch?slugs=slug1,slug2,...` endpoint. No new endpoint needed — `collect-slugs.js` constructs the call and `format-report.js` merges the response with findings.

---

## Scripts

Four zero-dependency Node.js scripts in `skills/appstorereject-scan/scripts/`. Each writes JSON to stdout. Scripts that accept large payloads (findings, guides) read from temp files — never from CLI arguments — to avoid shell injection from codebase content appearing in findings.

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

### `evaluate-section.js <project-path> --graph-file <path-to-graph.json>`

Evaluates skip conditions for ALL sections in one invocation. The agent writes the graph API response to a temp file, then passes the file path. The script checks each section's skip condition against the project files and returns which sections to scan.

Each condition type maps to a concrete file check:
- `noImports` → grep source files for the listed patterns
- `noDependencies` → check package.json, Podfile, build.gradle
- `noFiles` → glob for the listed file patterns

Output:
```json
{
  "results": [
    { "section": "privacy", "skip": false, "reason": "Found axios in package.json dependencies" },
    { "section": "payments", "skip": true, "reason": "No StoreKit/react-native-iap in dependencies, no premium/subscribe keywords found" },
    { "section": "completeness", "skip": false, "reason": "Always checked" },
    { "section": "performance", "skip": true, "reason": "No background modes declared, binary under 50MB" },
    { "section": "design", "skip": false, "reason": "Custom UI components detected" },
    { "section": "legal", "skip": true, "reason": "No user-generated content, no age-restricted content" }
  ],
  "sectionsToScan": ["privacy", "completeness", "design"]
}
```

The agent uses `sectionsToScan` to construct the single bulk `scan/checks` API call.

### `collect-slugs.js --findings-file <path>`

Reads the agent's accumulated findings from a temp file. Extracts slugs for HIGH and MED findings where slug is not null.

Output:
```json
{
  "slugs": ["guideline-511-privacy-missing-privacy-manifest-2", "guideline-311-in-app-purchase-requirement-2"],
  "skipped": ["missing_accessibility_labels"],
  "skippedReason": "slug is null — no resolution guide available",
  "fetchCommand": "curl -s -H \"Authorization: Bearer $ASR_API_KEY\" \"https://api.appstorereject.com/api/rejections/batch?slugs=guideline-511-privacy-missing-privacy-manifest-2,guideline-311-in-app-purchase-requirement-2\""
}
```

### `format-report.js --findings-file <path> --guides-file <path>`

Reads findings and API guide responses from temp files. Merges them and produces the final output structure.

Includes a framework mapping for the analytics payload — maps the granular framework taxonomy (`expo_managed`, `expo_bare`, `native_ios`, `react_native_cli`, `native_android`) to the existing `scans` table values (`expo`, `react-native`, `native`) for backward compatibility with historical scan data.

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
  "analyticsPayload": {
    "scanToken": "...",
    "bundleId": "...",
    "platform": "ios",
    "framework": "expo",
    "findings": []
  }
}
```

Framework mapping (granular → scans table):
| Script value | `scans.framework` value |
|---|---|
| `expo_managed` | `expo` |
| `expo_bare` | `react-native` |
| `react_native_cli` | `react-native` |
| `native_ios` | `native` |
| `native_android` | `native` |

---

## Scan Flow

The agent executes this sequence. Each step is a script call or API curl — no architectural decisions. Total API calls: **3** (auth + bulk checks + guides), down from up to 8 sequential calls.

```
1. node detect-platform.js ./
   → Confirm framework, platforms, bundleId with user
   → Ask: first submission or update?

2. curl POST /api/scans/start (with bundleId, scanType, platform)
   → Save scanToken (or handle 403/401)

3. curl GET /api/scan/graph?platform=<detected>
   → Save graph response to /tmp/asr-graph.json

4. node evaluate-section.js ./ --graph-file /tmp/asr-graph.json
   → Get sectionsToScan list (all skip conditions evaluated locally in one pass)

5. curl GET /api/scan/checks?sections=<comma-separated>&framework=<detected>&platform=<detected>&scanToken=<token>
   → Get all non-skipped sections' checks in ONE request
   → Save response to /tmp/asr-checks.json

6. For each section in sectionsToScan order:
   a. Read section's checks from /tmp/asr-checks.json
   b. Execute each check's executionRule (Grep, Glob, Read against developer's project)
   c. Record findings using exact JSON fields (guideline, risk, findingTemplate, slug)
   d. Write accumulated findings to /tmp/asr-findings.json after each section

7. node collect-slugs.js --findings-file /tmp/asr-findings.json
   → Get fetchCommand

8. Run the fetchCommand from step 7
   → Save guides response to /tmp/asr-guides.json

9. node format-report.js --findings-file /tmp/asr-findings.json --guides-file /tmp/asr-guides.json
   → Get formatted output with framework-mapped analyticsPayload

10. For each guideSections entry, run codebaseContextPrompt searches
    → Fill in "In your codebase" subsections

11. Present findingsTable + guideSections + unguidedFindings to developer

12. curl POST /api/scans/complete with analyticsPayload from step 9
```

**Temp file cleanup:** Scripts write to `/tmp/asr-*.json`. The agent should remove these after step 12 (`rm /tmp/asr-*.json`). If the scan is interrupted, the files are harmless — they contain check metadata, not user code or secrets.

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
6. **Write vitest tests** — unit tests for all 4 scripts (mock fs for detect/evaluate, fixture JSON for collect/format)
7. **Rewrite SKILL.md** — streamlined script execution sequence
8. **Build `/admin/checks` page** — admin UI for editing check definitions, toggling active state, adjusting risk levels and execution rules (similar to existing `/admin/published` page)
9. **Delete markdown check files** — remove `references/checks-*.md` and `references/graph-*.md` from the skills repo. The Convex tables are the single source of truth. The markdown files served as the initial content source and should not be kept as "reference documentation" — that creates drift.
10. **Update README** — add Node.js 18+ to prerequisites
11. **End-to-end test** — run scan with new flow against a real project

---

## Risks

1. **Execution rules as strings** — the agent still interprets natural language instructions ("Grep for X, check Y"). This is intentional — fully structured tool commands would be more deterministic but much harder to author and maintain. The win is that the agent only sees one framework's rules instead of four.

2. **API dependency** — if the API is down, the scan already fails at step 2 (auth gate). This design doesn't introduce new failure modes. The bulk `scan/checks` endpoint reduces total API calls to 3 per scan (down from up to 8), so latency impact is minimal.

3. **Execution rule tampering** — the API returns instruction strings the agent executes as tool commands. If the `scanChecks` table were compromised, malicious execution rules could instruct the agent to read sensitive files. Mitigation: restrict `scanChecks` write access to admin users only, log all mutations via the existing audit log system.

4. **Shell injection via findings** — findings may contain content from the developer's codebase. Scripts accept JSON payloads via temp files (not CLI arguments) to eliminate shell escaping vulnerabilities.
