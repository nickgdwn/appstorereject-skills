---
name: appstorereject-scan
description: Proactive App Store and Google Play pre-submission scan. Checks your codebase for common rejection triggers before submitting an app for review. Use before first submission or app updates.
---

# Pre-Submission Scan

Scan the developer's codebase for common App Store and Google Play rejection triggers. All analysis happens locally — no code leaves the machine.

## Scan Lifecycle

### 1. Detect Platform & Framework

Check the project for these signals, in order:

| Signal | Framework | Platform |
|---|---|---|
| `app.json` or `app.config.js` with `"expo"` key | Expo | Check `platforms` field or ask |
| `react-native.config.js` or `"react-native"` in package.json dependencies | React Native CLI | Check for `ios/` and/or `android/` dirs |
| `.xcodeproj` or `.xcworkspace` (without react-native) | Native iOS | iOS |
| `build.gradle` with `android` namespace (without react-native) | Native Android | Android |

**Expo sub-detection:**
- If `ios/` and `android/` directories exist: Expo bare workflow (treat like RN CLI for native file access)
- If no `ios/`/`android/` dirs: Expo managed workflow (config lives in `app.json`)

If both iOS and Android targets detected, ask: "Scan iOS, Android, or both?"

### 2. Auto-Detect App Identity & Scan Type

Extract the bundle ID:
- **Native iOS:** `Info.plist` > `CFBundleIdentifier`
- **Expo:** `app.json` > `expo.ios.bundleIdentifier` or `expo.android.package`
- **React Native CLI:** `ios/<AppName>/Info.plist` or `android/app/build.gradle` > `applicationId`
- **Native Android:** `build.gradle` > `applicationId`

Confirm with the developer: "Detected bundle ID: `com.example.app`. Is this correct?"

Ask: "Is this your first submission to the App Store, or an update to an existing app?"

### 3. Auth Gate

Start the scan session (now that we have bundleId, scanType, and platform):
```
{baseDir}/../appstorereject/scripts/asr-api.sh POST "/api/scans/start" '{"bundleId":"<bundle_id>","scanType":"<first_submission|update>","platform":"<ios|android>"}'
```

- **200:** Proceed. Save the `scanToken` from the response.
- **403:** Show the error message to the developer (scan limit reached or app limit reached). Include the upgrade URL from the response.
- **401:** API key not set. Tell the developer to set up authentication (see hub skill instructions).

### 4. Load Platform Graph

Based on detected platform, read the appropriate graph:
- iOS: `{baseDir}/references/graph-ios.md`
- Android: `{baseDir}/references/graph-android.md`

The graph defines which sections to check and in what order. Each section has skip conditions — evaluate them before loading the section's checks.

### 5. Walk the Graph

For each section in the graph (unless skip condition is met):
1. Read the section's check file: `{baseDir}/references/checks-<section>.md`
2. Follow the framework-specific subsection matching step 1's detection
3. **Execute EVERY check in the section** (use Grep, Glob, Read tools to inspect the codebase). Do NOT skip checks — evaluate all of them and only record a finding if the check triggers.
4. Record findings using the **exact values from the check definition**:
   - `guidelineCode`: Use the `Guideline:` value from the check definition
   - `risk`: Use the `Risk:` value from the check definition exactly (HIGH, MED, or LOW). **Do NOT override this with your own judgment.**
   - `checkId`: The check identifier (e.g., "missing_privacy_manifest")
   - `finding`: Use the `Finding template:` from the check definition, filling in any `{placeholders}` with values from your analysis
   - `slug`: Copy the `Slug:` value from the check definition **exactly as written** (e.g., `guideline-511-privacy-missing-privacy-manifest-2`). This is required for Step 6. If the check has `Slug: —`, record `—`.
   - `context`: A description following the check's Context Template (max 200 chars, NO code snippets, NO file paths with usernames)

**Do NOT invent findings that aren't in the check definitions.** If you notice something concerning that has no matching check, mention it in a separate "Additional observations" section after the main table — not as a numbered finding.

**Only load reference files for sections the graph reaches.** Skip sections whose skip condition is met.

### 5b. Verify Findings

Before presenting results, cross-reference your findings against the check definitions:
1. For each finding, confirm the `Risk` level matches the check definition's `Risk:` field
2. Confirm the `Guideline` matches the check definition's `Guideline:` field
3. Confirm the `Finding` text follows the check's `Finding template:`
4. Confirm each finding has a `slug` value copied from the check definition (either a real slug or `—`)
5. Remove any findings that don't correspond to a defined check (move to "Additional observations")

### 6. Fetch & Present Resolution Guides (CRITICAL — THIS IS THE PRIMARY OUTPUT)

Resolution guides from the API are the **primary value** of this scan. The findings table alone is NOT sufficient. You MUST fetch and display the API's resolution steps. Do NOT skip this step. Do NOT substitute your own resolution advice.

**6a. Present the findings table** sorted by risk (HIGH first, then MED, then LOW):

```
| # | Guideline | Risk | Finding |
|---|-----------|------|---------|
| 1 | 5.1.1     | HIGH | PrivacyInfo.xcprivacy missing — required since Spring 2024 |
| 2 | 3.1.1     | HIGH | External payment URLs or SDKs found |
| 3 | 2.1       | MED  | 3 placeholder/TODO instances in user-facing code |
```

**6b. Collect the `slug` values you recorded in Step 5.** Filter to HIGH and MED findings where slug is not `—`. These slugs come directly from the check definition files — you already recorded them. Do NOT guess, invent, or modify slug values.

Example slugs (from check definitions): `guideline-511-privacy-missing-privacy-manifest-2`, `guideline-21-app-completeness-placeholder-content-still-present-2`

**6c. Batch-fetch resolution guides:**
```
{baseDir}/../appstorereject/scripts/asr-api.sh GET "/api/rejections/batch?slugs=<slug1>,<slug2>,..."
```

Use a **single comma-separated request** with all collected slugs.

**6d. Validate the response:**

The response returns `{"data": [...]}`. Handle these cases:

1. **Empty response `{"data":[]}` means the slugs didn't match.** This is unexpected since slugs come from the check definitions. Tell the developer: "Resolution guides could not be fetched — the API returned no matches for the recorded slugs. The findings table above lists your issues, but detailed resolution steps are unavailable." Do NOT silently substitute your own resolution steps.

2. **Response items missing `resolutionSteps` field** means the request was **unauthenticated**. Tell the developer: "Resolution guides require an API key. Run `appstorereject --setup` to configure authentication, then re-scan."

3. **Partial matches** (some slugs returned data, others didn't) — show resolution guides for matched ones. For unmatched slugs, note: "No resolution guide available yet for: {check_name}. See appstorereject.com for updates."

**⚠️ FAILURE MODE TO AVOID:** If the API returns a large response or the batch request returns empty, you may be tempted to skip reading the response and write your own advice instead. **Do not do this.** The API response IS the product. Read it, parse it, and present it. If the response is genuinely empty after using the correct slugs from the check definitions, say so — do not cover the gap with generated advice.

**6e. Display resolution guides for each finding:**

For each finding that has a matching API response with `resolutionSteps`:
1. **Show `resolutionSteps` verbatim** — they are a markdown string. Display directly as formatted text. Do NOT paraphrase, summarize, or rewrite them.
2. After the verbatim steps, add a **"In your codebase"** subsection with context specific to the developer's project (e.g., which file to edit, what value to set)
3. If a `prevention` section exists in the steps, include it

For findings where slug is `—` (no resolution guide exists in the database yet), provide brief fix guidance based on the check definition and note: "A full community-tested resolution guide is not yet available for this check."

**NEVER silently replace API resolution guides with your own generated steps.** The API guides are community-maintained and contain tested, specific advice. Your role is to present them verbatim and add codebase-specific context — not to replace them.

### 7. Report Analytics

After presenting findings:
```
{baseDir}/../appstorereject/scripts/asr-api.sh POST "/api/scans/complete" '<json>'
```

JSON body:
```json
{
  "scanToken": "<from step 3>",
  "bundleId": "<detected>",
  "platform": "ios|android",
  "framework": "native|expo|react-native",
  "findings": [
    {"guidelineCode": "5.1.1", "confidence": "high", "checkId": "missing_privacy_manifest", "context": "PrivacyInfo.xcprivacy missing"}
  ]
}
```

If this call fails, tell the developer: "Scan results were not recorded to your dashboard, but your findings are shown above."
