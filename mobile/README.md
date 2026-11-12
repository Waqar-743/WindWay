# Windway, now in your pocket

I started Windway with a car on a screen. Then I wanted a road, then a jungle, then a mountain that fought back. This Android edition brings those same three roads into an app, with a quieter interface and room for your thumbs.

Made by [Waqar Ahmed](https://github.com/Waqar-743). Source: [WindWay](https://github.com/Waqar-743/WindWay/tree/codex/flutter-android).

## What is inside?

Flutter provides a full-screen landscape game lobby, Start / Continue, characters, settings, and the driving guide. The actual 3D driving game is the existing **Three.js / Rapier game bundled into a local Android WebView**. Everything needed to drive is included in the APK.

Android 1.1.1 includes the dark scenic lobby and smaller, box-free driving controls. Gameplay icons are one-third of their former size while invisible 44-pixel hit areas keep them usable. The timer and minimap are smaller too. Tap **START DRIVE** to enter the selected road immediately. **Pause** opens Resume, Restart, and Stop drive. The **STOP** button at the top-left saves your last earned checkpoint and returns to the garage in one tap. Android Back also pauses the drive. Continue resumes at the saved gate; releasing a pedal or returning from the background never holds the accelerator for you.

- Alpine: the original winding valley loop, bridges, and boost ramp.
- Canopy Run: a dense jungle circuit, two laps, and the familiar wildlife.
- Frostbite Ascent: the long, slippery mountain climb to the summit.
- Two cars, the full SVG collection, and a new original open-wheel launcher icon.
- Compact corner information: minimap left, speed right, with time and race progress kept away from the middle of the road.
- Continue restores the last saved race checkpoint, not an arbitrary mid-air frame. Your preferences stay on the device.

Choose arrow buttons, a virtual steering wheel, or **phone tilt**. Tilt means gently rotating the phone left and right; do not bend, stretch, or shake the device. Settings also include camera and performance choices. The first version is single-player, not an online multiplayer game.

## Graphics

The car retains its original livery textures, carbon detail and reflective materials. Each road has its own blue or teal sky, warm sunlight, cool fill light, textured road and terrain, continuous kerbs, and reflective water or ice. The sky and surface textures are generated locally, so the graphics need no online downloads.

Automatic graphics considers memory and CPU hints instead of treating every phone as a low-end device. A 4 GB device starts with lower scenery density, a 1.15× rendering cap, antialiasing and a 512-pixel shadow map; devices reporting 2 GB or fewer resources omit shadows and antialiasing. Faster phones can render up to 1.35× automatically; High allows up to 1.5×. After a warm-up, Auto reduces rendering resolution under sustained load to a floor of 0.8× and raises it only after several healthy samples. Low and calmer effects remain available. These caps describe rendering resolution relative to logical screen pixels.

Actual frame rate, thermal behavior, touch feel, and tilt calibration still need testing on a physical phone. There is no guaranteed 60 FPS claim. An emulator or a successful APK build does not establish hardware performance.

## Try the mobile game flow on a laptop

From the repository root, run:

```sh
npm run preview:mobile
```

Open [the local mobile app](http://127.0.0.1:4186/index.html?native=1). It opens the game lobby instead of automatically entering a race. Start / Continue, Roads, Garage and paint selection, Crew, Settings, Personal bests, How to play, and About are available here. The garage has a local 3D car preview, and every selection is applied to the actual bundled game when you start.

Click inside the drive, then use WASD or the arrow keys. P / Escape pauses, R recovers the car, C switches camera, and Space applies the handbrake. Arrow buttons and the virtual wheel remain available. Stop saves the last earned checkpoint and returns to the lobby; Continue restores that road and car even if you have since browsed other choices. Preferences, checkpoints, and records stay in this browser, separately from the Android app.

Gameplay icons now appear at one-third of their former size, without dark button or instrument boxes. Invisible 44-pixel hit areas keep them easier to press. The minimap and timer are smaller as well. Menu actions retain readable sizes.

This runs the shared gameplay and browser app menus, rather than executing an APK. Android-specific menus, lifecycle behavior and phone tilt still need checking in the installed app. The local preview listens only on this laptop and never changes the published website.

## Build and run

Use Node.js 20, Flutter **3.47.7 stable**, Java 17, and an installed Android SDK. The Android project targets Android 7.0 / API 24 or newer. From the repository root:

```sh
npm ci
node scripts/prepare-android-assets.mjs
node scripts/prepare-android-web.mjs
node scripts/test-android-assets.mjs
node scripts/test-android-web.mjs
npm run test:android:bridge
cd mobile
flutter pub get
flutter analyze
flutter test
flutter run
```

The generated `assets/game` folder is intentionally ignored by Git. **Prepare the web bundle before running Flutter**; a fresh clone cannot drive until that build step has completed. If the app reports missing bundled game files, regenerate them with the two prepare scripts above and rebuild the app. It does not silently replace the game with an online page or an empty placeholder.

To make one installable APK covering both 32-bit and 64-bit Android firmware:

```sh
flutter build apk --release --target-platform android-arm,android-arm64
```

The installer appears at `mobile/build/app/outputs/flutter-apk/app-release.apk`. It includes ARMv7 and ARM64, so you do not need to guess which firmware your Infinix uses. Download the shared installer and the ZIP package from the [Android 1.1.1 release](https://github.com/Waqar-743/WindWay/releases/tag/v1.1.1-android-demo.1). The ZIP includes the same APK, source archive, installation notes, checksums, and the prepared [trailer production assets](../docs/trailer/README.md). The full gameplay trailer still needs genuine gameplay recordings. The GitHub **Build Windway Android demo** workflow also runs on this Android branch or on manual request and retains its build artifact for 14 days.

The published 1.1.1 APK uses the same development signing certificate as the published 1.1.0 APK, so it can update that version without clearing its saved runs. The older 1.0.0 demo used a different certificate and must be removed first. Uninstalling clears app preferences and saved runs.

The automated checks cover checkpoint save and stop ordering, pause/resume during countdown and recovery, restart and retry, adaptive graphics limits, and landscape control clearance and contrast. Native widget tests cover immediate Start, preferences, and responsive menus. Visual checks use the bundled game in a landscape browser preview; they do not establish phone GPU performance.

These are **demo APKs using the development signing setup**, not Play Store-ready releases. A real release still needs your private signing key, release configuration, device testing, and store disclosures. Do not commit signing keys or passwords.

## Offline, with credit where it belongs

Cars, SVGs, code, physics, and sounds are packaged with the application. Gameplay requires no account, analytics, remote fonts, or asset downloads. Initial development builds still need the normal package downloads on the build computer. Profile, source, and license links are external destinations, not a requirement to play.

The car artwork by [MattsActuallyUsefulModels](https://sketchfab.com/MattsActuallyUsefulModels) retains **CC BY-NC-SA 4.0** attribution and noncommercial restrictions. Read the complete [model credits](assets/art/MODEL_CREDITS.md) before sharing or distributing. Formula 1, McLaren, and Mercedes-AMG marks belong to their respective owners; Windway is an independent, noncommercial learning project, not an official product.

The launcher artwork is an original stylized open-wheel car, not the Formula 1 logo. Editable sources and sizing notes are in [branding](branding/README.md).
