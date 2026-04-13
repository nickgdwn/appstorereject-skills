---
name: appstorereject-resolve
description: Resolve App Store or Google Play rejections. Look up rejection by guideline code, get resolution steps, plan fixes in your codebase, or generate an appeal letter.
---

# Resolve App Store Rejection

Help the developer resolve a rejection they've received from Apple or Google.

## Step 0: Resolve API Key

Before any authenticated API call, resolve the API key. Check in this order:

1. Run `echo $ASR_API_KEY` — if non-empty, use that value
2. If empty, read `~/.appstorereject/config.json` with the Read tool and extract the `apiKey` field value

**Store the resolved key in your working memory.** You will use it directly in curl commands throughout this session. In every authenticated curl command below, replace `$ASR_API_KEY` with the actual key value — do NOT rely on the shell env var, because each Bash call runs in a separate shell context and exports do not persist.

If neither source has a key, tell the developer to set up an API key (see hub skill for setup instructions).

## Step 1: Identify the Rejection

Determine the guideline code:

- **If the developer pasted a rejection email:** Extract the guideline code (pattern: "Guideline X.Y.Z" or "Section X.Y"). Also note the specific reasons cited.
- **If the developer gave a guideline code directly:** Use it (e.g., "2.1", "5.1.1", "3.1.1").
- **If the developer described the issue in words:** Search for it:
  ```bash
  curl -s "https://api.appstorereject.com/api/search?q=<keywords>&limit=5"
  ```
  Present the top matches and ask the developer to confirm which one.

## Step 2: Fetch Rejection Details

**Always start with the guideline code** — do NOT guess slugs. Use the batch endpoint to look up by code:

```bash
curl -s -H "Authorization: Bearer $ASR_API_KEY" "https://api.appstorereject.com/api/rejections/batch?codes=<guideline_code>"
```

Example: `?codes=5.1.1` or `?codes=4.3,2.1` (comma-separated, up to 10).

The response includes a `slug` field for each result. **Save the slug to your working memory** — you will need it again in Step 6 to attribute analytics to the specific rejection.

If you need the full detail view (solutions, before/after examples), use the returned slug:

```bash
curl -s -H "Authorization: Bearer $ASR_API_KEY" "https://api.appstorereject.com/api/rejections/detail?slug=<slug_from_batch_response>"
```

**If you have a slug already** (e.g., from a prior search result), you can call the detail endpoint directly.

**If authenticated:** You'll get full resolution steps, example rejection email, before/after examples, and community solutions.

**If unauthenticated:** You'll get a summary only. Tell the developer: "For full resolution steps and community solutions, set up an API key: `export ASR_API_KEY=asr_...` (get one at appstorereject.com/settings/api-keys)"

## Step 3: Present Resolution Guide

Show the developer:
1. **Title and description** of the rejection
2. **Difficulty level**
3. **Resolution steps** in order (if authenticated)
4. **Community solutions** ranked by effectiveness (if authenticated)

## Step 4: Plan Fix in Codebase Context

Read `{baseDir}/references/resolution-workflow.md` for the structured approach.

For each resolution step:
1. Search the developer's codebase for the relevant files
2. Propose specific changes tied to the resolution step
3. Explain **why** the change satisfies the guideline

Present the complete fix plan before making any changes. Wait for developer approval.

## Step 5 (Alternative): Appeal Letter

If the developer wants to appeal instead of fixing (they believe the rejection is wrong):

Generate an appeal letter using:
- The specific guideline cited in the rejection
- What the app actually does (from codebase context)
- Apple/Google's public review guidelines language

The appeal is generated locally by you (the AI agent) — no API call needed. Present the draft for the developer to review and edit before sending.

## Step 6: Report Analytics

After the developer resolves, appeals, or abandons:

```bash
curl -s -X POST -H "Authorization: Bearer $ASR_API_KEY" -H "Content-Type: application/json" -d '{"bundleId":"<detected>","guidelineCode":"<code>","rejectionSlug":"<slug_from_step_2>","action":"resolved|appealed|abandoned","platform":"ios|android"}' "https://api.appstorereject.com/api/rejections/report"
```

**Always include `rejectionSlug`** — use the slug you saved from Step 2's batch response. This attributes the report to the specific rejection on appstorereject.com (guideline codes alone are ambiguous because multiple rejections can share the same code). Resolved and appealed reports increment the rejection's public sighting count; abandoned reports are recorded for analytics only.

Auto-detect the bundleId from the project (Info.plist, build.gradle, app.json). If not detectable, ask the developer.
