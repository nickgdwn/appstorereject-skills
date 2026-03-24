# Design Checks

### Check: missing_accessibility_labels
Guideline: 4.x
Confidence: MEDIUM when interactive elements lack accessibility identifiers
Risk: MED
Finding template: "{count} interactive elements without accessibility labels"

#### Native iOS
Grep for `UIButton`, `UIImageView`, `UISlider`, `UISwitch`, and custom `UIView` subclasses. For each interactive element, check that `.accessibilityLabel` is set or that the element has descriptive text content. Search for `isAccessibilityElement = true` without a corresponding `accessibilityLabel`. Check XIB/Storyboard files for `accessibilityIdentifier` and `accessibilityLabel` attributes on interactive controls — missing values appear as empty strings in the XML.

#### Expo managed
Grep source files for `<TouchableOpacity>`, `<Pressable>`, `<TouchableHighlight>`, and `<Button>` components. Check each for `accessibilityLabel` prop. Look for `<Image>` components without `accessibilityLabel` or `accessible={false}` (decorative images should be explicitly excluded). Search for icon-only buttons — a `<Pressable>` containing only an `<Icon>` or image with no label is inaccessible. Check if `accessibilityHint` is used where action is non-obvious.

#### React Native CLI
Same as Expo managed — grep for interactive components (`TouchableOpacity`, `Pressable`, `TouchableHighlight`) lacking `accessibilityLabel`. Additionally check native module wrappers in `android/` and `ios/` for accessibility attributes on custom views. Grep for `accessibilityRole` usage — interactive elements should declare `role` (button, link, checkbox, etc.) in addition to label. Look for `<Text onPress={...}>` patterns that act as buttons without accessibility role.

#### Native Android
Search `res/layout/*.xml` for `<ImageButton>`, `<ImageView>`, `<Button>`, and custom views. Check for `android:contentDescription` on image-based interactive elements — absence is a flag. Grep Java/Kotlin source for `.contentDescription = ` assignments on dynamically created views. Check for `android:importantForAccessibility="no"` on elements that appear interactive. Look for `RecyclerView` item layouts missing content descriptions on action buttons within each item.

Context template: "Found {count} interactive element(s) without accessibility labels in {file_paths}. Apple guideline 4.x requires VoiceOver/TalkBack support — elements like {example_element} at {location} have no accessible name, making the app unusable for visually impaired users."

---

### Check: non_native_ui_patterns
Guideline: 4.x
Confidence: MEDIUM when platform-inappropriate navigation or UI patterns are detected
Risk: MED
Finding template: "Platform-inappropriate UI patterns detected ({pattern_name})"

#### Native iOS
Grep for hamburger menu patterns: three-line menu icons (`≡`), `DrawerLayout`, `NavigationDrawer`, or sidebar navigation toggled by a hamburger button. These are Android patterns — iOS uses tab bars (`UITabBarController`) or navigation stacks. Check for bottom navigation bars implemented without `UITabBarController` (custom views mimicking Android bottom nav). Look for `Back` buttons labeled "Back" without a title — iOS convention is the previous screen's title.

#### Expo managed
Check navigation library usage in `package.json` — `@react-navigation/drawer` on iOS triggers the non-native pattern flag. Grep for `DrawerNavigator` usage in iOS-targeted screens. Look for `<FAB>` (Floating Action Button) components used as primary actions on iOS — this is an Android Material Design pattern. Check for `Snackbar` components (Android pattern) used instead of iOS `Alert` or toast alternatives. Review bottom sheet implementations — ensure they use iOS-native feel, not Android bottom sheet behavior.

#### React Native CLI
Same as Expo managed for JS patterns. Additionally check `ios/` for any native modules importing Android-style UI components. Grep for `react-native-paper` (Material Design) components used in iOS-specific screens — `FAB`, `Snackbar`, `NavigationBar` are Material patterns. Check `android/` for any iOS-style components (`NavigationController` patterns) reimplemented in Java/Kotlin.

#### Native Android
Grep layouts for `UINavigationBar`, bottom tab bar patterns copied from iOS (fixed bottom tabs with SF Symbols or iOS-style icons). Check for iOS-style back chevron (`‹`) used instead of Android back arrow (`←`). Look for `AlertDialog` used where a `Snackbar` or `Toast` would be more appropriate. Check for iOS-style switches (`UISwitch` visual clones) instead of Material `SwitchCompat`. Verify the app uses Material You / Material Design 3 components where Android conventions apply.

Context template: "Found {pattern_name} in {file_path} — this is a {source_platform} UI pattern used in a {target_platform} context. Apple/Google reviewers flag apps that feel foreign to the platform. Consider replacing with {native_alternative}."

---

### Check: missing_dark_mode_support
Guideline: 4.x
Confidence: LOW when no dark mode color definitions are found
Risk: LOW
Finding template: "No dark mode color definitions found"

#### Native iOS
Check `Assets.xcassets` for color sets — each color used in the app should have both `Any Appearance` and `Dark` variants. Grep `Info.plist` for `UIUserInterfaceStyle` — if set to `Light`, dark mode is explicitly disabled (reviewers may flag this for non-utility apps). Search Swift/ObjC source for hardcoded color values like `UIColor(red:green:blue:)` or hex color initializers instead of semantic colors (`UIColor.label`, `UIColor.systemBackground`). Check Storyboard/XIB files for hardcoded color attributes.

#### Expo managed
Check `app.json` for `userInterfaceStyle` — `"light"` forces light mode. Look for a `dark` entry in theme configuration. Grep for hardcoded color strings in StyleSheet definitions: `color: '#000000'`, `backgroundColor: '#ffffff'` — these won't adapt to dark mode. Check if `useColorScheme()` hook is used anywhere. Look for a `theme.ts` or `colors.ts` file — if it only defines one set of colors (no dark variants), dark mode is unsupported.

#### React Native CLI
Same JS-layer checks as Expo managed. Additionally check `ios/` Info.plist for `UIUserInterfaceStyle`. Check `android/res/values/` for `colors.xml` — then check if `res/values-night/colors.xml` exists with dark variants. Grep `android/res/layout/` for hardcoded `android:textColor` or `android:background` hex values. Look for `AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)` in Java/Kotlin which forces light mode.

#### Native Android
Check `res/values/colors.xml` and verify a matching `res/values-night/colors.xml` exists. Open `res/values/themes.xml` — the app theme should extend `Theme.Material3.DayNight` or `Theme.AppCompat.DayNight`, not a forced-light variant. Grep Java/Kotlin for `AppCompatDelegate.MODE_NIGHT_NO`. Check for hardcoded colors in layout XML files. Verify `android:forceDarkAllowed` is not set to `false` on the root application theme in `AndroidManifest.xml`.

Context template: "No dark mode color definitions found — {evidence} (e.g. missing values-night/, hardcoded hex colors, UIUserInterfaceStyle=Light). Guideline 4.x increasingly flags apps that ignore system appearance settings. Users on dark mode will see harsh white UI."

---

### Check: ipad_layout_missing
Guideline: 4.x
Confidence: MEDIUM when app targets iPad (Universal) but shows no iPad-specific layout adaptations
Risk: MED
Finding template: "Universal (iPad) app with no iPad-specific layout adaptations"

#### Native iOS
Check `Info.plist` for `UIDeviceFamily` — if it includes `2` (iPad), the app targets iPad. Then check for `UISplitViewController` usage, `UIPopoverPresentationController`, or size class adaptations (`traitCollection.horizontalSizeClass == .regular`). Grep Storyboard files for iPad-specific size class overrides. If none are found and the app is Universal, it is likely just phone layout stretched on iPad. Check `LaunchScreen.storyboard` — a phone-sized launch screen on iPad is a signal.

#### Expo managed
Check `app.json` for `ios.requireFullScreen` — `false` means the app should support iPad multitasking and requires adaptive layout. Look for `Platform.OS === 'ios' && Platform.isPad` conditionals — absence suggests no iPad-specific handling. Check for responsive layout patterns: `Dimensions.get('window').width` comparisons or `useWindowDimensions()` hook usage. If the app uses a fixed-width layout (e.g. `width: 375`), it will look stretched on iPad.

#### React Native CLI
Same JS checks as Expo. Also inspect `ios/<AppName>/Info.plist` for `UIDeviceFamily` array. Check if `UISplitViewController` or equivalent two-column layout is used for iPad. Grep for `Platform.isPad` — if never referenced, iPad experience is likely untailored. Review navigation structure — on iPad, master-detail patterns (`NavigationSplitView`, sidebar navigation) are expected for content-heavy apps.

#### Native Android
Android tablets are analogous — check `res/layout-sw600dp/` for tablet-specific layouts (7"+ tablets at 600dp+). If absent and the app targets tablets, it is using phone layout stretched. Check `AndroidManifest.xml` for `<compatible-screens>` restrictions. Grep for `getResources().getConfiguration().smallestScreenWidthDp` comparisons. Verify the app handles landscape orientation gracefully on large screens.

Context template: "App declares Universal (iPad) support in {plist_or_config} but no iPad-specific layout adaptations were found ({evidence}). Apple reviewers test on iPad — phone layout stretched to fill a 12.9-inch screen is grounds for guideline 4.x rejection. Add size class handling or restrict to iPhone-only."
