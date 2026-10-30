"""Foliage atlases photobashed from real leaf scans (ambientCG LeafSets, Poly Haven plant
textures, a CC0 banana photo) composed into cards with crisp alpha.

Two layouts are produced:
  * the FOLIAGE_ATLAS contract of src/textures/foliage.js (leaf_tropical, leaf_banana, leaf_fern,
    leaf_bamboo, leaf_palm, grass_card, vine): same keys, same cell rects, same base/tip points;
  * foliage_world: the 5x5 slot grid of src/world/foliageAtlas.js (SLOT names, slot = 1/5 of the
    texture, base at the slot's bottom centre unless noted) so the world can swap its canvas atlas.

Leaves are cut out of the scans by connected components, canonicalised (tip up, base down),
then stamped along painted twigs. Normals are rotated with each stamp.
"""
import math

import cv2
import numpy as np

from pbcore import (bleed_rgb, blur, decode_normal, encode_normal, fbm, has_map, hex2rgb, load, lum, norm01,
                    saturate, sstep, unsharp, resize_tile, normal_from_height)

TAU = math.pi * 2


# =======================================================================================
# Sprite extraction
# =======================================================================================
class Sprite:
    def __init__(self, rgba, nrm, name):
        self.rgba, self.nrm, self.name = rgba, nrm, name
        a = rgba[..., 3]
        ys, xs = np.nonzero(a > 0.5)
        self.h, self.w = a.shape
        self.top, self.bottom = ys.min(), ys.max()
        rows = xs[ys >= self.bottom - 3]
        self.base = (float(rows.mean()), float(self.bottom))
        self.length = float(self.bottom - self.top + 1)
        self.width = float(xs.max() - xs.min() + 1)


def _maps_for(src):
    if src.startswith('acg_'):
        return 'color', 'opacity', 'normalgl'
    for c, a, n in (('leaves_diff', 'leaves_alpha', 'leaves_nor_gl'), ('diffuse', 'alpha', 'nor_gl')):
        if has_map(src, c) and has_map(src, a):
            return c, a, n
    return 'diffuse', 'alpha', 'nor_gl'


def rotate_sprite(rgba, nrm, deg, scale=1.0):
    """Rotate counter-clockwise (as displayed) by deg, scale; canvas grows to fit. Normals rotate too."""
    h, w = rgba.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), deg, scale)
    cos, sin = abs(M[0, 0]), abs(M[0, 1])
    nw, nh = int(h * sin + w * cos) + 4, int(h * cos + w * sin) + 4
    M[0, 2] += nw / 2 - w / 2
    M[1, 2] += nh / 2 - h / 2
    pm = rgba.copy()
    pm[..., :3] *= pm[..., 3:4]
    out = cv2.warpAffine(pm, M, (nw, nh), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    a = out[..., 3:4]
    out[..., :3] = np.where(a > 1e-4, out[..., :3] / np.maximum(a, 1e-4), 0)
    n = cv2.warpAffine(nrm * rgba[..., 3:4], M, (nw, nh), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    n = np.where(a > 1e-4, n / np.maximum(a, 1e-4), np.array([0, 0, 1], np.float32))
    r = math.radians(deg)
    c, s = math.cos(r), math.sin(r)
    nx = n[..., 0] * c - n[..., 1] * s
    ny = n[..., 0] * s + n[..., 1] * c
    n = np.stack([nx, ny, n[..., 2]], -1)
    n /= np.linalg.norm(n, axis=2, keepdims=True) + 1e-6
    return np.clip(out, 0, 1), n.astype(np.float32), M


def extract(src, min_area=1500, max_n=40, solidity=0.55, max_aspect=9.0, petiole_flip=True, keep_border=False,
            orient='auto', taper=False, max_width_ratio=None):
    """Cut leaves (connected alpha components) out of a scan atlas; return canonical Sprites (tip up)."""
    cn, an, nn = _maps_for(src)
    col = load(src, cn)
    a = load(src, an, None, 'L')
    if a.shape != col.shape[:2]:
        a = cv2.resize(a, (col.shape[1], col.shape[0]), interpolation=cv2.INTER_LINEAR)
    try:
        nrm = decode_normal(load(src, nn))
        if nrm.shape[:2] != col.shape[:2]:
            nrm = decode_normal(cv2.resize(load(src, nn), (col.shape[1], col.shape[0])))
    except (KeyError, FileNotFoundError):
        nrm = np.zeros_like(col)
        nrm[..., 2] = 1
    m = (a > 0.5).astype(np.uint8)
    nlab, lab, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    order = np.argsort(-stats[1:, cv2.CC_STAT_AREA]) + 1
    out = []
    H, W = m.shape
    for i in order[:max_n * 3]:
        x, y, w, h, area = stats[i]
        if area < min_area:
            break
        if not keep_border and (x <= 1 or y <= 1 or x + w >= W - 1 or y + h >= H - 1):
            continue
        comp = (lab[y:y + h, x:x + w] == i)
        hull = cv2.convexHull(np.argwhere(comp)[:, ::-1].astype(np.int32))
        sol = area / max(1.0, cv2.contourArea(hull))
        if sol < solidity:
            continue
        pad = 6
        y0, y1, x0, x1 = max(0, y - pad), min(H, y + h + pad), max(0, x - pad), min(W, x + w + pad)
        mask = (lab[y0:y1, x0:x1] == i).astype(np.float32)
        mask = np.maximum(mask, 0) * a[y0:y1, x0:x1]
        mask *= sstep(0.025, 0.07, lum(col[y0:y1, x0:x1]))  # drop black UV junk inside the island
        # soften the hard component cut by the scan's own alpha only
        rgba = np.concatenate([col[y0:y1, x0:x1], mask[..., None]], -1)
        nr = nrm[y0:y1, x0:x1]
        ys, xs = np.nonzero(mask > 0.5)
        if len(xs) < max(50, min_area * 0.5):
            continue
        pts = np.stack([xs, ys], 1).astype(np.float64)
        c = pts.mean(0)
        evals, evecs = np.linalg.eigh(np.cov((pts - c).T))
        major = evecs[:, 1]
        aspect = math.sqrt(evals[1] / max(evals[0], 1e-6))
        if aspect > max_aspect:
            continue
        disp = math.degrees(math.atan2(-major[1], major[0]))
        rot = 90 - disp if orient == 'auto' else 0
        r2, n2, _ = rotate_sprite(rgba, nr, rot)
        if petiole_flip and orient == 'auto':
            r2, n2 = _orient_base_down(r2, n2)
        r2, n2 = _crop(r2, n2)
        am = r2[..., 3] > 0.5
        fill = am.mean()
        if fill > 0.86 or lum(r2[..., :3])[am].mean() < 0.05:
            continue  # rectangles (stem/bark UV strips) and black junk islands
        rows = am.sum(1)
        nz = np.nonzero(rows)[0]
        if taper and len(nz) > 10:
            k = max(2, len(nz) // 10)
            ends = min(rows[nz[:k]].mean(), rows[nz[-k:]].mean())
            if ends > rows.max() * 0.45 or rows[nz[:k]].mean() > rows.max() * 0.7 and rows[nz[-k:]].mean() > rows.max() * 0.7:
                continue  # constant-width strip, not a leaf
        if max_width_ratio and rows.max() / max(1, len(nz)) > max_width_ratio:
            continue
        out.append(Sprite(r2, n2, f'{src}#{i}'))
        if len(out) >= max_n:
            break
    return out


def _crop(rgba, nrm, pad=3):
    ys, xs = np.nonzero(rgba[..., 3] > 0.02)
    y0, y1 = max(0, ys.min() - pad), min(rgba.shape[0], ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(rgba.shape[1], xs.max() + pad + 1)
    return rgba[y0:y1, x0:x1].copy(), nrm[y0:y1, x0:x1].copy()


def _orient_base_down(rgba, nrm):
    """Petiole heuristic: the end with the longer run of very narrow rows is the base."""
    a = rgba[..., 3] > 0.5
    rows = np.nonzero(a.any(1))[0]
    if len(rows) < 10:
        return rgba, nrm
    widths = a[rows].sum(1).astype(np.float32)
    wmax = widths.max()
    thin = widths < wmax * 0.12
    n = len(widths)

    def run(arr):
        k = 0
        for v in arr:
            if not v:
                break
            k += 1
        return k
    top_run, bot_run = run(thin), run(thin[::-1])
    # also: ovate leaves are widest nearer the base
    cen = (np.arange(n) * widths).sum() / widths.sum() / n
    score = (top_run - bot_run) / max(1, n) * 4 + (0.5 - cen) * 1.5
    if score > 0.05:
        r2, n2, _ = rotate_sprite(rgba, nrm, 180)
        return r2, n2
    return rgba, nrm


# =======================================================================================
# Card canvas with premultiplied compositing
# =======================================================================================
class Card:
    def __init__(self, w, h, wrap_u=False, wrap_v=False):
        self.w, self.h = w, h
        self.c = np.zeros((h, w, 3), np.float32)  # premultiplied colour
        self.a = np.zeros((h, w), np.float32)
        self.n = np.zeros((h, w, 3), np.float32)  # premultiplied normal
        self.wrap_u, self.wrap_v = wrap_u, wrap_v

    def _idx(self, x0, y0, sw, sh):
        xs = np.arange(x0, x0 + sw)
        ys = np.arange(y0, y0 + sh)
        if self.wrap_u:
            xs = xs % self.w
            mx = np.ones(sw, bool)
        else:
            mx = (xs >= 0) & (xs < self.w)
        if self.wrap_v:
            ys = ys % self.h
            my = np.ones(sh, bool)
        else:
            my = (ys >= 0) & (ys < self.h)
        return xs, ys, mx, my

    def over(self, rgba, nrm, x0, y0, opacity=1.0):
        sh, sw = rgba.shape[:2]
        xs, ys, mx, my = self._idx(int(x0), int(y0), sw, sh)
        if not mx.any() or not my.any():
            return
        src = rgba[np.ix_(my, mx)]
        sn = nrm[np.ix_(my, mx)]
        X, Y = xs[mx], ys[my]
        ix = np.ix_(Y, X)
        a = src[..., 3] * opacity
        c = self.c[ix]
        self.c[ix] = src[..., :3] * a[..., None] + c * (1 - a[..., None])
        self.n[ix] = sn * a[..., None] + self.n[ix] * (1 - a[..., None])
        self.a[ix] = a + self.a[ix] * (1 - a)

    def stamp(self, sp, base, tip_deg, length, tint=None, value=1.0, sat=1.0, opacity=1.0, flip=False):
        """Place sprite so its base sits at base=(x,y) and its tip points at tip_deg (display degrees,
        90 = up), scaled to length px."""
        rgba, nrm = sp.rgba, sp.nrm
        if flip:
            rgba = rgba[:, ::-1].copy()
            nrm = nrm[:, ::-1].copy()
            nrm[..., 0] *= -1
        scale = length / sp.length
        r2, n2, M = rotate_sprite(rgba, nrm, tip_deg - 90, scale)
        bx, by = sp.base
        if flip:
            bx = sp.w - 1 - bx
        px = M[0, 0] * bx + M[0, 1] * by + M[0, 2]
        py = M[1, 0] * bx + M[1, 1] * by + M[1, 2]
        col = r2[..., :3]
        if sat != 1.0:
            col = saturate(col, sat)
        if tint is not None:
            col = col * tint
        col = np.clip(col * value, 0, 1)
        r2 = np.concatenate([col, r2[..., 3:4]], -1)
        self.over(r2, n2, base[0] - px, base[1] - py, opacity)

    def stroke(self, pts, w0, w1, color_fn, shade=0.35):
        """Tapered twig polyline (list of (x,y)); colour from color_fn(t) -> rgb. Simple rounded shading."""
        n = len(pts)
        for i in range(n - 1):
            (x0, y0), (x1, y1) = pts[i], pts[i + 1]
            t0, t1 = i / (n - 1), (i + 1) / (n - 1)
            wa, wb = w0 + (w1 - w0) * t0, w0 + (w1 - w0) * t1
            L = math.hypot(x1 - x0, y1 - y0) + 1e-6
            nx, ny = -(y1 - y0) / L, (x1 - x0) / L
            R = int(max(wa, wb) + 3)
            bx0, by0 = int(min(x0, x1)) - R, int(min(y0, y1)) - R
            bw, bh = int(abs(x1 - x0)) + 2 * R + 2, int(abs(y1 - y0)) + 2 * R + 2
            yy, xx = np.mgrid[by0:by0 + bh, bx0:bx0 + bw].astype(np.float32) + 0.5
            dx, dy = xx - x0, yy - y0
            t = np.clip((dx * (x1 - x0) + dy * (y1 - y0)) / (L * L), 0, 1)
            cx, cy = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            d = np.hypot(xx - cx, yy - cy)
            wd = (wa + (wb - wa) * t) / 2
            a = np.clip(wd - d + 0.5, 0, 1)
            side = ((xx - cx) * nx + (yy - cy) * ny) / np.maximum(wd, 0.5)
            col = color_fn((t0 + t1) / 2)
            shadef = 1 - shade * np.clip(side, -1, 1) - 0.25 * np.clip(np.abs(side) - 0.6, 0, 1)
            rgb = np.clip(col[None, None, :] * shadef[..., None], 0, 1)
            nv = np.stack([np.clip(side, -1, 1) * nx * 0.8, -np.clip(side, -1, 1) * ny * 0.8, np.ones_like(side)], -1)
            nv /= np.linalg.norm(nv, axis=2, keepdims=True)
            self.over(np.concatenate([rgb, a[..., None]], -1), nv.astype(np.float32), bx0, by0)

    def result(self, alpha_lo=0.42, alpha_hi=0.6, sharpen=0.35):
        a = self.a
        col = np.where(a[..., None] > 1e-4, self.c / np.maximum(a[..., None], 1e-4), 0)
        nrm = np.where(a[..., None] > 1e-4, self.n / np.maximum(a[..., None], 1e-4), np.array([0, 0, 1], np.float32))
        nrm /= np.linalg.norm(nrm, axis=2, keepdims=True) + 1e-6
        # crisp alpha for alphaTest 0.5: steepen the edge but keep 1px anti-alias for mip filtering
        ac = sstep(alpha_lo, alpha_hi, a)
        col = unsharp(col, 0.7, sharpen) if sharpen else col
        rgba = bleed_rgb(np.concatenate([col, ac[..., None]], -1), passes=12)
        nrm_b = bleed_rgb(np.concatenate([nrm * 0.5 + 0.5, ac[..., None]], -1), passes=12)[..., :3] * 2 - 1
        return rgba, nrm_b


# =======================================================================================
# Library of sprites (lazy)
# =======================================================================================
_LIB = {}


def squeeze(sps, sx):
    out = []
    for s in sps:
        h, w = s.rgba.shape[:2]
        nw = max(4, int(w * sx))
        r = cv2.resize(s.rgba, (nw, h), interpolation=cv2.INTER_AREA)
        n = cv2.resize(s.nrm, (nw, h), interpolation=cv2.INTER_AREA)
        n[..., 0] /= max(sx, 0.2)
        n /= np.linalg.norm(n, axis=2, keepdims=True) + 1e-6
        out.append(Sprite(r, n, s.name + '~'))
    return out


def lib(name):
    if name in _LIB:
        return _LIB[name]
    if name == 'leaflet':
        _LIB[name] = lib('narrow') + squeeze(lib('lance'), 0.4) + squeeze(lib('elong'), 0.35)
        return _LIB[name]
    spec = {
        'small': ('acg_LeafSet024', dict(min_area=3000)),
        'elong': ('acg_LeafSet022', dict(min_area=3000)),
        'pointed': ('acg_LeafSet023', dict(min_area=3000)),
        'broad': ('acg_LeafSet018', dict(min_area=5000)),
        'lance': ('acg_LeafSet013', dict(min_area=1500, flip=True)),
        'heart': ('acg_LeafSet004', dict(min_area=3000)),
        'ivy': ('acg_LeafSet017', dict(min_area=3000)),
        'dry': ('acg_LeafSet030', dict(min_area=800)),
        'dry2': ('acg_LeafSet012', dict(min_area=1500)),
        'tropical': ('ph_anthurium_botany_01', dict(min_area=8000)),
        'island': ('ph_island_tree_02', dict(min_area=4000)),
        'shrub': ('ph_shrub_04', dict(min_area=1200)),
        'narrow': ('ph_shrub_02', dict(min_area=1500, max_aspect=14, taper=True, max_width_ratio=0.3)),
        'arrow': ('ph_potted_plant_02', dict(min_area=20000, solidity=0.5, flip=True)),
        'round': ('ph_calathea_orbifolia_01', dict(min_area=20000)),
        'palmate': ('ph_pachira_aquatica_01', dict(min_area=20000, solidity=0.35)),
        'frond': ('ph_fern_02', dict(min_area=8000, solidity=0.15, max_aspect=30, petiole_flip=False)),
        'bipinnate': ('ph_jacaranda_tree', dict(min_area=8000, solidity=0.1, max_aspect=20, petiole_flip=False)),
        'blade': ('acg_Foliage001', dict(min_area=1500, solidity=0.2, max_aspect=200, petiole_flip=False)),
        'strand': ('acg_Foliage006', dict(min_area=800, solidity=0.1, max_aspect=200, petiole_flip=False)),
        'seed': ('acg_Foliage002', dict(min_area=800, solidity=0.05, max_aspect=200, petiole_flip=False,
                                        max_width_ratio=0.16)),
        'stick': ('acg_StickSet001', dict(min_area=1500, solidity=0.1, max_aspect=60, petiole_flip=False)),
    }[name]
    opts = dict(spec[1])
    flip_all = opts.pop('flip', False)
    sps = extract(spec[0], **opts)
    if flip_all:
        sps = [Sprite(*_crop(*rotate_sprite(s.rgba, s.nrm, 180)[:2]), s.name) for s in sps]
    if name in ('frond', 'bipinnate', 'blade', 'strand', 'seed'):
        # fronds and grass are scanned base-down / tip-up in these atlases? enforce: base = wider end for
        # fronds (stipe), thick end for blades: check which end has more alpha mass in the outer 15%
        fixed = []
        for s in sps:
            a = s.rgba[..., 3]
            n = a.shape[0]
            top, bot = a[: n // 7].sum(), a[-n // 7:].sum()
            if name in ('frond', 'bipinnate'):
                flip = False  # fern/jacaranda scans: decided by stipe = the thin end
                rows = (a > 0.5).sum(1)
                nz = np.nonzero(rows)[0]
                t_thin = (rows[nz[0]:nz[0] + n // 10] < rows.max() * 0.08).mean()
                b_thin = (rows[nz[-1] - n // 10:nz[-1]] < rows.max() * 0.08).mean()
                flip = t_thin > b_thin
            else:
                flip = top > bot
            if flip:
                r2, n2, _ = rotate_sprite(s.rgba, s.nrm, 180)
                r2, n2 = _crop(r2, n2)
                s = Sprite(r2, n2, s.name)
            fixed.append(s)
        sps = fixed
    if not sps:
        raise RuntimeError('no sprites for ' + name)
    _LIB[name] = sps
    print(f'  sprites {name}: {len(sps)}', flush=True)
    return sps


_BARK = None


def bark_color(rng):
    global _BARK
    if _BARK is None:
        _BARK = load('ph_dry_branches_medium_01', 'diffuse', (256, 256))
    base = _BARK[rng.integers(0, 256), rng.integers(0, 256)]
    base = saturate(base[None, None], 0.6)[0, 0]
    return lambda t: np.clip(base * (0.75 + 0.35 * t), 0, 1)


# =======================================================================================
# Leaf colour grading (night palette, depth shading)
# =======================================================================================
GREEN = hex2rgb('#a9c27a')


def leaf_tint(rng, depth, dark=False, autumn=0.0):
    """depth 0 = back (dark, cool) .. 1 = front (pale where headlights hit)."""
    v = (0.42 + 0.7 * depth) * (0.75 if dark else 1.0) * (0.85 + rng.random() * 0.3)
    tint = np.array([0.92 + rng.random() * 0.12, 1.0, 0.85 + rng.random() * 0.1], np.float32)
    if dark:
        tint = tint * np.array([0.88, 1.0, 1.02])
    if autumn and rng.random() < autumn:
        tint = np.array([1.25, 1.0, 0.55], np.float32)
    return tint, v


# =======================================================================================
# Compositions (draw into a Card in its own pixel frame)
# =======================================================================================
def comp_cluster(card, rng, leaves, n, size, base=None, spread=0.42, twigs=6, dark=False, cy=0.5,
                 clumps=None, autumn=0.03, sat=0.78, length_jit=0.35):
    """Leafy twig cluster: twigs from the base fan up into sub-clumps of individually readable leaves."""
    W, H = card.w, card.h
    bx, by = base if base else (W / 2, H * 0.985)
    col_fn = bark_color(rng)
    ends = []
    nclump = clumps or twigs
    for i in range(nclump):
        a = math.radians(90 + (rng.random() - 0.5) * 150)
        d = min(W, H) * (0.18 + rng.random() * spread * 0.75)
        ex = W / 2 + math.cos(a) * d * 0.95
        ey = H * cy - math.sin(a) * d * 0.85 + H * 0.05
        ends.append((ex, ey, min(W, H) * (0.1 + rng.random() * 0.07)))
    fork = (bx + (rng.random() - 0.5) * W * 0.04, by - H * (0.16 + rng.random() * 0.1))
    card.stroke([(bx, by), ((bx + fork[0]) / 2, (by + fork[1]) / 2), fork], min(W, H) * 0.02, min(W, H) * 0.014, col_fn)
    for ex, ey, r in ends:
        sx, sy = fork
        mx, my = (sx + ex) / 2 + (rng.random() - 0.5) * W * 0.12, (sy + ey) / 2 + (rng.random() - 0.5) * H * 0.06
        pts = [(sx + (rng.random() - 0.5) * W * 0.02, sy)]
        for t in np.linspace(0.2, 1, 6):
            qx = (1 - t) ** 2 * pts[0][0] + 2 * (1 - t) * t * mx + t * t * ex
            qy = (1 - t) ** 2 * pts[0][1] + 2 * (1 - t) * t * my + t * t * ey
            pts.append((qx, qy))
        card.stroke(pts, min(W, H) * 0.014, min(W, H) * 0.004, col_fn)
        for k in range(3):
            a = rng.random() * TAU
            card.stroke([(ex, ey), (ex + math.cos(a) * r * 0.9, ey - math.sin(a) * r * 0.8)],
                        min(W, H) * 0.004, min(W, H) * 0.002, col_fn)
    items = []
    per = max(1, n // len(ends))
    for ex, ey, r in ends:
        for k in range(per):
            a = rng.random() * TAU
            rr = math.sqrt(rng.random()) * r
            px, py = ex + math.cos(a) * rr, ey + math.sin(a) * rr * 0.85
            depth = rng.random()
            out_ang = math.degrees(math.atan2(-(py - ey), px - ex))
            items.append((depth, px, py, out_ang))
    for k in range(max(3, n // 12)):
        px, py = W * (0.12 + rng.random() * 0.76), H * (0.1 + rng.random() * 0.7)
        items.append((rng.random(), px, py, math.degrees(math.atan2(-(py - H * 0.9), px - W / 2))))
    items.sort(key=lambda t: t[0])
    for depth, px, py, ang in items:
        sp = leaves[rng.integers(len(leaves))]
        tint, v = leaf_tint(rng, depth, dark, autumn)
        L = size * (1 - length_jit + rng.random() * length_jit * 2)
        tip = ang + (rng.random() - 0.5) * 80
        card.stamp(sp, (px, py), tip, L, tint=tint, value=v, sat=sat, flip=rng.random() < 0.5)


def comp_single(card, rng, sp, base, tip, sat=0.8, value=1.0, tint=None, max_w=None):
    L = math.hypot(tip[0] - base[0], tip[1] - base[1])
    if max_w and sp.width / sp.length * L > max_w:
        L = max_w * sp.length / sp.width
    ang = math.degrees(math.atan2(-(tip[1] - base[1]), tip[0] - base[0]))
    card.stamp(sp, base, ang, L, tint=tint, value=value, sat=sat)


def comp_frond(card, rng, frond, base, tip, value=1.0, sat=0.8, tint=None):
    comp_single(card, rng, frond, base, tip, sat=sat, value=value, tint=tint)


def comp_pinnate(card, rng, leaflets, base, tip, n=40, leaf_len=0.42, droop=0.0, dry=False, rachis=None,
                 width_profile=None, spread_deg=62, sat=0.75):
    """Palm-like frond: rachis from base to tip, paired narrow leaflets angled toward the tip."""
    bx, by = base
    tx, ty = tip
    L = math.hypot(tx - bx, ty - by)
    ang = math.atan2(-(ty - by), tx - bx)
    col_fn = (lambda t: np.array([0.42, 0.36, 0.22]) * (0.9 + 0.2 * t)) if dry else (
        lambda t: np.array([0.36, 0.42, 0.2]) * (0.9 + 0.3 * t))
    pts = []
    for t in np.linspace(0, 1, 12):
        sag = math.sin(t * math.pi) * droop * L
        x = bx + (tx - bx) * t + math.cos(ang - math.pi / 2) * sag
        y = by + (ty - by) * t - math.sin(ang - math.pi / 2) * sag
        pts.append((x, y))
    card.stroke(pts, max(2, L * 0.016), max(1, L * 0.004), rachis or col_fn, shade=0.3)
    for i in range(n):
        t = 0.06 + 0.92 * i / n
        k = int(t * 11)
        f = t * 11 - k
        k = min(k, 10)
        px = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f
        py = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f
        prof = width_profile(t) if width_profile else math.sin(min(1, t * 1.05 + 0.05) * math.pi) ** 0.7
        for side in (-1, 1):
            if dry and rng.random() < 0.15:
                continue
            la = math.degrees(ang) + side * (spread_deg + (rng.random() - 0.5) * 14)
            if dry:
                la -= side * 25 + 30 * (1 if math.degrees(ang) > 0 else -1) * 0.0
            sp = leaflets[rng.integers(len(leaflets))]
            ll = L * leaf_len * prof * (0.85 + rng.random() * 0.3)
            depth = 0.45 + rng.random() * 0.5
            if dry:
                tint, v = np.array([1.35, 1.0, 0.5], np.float32), 0.55 + rng.random() * 0.3
            else:
                tint, v = leaf_tint(rng, depth)
            card.stamp(sp, (px, py), la, max(4, ll), tint=tint, value=v, sat=0.55 if dry else sat,
                       flip=side < 0)


def comp_grass(card, rng, blades, seeds, n=120, tall=True, wrap=True):
    W, H = card.w, card.h
    items = []
    for i in range(n):
        x = rng.random() * W
        h = H * ((0.55 if tall else 0.35) + rng.random() * (0.42 if tall else 0.5))
        lean = (rng.random() - 0.5) * (40 if tall else 60)
        items.append((rng.random(), x, h, lean))
    items.sort(key=lambda t: t[0])
    for depth, x, h, lean in items:
        sp = blades[rng.integers(len(blades))]
        tint, v = leaf_tint(rng, depth * 0.8 + 0.1, autumn=0.12)
        card.stamp(sp, (x, H - 2), 90 + lean, h, tint=tint, value=v, sat=0.7, flip=rng.random() < 0.5)
    if tall and seeds:
        for i in range(n // 9):
            x = rng.random() * W
            sp = seeds[rng.integers(len(seeds))]
            card.stamp(sp, (x, H - 2), 90 + (rng.random() - 0.5) * 24, H * (0.6 + rng.random() * 0.3),
                       tint=np.array([1.1, 1.05, 0.9]), value=0.8, sat=0.45)


def comp_vine(card, rng, leaves, n_strands=10, leafy=True, wrap=True):
    W, H = card.w, card.h
    for i in range(n_strands):
        x0 = W * (0.08 + rng.random() * 0.84)
        sway = (rng.random() - 0.5) * W * 0.12
        root = not leafy or rng.random() < 0.25
        pts = []
        steps = 24
        for k in range(steps + 1):
            t = k / steps
            y = -H * 0.02 + t * H * 1.04
            x = x0 + sway * math.sin(t * math.pi * 2 + i)  # periodic in v -> seamless when tileV
            pts.append((x, y))
        col = (lambda t: np.array([0.38, 0.32, 0.25])) if root else (lambda t: np.array([0.3, 0.36, 0.18]))
        card.stroke(pts, W * (0.012 if root else 0.007), W * (0.009 if root else 0.006), col, shade=0.35)
        if not root:
            for k in range(18 if leafy else 4):
                t = rng.random()
                y = t * H
                x = x0 + sway * math.sin(t * math.pi * 2 + i)
                side = 1 if rng.random() < 0.5 else -1
                sp = leaves[rng.integers(len(leaves))]
                tint, v = leaf_tint(rng, rng.random())
                card.stamp(sp, (x, y), 90 + side * (40 + rng.random() * 60) - 90 * 0.0 - 70,
                           W * (0.08 + rng.random() * 0.05), tint=tint, value=v, sat=0.75, flip=side < 0)


# ---------------------------------------------------------------------------------------
# Banana blades: painted torn silhouette filled with a rectified photo of banana lamina
# ---------------------------------------------------------------------------------------
_LAMINA = {}


def lamina(dead=False):
    """Banana lamina photo patch rectified so the veins run horizontally (along x), with the low
    frequencies flattened (only vein / blotch detail is kept). Mirror-tiled vertically."""
    key = 'dead' if dead else 'fresh'
    if key in _LAMINA:
        return _LAMINA[key]
    from pbcore import flow_angle
    img = load('wm_banana_plant_garden', 'photo')
    patch = img[760:1400, 190:400] if dead else img[1170:1520, 880:1275]
    fa = flow_angle(patch, 12)
    c2, s2 = np.cos(2 * fa).mean(), np.sin(2 * fa).mean()
    ang = math.degrees(0.5 * math.atan2(s2, c2))  # dominant vein direction (image space, y down)
    h, w = patch.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), ang, 1.0)
    rot = cv2.warpAffine(patch, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    s_ = int(min(h, w) * 0.34)
    crop = rot[h // 2 - s_:h // 2 + s_, w // 2 - s_:w // 2 + s_]
    low = cv2.GaussianBlur(crop, (0, 0), 10)
    detail = crop / np.maximum(low, 0.04)
    tile = np.concatenate([detail, detail[::-1]], 0)
    tile = np.concatenate([tile, tile[:, ::-1]], 1)
    _LAMINA[key] = tile.astype(np.float32)
    return _LAMINA[key]


def comp_banana(card, rng, dead=False, torn=0.35, frame=None):
    """Banana blade: midrib vertical through the frame centre (base at the bottom). Veins leave the
    midrib almost square, rising slightly toward the tip; the blade tears into ribbons ALONG the
    veins (wedge slits opening toward the margin), some ribbons broken off with dry ragged ends.
    The lamina is a vein-aligned real photo; colour, slits, midrib and dry edges are painted."""
    W, H = card.w, card.h
    x0, y0, x1, y1 = frame or (0, 0, W, H)
    cw, chh = x1 - x0, y1 - y0
    cx = x0 + cw / 2
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    t = (y1 - yy) / chh  # 0 base .. 1 tip
    tc = np.clip(t, 0, 1)
    dx = np.abs(xx - cx)
    side = (xx > cx).astype(np.int32)
    # oblong blade, blunt tip, tapering base
    hw = cw * 0.47 * np.sqrt(np.clip(1 - np.abs(2 * tc - 1) ** 7, 0, 1)) * (0.55 + 0.45 * sstep(0.0, 0.25, tc))
    if dead:
        hw *= 0.85
    wav = (fbm((W, H), (3, 14), 3, int(rng.integers(1e6))) - 0.5) * cw * 0.03
    margin = hw + wav
    # vein coordinate: constant along a vein (veins rise ~16 deg toward the tip)
    rise = 0.28
    vy = t * chh + dx * rise  # along-blade position where this vein meets the midrib
    inside = (dx < margin) & (t > 0) & (t < 1)
    # slits along veins: wedge gaps opening toward the margin
    nsl = int((8 + 26 * torn) * (1.3 if dead else 1.0))
    gap = np.zeros((H, W), bool)
    broken = np.zeros((H, W), np.float32)
    for sd in (0, 1):
        pos = np.sort(rng.random(nsl)) * chh * 0.96 + chh * 0.02
        for k, p in enumerate(pos):
            d0 = cw * 0.47 * (0.04 + rng.random() * (0.65 if torn < 0.5 else 0.45))
            gw = 1.0 + rng.random() * 2.5 + (dx - d0) / max(cw, 1) * (6 + torn * 18)
            m = (side == sd) & (dx > d0) & (np.abs(vy - p) < gw)
            gap |= m
            # broken ribbon: between this slit and the next, the outer part is missing
            if k + 1 < len(pos) and rng.random() < torn * (0.6 if not dead else 0.9):
                cut = cw * 0.47 * (0.3 + rng.random() * 0.55)
                rag = (fbm((W, H), 30, 3, int(rng.integers(1e6))) - 0.5) * cw * 0.05
                seg = (side == sd) & (vy > p) & (vy < pos[k + 1])
                broken = np.maximum(broken, (seg & (dx > cut + rag)).astype(np.float32))
                # dry fringe just inside the broken end
                broken = np.maximum(broken, (seg & (dx > cut + rag - cw * 0.03) & (dx <= cut + rag)) * 0.5)
    alive = inside & ~gap & (broken < 1)
    alpha = alive.astype(np.float32)
    alpha = cv2.GaussianBlur(alpha, (0, 0), 0.55)
    # --- lamina: vein-aligned photo detail (x = across the vein = along the blade)
    lam = lamina(dead)
    lh, lw = lam.shape[:2]
    scale = 1.25 if not dead else 1.6
    u = (vy * scale) % lw
    v = (dx * scale + side * lh * 0.37) % lh
    det = cv2.remap(lam, u.astype(np.float32), v.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
    det = np.clip(det, 0.4, 1.8)
    if not dead:
        base = hex2rgb('#5d7a34') * (0.85 + 0.3 * fbm((W, H), (2, 5), 3, 41)[..., None])
        base = base * (0.9 + 0.25 * sstep(0.0, 0.5, dx / np.maximum(hw, 1))[..., None])  # paler toward margins
    else:
        base = hex2rgb('#8a6a42') * (0.75 + 0.45 * fbm((W, H), (3, 8), 4, 42)[..., None])
    col = base * (0.55 + 0.45 * saturate(det, 0.6))
    # painted veins (fine, lighter) for the hand-made read
    vein = sstep(0.82, 1.0, np.cos(vy / max(2.6, cw * 0.012) * math.pi * 2) * 0.5 + 0.5)
    col = col * (1 + vein[..., None] * 0.07)
    # dry / yellowing: margins, broken ends, random patches
    edge = 1 - np.clip((margin - dx) / max(cw * 0.05, 1), 0, 1)
    dry = np.clip(edge * (0.7 if not dead else 0.3) * sstep(0.25, 0.6, fbm((W, H), 10, 3, 43)) + broken * 0.9, 0, 1)
    yellow = sstep(0.68, 0.85, fbm((W, H), (2, 6), 4, 44)) * (0.5 if not dead else 0.0)
    col = col * (1 - yellow[..., None]) + col * hex2rgb('#f0d070') * 1.4 * yellow[..., None]
    brown = hex2rgb('#5c4428') * (0.8 + 0.4 * fbm((W, H), 40, 3, 45)[..., None])
    col = col * (1 - dry[..., None]) + brown * dry[..., None]
    # value: darker toward base and tip
    col = col * (0.72 + 0.35 * np.sin(tc * math.pi) ** 0.5)[..., None]
    # midrib (+ petiole stub to the frame bottom)
    mw = cw * (0.026 - 0.016 * tc)
    mr = sstep(mw, mw * 0.55, dx) * (t < 0.985) * (yy <= y1)
    mid_col = (hex2rgb('#b8c486') if not dead else hex2rgb('#a48a5c')) * (0.75 + 0.25 * tc[..., None])
    mid_col = mid_col * (0.85 + 0.15 * np.cos(dx / np.maximum(mw, 1) * math.pi)[..., None])
    col = col * (1 - mr[..., None]) + mid_col * mr[..., None]
    alpha = np.maximum(alpha, mr.astype(np.float32))
    # normals: midrib ridge + vein corrugation + photo micro relief
    hgt = mr * 1.0 + np.cos(vy / max(3.0, cw * 0.02) * math.pi * 2) * 0.05 + (lum(det) - 1) * 0.08
    nrm = normal_from_height(hgt.astype(np.float32), 5, wrap=False)
    rgba = np.concatenate([np.clip(col, 0, 1), alpha[..., None]], -1).astype(np.float32)
    rgba[..., :3] = np.nan_to_num(rgba[..., :3])
    card.over(rgba, nrm, 0, 0)


def cell_px(uv, W, H):
    u0, v0, u1, v1 = uv
    return int(round(u0 * W)), int(round((1 - v1) * H)), int(round(u1 * W)), int(round((1 - v0) * H))


def build_contract(w, keys, S=1024):
    """FOLIAGE_ATLAS layout (src/textures/foliage.js)."""
    rng = np.random.default_rng(424242)
    out = {}

    def new():
        return Card(S, S)

    def to_px(uv):
        return uv[0] * S, (1 - uv[1]) * S

    # ---- leaf_tropical: broad, heart, spray, cluster
    if not keys or 'leaf_tropical' in keys:
        c = new()
        trop = lib('tropical')
        comp_single(c, rng, max(trop, key=lambda s: s.length), to_px([0.25, 0.51]), to_px([0.25, 0.985]), sat=0.8)
        arrow = lib('arrow')
        comp_single(c, rng, arrow[0], to_px([0.75, 0.6]), to_px([0.75, 0.985]), sat=0.8, max_w=S * 0.48)
        sub = Card(S // 2, S // 2)
        comp_cluster(sub, rng, lib('island') + lib('elong'), 34, S * 0.11, twigs=5, spread=0.5)
        _blit(c, sub, 0, S // 2)
        sub = Card(S // 2, S // 2)
        comp_cluster(sub, rng, lib('small') + lib('shrub'), 110, S * 0.06, twigs=7)
        _blit(c, sub, S // 2, S // 2)
        out['leaf_tropical'] = c
    # ---- leaf_banana: fresh, torn
    if not keys or 'leaf_banana' in keys:
        c = new()
        comp_banana(c, rng, dead=False, torn=0.25, frame=(0, 0, S // 2, S))
        c2 = new()
        comp_banana(c2, rng, dead=False, torn=0.7, frame=(S // 2, 0, S, S))
        _merge(c, c2)
        out['leaf_banana'] = c
    # ---- leaf_fern: frond, frond_lacy
    if not keys or 'leaf_fern' in keys:
        c = new()
        fr = sorted(lib('frond'), key=lambda s: -s.length)
        comp_frond(c, rng, fr[0], to_px([0.25, 0.005]), to_px([0.25, 0.99]), value=0.95, sat=0.75)
        comp_frond(c, rng, fr[min(1, len(fr) - 1)], to_px([0.75, 0.005]), to_px([0.75, 0.99]), value=0.85,
                   sat=0.7, tint=np.array([0.95, 1.0, 0.9]))
        out['leaf_fern'] = c
    # ---- leaf_bamboo: fan, droop, spray, sparse
    if not keys or 'leaf_bamboo' in keys:
        c = new()
        nar = lib('narrow')
        _bamboo_twig(c, rng, lib('leaflet'), to_px([0.03, 0.55]), to_px([0.45, 0.95]), 9)
        _bamboo_twig(c, rng, lib('leaflet'), to_px([0.53, 0.97]), to_px([0.95, 0.55]), 9, droop=True)
        _bamboo_twig(c, rng, lib('leaflet'), to_px([0.25, 0.02]), to_px([0.25, 0.48]), 11)
        _bamboo_twig(c, rng, lib('leaflet'), to_px([0.52, 0.25]), to_px([0.98, 0.25]), 6)
        out['leaf_bamboo'] = c
    # ---- leaf_palm: frond (green), frond_dry (base at top, hanging)
    if not keys or 'leaf_palm' in keys:
        c = new()
        nar = lib('leaflet')
        comp_pinnate(c, rng, nar, to_px([0.25, 0.0]), to_px([0.25, 1.0]), n=46, leaf_len=0.4)
        comp_pinnate(c, rng, nar, to_px([0.75, 1.0]), to_px([0.75, 0.0]), n=40, leaf_len=0.32, dry=True,
                     spread_deg=25)
        out['leaf_palm'] = c
    # ---- grass_card: tall (top half), short (bottom half), both tile in u
    if not keys or 'grass_card' in keys:
        c = new()
        t = Card(S, S // 2, wrap_u=True)
        comp_grass(t, rng, lib('blade') + lib('strand'), lib('seed'), n=150, tall=True)
        _blit(c, t, 0, 0)
        b = Card(S, S // 2, wrap_u=True)
        comp_grass(b, rng, lib('strand') + lib('blade'), [], n=190, tall=False)
        _blit(c, b, 0, S // 2)
        out['grass_card'] = c
    # ---- vine: leafy (left), liana (right), both tile in v
    if not keys or 'vine' in keys:
        c = new()
        l = Card(S // 2, S, wrap_v=True)
        comp_vine(l, rng, lib('heart') + lib('ivy'), n_strands=8, leafy=True)
        _blit(c, l, 0, 0)
        r = Card(S // 2, S, wrap_v=True)
        comp_vine(r, rng, lib('heart'), n_strands=9, leafy=False)
        _blit(c, r, S // 2, 0)
        out['vine'] = c
    for key, card in out.items():
        rgba, nrm = card.result()
        w.texture(key, f'foliage/{key}.webp', rgba, 'rgba', wrap='clamp', alpha=True)
        w.texture(key + '_normal', f'foliage/{key}_normal.webp', resize_tile(nrm, (S // 2, S // 2), wrap=False),
                  'normal', wrap='clamp')
        print('  atlas', key, flush=True)


def _blit(dst, src, x, y):
    """Copy a sub-card into dst at (x,y) (replace)."""
    h, w = src.a.shape
    dst.c[y:y + h, x:x + w] = src.c
    dst.a[y:y + h, x:x + w] = src.a
    dst.n[y:y + h, x:x + w] = src.n


def _merge(dst, src):
    m = src.a > dst.a
    dst.c[m], dst.a[m], dst.n[m] = src.c[m], src.a[m], src.n[m]


def _bamboo_twig(card, rng, leaves, base, tip, n, droop=False):
    bx, by = base
    tx, ty = tip
    L = math.hypot(tx - bx, ty - by)
    ang = math.atan2(-(ty - by), tx - bx)
    col = lambda t: np.array([0.5, 0.5, 0.3]) * (0.8 + 0.3 * t)
    pts = [(bx + (tx - bx) * t, by + (ty - by) * t + (math.sin(t * math.pi) * L * 0.08 if droop else 0))
           for t in np.linspace(0, 1, 8)]
    card.stroke(pts, max(2, L * 0.02), max(1, L * 0.006), col)
    for i in range(n):
        t = 0.15 + 0.85 * i / max(1, n - 1)
        k = min(6, int(t * 7))
        f = t * 7 - k
        px = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f
        py = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f
        side = 1 if i % 2 else -1
        la = math.degrees(ang) + side * (35 + rng.random() * 30) - (25 if droop else 0)
        sp = leaves[rng.integers(len(leaves))]
        tint, v = leaf_tint(rng, 0.3 + rng.random() * 0.7)
        card.stamp(sp, (px, py), la, L * (0.38 + rng.random() * 0.2), tint=tint * np.array([1.05, 1.0, 0.85]),
                   value=v, sat=0.75, flip=side < 0)


# ---------------------------------------------------------------------------------------
WORLD_SLOTS = ['broadA', 'broadB', 'rain', 'fig', 'bamboo', 'banana', 'bananaDead', 'palm', 'fern', 'grass',
               'elephant', 'vines', 'shrub', 'deadTwigs', 'epiphyte', 'tallGrass', 'small', 'smallDark']


def build_world(w, keys, SIZE=2048, GRID=5):
    """foliage_world: same SLOT layout as src/world/foliageAtlas.js (grid 5x5, slot = 1/5)."""
    if keys and 'foliage_world' not in keys:
        return
    rng = np.random.default_rng(90210)
    S = int(SIZE / GRID)  # 409
    atlas = Card(SIZE, SIZE)
    for slot, name in enumerate(WORLD_SLOTS):
        c = Card(S, S)
        m = 5  # margin px kept transparent
        if name == 'broadA':
            comp_cluster(c, rng, lib('island') + lib('elong'), 170, S * 0.12, twigs=8)
        elif name == 'broadB':
            comp_cluster(c, rng, lib('tropical') + lib('broad'), 46, S * 0.24, twigs=6)
        elif name == 'rain':
            bp = lib('bipinnate')
            for k in range(9):
                comp_single(c, rng, bp[rng.integers(len(bp))], (S / 2 + (rng.random() - 0.5) * S * 0.2, S - m),
                            (S * (0.1 + rng.random() * 0.8), S * (0.08 + rng.random() * 0.35)), sat=0.7,
                            value=0.6 + rng.random() * 0.45)
        elif name == 'fig':
            comp_cluster(c, rng, lib('pointed') + lib('small'), 170, S * 0.1, twigs=9, dark=True)
        elif name == 'bamboo':
            _bamboo_twig(c, rng, lib('leaflet'), (S / 2, S - m), (S / 2 + S * 0.05, m), 22)
        elif name in ('banana', 'bananaDead'):
            comp_banana(c, rng, dead=name == 'bananaDead', torn=0.4 if name == 'banana' else 0.85,
                        frame=(m, m, S - m, S - m))
        elif name == 'palm':
            comp_pinnate(c, rng, lib('leaflet'), (S / 2, S - m), (S / 2, m), n=42, leaf_len=0.44)
        elif name == 'fern':
            fr = sorted(lib('frond'), key=lambda s: -s.length)
            comp_frond(c, rng, fr[0], (S / 2, S - m), (S / 2, m), sat=0.75)
        elif name == 'grass':
            g = Card(S, S)
            comp_grass(g, rng, lib('blade') + lib('strand'), [], n=70, tall=False)
            _mask_center(g, S)
            c = g
        elif name == 'tallGrass':
            g = Card(S, S)
            comp_grass(g, rng, lib('blade') + lib('strand'), lib('seed'), n=60, tall=True)
            _mask_center(g, S)
            c = g
        elif name == 'elephant':
            comp_single(c, rng, lib('arrow')[0], (S / 2, S * 0.97), (S / 2, S * 0.04), sat=0.8, max_w=S - 2 * m - 4)
        elif name == 'vines':
            v = Card(S, S)
            comp_vine(v, rng, lib('heart') + lib('ivy'), n_strands=14, leafy=True)
            c = v
        elif name == 'shrub':
            comp_cluster(c, rng, lib('shrub') + lib('small'), 190, S * 0.075, twigs=10, cy=0.5)
        elif name == 'deadTwigs':
            st = lib('stick')
            thin = sorted(st, key=lambda q: q.width / q.length)[:4]
            for k in range(9):
                bxk = S * (0.4 + rng.random() * 0.2)
                ang = math.radians(90 + (rng.random() - 0.5) * 110)
                Lk = S * (0.35 + rng.random() * 0.4)
                comp_single(c, rng, thin[rng.integers(len(thin))], (bxk, S - m),
                            (bxk + math.cos(ang) * Lk, S - m - math.sin(ang) * Lk), sat=0.5, value=0.7, max_w=S * 0.06)
            dry = lib('dry') + lib('dry2')
            for k in range(14):
                c.stamp(dry[rng.integers(len(dry))], (S * (0.2 + rng.random() * 0.6), S * (0.15 + rng.random() * 0.6)),
                        rng.random() * 360, S * 0.08, value=0.75, sat=0.6)
        elif name == 'epiphyte':
            fr = lib('frond')
            for k in range(12):
                a = 90 + (k / 11 - 0.5) * 150
                comp_single(c, rng, fr[rng.integers(len(fr))], (S / 2, S * 0.93),
                            (S / 2 + math.cos(math.radians(a)) * S * 0.45, S * 0.93 - math.sin(math.radians(a)) * S * 0.8),
                            sat=0.75, value=0.7 + rng.random() * 0.4)
        elif name in ('small', 'smallDark'):
            comp_cluster(c, rng, lib('small') + lib('shrub'), 320, S * 0.062, twigs=9, clumps=9,
                         dark=name == 'smallDark', spread=0.5)
        x = int(round((slot % GRID) * SIZE / GRID))
        y = int(round((slot // GRID) * SIZE / GRID))
        # keep inside the slot with a margin
        c.a[:m, :] = 0
        c.a[-m:, :] = 0
        c.a[:, :m] = 0
        c.a[:, -m:] = 0
        _blit(atlas, c, x, y)
        print('  world slot', name, flush=True)
    rgba, nrm = atlas.result()
    w.texture('foliage_world', 'foliage/foliage_world.webp', rgba, 'rgba', wrap='clamp', alpha=True,
              extra={'grid': GRID, 'slots': WORLD_SLOTS})
    w.texture('foliage_world_normal', 'foliage/foliage_world_normal.webp',
              resize_tile(nrm, (SIZE // 2, SIZE // 2), wrap=False), 'normal', wrap='clamp')


def _mask_center(card, S):
    """Fade grass clumps toward the slot's left/right edges (a clump card, not a tiling strip)."""
    x = np.linspace(0, 1, S)[None, :]
    f = sstep(0.0, 0.18, x) * sstep(1.0, 0.82, x)
    card.a *= f
    card.c *= f[..., None]
    card.n *= f[..., None]


def build(w, keys):
    build_contract(w, keys)
    build_world(w, keys)
