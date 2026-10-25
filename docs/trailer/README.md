# WINDWAY reveal trailer production assets

**Status: the full 60-second gameplay trailer is unfinished.** These assets contain the completed animated ending, an original instrumental score, and the edit plan. Genuine recordings of the playable game are still needed. No gameplay has been fabricated.

## Included assets

| File | Purpose |
| --- | --- |
| [windway-ending-preview-6s.mp4](assets/windway-ending-preview-6s.mp4) | Finished 1920×1080, 30 fps animated ending with the final six seconds of the score. This is a preview, not the full trailer. |
| [windway-end-card.png](assets/windway-end-card.png) | Full-resolution ending poster. |
| [windway-original-score-60s.m4a](assets/windway-original-score-60s.m4a) | Original synthesized 60-second instrumental, 48 kHz stereo; no third-party music samples. |
| [edit-timeline.json](assets/edit-timeline.json) | Contiguous 60-second edit sequence with scene timing and text. |
| [verification.json](assets/verification.json) | Export checks and the explicit incomplete-trailer status. |

The lossless WAV is omitted to keep the repository and download small. It can be regenerated with `--keep-wav`.

## Creative brief

Create an adventurous, confident reveal trailer for **WINDWAY**, the stylized 3D driving game for Android. Introduce the actual game, demonstrate it working, and make viewers excited to drive. Use the real cars, environments, menus, and compact transparent gameplay controls. Improve presentation through framing, clean typography, rich color, smooth cuts, and synchronized sound while preserving the game's visual style.

The final video should be **1920×1080 landscape, 30 fps, exactly 60 seconds**. Text must remain readable on a phone. Avoid invented features, multiplayer scenes, performance claims, unrelated logos, fabricated gameplay, editor watermarks, and placeholder text.

| Time | Authentic footage and edit | On-screen text |
| --- | --- | --- |
| 0–5 s | Engine start, selected car close-up in the 3D garage, then Alpine acceleration. | YOUR ROAD. YOUR PACE. |
| 5–13 s | Starter screen; select both cars and a paint color; match the chosen car to its driving shot. | MAKE THE DRIVE YOURS. |
| 13–18.5 s | Alpine Valley corners, pine forests, river crossing, and the boost ramp. | ALPINE VALLEY |
| 18.5–24 s | Canopy Run tropical forest, jade rivers, and jungle circuit. | CANOPY RUN |
| 24–29 s | Frostbite Ascent snowy roads, narrow switchbacks, and summit climb. | FROSTBITE ASCENT |
| 29–43 s | One continuous drive showing acceleration, cornering, a checkpoint, and a successful ramp landing where available. Keep the controls, timer, and minimap visible. | No additional text. |
| 43–51 s | Settings, a steering choice, Start, Pause, Stop to lobby, then Continue. Frame interactions so they can be understood. | START. EXPLORE. PICK UP WHERE YOU LEFT OFF. |
| 51–54 s | Strongest genuine driving moments across all three maps. | No additional text. |
| 54–60 s | Completed animated end card. | WINDWAY / Your road. Your pace. / COMING SOON TO ANDROID |

Build the score from quiet anticipation to energetic driving. Use genuine or appropriately sourced engine, tire, wind, and interface effects, synchronized with the footage. The included music does not contain gameplay sound effects.

## Footage needed to finish the trailer

Record one combined session or separate clips, in landscape at 1920×1080 and 30 fps if available:

1. Lobby and garage: select each car and change paint, for 20–30 seconds.
2. Alpine Valley: clean driving including corners, a checkpoint, and a successful ramp landing; at least 30 seconds with one uninterrupted 14-second passage.
3. Canopy Run: 15–20 seconds of clear jungle driving.
4. Frostbite Ascent: 15–20 seconds of snowy switchbacks and ascent.
5. Settings steering choice, Start, Pause, Stop, and Continue, for 20–30 seconds.

Keep the game controls visible and use full screen to hide browser chrome. Retain game audio. Turn off in-game music if using the included score. Only feature actions that the supplied recordings actually demonstrate.

## Rebuild the production assets

Use Python 3.11 or later from the repository root. The builder reads the existing game logo at `public/branding/windway-mark.png`; it does not launch a browser or capture gameplay.

```sh
python -m pip install -r docs/trailer/requirements.txt
python scripts/build-trailer-assets.py
```

Outputs go to `docs/trailer/assets` by default. Regeneration replaces the five generated asset files. The builder uses an installed FFmpeg or the executable supplied by `imageio-ffmpeg`. For another output directory, an explicit encoder, and custom fonts:

```sh
python scripts/build-trailer-assets.py --output ./trailer-output --ffmpeg /path/to/ffmpeg --title-font /path/to/title.ttf --body-font /path/to/body.ttf --label-font /path/to/label.ttf --keep-wav
```

The default fonts are Bahnschrift and Segoe UI on Windows, DejaVu Sans on Linux, and Arial on macOS when found. Supply the font options if automatic discovery does not find your installation. Fonts are read from the local system and are not redistributed. Different fonts change the lettering; use the same fonts and dependency versions to reproduce the supplied composition. The music uses a fixed random seed.

The builder exports the six-second video and the 60-second audio, decodes both to check for encoding errors, and writes verification metadata. It intentionally does **not** produce a purported finished gameplay trailer without real recordings.
