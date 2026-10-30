"""2D printed matter & packaging: ORIGINAL fictional Thai designs (no real brands, logos or
people), typeset in Srisakdi (merged Thai + Latin subsets of @fontsource/srisakdi), then
"printed" physically: CMYK halftone screens with plate misregistration onto real paper /
board scans (ambientCG CC0), sun fading, folds, water tide-lines with ink bleed, mould,
packing tape, torn edges and grime. Photo plates (Poly Haven CC0 HDRI backplates) are used
for poster imagery.

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
# Painted illustration helpers
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


def ghost_woman(w, h, seed=1):
    """Painted woman-in-white silhouette (long black hair over the face, white dress), RGBA."""
    def shape(d, s):
        cx = w / 2
        # dress
        d.polygon([((cx - w * 0.16) * s, h * 0.35 * s), ((cx + w * 0.16) * s, h * 0.35 * s), ((cx + w * 0.3) * s, h * 0.98 * s),
                   ((cx - w * 0.3) * s, h * 0.98 * s)], fill=255)
        d.ellipse([(cx - w * 0.12) * s, h * 0.06 * s, (cx + w * 0.12) * s, h * 0.26 * s], fill=255)
        d.rectangle([(cx - w * 0.05) * s, h * 0.24 * s, (cx + w * 0.05) * s, h * 0.36 * s], fill=255)
        for sx in (-1, 1):
            d.line([((cx + sx * w * 0.15) * s, h * 0.36 * s), ((cx + sx * w * 0.2) * s, h * 0.62 * s)], fill=255,
                   width=int(w * 0.07 * s))
    body = mask_layer(w, h, shape)

    def hair(d, s):
        cx = w / 2
        d.polygon([((cx - w * 0.14) * s, h * 0.08 * s), ((cx + w * 0.14) * s, h * 0.08 * s), ((cx + w * 0.17) * s, h * 0.5 * s),
                   ((cx + w * 0.05) * s, h * 0.56 * s), ((cx - w * 0.06) * s, h * 0.53 * s), ((cx - w * 0.18) * s, h * 0.48 * s)],
                  fill=255)
        d.ellipse([(cx - w * 0.135) * s, h * 0.04 * s, (cx + w * 0.135) * s, h * 0.2 * s], fill=255)
    hm = mask_layer(w, h, hair)
    n = fbm((w, h), 20, 4, seed)
    dress = np.ones((h, w, 3), np.float32) * hex2rgb('#e8ece8') * (0.75 + 0.3 * n[..., None])
    yy = np.linspace(0, 1, h)[:, None, None]
    dress *= 0.75 + 0.35 * (1 - yy)
    strands = blur_dir(fbm((w, h), (60, 3), 3, seed + 1), 20, axis=0)
    hairc = hex2rgb('#0b0a0c') * (0.6 + 0.8 * strands[..., None])
    rgb = dress * (1 - hm[..., None]) + hairc * hm[..., None]
    a = np.maximum(body, hm)
    glow = blur(a, w * 0.04, wrap=False)
    return np.concatenate([rgb, a[..., None]], -1), glow


def bust(w, h, shirt='#e8e8e2', skin='#b88a68', hair='#1a1614', seed=3, smile=True):
    """Painted portrait bust (generic, not a real person), RGBA."""
    def sh(d, s):
        d.ellipse([w * 0.08 * s, h * 0.62 * s, w * 0.92 * s, h * 1.35 * s], fill=255)
    def hd(d, s):
        d.ellipse([w * 0.3 * s, h * 0.14 * s, w * 0.7 * s, h * 0.62 * s], fill=255)
        d.rectangle([w * 0.42 * s, h * 0.5 * s, w * 0.58 * s, h * 0.7 * s], fill=255)
    def hr(d, s):
        d.chord([w * 0.28 * s, h * 0.1 * s, w * 0.72 * s, h * 0.5 * s], 180, 360, fill=255)
    m_sh, m_hd, m_hr = mask_layer(w, h, sh), mask_layer(w, h, hd), mask_layer(w, h, hr)
    n = fbm((w, h), 12, 4, seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    light = np.clip(1.1 - (xx / w - 0.35) ** 2 * 2.5, 0.55, 1.1)[..., None]
    rgb = np.zeros((h, w, 3), np.float32)
    rgb = rgb * 0 + hex2rgb(shirt) * light * (0.85 + 0.2 * n[..., None])
    skin_c = hex2rgb(skin) * light * (0.9 + 0.15 * n[..., None])
    rgb = rgb * (1 - m_hd[..., None]) + skin_c * m_hd[..., None]
    rgb = rgb * (1 - m_hr[..., None]) + hex2rgb(hair) * (0.8 + 0.4 * n[..., None]) * m_hr[..., None]
    # simple painted features: eye shadows + mouth line (generic)
    def feat(d, s):
        for ex in (0.42, 0.58):
            d.ellipse([(w * ex - w * 0.03) * s, h * 0.36 * s, (w * ex + w * 0.03) * s, h * 0.39 * s], fill=255)
        if smile:
            d.arc([w * 0.43 * s, h * 0.43 * s, w * 0.57 * s, h * 0.52 * s], 20, 160, fill=255, width=int(3 * s))
    fm = mask_layer(w, h, feat) * m_hd
    rgb = rgb * (1 - fm[..., None] * 0.65)
    a = np.clip(m_sh + m_hd + m_hr, 0, 1)
    return np.concatenate([rgb, a[..., None]], -1)


def seated_buddha(w, h, color='#d8a840'):
    """Respectful simplified seated Buddha silhouette with halo, RGBA (gold)."""
    def f(d, s):
        cx = w / 2
        d.ellipse([(cx - w * 0.38) * s, h * 0.72 * s, (cx + w * 0.38) * s, h * 0.98 * s], fill=255)  # crossed legs
        d.polygon([((cx - w * 0.22) * s, h * 0.42 * s), ((cx + w * 0.22) * s, h * 0.42 * s), ((cx + w * 0.3) * s, h * 0.82 * s),
                   ((cx - w * 0.3) * s, h * 0.82 * s)], fill=255)  # body
        d.ellipse([(cx - w * 0.12) * s, h * 0.2 * s, (cx + w * 0.12) * s, h * 0.42 * s], fill=255)  # head
        d.polygon([(cx * s, h * 0.06 * s), ((cx + w * 0.04) * s, h * 0.22 * s), ((cx - w * 0.04) * s, h * 0.22 * s)], fill=255)  # flame
    m = mask_layer(w, h, f)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    sh = np.clip(1.15 - ((xx / w - 0.4) ** 2 + (yy / h - 0.4) ** 2) * 1.6, 0.55, 1.2)
    rgb = hex2rgb(color) * sh[..., None]
    try:
        foil = load('acg_Foil002', 'color', None)
        foil = cv2.resize(foil, (w, h))
        rgb = rgb * (0.75 + 0.5 * lum(foil)[..., None])
    except Exception:
        pass
    return np.concatenate([rgb, m[..., None]], -1)


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


def poster_movie(seed):
    W, H = 640, 896
    D = Doc(W, H, '#0e1414')
    plate = photo_plate('ph_narrow_moonlit_road', (0.42, 0.38, 0.58, 0.62), (W, int(H * 0.72)),
                        lambda a: saturate(a, 0.25) * hex2rgb('#7fa29a') * 0.9)
    D.paste(plate, 0, 0, W, H * 0.72)
    D.gradient(0, H * 0.55, W, H * 0.72, '#0e1414', '#0e1414')
    g, glow = ghost_woman(260, 420, seed)
    gl = np.concatenate([np.ones((420, 260, 3)) * hex2rgb('#cfe8dc'), (glow * 0.8)[..., None]], -1)
    D.paste(gl, W * 0.5 - 130, H * 0.2, W * 0.5 + 130, H * 0.2 + 420)
    D.paste(g, W * 0.5 - 130, H * 0.2, W * 0.5 + 130, H * 0.2 + 420)
    D.text('วิญญาณ', W / 2, H * 0.12, 96, '#c81e1e', stroke=3, stroke_color='#2a0606', shadow=(4, 5, '#000000'))
    D.text('ริมทางโค้ง', W / 2, H * 0.215, 70, '#e8d8b0', stroke=2, stroke_color='#1a0a06', shadow=(3, 4, '#000000'))
    D.text('"อย่าจอด... ถ้าเธอโบกเรียก"', W / 2, H * 0.76, 34, '#e8e0c8')
    D.text('นำแสดงโดย  ดวงใจ ศรีราตรี · ประเสริฐ ใจกล้า · สมบัติ ทองดี', W / 2, H * 0.83, 22, '#c8c0a8', max_w=W - 60)
    D.text('ฉายพร้อมกันทั่วประเทศ ๑๓ เมษายน', W / 2, H * 0.885, 30, '#e8b020')
    D.text('มังกรพุก ภาพยนตร์  เสนอ', W / 2, H * 0.94, 22, '#a8a090')
    return D.finish(), dict(paper='cream', halftone=3.4, misreg=1.6, sun=0.55, folds=(1, 2), water=0.35, mould=0.25,
                            tape=((0.08, 0.04, -20), (0.92, 0.05, 18)), tear=0.3)


def poster_movie2(seed):
    W, H = 640, 896
    D = Doc(W, H, '#1a120c')
    plate = photo_plate('ph_rainforest_trail', (0.44, 0.34, 0.6, 0.66), (W, int(H * 0.7)),
                        lambda a: saturate(a, 0.6) * hex2rgb('#d8b080') * 0.95)
    D.paste(plate, 0, H * 0.12, W, H * 0.82)
    D.rect(0, 0, W, H * 0.13, fill='#e8c060')
    D.text('ทุ่งร้าง นางคอยรัก', W / 2, H * 0.068, 64, '#8a1010', stroke=2, stroke_color='#3a0606')
    b = bust(300, 360, shirt='#6a3a20', skin='#c09070', seed=seed + 2)
    D.paste(b, W * 0.08, H * 0.4, W * 0.08 + 300, H * 0.4 + 360)
    b2 = bust(260, 320, shirt='#e8d8c0', skin='#d0a080', hair='#140e0a', seed=seed + 5)
    D.paste(b2, W * 0.55, H * 0.48, W * 0.55 + 260, H * 0.48 + 320)
    D.rect(0, H * 0.82, W, H, fill='#e8c060')
    D.text('ภาพยนตร์ไทย สี ๓๕ มม.  เสียงในฟิล์ม', W / 2, H * 0.855, 28, '#3a1a0a')
    D.text('บุญเลิศ ทองคำ · จันทร์เพ็ญ ดาวเหนือ · ยอดชาย มีสุข', W / 2, H * 0.9, 24, '#3a1a0a', max_w=W - 50)
    D.text('ตั้งแต่วันนี้ ที่ โรงภาพยนตร์ มารวยรามา', W / 2, H * 0.95, 26, '#8a1010')
    return D.finish(), dict(paper='cream', halftone=3.6, misreg=2.0, sun=0.7, folds=(1, 1), water=0.2, mould=0.15,
                            tape=((0.5, 0.02, 2),), tear=0.15)


def poster_concert(seed):
    W, H = 640, 896
    D = Doc(W, H, '#f0e2b8')
    D.sunburst(W / 2, H * 0.38, W * 0.9, 28, '#e86a1a', '#f0b030')
    D.ellipse(W / 2, H * 0.38, W * 0.3, W * 0.3, fill='#b8121a')
    b = bust(300, 330, shirt='#e8c040', skin='#c89068', seed=seed + 7)
    D.paste(b, W / 2 - 150, H * 0.2, W / 2 + 150, H * 0.2 + 330)
    D.rect(0, 0, W, H * 0.11, fill='#1a3a8a')
    D.text('คอนเสิร์ตลูกทุ่ง มหกรรมความบันเทิง', W / 2, H * 0.055, 36, '#f8e8a0', max_w=W - 40)
    D.text('สมาน เสียงทอง', W / 2, H * 0.635, 82, '#b8121a', stroke=3, stroke_color='#f8f0d0', shadow=(3, 4, '#3a0a0a'))
    D.text('พร้อมหางเครื่องเต็มวง  ดาวรุ่ง ซาวด์', W / 2, H * 0.715, 32, '#1a3a8a')
    D.rect(30, H * 0.75, W - 30, H * 0.87, fill='#1a3a8a', r=12)
    D.text('คืนวันเสาร์ที่ ๑๒  ณ ลานวัดมารวย', W / 2, H * 0.785, 34, '#f8e8a0')
    D.text('บัตรราคา ๘๐ บาท  เด็กต่ำกว่า ๑๒ ปี เข้าฟรี', W / 2, H * 0.835, 26, '#ffffff')
    D.text('งานประจำปี พ.ศ. ๒๕๒๖', W / 2, H * 0.92, 30, '#3a2a10')
    return D.finish(), dict(paper='white', halftone=3.2, misreg=1.8, sun=0.6, folds=(0, 2), water=0.25, mould=0.2,
                            tape=((0.1, 0.03, -12), (0.9, 0.97, 15)), tear=0.2)


def poster_missing(seed):
    """Photocopied missing-child appeal for Boy M (portrait painted, toner-burned, not a real child)."""
    W, H = 640, 896
    D = Doc(W, H, '#f4f2ec')
    D.text('ประกาศ! เด็กหาย', W / 2, H * 0.08, 76, '#111111', stroke=1)
    D.rect(W * 0.2, H * 0.14, W * 0.8, H * 0.52, fill='#d8d8d0', outline='#111111', width=3)
    b = bust(384, 340, shirt='#f0f0ea', skin='#a88068', hair='#121212', seed=seed + 9, smile=False)
    # photocopy: high contrast greyscale, toner noise
    g = lum(b[..., :3])
    g = np.clip((g - 0.35) * 2.2 + 0.5, 0, 1)
    b = np.concatenate([np.repeat(g[..., None], 3, 2), b[..., 3:]], -1)
    D.paste(b, W * 0.2, H * 0.16, W * 0.8, H * 0.52)
    D.text('ด.ช. เอ็ม  อายุ ๙ ขวบ', W / 2, H * 0.585, 50, '#111111')
    D.lines(['หายตัวไปเย็นวันศุกร์ หลังเลิกเรียน', 'บริเวณป้ายรถเมล์ กม.๑๑',
             'สวมชุดนักเรียน เสื้อขาว กางเกงขาสั้นสีน้ำเงิน', 'สะพายกระเป๋านักเรียนสีแดง'],
            W / 2, H * 0.65, 30, '#151515', weight=700, lh=1.35, anchor='mm', max_w=W - 60)
    D.rect(30, H * 0.83, W - 30, H * 0.93, outline='#111111', width=3)
    D.text('ใครพบเห็น กรุณาแจ้งแม่ด้วย', W / 2, H * 0.857, 34, '#111111')
    D.text('โทร ๐๘๙-๔๔๔-๐๔๔๔', W / 2, H * 0.905, 40, '#111111')
    D.text('แม่รออยู่ที่ป้ายรถเมล์ทุกเย็น', W / 2, H * 0.96, 26, '#333333')
    img = D.finish()
    L = lum(img)
    toner = np.clip((L - 0.5) * 1.5 + 0.55, 0, 1)
    toner = toner * (0.92 + 0.12 * fbm((W, H), 90, 3, seed))
    return np.repeat(toner[..., None], 3, 2), dict(paper='white', halftone=0, sun=0.45, folds=(1, 1), water=0.45,
                                                   mould=0.15, tape=((0.06, 0.03, -25), (0.94, 0.03, 25), (0.5, 0.98, 3)),
                                                   tear=0.0, streaks=0.5)


def poster_temple_fair(seed):
    W, H = 640, 896
    D = Doc(W, H, '#f6e8c8')
    D.gradient(0, 0, W, H * 0.55, '#2a1050', '#c8402a')
    for i in range(40):
        rng = np.random.default_rng(seed + i)
        D.ellipse(rng.random() * W, rng.random() * H * 0.45, 3, 3, fill='#f8e8a0')
    # temple roof silhouette (layered gables) + ferris wheel
    D.poly([(W * 0.08, H * 0.55), (W * 0.3, H * 0.3), (W * 0.52, H * 0.55)], fill='#1a0c10')
    D.poly([(W * 0.14, H * 0.55), (W * 0.3, H * 0.36), (W * 0.46, H * 0.55)], fill='#c89a30')
    D.poly([(W * 0.22, H * 0.38), (W * 0.3, H * 0.22), (W * 0.38, H * 0.38)], fill='#1a0c10')
    D.ellipse(W * 0.74, H * 0.36, W * 0.17, W * 0.17, outline='#f8e8a0', width=4)
    for k in range(10):
        a = k / 10 * math.tau
        D.line([(W * 0.74, H * 0.36), (W * 0.74 + math.cos(a) * W * 0.17, H * 0.36 + math.sin(a) * W * 0.17)], '#f8e8a0', 2)
        D.ellipse(W * 0.74 + math.cos(a) * W * 0.17, H * 0.36 + math.sin(a) * W * 0.17, 9, 7, fill='#e83a2a')
    D.text('งานประจำปี วัดมารวย', W / 2, H * 0.1, 58, '#f8e8a0', stroke=2, stroke_color='#2a0a10')
    D.text('๙ วัน ๙ คืน', W / 2, H * 0.18, 48, '#ffd040', stroke=2, stroke_color='#2a0a10')
    D.rect(0, H * 0.55, W, H, fill='#f6e8c8')
    D.lines(['ปิดทองไหว้พระ  สรงน้ำหลวงพ่อ', 'ลิเกคณะ ดาวเรือง  หนังกลางแปลง', 'ชิงช้าสวรรค์  ม้าหมุน  ปาเป้า',
             'ประกวดนางนพมาศ  ซุ้มอาหารมากมาย'], W / 2, H * 0.61, 34, '#5a1a10', anchor='mm', lh=1.4, max_w=W - 60)
    D.text('ขอเชิญชวนพุทธศาสนิกชนร่วมทำบุญโดยทั่วกัน', W / 2, H * 0.86, 28, '#2a1a10', max_w=W - 50)
    D.text('คณะกรรมการวัดมารวย', W / 2, H * 0.92, 26, '#5a3a20')
    return D.finish(), dict(paper='white', halftone=3.2, misreg=2.2, sun=0.65, folds=(1, 1), water=0.2, mould=0.2,
                            tape=((0.07, 0.04, -15), (0.93, 0.04, 15)), tear=0.25)


def poster_election(seed):
    W, H = 640, 896
    D = Doc(W, H, '#f4f4f0')
    D.rect(0, 0, W, H * 0.16, fill='#0a6a3a')
    D.text('เลือกตั้งนายก อบต.มารวย', W / 2, H * 0.08, 46, '#ffffff', max_w=W - 40)
    D.ellipse(W * 0.82, H * 0.3, 80, 80, fill='#e8b020')
    D.text('เบอร์', W * 0.82, H * 0.255, 30, '#0a3a1a')
    D.text('๓', W * 0.82, H * 0.32, 96, '#0a3a1a')
    b = bust(360, 440, shirt='#f4f4f0', skin='#b88a68', seed=seed + 13)
    D.paste(b, W * 0.06, H * 0.17, W * 0.06 + 360, H * 0.17 + 440)
    D.rect(0, H * 0.66, W, H, fill='#0a6a3a')
    D.text('นายประสิทธิ์ ใจซื่อ', W / 2, H * 0.72, 56, '#ffffff', stroke=1)
    D.text('ซื่อสัตย์  ทำงานจริง  เพื่อบ้านเรา', W / 2, H * 0.8, 36, '#f8e070')
    D.text('ถนนดี ไฟสว่าง ทางโค้งปลอดภัย', W / 2, H * 0.86, 30, '#e8f0e8')
    D.text('กาเบอร์ ๓  วันอาทิตย์ที่ ๗', W / 2, H * 0.93, 34, '#ffffff')
    return D.finish(), dict(paper='white', halftone=3.0, misreg=1.2, sun=0.5, folds=(0, 0), water=0.3, mould=0.15,
                            tape=(), tear=0.35, streaks=0.4)


def poster_lottery(seed):
    W, H = 640, 896
    D = Doc(W, H, '#fff4d8')
    D.sunburst(W / 2, H * 0.42, W, 32, '#f8d030', '#f8e890')
    D.rect(0, 0, W, H * 0.14, fill='#c8141a')
    D.text('ลอตเตอรี่ ร้านเฮงเฮง', W / 2, H * 0.07, 56, '#ffe060', stroke=2, stroke_color='#5a0606')
    D.text('งวดนี้ เลขเด็ด!', W / 2, H * 0.22, 64, '#c8141a', stroke=2, stroke_color='#ffffff')
    for i, n in enumerate(('๔๔', '๐๙', '๑๑')):
        x = W * (0.22 + i * 0.28)
        D.ellipse(x, H * 0.38, 76, 76, fill='#c8141a', outline='#ffe060', width=5)
        D.text(n, x, H * 0.385, 72, '#ffffff')
    D.text('ขายส่ง - ขายปลีก  คู่ละ ๘๐', W / 2, H * 0.55, 36, '#5a1a10')
    D.text('รับซื้อ แลกเปลี่ยนสลากถูกรางวัล', W / 2, H * 0.61, 32, '#5a1a10')
    D.rect(40, H * 0.67, W - 40, H * 0.86, fill='#ffffff', outline='#c8141a', width=4, r=10)
    D.text('รวยแน่ ถ้าไม่มองหลัง', W / 2, H * 0.73, 44, '#0a4a2a')
    D.text('เปิดทุกวัน ๘ โมงเช้า ถึง ๓ ทุ่ม', W / 2, H * 0.8, 30, '#333333')
    D.text('ข้างร้านก๋วยเตี๋ยว กม.๗', W / 2, H * 0.93, 30, '#5a1a10')
    return D.finish(), dict(paper='white', halftone=3.0, misreg=1.6, sun=0.6, folds=(0, 1), water=0.15, mould=0.1,
                            tape=((0.5, 0.02, 0),), tear=0.1)


def poster_drink(seed):
    W, H = 640, 896
    D = Doc(W, H, '#e8f0f0')
    D.gradient(0, 0, W, H, '#f8f0d8', '#e86a3a')
    D.text('น้ำแดง ม้าเหลือง', W / 2, H * 0.1, 66, '#b8121a', stroke=2, stroke_color='#ffffff')
    D.text('สดชื่น ชื่นใจ ทุกเวลา', W / 2, H * 0.19, 38, '#3a1a0a')
    # bottle illustration
    D.rect(W * 0.4, H * 0.3, W * 0.6, H * 0.78, fill='#b8121a', r=30)
    D.rect(W * 0.46, H * 0.22, W * 0.54, H * 0.32, fill='#b8121a')
    D.rect(W * 0.455, H * 0.205, W * 0.545, H * 0.225, fill='#c8a030')
    D.rect(W * 0.41, H * 0.45, W * 0.59, H * 0.6, fill='#f8e060')
    D.text('ม้าเหลือง', W / 2, H * 0.525, 26, '#b8121a', max_w=W * 0.17)
    D.ellipse(W * 0.47, H * 0.38, 10, 40, fill='#e86060')
    D.text('ขวดละ ๕ บาท', W / 2, H * 0.86, 50, '#ffffff', stroke=2, stroke_color='#5a0a06')
    return D.finish(), dict(paper='white', halftone=3.2, misreg=1.4, sun=0.75, folds=(0, 0), water=0.1, mould=0.1,
                            tape=(), tear=0.2, rust_spots=0.0)


def poster_balm(seed):
    W, H = 640, 896
    D = Doc(W, H, '#0a4a2a')
    D.sunburst(W / 2, H * 0.4, W * 0.8, 20, '#0a5a32', '#0a4a2a')
    D.text('ยาหม่อง ตรางูเขียว', W / 2, H * 0.1, 60, '#f8e070', stroke=2, stroke_color='#062a14')
    D.ellipse(W / 2, H * 0.42, 150, 150, fill='#e8d8a0', outline='#c89a30', width=8)
    D.ellipse(W / 2, H * 0.42, 118, 118, fill='#0a6a3a')
    D.line([(W * 0.4, H * 0.48), (W * 0.45, H * 0.36), (W * 0.52, H * 0.46), (W * 0.58, H * 0.34)], '#9ad070', 16)
    D.text('แก้ปวดเมื่อย วิงเวียน แมลงกัดต่อย', W / 2, H * 0.68, 32, '#ffffff', max_w=W - 50)
    D.text('ติดรถไว้ อุ่นใจทุกเส้นทาง', W / 2, H * 0.76, 36, '#f8e070')
    D.text('มีขายตามร้านค้าทั่วไป', W / 2, H * 0.9, 30, '#d8e8d0')
    return D.finish(), dict(paper='white', halftone=3.4, misreg=1.8, sun=0.6, folds=(1, 0), water=0.2, mould=0.25,
                            tape=((0.5, 0.03, -3),), tear=0.2)


# ----------------------------------------------------------------------------- calendars, cards, paper
def buddha_calendar(seed, month=10, year=2526):
    W, H = 512, 768
    D = Doc(W, H, '#f4ead4')
    D.gradient(0, 0, W, H * 0.6, '#5a0a0a', '#a81a10')
    D.ellipse(W / 2, H * 0.27, 150, 150, fill='#e8b840')
    D.ellipse(W / 2, H * 0.27, 140, 140, fill='#f8d878')
    D.paste(seated_buddha(260, 320), W / 2 - 130, H * 0.08, W / 2 + 130, H * 0.08 + 320)
    D.text('ขอให้มีความสุขตลอดปี', W / 2, H * 0.535, 34, '#f8e070')
    months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน',
              'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
    D.text(f'{months[month]}  พ.ศ. {thd(year)}', W / 2, H * 0.635, 34, '#7a1010')
    days = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
    for i, dname in enumerate(days):
        D.text(dname, W * (0.1 + i * 0.13), H * 0.69, 22, '#b81a10' if i == 0 else '#333333')
    start = (month * 3 + year) % 7
    for d in range(31):
        k = d + start
        x, y = W * (0.1 + (k % 7) * 0.13), H * (0.735 + (k // 7) * 0.05)
        D.text(thd(d + 1), x, y, 22, '#b81a10' if k % 7 == 0 else '#222222')
    D.text('ร้านทองเยาวราช แม่จิตร  ขอมอบ', W / 2, H * 0.975, 18, '#5a3a20')
    return D.finish(), dict(paper='cream', halftone=2.8, misreg=1.0, sun=0.5, folds=(0, 0), water=0.15, mould=0.2,
                            tape=(), tear=0.0, grime=0.5)


def amulet_card(seed, name='หลวงพ่อมารวย', gen='รุ่นแรก ๒๕๑๙'):
    W, H = 384, 512
    D = Doc(W, H, '#1a1410')
    D.rect(10, 10, W - 10, H - 10, outline='#c8a040', width=4, r=12)
    # amulet tablet: arched clay tablet with relief seated figure
    D.rect(W * 0.25, H * 0.15, W * 0.75, H * 0.7, fill='#8a7458', r=40)
    rel = seated_buddha(150, 190, color='#a89070')
    D.paste(rel, W * 0.3, H * 0.22, W * 0.3 + 150, H * 0.22 + 190)
    D.text(name, W / 2, H * 0.8, 36, '#e8c860')
    D.text(gen, W / 2, H * 0.88, 26, '#c8b088')
    D.text('สภาพสวย  ผิวเดิม', W / 2, H * 0.95, 20, '#a89068')
    img = D.finish()
    return img, dict(paper='board', halftone=0, solid=True, sun=0.2, grime=0.4, alpha=False, scratch=0.6, gloss=True)


def newspaper(seed, page=1):
    W, H = 768, 1024
    D = Doc(W, H, '#ffffff')
    D.text('ข่าวราตรี', W * 0.3, 52, 76, '#111111')
    D.text('ฉบับวันศุกร์ที่ ๑๔ กรกฎาคม  ราคา ๑๐ บาท', W * 0.76, 40, 18, '#222222')
    D.text('หนังสือพิมพ์รายวัน เพื่อคนต่างจังหวัด', W * 0.76, 68, 18, '#222222')
    D.rect(20, 96, W - 20, 100, fill='#111111')
    if page == 1:
        D.text('สยอง! แท็กซี่เขียวเหลืองพลิกคว่ำ โค้ง กม.๙', W / 2, 140, 40, '#111111', max_w=W - 40)
        D.text('คนขับดับคาที่ ชาวบ้านลือ "ผีโค้งร้อยศพ" ทวงชีวิตที่ ๑๐๐', W / 2, 186, 28, '#c81414', max_w=W - 40)
        plate = photo_plate('ph_narrow_moonlit_road', (0.45, 0.4, 0.56, 0.6), (int(W * 0.58), 340),
                            lambda a: np.repeat(lum(a)[..., None], 3, 2) * 1.2)
        D.paste(plate, 20, 215, 20 + W * 0.58, 555)
        D.text('ภาพ: จุดเกิดเหตุ ทางโค้งก่อนถึงศาลเจ้ามารวย', 20 + W * 0.29, 572, 16, '#333333')
        body = ('เมื่อคืนวันพุธ เวลาประมาณ ๐๔.๓๐ น. ร้อยเวรรับแจ้งเหตุรถแท็กซี่สีเขียวเหลืองเสียหลักพลิกคว่ำ '
                'ตกข้างทางบริเวณโค้ง กม.๙ ถนนสายมารวย ทราบชื่อคนขับคือ นายสมชาย อายุ ๕๔ ปี '
                'เสียชีวิตคาที่ ชาวบ้านละแวกนั้นเล่าว่า คืนก่อนเกิดเหตุเห็นผู้หญิงชุดขาวยืนโบกรถอยู่ริมโค้ง '
                'ขณะที่ฝนตกหนัก พระในวัดใกล้เคียงได้นิมนต์มาทำพิธีบังสุกุลให้ผู้เสียชีวิตแล้ว ')
        col_x = [20 + W * 0.6, 20]
        _column(D, body * 2, col_x[0], 220, W * 0.36, 17, 32)
        _column(D, body * 3, 20, 600, W * 0.45, 17, 22)
        D.rect(W * 0.5, 600, W - 20, 990, outline='#111111', width=2)
        D.text('ผลสลากกินแบ่ง', W * 0.75, 630, 30, '#111111')
        for i, (lab, num) in enumerate((('รางวัลที่ ๑', '๔๔๗๐๙๔'), ('เลขท้าย ๒ ตัว', '๐๙'), ('เลขหน้า ๓ ตัว', '๔๔๔  ๑๑๙'))):
            D.text(lab, W * 0.75, 690 + i * 100, 22, '#333333')
            D.text(num, W * 0.75, 730 + i * 100, 44, '#111111')
    else:
        D.text('ประกาศ - รับสมัครงาน - ของหาย', W / 2, 140, 36, '#111111')
        ads = ['รับคนขับกะดึก ติดต่ออากง อู่ กม.๙', 'ขายรถกระบะมือสอง สภาพดี โทร ๐๘๑-๙๐๙-๔๔๐๔',
               'ตามหาสุนัขพันธุ์ไทย สีน้ำตาล ชื่อเจ้าโชค', 'รับดูดวง แก้กรรม ทางโค้ง ไม่รับเงินก่อน',
               'ห้องเช่าราคาถูก ใกล้ตลาดมารวย', 'รับซ่อมวิทยุ เทป ทีวี ร้านช่างแดง', 'ด.ช. เอ็ม หายตัว ใครพบเห็นโปรดแจ้ง']
        for i, a in enumerate(ads):
            x0 = 20 + (i % 2) * (W - 40) / 2
            y0 = 180 + (i // 2) * 200
            D.rect(x0 + 4, y0, x0 + (W - 40) / 2 - 4, y0 + 188, outline='#111111', width=2)
            D.text(a, x0 + (W - 40) / 4, y0 + 40, 22, '#111111', max_w=(W - 40) / 2 - 24)
            _column(D, 'ติดต่อด้วยตนเอง ทุกวัน ไม่เว้นวันหยุด เงื่อนไขเป็นไปตามที่ตกลง ', x0 + 14, y0 + 80, (W - 40) / 2 - 28, 15, 5)
    img = D.finish()
    return img, dict(paper='cream', halftone=2.6, misreg=0.8, sun=0.75, folds=(1, 1), water=0.3, mould=0.15,
                     tape=(), tear=0.15, newsprint=True)


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


def noodle_menu(seed):
    W, H = 640, 896
    D = Doc(W, H, '#e8dcc0')
    D.rect(0, 0, W, H * 0.16, fill='#a81a10')
    D.text('ก๋วยเตี๋ยวเรือ เจ๊หมวย', W / 2, H * 0.08, 56, '#f8e8a0', stroke=1, stroke_color='#3a0606')
    items = [('เส้นเล็ก น้ำตก', '๔๐'), ('เส้นใหญ่ ต้มยำ', '๔๐'), ('บะหมี่ เย็นตาโฟ', '๔๐'), ('เกาเหลา หมูตุ๋น', '๕๐'),
             ('ข้าวขาหมู', '๔๕'), ('ไข่ต้ม', '๑๐'), ('น้ำเปล่า', '๑๐'), ('ชาดำเย็น โอเลี้ยง', '๑๕')]
    for i, (n, p) in enumerate(items):
        y = H * (0.22 + i * 0.085)
        D.text(n, 50, y, 40, '#1a2a5a', 700, 'lm', max_w=W * 0.6)
        D.text(p + ' .-', W - 50, y, 42, '#a81a10', 700, 'rm')
        D.line([(W * 0.62, y + 12), (W * 0.78, y + 12)], '#8a8070', 2)
    D.text('พิเศษ เพิ่ม ๑๐ บาท', W / 2, H * 0.93, 32, '#3a3a3a')
    return D.finish(), dict(paper='board', halftone=0, solid=True, sun=0.4, folds=(0, 0), water=0.2, mould=0.1,
                            grime=0.7, streaks=0.6, alpha=False)


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


def lottery_ticket(seed):
    W, H = 640, 320
    D = Doc(W, H, '#e8f0f8')
    D.gradient(0, 0, W, H, '#d8e8f8', '#f0e0f0')
    for i in range(14):
        D.line([(0, i * 24), (W, i * 24 + 40)], '#c8d8f0', 2)
    D.text('สลากการกุศล งานวัดมารวย', W * 0.45, 40, 30, '#1a2a6a')
    D.text('เลขที่', W * 0.12, 120, 26, '#333333')
    D.text('๐ ๙ ๔ ๔ ๗ ๐', W * 0.45, 125, 64, '#a81a10')
    D.text('ราคา ๘๐ บาท', W * 0.82, 120, 26, '#1a2a6a')
    D.text('ออกรางวัล วันที่ ๑๖ ณ ศาลาวัด', W * 0.45, 210, 24, '#333333')
    D.text('ทุกบาทได้บุญ', W * 0.45, 260, 30, '#0a5a2a')
    D.ellipse(W * 0.88, H * 0.72, 46, 46, outline='#a81a10', width=3)
    D.text('ทำบุญ', W * 0.88, H * 0.72, 20, '#a81a10', rot=-15)
    return D.finish(), dict(paper='white', halftone=2.4, misreg=0.8, sun=0.3, folds=(1, 0), water=0.1, crumple=0.4,
                            tear=0.0, grime=0.3)


# ----------------------------------------------------------------------------- packaging
def snack_bag(seed, variant='corn'):
    W, H = 448, 640
    spec = {'corn': ('ข้าวโพดอบกรอบ', 'กรุบกรอบ', 'รสบาร์บีคิว', '#e8301a', '#f8c020'),
            'prawn': ('ข้าวเกรียบกุ้ง', 'ตราปลาทอง', 'อบกรอบ หอมกุ้ง', '#1a6ac8', '#f8a0a0'),
            'squid': ('ปลาหมึกอบ', 'ทะเลทอง', 'รสเผ็ด', '#1a1a3a', '#e8b020')}[variant]
    D = Doc(W, H, spec[3])
    D.sunburst(W / 2, H * 0.55, W, 24, spec[3], spec[4])
    D.rect(0, 0, W, 40, fill='#c8c8c8')
    D.rect(0, H - 40, W, H, fill='#c8c8c8')
    for x in range(0, W, 12):
        D.line([(x, 0), (x + 6, 40)], '#a8a8a8', 2)
        D.line([(x, H - 40), (x + 6, H)], '#a8a8a8', 2)
    D.text(spec[1], W / 2, H * 0.17, 64, '#ffffff', stroke=3, stroke_color='#2a0a06', shadow=(3, 4, '#2a0a06'))
    D.ellipse(W / 2, H * 0.55, 150, 110, fill=spec[4])
    for i in range(18):
        r = np.random.default_rng(seed + i)
        D.ellipse(W / 2 + (r.random() - 0.5) * 220, H * 0.55 + (r.random() - 0.5) * 140, 28, 16, fill='#f8d060' if variant == 'corn' else '#f8e8d0', outline='#c89030', width=2)
    D.text(spec[0], W / 2, H * 0.8, 44, '#ffffff', stroke=2, stroke_color='#2a0a06', max_w=W - 40)
    D.text(spec[2], W / 2, H * 0.87, 30, '#fff8c0')
    D.text('น้ำหนักสุทธิ ๓๐ กรัม', W / 2, H * 0.91, 18, '#ffffff')
    return D.finish(), dict(paper='white', halftone=2.6, misreg=0.6, sun=0.25, crumple=0.9, grime=0.3, alpha=True,
                            gloss=True, edge_wear=0.1)


def noodle_cup(seed, variant='tomyum'):
    W, H = 768, 256
    spec = {'tomyum': ('ต้มยำกุ้ง', '#d8201a'), 'pork': ('หมูสับ', '#e89020')}[variant]
    D = Doc(W, H, '#f8f4e8')
    D.rect(0, 0, W, 60, fill=spec[1])
    D.text('เส้นเร็ว  บะหมี่กึ่งสำเร็จรูป ชนิดถ้วย', W / 2, 32, 30, '#ffffff', max_w=W - 30)
    D.text('เส้นเร็ว', W * 0.25, 140, 72, spec[1], stroke=2, stroke_color='#3a0a06')
    D.text('รส' + spec[0], W * 0.25, 210, 36, '#3a1a0a')
    D.ellipse(W * 0.66, 150, 130, 70, fill='#f0e8d0', outline='#8a6a40', width=3)
    for i in range(14):
        D.line([(W * 0.56 + i * 14, 130), (W * 0.58 + i * 13, 180)], '#e8c060', 4)
    D.ellipse(W * 0.62, 125, 22, 12, fill='#f08070')
    D.ellipse(W * 0.72, 140, 20, 10, fill='#3a8a3a')
    D.text('เติมน้ำร้อน ๓ นาที', W * 0.9, 200, 22, '#3a1a0a', max_w=W * 0.18)
    return D.finish(), dict(paper='white', halftone=2.4, misreg=0.6, sun=0.2, grime=0.35, alpha=False, gloss=True,
                            crumple=0.2)


def drink_label(seed, variant='energy'):
    W, H = 768, 288
    spec = {'energy': ('แรงม้า ๙๙', 'เครื่องดื่มบำรุงกำลัง', '#1a1a1a', '#f0c020', '#c81a10'),
            'energy_red': ('ช้างพลัง', 'เครื่องดื่มชูกำลัง สูตรเข้มข้น', '#8a0a0a', '#f8e060', '#ffffff'),
            'soda_red': ('น้ำแดง ม้าเหลือง', 'กลิ่นสละ  น้ำหวานอัดลม', '#c8141a', '#ffffff', '#f8e060'),
            'soda_green': ('น้ำเขียว ม้าเหลือง', 'กลิ่นครีมโซดา', '#1a8a3a', '#ffffff', '#f8e060')}[variant]
    D = Doc(W, H, spec[2])
    D.sunburst(W * 0.5, H * 0.5, W * 0.6, 26, spec[2], spec[4] if variant.startswith('energy') else spec[2])
    D.rect(0, 0, W, 26, fill=spec[3])
    D.rect(0, H - 26, W, H, fill=spec[3])
    D.ellipse(W * 0.5, H * 0.5, 210, 105, fill=spec[3])
    D.text(spec[0], W * 0.5, H * 0.47, 64, spec[2], stroke=1)
    D.text(spec[1], W * 0.5, H * 0.67, 24, spec[2], max_w=380)
    D.text('ปริมาณสุทธิ ๑๕๐ มล.', W * 0.12, H * 0.5, 20, spec[3], rot=90)
    D.text('เก็บในที่เย็น', W * 0.88, H * 0.5, 20, spec[3], rot=90)
    return D.finish(), dict(paper='white', halftone=2.2, misreg=0.5, sun=0.35, grime=0.4, alpha=False, gloss=True,
                            water=0.15, streaks=0.4)


def cigarette_pack(seed, variant='plaifah'):
    W, H = 320, 448
    spec = {'plaifah': ('ปลายฟ้า', '#1a3a8a', '#e8e4dc'), 'khwanthian': ('ควันเทียน', '#8a1a14', '#f0e8d8')}[variant]
    D = Doc(W, H, spec[2])
    D.rect(0, 0, W, H * 0.55, fill=spec[1])
    D.poly([(0, H * 0.55), (W / 2, H * 0.4), (W, H * 0.55)], fill=spec[2])
    D.text(spec[0], W / 2, H * 0.2, 56, '#f8f0d8', stroke=1)
    D.text('บุหรี่ซิกาแรต ก้นกรอง ๒๐ มวน', W / 2, H * 0.32, 18, '#e8e0c8', max_w=W - 30)
    # generic text-only health warning box
    D.rect(14, H * 0.58, W - 14, H * 0.96, fill='#111111')
    D.rect(20, H * 0.59, W - 20, H * 0.95, outline='#f8f8f8', width=2)
    D.text('คำเตือน', W / 2, H * 0.65, 34, '#f8e020')
    D.lines(['การสูบบุหรี่', 'เป็นอันตรายต่อสุขภาพ', 'ทำให้เกิดโรคมะเร็งปอด'], W / 2, H * 0.73, 26, '#ffffff', 700, 1.3,
            'mm', max_w=W - 50)
    return D.finish(), dict(paper='board', halftone=2.0, misreg=0.4, sun=0.3, crumple=0.5, grime=0.45, alpha=False,
                            gloss=True)


def betel_pack(seed):
    W, H = 384, 384
    D = Doc(W, H, '#2a6a2a')
    D.rect(16, 16, W - 16, H - 16, outline='#f8e070', width=4, r=16)
    D.ellipse(W / 2, H * 0.42, 100, 90, fill='#3a8a3a', outline='#f8e070', width=3)
    D.poly([(W * 0.42, H * 0.3), (W * 0.62, H * 0.38), (W * 0.5, H * 0.56), (W * 0.36, H * 0.46)], fill='#7ac050')
    D.ellipse(W * 0.58, H * 0.5, 22, 20, fill='#a86030')
    D.text('หมากแห้ง ตรานกแก้ว', W / 2, H * 0.12, 32, '#f8e070', max_w=W - 50)
    D.text('หมากอย่างดี คัดพิเศษ', W / 2, H * 0.72, 28, '#ffffff')
    D.text('พร้อมปูนแดง ยาเส้น', W / 2, H * 0.82, 24, '#f8e070')
    return D.finish(), dict(paper='kraft', halftone=0, solid=True, sun=0.3, crumple=0.6, grime=0.5, alpha=False)


def incense_box(seed):
    W, H = 512, 320
    D = Doc(W, H, '#a81a10')
    D.rect(10, 10, W - 10, H - 10, outline='#f0c040', width=6)
    D.text('ธูปหอม ตราเจ็ดดาว', W / 2, H * 0.24, 46, '#f8e070', stroke=1, stroke_color='#3a0606')
    for i in range(7):
        a = -math.pi / 2 + (i - 3) * 0.32
        D.text('★', W / 2 + math.cos(a) * 120, H * 0.85 + math.sin(a) * 120, 22, '#f8e070')
    D.text('กลิ่นจันทน์ ควันน้อย ไหว้พระ ไหว้เจ้าที่', W / 2, H * 0.48, 24, '#ffffff', max_w=W - 40)
    D.text('บรรจุ ๑๐๐ ดอก', W / 2, H * 0.62, 26, '#f8e070')
    return D.finish(), dict(paper='board', halftone=0, solid=True, sun=0.35, grime=0.5, alpha=False, crumple=0.2,
                            water=0.15)


def candle_pack(seed):
    W, H = 448, 320
    D = Doc(W, H, '#f4f0e4')
    D.rect(0, 0, W, 70, fill='#e8b020')
    D.text('เทียนไข ตราดอกบัว', W / 2, 36, 38, '#7a1010')
    for i in range(6):
        x = W * (0.18 + i * 0.13)
        D.rect(x - 14, 110, x + 14, 260, fill='#f8f4ea', outline='#c8c0b0', width=2)
        D.poly([(x, 86), (x + 8, 104), (x, 112), (x - 8, 104)], fill='#f8a020')
    D.text('เทียนขาว ๖ เล่ม  จุดนาน ไม่หยด', W / 2, H - 34, 24, '#5a3a20')
    return D.finish(), dict(paper='white', halftone=0, solid=True, sun=0.3, crumple=0.7, grime=0.35, alpha=False)


def joss_paper(seed, variant='gold'):
    W, H = 384, 384
    if variant == 'gold':
        base = load('acg_Foil002', 'color', (W, H)) * hex2rgb('#ffd890') * 1.1
        D = Doc(W, H, '#c8a040')
        D.paste(base, W * 0.22, H * 0.22, W * 0.78, H * 0.78)
        D.ellipse(W / 2, H / 2, 46, 46, outline='#a81a10', width=4)
        D.text('บุญ', W / 2, H / 2, 40, '#a81a10')
        D.rect(W * 0.08, H * 0.08, W * 0.92, H * 0.92, outline='#a81a10', width=3)
        img = D.finish()
        return img, dict(paper='kraft', halftone=0, solid=True, sun=0.1, crumple=0.8, grime=0.25, alpha=True,
                         edge_wear=0.8)
    # hell bank note (fictional "ธนาคารโลกวิญญาณ")
    W, H = 640, 320
    D = Doc(W, H, '#e8d8a8')
    D.rect(8, 8, W - 8, H - 8, outline='#1a5a3a', width=6)
    D.rect(20, 20, W - 20, H - 20, outline='#1a5a3a', width=2)
    D.text('ธนาคารโลกวิญญาณ', W * 0.62, 60, 40, '#1a5a3a')
    D.text('๑๐,๐๐๐,๐๐๐', W * 0.62, 150, 64, '#a81a10')
    D.text('ใช้จ่ายได้ในปรโลก', W * 0.62, 220, 26, '#1a5a3a')
    D.ellipse(W * 0.2, H / 2, 95, 110, fill='#d8c890', outline='#1a5a3a', width=4)
    b = bust(160, 190, shirt='#a81a10', skin='#d0b080', hair='#2a2a2a', seed=seed + 21)
    D.paste(b, W * 0.2 - 80, H / 2 - 95, W * 0.2 + 80, H / 2 + 95)
    D.text('๑๐,๐๐๐,๐๐๐', W * 0.1, H - 40, 20, '#1a5a3a')
    return D.finish(), dict(paper='white', halftone=2.6, misreg=1.2, sun=0.2, crumple=0.5, grime=0.3, alpha=True)


def offering_label(seed, variant='spirit'):
    W, H = 384, 256
    if variant == 'spirit':
        D = Doc(W, H, '#f8e8a0')
        D.rect(8, 8, W - 8, H - 8, outline='#a81a10', width=4, r=12)
        D.text('ถวายเจ้าที่เจ้าทาง', W / 2, H * 0.38, 40, '#a81a10')
        D.text('ขอให้เดินทางปลอดภัย', W / 2, H * 0.68, 28, '#3a2a10')
    else:
        D = Doc(W, H, '#ffffff')
        D.rect(8, 8, W - 8, H - 8, outline='#1a3a8a', width=3)
        D.text('ด้วยความอาลัย', W / 2, H * 0.36, 40, '#111111')
        D.text('จากเพื่อนคนขับแท็กซี่ กม.๙', W / 2, H * 0.68, 26, '#333333', max_w=W - 40)
    return D.finish(), dict(paper='white', halftone=0, solid=True, sun=0.4, crumple=0.6, water=0.3, grime=0.4,
                            alpha=True, mould=0.2)


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


def sticker(seed, variant):
    S = 384
    D = Doc(S, S, '#ffffff')
    if variant == 'drive_slow':
        D.rect(0, 0, S, S, fill='#f8e020')
        D.text('ขับช้า ๆ', S / 2, S * 0.36, 86, '#c81a14', stroke=2, stroke_color='#3a0a06')
        D.text('ได้ถึงบ้าน', S / 2, S * 0.64, 64, '#111111')
    elif variant == 'yantra':
        D.rect(0, 0, S, S, fill='#f4ead0')
        D.ellipse(S / 2, S / 2, S * 0.42, S * 0.42, outline='#a81a10', width=6)
        for k in range(8):
            a = k / 8 * math.tau
            D.line([(S / 2, S / 2), (S / 2 + math.cos(a) * S * 0.4, S / 2 + math.sin(a) * S * 0.4)], '#a81a10', 3)
        D.text('นะ โม พุท ธา ยะ', S / 2, S * 0.5, 34, '#a81a10', max_w=S * 0.7)
    elif variant == 'cartoon':
        D.rect(0, 0, S, S, fill='#8ad0f0')
        D.ellipse(S / 2, S * 0.48, S * 0.3, S * 0.28, fill='#f8f0e0', outline='#1a1a1a', width=5)
        D.ellipse(S * 0.4, S * 0.44, 18, 24, fill='#1a1a1a')
        D.ellipse(S * 0.6, S * 0.44, 18, 24, fill='#1a1a1a')
        D.ellipse(S / 2, S * 0.56, 30, 18, fill='#e85050')
        D.ellipse(S * 0.26, S * 0.24, 40, 40, fill='#f8f0e0', outline='#1a1a1a', width=5)
        D.ellipse(S * 0.74, S * 0.24, 40, 40, fill='#f8f0e0', outline='#1a1a1a', width=5)
        D.text('น้องหมีมารวย', S / 2, S * 0.88, 40, '#1a3a8a')
    elif variant == 'lucky':
        D.rect(0, 0, S, S, fill='#c81a14')
        D.text('เลขมงคล', S / 2, S * 0.28, 52, '#f8e070')
        D.text('๙๙๙', S / 2, S * 0.6, 120, '#f8e070', stroke=2, stroke_color='#5a0606')
    elif variant == 'no_smoking':
        D.rect(0, 0, S, S, fill='#ffffff')
        D.ellipse(S / 2, S * 0.42, S * 0.3, S * 0.3, outline='#c81a14', width=22)
        D.rect(S * 0.3, S * 0.4, S * 0.66, S * 0.46, fill='#333333')
        D.rect(S * 0.66, S * 0.4, S * 0.72, S * 0.46, fill='#e86020')
        D.line([(S * 0.3, S * 0.2), (S * 0.7, S * 0.64)], '#c81a14', 22)
        D.text('ห้ามสูบบุหรี่ในรถ', S / 2, S * 0.85, 40, '#111111')
    elif variant == 'merit':
        D.rect(0, 0, S, S, fill='#f8d860')
        D.text('ทำดี ได้ดี', S / 2, S * 0.4, 72, '#7a1010')
        D.text('สาธุ', S / 2, S * 0.68, 64, '#7a1010')
    elif variant == 'meter':
        D.rect(0, 0, S, S, fill='#0a5a2a')
        D.text('TAXI-METER', S / 2, S * 0.36, 56, '#f8f070')
        D.text('กดมิเตอร์ทุกครั้ง', S / 2, S * 0.64, 46, '#ffffff')
    elif variant == 'no_stop':
        D.rect(0, 0, S, S, fill='#111111')
        D.text('ห้ามแวะ', S / 2, S * 0.38, 96, '#f8f8f8')
        D.text('ระหว่างทาง', S / 2, S * 0.66, 56, '#e8c020')
    img = D.finish()
    return img, dict(sticker=True, sun=0.45, grime=0.3, scratch=0.4)


# =======================================================================================
# Catalogue: (kind, variant) -> (designer, physical size m, decal-able, fallback design)
# =======================================================================================
def _cat():
    C = {}

    def add(kind, variant, fn, size, decal=False, fallback=None, shape='rect'):
        C[(kind, variant)] = dict(fn=fn, size=size, decal=decal, fallback=fallback or [kind, {'variant': variant}], shape=shape)
    P = (0.5, 0.7)
    for v, fn in (('movie', poster_movie), ('movie_2', poster_movie2), ('concert', poster_concert),
                  ('missing', poster_missing), ('temple_fair', poster_temple_fair), ('election', poster_election),
                  ('lottery', poster_lottery), ('drink', poster_drink), ('balm', poster_balm)):
        fb = ['poster', {'variant': {'movie_2': 'movie', 'missing': 'movie', 'lottery': 'drink'}.get(v, v)}]
        add('poster', v, fn, P, decal=True, fallback=fb)
    add('calendar', 'buddha', lambda s: buddha_calendar(s, 9, 2526), (0.34, 0.51), fallback=['calendar', {}])
    add('calendar', 'buddha_2', lambda s: buddha_calendar(s + 3, 3, 2527), (0.34, 0.51), fallback=['calendar', {}])
    add('amulet_card', 'luangpho', lambda s: amulet_card(s), (0.064, 0.085), fallback=['buddha_card', {}])
    add('amulet_card', 'phra_somdej', lambda s: amulet_card(s + 1, 'พระสมเด็จ วัดมารวย', 'พิมพ์ใหญ่ เนื้อผง'),
        (0.064, 0.085), fallback=['buddha_card', {}])
    add('newspaper', 'front', lambda s: newspaper(s, 1), (0.38, 0.5), decal=True, fallback=['poster', {'variant': 'movie'}])
    add('newspaper', 'classifieds', lambda s: newspaper(s, 2), (0.38, 0.5), decal=True, fallback=['poster', {'variant': 'drink'}])
    add('noodle_menu', 'board', noodle_menu, (0.75, 1.05), fallback=['noodle_menu', {}])
    add('receipt', 'taxi', lambda s: receipt(s, 'taxi'), (0.058, 0.145), decal=True, fallback=['receipt', {}])
    add('receipt', 'grocery', lambda s: receipt(s, 'grocery'), (0.058, 0.127), decal=True, fallback=['receipt', {}])
    add('fare_chart', 'taxi', fare_chart, (0.16, 0.2), decal=True, fallback=['receipt', {}])
    add('lottery', 'temple', lottery_ticket, (0.18, 0.09), decal=True, fallback=['lottery', {}])
    for v in ('corn', 'prawn', 'squid'):
        add('snack_bag', v, lambda s, v=v: snack_bag(s, v), (0.14, 0.2), decal=True,
            fallback=['snack_wrapper', {'variant': 'chips'}])
    for v in ('tomyum', 'pork'):
        add('noodle_cup', v, lambda s, v=v: noodle_cup(s, v), (0.29, 0.097), fallback=['snack_wrapper', {'variant': 'noodles'}])
    for v in ('energy', 'energy_red', 'soda_red', 'soda_green'):
        add('drink_label', v, lambda s, v=v: drink_label(s, v), (0.17, 0.064),
            fallback=['drink_label', {'variant': 'energy' if v.startswith('energy') else 'red_soda'}])
    for v in ('plaifah', 'khwanthian'):
        add('cigarette_pack', v, lambda s, v=v: cigarette_pack(s, v), (0.055, 0.077), fallback=['snack_wrapper', {'variant': 'candy'}])
    add('betel_pack', 'nokkaew', betel_pack, (0.09, 0.09), fallback=['snack_wrapper', {'variant': 'biscuit'}])
    add('incense_box', 'jetdao', incense_box, (0.2, 0.125), fallback=['snack_wrapper', {'variant': 'biscuit'}])
    add('candle_pack', 'dokbua', candle_pack, (0.17, 0.12), fallback=['snack_wrapper', {'variant': 'candy'}])
    add('joss_paper', 'gold', lambda s: joss_paper(s, 'gold'), (0.11, 0.11), decal=True, fallback=['buddha_card', {}])
    add('joss_paper', 'hell_note', lambda s: joss_paper(s, 'note'), (0.18, 0.09), decal=True, fallback=['lottery', {}])
    add('offering_label', 'spirit', lambda s: offering_label(s, 'spirit'), (0.1, 0.067), decal=True,
        fallback=['shop_sign', {'th': 'ถวายเจ้าที่', 'en': ''}])
    add('offering_label', 'condolence', lambda s: offering_label(s, 'condolence'), (0.1, 0.067), decal=True,
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
        add('sticker', v, lambda s, v=v: sticker(s, v), (0.09, 0.09), decal=True,
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
