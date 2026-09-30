# Phone and App Store path (Capacitor)

The web app already works on phones: open the live site and use *Add to Home Screen*. This guide covers the next step, which is shipping it as a real iOS/Android app with [Capacitor](https://capacitorjs.com/). Capacitor wraps a web build in a native shell.

Facts checked 2026-09-29 against the official Capacitor, Apple and Google pages linked below. Prices and tool versions change, so re-check before you pay or install anything. Items marked **(unverified)** could not be confirmed.

## Why this build is already Capacitor-ready

| Property | Where | Why it matters |
|---|---|---|
| Relative asset paths | `vite.config.ts` → `base: './'` | Capacitor serves `dist/` from inside the app bundle, not from `/`. Absolute paths would break. |
| No DOM outside `src/ui/` | AGENTS.md rule 10 | `src/physics`, `src/data` and `src/pipeline` are pure TypeScript. They would work unchanged under a future native UI or in a web worker. |
| No runtime dependencies | `package.json` has only devDependencies | Small bundle, nothing that needs a server. |
| Touch-first UI | `src/ui/README.md` | Touch targets ≥ 44 px, inputs ≥ 16 px (stops iOS zoom-on-focus), `touch-action: manipulation`, nothing depends on hover. |
| Safe areas | `viewport-fit=cover` in `index.html`; `env(safe-area-inset-*)` in CSS | Content stays clear of the notch and the home indicator. |
| Works offline | `public/sw.js`, `public/manifest.webmanifest` | The whole model runs on the device, and the data snapshot is a static JSON file. |
| Catalog loaded by relative URL | `src/data/catalog.ts` → `CATALOG_URL = './data/exoplanets.json'` | The snapshot ships inside the app bundle. |

One difference to know about: inside Capacitor the app is already local, so the service worker adds little. It is registered only in production builds (`src/main.ts`). If it causes caching trouble in the native shell, skip registration when `window.Capacitor` exists. That is an Agent 7 change.

## Requirements

| For | You need | Checked |
|---|---|---|
| Both | Node.js 22+ (Capacitor 8 requirement; this repo's data script already needs ≥ 22.18) | [Capacitor env setup](https://capacitorjs.com/docs/getting-started/environment-setup) |
| iOS | **A Mac** with Xcode (Capacitor 8 docs say Xcode 26.0 or newer). iOS apps cannot be built on Windows or Linux. | same |
| iOS | [Apple Developer Program](https://developer.apple.com/programs/enroll/): **US $99 per year** (price varies by region). You must be the legal age of majority; if not, a parent or guardian enrolls and shares access. You can test on your own iPhone from Xcode without paying, but free provisioning is limited **(unverified details)**. | Apple enrollment page |
| Android | Android Studio (Capacitor 8 docs: 2025.2.1 or newer), Android SDK API 24+ | Capacitor env setup |
| Android | [Google Play Console](https://support.google.com/googleplay/android-developer/answer/6112435): **US $25 one-time**. You must be 18 or older. New *personal* accounts must run a **closed test with at least 12 testers opted in for 14 continuous days** before they can apply for production access, and must verify access to an Android device. | Google Play Help ([testing requirement](https://support.google.com/googleplay/android-developer/answer/14151465)) |

## Step by step

Run everything from the repository root. Pick your own app ID in reverse-domain form; `com.example.habitability` is only an example. App IDs can't start a segment with a digit on Android, so `00ayaan` can't be used as-is **(unverified for every tool)**. The app ID can't be changed after you publish.

```bash
# 1. Install Capacitor (core + CLI + platforms)
npm i @capacitor/core @capacitor/ios @capacitor/android
npm i -D @capacitor/cli

# 2. Create capacitor.config.ts. The web dir MUST be Vite's output folder, dist
npx cap init "Habitability" com.example.habitability --web-dir dist

# 3. Build the web app. For real-planet data, fetch the snapshot first (needs internet)
npm run data:fetch      # optional but recommended: writes public/data/exoplanets.json
npm run build           # writes dist/

# 4. Create the native projects (commit the ios/ and android/ folders)
npx cap add ios
npx cap add android

# 5. Copy dist/ into the native projects (repeat after every web build)
npx cap sync

# 6. Open in the native IDE, then run on a simulator or device
npx cap open ios        # Xcode: choose your Team under Signing & Capabilities, then Run
npx cap open android    # Android Studio: Run, or Build > Generate Signed App Bundle
```

Your day-to-day loop: change the code → `npm run build` → `npx cap sync` → run from Xcode or Android Studio.

Since Capacitor 8, iOS projects use Swift Package Manager by default; CocoaPods is optional. `.gitignore` already ignores `ios/App/Pods/` and `android/.gradle/`.

## How the data snapshot ships and refreshes

- `npm run build` copies `public/data/exoplanets.json` into `dist/data/`. `npx cap sync` then copies it into the app bundle, so **the app works fully offline from the first launch**. This also satisfies Apple guideline 4.2.3(ii): there is nothing to download before the app can be used.
- The snapshot in the app is fixed at the moment you build. To refresh it, run `npm run data:fetch`, rebuild, sync, and submit an update to the stores. A monthly or per-release refresh is plenty; confirmed small exoplanets don't change daily.
- If you build without a snapshot, the app offers hypothetical mode only. **Always run `npm run data:fetch` before a store build**, and check that `dist/data/exoplanets.json` exists.
- A future option is to download a newer snapshot at runtime (the JSON is *data*, not code, so guideline 2.5.2 should not apply). The app would still need to keep the bundled copy as a fallback. The current code does not do this.

## Icons and splash screens

Use [`@capacitor/assets`](https://capacitorjs.com/docs/guides/splash-screens-and-icons):

```bash
npm i -D @capacitor/assets
# put source images in ./assets/
#   icon-only.png          ≥ 1024×1024 (no transparency for iOS)
#   icon-foreground.png    ≥ 1024×1024 (Android adaptive icon)
#   icon-background.png    ≥ 1024×1024
#   splash.png             ≥ 2732×2732
#   splash-dark.png        ≥ 2732×2732
npx capacitor-assets generate          # or --ios / --android
```

Start from `public/icons/icon.svg`: export it at 1024×1024 (with Inkscape, Figma, or a browser screenshot). Since Android 12 the system shows a small icon on a coloured background rather than a full-screen splash image, so keep the important part of the splash in the centre.

## App Store review: guideline 4.2 (minimum functionality)

Apple's [guideline 4.2](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality) says an app should "include features, content, and UI that elevate it beyond a repackaged website". Wrapped websites are a common reason for rejection. The app's case:

**Already present**
- The whole physics model runs **on the device, offline**. Nothing depends on a website being online.
- It is an interactive simulation (sliders, a live animated orbit, explanations for each check), not static content.
- It bundles a curated dataset (the NASA archive snapshot) and uses no ads or tracking.
- It follows native conventions: respects safe areas, reduced motion and dark mode, has large touch targets and no hover-dependence.
- It is educational, with an explanation for every result.

**Worth adding before submitting** (each is a UI/Capacitor task, not physics)
- **Haptics** (`@capacitor/haptics`): a light tap when the habitability status changes, or when a slider crosses a habitable-zone edge.
- **Share sheet** (`@capacitor/share`): share a planet configuration as text, or as an image of the orbit view.
- **Status bar and splash** (`@capacitor/status-bar`, `@capacitor/splash-screen`) so launch looks native.
- **Saved scenarios** kept on the device (`@capacitor/preferences`).
- A **"Learn" section** built from ASSUMPTIONS.md, so the app teaches as well as calculates.
- An in-app **About/credits** screen with the NASA Exoplanet Archive acknowledgment and the "not a life detector" disclaimer.

Other review points:
- **Privacy:** the app collects nothing. Say so in App Store Connect's privacy "nutrition label" and in Play's Data safety form. Both stores still require a **privacy policy URL**; a short page on GitHub Pages is enough.
- **Accuracy claims:** keep "model output, not evidence of life" wording in the store description too, not only in the app.
- **Age rating / category:** Education; no objectionable content.
- **Guideline 2.5.2:** don't download code at runtime. Downloading data (JSON) is a different thing (see above).

## Checklist

- [ ] Owner has added a `LICENSE` file (the README explains why)
- [ ] App name and permanent app ID chosen
- [ ] `npm ci && npm test && npm run typecheck` pass
- [ ] `npm run data:fetch` succeeded; `dist/data/exoplanets.json` present after `npm run build`
- [ ] Capacitor installed; `capacitor.config.ts` has `webDir: 'dist'`
- [ ] `npx cap add ios` / `npx cap add android`; `npx cap sync`
- [ ] Icons and splash generated with `@capacitor/assets`
- [ ] Tested on a real phone: sliders, orbit animation, offline (airplane mode), notch and safe areas, dark mode, rotation
- [ ] Service-worker behaviour inside the native shell checked (see note above)
- [ ] At least one native feature added (haptics / share / saved scenarios) for guideline 4.2
- [ ] About screen with archive acknowledgment and disclaimer
- [ ] Privacy policy URL published; privacy label and Data safety forms filled in
- [ ] Screenshots in the required sizes for each store **(check current size list in App Store Connect / Play Console)**
- [ ] iOS: Apple Developer Program enrolled; signing team set in Xcode; archive uploaded; TestFlight tested
- [ ] Android: Play Console account; signed App Bundle (.aab); closed test with 12+ testers for 14 days (new personal accounts); then production
- [ ] CHANGELOG entry for the first store release
