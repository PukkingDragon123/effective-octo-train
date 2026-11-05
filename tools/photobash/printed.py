"""2D printed matter & packaging. The picture content of every poster, calendar, wall picture, label,
pack, newspaper and sticker is a REAL stock photograph (CC0 / public domain: stockprint.py, sources.py
'st_*', docs/credits/textures.md) with a few lines of printed Srisakdi type (merged Thai + Latin subsets
of @fontsource/srisakdi). Brands are fictional; no logos, royal images or portraits of real people.
Receipts, the fare chart, km posts and road signs are plain type / standard sign pictograms.
Everything is then "printed" physically: CMYK halftone screens with plate misregistration onto real
paper / board scans (ambientCG CC0), sun fading, folds, water tide-lines, mould, packing tape, torn
edges and grime.

Outputs public/assets/textures/printed/<kind>__<variant>.webp and writes the runtime catalogue
src/textures/printedCatalogue.js (kind -> variants, physical size, alpha, fallback design).
"""
import json
import math
import os

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from pbcore import blur, blur_dir, fbm, hex2rgb, load, lum, norm01, saturate, sstep
import pbcore

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SS = 2  # supersampling of the layout pass

# =======================================================================================
# Fonts (Srisakdi: the owner's single typeface)
# =======================================================================================
_FONTS = {}


def font_path(weight):
    out = os.path.join(pbcore.RAW, '_fonts')
    p = os.path.join(out, f'Srisakdi-{weight}.ttf')
    if os.path.exists(p):
        return p
    from fontTools.merge import Merger
    from fontTools.ttLib import TTFont
    os.makedirs(out, exist_ok=True)
    src = os.path.join(ROOT, 'node_modules', '@fontsource', 'srisakdi', 'files')
    parts = []
    for sub in ('thai', 'latin', 'latin-ext'):
        f = TTFont(os.path.join(src, f'srisakdi-{sub}-{weight}-normal.woff'))
        f.flavor = None
        q = os.path.join(out, f'srisakdi-{sub}-{weight}.ttf')
        f.save(q)
        parts.append(q)
    Merger().merge(parts).save(p)
    return p


def font(size, weight=700):
    k = (int(size), weight)
    if k not in _FONTS:
        _FONTS[k] = ImageFont.truetype(font_path(weight), int(size), layout_engine=ImageFont.Layout.RAQM)
    return _FONTS[k]


def c255(c):
    if isinstance(c, str):
        return tuple(int(x * 255 + 0.5) for x in hex2rgb(c))
    return tuple(int(x) for x in c)


# =======================================================================================
# Layout document (drawn at SS x, reduced when finished)
# =======================================================================================
class Doc:
    def __init__(self, w, h, bg='#ffffff'):
        self.w, self.h = w, h
        self.im = Image.new('RGB', (w * SS, h * SS), c255(bg))
        self.d = ImageDraw.Draw(self.im)

    def s(self, v):
        return v * SS

    def text(self, s, x, y, size, color='#111111', weight=700, anchor='mm', max_w=None, stroke=0, stroke_color=None,
             shadow=None, rot=0, spacing=0):
        size = size
        f = font(size * SS, weight)
        if max_w:
            while f.getlength(s) > max_w * SS and size > 6:
                size *= 0.94
                f = font(size * SS, weight)
        if rot or spacing:
            # render to a layer and rotate
            bb = f.getbbox(s, anchor='lt')
            tw, th = int(bb[2] + stroke * SS * 2 + 8), int(bb[3] - min(0, bb[1]) + stroke * SS * 2 + 8)
            lay = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
            ld = ImageDraw.Draw(lay)
            ld.text((tw / 2, th / 2), s, font=f, fill=c255(color) + (255,), anchor='mm', stroke_width=int(stroke * SS),
                    stroke_fill=c255(stroke_color or color) + (255,))
            lay = lay.rotate(rot, resample=Image.BICUBIC, expand=True)
            self.im.paste(lay, (int(x * SS - lay.width / 2), int(y * SS - lay.height / 2)), lay)
            return
        if shadow:
            dx, dy, sc = shadow
            self.d.text((x * SS + dx * SS, y * SS + dy * SS), s, font=f, fill=c255(sc), anchor=anchor,
                        stroke_width=int(stroke * SS), stroke_fill=c255(sc))
        self.d.text((x * SS, y * SS), s, font=f, fill=c255(color), anchor=anchor, stroke_width=int(stroke * SS),
                    stroke_fill=c255(stroke_color or color))

    def lines(self, rows, x, y, size, color='#111111', weight=400, lh=1.35, anchor='lm', max_w=None):
        for i, r in enumerate(rows):
            self.text(r, x, y + i * size * lh, size, color, weight, anchor, max_w)

    def rect(self, x0, y0, x1, y1, fill=None, outline=None, width=1, r=0):
        box = [x0 * SS, y0 * SS, x1 * SS, y1 * SS]
        if r:
            self.d.rounded_rectangle(box, r * SS, fill=c255(fill) if fill else None,
                                     outline=c255(outline) if outline else None, width=int(width * SS))
        else:
            self.d.rectangle(box, fill=c255(fill) if fill else None, outline=c255(outline) if outline else None,
                             width=int(width * SS))

    def ellipse(self, cx, cy, rx, ry, fill=None, outline=None, width=1):
        self.d.ellipse([(cx - rx) * SS, (cy - ry) * SS, (cx + rx) * SS, (cy + ry) * SS],
                       fill=c255(fill) if fill else None, outline=c255(outline) if outline else None, width=int(width * SS))

    def poly(self, pts, fill=None, outline=None, width=1):
        self.d.polygon([(x * SS, y * SS) for x, y in pts], fill=c255(fill) if fill else None,
                       outline=c255(outline) if outline else None, width=int(width * SS))

    def line(self, pts, color, width=1):
        self.d.line([(x * SS, y * SS) for x, y in pts], fill=c255(color), width=int(width * SS), joint='curve')

    def paste(self, arr, x0, y0, x1, y1, mask=None):
        """Paste a float RGB(A) array into the box."""
        w, h = int((x1 - x0) * SS), int((y1 - y0) * SS)
        a = cv2.resize(np.clip(arr, 0, 1).astype(np.float32), (w, h), interpolation=cv2.INTER_AREA)
        im = Image.fromarray((a[..., :3] * 255).astype(np.uint8), 'RGB')
        m = None
        if a.shape[2] == 4:
            m = Image.fromarray((a[..., 3] * 255).astype(np.uint8), 'L')
        elif mask is not None:
            m = Image.fromarray((cv2.resize(mask.astype(np.float32), (w, h)) * 255).astype(np.uint8), 'L')
        self.im.paste(im, (int(x0 * SS), int(y0 * SS)), m)

    def sunburst(self, cx, cy, r, n, c1, c2):
        for i in range(n):
            a0, a1 = i / n * math.tau, (i + 0.5) / n * math.tau
            self.poly([(cx, cy), (cx + math.cos(a0) * r, cy + math.sin(a0) * r),
                       (cx + math.cos(a1) * r, cy + math.sin(a1) * r)], fill=c1 if i % 2 == 0 else c2)

    def gradient(self, x0, y0, x1, y1, c_top, c_bot):
        h = int((y1 - y0) * SS)
        t = np.linspace(0, 1, h)[:, None, None]
        g = hex2rgb(c_top) * (1 - t) + hex2rgb(c_bot) * t
        g = np.repeat(g, int((x1 - x0) * SS), 1)
        self.im.paste(Image.fromarray((g * 255).astype(np.uint8), 'RGB'), (int(x0 * SS), int(y0 * SS)))

    def finish(self):
        im = self.im.resize((self.w, self.h), Image.LANCZOS)
        return np.asarray(im, np.float32) / 255.0


# =======================================================================================
# Helpers (the designs themselves live in stockprint.py: real CC0 photos + printed type)
# =======================================================================================
def mask_layer(w, h, draw):
    m = Image.new('L', (w * SS, h * SS), 0)
    draw(ImageDraw.Draw(m), SS)
    return np.asarray(m.resize((w, h), Image.LANCZOS), np.float32) / 255


def photo_plate(src, rel_box, size, grade_fn=None):
    """Crop a region (relative box in the equirect backplate) and fit it to size (w,h)."""
    p = pbcore.raw_path(src, 'tonemapped')
    im = Image.open(p)
    im.draft('RGB', (4096, 2048))
    im = im.convert('RGB')
    W, H = im.size
    x0, y0, x1, y1 = rel_box
    crop = im.crop((int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)))
    w, h = size
    # cover-fit
    cw, ch = crop.size
    sc = max(w / cw, h / ch)
    crop = crop.resize((int(cw * sc + 1), int(ch * sc + 1)), Image.LANCZOS)
    ox, oy = (crop.width - w) // 2, (crop.height - h) // 2
    a = np.asarray(crop.crop((ox, oy, ox + w, oy + h)), np.float32) / 255
    return grade_fn(a) if grade_fn else a


def elephant_mask(w, h):
    def f(d, s):
        d.ellipse([w * 0.2 * s, h * 0.3 * s, w * 0.85 * s, h * 0.72 * s], fill=255)  # body
        d.ellipse([w * 0.08 * s, h * 0.22 * s, w * 0.42 * s, h * 0.58 * s], fill=255)  # head
        d.polygon([(w * 0.1 * s, h * 0.45 * s), (w * 0.16 * s, h * 0.45 * s), (w * 0.12 * s, h * 0.86 * s),
                   (w * 0.06 * s, h * 0.86 * s)], fill=255)  # trunk
        for x in (0.28, 0.42, 0.62, 0.76):
            d.rectangle([w * x * s, h * 0.6 * s, w * (x + 0.08) * s, h * 0.9 * s], fill=255)
    return mask_layer(w, h, f)


# =======================================================================================
# Print / ageing pipeline
# =======================================================================================
PAPERS = {'white': 'acg_Paper001', 'cream': 'acg_Paper002', 'crumpled': 'acg_Paper003', 'kraft': 'acg_Paper005',
          'board': 'acg_Cardboard001', 'corrugated': 'acg_Cardboard003'}
INKS = {'c': np.array([0.0, 0.6, 0.88]), 'm': np.array([0.88, 0.08, 0.5]), 'y': np.array([1.0, 0.9, 0.02]),
        'k': np.array([0.07, 0.07, 0.08])}


def paper(kind, w, h, seed):
    sid = PAPERS[kind]
    col = load(sid, 'color')
    # tile to cover, random offset
    rng = np.random.default_rng(seed)
    reps_x, reps_y = math.ceil(w / col.shape[1] * 1.0) + 1, math.ceil(h / col.shape[0] * 1.0) + 1
    big = np.tile(col, (reps_y, reps_x, 1))
    oy, ox = rng.integers(0, col.shape[0] // 2), rng.integers(0, col.shape[1] // 2)
    scale = 0.75 if kind in ('white', 'cream', 'crumpled') else 0.5
    big = cv2.resize(big, (int(big.shape[1] * scale), int(big.shape[0] * scale)), interpolation=cv2.INTER_AREA)
    p = big[oy // 2:oy // 2 + h, ox // 2:ox // 2 + w]
    if p.shape[0] < h or p.shape[1] < w:
        p = cv2.resize(big, (w, h))
    if kind in ('white', 'cream'):
        L = lum(p)
        p = (p - L[..., None]) * 0.5 + L[..., None]  # paper scans: keep grain, calm the colour
        p = p / max(1e-3, lum(p).mean()) * (0.9 if kind == 'white' else 0.86)
        if kind == 'cream':
            p = p * hex2rgb('#f4e8cc') * 1.05
    return np.clip(p, 0, 1).astype(np.float32)


def halftone(design, cell=3.2, misreg=1.2, fade=0.0, seed=0, solid_k=True, grain=None):
    """CMYK halftone of an RGB design -> coverage per plate (H,W) dict. fade reduces M/Y (sun)."""
    h, w = design.shape[:2]
    rgb = np.clip(design, 0, 1)
    K = 1 - rgb.max(2)
    d = np.maximum(1 - K, 1e-4)
    C, M, Y = (1 - rgb[..., 0] - K) / d, (1 - rgb[..., 1] - K) / d, (1 - rgb[..., 2] - K) / d
    if fade:
        M = M * (1 - fade * 0.75)
        Y = Y * (1 - fade * 0.85)
        C = C * (1 - fade * 0.3)
        K = K * (1 - fade * 0.25)
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    out = {}
    for name, ch, ang in (('c', C, 15), ('m', M, 75), ('y', Y, 0), ('k', K, 45)):
        dx, dy = (rng.random(2) - 0.5) * 2 * misreg
        a = math.radians(ang)
        ca, sa = math.cos(a), math.sin(a)
        u = (xx - dx) * ca + (yy - dy) * sa
        v = -(xx - dx) * sa + (yy - dy) * ca
        cu, cv = (np.floor(u / cell) + 0.5) * cell, (np.floor(v / cell) + 0.5) * cell
        sx, sy = cu * ca - cv * sa + dx, cu * sa + cv * ca + dy
        smooth = cv2.GaussianBlur(ch.astype(np.float32), (0, 0), cell * 0.35)
        val = cv2.remap(smooth, sx.astype(np.float32), sy.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        r = cell * np.sqrt(np.clip(val, 0, 1) / math.pi) * 1.12
        dist = np.hypot(u - cu, v - cv)
        cov = np.clip(r - dist + 0.5, 0, 1)
        # solid areas (text, flat colour) print solid, not as dots
        solid = sstep(0.82, 0.95, ch)
        cov = np.maximum(cov, solid * np.clip(ch, 0, 1)) if (name == 'k' or solid_k) else cov
        # ink spreads / starves with the paper fibres
        if grain is not None:
            cov = cov * (0.86 + 0.18 * grain)
        out[name] = np.clip(cov, 0, 1)
    return out


def ink_on(paper_rgb, plates, density=0.95):
    out = paper_rgb.copy()
    for name in ('y', 'm', 'c', 'k'):
        cov = plates[name][..., None] * density
        out = out * (1 - cov * (1 - INKS[name]))
    return out


def solid_print(paper_rgb, design, density=0.92, grain=None):
    """Flat ink (screen print, signs, packaging): multiply design colours over the substrate."""
    g = 1.0 if grain is None else (0.9 + 0.12 * grain)[..., None]
    ink = 1 - (1 - design) * density * g
    return paper_rgb * ink


def age(img, seed=0, sun=0.0, folds=(0, 0), water=0.0, mould=0.0, grime=0.3, tape=(), tear=0.0, crumple=0.0,
        edge_wear=0.3, alpha=True, streaks=0.0, scratch=0.0, rust_spots=0.0):
    """Physical ageing of a printed sheet. img RGB. Returns RGBA."""
    h, w = img.shape[:2]
    rng = np.random.default_rng(seed)
    out = img.copy()
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    # sun: paper yellows, ink lightens more at the top (exposed)
    if sun:
        g = (1 - yy / h) * 0.6 + 0.4
        L = lum(out)[..., None]
        faded = L * 0.35 + out * 0.65
        faded = faded + (1 - faded) * 0.28
        faded = faded * hex2rgb('#f2e6c8')
        out = out * (1 - sun * g[..., None]) + faded * sun * g[..., None]
    # folds: crease lines with a light/dark ridge and cracked ink
    for axis, n in ((1, folds[0]), (0, folds[1])):
        for i in range(1, n + 1):
            pos = (w if axis == 1 else h) * i / (n + 1) + (rng.random() - 0.5) * 6
            coord = xx if axis == 1 else yy
            d = coord - pos + (fbm((w, h), 30, 3, seed + i * 7) - 0.5) * 3
            ridge = np.exp(-(d / 1.6) ** 2)
            side = np.tanh(d / 6) * np.exp(-(d / 18) ** 2)
            crack = ridge * sstep(0.45, 0.75, fbm((w, h), 80, 3, seed + i))
            out = out * (1 - side[..., None] * 0.12) + crack[..., None] * (hex2rgb('#efe8d6') - out) * 0.75
            out = out * (1 - ridge[..., None] * 0.08)
    if crumple:
        cr = fbm((w, h), 6, 5, seed + 3)
        sh = cv2.Sobel(cr, cv2.CV_32F, 1, 1, ksize=5)
        out = out * (1 + np.clip(sh * 2.5, -0.25, 0.25)[..., None] * crumple)
    # water damage: tide line + darkened, ink-bled area from the bottom
    if water:
        wm = fbm((w, h), 3, 4, seed + 11) * 0.6 + (yy / h) * 0.7 - 0.25
        thr = 1 - water * 0.55
        inside = sstep(thr - 0.02, thr + 0.02, wm)
        ring = np.exp(-((wm - thr) / 0.012) ** 2)
        bled = blur_dir(out, 14, axis=0, wrap=False)
        out = out * (1 - inside[..., None] * 0.6) + bled * inside[..., None] * 0.6
        out = out * (1 - inside[..., None] * 0.12) * (1 - ring[..., None] * 0.35) + ring[..., None] * hex2rgb('#6a4a24') * 0.25
        try:
            lk = load('acg_Leaking012A', 'color', (w, h), 'L')
            out = out * (1 - inside[..., None] * (1 - lk[..., None]) * 0.25)
        except Exception:
            pass
    if streaks:
        st = pbcore.streaks((w, h), 30, seed + 13, (0.2, 0.7), (1, 4))
        out = out * (1 - st[..., None] * streaks * 0.4)
    # mould: speckled dark spots in clusters
    if mould:
        cl = sstep(1 - mould * 0.45, 1 - mould * 0.3, fbm((w, h), 4, 4, seed + 17))
        dots = sstep(0.62, 0.72, fbm((w, h), 70, 2, seed + 19)) * cl
        out = out * (1 - dots[..., None] * 0.65) + dots[..., None] * hex2rgb('#2e3424') * 0.4
        out = out * (1 - cl[..., None] * 0.1)
    if rust_spots:
        rs = sstep(0.8, 0.9, fbm((w, h), 12, 4, seed + 23)) * rust_spots
        out = out * (1 - rs[..., None]) + hex2rgb('#6a3418') * rs[..., None]
    if scratch:
        s = sstep(0.006, 0.0, np.abs(fbm((w, h), (40, 4), 3, seed + 29) - 0.5)) * scratch
        out = out + s[..., None] * 0.25
    # grime toward the edges + dust
    ed = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)) / (min(w, h) * 0.12)
    g = (1 - np.clip(ed, 0, 1)) * grime * (0.6 + 0.6 * fbm((w, h), 8, 3, seed + 31))
    out = out * (1 - g[..., None] * 0.45)
    out = out * (0.94 + 0.08 * fbm((w, h), 3, 3, seed + 37)[..., None])
    # alpha: torn / worn edges, missing corner
    a = np.ones((h, w), np.float32)
    if alpha:
        en = (fbm((w, h), 40, 4, seed + 41) - 0.5) * (2 + edge_wear * 6)
        d = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)) + en
        a = sstep(0.0, 1.2, d - 1.0 - edge_wear * 2)
        if tear:
            corner = rng.integers(4)
            cx, cy = (0 if corner % 2 == 0 else w), (0 if corner < 2 else h)
            r = min(w, h) * (0.12 + 0.25 * tear)
            dist = np.hypot(xx - cx, yy - cy) + (fbm((w, h), 25, 4, seed + 43) - 0.5) * r * 0.5
            a = a * sstep(r * 0.98, r * 1.02, dist)
            # paper fibre fringe along the tear
            fringe = sstep(r * 1.02, r * 1.08, dist) * (1 - sstep(r * 1.08, r * 1.12, dist))
            out = out * (1 - fringe[..., None]) + hex2rgb('#efe9da') * fringe[..., None]
    # packing tape pieces: semi-transparent, glossy, slightly yellow, dust caught on the glue
    if tape:
        try:
            tp = load('acg_Tape004', 'color', None)
        except Exception:
            tp = np.ones((256, 256, 3), np.float32) * hex2rgb('#d8c49a')
        for (tx, ty, ang) in tape:
            tw, th = int(min(w, h) * 0.28), int(min(w, h) * 0.08)
            tile = cv2.resize(tp, (tw, th))
            m = np.ones((th, tw), np.float32)
            m[:, :3] = 0.5
            m[:, -3:] = 0.5
            M = cv2.getRotationMatrix2D((tw / 2, th / 2), ang, 1.0)
            big = int(math.hypot(tw, th)) + 4
            M[0, 2] += big / 2 - tw / 2
            M[1, 2] += big / 2 - th / 2
            tile_r = cv2.warpAffine(tile, M, (big, big))
            m_r = cv2.warpAffine(m, M, (big, big))
            x0, y0 = int(tx * w - big / 2), int(ty * h - big / 2)
            xs0, ys0 = max(0, x0), max(0, y0)
            xs1, ys1 = min(w, x0 + big), min(h, y0 + big)
            if xs1 <= xs0 or ys1 <= ys0:
                continue
            sub = (slice(ys0, ys1), slice(xs0, xs1))
            tsub = tile_r[ys0 - y0:ys1 - y0, xs0 - x0:xs1 - x0]
            msub = m_r[ys0 - y0:ys1 - y0, xs0 - x0:xs1 - x0][..., None]
            out[sub] = out[sub] * (1 - msub * 0.45) + out[sub] * tsub * 1.1 * msub * 0.45
            out[sub] = out[sub] + msub * 0.06
            a[sub] = np.maximum(a[sub], msub[..., 0] * 0.95)
    return np.concatenate([np.clip(out, 0, 1), a[..., None]], -1).astype(np.float32)


def die_cut(img, radius=0.12, border=0.04, seed=0, white=True):
    """Sticker: rounded die-cut outline with a white vinyl border + gloss, RGBA."""
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r = min(w, h) * radius
    dx = np.maximum(np.abs(xx - w / 2) - (w / 2 - r - 2), 0)
    dy = np.maximum(np.abs(yy - h / 2) - (h / 2 - r - 2), 0)
    d = np.hypot(dx, dy) - r
    a = sstep(0.8, -0.8, d)
    b = min(w, h) * border
    inner = sstep(0.8, -0.8, d + b)
    out = img.copy()
    if white:
        out = out * inner[..., None] + hex2rgb('#f4f2ec') * (1 - inner[..., None])
    gloss = sstep(0.6, 1.0, fbm((w, h), (2, 6), 3, seed)) * 0.12
    out = out + gloss[..., None]
    return np.concatenate([np.clip(out, 0, 1), a[..., None]], -1)


# =======================================================================================
# Designs
# =======================================================================================
TH_DIG = str.maketrans('0123456789', '๐๑๒๓๔๕๖๗๘๙')


def thd(s):
    return str(s).translate(TH_DIG)


def _column(D, text, x, y, width, size, nlines):
    f = font(size * SS, 400)
    words = text.split(' ')
    line = ''
    row = 0
    for wd in words:
        t = (line + ' ' + wd).strip()
        if f.getlength(t) > width * SS:
            D.text(line, x, y + row * size * 1.45, size, '#222222', 400, 'lm')
            row += 1
            line = wd
            if row >= nlines:
                return
        else:
            line = t
    if line and row < nlines:
        D.text(line, x, y + row * size * 1.45, size, '#222222', 400, 'lm')


def receipt(seed, kind='taxi'):
    W, H = 256, 640 if kind == 'taxi' else 560
    D = Doc(W, H, '#f4f2ee')
    if kind == 'taxi':
        rows = [('ใบเสร็จรับเงิน', 26), ('แท็กซี่ ทข ๔๕๒๑', 20), ('—' * 12, 16), ('วันที่  ๑๔/๐๗', 18), ('เวลา   ๐๔:๔๔', 18),
                ('ระยะทาง  ๙.๐ กม.', 18), ('รอ     ๐๐:๑๓', 18), ('—' * 12, 16), ('ค่าโดยสาร  ๙๔ บาท', 22), ('—' * 12, 16),
                ('ขอบคุณที่ใช้บริการ', 18), ('ขับขี่ปลอดภัย', 18), ('อย่าหันหลัง', 16)]
    else:
        rows = [('ร้านชำ ป้าแดง', 26), ('กม.๙ ต.มารวย', 18), ('—' * 12, 16), ('ธูปหอม ๑ ห่อ      ๒๐', 17),
                ('เทียนขาว ๒ เล่ม     ๑๐', 17), ('น้ำแดง ๓ ขวด      ๓๐', 17), ('พวงมาลัย ๒ พวง     ๔๐', 17),
                ('บุหรี่ ๑ ซอง        ๖๐', 17), ('—' * 12, 16), ('รวม            ๑๖๐', 22), ('—' * 12, 16),
                ('ขอบคุณค่ะ', 18)]
    y = 40
    for t, s in rows:
        D.text(t, W / 2, y, s, '#2a2a2a', 400, max_w=W - 24)
        y += s * 1.7
    img = D.finish()
    # thermal print: faded grey, streaky
    L = lum(img)
    tone = 1 - (1 - L) * (0.7 + 0.3 * fbm((W, H), (2, 40), 3, seed))
    img = np.repeat(tone[..., None], 3, 2) * hex2rgb('#f2f0ea')
    return img, dict(paper='white', halftone=0, solid=True, sun=0.3, folds=(0, 2), crumple=0.6, water=0.15, mould=0.0,
                     grime=0.3, edge_wear=0.6)


def fare_chart(seed):
    W, H = 512, 640
    D = Doc(W, H, '#f8f6ee')
    D.rect(0, 0, W, 90, fill='#0a5a2a')
    D.text('อัตราค่าโดยสาร', W / 2, 46, 44, '#f8f070')
    rows = [('๑ กิโลเมตรแรก', '๓๕ บาท'), ('กม.ที่ ๒ - ๑๐', 'กม.ละ ๖.๕๐'), ('กม.ที่ ๑๑ - ๒๐', 'กม.ละ ๗.๐๐'),
            ('กม.ที่ ๒๑ - ๔๐', 'กม.ละ ๘.๐๐'), ('รถติด / รอ', 'นาทีละ ๒ บาท'), ('เรียกผ่านวิทยุ', 'เพิ่ม ๒๐ บาท')]
    for i, (a, b) in enumerate(rows):
        y = 130 + i * 70
        D.rect(20, y - 30, W - 20, y + 30, fill='#e8f0e0' if i % 2 else '#ffffff', outline='#0a5a2a', width=2)
        D.text(a, 40, y, 26, '#1a1a1a', 700, 'lm')
        D.text(b, W - 40, y, 26, '#a81a10', 700, 'rm')
    D.text('ผู้โดยสารมีสิทธิ์ขอใบเสร็จทุกครั้ง', W / 2, H - 70, 22, '#333333')
    D.text('ร้องเรียน โทร ๑๕๘๔', W / 2, H - 36, 22, '#333333')
    return D.finish(), dict(paper='white', halftone=0, solid=True, sun=0.5, folds=(0, 0), water=0.1, mould=0.05,
                            grime=0.5, tape=((0.06, 0.04, -30), (0.94, 0.04, 30)), alpha=True)


def km_face(seed, km):
    W, H = 384, 576
    D = Doc(W, H, '#e9e6dc')
    D.rect(0, 0, W, H * 0.29, fill='#1f6a3e')
    D.ellipse(W / 2, H * 0.29, W * 0.62, H * 0.06, fill='#1f6a3e')
    D.text('ทางหลวงชนบท', W / 2, H * 0.08, 30, '#eef0e4')
    D.text('มร.๔๐๙๙', W / 2, H * 0.18, 50, '#ffffff')
    D.text('กม.', W / 2, H * 0.43, 70, '#141414')
    D.text(str(km), W / 2, H * 0.64, 170, '#111111')  # KM stones use Arabic numerals
    D.rect(50, H * 0.8, W - 50, H * 0.81, fill='#1f6a3e')
    D.text(f'มารวย {max(1, 12 - km)}', W / 2, H * 0.88, 36, '#1a1a1a')
    return D.finish(), dict(paper='board', halftone=0, solid=True, sun=0.5, grime=0.7, streaks=0.8, alpha=False,
                            mould=0.45, substrate='concrete', scratch=0.4)


def road_sign(seed, variant):
    S = 512
    D = Doc(S, S, '#9a9a96')
    alpha_shape = None
    if variant.startswith('curve_') or variant == 'elephant':
        def dia(d, s):
            d.polygon([(S / 2 * s, 4 * s), ((S - 4) * s, S / 2 * s), (S / 2 * s, (S - 4) * s), (4 * s, S / 2 * s)], fill=255)
        alpha_shape = mask_layer(S, S, dia)
        D.poly([(S / 2, 4), (S - 4, S / 2), (S / 2, S - 4), (4, S / 2)], fill='#16140f')
        D.poly([(S / 2, 22), (S - 22, S / 2), (S / 2, S - 22), (22, S / 2)], fill='#e8b32a')
        D.poly([(S / 2, 40), (S - 40, S / 2), (S / 2, S - 40), (40, S / 2)], outline='#16140f', width=8)
        if variant == 'elephant':
            m = elephant_mask(220, 200)
            D.paste(np.concatenate([np.zeros((200, 220, 3)), m[..., None]], -1), S / 2 - 110, S / 2 - 100, S / 2 + 110, S / 2 + 100)
        else:
            sgn = 1 if variant == 'curve_right' else -1
            pts = [(S / 2 - sgn * 40, S * 0.72), (S / 2 - sgn * 40, S * 0.5), (S / 2 - sgn * 20, S * 0.38), (S / 2 + sgn * 40, S * 0.34)]
            D.line(pts, '#15130f', 34)
            D.poly([(S / 2 + sgn * 30, S * 0.24), (S / 2 + sgn * 110, S * 0.34), (S / 2 + sgn * 30, S * 0.45)], fill='#15130f')
    elif variant.startswith('speed_'):
        kmh = variant.split('_')[1]

        def circ(d, s):
            d.ellipse([4 * s, 4 * s, (S - 4) * s, (S - 4) * s], fill=255)
        alpha_shape = mask_layer(S, S, circ)
        D.ellipse(S / 2, S / 2, S / 2 - 4, S / 2 - 4, fill='#c81a14')
        D.ellipse(S / 2, S / 2, S / 2 - 60, S / 2 - 60, fill='#f2f0ea')
        D.text(kmh, S / 2, S * 0.48, 190, '#141414')
        D.text('กม./ชม.', S / 2, S * 0.7, 40, '#141414')
    elif variant == 'curve_danger':
        D = Doc(S, S // 2, '#e8b32a')
        D.rect(10, 10, S - 10, S // 2 - 10, outline='#16140f', width=10)
        D.text('ทางโค้งอันตราย', S / 2, S * 0.17, 60, '#16140f')
        D.text('ขับช้า ๆ ได้ถึงบ้าน', S / 2, S * 0.34, 40, '#16140f')
        img = D.finish()
        return img, dict(paper='board', halftone=0, solid=True, sun=0.6, grime=0.6, streaks=0.7, alpha=False,
                         rust_spots=0.4, scratch=0.5, substrate='metal')
    img = D.finish()
    return img, dict(paper='board', halftone=0, solid=True, sun=0.55, grime=0.55, streaks=0.7, alpha=False,
                     rust_spots=0.3, scratch=0.5, substrate='metal', shape_alpha=alpha_shape)


# =======================================================================================
# Catalogue: (kind, variant) -> (designer, physical size m, decal-able, fallback design)
# =======================================================================================
def _cat():
    import stockprint as S
    C = {}

    def add(kind, variant, fn, size, decal=False, fallback=None, shape='rect'):
        C[(kind, variant)] = dict(fn=fn, size=size, decal=decal, fallback=fallback or [kind, {'variant': variant}], shape=shape)
    P = (0.5, 0.7)
    for v, fn in (('movie', S.poster_movie), ('movie_2', S.poster_movie2), ('concert', S.poster_concert),
                  ('missing', S.poster_missing), ('temple_fair', S.poster_temple_fair), ('election', S.poster_election),
                  ('lottery', S.poster_lottery), ('drink', S.poster_drink), ('balm', S.poster_balm)):
        fb = ['poster', {'variant': {'movie_2': 'movie', 'missing': 'movie', 'lottery': 'drink'}.get(v, v)}]
        add('poster', v, fn, P, decal=True, fallback=fb)
    add('calendar', 'buddha', lambda s: S.calendar(s, 'buddha_hall', 9, 2526, (0.5, 0.4)), (0.34, 0.51), fallback=['calendar', {}])
    add('calendar', 'buddha_2', lambda s: S.calendar(s + 3, 'temple_sukhothai', 3, 2527), (0.34, 0.51), fallback=['calendar', {}])
    add('amulet_card', 'luangpho', lambda s: S.amulet_card(s, 'buddha_seated', 'หลวงพ่อมารวย', 'รุ่นแรก ๒๕๑๙'), (0.064, 0.085),
        fallback=['buddha_card', {}])
    add('amulet_card', 'phra_somdej', lambda s: S.amulet_card(s + 1, 'buddha_gold', 'พระสมเด็จ วัดมารวย', 'พิมพ์ใหญ่ เนื้อผง'),
        (0.064, 0.085), fallback=['buddha_card', {}])
    # wall pictures: framed photo prints and small snapshots (garage painting frame, memorial frames)
    for v, (name, w, h, border, focus) in {'temple': ('temple_sunset', 512, 664, 0, (0.5, 0.5)),
                                           'waterfall': ('waterfall', 512, 664, 0, (0.5, 0.5)),
                                           'snapshot': ('yellow_car', 288, 384, 0.06, (0.5, 0.5)),
                                           'motorbike': ('old_moto', 288, 384, 0.06, (0.5, 0.5)),
                                           'lotus': ('lotus', 288, 384, 0.06, (0.5, 0.5)),
                                           'rice': ('rice_bridge', 288, 384, 0.06, (0.5, 0.5))}.items():
        add('picture', v, lambda s, a=(name, w, h, border, focus): S.picture(s, a[0], a[1], a[2], a[4], a[3]),
            (w / 1000, h / 1000) if not border else (0.09, 0.12), fallback=['picture', {'variant': v}])
    add('newspaper', 'front', lambda s: S.newspaper(s, 1), (0.38, 0.5), decal=True, fallback=['poster', {'variant': 'movie'}])
    add('newspaper', 'classifieds', lambda s: S.newspaper(s, 2), (0.38, 0.5), decal=True, fallback=['poster', {'variant': 'drink'}])
    add('noodle_menu', 'board', S.noodle_menu, (0.75, 1.05), fallback=['noodle_menu', {}])
    add('receipt', 'taxi', lambda s: receipt(s, 'taxi'), (0.058, 0.145), decal=True, fallback=['receipt', {}])
    add('receipt', 'grocery', lambda s: receipt(s, 'grocery'), (0.058, 0.127), decal=True, fallback=['receipt', {}])
    add('fare_chart', 'taxi', fare_chart, (0.16, 0.2), decal=True, fallback=['receipt', {}])
    add('lottery', 'temple', S.lottery_ticket, (0.18, 0.09), decal=True, fallback=['lottery', {}])
    for v in ('corn', 'prawn', 'squid'):
        add('snack_bag', v, lambda s, v=v: S.snack_bag(s, v), (0.14, 0.2), decal=True,
            fallback=['snack_wrapper', {'variant': 'chips'}])
    for v in ('tomyum', 'pork'):
        add('noodle_cup', v, lambda s, v=v: S.noodle_cup(s, v), (0.29, 0.097), fallback=['snack_wrapper', {'variant': 'noodles'}])
    for v in ('energy', 'energy_red', 'soda_red', 'soda_green'):
        add('drink_label', v, lambda s, v=v: S.drink_label(s, v), (0.17, 0.064),
            fallback=['drink_label', {'variant': 'energy' if v.startswith('energy') else 'red_soda'}])
    for v in ('plaifah', 'khwanthian'):
        add('cigarette_pack', v, lambda s, v=v: S.cigarette_pack(s, v), (0.055, 0.077), fallback=['snack_wrapper', {'variant': 'candy'}])
    add('betel_pack', 'nokkaew', S.betel_pack, (0.09, 0.09), fallback=['snack_wrapper', {'variant': 'biscuit'}])
    add('incense_box', 'jetdao', S.incense_box, (0.2, 0.125), fallback=['snack_wrapper', {'variant': 'biscuit'}])
    add('candle_pack', 'dokbua', S.candle_pack, (0.17, 0.12), fallback=['snack_wrapper', {'variant': 'candy'}])
    add('joss_paper', 'gold', lambda s: S.joss_paper(s, 'gold'), (0.11, 0.11), decal=True, fallback=['buddha_card', {}])
    add('joss_paper', 'hell_note', lambda s: S.joss_paper(s, 'note'), (0.18, 0.09), decal=True, fallback=['lottery', {}])
    add('offering_label', 'spirit', lambda s: S.offering_label(s, 'spirit'), (0.1, 0.067), decal=True,
        fallback=['shop_sign', {'th': 'ถวายเจ้าที่', 'en': ''}])
    add('offering_label', 'condolence', lambda s: S.offering_label(s, 'condolence'), (0.1, 0.067), decal=True,
        fallback=['shop_sign', {'th': 'ด้วยความอาลัย', 'en': ''}])
    for km in range(0, 13):
        add('km_marker', str(km), lambda s, km=km: km_face(s + km, km), (0.42, 0.63), fallback=['km_marker', {'km': km}])
    for v in ('curve_left', 'curve_right', 'elephant', 'speed_40', 'speed_60', 'speed_80', 'curve_danger'):
        fb = {'curve_left': ['curve_warning', {'dir': 'left'}], 'curve_right': ['curve_warning', {'dir': 'right'}],
              'elephant': ['elephant_crossing', {}], 'speed_40': ['speed_sign', {'kmh': 40}], 'speed_60': ['speed_sign', {'kmh': 60}],
              'speed_80': ['speed_sign', {'kmh': 80}], 'curve_danger': ['warning_sign', {'th': 'ทางโค้งอันตราย', 'en': 'Dangerous curve'}]}[v]
        size = (1.0, 0.5) if v == 'curve_danger' else (0.75, 0.75)
        shape = 'diamond' if v.startswith('curve_') and v != 'curve_danger' or v == 'elephant' else ('circle' if v.startswith('speed') else 'rect')
        add('road_sign', v, lambda s, v=v: road_sign(s, v), size, fallback=fb, shape=shape)
    for v in ('drive_slow', 'yantra', 'cartoon', 'lucky', 'no_smoking', 'merit', 'meter', 'no_stop'):
        add('sticker', v, lambda s, v=v: S.sticker(s, v), (0.09, 0.09), decal=True,
            fallback=['sticker', {'variant': v if v in ('drive_slow', 'yantra', 'cartoon', 'lucky', 'no_smoking', 'merit') else 'lucky'}],
            shape='sticker')
    return C


def render(kind, variant, spec, seed):
    img, o = spec['fn'](seed)
    h, w = img.shape[:2]
    rng_seed = seed * 31 + 7
    if o.get('sticker'):
        rgba = die_cut(img, seed=rng_seed)
        aged = age(rgba[..., :3], seed=rng_seed, sun=o.get('sun', 0.3), grime=o.get('grime', 0.3), alpha=False,
                   scratch=o.get('scratch', 0))
        aged[..., 3] = rgba[..., 3]
        return aged
    grain = None
    pk = o.get('paper', 'white')
    if o.get('substrate') == 'concrete':
        sub = load('ph_dirty_concrete', 'diffuse', (w, h))
        pap = np.clip(sub * 0.35 + 0.65, 0, 1)
    elif o.get('substrate') == 'metal':
        sub = load('acg_PaintedMetal014', 'color', (w, h))
        pap = np.clip(saturate(sub, 0.2) * 0.25 + 0.78, 0, 1)
    else:
        pap = paper(pk, w, h, rng_seed)
    grain = norm01(lum(pap))
    if o.get('halftone'):
        plates = halftone(img, cell=o['halftone'], misreg=o.get('misreg', 1.0), fade=0.0, seed=rng_seed, grain=grain)
        printed = ink_on(pap, plates)
    else:
        printed = solid_print(pap, img, grain=grain)
    rgba = age(printed, seed=rng_seed, sun=o.get('sun', 0), folds=o.get('folds', (0, 0)), water=o.get('water', 0),
               mould=o.get('mould', 0), grime=o.get('grime', 0.3), tape=o.get('tape', ()), tear=o.get('tear', 0),
               crumple=o.get('crumple', 0), edge_wear=o.get('edge_wear', 0.3), alpha=o.get('alpha', True),
               streaks=o.get('streaks', 0), scratch=o.get('scratch', 0), rust_spots=o.get('rust_spots', 0))
    if o.get('gloss'):
        gl = sstep(0.65, 0.95, fbm((w, h), (2, 5), 3, rng_seed + 51)) * 0.1
        rgba[..., :3] = np.clip(rgba[..., :3] + gl[..., None], 0, 1)
    if o.get('shape_alpha') is not None:
        rgba[..., 3] = np.minimum(rgba[..., 3] if o.get('alpha', True) else 1.0, o['shape_alpha'])
    return rgba


def build(w, keys):
    cat = _cat()
    catalogue = {}
    for (kind, variant), spec in cat.items():
        k = f'{kind}:{variant}'
        if keys and kind not in keys and k not in keys:
            continue
        seed = sum(ord(ch) * (i + 1) for i, ch in enumerate(k)) % 100000  # deterministic across runs
        rgba = render(kind, variant, spec, seed)
        alpha = bool((rgba[..., 3] < 0.99).mean() > 0.002)
        h, wd = rgba.shape[:2]
        from pbcore import bleed_rgb
        if alpha:
            rgba = bleed_rgb(rgba, passes=6)
        rel = f'printed/{kind}__{variant}.webp'
        w.entry('printed', k, rel, rgba if alpha else rgba[..., :3], alpha=alpha,
                extra={'size': list(spec['size']), 'aspect': round(wd / h, 4), 'shape': spec['shape'], 'decal': spec['decal']})
        print('  printed', k, flush=True)
    for (kind, variant), spec in cat.items():
        e = catalogue.setdefault(kind, {'variants': [], 'decal': False, 'size': list(spec['size']), 'fallback': {}})
        e['variants'].append(variant)
        e['decal'] = e['decal'] or spec['decal']
        e['fallback'][variant] = spec['fallback']
        e.setdefault('sizes', {})[variant] = list(spec['size'])
    write_js(catalogue)


def write_js(cat):
    path = os.path.join(ROOT, 'src', 'textures', 'printedCatalogue.js')
    js = ('// GENERATED by tools/photobash/printed.py - do not edit by hand.\n'
          '// Photobashed printed matter & packaging (public/assets/textures/printed/<kind>__<variant>.webp).\n'
          '// kind -> { variants[], decal (also usable through decalTex), sizes{variant: [w,h] metres},\n'
          '//          fallback{variant: [procedural signTex kind, opts]} used until / unless the photo loads }.\n'
          'export const PRINTED_CATALOGUE = ' + json.dumps(cat, ensure_ascii=False, indent=1) + ';\n')
    with open(path, 'w') as f:
        f.write(js)
