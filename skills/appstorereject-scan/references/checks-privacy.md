# Privacy Checks

12 checks covering Apple Guideline 5.1.x and Google Play Data Safety requirements.

---

### Check: missing_privacy_manifest
Guideline: 5.1.1
Confidence: HIGH when no PrivacyInfo.xcprivacy file exists in an iOS project

#### Native iOS
Search for `PrivacyInfo.xcprivacy` anywhere under the project root. Also check that the file is referenced in the Xcode project:
- Glob: `**/PrivacyInfo.xcprivacy`
- Glob: `**/*.pbxproj` — grep for `PrivacyInfo.xcprivacy` to confirm it is included in the build target
- If the file exists, verify it contains `NSPrivacyTracking` and `NSPrivacyAccessedAPITypes` keys (not an empty plist)

#### Expo managed
- Read `app.json` or `app.config.js` / `app.config.ts`
- Check for `expo.ios.privacyManifests` key
- If missing, flag. If present, verify `NSPrivacyAccessedAPITypes` array is non-empty
- Expo SDK 51+ auto-generates a privacy manifest, but custom API usage still requires declaration

#### React Native CLI
- Glob: `ios/**/PrivacyInfo.xcprivacy`
- Check `ios/*.xcodeproj/project.pbxproj` for reference to the file
- Also check CocoaPods: `ios/Podfile` may need `config.privacy_manifest` entries for pods that access required reason APIs

#### Native Android
- Not directly applicable (Android uses Data Safety Section, not a privacy manifest file)
- However, check `AndroidManifest.xml` for `<meta-data android:name="com.google.android.play.PRIVACY_POLICY_URL">` as a related signal

Context template: "No PrivacyInfo.xcprivacy found in project. Apple requires a privacy manifest for all apps as of Spring 2024. Found {api_usage_count} API calls that likely need required reason declarations: {api_categories}."

---

### Check: missing_tracking_declaration
Guideline: 5.1.1
Confidence: HIGH when ATT framework is imported but NSUserTrackingUsageDescription is missing

#### Native iOS
- Grep all `.swift`, `.m`, `.h` files for:
  - `import AppTrackingTransparency`
  - `import AdSupport`
  - `ATTrackingManager`
  - `ASIdentifierManager`
  - `advertisingIdentifier`
  - `requestTrackingAuthorization`
- Then check `Info.plist` (glob: `**/Info.plist`) for `NSUserTrackingUsageDescription`
- Also check for `NSPrivacyTracking` set to `true` in `PrivacyInfo.xcprivacy` — if tracking is declared, the usage description MUST exist

#### Expo managed
- Grep source files (`src/**/*.{ts,tsx,js,jsx}`) for:
  - `expo-tracking-transparency`
  - `requestTrackingPermissionsAsync`
  - `getAdvertisingId`
- Check `app.json` for `expo.ios.infoPlist.NSUserTrackingUsageDescription`
- Check `app.json` for `expo.plugins` containing `expo-tracking-transparency`

#### React Native CLI
- Grep `**/*.{ts,tsx,js,jsx}` for:
  - `react-native-tracking-transparency`
  - `@react-native-community/tracking-transparency`
  - `getTrackingStatus`
  - `requestTrackingPermission`
- Check `ios/*/Info.plist` for `NSUserTrackingUsageDescription`

#### Native Android
- Grep for `AdvertisingIdClient` or `getAdvertisingIdInfo` in Java/Kotlin source
- Check `AndroidManifest.xml` for `com.google.android.gms.permission.AD_ID`
- If targeting API 33+, the `AD_ID` permission must be explicitly declared

Context template: "App imports {tracking_framework} but is missing NSUserTrackingUsageDescription in Info.plist. Found tracking-related code in: {files_with_tracking}. Apple will reject without the ATT prompt description."

---

### Check: missing_purpose_strings
Guideline: 5.1.1
Confidence: HIGH when hardware/data access frameworks are used without corresponding purpose strings

#### Native iOS
For each pair, grep source for the framework usage and check Info.plist for the key:

| Framework/API | Grep pattern | Required Info.plist key |
|---|---|---|
| Camera | `AVCaptureSession`, `UIImagePickerController`, `.camera`, `captureDevice` | `NSCameraUsageDescription` |
| Photo Library | `PHPhotoLibrary`, `PHAsset`, `.photoLibrary`, `UIImagePickerController` | `NSPhotoLibraryUsageDescription` |
| Photo Library Add | `PHPhotoLibrary.shared().performChanges`, `UIImageWriteToSavedPhotosAlbum` | `NSPhotoLibraryAddUsageDescription` |
| Location | `CLLocationManager`, `requestWhenInUse`, `requestAlways`, `startUpdatingLocation` | `NSLocationWhenInUseUsageDescription` |
| Microphone | `AVAudioRecorder`, `AVAudioSession`, `.record`, `AVCaptureDevice.audio` | `NSMicrophoneUsageDescription` |
| Contacts | `CNContactStore`, `CNContact`, `ABAddressBook` | `NSContactsUsageDescription` |
| Calendar | `EKEventStore`, `EKEvent` | `NSCalendarsUsageDescription` |
| Bluetooth | `CBCentralManager`, `CBPeripheralManager` | `NSBluetoothAlwaysUsageDescription` |
| Face ID | `LAContext`, `evaluatePolicy`, `biometryType` | `NSFaceIDUsageDescription` |

- Glob: `**/*.swift`, `**/*.m` for usage
- Glob: `**/Info.plist` for keys

#### Expo managed
- Check `app.json` for `expo.ios.infoPlist` containing the required keys
- Check installed packages in `package.json`:
  - `expo-camera` -> `NSCameraUsageDescription`
  - `expo-image-picker` -> `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`
  - `expo-location` -> `NSLocationWhenInUseUsageDescription`
  - `expo-contacts` -> `NSContactsUsageDescription`
  - `expo-calendar` -> `NSCalendarsUsageDescription`
  - `expo-media-library` -> `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`
  - `expo-av` (recording) -> `NSMicrophoneUsageDescription`
  - `expo-local-authentication` -> `NSFaceIDUsageDescription`
- Expo auto-injects some purpose strings via plugins, but custom strings are strongly recommended

#### React Native CLI
- Same source grep patterns as Native iOS
- Check `ios/*/Info.plist` for keys
- Common RN packages to check in `package.json`:
  - `react-native-camera` / `react-native-vision-camera`
  - `@react-native-camera-roll/camera-roll`
  - `react-native-geolocation-service` / `@react-native-community/geolocation`
  - `react-native-contacts`
  - `react-native-permissions`

#### Native Android
- Check `AndroidManifest.xml` for corresponding permissions:
  - `CAMERA`, `READ_MEDIA_IMAGES`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `RECORD_AUDIO`, `READ_CONTACTS`, `READ_CALENDAR`, `BLUETOOTH_CONNECT`
- Android does not use "purpose strings" in the same way, but Google Play requires Data Safety declarations for the same data types

Context template: "Found {framework} usage in {source_file} but missing {plist_key} in Info.plist. Apple requires a human-readable purpose string explaining why the app needs {permission_name} access. {usage_count} files reference this API."

---

### Check: third_party_sdk_privacy
Guideline: 5.1.1
Confidence: MEDIUM when third-party SDKs are present but not declared in privacy manifest

#### Native iOS
- Check `Podfile` or `Package.swift` for known SDKs that access required-reason APIs:
  - `Firebase` / `FirebaseAnalytics` -> Uses `NSPrivacyAccessedAPICategoryUserDefaults`, `NSPrivacyAccessedAPICategoryFileTimestamp`
  - `FacebookCore` / `FBSDKCoreKit` -> Uses `NSPrivacyAccessedAPICategoryDiskSpace`, `NSPrivacyAccessedAPICategoryUserDefaults`
  - `Google-Mobile-Ads-SDK` / `GoogleMobileAds` -> Uses `NSPrivacyAccessedAPICategoryUserDefaults`
  - `Amplitude` -> Uses `NSPrivacyAccessedAPICategoryUserDefaults`
  - `Mixpanel` -> Uses `NSPrivacyAccessedAPICategoryUserDefaults`
  - `OneSignal` -> Uses `NSPrivacyAccessedAPICategoryUserDefaults`
- Cross-reference with `PrivacyInfo.xcprivacy` — each SDK's API categories must appear in `NSPrivacyAccessedAPITypes`
- Pod-level privacy manifests (shipped by SDK vendors) cover their own code, but if you access the same APIs in YOUR code, you need your own declarations

#### Expo managed
- Check `package.json` for:
  - `@react-native-firebase/*`, `expo-firebase-analytics`
  - `react-native-fbsdk-next`
  - `react-native-google-mobile-ads`
  - `expo-analytics-amplitude`
- Check `app.json` -> `expo.ios.privacyManifests.NSPrivacyAccessedAPITypes` covers the API categories used

#### React Native CLI
- Check `ios/Podfile.lock` for resolved pod names of the above SDKs
- Each pod should ship its own `PrivacyInfo.xcprivacy` (check inside `Pods/` directory)
- Your app's top-level `PrivacyInfo.xcprivacy` should declare API types your own code uses

#### Native Android
- Check `build.gradle` dependencies for the same SDK families
- No direct Android equivalent, but Google Play Data Safety requires disclosure of data collected by SDKs

Context template: "Found {sdk_count} third-party SDKs that access required-reason APIs: {sdk_list}. Verify each SDK's API categories are declared in PrivacyInfo.xcprivacy under NSPrivacyAccessedAPITypes. Missing declarations for: {missing_categories}."

---

### Check: undeclared_data_collection
Guideline: 5.1.2
Confidence: MEDIUM when network calls exist but no privacy nutrition label declarations found

#### Native iOS
- Grep for network activity patterns:
  - `URLSession`, `dataTask`, `Alamofire`, `AF.request`, `Moya`
  - `URLRequest`, `httpBody`, `application/json`
- Look for data being sent to remote servers — especially POST requests containing user data
- Cross-reference with `PrivacyInfo.xcprivacy` `NSPrivacyCollectedDataTypes` (if present)
- Also check for analytics/crash reporting SDKs that collect data automatically

#### Expo managed
- Grep `src/**/*.{ts,tsx,js,jsx}` for:
  - `fetch(`, `axios.`, `useFetch`, `useQuery` (React Query/TanStack)
  - POST bodies containing user-related fields: `email`, `name`, `phone`, `userId`, `deviceId`
- Check if `expo.ios.privacyManifests.NSPrivacyCollectedDataTypes` exists in `app.json`

#### React Native CLI
- Same grep patterns as Expo managed
- Also check for native networking modules: `NativeModules.Networking`, custom native bridges
- Verify `ios/*/Info.plist` or privacy manifest declares collected data types

#### Native Android
- Grep `**/*.java`, `**/*.kt` for:
  - `HttpURLConnection`, `OkHttpClient`, `Retrofit`, `Volley`
  - `.post(`, `RequestBody`, `@POST`, `@Body`
- Check for `data_safety_form.xml` or Data Safety metadata in project

Context template: "Found {network_call_count} network call sites across {file_count} files. POST requests detected in: {post_files}. Verify all collected data types are declared in your App Store privacy nutrition label and Google Play Data Safety section."

---

### Check: missing_privacy_policy_url
Guideline: 5.1.1
Confidence: HIGH when no privacy policy URL is configured anywhere in the project

#### Native iOS
- Check `Info.plist` for custom keys containing "privacy" or "policy" (no standard key, but some apps embed it)
- Check `*.entitlements` files — not directly relevant but useful context
- Grep all `.swift`/`.m` files for URLs containing "privacy" or "policy" — often hardcoded in settings/about screens
- Check App Store Connect metadata (outside of code — note to user)

#### Expo managed
- Check `app.json` for `expo.ios.privacyPolicyUrl` (EAS Submit config)
- Check `app.json` for `expo.android.privacyPolicyUrl`
- Grep source for `privacyPolicy`, `privacy-policy`, `privacy_policy` URL strings
- Check `eas.json` for submit configuration with privacy policy

#### React Native CLI
- Grep all source files for URLs containing `privacy`, `policy`, `legal`, `terms`
- Common locations: `Settings.tsx`, `About.tsx`, `Profile.tsx`, `constants.ts`, `config.ts`
- Check `ios/*/Info.plist` and `android/app/src/main/AndroidManifest.xml` for policy references

#### Native Android
- Check `AndroidManifest.xml` for `<meta-data>` tags with privacy policy
- Grep `res/values/strings.xml` for "privacy" or "policy"
- Check `build.gradle` for any metadata injection

Context template: "No privacy policy URL found in project configuration or source code. Both Apple (Guideline 5.1.1) and Google Play require a valid, accessible privacy policy URL. Searched: {files_searched}. Apps with account creation or data collection are guaranteed rejection without one."

---

### Check: excessive_permissions
Guideline: 5.1.1
Confidence: MEDIUM when permissions are declared but corresponding APIs are never called in source code

#### Native iOS
- Parse `Info.plist` for all `NS*UsageDescription` keys
- For each declared permission, grep the entire source tree for the corresponding framework usage:
  - `NSCameraUsageDescription` -> `AVCaptureSession`, `UIImagePickerController.sourceType = .camera`, `captureDevice`
  - `NSLocationAlwaysAndWhenInUseUsageDescription` -> `CLLocationManager`, `startUpdatingLocation`, `requestAlwaysAuthorization`
  - `NSMicrophoneUsageDescription` -> `AVAudioRecorder`, `AVAudioSession.record`, `AVCaptureDevice.requestAccess(for: .audio`
  - `NSBluetoothAlwaysUsageDescription` -> `CBCentralManager`, `CBPeripheralManager`
- Flag any declared permission with zero source references

#### Expo managed
- Parse `app.json` `expo.ios.infoPlist` for `NS*UsageDescription` keys
- Parse `expo.android.permissions` array
- Cross-reference with `package.json` dependencies — if `expo-camera` is not installed but `NSCameraUsageDescription` is set, flag it
- Check Expo config plugins — some plugins auto-inject permissions

#### React Native CLI
- Parse `ios/*/Info.plist` for declared permissions
- Parse `android/app/src/main/AndroidManifest.xml` for `<uses-permission>` tags
- Grep entire `src/` and `app/` tree for matching API usage
- Flag permissions with no corresponding code usage

#### Native Android
- Parse `AndroidManifest.xml` for all `<uses-permission>` entries
- For each, grep Java/Kotlin source for usage:
  - `ACCESS_FINE_LOCATION` -> `LocationManager`, `FusedLocationProviderClient`, `getLastLocation`
  - `CAMERA` -> `CameraManager`, `Camera.open`, `CameraX`
  - `RECORD_AUDIO` -> `AudioRecord`, `MediaRecorder`
  - `READ_CONTACTS` -> `ContactsContract`, `ContentResolver.*contacts`
- Flag declared permissions with zero source references

Context template: "Found {unused_count} declared permissions with no corresponding API usage in source code: {unused_permissions}. Apple and Google reject apps requesting permissions they don't use. Declared in {manifest_file}."

---

### Check: background_location
Guideline: 5.1.1
Confidence: HIGH when background location is declared without proper configuration or justification

#### Native iOS
- Check `Info.plist` for `UIBackgroundModes` containing `location`
- If present, verify ALL of these exist:
  - `NSLocationAlwaysAndWhenInUseUsageDescription` in `Info.plist`
  - `NSLocationWhenInUseUsageDescription` in `Info.plist`
  - `allowsBackgroundLocationUpdates = true` in source code
  - Actual usage of `startUpdatingLocation` or `startMonitoringSignificantLocationChanges`
- Check `*.entitlements` for `com.apple.developer.location.push` (location push service)
- Apple requires detailed justification — apps using background location without visible user benefit are rejected

#### Expo managed
- Check `app.json` for:
  - `expo.ios.infoPlist.UIBackgroundModes` containing `"location"`
  - `expo.ios.infoPlist.NSLocationAlwaysAndWhenInUseUsageDescription`
  - `expo.ios.infoPlist.NSLocationWhenInUseUsageDescription`
- Check if `expo-location` is installed with `LocationActivityType` configured
- Check `expo-task-manager` usage for background location tasks: `TaskManager.defineTask`

#### React Native CLI
- Check `ios/*/Info.plist` for `UIBackgroundModes` array containing `location`
- Grep for `react-native-background-geolocation` or `@react-native-community/geolocation` with background config
- Verify purpose strings exist for both "always" and "when in use"

#### Native Android
- Check `AndroidManifest.xml` for `ACCESS_BACKGROUND_LOCATION` permission
- If targeting API 29+, this is a separate permission from `ACCESS_FINE_LOCATION`
- Google Play requires "Access to background location" declaration in Data Safety
- Grep for `requestPermissions` calls that include `ACCESS_BACKGROUND_LOCATION`

Context template: "Background location access detected: {bg_location_config}. Missing required configuration: {missing_items}. Apple scrutinizes background location heavily — apps must demonstrate clear user-facing value. Found location code in: {location_files}."

---

### Check: contact_data_access
Guideline: 5.1.1
Confidence: MEDIUM when Contacts framework is imported without proper purpose string or with broad access patterns

#### Native iOS
- Grep for Contacts framework usage:
  - `import Contacts`, `CNContactStore`, `CNContact`, `CNMutableContact`
  - `enumerateContacts`, `unifiedContacts`, `CNContactFetchRequest`
  - Legacy: `ABAddressBook`, `ABAddressBookRef`
- Verify `NSContactsUsageDescription` exists in `Info.plist`
- Check access scope — flag if `keysToFetch` requests ALL keys or includes `CNContactPhoneNumbersKey`, `CNContactEmailAddressesKey` without clear need
- Check if contact data is sent to a server (grep for network calls near contact code)

#### Expo managed
- Check `package.json` for `expo-contacts`
- Grep source for `Contacts.getContactsAsync`, `Contacts.Fields`
- Check `app.json` for `expo.ios.infoPlist.NSContactsUsageDescription`
- Flag if `Contacts.Fields.All` or many fields are requested

#### React Native CLI
- Check `package.json` for `react-native-contacts`
- Grep for `Contacts.getAll()`, `Contacts.getContactsByPhoneNumber`, `Contacts.getContactsByEmailAddress`
- Check `ios/*/Info.plist` for `NSContactsUsageDescription`

#### Native Android
- Check `AndroidManifest.xml` for `READ_CONTACTS`, `WRITE_CONTACTS`
- Grep Java/Kotlin for `ContactsContract`, `ContentResolver.query.*contacts`
- Flag if `WRITE_CONTACTS` is declared but no write operations exist in code

Context template: "Contacts access detected via {framework} in {source_files}. Purpose string: {purpose_string_status}. Contact fields requested: {fields_list}. Apps that upload or transmit contact data must disclose this in privacy labels. {network_transmission_status}."

---

### Check: health_data_access
Guideline: 5.1.1
Confidence: HIGH when HealthKit entitlement exists without proper Info.plist descriptions

#### Native iOS
- Check `*.entitlements` files for `com.apple.developer.healthkit`
- If HealthKit entitlement exists, verify:
  - `Info.plist` contains `NSHealthShareUsageDescription` (reading health data)
  - `Info.plist` contains `NSHealthUpdateUsageDescription` (writing health data)
  - `Info.plist` `UIRequiredDeviceCapabilities` includes `healthkit` (if app requires it)
- Grep source for `HKHealthStore`, `HKObjectType`, `requestAuthorization`, `HKSampleQuery`
- Check that the specific `HKObjectType`s requested match the app's stated purpose

#### Expo managed
- Check `package.json` for `expo-health`, `react-native-health`
- Check `app.json` for:
  - `expo.ios.entitlements["com.apple.developer.healthkit"]`
  - `expo.ios.infoPlist.NSHealthShareUsageDescription`
  - `expo.ios.infoPlist.NSHealthUpdateUsageDescription`

#### React Native CLI
- Check `package.json` for `react-native-health`, `react-native-healthkit`
- Check `ios/*.entitlements` for HealthKit
- Verify `ios/*/Info.plist` has both usage description keys

#### Native Android
- Check for Google Fit / Health Connect integration:
  - `build.gradle` dependency on `com.google.android.gms:play-services-fitness` or `androidx.health.connect`
  - `AndroidManifest.xml` for `android.permission.health.*` permissions
  - Grep for `HealthConnectClient`, `FitnessOptions`, `readRecords`

Context template: "HealthKit entitlement found in {entitlements_file}. Missing descriptions: {missing_keys}. Apple requires detailed, specific descriptions of why health data is accessed. Health data apps receive extra scrutiny during review. HK types requested: {hk_types}."

---

### Check: android_dangerous_permissions
Guideline: Data Safety
Confidence: MEDIUM when dangerous permissions are declared without clear code-level justification

#### Native iOS
- Not applicable (iOS uses purpose strings instead of permission tiers)

#### Expo managed
- Check `app.json` for `expo.android.permissions` array
- Flag these dangerous permissions if present:
  - `WRITE_EXTERNAL_STORAGE` (deprecated API 29+, unnecessary on modern Android)
  - `READ_PHONE_STATE` (accesses IMEI, phone number — needs strong justification)
  - `ACCESS_FINE_LOCATION` (vs `ACCESS_COARSE_LOCATION` — do you really need GPS precision?)
  - `READ_CALL_LOG`, `READ_SMS` (heavily restricted, almost always rejected unless core feature)
  - `SYSTEM_ALERT_WINDOW` (draw over other apps — needs justification)
  - `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO` (API 33+ replacements — check targetSdk)
- Cross-reference with source code to verify each permission is used

#### React Native CLI
- Parse `android/app/src/main/AndroidManifest.xml` for `<uses-permission>` tags
- Check for permissions added by libraries in `android/app/build.gradle` dependencies
- Run `grep -r "uses-permission" android/` to catch permissions in library manifests
- Flag same dangerous permissions as above

#### Native Android
- Parse `app/src/main/AndroidManifest.xml` for all `<uses-permission>` declarations
- Compare against source usage:
  - `WRITE_EXTERNAL_STORAGE` -> `Environment.getExternalStorageDirectory`, `MediaStore`
  - `READ_PHONE_STATE` -> `TelephonyManager`, `getDeviceId`, `getLine1Number`
  - `ACCESS_FINE_LOCATION` -> `LocationManager.GPS_PROVIDER`, `FusedLocationProviderClient`
  - `READ_CALL_LOG` -> `CallLog.Calls`, `ContentResolver.query.*call_log`
  - `READ_SMS` -> `SmsManager`, `ContentResolver.query.*sms`
- Flag `WRITE_EXTERNAL_STORAGE` if `targetSdkVersion` >= 29 (scoped storage makes it unnecessary)

Context template: "Found {dangerous_count} dangerous Android permissions: {permission_list}. Permissions without clear source-code justification: {unjustified_list}. Google Play restricts sensitive permissions — apps requesting them without core feature justification face rejection or removal."

---

### Check: missing_data_safety_section
Guideline: Data Safety
Confidence: HIGH when an Android app has no data safety metadata configured

#### Native iOS
- Not applicable (iOS uses App Store Connect privacy labels, configured outside the codebase)

#### Expo managed
- Check `eas.json` or `app.json` for any data safety configuration references
- Note: Data Safety is primarily configured in Google Play Console, not in code
- However, check if the app collects/transmits data by grepping for:
  - `fetch(`, `axios`, network calls with POST bodies
  - Analytics SDKs: `@react-native-firebase/analytics`, `expo-analytics-*`, `mixpanel`, `amplitude`
  - Crash reporting: `sentry`, `bugsnag`, `crashlytics`
- If data collection exists, flag that Data Safety section must be completed in Play Console

#### React Native CLI
- Check `android/app/src/main/AndroidManifest.xml` for `<meta-data>` related to data safety
- Check for `data_extraction_rules.xml` (Android 12+ backup rules) — related but not the same
- Grep project for analytics/crash/network SDKs as above

#### Native Android
- Check `AndroidManifest.xml` for:
  - `<meta-data android:name="com.google.android.play.PRIVACY_POLICY_URL">`
  - `android:dataExtractionRules` attribute (API 31+)
  - `android:fullBackupContent` attribute (backup rules)
- Check `res/xml/` for `data_extraction_rules.xml`, `backup_rules.xml`
- Note: The Data Safety form itself is in Play Console, but code analysis reveals what MUST be declared:
  - Any `SharedPreferences` usage -> device/app identifiers collected
  - Any analytics SDK -> usage data collected
  - Any crash reporting -> diagnostic data collected
  - Any user authentication -> personal info collected
  - Any `AdvertisingIdClient` -> advertising data collected

Context template: "Android app detected with {data_signal_count} data collection signals but no data safety metadata in project. SDKs collecting data: {sdk_list}. Data types to declare in Google Play Data Safety: {data_types}. Google Play requires a completed Data Safety section — incomplete forms result in rejection or app removal."
