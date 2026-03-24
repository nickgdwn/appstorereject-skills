# Completeness Checks

12 checks covering Apple Guideline 2.1 (App Completeness) and Google Play equivalents.

---

### Check: placeholder_content
Guideline: 2.1
Confidence: HIGH when lorem ipsum, TODO markers, or placeholder text found in user-facing files
Risk: HIGH
Finding template: "{match_count} placeholder/TODO instances in user-facing code"

#### Native iOS
- Grep ALL user-facing files for placeholder text:
  - `.swift`, `.m`, `.storyboard`, `.xib`, `.strings`, `.plist` files
  - Patterns (case-insensitive): `lorem ipsum`, `dolor sit amet`, `TODO`, `FIXME`, `HACK`, `XXX`
  - `"Coming Soon"`, `"Under Construction"`, `"placeholder"`, `"sample text"`, `"test data"`
  - `"TBD"`, `"insert.*here"`, `"replace.*this"`, `"example.com"` (in user-facing strings)
- Exclude: test files (`*Test*.swift`, `*Spec*.swift`), comments-only matches in non-UI code
- Focus on: string literals in ViewControllers, SwiftUI Views, storyboard text, Localizable.strings

#### Expo managed
- Grep `src/**/*.{ts,tsx,js,jsx}`, `app/**/*.{ts,tsx,js,jsx}` for:
  - Same patterns as above within JSX text content and string literals
  - `"Lorem"`, `"ipsum"`, `"TODO"`, `"Coming Soon"`, `"placeholder"`
  - Template literal placeholders: `` `${todo}` ``, `"Sample"`, `"Test Item"`
- Check `app.json` for: placeholder description, default Expo description text
- Exclude: `node_modules/`, test files (`*.test.*`, `*.spec.*`, `__tests__/`)

#### React Native CLI
- Same source grep as Expo managed
- Also check `ios/**/*.strings`, `android/**/strings.xml` for placeholder text
- Check `android/**/res/layout/*.xml` for `android:text="placeholder"` or `tools:text` left in production views

#### Native Android
- Grep `res/values/strings.xml` and all `res/values-*/strings.xml` for placeholder patterns
- Grep `res/layout/*.xml` for hardcoded `android:text=` containing placeholder content
- Grep `**/*.java`, `**/*.kt` for TODO/FIXME/placeholder string literals in Activities and Fragments
- Check `res/drawable/` for placeholder image filenames: `placeholder.*`, `sample.*`, `test.*`

Context template: "Found {match_count} placeholder/TODO instances in {file_count} user-facing files. Matches: {matches_summary}. Apple rejects apps with placeholder content, unfinished features, or TODO markers visible to users. Files: {affected_files}."

---

### Check: debug_flags_enabled
Guideline: 2.1
Confidence: HIGH when debug/development flags or URLs are found in production-path code
Risk: HIGH
Finding template: "Debug flags or development URLs in production code"

#### Native iOS
- Grep for debug indicators in non-test Swift/ObjC files:
  - `#if DEBUG` blocks that enable features (check what's inside — some are fine)
  - `isDebug = true`, `debugMode = true`, `DEBUG_ENABLED`
  - Development URLs: `localhost`, `127.0.0.1`, `0.0.0.0`, `192.168.`, `10.0.`, `.local:`, `staging.`
  - `print(` or `NSLog(` at high frequency (> 20 instances suggests debug logging left in)
  - `DEVELOPMENT_TEAM` is fine — it's build config, not a debug flag
- Check scheme/build settings: `*.xcscheme` files for `buildConfiguration = "Debug"` as launch config

#### Expo managed
- Grep `src/**/*.{ts,tsx,js,jsx}` for:
  - `__DEV__` usage that gates features (check context — some is correct RN practice)
  - `console.log(`, `console.warn(`, `console.error(` — count total; > 30 is a flag
  - `debugMode`, `isDebug`, `DEBUG`, `DEVELOPMENT`
  - Development URLs: `http://localhost`, `http://127.0.0.1`, `http://10.0.`, `http://192.168.`
  - `.env.development` values leaked into source (hardcoded dev API URLs)
- Check `app.json` for development-only config left in

#### React Native CLI
- Same as Expo managed
- Check `ios/*/Info.plist` for development URLs in `NSAppTransportSecurity` exceptions (some are fine, excessive ones are a flag)
- Check `android/app/build.gradle` for `buildConfigField` debug values in release config

#### Native Android
- Grep `**/*.java`, `**/*.kt` for:
  - `Log.d(`, `Log.v(` at high frequency
  - `BuildConfig.DEBUG` usage that gates features
  - `StrictMode.setThreadPolicy` (development tool left in production)
  - Development URLs in string resources or constants
- Check `build.gradle` release buildType for `debuggable true` (covered separately in `android_debug_build`)

Context template: "Found {debug_count} debug indicators in production code. Development URLs: {dev_urls}. Console/log statements: {log_count} across {log_files} files. Debug flags: {debug_flags}. Reviewers test release builds — ensure debug code is stripped or gated behind build configuration."

---

### Check: test_credentials_exposed
Guideline: 2.1
Confidence: HIGH when hardcoded API keys, test accounts, or passwords found in source
Risk: HIGH
Finding template: "Hardcoded credentials or test API keys in source"

#### Native iOS
- Grep all source files (excluding tests) for:
  - API key patterns: `"sk_test_"`, `"pk_test_"`, `"sk_live_"` (Stripe), `"AIza"` (Google), `"AKIA"` (AWS)
  - `"api_key"`, `"apiKey"`, `"API_KEY"` assigned to string literals (not env vars)
  - Test accounts: `"test@"`, `"testuser"`, `"admin@"`, `"user@example"`, `"demo@"`
  - Passwords: `"password"`, `"password123"`, `"123456"`, `"qwerty"`, `"secret"`, `"changeme"`
  - Tokens: `"Bearer test"`, `"token_test"`, `"eyJ"` (JWT literals)
  - Firebase: `"AIzaSy"` (API key), check GoogleService-Info.plist is not committed with prod keys
- Glob: `**/*.swift`, `**/*.m`, `**/*.h`, `**/*.plist` (exclude `*Test*`, `*Mock*`, `Pods/`)

#### Expo managed
- Grep `src/**/*.{ts,tsx,js,jsx}`, `app/**/*.{ts,tsx,js,jsx}`, `*.config.*` for:
  - Same API key patterns as above
  - `process.env.` values hardcoded as fallbacks: `process.env.API_KEY || "hardcoded_key"`
  - Check `.env*` files are in `.gitignore`
  - Check `app.json` `extra` field for hardcoded keys
  - Check `eas.json` for exposed secrets
- Verify `.gitignore` includes: `.env`, `.env.local`, `.env.production`, `google-services.json`, `GoogleService-Info.plist`

#### React Native CLI
- Same as Expo managed
- Check `ios/GoogleService-Info.plist` and `android/app/google-services.json` for production keys committed to repo
- Check `android/app/src/main/res/values/strings.xml` for API keys

#### Native Android
- Grep `**/*.java`, `**/*.kt`, `**/*.xml`, `**/*.properties` for:
  - API key patterns above
  - `gradle.properties` for hardcoded keys (should use `local.properties`)
  - `BuildConfig` fields with hardcoded secrets in `build.gradle`
  - `res/values/strings.xml` containing keys or tokens
- Check `.gitignore` includes `local.properties`, `keystore` files, `google-services.json`

Context template: "Found {credential_count} potential hardcoded credentials in {file_count} files. Types: {credential_types}. Files: {affected_files}. Hardcoded test credentials cause rejection and are a security risk. Move secrets to environment variables or secure storage."

---

### Check: broken_links
Guideline: 2.1
Confidence: MEDIUM when URLs pointing to localhost, test domains, or unreachable hosts found in source
Risk: MED
Finding template: "{url_count} development/localhost URLs in source code"

#### Native iOS
- Grep all source files for URL patterns:
  - `http://localhost`, `https://localhost`, `http://127.0.0.1`, `http://0.0.0.0`
  - `http://10.0.`, `http://192.168.`, `http://172.16.` (private IP ranges)
  - `.test/`, `.local/`, `.example/`, `.invalid/` (reserved TLD domains)
  - `staging.`, `dev.`, `sandbox.` in URL strings (may be intentional but worth flagging)
  - `http://` URLs (non-HTTPS) that aren't localhost — iOS blocks these by default via ATS
- Exclude: `Info.plist` NSAppTransportSecurity exceptions (these are config, not broken links), test files, comments

#### Expo managed
- Grep `src/**/*.{ts,tsx,js,jsx}` and config files for URL patterns above
- Check `app.json` for: `expo.ios.associatedDomains`, `expo.scheme` pointing to dev URLs
- Check API base URL constants: `BASE_URL`, `API_URL`, `BACKEND_URL` — verify they're not hardcoded to dev
- Check `eas.json` for environment-specific URLs that might leak

#### React Native CLI
- Same as Expo managed
- Check `ios/*/Info.plist` for `NSAppTransportSecurity` `NSExceptionDomains` pointing to dev servers
- Check `android/app/src/main/res/xml/network_security_config.xml` for dev domains

#### Native Android
- Grep source and resource files for localhost/private IP URLs
- Check `res/xml/network_security_config.xml` for `<domain includeSubdomains="true">` pointing to dev domains
- Check `res/values/strings.xml` for URL values
- Grep `AndroidManifest.xml` for `<data android:host=` pointing to test domains

Context template: "Found {url_count} potentially broken or development URLs in {file_count} files: {url_list}. Development/localhost URLs will fail on reviewers' devices. Verify all URLs point to production endpoints. Non-HTTPS URLs: {http_count} (blocked by default on iOS)."

---

### Check: missing_demo_account
Guideline: 2.1
Confidence: MEDIUM when authentication flow exists but no demo credentials are documented
Risk: MED
Finding template: "Auth flow exists but no demo account documentation found"

#### Native iOS
- Detect authentication flow:
  - Grep for: `ASAuthorizationController` (Sign in with Apple), `GIDSignIn` (Google), `LoginManager` (Facebook)
  - Grep for: `signIn`, `logIn`, `authenticate`, `UITextField` with `isSecureTextEntry`
  - Grep for: login/signup screens in storyboards: `LoginViewController`, `SignUpViewController`, `AuthViewController`
- Check for demo account documentation:
  - Glob: `**/DEMO*`, `**/demo*`, `**/review*`, `**/test-account*`
  - Grep: `"demo account"`, `"test account"`, `"reviewer"`, `"App Review"`
  - Check `fastlane/metadata/review_information/` for demo credentials
  - Check project root for `REVIEW_NOTES*`, `APP_REVIEW*`
- Note: Demo account is configured in App Store Connect, but having no documentation anywhere suggests it hasn't been set up

#### Expo managed
- Detect auth: Check `package.json` for `expo-auth-session`, `expo-apple-authentication`, `@react-native-google-signin`, auth libraries
- Grep source for login screens, `SecureStore`, password inputs
- Check for demo/review documentation in project root

#### React Native CLI
- Same as Expo managed
- Check `fastlane/` directory for review information metadata

#### Native Android
- Detect auth in Java/Kotlin source and layouts
- Check `fastlane/metadata/android/` for review notes
- Note: Google Play also requests login credentials for apps with sign-in during review

Context template: "Authentication flow detected ({auth_methods}) but no demo account documentation found in project. Apple requires demo credentials in App Store Connect for apps with login. Searched for review notes in: {searched_locations}. Login-related files: {auth_files}."

---

### Check: crash_on_launch
Guideline: 2.1
Confidence: HIGH when required configuration files are missing that would cause a startup crash
Risk: HIGH
Finding template: "Required configuration missing — {dependency} will crash on launch"

#### Native iOS
- Check for required config files based on SDK usage:
  - If `Firebase` in Podfile/SPM -> glob for `GoogleService-Info.plist` (must exist in app bundle)
  - If `Google Maps` / `GMSServices` in source -> check for API key in `AppDelegate` or `Info.plist`
  - If `Crashlytics` -> `GoogleService-Info.plist` required
  - If `Realm` -> check for schema version migration (grep `schemaVersion`, `migrationBlock`)
  - If `CoreData` -> check for `.xcdatamodeld` files, verify model exists
- Check `Info.plist` for required keys based on frameworks:
  - Missing `CFBundleDisplayName` or `CFBundleName`
  - Missing `UILaunchStoryboardName` without alternative launch screen

#### Expo managed
- Check `app.json` for:
  - Missing `expo.ios.bundleIdentifier` or `expo.android.package`
  - Missing `expo.slug` (required for builds)
  - Invalid `expo.sdkVersion` (must match installed expo version)
- Check `package.json` dependencies match `expo` SDK version requirements
- If Firebase: check for `google-services.json` and `GoogleService-Info.plist` in project
- Check `app.json` plugins array — missing plugin for an installed native module causes crash

#### React Native CLI
- Check for required files:
  - `ios/*/GoogleService-Info.plist` if Firebase in Podfile
  - `android/app/google-services.json` if Firebase in build.gradle
  - `ios/Podfile.lock` exists (pods installed)
  - `android/local.properties` with valid SDK path
- Check `MainApplication.java`/`MainApplication.kt` for package initialization that references missing modules

#### Native Android
- Check for:
  - `google-services.json` if `com.google.gms.google-services` plugin in build.gradle
  - `AndroidManifest.xml` `<application android:name=` references a class that exists
  - Missing `<activity>` for the launcher intent
  - ProGuard/R8 rules missing for libraries that require them (check `proguard-rules.pro`)
  - `minSdkVersion` vs actual API usage — calling API 31 methods without version check on API 21 device

Context template: "Potential crash-on-launch: {missing_config} is missing but required by {dependency}. This will cause an immediate crash when reviewers launch the app. Required files status: {file_status_list}. Priority: fix before submission."

---

### Check: incomplete_localization
Guideline: 2.1
Confidence: MEDIUM when localization files are partially translated or mixed languages detected
Risk: MED
Finding template: "Localization files partially translated ({missing_count} missing translations)"

#### Native iOS
- Glob: `**/*.lproj/Localizable.strings`, `**/*.lproj/*.strings`
- Compare key counts across all `.lproj` directories:
  - Parse each `.strings` file for key count
  - Flag if any localization has significantly fewer keys than `Base.lproj` or `en.lproj`
- Grep `.strings` files for empty values: `= "";` or `= " ";`
- Grep `.strings` files for untranslated text (English text in non-English localization files — heuristic: check if values match between `en.lproj` and other locales)
- Check `Info.plist` `CFBundleLocalizations` matches available `.lproj` directories

#### Expo managed
- Check for localization setup:
  - `package.json` for `i18next`, `react-intl`, `expo-localization`, `react-native-localize`
  - Glob: `**/locales/*.json`, `**/translations/*.json`, `**/i18n/*.json`, `**/lang/*.json`
- Compare key counts across locale JSON files
- Check for hardcoded English strings in JSX alongside localization setup (mixing patterns)

#### React Native CLI
- Same as Expo managed for JS/TS localization
- Also check `ios/**/*.lproj/*.strings` for native iOS strings
- Check `android/app/src/main/res/values-*/strings.xml` — compare key counts across locales

#### Native Android
- Glob: `res/values-*/strings.xml` for all locale-specific string files
- Compare `<string>` element counts against `res/values/strings.xml` (default locale)
- Grep for empty strings: `<string name="..."></string>` or `<string name="..."> </string>`
- Check for `translatable="false"` markers — these are intentionally excluded
- Verify `res/values/strings.xml` has no mixed-language content

Context template: "Found {locale_count} localizations. Completeness: {completeness_summary}. Empty/missing translations: {missing_count} strings across {incomplete_locales}. Apple and Google reject apps with partially translated interfaces — either complete all localizations or remove incomplete ones."

---

### Check: missing_app_icon
Guideline: 2.1
Confidence: HIGH when no app icon is configured in the project
Risk: HIGH
Finding template: "App icon has no image files assigned"

#### Native iOS
- Check `Assets.xcassets/AppIcon.appiconset/`:
  - Glob: `**/AppIcon.appiconset/Contents.json`
  - Read `Contents.json` — check that `images` array has entries with `filename` values (not all null/empty)
  - Verify referenced image files actually exist in the same directory
  - Minimum required: 1024x1024 App Store icon
- If no `AppIcon.appiconset` found at all -> HIGH confidence

#### Expo managed
- Check `app.json` for `expo.icon` — must point to a valid file
- Check `expo.ios.icon` (iOS-specific override)
- Check `expo.android.adaptiveIcon.foregroundImage` and `expo.android.adaptiveIcon.backgroundColor`
- Verify the referenced icon file exists: glob for the path specified
- Default Expo icon (the Expo logo) will cause rejection

#### React Native CLI
- Check `ios/**/AppIcon.appiconset/Contents.json` as in Native iOS
- Check `android/app/src/main/res/mipmap-*/ic_launcher.png` — verify files exist and are not the default Android robot icon
- Check for adaptive icon: `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`

#### Native Android
- Verify `res/mipmap-xxxhdpi/ic_launcher.png` exists (or adaptive icon XML)
- Check `AndroidManifest.xml` for `android:icon="@mipmap/ic_launcher"` — verify the referenced resource exists
- Check all density buckets: `mipmap-mdpi`, `mipmap-hdpi`, `mipmap-xhdpi`, `mipmap-xxhdpi`, `mipmap-xxxhdpi`
- Verify `ic_launcher_round.png` exists if `android:roundIcon` is declared

Context template: "App icon issue: {icon_status}. {missing_details}. Apple requires a 1024x1024 App Store icon and device-resolution icons. Android requires icons in all mipmap density buckets. Missing: {missing_sizes}."

---

### Check: missing_launch_screen
Guideline: 2.1
Confidence: HIGH when no launch screen / splash screen is configured (iOS)
Risk: HIGH
Finding template: "No launch screen configured"

#### Native iOS
- Check for launch screen:
  - Glob: `**/LaunchScreen.storyboard`, `**/Launch Screen.storyboard`
  - Glob: `**/LaunchScreen.xib`
  - Check `Info.plist` for `UILaunchStoryboardName` key
  - Check `*.xcodeproj/project.pbxproj` for `INFOPLIST_KEY_UILaunchStoryboardName`
- If using launch screen image (iOS 14+):
  - Check `Info.plist` for `UILaunchScreen` dictionary
  - Check `Assets.xcassets` for launch image set
- Missing launch screen shows a black screen on launch — guaranteed rejection

#### Expo managed
- Check `app.json` for `expo.splash`:
  - `image` — must point to valid file
  - `backgroundColor` — should be set
  - `resizeMode` — should be set (`contain` or `cover`)
- Check `expo.ios.splash` for iOS-specific splash config
- Default Expo splash screen is acceptable during development but should be customized for production

#### React Native CLI
- Check `ios/*/LaunchScreen.storyboard` exists
- Check `ios/*/Info.plist` for `UILaunchStoryboardName`
- Verify the storyboard is not the default React Native one (contains "Powered by React Native" text — grep the storyboard XML)
- Default RN launch screen shows app name in plain text — not a rejection but looks unprofessional

#### Native Android
- Check for splash screen:
  - `res/values/styles.xml` or `res/values/themes.xml` for `windowBackground` or `postSplashScreenTheme`
  - Android 12+: `res/values-v31/themes.xml` for `android:windowSplashScreen*` attributes
  - Check for `SplashScreen` API usage in `MainActivity`
- Note: Android splash screen is less likely to cause rejection than iOS but still recommended

Context template: "Launch screen: {launch_screen_status}. {details}. iOS apps without a launch screen show a black screen on startup — Apple will reject. Searched: {searched_paths}. {recommendation}."

---

### Check: beta_indicators
Guideline: 2.1
Confidence: HIGH when "Beta", "Test", "Debug", or "Dev" appears in the app display name or bundle info
Risk: HIGH
Finding template: "Beta/test/debug text found in app identity: '{beta_text}'"

#### Native iOS
- Check `Info.plist` for beta indicators in:
  - `CFBundleDisplayName` — the name shown under the app icon
  - `CFBundleName` — the internal app name
  - `CFBundleShortVersionString` containing "beta", "alpha", "rc", "dev"
- Grep `*.xcodeproj/project.pbxproj` for `PRODUCT_NAME` and `MARKETING_VERSION` containing these terms
- Check `*.xcscheme` files for scheme names (less critical but informative)
- Patterns (case-insensitive): `beta`, `test`, `debug`, `dev`, `alpha`, `staging`, `internal`, `canary`

#### Expo managed
- Check `app.json` for:
  - `expo.name` — displayed to users
  - `expo.slug` — used in URLs/builds
  - `expo.version` containing beta/alpha indicators
  - `expo.ios.buildNumber`, `expo.android.versionCode` (less critical)
- Grep source for app name display that includes beta text

#### React Native CLI
- Check `ios/*/Info.plist` for `CFBundleDisplayName`, `CFBundleName`
- Check `android/app/src/main/res/values/strings.xml` for `app_name` value
- Check `android/app/build.gradle` for `versionName` containing beta/alpha

#### Native Android
- Check `res/values/strings.xml` for `<string name="app_name">` containing beta indicators
- Check `AndroidManifest.xml` for `android:label` containing beta text
- Check `build.gradle` `defaultConfig` for `versionName` with beta/alpha/dev suffix

Context template: "Beta indicator found in app identity: '{beta_text}' in {location}. Apple Guideline 2.1 prohibits beta, test, or pre-release language in submitted apps. The app name '{app_name}' must not contain: beta, test, debug, dev, alpha, staging. Update before submission."

---

### Check: expo_placeholder_config
Guideline: 2.1
Confidence: HIGH when Expo app.json contains default/placeholder configuration values
Risk: HIGH
Finding template: "Expo app.json contains default/placeholder configuration"

#### Native iOS
- Not directly applicable (Expo-specific check)

#### Expo managed
- Check `app.json` or `app.config.js`/`app.config.ts` for default Expo values:
  - `expo.slug` === `"my-app"` or contains `"example"`, `"template"`, `"starter"`
  - `expo.name` === `"my-app"` or default template name
  - `expo.description` is empty or contains default Expo text
  - `expo.icon` === `"./assets/icon.png"` — verify it's not the default Expo icon (check file hash or size; default Expo icon is ~2KB)
  - `expo.splash.image` === `"./assets/splash.png"` — same check for default splash
  - `expo.ios.bundleIdentifier` contains `"com.example"`, `"com.yourcompany"`, `"com.anonymous"`
  - `expo.android.package` contains `"com.example"`, `"com.yourcompany"`, `"com.anonymous"`
  - `expo.owner` is missing or placeholder
  - `expo.scheme` === `"myapp"` or `"exp+my-app"`
- Check `package.json` `name` field for template defaults

#### React Native CLI
- Check `ios/*/Info.plist` for `CFBundleIdentifier` containing `com.example`, `org.reactjs.native.example`
- Check `android/app/build.gradle` `applicationId` for `com.example`, template defaults
- Check `app.json` (React Native root config) for default name/displayName

#### Native Android
- Check `build.gradle` `applicationId` for `com.example.*` or template defaults
- Check `res/values/strings.xml` `app_name` for template defaults

Context template: "Expo placeholder configuration detected: {placeholder_items}. Default values found: {default_values}. Apps with template/placeholder configuration are rejected as incomplete. Update: {recommendations}."

---

### Check: android_debug_build
Guideline: 2.1
Confidence: HIGH when Android release build is configured as debuggable
Risk: HIGH
Finding template: "Android release build configured as debuggable"

#### Native iOS
- Not directly applicable (iOS handles this via build configuration/provisioning)

#### Expo managed
- Check `eas.json` for build profile configuration:
  - `build.production.android.buildType` should be `"app-bundle"` (not `"apk"`)
  - `build.production.developmentClient` should be `false` or absent
  - Check that production profile doesn't extend development profile
- Check `app.json` for `expo.android.debuggable` (should not be present or should be false)

#### React Native CLI
- Check `android/app/build.gradle` for:
  - `buildTypes.release` block:
    - `debuggable true` -> CRITICAL FLAG (must be `false` or absent)
    - `minifyEnabled false` -> not a rejection but warns about missing code shrinking
    - `shrinkResources false` -> same
    - Missing `signingConfig signingConfigs.release` -> will fail signing
  - Check for `proguardFiles` or R8 rules in release config
  - Check `buildTypes.release.debuggable` specifically

#### Native Android
- Check `app/build.gradle` or `app/build.gradle.kts` for:
  ```
  buildTypes {
      release {
          debuggable true  // THIS IS THE PROBLEM
      }
  }
  ```
- Parse the `release` buildType block for:
  - `debuggable` — must be `false` or absent (default is false)
  - `minifyEnabled` — should be `true` for release
  - `proguardFiles` — should reference proguard rules
- Check `gradle.properties` for `android.enableR8=false` (disables code shrinking)
- Check for signing configuration: `signingConfigs.release` must exist with keystore reference
- Verify `keystore` file referenced in signing config exists (don't read its contents)

Context template: "Android release build configuration issues: {issues}. debuggable={debuggable_status} in release buildType at {gradle_file}. Submitting a debuggable release build to Google Play will be rejected. Also: minifyEnabled={minify_status}, proguard={proguard_status}, signing={signing_status}."
