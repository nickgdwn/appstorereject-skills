# Android Check Graph

Walk these sections in order. For each section, evaluate the skip condition before loading checks.

## Section: Privacy (Data Safety)
Priority: HIGH — #1 Android rejection cause
Checks file: checks-privacy.md
Skip if: No network calls found (no fetch/axios/OkHttp/Retrofit/Volley imports), no third-party SDKs in dependencies, and no INTERNET permission declared in AndroidManifest.xml

### Framework Notes
- **Native Android:** Check AndroidManifest.xml for permission declarations, data safety declarations in Play Console, check for READ_CONTACTS/ACCESS_FINE_LOCATION/CAMERA usage against declared data collection
- **Expo managed:** Check app.json android.permissions array, check for expo-location/expo-contacts/expo-camera in dependencies
- **React Native CLI / Expo bare:** Check android/app/src/main/AndroidManifest.xml for permissions, check for react-native-permissions usage

## Section: Payments (Google Play Billing)
Priority: HIGH — #2 Android rejection cause
Checks file: checks-payments.md
Skip if: No com.android.billingclient/react-native-iap/expo-in-app-purchases in dependencies AND no subscription/premium/unlock/purchase keywords in source AND no BILLING permission in AndroidManifest.xml

### Framework Notes
- **Native Android:** Check for Billing Library dependency in build.gradle, look for external payment URLs or direct carrier billing bypasses
- **Expo managed:** Check for expo-in-app-purchases or react-native-iap in dependencies, check app.json for billing config
- **React Native CLI / Expo bare:** Check for react-native-iap in package.json, check android/app/build.gradle for billing library

## Section: App Completeness (Content Policy)
Priority: HIGH — #3 Android rejection cause
Checks file: checks-completeness.md
Skip if: Never — always check this section

### Framework Notes
- **All frameworks:** Check for placeholder content, debug flags (BuildConfig.DEBUG left in release paths, hardcoded test API keys), broken deep links
- **Native Android:** Check AndroidManifest.xml for android:debuggable="true", check build.gradle for release signing config, check for TODO/FIXME in code paths
- **Expo managed:** Check app.json for placeholder values (name, slug, icon, android.package), check eas.json for production build profile
- **React Native CLI / Expo bare:** Check android/app/build.gradle for debug build type leaking into release, check for __DEV__ guards around debug tooling

## Section: Performance
Priority: MEDIUM
Checks file: checks-performance.md
Skip if: targetSdkVersion is current (within 1 year of latest Android API level), no background services declared in AndroidManifest.xml, and no WorkManager/JobScheduler/AlarmManager imports found

### Framework Notes
- **Native Android:** Check targetSdkVersion in build.gradle (must meet Play Store minimums), check for deprecated background service patterns, check for excessive wake locks or WAKE_LOCK permission without justification
- **Expo managed:** Check app.json android.targetSdkVersion, check for expo-background-fetch/expo-task-manager usage
- **React Native CLI / Expo bare:** Check android/app/build.gradle targetSdkVersion, check for react-native-background-job or headless JS task registration

## Section: Design (Material Design)
Priority: MEDIUM
Checks file: checks-design.md
Skip if: App uses only standard React Native core components or Jetpack Compose Material3 components with no custom navigation or UI framework

### Framework Notes
- **Native Android:** Check for Material Design component usage (com.google.android.material), check res/mipmap for adaptive icon layers (ic_launcher_foreground/ic_launcher_background), check for proper back navigation handling
- **Expo managed:** Check app.json android.adaptiveIcon config for foreground/background images, check for expo-router back handler setup
- **React Native CLI / Expo bare:** Check android/app/src/main/res/mipmap-anydpi-v26/ for adaptive icon XML, check for react-navigation Android back button handling

## Section: Legal
Priority: LOW
Checks file: checks-legal.md
Skip if: No user-generated content, no age-restricted content, no subscriptions, app targets all ages (no COPPA concerns), and privacy policy URL is already confirmed present in Play Console metadata

### Framework Notes
- **All frameworks:** Check for content rating questionnaire answers matching actual app content, verify privacy policy URL is reachable, check for age gating if app contains mature content
- **Native Android:** Check AndroidManifest.xml for android:targetSandboxVersion if targeting children, check for compliance with Families Policy if app appears in family categories
- **Expo managed:** Check app.json for privacyPolicyUrl, check if any analytics SDKs (Firebase, Amplitude) require COPPA configuration flags
