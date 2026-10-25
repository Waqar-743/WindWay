# Homepage drive preview

A 6.333-second, 152-frame loop edited from the supplied `Record-video.mp4`. The original recording remains untouched. The close garage view dissolves into real Alpine driving, then returns to the close view without a black frame. All shots run at normal speed; the lap, map, and speed panels are excluded by framing. The small original gameplay pointer remains part of the recording.

| Asset | Dimensions | Size |
| --- | --- | --- |
| `f1-drive.mp4` | 960 × 540 | 491,746 bytes |
| `f1-drive-mobile.mp4` | 640 × 360 | 265,271 bytes |
| `f1-drive-poster.webp` | 960 × 540 | 29,798 bytes |

Both MP4s use H.264 High / yuv420p, 24 fps, no audio, and fast start (`moov` before `mdat`). Both were fully decoded successfully: 152 frames, no dropped or duplicated frames. Desktop and mobile frames plus the poster were visually inspected. The MP4 variants keep total transfer small without a second video codec or extra requests.

## Source edit

- Garage: source 28.000–30.000 s, cropped `704:396:390:372`.
- Acceleration: source 41.400–44.067 s, cropped `1280:720:192:78`.
- Driving away: source 45.100–47.767 s, same driving crop. The intervening checkpoint beam obstruction is omitted.
- Each dissolve lasts 1/3 s. A short repeat of the opening shot and removal of the first 1/3 s create the looping boundary.
- Poster: source 28.333 s, matching the first visible shot.

## Reproduce

From the repository root, run the following Python with FFmpeg 7+ available in PATH (or at the existing local tooling path). It uses only the Python standard library. Save the code temporarily or paste it into a Python shell. Sizes can vary between encoder versions.

```python
from pathlib import Path
import subprocess, shutil
root=Path.cwd(); ffmpeg=shutil.which('ffmpeg') or root/'.tooling/trailer-deps/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'; out=root/'public/media'; raw=root/'Record-video.mp4'
inputs=[]
for start,duration in [('28','2'),('41.4','2.666667'),('45.1','2.666667'),('28','0.375')]: inputs+=['-threads','1','-ss',start,'-t',duration,'-i',str(raw)]
for name,w,h,crf,rate,buffer in [('f1-drive.mp4',960,540,28,'900k','1800k'),('f1-drive-mobile.mp4',640,360,29,'420k','840k')]:
 branches=[]
 for i,letter in enumerate('abcd'):
  crop='704:396:390:372' if i in [0,3] else '1280:720:192:78'
  branches.append(f'[{i}:v]crop={crop},scale={w}:{h}:flags=lanczos,setsar=1,settb=AVTB,setpts=PTS-STARTPTS,fps=24[{letter}]')
 graph=';'.join(branches)+';[a][b]xfade=transition=fade:duration=0.333333:offset=1.666667,fps=24[ab];[ab][c]xfade=transition=fade:duration=0.333333:offset=4,fps=24[abc];[abc][d]xfade=transition=fade:duration=0.333333:offset=6.333333,trim=start=0.333333:duration=6.333334,setpts=PTS-STARTPTS,format=yuv420p[v]'
 command=[str(ffmpeg),'-hide_banner','-loglevel','error','-y']+inputs+['-filter_complex_threads','1','-filter_complex',graph,'-map','[v]','-an','-c:v','libx264','-threads','2','-preset','slow','-crf',str(crf),'-maxrate',rate,'-bufsize',buffer,'-pix_fmt','yuv420p','-profile:v','high','-level:v','3.1','-r','24','-frames:v','152','-g','48','-keyint_min','48','-sc_threshold','0','-movflags','+faststart',str(out/name)]
 print('Encoding',name,flush=True);subprocess.run(command,check=True);print(name,(out/name).stat().st_size,flush=True)
subprocess.run([str(ffmpeg),'-hide_banner','-loglevel','error','-y','-threads','1','-ss','28.333333','-i',str(raw),'-vf','crop=704:396:390:372,scale=960:540:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','84',str(out/'f1-drive-poster.webp')],check=True)
print('poster',(out/'f1-drive-poster.webp').stat().st_size,flush=True)
```
