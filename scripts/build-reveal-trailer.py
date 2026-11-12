#!/usr/bin/env python3
"""Edit the supplied WINDWAY recording into the documented 60-second reveal.

Uses authentic source shots at normal speed. Requires Pillow, NumPy and FFmpeg.
The source stays untouched; all crops and source timings are in reveal-edit.json.
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import wave

ROOT = Path(__file__).resolve().parents[1]


def encoder_path(explicit):
    if explicit:
        found = shutil.which(explicit)
        if found:
            return found
        raise FileNotFoundError(explicit)
    found = shutil.which('ffmpeg')
    if found:
        return found
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def run(command):
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-6000:])
    return result


def digest(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def read_wav(path):
    import numpy as np
    with wave.open(str(path), 'rb') as handle:
        if (handle.getframerate(), handle.getnchannels(), handle.getsampwidth()) != (48000, 2, 2):
            raise ValueError(f'Expected 48 kHz stereo PCM16: {path}')
        return np.frombuffer(handle.readframes(handle.getnframes()), dtype='<i2').reshape(-1, 2).astype(np.float32) / 32768


def write_wav(path, samples):
    import numpy as np
    with wave.open(str(path), 'wb') as handle:
        handle.setnchannels(2)
        handle.setsampwidth(2)
        handle.setframerate(48000)
        handle.writeframes(np.round(np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes())


def title_image(path, shot, font_path):
    from PIL import Image, ImageDraw, ImageFont
    image = Image.new('RGBA', (1920, 1080))
    draw = ImageDraw.Draw(image)
    text = shot['title']
    if shot.get('eyebrow'):
        small = ImageFont.truetype(str(font_path), 18)
        large = ImageFont.truetype(str(font_path), 48)
        draw.line((92, 997, 136, 997), fill=(234, 161, 112), width=3)
        draw.text((152, 981), shot['eyebrow'], font=small, fill=(182, 202, 185))
        draw.text((88, 1006), text, font=large, fill=(244, 242, 230))
    else:
        font = ImageFont.truetype(str(font_path), 52)
        length = draw.textlength(text, font=font)
        draw.text(((1920 - length) / 2, 999), text, font=font, fill=(244, 242, 230))
    image.save(path)


def main():
    import numpy as np
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'Record-video.mp4')
    parser.add_argument('--plan', type=Path, default=ROOT / 'docs/trailer/reveal-edit.json')
    parser.add_argument('--assets', type=Path, default=ROOT / 'docs/trailer/assets')
    parser.add_argument('--output', type=Path, default=ROOT / 'docs/trailer/exports')
    parser.add_argument('--work', type=Path, default=ROOT / '.tooling/trailer/edit/render')
    parser.add_argument('--score', type=Path, help='Optional lossless 60-second score WAV.')
    parser.add_argument('--ffmpeg')
    parser.add_argument('--font', type=Path, help='Title font; defaults to Bahnschrift or DejaVu Sans Bold.')
    parser.add_argument('--only-shot', action='append', help='Re-render this shot ID, reuse other existing segments, then rebuild the final export. Repeat for multiple shots.')
    args = parser.parse_args()
    ffmpeg = encoder_path(args.ffmpeg)
    source = args.source.resolve()
    output = args.output.resolve()
    work = args.work.resolve()
    output.mkdir(parents=True, exist_ok=True)
    work.mkdir(parents=True, exist_ok=True)
    if not source.is_file():
        raise FileNotFoundError(source)
    plan = json.loads(args.plan.read_text(encoding='utf-8'))
    source_hash = digest(source)
    if plan.get('source_sha256') and source_hash != plan['source_sha256']:
        raise ValueError('Source recording differs from the edit plan. Update shot timings, crops and source_sha256 for the new recording.')
    assert (plan['width'], plan['height'], plan['fps'], plan['duration']) == (1920, 1080, 30, 60)
    next_at = 0
    for shot in plan['shots']:
        assert shot['at'] == next_at, f'Timeline gap at {shot["id"]}'
        next_at += shot['duration']
    assert next_at == 60
    if args.only_shot:
        unknown = set(args.only_shot) - {s['id'] for s in plan['shots']}
        if unknown:
            raise ValueError(f'Unknown shot IDs: {unknown}')
    font = args.font or next((p for p in [Path('C:/Windows/Fonts/bahnschrift.ttf'),
        Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')] if p.is_file()), None)
    if font is None:
        raise FileNotFoundError('Supply --font /path/to/font.ttf')
    ffbase = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-threads', '1']
    video_encoding = ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
                      '-crf', '18', '-threads', '1', '-refs', '1', '-bf', '0',
                      '-pix_fmt', 'yuv420p', '-video_track_timescale', '15360']
    segments = []
    for shot in plan['shots']:
        destination = work / f'{shot["id"]}.mp4'
        segments.append(destination)
        if args.only_shot and shot['id'] not in args.only_shot:
            if not destination.is_file():
                raise FileNotFoundError(f'Render all shots first; missing {destination}')
            print(f'Reusing: {shot["id"]}', flush=True)
            continue
        if 'asset' in shot:
            run(ffbase + ['-i', str(args.assets / shot['asset']), '-map', '0:v:0', '-an',
                          '-frames:v', str(round(shot['duration'] * 30))] + video_encoding + [str(destination)])
            print(f'Ready: {shot["id"]}', flush=True)
            continue
        command = ffbase + ['-ss', str(shot['source_in']), '-i', str(source)]
        filters = ['fps=30']
        if shot.get('crop'):
            x, y, w, h = shot['crop']
            filters.append(f'crop={w}:{h}:{x}:{y}')
        filters += ['scale=1920:880:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos',
                    'setsar=1', 'eq=saturation=1.045:contrast=1.018:brightness=-0.004',
                    'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x07110F']
        if shot.get('title'):
            card = work / f'{shot["id"]}-title.png'
            title_image(card, shot, font)
            command += ['-loop', '1', '-framerate', '30', '-threads', '1', '-i', str(card)]
            title_end = min(shot.get('title_seconds', shot['duration']), shot['duration'])
            graph = ('[0:v]' + ','.join(filters) + '[base];'
                     '[1:v]format=rgba,fade=t=in:st=0.15:d=0.25:alpha=1,'
                     f'fade=t=out:st={title_end - .35}:d=0.25:alpha=1[title];'
                     '[base][title]overlay=0:0:shortest=1')
        else:
            graph = '[0:v]' + ','.join(filters)
        if shot.get('fade_in'):
            graph += f',fade=t=in:d={shot["fade_in"]}'
        if shot.get('fade_out'):
            graph += f',fade=t=out:st={shot["duration"] - shot["fade_out"]}:d={shot["fade_out"]}'
        graph += '[video]'
        command += ['-filter_complex_threads', '1', '-filter_complex', graph, '-map', '[video]', '-an',
                    '-frames:v', str(round(shot['duration'] * 30))] + video_encoding + [
                    '-movflags', '+faststart', str(destination)]
        run(command)
        print(f'Ready: {shot["id"]} ({shot["duration"]} seconds)', flush=True)

    run(ffbase + ['-i', str(source), '-vn', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', str(work / 'source.wav')])
    score_path = args.score or args.assets / 'windway-original-score-60s.m4a'
    run(ffbase + ['-i', str(score_path), '-vn', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', str(work / 'score.wav')])
    source_audio = read_wav(work / 'source.wav')
    score_audio = read_wav(work / 'score.wav')
    samples = 60 * 48000
    if len(score_audio) < samples:
        raise ValueError('The supplied score is shorter than 60 seconds')
    mix = score_audio[:samples].copy() * .65
    for shot in plan['shots']:
        gain = shot.get('audio_gain', 0)
        if not gain:
            continue
        start = round(shot['source_in'] * 48000)
        count = round(shot['duration'] * 48000)
        audio = source_audio[start:start + count].copy()
        if len(audio) != count:
            raise ValueError(f'Source audio too short at {shot["id"]}')
        fade = 960
        audio[:fade] *= np.linspace(0, 1, fade, dtype=np.float32)[:, None]
        audio[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)[:, None]
        at = round(shot['at'] * 48000)
        mix[at:at + count] += audio * gain
    peak = float(np.max(np.abs(mix)))
    if peak > .97:
        mix *= .97 / peak
    write_wav(work / 'trailer-premix.wav', mix)
    run(ffbase + ['-i', str(work / 'trailer-premix.wav'), '-af',
        'volume=1.25,highpass=f=30,alimiter=limit=0.891:level=0:latency=1,afade=t=in:d=0.18,afade=t=out:st=58.8:d=1.2',
        '-c:a', 'pcm_s16le', str(work / 'trailer-mix.wav')])
    concat = work / 'segments.txt'
    concat.write_text('\n'.join("file '" + str(p).replace('\\', '/').replace("'", "'\\''") + "'" for p in segments) + '\n', encoding='utf-8')
    final = output / 'WINDWAY-Reveal-Trailer-60s.mp4'
    run(ffbase + ['-f', 'concat', '-safe', '0', '-i', str(concat), '-i', str(work / 'trailer-mix.wav'),
        '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
        '-ar', '48000', '-ac', '2', '-t', '60', '-movflags', '+faststart', str(final)])
    print('Export complete. Checking the entire video...', flush=True)
    checked = run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-threads', '2', '-i', str(final),
                   '-map', '0:v:0', '-map', '0:a:0', '-progress', 'pipe:1', '-f', 'null', '-'])
    frames = re.findall(r'^frame=(\d+)', checked.stdout, re.M)
    assert frames and int(frames[-1]) == 1800, checked.stdout[-1000:]
    assert not checked.stderr.strip(), checked.stderr
    levels = run([ffmpeg, '-hide_banner', '-i', str(final), '-af', 'ebur128=peak=true', '-vn', '-f', 'null', '-'])
    metadata = levels.stderr.split('Stream mapping:')[0]
    assert re.search(r'Video: h264[^\n]*yuv420p[^\n]*1920x1080[^\n]*30 fps', metadata), metadata
    assert re.search(r'Audio: aac[^\n]*48000 Hz, stereo', metadata), metadata
    assert 'Duration: 00:01:00.00' in metadata, metadata
    summary = re.split(r'\n(?:\[out#|size=)', levels.stderr[levels.stderr.rfind('Summary:'):])[0].strip()
    shutil.copy2(args.plan, output / 'edit-timeline.json')
    continuous = next(s for s in plan['shots'] if s['id'] == '10-continuous-drive')
    verified = {
        'full_trailer_complete': True,
        'storyboard': 'Adapted to authentic footage available; see edit-timeline.json for exact omissions.',
        'video': {'file': final.name, 'width': 1920, 'height': 1080, 'fps': 30, 'frames': 1800,
                  'duration_seconds': 60, 'codec': 'H.264', 'pixel_format': 'yuv420p', 'full_decode': 'passed'},
        'audio': {'codec': 'AAC', 'sample_rate': 48000, 'channels': 2, 'score_gain': .65, 'output_gain': 1.25,
                  'gameplay_speed': 1, 'end_card_score_duplicated': False, 'loudness': summary},
        'continuous_drive': {'output_in': continuous['at'], 'output_out': continuous['at'] + continuous['duration'],
                             'source_in': continuous['source_in'], 'source_out': continuous['source_in'] + continuous['duration'],
                             'speed': 1, 'internal_cuts': 0},
        'source': {'file': source.name, 'bytes': source.stat().st_size, 'sha256': source_hash, 'modified': False},
        'export': {'bytes': final.stat().st_size, 'sha256': digest(final)},
        'adaptations': plan['adaptations']
    }
    (output / 'verification.json').write_text(json.dumps(verified, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'file': str(final), 'bytes': final.stat().st_size, 'frames': 1800, 'seconds': 60,
                      'loudness': summary}, indent=2), flush=True)


if __name__ == '__main__':
    try:
        main()
    except (ImportError, FileNotFoundError, RuntimeError, ValueError, AssertionError) as error:
        print(f'Trailer export failed: {error}', file=sys.stderr)
        raise SystemExit(1)
