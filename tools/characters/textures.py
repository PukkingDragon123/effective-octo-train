#!/usr/bin/env python3
# Character textures for the runtime MakeHuman pack (run after build_mh.py; needs Pillow):
#   python3 tools/characters/textures.py [--src <MPFB user data dir>] [--out public/assets/characters/mh/tex]
#
#   skin_<young|middle|old>_<m|f>.jpg  MakeHuman CC0 photo-based Asian skins (2048², the shader tints them
#                                      to each character's Thai skin tone and adds pores / pallor / veins)
#   hair_<style>.webp                  hair-card textures, luminance-normalised grey + alpha (tinted at runtime)
#   parts.webp                         1024² atlas: eyebrows (grey + alpha), eyelashes, teeth, tongue
#   eye.jpg                            iris / sclera
#   manifest.json                      atlas rectangles (uv space, v up) for the parts
import os, sys, json, argparse
from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
ap = argparse.ArgumentParser()
ap.add_argument('--src', default=os.environ.get('MH_USER_DATA', ''))
ap.add_argument('--out', default=os.path.join(REPO, 'public/assets/characters/mh/tex'))
ap.add_argument('--jobs', default=os.path.join(HERE, '.texjobs.json'))
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
jobs = json.load(open(a.jobs))
src = a.src or os.path.dirname(os.path.dirname(jobs['eye']))  # .../data
if os.path.basename(src) == 'eyes':
    src = os.path.dirname(src)

SKINS = {
    'young_m': 'young_asian_male', 'young_f': 'young_asian_female',
    'middle_m': 'middleage_asian_male', 'middle_f': 'middleage_asian_female',
    'old_m': 'old_asian_male', 'old_f': 'old_asian_female',
}


def skin_file(name):
    d = os.path.join(src, 'skins', name)
    for f in os.listdir(d):
        if f.endswith('.png') or f.endswith('.jpg'):
            if 'thumb' not in f:
                return os.path.join(d, f)
    raise FileNotFoundError(d)


def grey_alpha(im, size):
    """luminance normalised to mid grey on the opaque texels, alpha kept."""
    im = im.convert('RGBA').resize((size, size), Image.LANCZOS)
    r, g, b, al = im.split()
    lum = Image.merge('RGB', (r, g, b)).convert('L')
    # mean luminance where alpha > 50 %
    lp, ap_ = lum.load(), al.load()
    s = n = 0
    for y in range(0, size, 4):
        for x in range(0, size, 4):
            if ap_[x, y] > 128:
                s += lp[x, y]
                n += 1
    mean = (s / n) if n else 128
    k = 150.0 / max(mean, 8)
    lum = lum.point(lambda v: max(0, min(255, int(v * k))))
    return Image.merge('RGBA', (lum, lum, lum, al))


manifest = {'skins': {}, 'hair': {}, 'parts': {}, 'eye': 'eye.jpg', 'partsFile': 'parts.webp'}
for key, name in SKINS.items():
    im = Image.open(skin_file(name)).convert('RGB')
    if im.size != (2048, 2048):
        im = im.resize((2048, 2048), Image.LANCZOS)
    fn = f'skin_{key}.jpg'
    im.save(os.path.join(a.out, fn), quality=84, optimize=True, progressive=True)
    manifest['skins'][key] = fn
    print('skin', key, os.path.getsize(os.path.join(a.out, fn)) // 1024, 'KB')

for key, path in jobs['hair'].items():
    if not path or not os.path.isfile(path):
        print('hair texture missing for', key)
        continue
    im = grey_alpha(Image.open(path), 1024)
    fn = key + '.webp'
    im.save(os.path.join(a.out, fn), quality=86, method=6)
    manifest['hair'][key] = fn
    print('hair', key, os.path.getsize(os.path.join(a.out, fn)) // 1024, 'KB')

# parts atlas (pixel rects, y down) -> uv rects (v up: u0, v0, u1, v1)
A = 1024
LAYOUT = {'brows_thin': (0, 0, 256, 256), 'brows_medium': (256, 0, 256, 256), 'brows_thick': (0, 256, 256, 256),
          'brows_soft': (256, 256, 256, 256), 'lashes_f': (512, 0, 256, 256), 'lashes_m': (768, 0, 256, 256),
          'tongue': (512, 256, 256, 256), 'teeth': (0, 512, 512, 512)}
atlas = Image.new('RGBA', (A, A), (0, 0, 0, 0))
PAD = 2
for key, (px, py, pw, ph) in LAYOUT.items():
    path = jobs['parts'].get(key)
    if not path or not os.path.isfile(path):
        print('part texture missing', key)
        continue
    im = Image.open(path)
    if key.startswith('brows') or key.startswith('lashes'):
        im = grey_alpha(im, pw - 2 * PAD)
    else:
        im = im.convert('RGBA').resize((pw - 2 * PAD, ph - 2 * PAD), Image.LANCZOS)
        if key in ('teeth', 'tongue'):
            r, g, b, al = im.split()
            im = Image.merge('RGBA', (r, g, b, Image.new('L', im.size, 255)))
    # bleed: a stretched copy under the exact one fills the padding
    atlas.paste(im.resize((pw, ph), Image.LANCZOS), (px, py))
    atlas.paste(im, (px + PAD, py + PAD))
    u0 = (px + PAD) / A
    u1 = (px + pw - PAD) / A
    v1 = 1 - (py + PAD) / A
    v0 = 1 - (py + ph - PAD) / A
    manifest['parts'][key] = [u0, v0, u1, v1]
atlas.save(os.path.join(a.out, 'parts.webp'), quality=90, method=6)
print('parts', os.path.getsize(os.path.join(a.out, 'parts.webp')) // 1024, 'KB')

eye = Image.open(jobs['eye']).convert('RGB').resize((512, 512), Image.LANCZOS)
eye.save(os.path.join(a.out, 'eye.jpg'), quality=90)
json.dump(manifest, open(os.path.join(a.out, 'manifest.json'), 'w'), indent=1)
print('done')

# linear average colour of every skin (the shader tints each skin to the character's Thai skin tone)
avg = {}
for key, fn in manifest['skins'].items():
    im = Image.open(os.path.join(a.out, fn)).convert('RGB').resize((256, 256))
    acc = [0.0, 0.0, 0.0]
    px = list(im.getdata())
    for p in px:
        for c in range(3):
            v = p[c] / 255
            acc[c] += v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    avg[key] = [round(x / len(px), 4) for x in acc]
manifest['skinAvgLinear'] = avg
json.dump(manifest, open(os.path.join(a.out, 'manifest.json'), 'w'), indent=1)
