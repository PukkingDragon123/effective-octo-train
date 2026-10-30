#!/usr/bin/env python3
"""Finishing steps for the itch.io page art (Pillow + raqm for correct Thai shaping, ffmpeg).

  python3 tools/itch/compose.py cover  RAW.png  OUTDIR  [--title-y=0.06] [--title-w=0.62] [--by=br|bl|under]
      RAW is the 1260x1000 itch-cover render (no text). Writes OUTDIR/cover@2x.png (1260x1000) and
      OUTDIR/cover.png (630x500): the title in plain bone-white Srisakdi, "Pukking Dragon" small.
  python3 tools/itch/compose.py icon   COVER2X.png OUTDIR  --box=x,y,size   (512x512 crop -> icon.png)
  python3 tools/itch/compose.py bg     RAW.png  OUTDIR  [--dark=0.8]      (background.png, 1920x1080, no text)
  python3 tools/itch/compose.py gif    FRAMEDIR OUTDIR  [--fps=15] [--width=960] [--colors=128]
      FRAMEDIR holds f-000.png ... (one seamless loop). Two-pass ffmpeg palette (palettegen/paletteuse).
"""
import os
import subprocess
import sys
import glob

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FONT_DIR = os.path.join(ROOT, 'node_modules', '@fontsource', 'srisakdi', 'files')
BONE = (233, 225, 205)


def font(subset, px, weight=400):
    path = os.path.join(FONT_DIR, f'srisakdi-{subset}-{weight}-normal.woff2')
    return ImageFont.truetype(path, px, layout_engine=ImageFont.Layout.RAQM)


def opts(argv):
    o = {}
    for a in argv:
        if a.startswith('--'):
            k, _, v = a[2:].partition('=')
            o[k] = v or '1'
    return o


def fit_font(subset, text, width, lang=None):
    """largest font size whose ink width is <= width"""
    lo, hi = 8, 600
    while hi - lo > 1:
        mid = (lo + hi) // 2
        b = font(subset, mid).getbbox(text, language=lang)
        if b[2] - b[0] <= width:
            lo = mid
        else:
            hi = mid
    return font(subset, lo)


def cover(raw, outdir, o):
    im = Image.open(raw).convert('RGB')
    if im.size != (1260, 1000):
        im = im.resize((1260, 1000), Image.LANCZOS)
    W, H = im.size
    d = ImageDraw.Draw(im)
    title = 'หลอนยันปลายทาง'
    f = fit_font('thai', title, W * float(o.get('title-w', 0.62)), 'th')
    b = d.textbbox((0, 0), title, font=f, language='th')
    tw, th = b[2] - b[0], b[3] - b[1]
    tx = float(o.get('title-x', 0.5)) * W - tw / 2 - b[0]
    ty = float(o.get('title-y', 0.06)) * H - b[1]
    d.text((tx, ty), title, font=f, fill=BONE, language='th')
    by = 'Pukking Dragon'
    fb = font('latin', round(H * float(o.get('by-size', 0.036))))
    bb = d.textbbox((0, 0), by, font=fb)
    bw = bb[2] - bb[0]
    pos = o.get('by', 'br')
    m = round(W * 0.032)
    if pos == 'under':
        bx, byy = W / 2 - bw / 2 - bb[0], ty + b[3] + H * 0.012
    elif pos == 'bl':
        bx, byy = m - bb[0], H - m - bb[3]
    else:
        bx, byy = W - m - bb[2], H - m - bb[3]
    d.text((bx, byy), by, font=fb, fill=tuple(round(c * 0.86) for c in BONE))
    os.makedirs(outdir, exist_ok=True)
    im.save(os.path.join(outdir, 'cover@2x.png'), optimize=True)
    im.resize((630, 500), Image.LANCZOS).save(os.path.join(outdir, 'cover.png'), optimize=True)
    print('cover', title, f.size, 'px', (round(tx), round(ty)), '->', outdir)


def icon(cover2x, outdir, o):
    im = Image.open(cover2x).convert('RGB')
    x, y, s = (int(v) for v in o['box'].split(','))
    crop = im.crop((x, y, x + s, y + s))
    if s != 512:
        crop = crop.resize((512, 512), Image.LANCZOS)
    crop.save(os.path.join(outdir, 'icon.png'), optimize=True)
    print('icon', (x, y, s), '->', outdir)


def bg(raw, outdir, o):
    im = Image.open(raw).convert('RGB')
    if im.size != (1920, 1080):
        im = im.resize((1920, 1080), Image.LANCZOS)
    im.save(os.path.join(outdir, 'background.png'), optimize=True)
    print('background', im.size, '->', outdir)


def gif(framedir, outdir, o):
    frames = sorted(glob.glob(os.path.join(framedir, 'f-*.png')))
    if not frames:
        sys.exit('no frames in ' + framedir)
    fps = o.get('fps', '15')
    width = o.get('width', '960')
    colors = o.get('colors', '128')
    dither = o.get('dither', 'bayer:bayer_scale=4')
    pattern = os.path.join(framedir, 'f-%03d.png')
    pal = os.path.join(framedir, 'palette.png')
    out = os.path.join(outdir, 'banner.gif')
    scale = f'scale={width}:-1:flags=lanczos'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', fps, '-i', pattern, '-vf',
                    f'{scale},palettegen=max_colors={colors}:stats_mode=full', pal], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', fps, '-i', pattern, '-i', pal, '-lavfi',
                    f'{scale}[x];[x][1:v]paletteuse=dither={dither}:diff_mode=rectangle', '-loop', '0', out], check=True)
    print('gif', len(frames), 'frames', f'{os.path.getsize(out) / 1e6:.2f} MB', '->', out)


if __name__ == '__main__':
    cmd, src, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
    o = opts(sys.argv[4:])
    os.makedirs(outdir, exist_ok=True)
    {'cover': cover, 'icon': icon, 'bg': bg, 'gif': gif}[cmd](src, outdir, o)
