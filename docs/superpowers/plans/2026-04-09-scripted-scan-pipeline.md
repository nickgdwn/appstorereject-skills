# Scripted Scan Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace agent-driven scan decision-making with API-served check definitions and thin Node.js scripts for consistent results, ~73% token reduction, and instant updates.

**Architecture:** Two new Convex tables (`scanChecks`, `scanGraph`) serve check definitions via 2 new HTTP endpoints. Four zero-dependency Node.js scripts in the skills repo handle deterministic logic. The agent becomes a script runner.

**Tech Stack:** Convex (backend tables + HTTP actions), Node.js 18+ (scripts), vitest (tests), Next.js (admin page)

**Two repos:**
- **Backend:** `/Users/nickgodwin/Documents/AppStoreReject/` — Convex schema, HTTP endpoints, seed migration, admin page
- **Skills:** `/Users/nickgodwin/Documents/appstorereject-skills/` — Node.js scripts, SKILL.md rewrite

**Spec:** `docs/superpowers/specs/2026-04-09-scripted-scan-pipeline-design.md`

---

## File Structure

### Backend repo (`AppStoreReject`)

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `convex/schema.ts` | Add `scanChecks` and `scanGraph` table definitions |
| Create | `convex/scanCheckHelpers.ts` | Internal queries for scan check/graph data |
| Modify | `convex/http.ts` | Add `GET /api/scan/graph` and `GET /api/scan/checks` routes |
| Create | `convex/migrations/seedScanChecks.ts` | One-time migration to seed 47 checks + 12 graph entries |
| Modify | `convex/lib/constants.ts` | Add `SCAN_CHECK_SECTIONS` constant for valid section names |
| Create | `src/app/admin/checks/page.tsx` | Admin UI for editing check definitions |
| Create | `convex/scanCheckAdmin.ts` | Admin mutations for CRUD on scanChecks/scanGraph |
| Modify | `src/components/admin/AdminSidebar.tsx` | Add "Checks" nav item |
| Create | `tests/scanCheckHelpers.test.ts` | Tests for query helper functions |

### Skills repo (`appstorereject-skills`)

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `skills/appstorereject-scan/scripts/detect-platform.js` | Local platform/framework detection |
| Create | `skills/appstorereject-scan/scripts/evaluate-section.js` | Local skip condition evaluation |
| Create | `skills/appstorereject-scan/scripts/collect-slugs.js` | Extract slugs from findings, build fetch command |
| Create | `skills/appstorereject-scan/scripts/format-report.js` | Merge findings + guides into final output |
| Modify | `skills/appstorereject-scan/SKILL.md` | Rewrite to script execution sequence |
| Delete | `skills/appstorereject-scan/references/checks-*.md` | Remove 6 markdown check files |
| Delete | `skills/appstorereject-scan/references/graph-*.md` | Remove 2 markdown graph files |
| Modify | `README.md` | Add Node.js 18+ to prerequisites |

---

## Task 1: Add `scanChecks` and `scanGraph` tables to schema

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/lib/constants.ts`

- [ ] **Step 1: Add section name constants**

In `convex/lib/constants.ts`, add after `TIER_LIMITS`:

```typescript
export const SCAN_CHECK_SECTIONS = [
  "privacy",
  "payments",
  "completeness",
  "performance",
  "design",
  "legal",
] as const;

export type ScanCheckSection = (typeof SCAN_CHECK_SECTIONS)[number];
```

- [ ] **Step 2: Add `scanChecks` table to schema**

In `convex/schema.ts`, add this table definition after the `rejectionReports` table (around line 529):

```typescript
scanChecks: defineTable({
  checkId: v.string(),
  section: v.string(),
  guideline: v.string(),
  risk: v.union(v.literal("HIGH"), v.literal("MED"), v.literal("LOW")),
  confidence: v.union(
    v.literal("HIGH"),
    v.literal("MEDIUM"),
    v.literal("LOW")
  ),
  findingTemplate: v.string(),
  contextTemplate: v.string(),
  slug: v.optional(v.string()),
  platforms: v.array(v.union(v.literal("ios"), v.literal("android"))),
  executionRules: v.object({
    native_ios: v.optional(v.string()),
    expo_managed: v.optional(v.string()),
    react_native_cli: v.optional(v.string()),
    native_android: v.optional(v.string()),
  }),
  active: v.boolean(),
  order: v.number(),
})
  .index("by_section_active", ["section", "active"])
  .index("by_checkId", ["checkId"])
  .index("by_active", ["active"]),
```

- [ ] **Step 3: Add `scanGraph` table to schema**

Immediately after the `scanChecks` table:

```typescript
scanGraph: defineTable({
  platform: v.union(v.literal("ios"), v.literal("android")),
  section: v.string(),
  priority: v.union(
    v.literal("HIGH"),
    v.literal("MEDIUM"),
    v.literal("LOW")
  ),
  order: v.number(),
  label: v.string(),
  skipCondition: v.object({
    allOf: v.array(
      v.union(
        v.object({ noImports: v.array(v.string()) }),
        v.object({ noDependencies: v.array(v.string()) }),
        v.object({ noFiles: v.array(v.string()) })
      )
    ),
  }),
  active: v.boolean(),
})
  .index("by_platform_active", ["platform", "active"])
  .index("by_platform_section", ["platform", "section"]),
```

- [ ] **Step 4: Push schema to dev**

Run: `cd /Users/nickgodwin/Documents/AppStoreReject && npx convex dev --once`
Expected: Schema syncs successfully, new tables created with 0 documents.

- [ ] **Step 5: Commit**

```bash
cd /Users/nickgodwin/Documents/AppStoreReject
git add convex/schema.ts convex/lib/constants.ts
git commit -m "feat: add scanChecks and scanGraph tables to schema"
```

---

## Task 2: Build internal query helpers for scan checks

**Files:**
- Create: `convex/scanCheckHelpers.ts`
- Create: `tests/scanCheckHelpers.test.ts`

- [ ] **Step 1: Write tests for getGraphForPlatform**

Create `tests/scanCheckHelpers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  filterChecksForFramework,
  groupChecksBySections,
} from "../convex/scanCheckHelpers";

// Test the pure helper functions that don't need Convex context

describe("filterChecksForFramework", () => {
  const mockCheck = {
    checkId: "missing_privacy_manifest",
    section: "privacy",
    guideline: "5.1.1",
    risk: "HIGH" as const,
    confidence: "HIGH" as const,
    findingTemplate: "PrivacyInfo.xcprivacy missing",
    contextTemplate: "No PrivacyInfo.xcprivacy found",
    slug: "guideline-511-privacy-missing-privacy-manifest-2",
    platforms: ["ios" as const],
    executionRules: {
      native_ios: "Glob: **/PrivacyInfo.xcprivacy",
      expo_managed: "Read app.json for expo.ios.privacyManifests",
      react_native_cli: "Glob: ios/**/PrivacyInfo.xcprivacy",
      native_android: undefined,
    },
    active: true,
    order: 1,
  };

  it("returns only the requested framework executionRule", () => {
    const result = filterChecksForFramework([mockCheck], "expo_managed");
    expect(result).toHaveLength(1);
    expect(result[0].executionRule).toBe(
      "Read app.json for expo.ios.privacyManifests"
    );
    expect(result[0]).not.toHaveProperty("executionRules");
  });

  it("excludes checks with no rule for the requested framework", () => {
    const androidOnlyCheck = {
      ...mockCheck,
      checkId: "data_safety",
      platforms: ["android" as const],
      executionRules: {
        native_ios: undefined,
        expo_managed: undefined,
        react_native_cli: undefined,
        native_android: "Check AndroidManifest.xml",
      },
    };
    const result = filterChecksForFramework(
      [androidOnlyCheck],
      "expo_managed"
    );
    expect(result).toHaveLength(0);
  });

  it("preserves all metadata fields", () => {
    const result = filterChecksForFramework([mockCheck], "native_ios");
    expect(result[0]).toEqual({
      checkId: "missing_privacy_manifest",
      guideline: "5.1.1",
      risk: "HIGH",
      findingTemplate: "PrivacyInfo.xcprivacy missing",
      contextTemplate: "No PrivacyInfo.xcprivacy found",
      slug: "guideline-511-privacy-missing-privacy-manifest-2",
      executionRule: "Glob: **/PrivacyInfo.xcprivacy",
    });
  });
});

describe("groupChecksBySections", () => {
  const checks = [
    { checkId: "a", section: "privacy", order: 2 },
    { checkId: "b", section: "privacy", order: 1 },
    { checkId: "c", section: "payments", order: 1 },
  ];

  it("groups checks by section", () => {
    const result = groupChecksBySections(checks as any);
    expect(Object.keys(result)).toEqual(["privacy", "payments"]);
    expect(result["privacy"]).toHaveLength(2);
    expect(result["payments"]).toHaveLength(1);
  });

  it("sorts checks within each section by order", () => {
    const result = groupChecksBySections(checks as any);
    expect(result["privacy"][0].checkId).toBe("b");
    expect(result["privacy"][1].checkId).toBe("a");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/nickgodwin/Documents/AppStoreReject && npx vitest run tests/scanCheckHelpers.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write scanCheckHelpers.ts**

Create `convex/scanCheckHelpers.ts`:

```typescript
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

type Framework =
  | "native_ios"
  | "expo_managed"
  | "react_native_cli"
  | "native_android";

type ScanCheck = Doc<"scanChecks">;

interface FilteredCheck {
  checkId: string;
  guideline: string;
  risk: "HIGH" | "MED" | "LOW";
  findingTemplate: string;
  contextTemplate: string;
  slug: string | undefined;
  executionRule: string;
}

// Pure function — exported for testing
export function filterChecksForFramework(
  checks: ScanCheck[],
  framework: Framework
): FilteredCheck[] {
  return checks
    .filter((c) => c.executionRules[framework] != null)
    .map((c) => ({
      checkId: c.checkId,
      guideline: c.guideline,
      risk: c.risk,
      findingTemplate: c.findingTemplate,
      contextTemplate: c.contextTemplate,
      slug: c.slug,
      executionRule: c.executionRules[framework]!,
    }));
}

// Pure function — exported for testing
export function groupChecksBySections(
  checks: ScanCheck[]
): Record<string, ScanCheck[]> {
  const grouped: Record<string, ScanCheck[]> = {};
  for (const check of checks) {
    if (!grouped[check.section]) {
      grouped[check.section] = [];
    }
    grouped[check.section].push(check);
  }
  // Sort each section by order
  for (const section of Object.keys(grouped)) {
    grouped[section].sort((a, b) => a.order - b.order);
  }
  return grouped;
}

// Convex query: get graph for a platform
export const getGraphForPlatform = internalQuery({
  args: {
    platform: v.union(v.literal("ios"), v.literal("android")),
  },
  handler: async (ctx, args) => {
    const sections = await ctx.db
      .query("scanGraph")
      .withIndex("by_platform_active", (q) =>
        q.eq("platform", args.platform).eq("active", true)
      )
      .collect();

    sections.sort((a, b) => a.order - b.order);

    return {
      platform: args.platform,
      sections: sections.map((s) => ({
        section: s.section,
        label: s.label,
        priority: s.priority,
        order: s.order,
        skipCondition: s.skipCondition,
      })),
    };
  },
});

// Convex query: get checks for multiple sections, filtered to one framework + platform
export const getChecksForSections = internalQuery({
  args: {
    sections: v.array(v.string()),
    framework: v.union(
      v.literal("native_ios"),
      v.literal("expo_managed"),
      v.literal("react_native_cli"),
      v.literal("native_android")
    ),
    platform: v.union(v.literal("ios"), v.literal("android")),
  },
  handler: async (ctx, args) => {
    const allChecks: ScanCheck[] = [];

    for (const section of args.sections) {
      const checks = await ctx.db
        .query("scanChecks")
        .withIndex("by_section_active", (q) =>
          q.eq("section", section).eq("active", true)
        )
        .collect();

      // Filter to checks that apply to this platform
      const platformChecks = checks.filter((c) =>
        c.platforms.includes(args.platform)
      );
      allChecks.push(...platformChecks);
    }

    const filtered = filterChecksForFramework(allChecks, args.framework);
    const grouped: Record<string, FilteredCheck[]> = {};
    for (const check of filtered) {
      const section = allChecks.find(
        (c) => c.checkId === check.checkId
      )?.section;
      if (!section) continue;
      if (!grouped[section]) grouped[section] = [];
      grouped[section].push(check);
    }

    return {
      framework: args.framework,
      sections: grouped,
    };
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/nickgodwin/Documents/AppStoreReject && npx vitest run tests/scanCheckHelpers.test.ts`
Expected: PASS — all 5 tests pass

- [ ] **Step 5: Commit**

```bash
cd /Users/nickgodwin/Documents/AppStoreReject
git add convex/scanCheckHelpers.ts tests/scanCheckHelpers.test.ts
git commit -m "feat: add scanCheck query helpers with tests"
```

---

## Task 3: Add HTTP endpoints for scan graph and checks

**Files:**
- Modify: `convex/http.ts`

- [ ] **Step 1: Add GET /api/scan/graph endpoint**

In `convex/http.ts`, add after the existing scan endpoints (after the `/api/scans/complete` OPTIONS route):

```typescript
// ── Scan Check Graph ─────────────────────────────────────────────
http.route({
  path: "/api/scan/graph",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const platform = url.searchParams.get("platform");

    if (!platform || !["ios", "android"].includes(platform)) {
      return new Response(
        JSON.stringify({ error: "platform (ios|android) required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await ctx.runQuery(
      internal.scanCheckHelpers.getGraphForPlatform,
      { platform: platform as "ios" | "android" }
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }),
});

http.route({
  path: "/api/scan/graph",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders });
  }),
});
```

- [ ] **Step 2: Add GET /api/scan/checks endpoint**

```typescript
// ── Scan Checks (by section, framework, platform) ───────────────
http.route({
  path: "/api/scan/checks",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const sectionsParam = url.searchParams.get("sections");
    const framework = url.searchParams.get("framework");
    const platform = url.searchParams.get("platform");
    const scanToken = url.searchParams.get("scanToken");

    // Validate required params
    if (!sectionsParam || !framework || !platform || !scanToken) {
      return new Response(
        JSON.stringify({
          error:
            "sections, framework, platform, and scanToken are all required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate platform
    if (!["ios", "android"].includes(platform)) {
      return new Response(
        JSON.stringify({ error: "platform must be ios or android" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate framework
    const validFrameworks = [
      "native_ios",
      "expo_managed",
      "react_native_cli",
      "native_android",
    ];
    if (!validFrameworks.includes(framework)) {
      return new Response(
        JSON.stringify({
          error: `framework must be one of: ${validFrameworks.join(", ")}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate scanToken — proves user is authorized for this scan
    const scan = await ctx.runQuery(
      internal.scanCheckHelpers.validateScanToken,
      { scanToken }
    );
    if (!scan.valid) {
      return new Response(
        JSON.stringify({ error: scan.error }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse sections
    const sections = sectionsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (sections.length === 0 || sections.length > 10) {
      return new Response(
        JSON.stringify({ error: "1-10 sections required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const result = await ctx.runQuery(
      internal.scanCheckHelpers.getChecksForSections,
      {
        sections,
        framework: framework as any,
        platform: platform as "ios" | "android",
      }
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }),
});

http.route({
  path: "/api/scan/checks",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders });
  }),
});
```

- [ ] **Step 3: Add validateScanToken query to scanCheckHelpers.ts**

In `convex/scanCheckHelpers.ts`, add:

```typescript
// Validates a scanToken is active and not expired (1-hour window)
export const validateScanToken = internalQuery({
  args: { scanToken: v.string() },
  handler: async (ctx, args) => {
    const scan = await ctx.db
      .query("scans")
      .withIndex("by_scanToken", (q) => q.eq("scanToken", args.scanToken))
      .first();

    if (!scan) {
      return { valid: false as const, error: "Invalid scan token" };
    }

    if (scan.status !== "started") {
      return {
        valid: false as const,
        error: "Scan already completed or expired",
      };
    }

    const oneHourMs = 60 * 60 * 1000;
    if (Date.now() - scan.startedAt > oneHourMs) {
      return { valid: false as const, error: "Scan token expired" };
    }

    return { valid: true as const, userId: scan.userId };
  },
});
```

- [ ] **Step 4: Push to dev and verify endpoints respond**

Run: `cd /Users/nickgodwin/Documents/AppStoreReject && npx convex dev --once`
Expected: Deploys successfully.

Test graph endpoint (no auth needed):
```bash
curl -s "https://superb-pony-805.convex.site/api/scan/graph?platform=ios" | head -c 200
```
Expected: `{"platform":"ios","sections":[]}` (empty until seeded)

- [ ] **Step 5: Commit**

```bash
cd /Users/nickgodwin/Documents/AppStoreReject
git add convex/http.ts convex/scanCheckHelpers.ts
git commit -m "feat: add /api/scan/graph and /api/scan/checks HTTP endpoints"
```

---

## Task 4: Write markdown parser and seed migration

**Files:**
- Create: `convex/migrations/seedScanChecks.ts`

This task parses the 6 existing `checks-*.md` files and 2 `graph-*.md` files from the skills repo and inserts them into the new Convex tables. Since the markdown files are a fixed, known format, the parser is a one-time migration script that runs via `npx convex run`.

- [ ] **Step 1: Create the seed migration**

Create `convex/migrations/seedScanChecks.ts`:

```typescript
import { internalMutation } from "../_generated/server";

// ── Graph data (from graph-ios.md and graph-android.md) ──────────

const GRAPH_ENTRIES = [
  // iOS
  {
    platform: "ios" as const,
    section: "privacy",
    priority: "HIGH" as const,
    order: 1,
    label: "Privacy (Guidelines 5.1.x)",
    skipCondition: {
      allOf: [
        { noImports: ["fetch", "axios", "URLSession", "Alamofire", "AF.request", "Moya", "dataTask"] },
        { noDependencies: ["firebase", "analytics", "sentry", "amplitude", "mixpanel", "bugsnag"] },
        { noFiles: ["PrivacyInfo.xcprivacy"] },
      ],
    },
    active: true,
  },
  {
    platform: "ios" as const,
    section: "payments",
    priority: "HIGH" as const,
    order: 2,
    label: "In-App Purchase (Guidelines 3.1.x)",
    skipCondition: {
      allOf: [
        { noDependencies: ["StoreKit", "react-native-iap", "expo-in-app-purchases", "RevenueCat"] },
        { noImports: ["subscribe", "premium", "upgrade", "unlock", "purchase", "paid"] },
      ],
    },
    active: true,
  },
  {
    platform: "ios" as const,
    section: "completeness",
    priority: "HIGH" as const,
    order: 3,
    label: "App Completeness (Guideline 2.1)",
    skipCondition: { allOf: [] }, // Never skip
    active: true,
  },
  {
    platform: "ios" as const,
    section: "performance",
    priority: "MEDIUM" as const,
    order: 4,
    label: "Performance (Guidelines 2.x)",
    skipCondition: {
      allOf: [
        { noImports: ["UIBackgroundModes", "BGTaskScheduler", "background"] },
        { noFiles: ["*.entitlements"] },
      ],
    },
    active: true,
  },
  {
    platform: "ios" as const,
    section: "design",
    priority: "MEDIUM" as const,
    order: 5,
    label: "Design (Guidelines 4.x)",
    skipCondition: {
      allOf: [
        { noDependencies: ["react-native-paper", "nativewind", "@shopify/flash-list"] },
        { noImports: ["DrawerNavigator", "FAB", "Snackbar", "NavigationDrawer"] },
      ],
    },
    active: true,
  },
  {
    platform: "ios" as const,
    section: "legal",
    priority: "LOW" as const,
    order: 6,
    label: "Legal (Guidelines 5.2.x)",
    skipCondition: {
      allOf: [
        { noImports: ["user-generated", "UGC", "NSFW", "age-gate", "age-restrict", "COPPA"] },
        { noDependencies: ["@stream-io", "getstream", "sendbird"] },
      ],
    },
    active: true,
  },
  // Android — same sections, Android-specific skip conditions
  {
    platform: "android" as const,
    section: "privacy",
    priority: "HIGH" as const,
    order: 1,
    label: "Privacy (Data Safety)",
    skipCondition: {
      allOf: [
        { noImports: ["fetch", "axios", "OkHttp", "Retrofit", "Volley"] },
        { noDependencies: ["firebase", "analytics", "sentry", "amplitude", "mixpanel"] },
        { noFiles: ["AndroidManifest.xml"] },
      ],
    },
    active: true,
  },
  {
    platform: "android" as const,
    section: "payments",
    priority: "HIGH" as const,
    order: 2,
    label: "Payments (Google Play Billing)",
    skipCondition: {
      allOf: [
        { noDependencies: ["com.android.billingclient", "react-native-iap", "expo-in-app-purchases"] },
        { noImports: ["subscribe", "premium", "upgrade", "unlock", "purchase", "paid"] },
      ],
    },
    active: true,
  },
  {
    platform: "android" as const,
    section: "completeness",
    priority: "HIGH" as const,
    order: 3,
    label: "App Completeness (Content Policy)",
    skipCondition: { allOf: [] },
    active: true,
  },
  {
    platform: "android" as const,
    section: "performance",
    priority: "MEDIUM" as const,
    order: 4,
    label: "Performance",
    skipCondition: {
      allOf: [
        { noImports: ["WorkManager", "JobScheduler", "AlarmManager", "WakeLock"] },
        { noFiles: ["*.entitlements"] },
      ],
    },
    active: true,
  },
  {
    platform: "android" as const,
    section: "design",
    priority: "MEDIUM" as const,
    order: 5,
    label: "Design (Material Design)",
    skipCondition: {
      allOf: [
        { noDependencies: ["react-native-paper", "nativewind"] },
        { noImports: ["UINavigationBar", "UITabBarController", "SF Symbols"] },
      ],
    },
    active: true,
  },
  {
    platform: "android" as const,
    section: "legal",
    priority: "LOW" as const,
    order: 6,
    label: "Legal",
    skipCondition: {
      allOf: [
        { noImports: ["user-generated", "UGC", "NSFW", "age-gate", "COPPA"] },
        { noDependencies: ["@stream-io", "getstream", "sendbird"] },
      ],
    },
    active: true,
  },
];

// ── Check data ───────────────────────────────────────────────────
// Each check is transcribed from the markdown check definition files.
// This is a one-time migration — after seeding, checks are managed
// via the admin UI and updated in the Convex table directly.
//
// IMPORTANT: The full check data array is large (~47 checks).
// The implementer must transcribe ALL 47 checks from the 6 markdown
// files in the skills repo:
//   - checks-privacy.md (12 checks)
//   - checks-payments.md (10 checks)
//   - checks-completeness.md (12 checks)
//   - checks-performance.md (5 checks)
//   - checks-design.md (4 checks)
//   - checks-legal.md (4 checks)
//
// Each check follows this structure:
const EXAMPLE_CHECK = {
  checkId: "missing_privacy_manifest",
  section: "privacy",
  guideline: "5.1.1",
  risk: "HIGH" as const,
  confidence: "HIGH" as const,
  findingTemplate:
    "PrivacyInfo.xcprivacy missing — required since Spring 2024",
  contextTemplate:
    "No PrivacyInfo.xcprivacy found in project. Apple requires a privacy manifest for all apps as of Spring 2024. Found {api_usage_count} API calls that likely need required reason declarations: {api_categories}.",
  slug: "guideline-511-privacy-missing-privacy-manifest-2",
  platforms: ["ios" as const],
  executionRules: {
    native_ios:
      'Search for PrivacyInfo.xcprivacy anywhere under the project root. Also check that the file is referenced in the Xcode project:\n- Glob: **/PrivacyInfo.xcprivacy\n- Glob: **/*.pbxproj — grep for "PrivacyInfo.xcprivacy" to confirm it is included in the build target\n- If the file exists, verify it contains NSPrivacyTracking and NSPrivacyAccessedAPITypes keys (not an empty plist)',
    expo_managed:
      "Read app.json or app.config.js / app.config.ts\nCheck for expo.ios.privacyManifests key\nIf missing, flag. If present, verify NSPrivacyAccessedAPITypes array is non-empty\nExpo SDK 51+ auto-generates a privacy manifest, but custom API usage still requires declaration",
    react_native_cli:
      "Glob: ios/**/PrivacyInfo.xcprivacy\nCheck ios/*.xcodeproj/project.pbxproj for reference to the file\nAlso check CocoaPods: ios/Podfile may need config.privacy_manifest entries for pods that access required reason APIs",
    native_android:
      'Not directly applicable (Android uses Data Safety Section, not a privacy manifest file)\nHowever, check AndroidManifest.xml for <meta-data android:name="com.google.android.play.PRIVACY_POLICY_URL"> as a related signal',
  },
  active: true,
  order: 1,
};

// The implementer should create a SCAN_CHECKS array with all 47 checks
// following the EXAMPLE_CHECK structure above. Read each check from:
//   /Users/nickgodwin/Documents/appstorereject-skills/skills/appstorereject-scan/references/checks-*.md
//
// For each ### Check: block, extract:
//   - checkId: the check name after "### Check: "
//   - section: which file it's from (privacy, payments, etc.)
//   - guideline: the "Guideline:" value
//   - risk: the "Risk:" value (HIGH, MED, LOW)
//   - confidence: the "Confidence:" value (HIGH, MEDIUM, LOW) — just the level, not the condition text
//   - findingTemplate: the "Finding template:" value (unquoted)
//   - contextTemplate: the "Context template:" value (unquoted)
//   - slug: the "Slug:" value, or undefined if "—"
//   - platforms: ["ios"] if iOS-specific, ["android"] if Android-specific, ["ios", "android"] if both
//     (most checks are both — only android_dangerous_permissions and missing_data_safety_section are android-only)
//   - executionRules: the text under each #### subsection header
//   - order: sequential within the section (1, 2, 3, ...)

const SCAN_CHECKS: typeof EXAMPLE_CHECK[] = [
  EXAMPLE_CHECK,
  // ... remaining 46 checks transcribed from markdown
];

export const seedScanChecks = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Idempotent check
    const existing = await ctx.db
      .query("scanChecks")
      .withIndex("by_active")
      .first();
    if (existing) {
      return { message: "scanChecks already seeded", checks: 0, graph: 0 };
    }

    // Seed graph entries
    let graphCount = 0;
    for (const entry of GRAPH_ENTRIES) {
      await ctx.db.insert("scanGraph", entry);
      graphCount++;
    }

    // Seed check entries
    let checkCount = 0;
    for (const check of SCAN_CHECKS) {
      await ctx.db.insert("scanChecks", check);
      checkCount++;
    }

    return {
      message: "Seeded successfully",
      checks: checkCount,
      graph: graphCount,
    };
  },
});
```

- [ ] **Step 2: Transcribe all 47 checks into the SCAN_CHECKS array**

Read each `checks-*.md` file from the skills repo and transcribe into the array. This is the most time-consuming step — each check has 4 framework execution rules that must be copied verbatim as strings.

Files to read:
- `/Users/nickgodwin/Documents/appstorereject-skills/skills/appstorereject-scan/references/checks-privacy.md` (12 checks)
- `/Users/nickgodwin/Documents/appstorereject-skills/skills/appstorereject-scan/references/checks-payments.md` (10 checks)
- `/Users/nickgodwin/Documents/appstorereject-skills/skills/appstorereject-scan/references/checks-completeness.md` (12 checks)
- `/Users/nickgodwin/Documents/appstorereject-skills/skills/appstorereject-scan/references/checks-performance.md` (5 checks)
- `/Users/nickgodwin/Documents/appstorereject-skills/skills/appstorereject-scan/references/checks-design.md` (4 checks)
- `/Users/nickgodwin/Documents/appstorereject-skills/skills/appstorereject-scan/references/checks-legal.md` (4 checks)

- [ ] **Step 3: Run seed migration on dev**

Run: `cd /Users/nickgodwin/Documents/AppStoreReject && npx convex dev --once && npx convex run migrations/seedScanChecks:seedScanChecks`
Expected: `{ message: "Seeded successfully", checks: 47, graph: 12 }`

- [ ] **Step 4: Verify graph endpoint returns data**

```bash
curl -s "https://superb-pony-805.convex.site/api/scan/graph?platform=ios" | python3 -m json.tool | head -20
```
Expected: JSON with 6 sections, ordered by priority.

- [ ] **Step 5: Commit**

```bash
cd /Users/nickgodwin/Documents/AppStoreReject
git add convex/migrations/seedScanChecks.ts
git commit -m "feat: add seed migration for 47 scan checks and 12 graph entries"
```

---

## Task 5: Write Node.js scripts (skills repo)

**Files:**
- Create: `skills/appstorereject-scan/scripts/detect-platform.js`
- Create: `skills/appstorereject-scan/scripts/evaluate-section.js`
- Create: `skills/appstorereject-scan/scripts/collect-slugs.js`
- Create: `skills/appstorereject-scan/scripts/format-report.js`

All scripts are zero-dependency (Node.js built-ins only: `fs`, `path`, `child_process`). Each writes JSON to stdout.

- [ ] **Step 1: Create detect-platform.js**

Create `skills/appstorereject-scan/scripts/detect-platform.js`:

```javascript
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
  // Simple glob for common patterns — no dependencies needed
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

// Detection
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

  // Platforms
  if (appJson.expo.ios) platforms.push("ios");
  if (appJson.expo.android) platforms.push("android");
  if (platforms.length === 0) platforms = ["ios", "android"]; // default both

  // Bundle ID
  bundleId =
    appJson.expo.ios?.bundleIdentifier ||
    appJson.expo.android?.package ||
    null;
}

// 2. React Native CLI
if (!framework && pkg) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (
    deps["react-native"] ||
    fileExists("react-native.config.js") ||
    fileExists("react-native.config.ts")
  ) {
    framework = "react_native_cli";
    if (detectedFiles.iosDir) platforms.push("ios");
    if (detectedFiles.androidDir) platforms.push("android");

    // Bundle ID from native files
    if (detectedFiles.iosDir) {
      const infoPlistFiles = findFiles("Info.plist").filter((f) =>
        f.includes("/ios/")
      );
      for (const plist of infoPlistFiles) {
        try {
          const content = fs.readFileSync(plist, "utf8");
          const match = content.match(
            /<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/
          );
          if (match && !match[1].includes("$")) {
            bundleId = match[1];
            break;
          }
        } catch {}
      }
    }
    if (!bundleId && detectedFiles.androidDir) {
      const gradleFiles = [
        "android/app/build.gradle",
        "android/app/build.gradle.kts",
      ];
      for (const gf of gradleFiles) {
        try {
          const content = fs.readFileSync(
            path.join(projectPath, gf),
            "utf8"
          );
          const match = content.match(/applicationId\s+["']([^"']+)["']/);
          if (match) {
            bundleId = match[1];
            break;
          }
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
      const match = content.match(
        /<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/
      );
      if (match && !match[1].includes("$")) {
        bundleId = match[1];
        break;
      }
    } catch {}
  }
}

// 4. Native Android
if (!framework && detectedFiles.buildGradle && !pkg?.dependencies?.["react-native"]) {
  framework = "native_android";
  platforms = ["android"];
  const gradleFiles = [
    "android/app/build.gradle",
    "app/build.gradle",
    "app/build.gradle.kts",
    "build.gradle.kts",
  ];
  for (const gf of gradleFiles) {
    try {
      const content = fs.readFileSync(path.join(projectPath, gf), "utf8");
      const match = content.match(/applicationId\s+["']([^"']+)["']/);
      if (match) {
        bundleId = match[1];
        break;
      }
    } catch {}
  }
}

const output = {
  framework: framework || "unknown",
  platforms,
  bundleId,
  detectedFiles,
};

process.stdout.write(JSON.stringify(output, null, 2) + "\n");
```

- [ ] **Step 2: Create evaluate-section.js**

Create `skills/appstorereject-scan/scripts/evaluate-section.js`:

```javascript
#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Parse args
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

const graph = JSON.parse(fs.readFileSync(graphFilePath, "utf8"));

function grepProject(patterns) {
  for (const pattern of patterns) {
    try {
      const cmd = `grep -rl "${pattern}" ${JSON.stringify(projectPath)} --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.swift" --include="*.m" --include="*.h" --include="*.kt" --include="*.java" --include="*.xml" --include="*.json" -m 1 2>/dev/null`;
      const result = execSync(cmd, { encoding: "utf8", timeout: 10000 });
      if (result.trim()) return { found: true, pattern, file: result.trim().split("\n")[0] };
    } catch {}
  }
  return { found: false };
}

function checkDependencies(patterns) {
  // Check package.json, Podfile, build.gradle
  const depFiles = [
    { file: "package.json", reader: (c) => c },
    { file: "ios/Podfile", reader: (c) => c },
    { file: "ios/Podfile.lock", reader: (c) => c },
    { file: "android/app/build.gradle", reader: (c) => c },
    { file: "Podfile", reader: (c) => c },
    { file: "app/build.gradle", reader: (c) => c },
  ];

  for (const { file } of depFiles) {
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
    try {
      const cmd = `find ${JSON.stringify(projectPath)} -name "${pattern}" -maxdepth 5 2>/dev/null | head -1`;
      const result = execSync(cmd, { encoding: "utf8", timeout: 5000 });
      if (result.trim()) return { found: true, pattern, file: result.trim() };
    } catch {}
  }
  return { found: false };
}

// Evaluate each section
const results = [];
const sectionsToScan = [];

for (const section of graph.sections) {
  const conditions = section.skipCondition?.allOf || [];

  // Empty allOf = never skip
  if (conditions.length === 0) {
    results.push({ section: section.section, skip: false, reason: "Always checked" });
    sectionsToScan.push(section.section);
    continue;
  }

  // ALL conditions must be true to skip (allOf = all must match for skip)
  let allMet = true;
  let failReason = "";

  for (const condition of conditions) {
    if (condition.noImports) {
      const result = grepProject(condition.noImports);
      if (result.found) {
        allMet = false;
        failReason = `Found ${result.pattern} in ${result.file}`;
        break;
      }
    }
    if (condition.noDependencies) {
      const result = checkDependencies(condition.noDependencies);
      if (result.found) {
        allMet = false;
        failReason = `Found ${result.pattern} in ${result.file}`;
        break;
      }
    }
    if (condition.noFiles) {
      const result = checkFiles(condition.noFiles);
      if (result.found) {
        allMet = false;
        failReason = `Found ${result.pattern} at ${result.file}`;
        break;
      }
    }
  }

  if (allMet) {
    results.push({
      section: section.section,
      skip: true,
      reason: `No matching imports, dependencies, or files found for ${section.label}`,
    });
  } else {
    results.push({ section: section.section, skip: false, reason: failReason });
    sectionsToScan.push(section.section);
  }
}

process.stdout.write(JSON.stringify({ results, sectionsToScan }, null, 2) + "\n");
```

- [ ] **Step 3: Create collect-slugs.js**

Create `skills/appstorereject-scan/scripts/collect-slugs.js`:

```javascript
#!/usr/bin/env node
"use strict";

const fs = require("fs");

// Parse args
const args = process.argv.slice(2);
let findingsFilePath = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--findings-file" && args[i + 1]) {
    findingsFilePath = args[i + 1];
    i++;
  }
}

if (!findingsFilePath) {
  process.stderr.write("Usage: collect-slugs.js --findings-file <path>\n");
  process.exit(1);
}

const findings = JSON.parse(fs.readFileSync(findingsFilePath, "utf8"));

const slugs = [];
const skipped = [];

for (const finding of findings) {
  // Only fetch guides for HIGH and MED risk findings
  if (finding.risk !== "HIGH" && finding.risk !== "MED") continue;

  if (finding.slug) {
    slugs.push(finding.slug);
  } else {
    skipped.push(finding.checkId);
  }
}

const uniqueSlugs = [...new Set(slugs)];

const output = {
  slugs: uniqueSlugs,
  skipped,
  skippedReason: skipped.length > 0 ? "slug is null — no resolution guide available" : null,
};

if (uniqueSlugs.length > 0) {
  output.fetchCommand = `curl -s -H "Authorization: Bearer $ASR_API_KEY" "https://api.appstorereject.com/api/rejections/batch?slugs=${uniqueSlugs.join(",")}"`;
} else {
  output.fetchCommand = null;
}

process.stdout.write(JSON.stringify(output, null, 2) + "\n");
```

- [ ] **Step 4: Create format-report.js**

Create `skills/appstorereject-scan/scripts/format-report.js`:

```javascript
#!/usr/bin/env node
"use strict";

const fs = require("fs");

// Parse args
const args = process.argv.slice(2);
let findingsFilePath = null;
let guidesFilePath = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--findings-file" && args[i + 1]) {
    findingsFilePath = args[i + 1];
    i++;
  }
  if (args[i] === "--guides-file" && args[i + 1]) {
    guidesFilePath = args[i + 1];
    i++;
  }
}

if (!findingsFilePath) {
  process.stderr.write("Usage: format-report.js --findings-file <path> [--guides-file <path>]\n");
  process.exit(1);
}

const findings = JSON.parse(fs.readFileSync(findingsFilePath, "utf8"));

let guides = [];
if (guidesFilePath) {
  try {
    const guidesResponse = JSON.parse(fs.readFileSync(guidesFilePath, "utf8"));
    guides = guidesResponse.data || [];
  } catch {}
}

// Build slug-to-guide map
const guideMap = new Map();
for (const guide of guides) {
  if (guide.slug) guideMap.set(guide.slug, guide);
}

// Sort findings by risk: HIGH > MED > LOW
const riskOrder = { HIGH: 0, MED: 1, LOW: 2 };
const sorted = [...findings].sort(
  (a, b) => (riskOrder[a.risk] ?? 3) - (riskOrder[b.risk] ?? 3)
);

// Build findings table
const rows = sorted.map((f, i) => `| ${i + 1} | ${f.guideline} | ${f.risk} | ${f.finding} |`);
const findingsTable = [
  "| # | Guideline | Risk | Finding |",
  "|---|-----------|------|---------|",
  ...rows,
].join("\n");

// Build guide sections
const guideSections = [];
const unguidedFindings = [];

for (const finding of sorted) {
  if (finding.slug && guideMap.has(finding.slug)) {
    const guide = guideMap.get(finding.slug);
    guideSections.push({
      finding: finding.finding,
      guideline: finding.guideline,
      risk: finding.risk,
      resolutionSteps: guide.resolutionSteps || null,
      prevention: guide.prevention || null,
      codebaseContextPrompt: finding.contextTemplate
        ? `Using the check context as guidance: ${finding.contextTemplate}`
        : `Search the developer's project for files related to guideline ${finding.guideline}. Report what you find.`,
    });
  } else if (!finding.slug || finding.slug === "—") {
    unguidedFindings.push({
      checkId: finding.checkId,
      guideline: finding.guideline,
      risk: finding.risk,
      finding: finding.finding,
      note: "No community guide available yet",
    });
  }
}

// Framework mapping for analytics payload
const FRAMEWORK_MAP = {
  expo_managed: "expo",
  expo_bare: "react-native",
  react_native_cli: "react-native",
  native_ios: "native",
  native_android: "native",
};

// Read metadata from findings (first finding should have _meta if set by agent)
const meta = findings._meta || {};
const analyticsPayload = {
  scanToken: meta.scanToken || null,
  bundleId: meta.bundleId || null,
  platform: meta.platform || null,
  framework: FRAMEWORK_MAP[meta.framework] || meta.framework || null,
  findings: sorted.map((f) => ({
    guidelineCode: f.guideline,
    confidence: (f.confidence || "medium").toLowerCase(),
    checkId: f.checkId,
    context: (f.context || "").slice(0, 200),
  })),
};

const output = {
  findingsTable,
  guideSections,
  unguidedFindings,
  analyticsPayload,
};

process.stdout.write(JSON.stringify(output, null, 2) + "\n");
```

- [ ] **Step 5: Make all scripts executable**

```bash
cd /Users/nickgodwin/Documents/appstorereject-skills
chmod +x skills/appstorereject-scan/scripts/*.js
```

- [ ] **Step 6: Commit**

```bash
cd /Users/nickgodwin/Documents/appstorereject-skills
git add skills/appstorereject-scan/scripts/
git commit -m "feat: add 4 Node.js scripts for scripted scan pipeline"
```

---

## Task 6: Write vitest tests for scripts

**Files:**
- Create: `tests/scripts/detect-platform.test.ts` (in skills repo)
- Create: `tests/scripts/collect-slugs.test.ts` (in skills repo)
- Create: `tests/scripts/format-report.test.ts` (in skills repo)

Since the skills repo doesn't have a test setup yet, tests run from the AppStoreReject repo using the scripts' pure logic extracted into testable functions. Alternatively, we can test scripts as CLI executables using `execSync`.

- [ ] **Step 1: Create test for collect-slugs.js**

Create `tests/scripts/collect-slugs.test.ts` in the **AppStoreReject** repo:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const SCRIPT_PATH = path.resolve(
  __dirname,
  "../../appstorereject-skills/skills/appstorereject-scan/scripts/collect-slugs.js"
);

// Use a relative path that works from the AppStoreReject repo
const scriptPath = path.join(
  process.cwd(),
  "../appstorereject-skills/skills/appstorereject-scan/scripts/collect-slugs.js"
);

describe("collect-slugs.js", () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `asr-test-findings-${Date.now()}.json`);
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  function run(findings: any[]) {
    fs.writeFileSync(tmpFile, JSON.stringify(findings));
    const output = execSync(
      `node ${SCRIPT_PATH} --findings-file ${tmpFile}`,
      { encoding: "utf8" }
    );
    return JSON.parse(output);
  }

  it("extracts slugs from HIGH and MED findings", () => {
    const findings = [
      { risk: "HIGH", slug: "slug-a", checkId: "check_a" },
      { risk: "MED", slug: "slug-b", checkId: "check_b" },
      { risk: "LOW", slug: "slug-c", checkId: "check_c" },
    ];
    const result = run(findings);
    expect(result.slugs).toEqual(["slug-a", "slug-b"]);
    expect(result.skipped).toEqual([]);
  });

  it("puts findings without slugs in skipped", () => {
    const findings = [
      { risk: "HIGH", slug: null, checkId: "check_a" },
      { risk: "MED", slug: "slug-b", checkId: "check_b" },
    ];
    const result = run(findings);
    expect(result.slugs).toEqual(["slug-b"]);
    expect(result.skipped).toEqual(["check_a"]);
  });

  it("deduplicates slugs", () => {
    const findings = [
      { risk: "HIGH", slug: "same-slug", checkId: "check_a" },
      { risk: "HIGH", slug: "same-slug", checkId: "check_b" },
    ];
    const result = run(findings);
    expect(result.slugs).toEqual(["same-slug"]);
  });

  it("generates fetchCommand when slugs exist", () => {
    const findings = [{ risk: "HIGH", slug: "slug-a", checkId: "check_a" }];
    const result = run(findings);
    expect(result.fetchCommand).toContain("slugs=slug-a");
    expect(result.fetchCommand).toContain("$ASR_API_KEY");
  });

  it("returns null fetchCommand when no slugs", () => {
    const findings = [{ risk: "LOW", slug: "slug-a", checkId: "check_a" }];
    const result = run(findings);
    expect(result.fetchCommand).toBeNull();
  });
});
```

- [ ] **Step 2: Create test for format-report.js**

Create `tests/scripts/format-report.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const SCRIPT_PATH = path.resolve(
  __dirname,
  "../../appstorereject-skills/skills/appstorereject-scan/scripts/format-report.js"
);

describe("format-report.js", () => {
  let findingsFile: string;
  let guidesFile: string;

  beforeEach(() => {
    const ts = Date.now();
    findingsFile = path.join(os.tmpdir(), `asr-test-findings-${ts}.json`);
    guidesFile = path.join(os.tmpdir(), `asr-test-guides-${ts}.json`);
  });

  afterEach(() => {
    try { fs.unlinkSync(findingsFile); } catch {}
    try { fs.unlinkSync(guidesFile); } catch {}
  });

  function run(findings: any[], guides?: any) {
    fs.writeFileSync(findingsFile, JSON.stringify(findings));
    let cmd = `node ${SCRIPT_PATH} --findings-file ${findingsFile}`;
    if (guides) {
      fs.writeFileSync(guidesFile, JSON.stringify(guides));
      cmd += ` --guides-file ${guidesFile}`;
    }
    return JSON.parse(execSync(cmd, { encoding: "utf8" }));
  }

  it("sorts findings by risk: HIGH > MED > LOW", () => {
    const findings = [
      { risk: "LOW", guideline: "5.2", finding: "Low", checkId: "c" },
      { risk: "HIGH", guideline: "5.1.1", finding: "High", checkId: "a" },
      { risk: "MED", guideline: "2.1", finding: "Med", checkId: "b" },
    ];
    const result = run(findings);
    expect(result.findingsTable).toContain("| 1 | 5.1.1 | HIGH");
    expect(result.findingsTable).toContain("| 2 | 2.1 | MED");
    expect(result.findingsTable).toContain("| 3 | 5.2 | LOW");
  });

  it("matches findings to guides by slug", () => {
    const findings = [
      { risk: "HIGH", guideline: "5.1.1", finding: "Missing manifest", slug: "slug-a", checkId: "a" },
    ];
    const guides = {
      data: [{ slug: "slug-a", resolutionSteps: "## Fix it", prevention: "Add CI check" }],
    };
    const result = run(findings, guides);
    expect(result.guideSections).toHaveLength(1);
    expect(result.guideSections[0].resolutionSteps).toBe("## Fix it");
    expect(result.guideSections[0].prevention).toBe("Add CI check");
  });

  it("puts findings without slugs in unguidedFindings", () => {
    const findings = [
      { risk: "MED", guideline: "4.x", finding: "No labels", slug: null, checkId: "a" },
    ];
    const result = run(findings);
    expect(result.guideSections).toHaveLength(0);
    expect(result.unguidedFindings).toHaveLength(1);
    expect(result.unguidedFindings[0].note).toBe("No community guide available yet");
  });

  it("maps framework to analytics payload", () => {
    const findings = Object.assign(
      [{ risk: "HIGH", guideline: "5.1.1", finding: "Test", checkId: "a" }],
      { _meta: { framework: "expo_managed", platform: "ios", scanToken: "tok", bundleId: "com.test" } }
    );
    const result = run(findings);
    expect(result.analyticsPayload.framework).toBe("expo");
    expect(result.analyticsPayload.platform).toBe("ios");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd /Users/nickgodwin/Documents/AppStoreReject && npx vitest run tests/scripts/`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/nickgodwin/Documents/AppStoreReject
git add tests/scripts/
git commit -m "test: add vitest tests for scan pipeline scripts"
```

---

## Task 7: Rewrite SKILL.md to script execution sequence

**Files:**
- Modify: `skills/appstorereject-scan/SKILL.md` (skills repo)

- [ ] **Step 1: Replace SKILL.md content**

Replace the entire contents of `skills/appstorereject-scan/SKILL.md` with:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nickgodwin/Documents/appstorereject-skills
git add skills/appstorereject-scan/SKILL.md
git commit -m "feat: rewrite scan SKILL.md to scripted execution sequence"
```

---

## Task 8: Build admin checks page

**Files:**
- Create: `convex/scanCheckAdmin.ts` (backend repo)
- Create: `src/app/admin/checks/page.tsx` (backend repo)
- Modify: `src/components/admin/AdminSidebar.tsx` (backend repo)

- [ ] **Step 1: Create admin mutations for scanChecks**

Create `convex/scanCheckAdmin.ts`:

```typescript
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { assertAdmin } from "./lib/helpers";

export const listChecks = query({
  args: {
    section: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);

    let checks;
    if (args.section) {
      checks = await ctx.db
        .query("scanChecks")
        .withIndex("by_section_active", (q) => q.eq("section", args.section!))
        .collect();
    } else {
      checks = await ctx.db.query("scanChecks").collect();
    }

    checks.sort((a, b) => {
      if (a.section !== b.section) return a.section.localeCompare(b.section);
      return a.order - b.order;
    });

    return checks;
  },
});

export const updateCheck = mutation({
  args: {
    id: v.id("scanChecks"),
    risk: v.optional(
      v.union(v.literal("HIGH"), v.literal("MED"), v.literal("LOW"))
    ),
    findingTemplate: v.optional(v.string()),
    contextTemplate: v.optional(v.string()),
    slug: v.optional(v.string()),
    executionRules: v.optional(
      v.object({
        native_ios: v.optional(v.string()),
        expo_managed: v.optional(v.string()),
        react_native_cli: v.optional(v.string()),
        native_android: v.optional(v.string()),
      })
    ),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);
    const { id, ...patches } = args;

    // Remove undefined values
    const cleanPatches: Record<string, any> = {};
    for (const [key, value] of Object.entries(patches)) {
      if (value !== undefined) cleanPatches[key] = value;
    }

    if (Object.keys(cleanPatches).length === 0) return;
    await ctx.db.patch(id, cleanPatches);
  },
});

export const listGraph = query({
  args: {},
  handler: async (ctx) => {
    await assertAdmin(ctx);
    const entries = await ctx.db.query("scanGraph").collect();
    entries.sort((a, b) => {
      if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
      return a.order - b.order;
    });
    return entries;
  },
});
```

- [ ] **Step 2: Add "Checks" to AdminSidebar**

In `src/components/admin/AdminSidebar.tsx`, add to the `navItems` array:

```typescript
{ label: "Checks", href: "/admin/checks", icon: ListChecks },
```

Import `ListChecks` from `lucide-react` at the top of the file.

- [ ] **Step 3: Create the admin checks page**

Create `src/app/admin/checks/page.tsx`:

```typescript
"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ListChecks, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Id } from "../../../../convex/_generated/dataModel";

export default function ChecksPage() {
  const checks = useQuery(api.scanCheckAdmin.listChecks, {});
  const updateCheck = useMutation(api.scanCheckAdmin.updateCheck);
  const [expandedCheck, setExpandedCheck] = useState<Id<"scanChecks"> | null>(null);
  const [filterSection, setFilterSection] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  if (!checks) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <Skeleton className="mb-6 h-8 w-48" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="mb-2 h-12 w-full" />
        ))}
      </div>
    );
  }

  const sections = [...new Set(checks.map((c) => c.section))];
  const filtered = filterSection
    ? checks.filter((c) => c.section === filterSection)
    : checks;

  const riskColor = (risk: string) => {
    if (risk === "HIGH") return "destructive";
    if (risk === "MED") return "default";
    return "secondary";
  };

  const handleToggleActive = async (id: Id<"scanChecks">, currentActive: boolean) => {
    setProcessing(id);
    try {
      await updateCheck({ id, active: !currentActive });
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <ListChecks className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-extrabold tracking-tight">Scan Checks</h1>
        <Badge variant="secondary" className="ml-2">
          {checks.length} checks
        </Badge>
      </div>

      {/* Section filter */}
      <div className="mb-4 flex gap-2">
        <Button
          size="sm"
          variant={filterSection === null ? "default" : "outline"}
          onClick={() => setFilterSection(null)}
        >
          All
        </Button>
        {sections.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={filterSection === s ? "default" : "outline"}
            onClick={() => setFilterSection(s)}
          >
            {s}
          </Button>
        ))}
      </div>

      {/* Checks list */}
      <div className="space-y-1">
        {filtered.map((check) => (
          <div key={check._id} className="rounded-md border border-border/50">
            <button
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted/30"
              onClick={() =>
                setExpandedCheck(expandedCheck === check._id ? null : check._id)
              }
            >
              {expandedCheck === check._id ? (
                <ChevronDown className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0" />
              )}
              <span className="font-mono text-xs text-muted-foreground w-16">
                {check.guideline}
              </span>
              <Badge variant={riskColor(check.risk)} className="text-[10px]">
                {check.risk}
              </Badge>
              <span className="flex-1 font-medium">{check.checkId}</span>
              <Badge variant={check.active ? "default" : "secondary"} className="text-[10px]">
                {check.active ? "active" : "disabled"}
              </Badge>
              <span className="text-xs text-muted-foreground">{check.section}</span>
            </button>

            {expandedCheck === check._id && (
              <div className="border-t border-border/50 px-4 py-3 space-y-3 text-sm">
                <div>
                  <span className="font-medium">Finding: </span>
                  <span className="text-muted-foreground">{check.findingTemplate}</span>
                </div>
                <div>
                  <span className="font-medium">Slug: </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {check.slug || "—"}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Platforms: </span>
                  {check.platforms.map((p) => (
                    <Badge key={p} variant="outline" className="mr-1 text-[10px]">
                      {p}
                    </Badge>
                  ))}
                </div>
                <div className="space-y-2">
                  <span className="font-medium">Execution Rules:</span>
                  {Object.entries(check.executionRules).map(
                    ([fw, rule]) =>
                      rule && (
                        <div key={fw} className="rounded bg-muted/30 p-2">
                          <div className="font-mono text-xs font-medium mb-1">{fw}</div>
                          <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
                            {rule}
                          </pre>
                        </div>
                      )
                  )}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant={check.active ? "destructive" : "default"}
                    disabled={processing === check._id}
                    onClick={() => handleToggleActive(check._id, check.active)}
                  >
                    {check.active ? "Disable" : "Enable"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify page renders**

Run `npx convex dev` (if not running), then open `http://localhost:3000/admin/checks` in the browser. Should show the check list with section filters and expandable details.

- [ ] **Step 5: Commit**

```bash
cd /Users/nickgodwin/Documents/AppStoreReject
git add convex/scanCheckAdmin.ts src/app/admin/checks/page.tsx src/components/admin/AdminSidebar.tsx
git commit -m "feat: add /admin/checks page for managing scan check definitions"
```

---

## Task 9: Delete markdown check files and update README

**Files:**
- Delete: `skills/appstorereject-scan/references/checks-*.md` (6 files)
- Delete: `skills/appstorereject-scan/references/graph-*.md` (2 files)
- Modify: `README.md` (skills repo)

- [ ] **Step 1: Delete the markdown reference files**

```bash
cd /Users/nickgodwin/Documents/appstorereject-skills
rm skills/appstorereject-scan/references/checks-privacy.md
rm skills/appstorereject-scan/references/checks-payments.md
rm skills/appstorereject-scan/references/checks-completeness.md
rm skills/appstorereject-scan/references/checks-performance.md
rm skills/appstorereject-scan/references/checks-design.md
rm skills/appstorereject-scan/references/checks-legal.md
rm skills/appstorereject-scan/references/graph-ios.md
rm skills/appstorereject-scan/references/graph-android.md
```

- [ ] **Step 2: Update README prerequisites**

In `README.md`, add Node.js to the prerequisites section:

```markdown
## Prerequisites

- Node.js 18+
- curl
- bash 4+
```

- [ ] **Step 3: Commit**

```bash
cd /Users/nickgodwin/Documents/appstorereject-skills
git add -A
git commit -m "chore: remove markdown check files, update prerequisites to require Node.js 18+"
```

---

## Task 10: Deploy to production and end-to-end test

**Files:** No new files — deployment and verification only.

- [ ] **Step 1: Deploy Convex to production**

```bash
cd /Users/nickgodwin/Documents/AppStoreReject && npx convex deploy --yes
```

- [ ] **Step 2: Run seed migration on production**

```bash
cd /Users/nickgodwin/Documents/AppStoreReject && npx convex run --prod migrations/seedScanChecks:seedScanChecks
```

Expected: `{ message: "Seeded successfully", checks: 47, graph: 12 }`

- [ ] **Step 3: Deploy frontend to Vercel**

```bash
cd /Users/nickgodwin/Documents/AppStoreReject && npx vercel --prod
```

- [ ] **Step 4: Verify production endpoints**

```bash
# Graph endpoint (no auth)
curl -s "https://api.appstorereject.com/api/scan/graph?platform=ios" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d[\"sections\"])} sections')"
```
Expected: `6 sections`

```bash
# Checks endpoint (needs scanToken — test via a full scan flow)
```

- [ ] **Step 5: Run end-to-end scan with new skills**

In a test project with the updated skills package:
1. Run `npx skills add nickgdwn/appstorereject-skills` to get the new scripts + SKILL.md
2. Trigger a scan: "Scan my app for App Store rejection risks"
3. Verify:
   - `detect-platform.js` runs and outputs correct framework
   - Graph loads from API
   - Skip conditions evaluated locally
   - Checks loaded in single bulk request
   - Findings recorded with exact field values from API
   - Resolution guides fetched and displayed verbatim
   - Analytics reported successfully

- [ ] **Step 6: Verify admin checks page on production**

Open `https://appstorereject.com/admin/checks` and verify:
- 47 checks listed
- Section filters work
- Expandable details show execution rules
- Enable/disable toggle works
