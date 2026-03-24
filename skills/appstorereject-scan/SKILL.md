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
   - `context`: A description following the check's Context Template (max 200 chars, NO code snippets, NO file paths with usernames)

**Do NOT invent findings that aren't in the check definitions.** If you notice something concerning that has no matching check, mention it in a separate "Additional observations" section after the main table — not as a numbered finding.

**Only load reference files for sections the graph reaches.** Skip sections whose skip condition is met.

### 5b. Verify Findings

Before presenting results, cross-reference your findings against the check definitions:
1. For each finding, confirm the `Risk` level matches the check definition's `Risk:` field
2. Confirm the `Guideline` matches the check definition's `Guideline:` field
3. Confirm the `Finding` text follows the check's `Finding template:`
4. Remove any findings that don't correspond to a defined check (move to "Additional observations")

### 6. Report to Developer

Present findings as a summary table, sorted by risk (HIGH first, then MED, then LOW):

```
| # | Guideline | Risk | Finding |
|---|-----------|------|---------|
| 1 | 5.1.1     | HIGH | PrivacyInfo.xcprivacy missing — required since Spring 2024 |
| 2 | 3.1.1     | HIGH | External payment URLs or SDKs found |
| 3 | 2.1       | MED  | 3 placeholder/TODO instances in user-facing code |
```

For HIGH and MEDIUM confidence findings, batch-fetch resolution details using the guideline codes from step 5:
```
{baseDir}/../appstorereject/scripts/asr-api.sh GET "/api/rejections/batch?codes=<code1>,<code2>,..."
```

Example: `?codes=5.1.1,2.1,3.1.1` — the API accepts guideline codes directly (up to 10). You can also use `?slugs=<slug1>,<slug2>` if you have exact slugs from a prior search.

The response returns `{"data": [...]}` where each item may include:
- `resolutionSteps` — a **markdown string** (not an array). Display it directly as formatted text.
- `solutions` — community-submitted solutions (authenticated requests only)
- `exampleEmail` — example rejection email text

**Displaying results:** For each finding, if the batch response included a matching entry:
1. Show the resolution steps verbatim (they are already formatted markdown with numbered steps)
2. Add context specific to the developer's codebase (e.g., which file to edit, what value to set)
3. If a `prevention` section exists in the steps, include it

If a finding's guideline code returned no match from the API, provide your own fix guidance based on the check definition. For LOW confidence findings, give a brief explanation and link to the full guide at appstorereject.com.

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
