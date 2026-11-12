# Windway Android artwork

The app icon is an original open-wheel racing car in Windway's pine-green, cream, and papaya-orange palette. It does not use the Formula 1 logo, a team logo, or a third-party car render.

- `app-icon.svg` is the editable 256 × 256 source for the legacy launcher icons.
- `adaptive-foreground.svg` is the transparent 108 × 108 Android foreground. The entire car stays inside the central 66 dp safe zone.
- `app-icon-preview.png` is a generated 512 × 512 visual preview.

From the repository root, run `node scripts/prepare-android-assets.mjs` to copy all original SVGs into `mobile/assets/art`, preserve model credits, and regenerate Android launcher resources at all five Android densities. Run `node scripts/test-android-assets.mjs` to verify complete coverage, byte-for-byte source hashes, viewBoxes, SVG references, and icon sizing. The generator does not alter `public/` or the website assets.

SVGs remain vectors: Flutter widgets choose explicit logical-pixel dimensions with `BoxFit.contain`, rather than stretching the source illustrations. The inventory recommends 112 logical pixels for menu artwork and 28 for small HUD artwork. Touch targets remain at least 48 logical pixels even when the artwork itself is smaller.

Some original SVG badges and character portraits contain SVG `<text>`, which Flutter SVG does not render. Their inventory entries set `containsText: true`; all important names, numbers, and labels must also be native Flutter `Text` widgets. Contact sheets and the wide scene preview are included as archival overviews, not gameplay overlays.
