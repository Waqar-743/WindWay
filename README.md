<p align="center">
  <img src="public/branding/windway-mark.svg" width="120" height="120" alt="Windway: a winding road through mountains and jungle" />
</p>

<h1 align="center">Windway</h1>

<p align="center">
  <strong>Take the long way.</strong><br />
  Two cars. Three roads. A little escape in your browser.
</p>

<p align="center">
  <a href="https://waqar-743.github.io/WindWay/">Play Windway</a> ·
  <a href="https://github.com/Waqar-743/WindWay">Explore the source</a>
</p>

## From the showroom to the open road

Windway started as a 3D car viewer: you could look around a car, change its paint, and admire it. But I kept coming back to one question: **where would I drive it?**

So I gave it a road. Then a jungle. Then a snowy mountain that makes you earn the view.

This isn't a serious racing simulator. It's my ongoing experiment in making a small, playful world you can jump into for a drive. The cartoon animals, familiar names, and occasional bad landing are part of its personality.

## Choose your next story

- **The alpine loop** — an open valley, river bridges, goats and eagles. One lap to find your rhythm, with an on-road boost jump.
- **Canopy Run** — two laps through dense jungle, with wildlife, a ranger station, and the cartoon road crew: WAQAR, IMRAN and TATHEER.
- **Frostbite Ascent** — the hardest road: a 6.44 km mountain climb with slippery ice, snow-block obstacles, and a finish at the summit.

All three live on one landing page. Use the hero's **Explore** button to visit the selected map's details before starting, or head to the garage to choose a car.

## Your car, your pace

Pick the lively **McLaren MCL38** or the grippier **Mercedes-AMG W14**, choose a paint colour, and chase your own best time. This is a **single-player time trial**, not multiplayer; records stay on your device, separately for each map and car.

During a drive, the live roadmap sits at the bottom-left and speed at the bottom-right, above the touch controls when needed. Time, laps and gates stay at the top-right. Miss an unprotected edge? You'll return to your last checkpoint without losing your progress.

## Run it locally

With Node.js 20 or newer:

```sh
git clone https://github.com/Waqar-743/WindWay.git
cd WindWay
npm ci
npm run dev
```

Open [the local game](http://127.0.0.1:4175/WindWay/).

**Controls:** W / arrows to drive, S to brake or reverse, A/D to steer, Space to drift, R to recover, C to switch camera, and Escape / P to pause. Touch steering and pedals are available on smaller screens and touch devices. Sound, graphics and calmer motion can be adjusted in Settings.

## A peek under the bonnet

### Windway for Android

The Android edition is being built on [codex/flutter-android](https://github.com/Waqar-743/WindWay/tree/codex/flutter-android), separate from the live website. It uses Flutter menus and bundles the existing 3D game for offline driving, with arrow, steering-wheel and phone-tilt controls. See the [Android app guide](mobile/README.md) for builds, device testing and installation notes.

### The browser game

Built with React, TypeScript, Three.js, React Three Fiber, Rapier and Zustand. The game loads the selected car on demand, and lighter graphics reduce scenery and shadows.

The characters and roadside details are editable SVGs: [alpine gallery](https://waqar-743.github.io/WindWay/cartoon-pack/), [jungle gallery](https://waqar-743.github.io/WindWay/jungle-pack/), [snow gallery](https://waqar-743.github.io/WindWay/snow-pack/).

```sh
npm run test:game
npm run test:site
npm run build
npm run test:build
```

These automated checks cover game state, track rules, UI and build assets; they don't replace real browser and device testing. GitHub Actions publishes the main branch to GitHub Pages.

For the longer version, see the [driver's guide](docs/WILDWAY.md), [performance notes](docs/PERFORMANCE.md), or [original viewer documentation](docs/LEGACY_VIEWER.md).

## Credit where it's due

Car models are by [MattsActuallyUsefulModels](https://sketchfab.com/MattsActuallyUsefulModels), under **CC BY-NC-SA 4.0**: non-commercial use only, with modified model assets retaining the same license. Full sources, changes and notices are in [MODEL_CREDITS.md](public/MODEL_CREDITS.md).

Windway is an independent learning/demo project, not affiliated with Formula 1, McLaren, Mercedes-AMG or the model artist. Their names and marks belong to their owners. The named cartoon crew are fictional designs, not portraits of real people.

---

Made with curiosity. Still finding out what's around the next bend.

[Follow Windway on GitHub](https://github.com/Waqar-743/WindWay).
