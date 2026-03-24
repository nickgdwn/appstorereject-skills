# Legal Checks

### Check: missing_eula_for_subscriptions
Guideline: 5.2.x
Confidence: HIGH when auto-renewing subscription products are configured without Terms of Service or EULA
Risk: HIGH
Finding template: "Subscription IAP without Terms of Service or EULA in purchase flow"

#### Native iOS
Grep source for `SKProductSubscriptionPeriod`, `StoreKit`, `Product.SubscriptionInfo`, or `StoreKit2` subscription purchase calls. If subscription products are present, verify the app displays a Terms of Service / EULA link before or during the purchase flow. Search for "terms" or "EULA" in the UI source — check that it links to a real URL, not a placeholder. Apple requires the standard EULA or a custom EULA linked in App Store Connect AND displayed in-app before purchase. Check `Info.plist` for `NSUserTrackingUsageDescription` — unrelated but commonly missing alongside subscription legal gaps.

#### Expo managed
Check `package.json` for `expo-in-app-purchases`, `react-native-iap`, or `react-native-purchases` (RevenueCat). If present, grep the purchase flow screens for "terms", "privacy", "EULA", or "subscribe" text rendering a tappable link. Look for `Linking.openURL` calls pointing to terms/privacy URLs near subscription UI. Check `app.json` for `extra.termsUrl` or similar — many teams store these as config values. Verify the subscription paywall component renders legal text, not just price and CTA.

#### React Native CLI
Same JS checks as Expo managed. Additionally verify the iOS `StoreKit` integration in `ios/` — check if a custom `SKPaymentTransactionObserver` is implemented and whether the transaction success flow shows legal text. Grep for "auto-renew" or "automatically renews" — Apple requires this disclosure in the subscription UI. Check `android/` for Google Play Billing (`BillingClient`) — Google also requires Terms of Service display for subscription apps in Play Store listing and in-app.

#### Native Android
Check `build.gradle` for `com.android.billingclient:billing` dependency. If present, grep Activity/Fragment source for terms or EULA display near billing UI. Look for `BillingFlowParams`, `ProductDetails`, `SubscriptionOfferDetails` usage. Verify the subscription screen shows: price, billing period, auto-renewal disclosure, cancellation instructions link, and Terms of Service URL. Google Play requires these disclosures for subscription apps; absence causes policy rejection.

Context template: "Found subscription purchase code in {file_paths} but no Terms of Service or EULA link in the purchase flow. Guideline 5.2.x requires a EULA for apps with auto-renewing subscriptions. Add a tappable terms link to {purchase_screen} before the buy button, and ensure the linked URL is live and accessible."

---

### Check: missing_age_rating
Guideline: 5.2.x
Confidence: MEDIUM when content suggests age restrictions but appropriate rating configuration is absent
Risk: MED
Finding template: "Mature content keywords found without age gate or verification"

#### Native iOS
Grep source files and string resources for keywords indicating mature content: `gambling`, `casino`, `poker`, `slots`, `alcohol`, `beer`, `wine`, `liquor`, `tobacco`, `vape`, `violence`, `blood`, `gore`, `adult`, `explicit`, `nude`, `18+`, `21+`. If any are found, check App Store Connect age rating configuration — this can't be verified from source alone, but flag the presence of these keywords for manual review. Also check `Info.plist` for `UIRequiredDeviceCapabilities` — some capabilities imply mature use contexts.

#### Expo managed
Grep `app.json` and all source files for mature content keywords (gambling, alcohol, violence, adult, explicit, dating, hookup). Check `app.json` for `ios.appStoreUrl` or any rating configuration. Look for age gate UI patterns — `DatePicker` used at app launch to verify birth year, or an age confirmation modal. Absence of an age gate alongside mature content keywords is a red flag. Check for `expo-notifications` push content that might include mature topics.

#### React Native CLI
Grep JS/TS source and `android/res/` string files for mature content keywords. Check `android/AndroidManifest.xml` for `android:minSdkVersion` — not an age rating, but relevant context. Look for any age verification screen components. Check `ios/Info.plist` for content advisory keys. Grep for `ContentPolicy`, `AgeGate`, `AgeVerification`, or `BirthDate` component names — their presence confirms the team is aware of the requirement; their absence alongside mature content is the flag.

#### Native Android
Grep `res/values/strings.xml` and all layout files for mature content keywords. Check `AndroidManifest.xml` for `android:targetSandboxVersion`. Verify the Play Console content rating questionnaire results are appropriate — this can't be confirmed from source, but source keywords like `casino`, `alcohol`, or `adult` should trigger a manual check note. Look for `ContentRating` or `IARC` references in the codebase. Check if the app uses Firebase Remote Config to gate mature content — a common pattern that reviewers may miss but policy still requires correct rating.

Context template: "Found content keywords suggesting mature or age-restricted material ({keywords_found}) in {file_paths}, but no age gate or verification flow was detected. Guideline 5.2.x requires appropriate age rating and potentially an age gate. Verify the App Store Connect / Play Console content rating matches actual app content."

---

### Check: ugc_without_moderation
Guideline: 5.2.x
Confidence: MEDIUM when user-generated content features are present without reporting or moderation mechanisms
Risk: MED
Finding template: "User-generated content features without reporting/moderation mechanism"

#### Native iOS
Grep for UI elements that accept user text or media input beyond login: `UITextView`, `UITextField` in non-auth contexts (search for "post", "comment", "message", "chat", "review", "upload" nearby). If UGC features are found, verify there is a report/flag mechanism: grep for "report", "flag", "block", "inappropriate", "abuse" in source. Check for moderation-related API calls or endpoints. Look for `MFMailComposeViewController` or in-app reporting sheets. Apple requires a mechanism for users to flag offensive UGC — its complete absence is a rejection trigger.

#### Expo managed
Grep `package.json` for UGC-related libraries: `socket.io`, `stream-chat`, `firebase/firestore`, `@sendbird`, `@stream-io`, `react-native-gifted-chat`. If present, grep source for report/flag/block UI: "Report", "Flag", "Block User", "Inappropriate". Check for admin/moderation backend integration — API calls to endpoints containing "moderate", "report", "flag". Look for content filtering: profanity filter libraries (`bad-words`, `leo-profanity`) or API-based moderation calls. Absence of any of these alongside UGC features is the flag.

#### React Native CLI
Same JS checks as Expo. Additionally check `ios/` and `android/` for native chat or content SDKs (Sendbird, Stream, Twilio Conversations). Grep for native bridge modules related to content reporting. Check the backend API client files for moderation-related endpoints. Look for `Block`, `Report`, `Mute` actions in user profile or content item components. Verify Terms of Service accessible from within the app covers UGC content standards.

#### Native Android
Grep Java/Kotlin source for content submission flows: `EditText` in non-auth screens, `RecyclerView` displaying user posts/comments. Search for report dialog implementations: `AlertDialog` with report options, `BottomSheetDialog` with flag actions. Check `AndroidManifest.xml` for declared `Intent` filters that handle user content submissions. Look for Firebase Firestore or Realtime Database usage (common UGC backend) — if present, verify moderation rules or cloud functions exist (check `firestore.rules` or `functions/` directory).

Context template: "Found user-generated content features ({ugc_features}) in {file_paths} but no content reporting or moderation mechanism was detected. Guideline 5.2.x requires apps with UGC to provide a way for users to flag offensive content and a method for the developer to respond. Add a report/flag action to {content_component}."

---

### Check: missing_export_compliance
Guideline: 5.2.x
Confidence: LOW when ITSAppUsesNonExemptEncryption is missing from Info.plist
Risk: LOW
Finding template: "ITSAppUsesNonExemptEncryption missing from Info.plist"

#### Native iOS
Open `Info.plist` and search for `ITSAppUsesNonExemptEncryption`. If the key is absent entirely, App Store Connect will display an export compliance question on every build upload — and if answered incorrectly, the build may be blocked. If the app uses only standard HTTPS (via `NSURLSession`, `URLSession`, `Alamofire`) and no custom encryption, set `ITSAppUsesNonExemptEncryption` to `NO` to suppress the prompt. Grep for custom cryptography libraries: `CommonCrypto`, `CryptoKit` with non-standard algorithms, `OpenSSL`, `libsodium` — these may require `YES` and an encryption registration number (ERN).

#### Expo managed
Check `app.json` for `ios.infoPlist.ITSAppUsesNonExemptEncryption`. If absent, the upload process will require manual export compliance answers each time. Check `package.json` for encryption-related libraries: `crypto-js`, `react-native-rsa-native`, `react-native-aes-crypto`, `react-native-sodium`. Standard HTTPS usage (fetch, axios, expo-fetch) qualifies for the `NO` exemption. If `ITSAppUsesNonExemptEncryption` is not set in `app.json`, add `"ITSAppUsesNonExemptEncryption": false` under `ios.infoPlist` (assuming no custom crypto).

#### React Native CLI
Check `ios/<AppName>/Info.plist` for `ITSAppUsesNonExemptEncryption`. Grep `package.json` for crypto libraries. Check `ios/Podfile.lock` for pods with encryption capabilities: `OpenSSL-Universal`, `libsodium`. Review the `ios/` native code for `CCCrypt`, `SecKeyEncrypt`, or custom TLS certificate pinning implementations — these may constitute non-exempt encryption. If only HTTPS is used, add `<key>ITSAppUsesNonExemptEncryption</key><false/>` to Info.plist.

#### Native Android
Android does not use `ITSAppUsesNonExemptEncryption` — this is iOS/App Store specific. For Google Play, export compliance is handled via the Play Console Data Safety questionnaire, not Info.plist. Check if the app uses custom encryption libraries in `build.gradle` (`implementation 'com.github.tozny:java-aead-crypto'` etc.) and whether the Play Console data safety form is complete. This check is primarily a flag for iOS.

Context template: "Info.plist is missing the ITSAppUsesNonExemptEncryption key in {plist_path}. Without it, every TestFlight/App Store upload triggers a manual export compliance prompt. If the app only uses standard HTTPS, add ITSAppUsesNonExemptEncryption = NO to suppress this. If custom encryption is used ({crypto_libs_found}), set to YES and obtain an ERN from the US Bureau of Industry and Security."
