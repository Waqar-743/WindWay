# Windway for Android (Native Kotlin Edition)

Windway Android is built as a **pure Native Kotlin Android application** (`com.waqar.windway`, Android 7.0 / API 24+) hosting the unified offline 3D Three.js + Rapier3D WASM driving game via AndroidX `WebViewAssetLoader`.

## Why Native Kotlin instead of Flutter?

- **Zero Flutter Engine Bloat**: Removes ~18 MB of `libflutter.so` + Dart VM + Skia/Impeller overhead so mid-range Android devices dedicate maximum RAM and GPU headroom to the 3D physics and WebGL2 driving engine.
- **True Zero-Permission Offline Security**: Uses AndroidX `WebViewAssetLoader` (`https://appassets.androidplatform.net/assets/game/`) with strict path sanitization and exact MIME typing for `.wasm`, `.glb`, `.js`, `.svg`, and `.ttf` — **zero `INTERNET` permission** and zero localhost HTTP server ports!
- **One Unified Codebase**: The Starter Onboarding Guide, Motorsport Lobby with live 3D Car Showroom, Path selector, 6-Level progression hub (18 challenges), 3D Garage & Paint Studio, Crew, Records, Settings, and 3D Cockpit live in one single TypeScript/React codebase synced with native Kotlin capabilities.
- **Native Android Features**:
  - Android 12+ SplashScreen API (`androidx.core:core-splashscreen`)
  - Edge-to-edge sticky immersive landscape with display cutout support
  - Landscape rotation-aware Tilt Steering (`Sensor.TYPE_GRAVITY` / `TYPE_ACCELEROMETER`) with deadzone, smoothing & one-tap neutral calibration
  - Tactile Haptic Feedback (`VibratorManager` / `Vibrator`) on gate crossings, boosts, impacts, and finishes
  - Native `SharedPreferences` backup persistence (`WindwayAndroidHost`)
  - Hardware Back button & Activity lifecycle auto-pause (`onPause`/`onResume`)
  - `FLAG_KEEP_SCREEN_ON` during active drives

## Build & Run

From the repository root with Node.js 20+, Java 17, and Android SDK installed:

```sh
npm ci
npm run android:prepare
npm run test:android:assets
npm run test:android:web
npm run test:android:bridge
npm run test:mobile:app
```

Then build or run the Native Kotlin Android app from `android/` (or open `android/` directly in Android Studio):

```sh
cd android
gradle testDebugUnitTest assembleRelease
```

The release APK is written to `android/app/build/outputs/apk/release/app-release.apk`.

## Try the Mobile App Locally on a Laptop

```sh
npm run preview:mobile
```

Open `http://127.0.0.1:4186/index.html?native=1` to walk through the first-launch Starter Guide, Paths, 6 Levels per path, 3D Garage, Crew, Records, Settings, and live 3D driving.
