# Performance Checks

### Check: large_binary_size
Guideline: 2.x
Confidence: MEDIUM when large asset files, uncompressed images, or embedded videos are detected
Risk: MED
Finding template: "Large asset files ({estimated_size}) may exceed store size limits"
Slug: —

#### Native iOS
Check the Xcode project for large image assets in `Assets.xcassets/` — look for PNG/JPG files over 2MB. Grep for `.mov`, `.mp4`, `.avi` files bundled in the project directory. Check `Build Settings > COMPRESS_PNG_FILES` and `STRIP_PNG_TEXT` are enabled. Look for uncompressed audio files (`.wav`, `.aiff`) that could be converted to `.m4a` or `.mp3`.

#### Expo managed
Check `assets/` directory for large files: `find assets/ -size +2M -type f`. Review `app.json` or `app.config.js` for `assetBundlePatterns` — wildcard patterns like `**/*` bundle everything including dev assets. Check for raw SVGs rendered at runtime instead of pre-rasterized PNGs. Look for embedded font files — multiple weights of the same font family inflating bundle size.

#### React Native CLI
Check `android/app/src/main/res/` and `ios/<AppName>/Images.xcassets/` for large assets. Review `metro.config.js` for `assetExts` — broad extensions may bundle unnecessary file types. Grep for large video files: `find . -name "*.mp4" -not -path "*/node_modules/*"`. Check if Hermes is enabled in `android/app/build.gradle` (`enableHermes: true`) — it reduces JS bundle size significantly.

#### Native Android
Check `res/drawable*/` and `res/raw/` for uncompressed images and embedded media. Verify `android/app/build.gradle` has `shrinkResources true` and `minifyEnabled true` under the release build type. Look for large assets in `assets/` folder. Check `abiFilters` — if missing, the APK includes native libraries for all architectures, inflating size.

Context template: "App may exceed store size limits — found {asset_type} files totaling ~{estimated_size} in {file_paths}. Large binaries risk rejection under guideline 2.x and reduce install conversion."

---

### Check: excessive_background_modes
Guideline: 2.5.4
Confidence: MEDIUM when UIBackgroundModes contains modes not clearly justified by app functionality
Risk: MED
Finding template: "UIBackgroundModes {unjustified_modes} declared without corresponding implementation"
Slug: guideline-254-software-requirements-declaring-unused-background-modes-2

#### Native iOS
Open `Info.plist` and check the `UIBackgroundModes` array. Flag any combination of: `audio` (is there a media player?), `location` (is continuous location tracking necessary?), `fetch` (is background refresh justified?), `remote-notification`, `voip`, `bluetooth-central`, `bluetooth-peripheral`, `processing`, `nearby-interaction`. Cross-reference each declared mode against actual feature code — grep for `AVAudioSession`, `CLLocationManager`, `BGAppRefreshTask`, `BGProcessingTask` to verify usage.

#### Expo managed
Check `app.json` or `app.config.js` for `ios.infoPlist.UIBackgroundModes`. Also check `app.json` top-level `ios.backgroundModes`. Verify each declared mode has a corresponding Expo API usage (e.g. `expo-location` with `TaskManager` for location, `expo-audio` for audio, `expo-background-fetch` for fetch). A common false positive: `remote-notification` declared but no push notification handler implemented.

#### React Native CLI
Check `ios/<AppName>/Info.plist` for `UIBackgroundModes`. Grep the JS/TS source for actual background API usage: `BackgroundFetch`, `react-native-background-timer`, `react-native-track-player`, `@react-native-community/geolocation` with `enableHighAccuracy`. If a mode is declared but no corresponding library is imported, it is unjustified.

#### Native Android
Android background modes work differently — check `AndroidManifest.xml` for `<service android:name=... />` entries with `foregroundServiceType`. Look for `FOREGROUND_SERVICE`, `ACCESS_BACKGROUND_LOCATION`, `RECEIVE_BOOT_COMPLETED` permissions. Verify each service has a clear user-visible purpose. Google Play targets 2.5.4 equivalent via policy on background location and foreground services.

Context template: "Info.plist declares UIBackgroundModes: {modes_list}. Mode(s) {unjustified_modes} appear to have no corresponding implementation. Apple reviewers will ask for justification — ensure each mode maps to a clear user-facing feature."

---

### Check: missing_arm64_support
Guideline: 2.x
Confidence: HIGH when arm64 is excluded from build architectures on iOS
Risk: HIGH
Finding template: "arm64 excluded from build architectures"
Slug: —

#### Native iOS
Open `<Project>.xcodeproj/project.pbxproj` and search for `EXCLUDED_ARCHS`. If `arm64` appears in the value, the build will not run on Apple Silicon simulators or devices properly. Check `ARCHS` setting — it should be `$(ARCHS_STANDARD)` or explicitly include `arm64`. Also check `VALID_ARCHS` if present. Grep for `armv7` — apps still targeting armv7 exclusively cannot be submitted to App Store.

#### Expo managed
Check `app.json` for `ios.buildNumber` and SDK version. Expo SDK 43+ dropped armv7 and requires arm64. If using EAS Build, check `eas.json` for custom `env` overrides on `EXCLUDED_ARCHS`. Run `eas build --platform ios --profile preview` output for architecture warnings. Legacy bare workflow projects may still have stale `EXCLUDED_ARCHS=arm64` from old workaround for M1 simulator issues.

#### React Native CLI
Search `ios/<AppName>.xcodeproj/project.pbxproj` for `EXCLUDED_ARCHS`. A common leftover from RN 0.63 era: `EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64` — this was a simulator workaround that should be removed on modern RN (0.71+). Verify `ARCHS = "$(ARCHS_STANDARD)"` in release build configuration. Check `Podfile` for `post_install` blocks that modify `EXCLUDED_ARCHS`.

#### Native Android
Not applicable — Android uses `abiFilters` in `build.gradle`, not arm64 exclusions. Check `abiFilters` includes `arm64-v8a` for modern device support. If `x86` or `x86_64` are the only targets, the app will not run on real devices.

Context template: "Found EXCLUDED_ARCHS containing {excluded_value} in {file_path}. This prevents the app from running on {affected_targets}. Apple requires arm64 support for all App Store submissions."

---

### Check: high_memory_patterns
Guideline: 2.x
Confidence: LOW when code patterns suggest unbounded memory usage
Risk: LOW
Finding template: "Code patterns suggest unbounded memory usage in {file_path}"
Slug: —

#### Native iOS
Grep for `UIImage(named:)` used inside `UITableView`/`UICollectionView` cells without caching — this reloads from disk on every scroll. Check for `NSCache` usage — absence of any cache with memory limits is a flag. Search for `applicationDidReceiveMemoryWarning` or `didReceiveMemoryWarning` — if not implemented in any view controller, memory pressure is unhandled. Look for large `Data` objects loaded fully into memory: `Data(contentsOf:)` on remote URLs without streaming.

#### Expo managed
Check for `Image` components from `expo-image` vs bare `<Image>` from React Native — `expo-image` has built-in caching. Grep for `FlatList` or `ScrollView` rendering large lists without `getItemLayout`, `removeClippedSubviews`, or `windowSize` props. Look for `require()` calls for large local images inside render functions (re-evaluated each render). Check for `useState` storing large arrays that grow unbounded.

#### React Native CLI
Grep for `ScrollView` used to render lists of more than ~20 items — should be `FlatList` with virtualization. Search for `Animated.Value` instances created inside render (memory leak). Check for `setInterval` or `addEventListener` calls without corresponding cleanup in `useEffect` return or `componentWillUnmount`. Look for image libraries (`react-native-fast-image`) — verify cache size limits are configured.

#### Native Android
Check `Activity` and `Fragment` classes for `onLowMemory()` and `onTrimMemory()` overrides — absence means no memory pressure handling. Grep for `Bitmap.decodeFile()` or `BitmapFactory.decodeStream()` without `inSampleSize` option — loads full-resolution bitmaps. Look for `RecyclerView` usage vs `ListView` — prefer RecyclerView. Check for `static` references to `Context` or `View` objects (common memory leak).

Context template: "Found potential memory issue in {file_path}:{line_number} — {pattern_description}. This pattern can cause OOM crashes on low-memory devices, leading to guideline 2.x performance rejections."

---

### Check: target_sdk_outdated
Guideline: Android
Confidence: HIGH when targetSdkVersion is below API 34
Risk: HIGH
Finding template: "targetSdkVersion {current_version} below required API 34"
Slug: —

#### Native iOS
Not applicable — iOS uses minimum deployment target, not a target SDK concept. Check `IPHONEOS_DEPLOYMENT_TARGET` in `project.pbxproj` — Apple requires apps to be built with the latest SDK (Xcode). Apps built with SDKs more than one major version old may be flagged.

#### Expo managed
Check `app.json` for `android.targetSdkVersion`. If absent, it defaults to the Expo SDK's bundled value — verify the Expo SDK version in `package.json` bundles a target SDK of 34+. Check `android/app/build.gradle` if the project has been ejected or uses bare workflow. As of 2025, Google Play requires `targetSdkVersion >= 34` for new apps and updates.

#### React Native CLI
Open `android/app/build.gradle` and find `targetSdkVersion`. It must be `34` or higher (Google Play requirement as of August 2024 for updates, new apps from earlier). Also check `compileSdkVersion` — should match or exceed `targetSdkVersion`. Grep for `minSdkVersion` — below 21 drops support for many security APIs and may trigger Play policy warnings.

#### Native Android
Open `app/build.gradle` (or `app/build.gradle.kts` for Kotlin DSL). Find `targetSdk` or `targetSdkVersion` in the `defaultConfig` block. Value must be `>= 34`. Also verify `compileSdk >= 34`. Check `gradle/libs.versions.toml` if using version catalogs — the value may be defined there. Note: `targetSdkVersion 33` causes Play Console upload warnings; `<= 32` blocks submission entirely for updates.

Context template: "android/app/build.gradle sets targetSdkVersion to {current_version}. Google Play requires targetSdkVersion >= 34 as of 2025. Update to 34 and test for behavioral changes (notification permissions, background restrictions, intent mutability flags)."
