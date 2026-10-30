"""Flower atlas (flower_atlas): Thai offering & funeral flowers photobashed from CC0 petal and
flower-head scans (Poly Haven flower models, ambientCG FlowerSet001) with painted overpaint.

Every flower is assembled in 3D: each petal (a real petal scan, recoloured with a luminance-
preserving gradient) has an azimuth and an elevation; the head is then viewed face-on (front
card) or from a three-quarter angle (side card), petals are foreshortened, depth-sorted and
shaded. Wilted variants droop, shrink, brown and lose petals. Satin ribbon tails are painted
over a satin scan.

Layout: 8x8 grid of 256 px cells in a 2048 texture (rows 0-5 flowers, rows 6-7 ribbons 256x512).
The layout is written to src/textures/flowerLayout.js (FLOWER_ATLAS) by build().
"""
import json
import math
import os

import cv2
import numpy as np

from pbcore import blur, decode_normal, fbm, hex2rgb, load, lum, norm01, saturate, sstep, resize_tile, has_map
from foliage import Card, Sprite, rotate_sprite, _crop, lib, squeeze

TAU = math.pi * 2
CELL = 256
RENDER = 512  # cards are composed at 2x then reduced (crisp)
GRID = 8

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

# (name, kind, variant, wilted, colour hint) -> two cells (front, side)
FLOWERS = [
    ('jasmine_bud', 'jasmine', 'bud', False, '#f2efe2'),
    ('jasmine', 'jasmine', 'open', False, '#f4f1e6'),
    ('crown_purple', 'crown_flower', 'purple', False, '#b9a6d6'),
    ('crown_white', 'crown_flower', 'white', False, '#ece8ee'),
    ('marigold', 'marigold', 'orange', False, '#e8901a'),
    ('rose_red', 'rose', 'red', False, '#a3121c'),
    ('rose_white', 'rose', 'white', False, '#efe9de'),
    ('chrys_white', 'chrysanthemum', 'white', False, '#ece9e0'),
    ('chrys_yellow', 'chrysanthemum', 'yellow', False, '#e8c32c'),
    ('frangipani', 'frangipani', 'white', False, '#f2ecd6'),
    ('lotus_bud', 'lotus', 'bud', False, '#e7a3b6'),
    ('lotus', 'lotus', 'open', False, '#efc3cf'),
    ('orchid', 'orchid', 'purple', False, '#b2479a'),
    ('leaves', 'filler', 'leaves', False, '#4f6e33'),
    ('buds', 'filler', 'buds', False, '#6f8a3e'),
    ('jasmine_wilted', 'jasmine', 'open', True, '#b8a47c'),
    ('marigold_wilted', 'marigold', 'orange', True, '#8a5a24'),
    ('rose_red_wilted', 'rose', 'red', True, '#4a1414'),
    ('chrys_white_wilted', 'chrysanthemum', 'white', True, '#a89a7a'),
    ('frangipani_wilted', 'frangipani', 'white', True, '#b09a70'),
    ('chrys_yellow_wilted', 'chrysanthemum', 'yellow', True, '#9a7a34'),
    ('jasmine_bud_wilted', 'jasmine', 'bud', True, '#a8956c'),
    ('lotus_wilted', 'lotus', 'open', True, '#9a6a5a'),
    ('petals', 'filler', 'petals', False, '#d8a8a0'),
]
RIBBONS = [('ribbon_red', '#b0141e'), ('ribbon_white', '#ece6da'), ('ribbon_yellow', '#e0b42a'),
           ('ribbon_purple', '#6a2c86')]


def layout():
    cells = []
    for i, (name, kind, variant, wilted, col) in enumerate(FLOWERS):
        for j, view in enumerate(('front', 'side')):
            k = i * 2 + j
            cx, cy = k % GRID, k // GRID
            u0, u1 = cx / GRID, (cx + 1) / GRID
            v1, v0 = 1 - cy / GRID, 1 - (cy + 1) / GRID
            piv = [(u0 + u1) / 2, (v0 + v1) / 2] if view == 'front' else [(u0 + u1) / 2, v0 + 0.004]
            cells.append(dict(name=name, kind=kind, variant=variant, view=view, wilted=wilted, color=col,
                              uv=[round(u0, 5), round(v0, 5), round(u1, 5), round(v1, 5)],
                              pivot=[round(piv[0], 5), round(piv[1], 5)], px=[cx * CELL, cy * CELL, CELL, CELL]))
    for i, (name, col) in enumerate(RIBBONS):
        for j, view in enumerate(('front', 'side')):
            cx = i * 2 + j
            u0, u1 = cx / GRID, (cx + 1) / GRID
            v0, v1 = 0.0, 2 / GRID
            cells.append(dict(name=name, kind='ribbon', variant=name.split('_')[1], view=view, wilted=False, color=col,
                              uv=[round(u0, 5), v0, round(u1, 5), v1], pivot=[round((u0 + u1) / 2, 5), round(v1 - 0.004, 5)],
                              px=[cx * CELL, 6 * CELL, CELL, 2 * CELL]))
    return cells


# =======================================================================================
# Source sprites
# =======================================================================================
_S = {}


def comps(src, alpha_from_black=False, min_area=400):
    col = load(src, 'color' if src.startswith('acg_') else 'diffuse')
    if alpha_from_black:
        a = sstep(0.035, 0.09, col.max(2))
    else:
        a = load(src, 'opacity' if src.startswith('acg_') else 'alpha', None, 'L')
        if a.shape != col.shape[:2]:
            a = cv2.resize(a, (col.shape[1], col.shape[0]))
    nn = 'normalgl' if src.startswith('acg_') else 'nor_gl'
    try:
        nrm = decode_normal(load(src, nn))
    except (KeyError, FileNotFoundError):
        nrm = np.zeros_like(col)
        nrm[..., 2] = 1
    m = (a > 0.5).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    out = []
    H, W = m.shape
    for i in range(1, n):
        x, y, w, h, area = st[i]
        if area < min_area or x <= 1 or y <= 1 or x + w >= W - 1 or y + h >= H - 1:
            continue
        pad = 4
        y0, y1, x0, x1 = max(0, y - pad), min(H, y + h + pad), max(0, x - pad), min(W, x + w + pad)
        mask = (lab[y0:y1, x0:x1] == i) * a[y0:y1, x0:x1]
        rgba = np.concatenate([col[y0:y1, x0:x1], mask[..., None]], -1).astype(np.float32)
        rgb = rgba[..., :3][mask > 0.5]
        hsv = cv2.cvtColor(rgb[None].astype(np.float32), cv2.COLOR_RGB2HSV)[0]
        ys, xs = np.nonzero(mask > 0.5)
        pts = np.stack([xs, ys], 1).astype(np.float64)
        ev, evec = np.linalg.eigh(np.cov((pts - pts.mean(0)).T))
        aspect = math.sqrt(ev[1] / max(ev[0], 1e-6))
        out.append(dict(rgba=rgba, nrm=nrm[y0:y1, x0:x1].astype(np.float32), area=area, aspect=aspect,
                        hue=float(np.median(hsv[:, 0])), sat=float(np.median(hsv[:, 1])), val=float(np.median(hsv[:, 2])),
                        major=evec[:, 1]))
    return out


def canon_petal(c):
    """Rotate a petal tip-up; base = the narrower end."""
    major = c['major']
    disp = math.degrees(math.atan2(-major[1], major[0]))
    r, n, _ = rotate_sprite(c['rgba'], c['nrm'], 90 - disp)
    r, n = _crop(r, n)
    a = r[..., 3] > 0.5
    rows = a.sum(1)
    nz = np.nonzero(rows)[0]
    q = max(2, len(nz) // 4)
    if rows[nz[:q]].mean() < rows[nz[-q:]].mean():  # narrower at top -> base is on top -> flip
        r, n, _ = rotate_sprite(r, n, 180)
        r, n = _crop(r, n)
    return Sprite(r, n, 'petal')


def sprites(name):
    if name in _S:
        return _S[name]
    if name == 'petal':
        cs = comps('ph_flower_gazania', min_area=300) + comps('ph_flower_ursinia', min_area=300)
        sel = [c for c in cs if 2.2 < c['aspect'] < 9 and 5 < c['hue'] < 50 and c['sat'] > 0.45]
        out = [canon_petal(c) for c in sel]
    elif name == 'pompom':
        cs = comps('ph_flower_stinkkruid', min_area=300)
        sel = [c for c in cs if c['aspect'] < 1.4 and 30 < c['hue'] < 60 and c['sat'] > 0.5]
        out = [Sprite(*_crop(c['rgba'], c['nrm']), 'pompom') for c in sel]
    elif name == 'greenbud':
        cs = comps('ph_flower_stinkkruid', min_area=300)
        sel = [c for c in cs if c['aspect'] < 1.5 and 60 < c['hue'] < 140 and c['val'] > 0.2]
        out = [Sprite(*_crop(c['rgba'], c['nrm']), 'greenbud') for c in sel]
    elif name == 'daisy':
        cs = comps('acg_FlowerSet001', min_area=2000)
        sel = [c for c in cs if c['aspect'] < 1.5]
        out = [Sprite(*_crop(c['rgba'], c['nrm']), 'daisy') for c in sel]
    elif name == 'pinwheel':
        cs = comps('ph_periwinkle_plant', alpha_from_black=True, min_area=2000)
        sel = [c for c in cs if c['aspect'] < 1.5 and (c['hue'] > 280 or c['hue'] < 20) and c['sat'] > 0.3]
        out = [Sprite(*_crop(c['rgba'], c['nrm']), 'pinwheel') for c in sel]
    elif name == 'pleaf':
        cs = comps('ph_periwinkle_plant', alpha_from_black=True, min_area=2000)
        sel = [c for c in cs if 1.5 < c['aspect'] < 5 and 60 < c['hue'] < 150]
        out = [canon_petal(c) for c in sel]
    else:
        raise KeyError(name)
    if not out:
        raise RuntimeError('no flower sprites: ' + name)
    _S[name] = out
    print(f'  flower sprites {name}: {len(out)}', flush=True)
    return out


def recolor(sp, c_base, c_tip, keep=0.75, sat_detail=0.0, edge=None):
    """Luminance-preserving recolour along the petal (base -> tip)."""
    rgba = sp.rgba.copy()
    a = rgba[..., 3]
    L = lum(rgba[..., :3])
    m = L[a > 0.5].mean() if (a > 0.5).any() else 0.5
    det = np.clip(L / max(m, 1e-3), 0, 2.2) ** keep
    h = rgba.shape[0]
    t = np.linspace(1, 0, h, dtype=np.float32)[:, None, None]  # top (tip) = 1
    col = hex2rgb(c_base) * (1 - t) + hex2rgb(c_tip) * t
    out = col * det[..., None]
    if sat_detail:
        out = out * (1 - sat_detail) + saturate(rgba[..., :3], 1.0) * sat_detail
    if edge is not None:
        # darken / brown the rim (distance to alpha edge)
        d = cv2.distanceTransform((a > 0.5).astype(np.uint8), cv2.DIST_L2, 3)
        e = sstep(4.0, 0.0, d)[..., None] * edge[1]
        out = out * (1 - e) + hex2rgb(edge[0]) * det[..., None] * e
    rgba[..., :3] = np.clip(out, 0, 1)
    return Sprite(rgba, sp.nrm, sp.name)


def shaped(sp, sx=1.0, sy=1.0):
    h, w = sp.rgba.shape[:2]
    nw, nh = max(3, int(w * sx)), max(3, int(h * sy))
    r = cv2.resize(sp.rgba, (nw, nh), interpolation=cv2.INTER_AREA if sx * sy < 1 else cv2.INTER_CUBIC)
    n = cv2.resize(sp.nrm, (nw, nh), interpolation=cv2.INTER_LINEAR)
    n[..., 0] /= max(sx, 0.2)
    n[..., 1] /= max(sy, 0.2)
    n /= np.linalg.norm(n, axis=2, keepdims=True) + 1e-6
    return Sprite(r, n, sp.name)


# =======================================================================================
# 3D petal head
# =======================================================================================
def rotx(v, a):
    c, s = math.cos(a), math.sin(a)
    return np.array([v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c])


def head(card, rng, cx, cy, R, rings, view_tilt, petal_fn, centre=None, droop=0.0, missing=0.0,
         light=(0.35, 0.55, 0.75)):
    """rings: list of dict(n, L (x R), phi deg (elevation), w (width scale), offset, r0 (start radius x R)).
    view_tilt: radians, 0 = face-on (flower axis toward the viewer), ~1.1 = three-quarter side view.
    petal_fn(ring_index, rng) -> Sprite (already coloured)."""
    items = []
    lv = np.array(light) / np.linalg.norm(light)
    for ri, rg in enumerate(rings):
        n = rg['n']
        for i in range(n):
            if missing and rng.random() < missing:
                continue
            th = (i + rg.get('offset', 0) + (rng.random() - 0.5) * rg.get('jit', 0.25)) / n * TAU
            phi = math.radians(rg['phi'] + (rng.random() - 0.5) * rg.get('phij', 10) - droop * (0.6 + rng.random() * 0.8))
            L = R * rg['L'] * (0.88 + rng.random() * 0.24)
            r0 = R * rg.get('r0', 0.05)
            d = np.array([math.cos(th) * math.cos(phi), math.sin(th) * math.cos(phi), math.sin(phi)])
            wv = np.array([-math.sin(th), math.cos(th), 0.0])
            nv = np.cross(d, wv)  # petal surface normal (faces the flower axis side)
            base = np.array([math.cos(th) * r0, math.sin(th) * r0, rg.get('z0', 0.0) * R])
            d2, w2, n2, b2 = rotx(d, -view_tilt), rotx(wv, -view_tilt), rotx(nv, -view_tilt), rotx(base, -view_tilt)
            plen = math.hypot(d2[0], d2[1])
            pw = max(0.22, math.hypot(w2[0], w2[1]))
            depth = (b2[2] + d2[2] * L * 0.5)
            facing = abs(n2[2])
            shade = 0.55 + 0.45 * max(0.0, float(np.dot(n2 if n2[2] > 0 else -n2, lv)))
            items.append((depth, ri, b2, d2, plen, pw, L, shade, facing))
    items.sort(key=lambda t: t[0])
    if centre is not None and view_tilt > 0.6:
        centre(card, cx, cy, R, view_tilt, before=True)
    for depth, ri, b2, d2, plen, pw, L, shade, facing in items:
        sp = petal_fn(ri, rng)
        if pw < 0.98:
            sp = shaped(sp, pw, 1.0)
        ang = math.degrees(math.atan2(d2[1], d2[0]))  # screen y up
        length = max(3.0, L * plen)
        card.stamp(sp, (cx + b2[0], cy - b2[1]), ang, length, value=shade * (0.92 + 0.16 * rng.random()))
    if centre is not None and view_tilt <= 0.6:
        centre(card, cx, cy, R, view_tilt, before=False)


def disc_centre(colors, dots=True, scale=0.22, pompom=False):
    def fn(card, cx, cy, R, tilt, before=False):
        r = R * scale
        sy = max(0.35, math.cos(tilt))
        if pompom:
            sp = sprites('pompom')[0]
            sp = recolor(sp, colors[0], colors[1], keep=0.9)
            card.stamp(sp, (cx, cy + r * sy), 90, 2 * r * sy + 2, value=1.0)
            return
        yy, xx = np.mgrid[0:card.h, 0:card.w].astype(np.float32)
        d = np.hypot((xx - cx) / r, (yy - cy) / (r * sy))
        a = sstep(1.0, 0.85, d)
        n = fbm((card.w, card.h), 90, 3, 5)
        col = hex2rgb(colors[0]) * (1 - d[..., None] * 0.5) + hex2rgb(colors[1]) * d[..., None] * 0.5
        if dots:
            col = col * (0.7 + 0.5 * sstep(0.45, 0.6, n)[..., None])
        rgba = np.concatenate([col, a[..., None]], -1).astype(np.float32)
        nrm = np.zeros((card.h, card.w, 3), np.float32)
        nrm[..., 2] = 1
        x0, y0 = int(cx - r - 2), int(cy - r - 2)
        x1, y1 = int(cx + r + 3), int(cy + r + 3)
        card.over(rgba[y0:y1, x0:x1], nrm[y0:y1, x0:x1], x0, y0)
    return fn


# =======================================================================================
# Flower recipes (each draws one card at RENDER size)
# =======================================================================================
def petal_set(c_base, c_tip, sx=1.0, sy=1.0, keep=0.75, edge=None, pool='petal', curl=False):
    pal = [recolor(shaped(p, sx, sy), c_base, c_tip, keep=keep, edge=edge) for p in sprites(pool)]
    return lambda ri, rng: pal[rng.integers(len(pal))]


def wilt_cols(cb, ct, amount=0.8):
    def mix(c, b, t):
        return '#%02x%02x%02x' % tuple(int(255 * (hex2rgb(c)[i] * (1 - t) + hex2rgb(b)[i] * t)) for i in range(3))
    return mix(cb, '#6a4a26', amount), mix(ct, '#8a6a3c', amount * 0.9)


def draw_flower(name, view, rng):
    S = RENDER
    c = Card(S, S)
    cx, cy = S / 2, S / 2 if view == 'front' else S * 0.62
    tilt = 0.0 if view == 'front' else 1.05
    wilted = name.endswith('_wilted')
    base = name.replace('_wilted', '')
    droop = 35 if wilted else 0
    miss = 0.18 if wilted else 0.0
    edge_w = ('#4a3420', 0.8) if wilted else None
    R = S * 0.44
    if base == 'chrys_white' or base == 'chrys_yellow':
        cb, ct = ('#d9d6c4', '#f6f4ec') if base == 'chrys_white' else ('#c89a1c', '#f0d040')
        if wilted:
            cb, ct = wilt_cols(cb, ct, 0.65)
        pf = petal_set(cb, ct, sx=0.55, sy=1.0, edge=edge_w)
        rings = [dict(n=30, L=0.98, phi=8, r0=0.12), dict(n=26, L=0.8, phi=26, r0=0.1, offset=0.5),
                 dict(n=22, L=0.6, phi=46, r0=0.08), dict(n=16, L=0.42, phi=66, r0=0.05, offset=0.5),
                 dict(n=10, L=0.26, phi=80, r0=0.02)]
        head(c, rng, cx, cy, R * (0.9 if wilted else 1), rings, tilt, pf, droop=droop, missing=miss)
    elif base == 'marigold':
        cb, ct = '#b8600c', '#f2a21e'
        if wilted:
            cb, ct = wilt_cols(cb, ct, 0.7)
        pf = petal_set(cb, ct, sx=1.5, sy=0.42, keep=0.9, edge=edge_w or ('#7a3a08', 0.35))
        rings = [dict(n=22, L=0.62, phi=12, r0=0.35), dict(n=22, L=0.55, phi=34, r0=0.3, offset=0.5),
                 dict(n=20, L=0.5, phi=55, r0=0.24), dict(n=16, L=0.42, phi=72, r0=0.16, offset=0.5),
                 dict(n=12, L=0.32, phi=84, r0=0.08), dict(n=8, L=0.22, phi=88, r0=0.0)]
        head(c, rng, cx, cy, R * (0.85 if wilted else 0.95), rings, tilt, pf, droop=droop * 0.6, missing=miss * 0.5,
             centre=disc_centre(('#c86a10', '#f0a020'), pompom=True, scale=0.42))
    elif base == 'rose_red' or base == 'rose_white':
        cb, ct = ('#5a0610', '#b0141e') if base == 'rose_red' else ('#d8d0bc', '#f4efe4')
        if wilted:
            cb, ct = ('#2a0808', '#4a1410') if base == 'rose_red' else wilt_cols(cb, ct, 0.7)
        pf = petal_set(cb, ct, sx=2.6, sy=0.55, keep=0.6, edge=edge_w or (('#3a0206', 0.5) if base == 'rose_red' else ('#bcae90', 0.35)))
        rings = [dict(n=5, L=0.95, phi=18, r0=0.15), dict(n=5, L=0.8, phi=40, r0=0.15, offset=0.5),
                 dict(n=5, L=0.65, phi=58, r0=0.12, offset=0.25), dict(n=4, L=0.5, phi=72, r0=0.08, offset=0.7),
                 dict(n=4, L=0.38, phi=80, r0=0.05, offset=0.1), dict(n=3, L=0.28, phi=86, r0=0.02, offset=0.5)]
        head(c, rng, cx, cy, R * (0.85 if wilted else 0.92), rings, tilt, pf, droop=droop, missing=miss * 0.5)
    elif base == 'jasmine':
        cb, ct = '#d6d8bc', '#fbf8ee'
        if wilted:
            cb, ct = wilt_cols(cb, ct, 0.75)
        pf = petal_set(cb, ct, sx=1.7, sy=0.55, keep=0.55, edge=edge_w)
        rings = [dict(n=8, L=0.95, phi=6, r0=0.08), dict(n=7, L=0.7, phi=28, r0=0.05, offset=0.5),
                 dict(n=5, L=0.45, phi=55, r0=0.02)]
        head(c, rng, cx, cy, R * 0.92, rings, tilt, pf, droop=droop, missing=miss,
             centre=disc_centre(('#d8d8a0', '#a8b070'), dots=False, scale=0.08))
    elif base == 'jasmine_bud':
        cb, ct = '#b8c08a', '#fbf9f0'
        if wilted:
            cb, ct = wilt_cols(cb, ct, 0.75)
        pf = petal_set(cb, ct, sx=1.5, sy=0.9, keep=0.5, edge=edge_w)
        for k in range(3 if view == 'side' else 4):
            if view == 'side':
                bx = S / 2 + (k - 1) * S * 0.2
                ang = 90 + (k - 1) * 22 + (rng.random() - 0.5) * 8
                Lb = S * (0.6 if k == 1 else 0.48)
                rings = [dict(n=5, L=1.0, phi=82, r0=0.05, phij=4)]
                sub = Card(S, S)
                head(sub, rng, S / 2, S * 0.92, Lb, rings, 1.45, pf, droop=droop * 0.3)
                rr, nn = sub.result(0.02, 0.05, 0)
                spb = Sprite(*_crop(rr, nn), 'bud')
                c.stamp(spb, (bx, S * 0.97), ang - (droop * 0.8 if wilted else 0), Lb)
            else:
                a = k / 4 * TAU + 0.4
                bx, by = S / 2 + math.cos(a) * S * 0.2, S / 2 + math.sin(a) * S * 0.2
                rings = [dict(n=5, L=0.9, phi=72, r0=0.05, phij=4)]
                head(c, rng, bx, by + S * 0.08, S * 0.28, rings, 0.75 + 0.15 * (k % 2), pf, droop=droop * 0.4)
    elif base == 'crown_purple' or base == 'crown_white':
        cb, ct = ('#8a72b4', '#cbbde6') if base == 'crown_purple' else ('#cfcad6', '#f6f3f6')
        pf = petal_set(cb, ct, sx=2.2, sy=0.7, keep=0.55)
        rings = [dict(n=5, L=0.95, phi=-12, r0=0.12, jit=0.05)]
        head(c, rng, cx, cy, R * 0.92, rings, tilt, pf)
        # the crown: five upright waxy lobes + pale centre disc
        cf = petal_set('#a898c4' if base == 'crown_purple' else '#e4e0e8', '#f4f0f8', sx=1.6, sy=0.5, keep=0.4)
        head(c, rng, cx, cy, R * 0.42, [dict(n=5, L=0.7, phi=70, r0=0.25, offset=0.5, jit=0.02)], tilt, cf,
             centre=disc_centre(('#f0eef4', '#c8c0d8'), dots=False, scale=0.3))
    elif base == 'frangipani':
        cb, ct = '#f0b820', '#fbf6e8'
        if wilted:
            cb, ct = wilt_cols(cb, ct, 0.7)
        pf = petal_set(cb, ct, sx=3.0, sy=0.62, keep=0.45, edge=edge_w)
        rings = [dict(n=5, L=0.98, phi=8, r0=0.06, jit=0.04)]
        # pinwheel: petals overlap, rotated off-radial (achieved by an angular offset of the base)
        head(c, rng, cx, cy, R * 0.95, rings, tilt, pf, droop=droop, missing=miss * 0.5)
        head(c, rng, cx, cy, R * 0.18, [dict(n=5, L=0.9, phi=60, r0=0.0, offset=0.3)], tilt,
             petal_set('#e8b018', '#f6d860', sx=2.0, sy=0.5))
    elif base == 'lotus':
        cb, ct = '#f4ece4', '#d86a8e'
        if wilted:
            cb, ct = wilt_cols(cb, ct, 0.6)
        pf = petal_set(cb, ct, sx=2.2, sy=1.0, keep=0.55, edge=edge_w or ('#c0507a', 0.4))
        rings = [dict(n=8, L=0.95, phi=18, r0=0.18), dict(n=8, L=0.85, phi=42, r0=0.15, offset=0.5),
                 dict(n=6, L=0.7, phi=64, r0=0.1)]
        head(c, rng, cx, cy, R * 0.95, rings, tilt if view == 'front' else 1.2, pf, droop=droop, missing=miss,
             centre=disc_centre(('#d8c860', '#9aa040'), dots=True, scale=0.24))
    elif base == 'lotus_bud':
        cb, ct = '#f0e4dc', '#d2557e'
        pf = petal_set(cb, ct, sx=2.4, sy=1.0, keep=0.5, edge=('#b0386a', 0.45))
        rings = [dict(n=5, L=0.95, phi=78, r0=0.12, phij=4), dict(n=4, L=0.9, phi=84, r0=0.08, offset=0.5, phij=3)]
        if view == 'front':
            head(c, rng, cx, cy + R * 0.35, R * 0.85, rings, 0.85, pf)
        else:
            head(c, rng, cx, S * 0.94, R * 1.05, rings, 1.5, pf)
    elif base == 'orchid':
        sep = petal_set('#c8a0c8', '#f2e6f2', sx=1.3, sy=0.6, keep=0.5)
        pet = petal_set('#b04898', '#ead0e8', sx=2.2, sy=0.55, keep=0.5)
        lip = petal_set('#5a0c4c', '#a01e80', sx=2.4, sy=0.42, keep=0.5)

        def orchid(cx_, cy_, R_, tilt_):
            head(c, rng, cx_, cy_, R_, [dict(n=3, L=0.95, phi=5, r0=0.05, offset=0.25, jit=0.03)], tilt_, sep)
            head(c, rng, cx_, cy_, R_, [dict(n=2, L=0.85, phi=12, r0=0.05, offset=0.0, jit=0.02)], tilt_ + 0.0, pet)
            c.stamp(lip(0, rng), (cx_, cy_), -90, R_ * 0.75)
        if view == 'front':
            orchid(cx, cy, R * 0.95, 0.0)
        else:
            pts = [(S * (0.42 + 0.35 * t ** 1.3), S * (0.97 - 0.85 * t)) for t in np.linspace(0, 1, 10)]
            c.stroke(pts, S * 0.016, S * 0.008, lambda t: np.array([0.36, 0.42, 0.2]))
            for k, t in enumerate(np.linspace(0.25, 0.95, 6)):
                i = min(8, int(t * 9))
                px, py = pts[i]
                if k >= 4:
                    head(c, rng, px, py, S * 0.06, [dict(n=3, L=1.0, phi=80, r0=0.0)], 1.3,
                         petal_set('#8a6a3a', '#c06aa8', sx=1.5, sy=0.6))
                else:
                    orchid(px + (S * 0.08 if k % 2 else -S * 0.08), py, S * (0.17 - k * 0.02), 0.3 + k * 0.1)
    elif base == 'leaves':
        lv = sprites('pleaf') + lib('small')
        pts = [(S / 2 + math.sin(t * 2.5) * S * 0.05, S * (0.98 - 0.9 * t)) for t in np.linspace(0, 1, 8)]
        c.stroke(pts, S * 0.016, S * 0.006, lambda t: np.array([0.34, 0.36, 0.2]))
        for k in range(14 if view == 'front' else 10):
            t = 0.15 + 0.8 * k / 13
            i = min(6, int(t * 7))
            px, py = pts[i]
            side = 1 if k % 2 else -1
            sp = lv[rng.integers(len(lv))]
            c.stamp(sp, (px, py), 90 + side * (35 + rng.random() * 30), S * (0.3 - 0.12 * t),
                    tint=np.array([0.9, 1.0, 0.82]), value=0.6 + rng.random() * 0.5, sat=0.75, flip=side < 0)
    elif base == 'buds':
        gb = sprites('greenbud')
        for k in range(5):
            bx = S / 2 + (rng.random() - 0.5) * S * 0.15
            tx, ty = S * (0.15 + rng.random() * 0.7), S * (0.12 + rng.random() * 0.35)
            c.stroke([(bx, S * 0.98), ((bx + tx) / 2, (S + ty) / 2), (tx, ty)], S * 0.012, S * 0.007,
                     lambda t: np.array([0.36, 0.44, 0.2]))
            c.stamp(gb[rng.integers(len(gb))], (tx, ty + S * 0.05), 90 + (rng.random() - 0.5) * 30,
                    S * (0.12 + rng.random() * 0.06), value=0.8 + rng.random() * 0.3, sat=0.85)
    elif base == 'petals':
        pr = petal_set('#9a1420', '#c8303a', sx=2.2, sy=0.5)
        pw = petal_set('#e6e2d0', '#faf8ee', sx=1.5, sy=0.5)
        py_ = petal_set('#c8780c', '#f0a020', sx=1.2, sy=0.4)
        for k in range(26):
            f = [pr, pw, py_][k % 3]
            c.stamp(f(0, rng), (S * (0.12 + rng.random() * 0.76), S * (0.12 + rng.random() * 0.76)),
                    rng.random() * 360, S * (0.12 + rng.random() * 0.1), value=0.7 + rng.random() * 0.4)
    return c


def draw_ribbon(col, view, rng):
    """Satin ribbon tail (hanging, swallowtail cut), 512 x 1024; satin scan for the weave sheen."""
    W, H = RENDER, RENDER * 2
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    t = yy / H
    twist = 0.0 if view == 'front' else 1.0
    wid = W * (0.32 - 0.06 * t) * (1 - twist * 0.45 * np.abs(np.sin(t * 5.0 + 0.6)))
    cx = W / 2 + np.sin(t * 4.2 + 0.4) * W * 0.06
    dx = xx - cx
    inside = (np.abs(dx) < wid / 2) & (t > 0.01)
    notch = (t > 0.88) & (np.abs(dx) < (t - 0.88) / 0.12 * wid * 0.5)
    alpha = (inside & ~notch).astype(np.float32)
    alpha = cv2.GaussianBlur(alpha, (0, 0), 0.6)
    sat = load('ph_crepe_satin', 'diffuse', (W, W), 'L')
    sat = np.concatenate([sat, sat[::-1]], 0)
    sheen = norm01(blur(sat, 2)) * 0.35 + 0.82
    fold = 0.62 + 0.38 * (0.5 + 0.5 * np.cos(t * 9.0 + dx / W * 2.0 + twist * 2.0))
    across = 1 - 0.25 * (dx / np.maximum(wid / 2, 1)) ** 2
    spec = sstep(0.82, 0.98, fold) * 0.35
    base = hex2rgb(col)
    rgb = base * (fold * across * sheen)[..., None] + spec[..., None] * (0.6 + 0.4 * base)
    rgb = rgb * (0.85 + 0.15 * fbm((W, H), 30, 3, 9)[..., None])
    hgt = (fold * 0.6 + across * 0.4).astype(np.float32)
    from pbcore import normal_from_height
    nrm = normal_from_height(hgt, 6, wrap=False)
    c = Card(W, H)
    c.over(np.concatenate([np.clip(rgb, 0, 1), alpha[..., None]], -1).astype(np.float32), nrm, 0, 0)
    return c


def build(w, keys):
    if keys and 'flower_atlas' not in keys:
        return
    SIZE = CELL * GRID
    rng = np.random.default_rng(5150)
    atlas_rgba = np.zeros((SIZE, SIZE, 4), np.float32)
    atlas_n = np.zeros((SIZE, SIZE, 3), np.float32)
    atlas_n[..., 2] = 1
    cells = layout()
    for cell in cells:
        x, y, cw, chh = cell['px']
        if cell['kind'] == 'ribbon':
            card = draw_ribbon(cell['color'], cell['view'], rng)
        else:
            card = draw_flower(cell['name'], cell['view'], rng)
        rgba, nrm = card.result(0.4, 0.62, 0.3)
        m = 4
        rgba = cv2.resize(rgba, (cw, chh), interpolation=cv2.INTER_AREA)
        nrm = cv2.resize(nrm, (cw, chh), interpolation=cv2.INTER_AREA)
        rgba[:m, :, 3] = rgba[-m:, :, 3] = 0
        rgba[:, :m, 3] = rgba[:, -m:, 3] = 0
        atlas_rgba[y:y + chh, x:x + cw] = rgba
        atlas_n[y:y + chh, x:x + cw] = nrm
        print('  flower', cell['name'], cell['view'], flush=True)
    from pbcore import bleed_rgb
    atlas_rgba = bleed_rgb(atlas_rgba, passes=8)
    meta = [{k: v for k, v in c.items() if k != 'px'} for c in cells]
    w.texture('flower_atlas', 'foliage/flower_atlas.webp', atlas_rgba, 'rgba', wrap='clamp', alpha=True,
              extra={'grid': GRID})
    w.texture('flower_atlas_normal', 'foliage/flower_atlas_normal.webp',
              resize_tile(atlas_n, (SIZE // 2, SIZE // 2), wrap=False), 'normal', wrap='clamp')
    write_js(meta, SIZE)


def write_js(cells, size):
    path = os.path.join(ROOT, 'src', 'textures', 'flowerLayout.js')
    body = ',\n'.join('    ' + json.dumps(c, ensure_ascii=False) for c in cells)
    js = f"""// GENERATED by tools/photobash/flowers.py - do not edit by hand.
// Flower atlas layout (tex('flower_atlas'), RGBA {size}x{size}, 8x8 grid of 256 px cells; ribbons span
// 2 rows). uv = [u0, v0, u1, v1] in three.js uv space (v up). Every flower has a 'front' card (head seen
// face-on, pivot = flower centre) and a 'side' card (three-quarter view, pivot = stem attach point at
// the bottom centre). Ribbon cells hang from their pivot at the top centre. wilted = browned, drooping.
export const FLOWER_ATLAS = {{
  key: 'flower_atlas',
  normalKey: 'flower_atlas_normal',
  size: [{size}, {size}],
  grid: 8,
  cells: [
{body},
  ],
}};
"""
    with open(path, 'w') as f:
        f.write(js)
