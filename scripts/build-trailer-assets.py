#!/usr/bin/env python3
"""Regenerate WINDWAY's score and animated ending; gameplay footage is not created.

Install docs/trailer/requirements.txt first. Run --help for portable font/output options.
The deterministic score uses no third-party recordings. End-card fonts are system assets.
"""

import argparse
import json
import math
from pathlib import Path
import shutil
import subprocess
import tempfile
import wave

ROOT = Path(__file__).resolve().parents[1]


def resolve_font(explicit, role):
    if explicit:
        candidate = Path(explicit).expanduser().resolve()
        if not candidate.is_file():
            raise FileNotFoundError(f"The {role} font does not exist: {candidate}")
        return candidate
    candidates = {
        'title': ['C:/Windows/Fonts/bahnschrift.ttf',
                  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
                  '/System/Library/Fonts/Supplemental/Arial Bold.ttf'],
        'body': ['C:/Windows/Fonts/segoeui.ttf',
                 '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
                 '/System/Library/Fonts/Supplemental/Arial.ttf'],
        'label': ['C:/Windows/Fonts/seguisb.ttf',
                  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
                  '/System/Library/Fonts/Supplemental/Arial Bold.ttf'],
    }[role]
    for name in candidates:
        if Path(name).is_file():
            return Path(name)
    raise FileNotFoundError(f"No suitable {role} font found. Supply --{role}-font /path/to/font.ttf.")


def resolve_encoder(explicit):
    if explicit:
        executable = shutil.which(explicit)
        if executable:
            return executable
        raise FileNotFoundError(f"FFmpeg was not found: {explicit}")
    executable = shutil.which('ffmpeg')
    if executable:
        return executable
    try:
        import imageio_ffmpeg
    except ImportError as error:
        raise RuntimeError('Install docs/trailer/requirements.txt or supply --ffmpeg.') from error
    return imageio_ffmpeg.get_ffmpeg_exe()


def build_assets(args, scratch):
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont

    OUT = args.output.expanduser().resolve()
    OUT.mkdir(parents=True, exist_ok=True)
    WAV = Path(scratch) / 'windway-original-score-60s.wav'
    encoder = resolve_encoder(args.ffmpeg)
    fonts = {role: resolve_font(getattr(args, f'{role}_font'), role)
             for role in ('title', 'body', 'label')}
    SR = 48000
    LENGTH = 60
    FPS = 30
    W, H = 1920, 1080
    rng = np.random.default_rng(743)
    mix = np.zeros(SR * LENGTH, dtype=np.float64)

    def add(signal, start, gain=1):
        index = round(start * SR)
        if index < 0 or index >= len(mix):
            return
        count = min(len(signal), len(mix) - index)
        mix[index:index+count] += signal[:count] * gain

    def note(midi, seconds, kind='pluck'):
        t = np.arange(round(seconds * SR)) / SR
        freq = 440 * 2 ** ((midi - 69) / 12)
        if kind == 'pad':
            sig = (np.sin(2*np.pi*freq*t) + .27*np.sin(2*np.pi*freq*1.003*t)
                   + .12*np.sin(4*np.pi*freq*t)) / 1.39
            env = np.minimum(1, t/.28) * np.minimum(1, (seconds-t)/.5)
        elif kind == 'bass':
            sig = np.sin(2*np.pi*freq*t) + .22*np.sin(4*np.pi*freq*t)
            env = np.minimum(1, t/.014) * np.exp(-t*2.3) * np.minimum(1, (seconds-t)/.08)
        else:
            sig = np.sin(2*np.pi*freq*t) + .28*np.sin(4*np.pi*freq*t)*np.exp(-t*7)
            sig += .12*np.sin(6*np.pi*freq*t)*np.exp(-t*12)
            env = np.minimum(1, t/.008) * np.exp(-t*4.5) * np.minimum(1, (seconds-t)/.05)
        return sig * np.maximum(0, env)

    def kick():
        t = np.arange(round(.48*SR))/SR
        phase = 2*np.pi*(47*t + (113/35)*(1-np.exp(-35*t)))
        return np.sin(phase)*np.exp(-t*10) + rng.normal(0,.05,len(t))*np.exp(-t*140)

    def snare():
        t = np.arange(round(.28*SR))/SR
        noise = rng.normal(0,1,len(t))
        bright = noise - np.concatenate(([0],noise[:-1]))*.65
        return bright*np.exp(-t*22)*.35 + np.sin(2*np.pi*180*t)*np.exp(-t*35)*.22

    def hat():
        t = np.arange(round(.085*SR))/SR
        noise = rng.normal(0,1,len(t))
        return (noise-np.concatenate(([0],noise[:-1])))*np.exp(-t*65)*.1

    chords = [(50,57,62,65), (46,53,58,62), (41,48,57,60), (48,55,60,64)]
    melody = [0,7,12,7,3,10,15,10,5,12,17,12,3,10,7,3]
    for bar in range(28):
        start = bar*2
        chord = chords[(bar//2)%4]
        intensity = .45 if start<8 else .7 if start<16 else 1 if start<44 else .4 if start<50 else 1.05
        for pitch in chord:
            add(note(pitch+12, 2.4, 'pad'), start, .035*intensity)
        if start >= 4:
            for beat in range(4):
                add(note(chord[0]-12, .42, 'bass'), start+beat*.5, .13*intensity)
        if start>=8 and not 44<=start<48:
            for beat in (0,2): add(kick(), start+beat*.5, .35*intensity)
            for beat in (1,3): add(snare(), start+beat*.5, .2*intensity)
            for tick in range(8): add(hat(), start+tick*.25, .32*intensity)
        for tick in range(8 if start>=16 and start<44 else 4):
            step = .25 if start>=16 and start<44 else .5
            pitch = 62+melody[(bar*4+tick)%len(melody)]
            add(note(pitch, .75), start+tick*step, .047*intensity)

    for when in (12.5, 27.5, 42.5, 50.5):
        seconds=1.5
        t=np.arange(round(seconds*SR))/SR
        noise=rng.normal(0,1,len(t))
        noise=np.convolve(noise,np.ones(9)/9,mode='same')
        add(noise * np.sin(np.pi*t/seconds)**2, when, .095)
    for pitch in (50,57,62,65,69):
        add(note(pitch, 3.9, 'pad'),56,.055)
    for i,pitch in enumerate((74,77,81,86)):
        add(note(pitch,2.3),56+i*.18,.055)

    time=np.arange(len(mix))/SR
    mix *= np.minimum(1,time/1.4) * np.minimum(1,(LENGTH-time)/1.6)
    mix=np.tanh(mix*1.1)
    delay=round(.092*SR)
    echo=np.zeros_like(mix)
    echo[delay:]=mix[:-delay]*.14
    stereo=np.column_stack((mix+echo, mix-echo*.45))
    stereo *= .88/max(float(np.max(np.abs(stereo))),.001)
    pcm=np.round(np.clip(stereo,-1,1)*32767).astype('<i2')
    with wave.open(str(WAV),'wb') as wav:
        wav.setnchannels(2); wav.setsampwidth(2); wav.setframerate(SR); wav.writeframes(pcm.tobytes())

    title_font=ImageFont.truetype(str(fonts['title']),228)
    tag_font=ImageFont.truetype(str(fonts['body']),54)
    small_font=ImageFont.truetype(str(fonts['label']),31)
    label_font=ImageFont.truetype(str(fonts['label']),24)
    logo=Image.open(ROOT/'public/branding/windway-mark.png').convert('RGBA')
    logo.thumbnail((156,156),Image.Resampling.LANCZOS)

    def centered(layer,text,font,y,color,tracking=0):
        draw=ImageDraw.Draw(layer)
        width=sum(draw.textlength(c,font=font) for c in text)+max(0,len(text)-1)*tracking
        x=(W-width)/2
        for char in text:
            draw.text((round(x),y),char,font=font,fill=color,stroke_width=0)
            x+=draw.textlength(char,font=font)+tracking

    def smooth(value):
        x=max(0,min(1,value))
        return x*x*(3-2*x)

    yy,xx=np.mgrid[0:H,0:W]
    radius=np.sqrt(((xx-W*.5)/W)**2+((yy-H*.45)/H)**2)
    base=np.zeros((H,W,3),dtype=np.uint8)
    base[:,:,0]=np.clip(10+8*(1-radius),0,255)
    base[:,:,1]=np.clip(22+14*(1-radius),0,255)
    base[:,:,2]=np.clip(20+11*(1-radius),0,255)
    background=Image.fromarray(base,'RGB').convert('RGBA')
    del xx,yy,radius,base
    lettering=Image.new('RGBA',(W,H))
    lettering.alpha_composite(logo,((W-logo.width)//2,168))
    centered(lettering,'WINDWAY',title_font,340,(244,242,230,255),12)
    centered(lettering,'Your road. Your pace.',tag_font,600,(205,216,203,255),1)
    centered(lettering,'COMING SOON TO ANDROID',small_font,775,(234,161,112,255),6)
    centered(lettering,'A GAME BY WAQAR AHMED',label_font,960,(129,153,139,255),3)

    def frame(t):
        image=background.copy()
        lines=Image.new('RGBA',(W,H)); draw=ImageDraw.Draw(lines)
        for lane in range(15):
            pts=[]
            for x in range(-100,W+100,12):
                y=805+lane*24+70*math.sin(x/420+lane*.05+t*.05)
                pts.append((x,y))
            draw.line(pts,fill=(108,150,119,18),width=1)
        image=Image.alpha_composite(image,lines)
        content=Image.new('RGBA',(W,H))
        reveal=smooth(t/.9); shift=round((1-reveal)*30)
        content.alpha_composite(lettering,(0,shift))
        draw=ImageDraw.Draw(content)
        line_width=round(330*smooth((t-.45)/.9))
        draw.line(((W-line_width)//2,722,(W+line_width)//2,722),fill=(234,161,112,255),width=2)
        alpha=content.getchannel('A').point(lambda a: round(a*reveal))
        content.putalpha(alpha)
        image=Image.alpha_composite(image,content).convert('RGB')
        fade=smooth((6-t)/.5)
        if fade<1: image=Image.blend(Image.new('RGB',(W,H)),image,fade)
        return image

    frame(3).save(OUT/'windway-end-card.png')
    command=[encoder,'-y','-hide_banner','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-',
             '-ss','54','-i',str(WAV),'-t','6','-c:v','libx264','-preset','fast','-crf','18',
             '-threads','2','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',str(OUT/'windway-ending-preview-6s.mp4')]
    with subprocess.Popen(command,stdin=subprocess.PIPE) as process:
        for index in range(6*FPS): process.stdin.write(frame(index/FPS).tobytes())
        process.stdin.close()
        if process.wait()!=0: raise RuntimeError('End-card export failed')

    timeline=[
        {'in':0,'out':5,'footage':'Garage close-up, then Alpine acceleration','text':'YOUR ROAD. YOUR PACE.'},
        {'in':5,'out':13,'footage':'Actual lobby, both garage cars, paint change; matching car on road','text':'MAKE THE DRIVE YOURS.'},
        {'in':13,'out':18.5,'footage':'Alpine corners, river crossing and ramp','text':'ALPINE VALLEY'},
        {'in':18.5,'out':24,'footage':'Canopy Run jungle circuit','text':'CANOPY RUN'},
        {'in':24,'out':29,'footage':'Frostbite Ascent switchbacks and snow climb','text':'FROSTBITE ASCENT'},
        {'in':29,'out':43,'footage':'One continuous actual drive: acceleration, corner, checkpoint, successful landing','text':None},
        {'in':43,'out':51,'footage':'Settings steering choice, Start, Pause, Stop, Continue','text':'START. EXPLORE. PICK UP WHERE YOU LEFT OFF.'},
        {'in':51,'out':54,'footage':'Three strongest authentic driving moments','text':None},
        {'in':54,'out':60,'footage':'Completed animated end card','text':'WINDWAY / Your road. Your pace. / COMING SOON TO ANDROID'},
    ]
    (OUT/'edit-timeline.json').write_text(json.dumps({'status':'Awaiting genuine gameplay recordings; full trailer not rendered','width':W,'height':H,'fps':FPS,'duration':LENGTH,'scenes':timeline},indent=2),encoding='utf-8')

    subprocess.run([encoder, '-y', '-hide_banner', '-loglevel', 'error', '-i', str(WAV),
                    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
                    str(OUT/'windway-original-score-60s.m4a')], check=True)
    for media in ('windway-ending-preview-6s.mp4', 'windway-original-score-60s.m4a'):
        subprocess.run([encoder, '-hide_banner', '-loglevel', 'error', '-i', str(OUT/media),
                        '-f', 'null', '-'], check=True)
    verification = {
        'ending_video': {'resolution': f'{W}x{H}', 'fps': FPS, 'seconds': 6, 'full_decode': 'passed'},
        'original_score': {'seconds': LENGTH, 'sample_rate': SR, 'channels': 2, 'full_decode': 'passed'},
        'timeline': {'seconds': LENGTH, 'contiguous': True},
        'full_trailer_complete': False,
        'missing': 'Genuine gameplay recordings',
    }
    (OUT/'verification.json').write_text(json.dumps(verification, indent=2) + '\n', encoding='utf-8')
    if args.keep_wav:
        shutil.copy2(WAV, OUT/'windway-original-score-60s.wav')
    print(json.dumps({'output': str(OUT), 'score_seconds': LENGTH, 'ending_seconds': 6,
                      'full_trailer_complete': False}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--output', type=Path, default=ROOT/'docs'/'trailer'/'assets',
                        help='Output folder (default: docs/trailer/assets in this repository).')
    parser.add_argument('--ffmpeg', help='FFmpeg executable path or command; otherwise auto-detected.')
    parser.add_argument('--title-font', help='Title TrueType/OpenType font path.')
    parser.add_argument('--body-font', help='Tagline TrueType/OpenType font path.')
    parser.add_argument('--label-font', help='Small-label TrueType/OpenType font path.')
    parser.add_argument('--keep-wav', action='store_true', help='Also retain the 11 MiB lossless WAV score.')
    args = parser.parse_args()
    try:
        with tempfile.TemporaryDirectory(prefix='windway-trailer-') as scratch:
            build_assets(args, scratch)
    except (ImportError, FileNotFoundError, RuntimeError, subprocess.CalledProcessError) as error:
        parser.exit(1, f'Trailer assets could not be built: {error}\n')


if __name__ == '__main__':
    main()
