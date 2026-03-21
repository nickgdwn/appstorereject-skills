# Payment Checks

10 checks covering Apple Guideline 3.1.x and Google Play Billing requirements.

---

### Check: external_payment_link
Guideline: 3.1.1
Confidence: HIGH when external payment URLs or SDKs are found in source code

#### Native iOS
- Grep all `.swift`, `.m`, `.h`, `.storyboard`, `.xib` files for:
  - URLs: `stripe.com`, `checkout.stripe.com`, `js.stripe.com`, `api.stripe.com`
  - URLs: `paypal.com`, `paypal.me`, `venmo.com`
  - URLs: `gumroad.com`, `lemonsqueezy.com`, `paddle.com`, `chargebee.com`, `recurly.com`
  - URLs: `buy.stripe.com`, `checkout.session`, `payment_intent`
  - SDK imports: `import Stripe`, `import PayPal`, `import BraintreeCore`
  - String patterns: `"Subscribe on our website"`, `"Purchase at"`, `"Buy on web"`
- Check `Podfile` / `Package.swift` for: `Stripe`, `StripePaymentSheet`, `Braintree`, `PayPal`
- EXCEPTION: Reader apps (Netflix, Spotify, Kindle type) may link out under the reader app entitlement — but this is rare and requires Apple approval

#### Expo managed
- Check `package.json` for:
  - `@stripe/stripe-react-native`, `stripe-client`, `react-native-paypal`
  - `@paypal/react-paypal-js`, `react-native-braintree`
- Grep `src/**/*.{ts,tsx,js,jsx}` for payment URLs listed above
- Grep for `Linking.openURL` calls containing payment-related URLs
- Check `app.json` for deep link schemes that might redirect to payment pages

#### React Native CLI
- Same source grep as Expo managed
- Check `ios/Podfile` for Stripe, PayPal, Braintree pods
- Check `android/app/build.gradle` for `com.stripe:stripe-android`, `com.paypal.sdk:*`, `com.braintreepayments:*`

#### Native Android
- Grep `**/*.java`, `**/*.kt`, `**/*.xml` for same URL patterns
- Check `build.gradle` for:
  - `com.stripe:stripe-android`
  - `com.paypal.sdk:paypal-android-sdk`
  - `com.braintreepayments.api:*`
- Check `res/values/strings.xml` for payment URLs
- Note: Google Play has similar restrictions — digital goods must use Play Billing, physical goods can use external payment

Context template: "Found external payment references in {file_count} files: {payment_refs}. Apple Guideline 3.1.1 requires in-app purchase for digital goods and services. External payment SDKs/URLs found: {sdk_list}. This is the #1 cause of App Store rejection."

---

### Check: missing_iap_implementation
Guideline: 3.1.1
Confidence: HIGH when premium features are detected but no IAP framework is integrated

#### Native iOS
- Grep for premium/subscription indicators:
  - `"premium"`, `"pro"`, `"upgrade"`, `"subscribe"`, `"unlock"`, `"paid"`, `"purchase"`
  - `isPremium`, `isSubscribed`, `isPro`, `hasSubscription`, `purchaseState`
  - UI elements: `"Go Pro"`, `"Upgrade Now"`, `"Subscribe"`, `"Premium Features"`
- Then verify StoreKit presence:
  - Grep for `import StoreKit`, `SKPaymentQueue`, `SKProduct`, `Product.products`, `Transaction.currentEntitlements`
  - Check for StoreKit 2: `Product`, `Transaction`, `EntitlementInfo`
  - Check for RevenueCat: `import RevenueCat`, `Purchases.shared`
- Flag if premium indicators exist but zero StoreKit/RevenueCat references found

#### Expo managed
- Grep source for premium/subscription UI text and state variables (patterns above)
- Check `package.json` for:
  - `expo-in-app-purchases` (deprecated)
  - `react-native-iap`
  - `react-native-purchases` (RevenueCat)
  - `expo-purchase` (community)
- Flag if premium features exist but no IAP package installed

#### React Native CLI
- Same source grep for premium indicators
- Check `package.json` for `react-native-iap`, `react-native-purchases`
- Check `ios/Podfile` for `StoreKit`, `RevenueCat`, `Purchases`
- Check `android/app/build.gradle` for billing library

#### Native Android
- Grep for premium indicators in Java/Kotlin/XML source
- Check for Play Billing:
  - `build.gradle`: `com.android.billingclient:billing` or `com.android.billingclient:billing-ktx`
  - Source: `BillingClient`, `BillingFlowParams`, `queryProductDetailsAsync`, `launchBillingFlow`
  - RevenueCat: `com.revenuecat.purchases:purchases-android`
- Flag if premium features exist but no billing library found

Context template: "Found {premium_indicator_count} premium/subscription indicators ({indicators}) but no in-app purchase implementation detected. Searched for StoreKit, Play Billing, RevenueCat, and react-native-iap. Digital goods and premium features require platform-native IAP."

---

### Check: iap_product_mismatch
Guideline: 3.1.1
Confidence: MEDIUM when IAP product IDs in code do not match StoreKit configuration

#### Native iOS
- Grep source for product ID strings — typically formatted as `com.bundleid.product`:
  - Pattern: `"com\.[\w.]+\.(premium|pro|monthly|yearly|weekly|lifetime|subscription|credits|coins)"`
  - Variables: `productIdentifier`, `productID`, `productIds`, `PRODUCT_IDS`
- Check for StoreKit Configuration file:
  - Glob: `**/*.storekit`
  - If file exists, parse for `<productID>` entries and compare against code references
  - If no `.storekit` file, this is informational — products may be configured in App Store Connect only
- Check for hardcoded vs configurable product IDs (hardcoded is a smell but not rejection-worthy)

#### Expo managed
- Grep for product ID strings in source
- Check for `react-native-iap` product arrays: `getProducts`, `getSubscriptions` calls
- Check for RevenueCat offering IDs: `getOfferings`, `purchasePackage`
- No local StoreKit config file expected in Expo projects

#### React Native CLI
- Grep for product ID patterns in `src/` and `app/`
- Check `ios/` for `*.storekit` configuration files
- Compare product IDs between iOS StoreKit config and Android product declarations

#### Native Android
- Product IDs are configured in Google Play Console, not in code
- Grep for product ID strings in source: `queryProductDetailsAsync`, `ProductDetails`, `setProductList`
- Check for `BillingClient.ProductType.SUBS` vs `ProductType.INAPP` usage matching product types

Context template: "Found {product_id_count} IAP product IDs in source: {product_ids}. StoreKit configuration file: {storekit_status}. {mismatch_details}. Mismatched or missing product configurations cause purchase failures during review."

---

### Check: subscription_no_restore
Guideline: 3.1.2
Confidence: HIGH when subscription IAP exists but no restore purchases flow is implemented (iOS)

#### Native iOS
- First confirm subscriptions exist:
  - Grep for `SKProduct` with `subscriptionPeriod`, `Product.SubscriptionInfo`, `auto-renewable`
  - Grep for product IDs containing `monthly`, `yearly`, `weekly`, `subscription`
- Then check for restore:
  - StoreKit 1: `restoreCompletedTransactions()`, `paymentQueueRestoreCompletedTransactionsFinished`
  - StoreKit 2: `Transaction.currentEntitlements`, `Transaction.all`, `AppStore.sync()`
  - RevenueCat: `restorePurchases()`, `Purchases.shared.restorePurchases`
- Check UI for restore button:
  - Grep for `"Restore"`, `"Restore Purchases"`, `"Already Purchased?"` in source/storyboards/xibs
- Flag if subscription exists but NO restore mechanism AND no restore UI found

#### Expo managed
- Check for subscription products in `react-native-iap` or `react-native-purchases` calls
- Grep for: `getAvailablePurchases`, `restorePurchases`, `restoreTransactions`
- Grep UI files for restore button text
- RevenueCat: `Purchases.restorePurchases()`, `useRestorePurchases`

#### React Native CLI
- Same as Expo managed
- Additionally check native iOS code in `ios/` for native restore implementation

#### Native Android
- Less critical on Android (Google handles restore via Play account) but still good practice
- Check for `BillingClient.queryPurchasesAsync` on app launch to restore state
- Grep for `acknowledge` calls — unacknowledged purchases auto-refund after 3 days

Context template: "Subscription IAP detected ({subscription_products}) but no restore purchases implementation found. Apple Guideline 3.1.2 requires a 'Restore Purchases' mechanism. Searched for: restoreCompletedTransactions, Transaction.currentEntitlements, restorePurchases. Missing restore UI text in {ui_file_count} scanned UI files."

---

### Check: missing_subscription_disclosure
Guideline: 3.1.2
Confidence: MEDIUM when auto-renewing subscriptions exist without clear pricing/terms display

#### Native iOS
- Confirm auto-renewing subscriptions:
  - Grep for `subscriptionPeriod`, `introductoryPrice`, `isAutoRenewable`, `auto-renewable`
- Check for pricing display near purchase UI:
  - Grep for `localizedPrice`, `displayPrice`, `priceFormatted`, `price.description`
  - Grep for terms text: `"auto-renew"`, `"automatically renew"`, `"cancel anytime"`, `"subscription terms"`
  - Grep for links to terms: `"terms of use"`, `"terms of service"`, `"EULA"`
- Apple requires: price, duration, auto-renewal disclosure, and links to terms of use and privacy policy on the purchase screen

#### Expo managed
- Grep for subscription pricing display in purchase screens
- Check for `product.localizedPrice`, `package.product.priceString` (RevenueCat)
- Grep for terms/renewal disclosure text in JSX

#### React Native CLI
- Same as Expo managed plus native iOS files

#### Native Android
- Similar requirements for Google Play
- Grep for `productDetails.subscriptionOfferDetails`, `pricingPhases`
- Check for subscription terms text near purchase buttons

Context template: "Auto-renewing subscription detected but pricing/terms disclosure may be incomplete. Found subscription setup in {sub_files}. Missing elements: {missing_elements}. Apple requires: subscription price, duration, auto-renewal statement, terms of use link, and privacy policy link on the purchase screen."

---

### Check: free_trial_no_disclosure
Guideline: 3.1.2
Confidence: MEDIUM when free trial is offered without clear post-trial pricing disclosure

#### Native iOS
- Grep for trial indicators:
  - `introductoryPrice`, `freeTrialPeriod`, `SKProductDiscount`, `isEligibleForIntroOffer`
  - StoreKit 2: `subscription.introductoryOffer`, `SubscriptionOffer`, `PaymentMode.freeTrial`
  - UI text: `"free trial"`, `"try free"`, `"7-day trial"`, `"start trial"`, `"trial period"`
  - RevenueCat: `introPrice`, `packageType`, `offering.availablePackages`
- Check that near trial UI, the post-trial price is displayed:
  - Grep for price display within same file/component as trial text
  - Look for: `"then"`, `"after trial"`, `"per month after"`, `"per year after"`, `"will be charged"`
- Flag if trial text exists but no post-trial pricing text is co-located

#### Expo managed
- Grep source for trial-related text and RevenueCat/IAP trial APIs
- Check that purchase screens show both trial period AND post-trial price
- Grep for `introPrice`, `freeTrialPeriod` in purchase flow components

#### React Native CLI
- Same as Expo managed

#### Native Android
- Grep for `FREE_TRIAL` in billing code, `pricingPhases` with zero-cost phase
- Check UI for post-trial price disclosure

Context template: "Free trial offer detected in {trial_files}. Post-trial pricing disclosure: {disclosure_status}. Apple requires clear communication of what the user will be charged after the free trial ends, displayed on the same screen as the trial offer. Trial text found: '{trial_text_sample}'."

---

### Check: tip_jar_external
Guideline: 3.1.1
Confidence: HIGH when tip/donation features use external payment instead of IAP

#### Native iOS
- Grep for tip/donation indicators:
  - `"tip"`, `"donate"`, `"donation"`, `"support us"`, `"buy me a coffee"`, `"tip jar"`, `"leave a tip"`
  - `tipAmount`, `donationAmount`, `selectedTip`
- Then check if these are routed externally:
  - Grep same files for Stripe, PayPal, Venmo, Cash App URLs or SDK calls
  - Grep for `UIApplication.shared.open` or `Linking.openURL` near tip-related code
  - Grep for `buymeacoffee.com`, `ko-fi.com`, `patreon.com` URLs
- If tips exist AND are routed to external payment -> HIGH confidence rejection
- Exception: If the app is a reader app or the tips go to content creators (not the developer), different rules may apply

#### Expo managed
- Grep for tip/donation text and UI in source files
- Check if payment for tips routes through `react-native-iap` / `react-native-purchases` (OK) or external URLs (not OK)
- Check for `Linking.openURL` calls near donation components

#### React Native CLI
- Same as Expo managed

#### Native Android
- Same grep patterns for tip/donation text
- Check if tips route through Play Billing or external payment
- Google Play has the same requirement — digital tips must use Play Billing

Context template: "Tip/donation feature detected in {tip_files} using external payment ({payment_method}). Apple Guideline 3.1.1 requires in-app purchase for digital tips and donations to the developer. External payment URLs found: {external_urls}. Consider implementing tip amounts as consumable IAPs."

---

### Check: physical_goods_iap
Guideline: 3.1.1
Confidence: LOW when IAP appears to be used for physical goods (informational — should use external payment)

#### Native iOS
- Grep for physical goods indicators near IAP code:
  - `"shipping"`, `"delivery"`, `"address"`, `"ship to"`, `"tracking number"`
  - `"cart"`, `"checkout"`, `"add to cart"` combined with shipping/address fields
  - Product names suggesting physical items: sizes (S/M/L/XL), colors, quantities, weight
- Cross-reference with StoreKit usage — if both exist in same feature area, flag
- This is informational: Apple REQUIRES external payment for physical goods, not IAP

#### Expo managed
- Grep source for physical goods indicators
- If `react-native-iap` is used alongside shipping/address fields, flag

#### React Native CLI
- Same as Expo managed

#### Native Android
- Same grep patterns
- Physical goods must NOT use Play Billing — they should use external payment processors

Context template: "Possible physical goods detected alongside IAP implementation. Physical indicators: {physical_signals} in {files}. IAP implementation in: {iap_files}. Note: Physical goods and services MUST use external payment — Apple/Google IAP is only for digital goods. This may be a false positive if the app sells both digital and physical goods."

---

### Check: cross_platform_unlock
Guideline: 3.1.1
Confidence: MEDIUM when content appears to be unlocked via web purchase without in-app access

#### Native iOS
- Grep for web-purchase restoration patterns:
  - `"login to restore"`, `"sign in to unlock"`, `"already purchased on web"`, `"restore from account"`
  - Server-side entitlement checks: API calls to validate purchase status not through StoreKit
  - Custom auth + entitlement: `userSubscription`, `accountStatus`, `isPaidUser` populated from server, not from StoreKit receipts
- Check if BOTH exist: StoreKit IAP AND server-side entitlement checks
  - Having both is fine (universal purchase)
  - Having ONLY server-side (no StoreKit) is a rejection risk
- Grep for web dashboard/portal URLs that might handle purchases

#### Expo managed
- Grep for server-side entitlement patterns in API calls
- Check if `react-native-iap` / `react-native-purchases` exists alongside server entitlement checks
- Look for `AsyncStorage` or `SecureStore` keys like `subscription_status`, `is_premium` set from API responses (not from IAP verification)

#### React Native CLI
- Same as Expo managed

#### Native Android
- Same patterns — check if premium status comes from server API vs Play Billing verification
- Grep for `SharedPreferences` keys storing purchase state populated from server

Context template: "Possible cross-platform purchase unlock detected. Server-side entitlement checks found in {entitlement_files} but {iap_status}. If users can purchase on web and unlock in-app without going through IAP, this violates Guideline 3.1.1. Ensure iOS IAP is offered as an alternative purchase path."

---

### Check: android_billing_library_version
Guideline: Billing
Confidence: MEDIUM when Play Billing Library version is outdated

#### Native iOS
- Not applicable

#### Expo managed
- Check `package.json` for `react-native-iap` version:
  - v12+ supports Billing Library 6.x
  - Older versions may use deprecated billing APIs
- Check `react-native-purchases` (RevenueCat) version — recent versions handle this automatically
- Check `node_modules/react-native-iap/android/build.gradle` for actual billing library version

#### React Native CLI
- Check `android/app/build.gradle` and `android/build.gradle` for:
  - `com.android.billingclient:billing:` — version must be 6.0.0+ (as of 2025)
  - `com.android.billingclient:billing-ktx:` — same version requirement
- Check `node_modules/react-native-iap/android/build.gradle` for transitive dependency version
- Google requires Billing Library 6+ for new apps and updates as of August 2025

#### Native Android
- Check `app/build.gradle` for:
  - `implementation 'com.android.billingclient:billing:X.Y.Z'`
  - `implementation 'com.android.billingclient:billing-ktx:X.Y.Z'`
- Parse version number — flag if < 6.0.0
- Check `gradle.properties` or version catalogs (`libs.versions.toml`) for centralized version definitions
- Also check for deprecated APIs: `querySkuDetailsAsync` (removed in v6), `SkuDetails` class, `BillingFlowParams.Builder.setSkuDetails`

Context template: "Play Billing Library version {current_version} detected in {gradle_file}. Google Play requires Billing Library 6.0.0+ for app submissions as of 2025. {deprecated_api_count} deprecated API calls found: {deprecated_apis}. Update to latest billing library and migrate from SkuDetails to ProductDetails API."
