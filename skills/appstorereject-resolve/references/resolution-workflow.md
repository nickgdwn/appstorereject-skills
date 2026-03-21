# Resolution Workflow

When planning fixes for a rejection, follow this structured approach.

## 1. Map Resolution Steps to Codebase

For each resolution step from the API:
- Identify which files in the developer's project are affected
- Check the framework (Native iOS, Expo, React Native, Native Android) to know where config lives
- Don't assume file locations — search the codebase

### Framework-Specific Config Locations

#### Native iOS (Swift/ObjC)
- Privacy: `PrivacyInfo.xcprivacy`, `Info.plist`
- Entitlements: `*.entitlements`
- IAP: StoreKit configuration, `SKPaymentQueue` usage
- App metadata: `Info.plist` (CFBundleVersion, launch storyboard, etc.)

#### Expo (Managed Workflow)
- Privacy: `app.json` > `expo.plugins` > `expo-build-properties` or `privacyManifests`
- Entitlements: `app.json` > `expo.ios.entitlements`
- IAP: `expo-in-app-purchases` or `react-native-iap` config
- App metadata: `app.json` > `expo.ios` / `expo.android`

#### Expo (Bare Workflow) / React Native CLI
- Same as Native iOS/Android, but check for RN-specific patterns
- Config may be split between `app.json` and native directories (`ios/`, `android/`)
- Check `react-native.config.js` for custom native module config

#### Native Android (Kotlin/Java)
- Privacy: `AndroidManifest.xml` permissions, data safety section
- IAP: Google Play Billing Library usage
- App metadata: `build.gradle` (versionCode, targetSdkVersion, etc.)

## 2. Propose Minimal Changes

- Fix only what the rejection requires — don't refactor surrounding code
- If the rejection cites a specific section, address that section only
- Prefer configuration changes over code changes when possible
- For privacy rejections: adding declarations/manifests is usually enough

## 3. Explain the "Why"

For each proposed change, explain:
- Which guideline requirement it satisfies
- Why the current state triggered the rejection
- How the change prevents future rejections for the same guideline

## 4. Common Pitfalls

- **Guideline 2.1 (App Completeness):** Check for placeholder content, broken links, test/debug flags, missing demo account credentials in App Review notes
- **Guideline 3.1.1 (In-App Purchase):** ALL digital content/features must use Apple/Google's payment system — including unlocks, upgrades, subscriptions. External payment links are not allowed.
- **Guideline 5.1.1 (Data Collection):** Must have privacy manifest, tracking disclosure, and purpose strings for ALL data collected — including by third-party SDKs
- **Guideline 4.3 (Spam):** Apps must provide unique value. Template apps, web wrappers with no native functionality, and apps that duplicate existing Apple functionality may be rejected.
