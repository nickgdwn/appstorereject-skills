# iOS Check Graph

Walk these sections in order. For each section, evaluate the skip condition before loading checks.

## Section: Privacy (Guidelines 5.1.x)
Priority: HIGH — #1 iOS rejection cause
Checks file: checks-privacy.md
Skip if: No network calls found (no fetch/axios/URLSession/Alamofire imports), no third-party SDKs in dependencies, and no data collection frameworks

### Framework Notes
- **Native iOS:** Check PrivacyInfo.xcprivacy, Info.plist purpose strings, ATT framework
- **Expo managed:** Check app.json plugins for privacyManifests config, expo-tracking-transparency
- **React Native CLI / Expo bare:** Check ios/ directory for PrivacyInfo.xcprivacy, Info.plist

## Section: In-App Purchase (Guidelines 3.1.x)
Priority: HIGH — #2 iOS rejection cause
Checks file: checks-payments.md
Skip if: No StoreKit/react-native-iap/expo-in-app-purchases in dependencies AND no subscription/premium/unlock keywords in source

### Framework Notes
- **Native iOS:** Check for StoreKit/StoreKit2 usage, look for external payment URLs
- **Expo managed:** Check for expo-in-app-purchases or react-native-iap in dependencies
- **React Native CLI / Expo bare:** Check for react-native-iap, StoreKit bridging

## Section: App Completeness (Guideline 2.1)
Priority: HIGH — #3 iOS rejection cause
Checks file: checks-completeness.md
Skip if: Never — always check this section

### Framework Notes
- **All frameworks:** Check for placeholder content, debug flags, test credentials, broken URLs
- **Expo managed:** Check app.json for placeholder values (name, slug, icon)
- **Native iOS:** Check Info.plist for required keys, launch storyboard presence

## Section: Performance (Guidelines 2.x)
Priority: MEDIUM
Checks file: checks-performance.md
Skip if: Simple utility app with no background modes declared and binary under 50MB

### Framework Notes
- **Native iOS:** Check for background modes, memory-intensive patterns
- **Expo/RN:** Check for large bundle sizes, excessive native module dependencies

## Section: Design (Guidelines 4.x)
Priority: MEDIUM
Checks file: checks-design.md
Skip if: App uses only standard UIKit/SwiftUI/React Native components with no custom UI framework

### Framework Notes
- **Native iOS:** Check for HIG compliance signals, accessibility labels
- **Expo/RN:** Check for platform-specific UI adaptations (not just Android-style on iOS)

## Section: Legal (Guidelines 5.2.x)
Priority: LOW
Checks file: checks-legal.md
Skip if: No user-generated content, no age-restricted content, no subscriptions, and app targets all ages

### Framework Notes
- **All frameworks:** Check for EULA, age gating, content ratings configuration
