---
name: appstorereject-scan
description: Proactive App Store and Google Play pre-submission scan. Checks your codebase for common rejection triggers before submitting an app for review. Use before first submission or app updates.
---

# Pre-Submission Scan

Scan the developer's codebase for common App Store and Google Play rejection triggers. All analysis happens locally — no code leaves the machine. Check definitions are served by the API for up-to-date coverage.

## Scan Lifecycle

Execute these steps in order. Each step is a script call or API curl. Do NOT skip steps. Do NOT dispatch subagents.

### 1. Detect Platform & Framework

```bash
node {baseDir}/scripts/detect-platform.js ./
```

Read the JSON output. Confirm with the developer:
- "Detected **{framework}** targeting **{platforms}**. Bundle ID: `{bundleId}`. Is this correct?"
- Ask: "Is this your first submission or an update?"
- If both iOS and Android detected, ask: "Scan iOS, Android, or both?"

### 2. Auth Gate

Start the scan session:
```bash
curl -s -X POST -H "Authorization: Bearer $ASR_API_KEY" -H "Content-Type: application/json" -d '{"bundleId":"<bundleId>","scanType":"<first_submission|update>","platform":"<ios|android>"}' "https://api.appstorereject.com/api/scans/start"
```

- **200:** Save `scanToken` from response.
- **403:** Show error to developer (scan/app limit reached). Include upgrade URL.
- **401:** API key not set. Tell developer to run setup (see hub skill).

### 3. Load Graph

```bash
curl -s "https://api.appstorereject.com/api/scan/graph?platform=<detected>" > /tmp/asr-graph.json
```

### 4. Evaluate Skip Conditions

```bash
node {baseDir}/scripts/evaluate-section.js ./ --graph-file /tmp/asr-graph.json
```

Read the JSON output. Note `sectionsToScan` — these are the sections to load checks for.

### 5. Load Checks (Single Request)

```bash
curl -s "https://api.appstorereject.com/api/scan/checks?sections=<comma-separated-sectionsToScan>&framework=<detected>&platform=<detected>&scanToken=<token>" > /tmp/asr-checks.json
```

### 6. Execute Checks

For each section in `sectionsToScan` order, read that section's checks from `/tmp/asr-checks.json`.

For each check in the section:
1. Execute the `executionRule` field — it contains Grep, Glob, and Read instructions. Run them against the developer's project.
2. If the check triggers (the condition described in the execution rule is met), record a finding:
   - `guideline`: from the check's `guideline` field — **do NOT override**
   - `risk`: from the check's `risk` field — **do NOT override**
   - `finding`: from the check's `findingTemplate` field, filling in `{placeholders}` from your analysis
   - `slug`: from the check's `slug` field — **copy exactly** (or `null` if absent)
   - `checkId`: from the check's `checkId` field
   - `context`: following the check's `contextTemplate` (max 200 chars, no code snippets, no file paths with usernames)
3. If the check does NOT trigger, move to the next check silently.

After all sections are complete, write findings to temp file:
```bash
# Write the findings array as JSON to /tmp/asr-findings.json
```

**Do NOT invent findings that aren't in the check definitions.** If you notice something concerning without a matching check, mention it in a separate "Additional observations" section after the main output.

### 7. Collect Slugs

```bash
node {baseDir}/scripts/collect-slugs.js --findings-file /tmp/asr-findings.json
```

### 8. Fetch Resolution Guides

Run the `fetchCommand` from step 7's output:
```bash
# Execute the exact fetchCommand string from collect-slugs output
# Save response to /tmp/asr-guides.json
```

If `fetchCommand` is null (no slugs to fetch), skip to step 9 with no guides file.

### 9. Format Report

```bash
node {baseDir}/scripts/format-report.js --findings-file /tmp/asr-findings.json --guides-file /tmp/asr-guides.json
```

### 10. Present Results

Read `format-report.js` output:

1. Show the `findingsTable` to the developer.
2. For each entry in `guideSections`:
   - Display `resolutionSteps` **verbatim** — do NOT paraphrase, summarize, or rewrite
   - Run the `codebaseContextPrompt` to search the developer's project for relevant files
   - Add an **"In your codebase"** subsection with what you found
   - Include `prevention` section if present
3. For each entry in `unguidedFindings`:
   - Note the finding and that no community guide is available yet
   - Provide brief guidance based on the finding details

**NEVER silently replace API resolution guides with your own generated steps.** The API guides are community-maintained. Your role: present them verbatim and add codebase context.

### 11. Report Analytics

```bash
curl -s -X POST -H "Authorization: Bearer $ASR_API_KEY" -H "Content-Type: application/json" -d '<analyticsPayload from format-report output>' "https://api.appstorereject.com/api/scans/complete"
```

### 12. Cleanup

```bash
rm -f /tmp/asr-graph.json /tmp/asr-checks.json /tmp/asr-findings.json /tmp/asr-guides.json
```
