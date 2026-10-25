# WINDWAY reveal trailer

The **60-second reveal trailer** is edited from the user-supplied recording, with the original instrumental score, genuine recorded game audio, titles, and an animated ending. It follows the requested pacing while adapting the shots to what was actually recorded.

Watch [WINDWAY-Reveal-Trailer-60s.mp4](exports/WINDWAY-Reveal-Trailer-60s.mp4). The export is **1920×1080 landscape at 30 fps**. Its [edit timeline](exports/edit-timeline.json) documents every source interval, and [verification report](exports/verification.json) records the finished file's checks and checksum. The editable source plan is [reveal-edit.json](reveal-edit.json).

The [GitHub release](https://github.com/Waqar-743/WindWay/releases/tag/v1.1.1-android-demo.1) also provides the MP4 and **WINDWAY-Trailer-Project.zip**. The ZIP includes the untouched supplied recording, the finished video, the lossless score, source timings, editing script, checksums, and rebuild instructions. The raw recording is a release-project input rather than a Git-tracked source file.

## What the recording shows

The source is `Record-video.mp4`, a 68.78-second, 1914×876 recording of the **playable browser build**, not a recording captured from the Android APK. It contains Canopy Run and Alpine gameplay, the garage, map selection, starting a drive, pausing, returning to the garage, and a results screen. The edit preserves the recorded HUD and fits the wide picture inside the 16:9 export without stretching or cutting off the timer and minimap.

The garage shows the **Mercedes-AMG W14 in Trail orange**. Both car choices and the paint swatches are visible, but the recording does not show switching cars or paint. It also does not contain snowy Frostbite Ascent gameplay, the starter screen, Settings, a steering-option change, or a Continue interaction. Those actions have not been recreated or implied with fabricated footage. The hook uses recorded acceleration sound rather than an unrecorded engine ignition.

The presentation improves framing, color, pacing, typography, and sound; it does not replace the game's recorded interface with a mockup. The source's boxed web HUD remains visible. The Android end card announces the intended platform and does not identify this browser footage as an APK capture.

## Finished edit

| Trailer time | Actual content |
| --- | --- |
| 0–2 s | Close framing of the actual orange car rotating in the garage; fade in from black. |
| 2–5 s | Alpine acceleration, boost ramp, and landing. “YOUR ROAD. YOUR PACE.” |
| 5–13 s | Garage choices and paint swatches, actual map selection, then the same orange car on the road. “MAKE THE DRIVE YOURS.” |
| 13–18.5 s | Alpine Valley mountains, river crossing, and checkpoint. |
| 18.5–29 s | Canopy Run corners, jungle checkpoint, boost ramp, and jade river bridge. |
| 29–43 s | One uninterrupted 14-second drive at normal speed: acceleration, ramp landing, checkpoint, river bridge, and cornering. The original HUD stays visible. |
| 43–51 s | Actual pause menu, return to garage, map/start button, and return to the road. “START. EXPLORE.” |
| 51–54 s | Short Canopy and Alpine gameplay montage. |
| 54–60 s | Animated ending: WINDWAY / Your road. Your pace. / COMING SOON TO ANDROID. |

The continuous sequence uses source **41.4–55.4 seconds**, with no internal cuts or speed changes. It begins after the large initial start-gate beam passes the camera; the shorter later checkpoint-beam passes remain part of the authentic driving sequence. Music runs once across the complete edit; the ending clip's embedded music is excluded to avoid doubling the score. Recorded engine and driving sounds are mixed underneath the music, with short audio fades at cuts.

## Rebuild the complete trailer

Use Python 3.11 or later from the repository root. Keep the original recording at `Record-video.mp4`, or supply its location with `--source`. The recording is a local input and is not required to be redistributed with the editing scripts.

```sh
python -m pip install -r docs/trailer/requirements.txt
python scripts/build-reveal-trailer.py --source Record-video.mp4
```

The builder reads the timing and crops from `docs/trailer/reveal-edit.json` and the prepared music/ending from `docs/trailer/assets`. It writes the MP4, copied edit timeline, and verification report to `docs/trailer/exports`; intermediate files go to `.tooling/trailer/edit/render`. It leaves the input recording untouched.

An installed FFmpeg or the executable supplied by `imageio-ffmpeg` is used automatically. Optional paths allow another output folder, a lossless score master, a custom font, or an explicit encoder:

```sh
python scripts/build-reveal-trailer.py --source /path/to/Record-video.mp4 --output /path/to/trailer-output --work /path/to/render-cache --score /path/to/windway-original-score-60s.wav --font /path/to/title.ttf --ffmpeg /path/to/ffmpeg
```

The title font defaults to Bahnschrift on Windows or DejaVu Sans Bold on Linux when available. Use `--font` if neither font is installed. Fonts are read from the system and are not redistributed. Use the same fonts and dependency versions to reproduce the supplied lettering.

The builder decodes the complete export, requires **1,800 video frames**, measures audio loudness, and writes SHA-256 checksums. A completed `exports/verification.json` is the verification record for the full trailer.

The verified export measures **−16.7 LUFS integrated** and **−2.1 dBFS true peak**. Independent frame checks cover the opening, titles, map labels, menus, HUD, continuous drive, and ending. Original mouse-pointer appearances and brief checkpoint-beam passes within the supplied gameplay remain authentic to the recording.

## Reusable production assets

| File | Purpose |
| --- | --- |
| [windway-ending-preview-6s.mp4](assets/windway-ending-preview-6s.mp4) | Standalone 1920×1080, 30 fps animated ending, including the final six seconds of the score. |
| [windway-end-card.png](assets/windway-end-card.png) | Full-resolution ending poster. |
| [windway-original-score-60s.m4a](assets/windway-original-score-60s.m4a) | Original synthesized 60-second instrumental, 48 kHz stereo; no third-party music samples. |
| [edit-timeline.json](assets/edit-timeline.json) | Original target storyboard prepared before the recording was supplied; this is not the final source-based edit. |
| [verification.json](assets/verification.json) | Checks for the reusable ending and score only. Its historical incomplete-trailer status does not describe the finished export. |

Regenerate these assets with:

```sh
python scripts/build-trailer-assets.py
```

This separate builder reads `public/branding/windway-mark.png` and writes the five generated files in `docs/trailer/assets`. It does not capture gameplay or build the full reveal. The lossless WAV is omitted from the reusable asset folder to keep downloads small; add `--keep-wav` to regenerate it. Custom output, FFmpeg, and font paths are supported:

```sh
python scripts/build-trailer-assets.py --output ./trailer-assets --ffmpeg /path/to/ffmpeg --title-font /path/to/title.ttf --body-font /path/to/body.ttf --label-font /path/to/label.ttf --keep-wav
```

The production-asset font defaults are Bahnschrift and Segoe UI on Windows, DejaVu Sans on Linux, and Arial on macOS when found. The music uses a fixed random seed.

## Original creative brief and optional expanded cut

The original target was an adventurous, confident reveal for WINDWAY on Android: authentic cars, three environments, a starter screen, car and paint selection, compact transparent controls, a continuous driving demonstration, Settings, Pause, Stop, and Continue. It called for the same 60-second 1080p/30 fps format, clean typography, readable brief text, synchronized engine/tire/wind/interface sound, and no fabricated gameplay, performance claims, editor watermarks, or placeholders.

The requested target timing was 0–5 seconds for the hook; 5–13 for starter/garage customization; 13–29 for Alpine, Canopy, and Frostbite gameplay; 29–43 for continuous driving; 43–51 for Settings and returning to a drive; 51–54 for a three-map montage; and 54–60 for the ending. The finished edit above adapts the unavailable shots while retaining the timing and genuine recorded gameplay.

For a future cut that demonstrates every original interaction, add native APK recordings of the starter screen, both car selections, a paint change, Frostbite Ascent driving, Settings/steering, and Stop/Continue. Record landscape gameplay with the desired mobile HUD and game audio. These are optional additions to the completed source-based trailer, not footage required to play the existing export.
