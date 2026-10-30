"""Blood decals (RGBA): pools, smears, spatter, handprints and drips, photobashed from CC0
liquid / stain scans (ambientCG Smear, Leaking, Fingerprints, SurfaceImperfections) plus
painted fluid shapes. Each variant also gets a ':reduced' twin for settings.gore === 'reduced'
(darker, less saturated, sparser).

Colour model: a thickness field T (0..1) -> thin films are a brighter arterial red, thick
pools near-black crimson, a dark dried rim at the edge, specks of glossy highlight.
"""
import math

import cv2
import numpy as np

from pbcore import blur, blur_dir, fbm, hex2rgb, load, lum, norm01, saturate, sstep, bleed_rgb

THIN, MID, THICK, RIM = hex2rgb('#8c1010'), hex2rgb('#5a0608'), hex2rgb('#240203'), hex2rgb('#1a0505')


def colorize(T, seed, dried=0.0):
    h, w = T.shape
    n = fbm((w, h), 30, 3, seed)
    t = np.clip(T, 0, 1)[..., None]
    col = THIN * (1 - sstep(0.0, 0.45, t)) + MID * (sstep(0.0, 0.45, t) - sstep(0.45, 0.9, t)) + THICK * sstep(0.45, 0.9, t)
    col = col * (0.85 + 0.3 * n[..., None])
    rim = np.exp(-((T - 0.12) / 0.06) ** 2)[..., None] * 0.6
    col = col * (1 - rim) + RIM * rim
    if dried:
        col = col * (1 - dried) + saturate(col, 0.5) * hex2rgb('#a87a60') * dried
    # specular glints of the wet surface (baked, subtle)
    gl = sstep(0.75, 0.95, fbm((w, h), (6, 6), 3, seed + 1)) * sstep(0.5, 0.8, T) * 0.18
    col = col + gl[..., None]
    a = sstep(0.04, 0.12, T)
    return np.concatenate([np.clip(col, 0, 1), a[..., None]], -1).astype(np.float32)


def splats(w, h, rng, centers, field=None):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    f = np.zeros((h, w), np.float32) if field is None else field
    for (cx, cy, r) in centers:
        f += np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (r * r)) * 1.6)
    return f


def pool(seed, S=512):
    rng = np.random.default_rng(seed)
    cs = [(S / 2 + (rng.random() - 0.5) * S * 0.25, S / 2 + (rng.random() - 0.5) * S * 0.2, S * (0.1 + rng.random() * 0.12))
          for _ in range(6)]
    f = splats(S, S, rng, cs)
    f = f + (fbm(S, 6, 4, seed) - 0.5) * 0.6
    sm = norm01(load('acg_Smear002', 'color', (S, S), 'L'))
    T = sstep(0.55, 1.6, f) * (0.75 + 0.35 * sm)
    # satellite drops
    drops = []
    for _ in range(26):
        a, d = rng.random() * math.tau, S * (0.22 + rng.random() * 0.24)
        drops.append((S / 2 + math.cos(a) * d, S / 2 + math.sin(a) * d * 0.8, S * (0.006 + rng.random() * 0.018)))
    T = np.maximum(T, sstep(0.5, 1.4, splats(S, S, rng, drops)) * 0.7)
    return colorize(T, seed)


def smear(seed, S=512):
    rng = np.random.default_rng(seed)
    src = norm01(load('acg_Smear005' if seed % 2 else 'acg_Smear002', 'color', (S, S), 'L'))
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    # a dragging hand: a band across the decal, fingers as 4 parallel streaks fading out
    band = np.exp(-((yy - S * 0.5 - (xx - S / 2) * 0.25) / (S * 0.16)) ** 2)
    fingers = np.zeros((S, S), np.float32)
    for k in range(4):
        off = (k - 1.5) * S * 0.055
        fingers += np.exp(-((yy - S * 0.5 - (xx - S / 2) * 0.25 - off) / (S * 0.012)) ** 2)
    fade = sstep(0.95, 0.15, xx / S)
    T = (band * 0.55 + fingers * 0.6) * fade * (0.55 + 0.6 * src)
    T = T + sstep(0.7, 1.0, src) * band * 0.3
    T = blur(T, 1.2, wrap=False)
    T = np.maximum(T, sstep(0.55, 1.2, splats(S, S, rng, [(S * 0.22, S * 0.45, S * 0.09)])) * 0.95)
    return colorize(T, seed, dried=0.15)


def spatter(seed, S=512):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    T = sstep(0.5, 1.4, splats(S, S, rng, [(S / 2, S / 2, S * 0.08)])) * 0.95
    for _ in range(120):
        a = rng.random() * math.tau
        d = S * (0.08 + rng.random() ** 0.7 * 0.4)
        r = S * (0.004 + rng.random() * 0.016) * (1.2 - d / S)
        cx, cy = S / 2 + math.cos(a) * d, S / 2 + math.sin(a) * d
        # elongated droplet with a tail pointing outward
        u = (xx - cx) * math.cos(a) + (yy - cy) * math.sin(a)
        v = -(xx - cx) * math.sin(a) + (yy - cy) * math.cos(a)
        drop = np.exp(-((u / (r * 2.2)) ** 2 + (v / r) ** 2))
        tail = np.exp(-(((u - r * 3) / (r * 3.5)) ** 2 + (v / (r * 0.35)) ** 2)) * 0.8
        T = np.maximum(T, sstep(0.3, 0.8, drop + tail) * (0.6 + rng.random() * 0.4))
    mist = sstep(0.82, 0.9, fbm(S, 120, 2, seed)) * sstep(S * 0.45, S * 0.1, np.hypot(xx - S / 2, yy - S / 2)) * 0.5
    T = np.maximum(T, mist)
    return colorize(T, seed)


def handprint(seed, S=512, dragged=False):
    src = lum(load('acg_Fingerprints004', 'color', (1024, 1024)))
    m = (src > np.percentile(src, 92)).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(m, np.ones((9, 9), np.uint8)), 8)
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    x, y, w, h, _ = st[i]
    pad = 20
    crop = src[max(0, y - pad):y + h + pad, max(0, x - pad):x + w + pad]
    crop = norm01(crop)
    side = max(crop.shape)
    sq = np.zeros((side, side), np.float32)
    oy, ox = (side - crop.shape[0]) // 2, (side - crop.shape[1]) // 2
    sq[oy:oy + crop.shape[0], ox:ox + crop.shape[1]] = crop
    hand = cv2.resize(sq, (int(S * 0.8), int(S * 0.8)), interpolation=cv2.INTER_AREA)
    T = np.zeros((S, S), np.float32)
    o = int(S * 0.1)
    T[o:o + hand.shape[0], o:o + hand.shape[1]] = hand
    T = sstep(0.25, 0.75, T) * 0.75
    T = np.maximum(T, sstep(0.2, 0.7, blur(T, 3, wrap=False)) * 0.45)  # blood film between the ridges
    if dragged:
        T = np.maximum(T, blur_dir(T, int(S * 0.35), axis=0, wrap=False) * 0.85)
    # drips running down from the fingertips / palm
    rng = np.random.default_rng(seed)
    for _ in range(4 if not dragged else 6):
        x0 = int(S * (0.25 + rng.random() * 0.5))
        y0 = int(S * (0.35 + rng.random() * 0.3))
        L = int(S * (0.1 + rng.random() * 0.35))
        wd = 2 + rng.random() * 3
        xs = np.arange(S)
        for yy in range(y0, min(S - 2, y0 + L)):
            t = (yy - y0) / L
            xc = x0 + math.sin(t * 3 + seed) * 2
            T[yy] = np.maximum(T[yy], np.clip(wd * (1 - t * 0.5) - np.abs(xs - xc), 0, 1) * 0.8)
        T = np.maximum(T, sstep(0.4, 1.0, splats(S, S, rng, [(x0, min(S - 8, y0 + L), wd * 1.8)])) * 0.9)
    return colorize(T, seed, dried=0.1)


def drip(seed, W=256, H=512):
    """Drips from a top seam running down (tileable in u: drips wrap)."""
    rng = np.random.default_rng(seed)
    src = norm01(load('acg_Leaking017A' if seed % 2 else 'acg_Leaking012A', 'color', (W, H), 'L'))
    T = np.zeros((H, W), np.float32)
    T[:int(H * 0.04)] = 0.9
    xs = np.arange(W)
    for _ in range(9):
        x0 = rng.random() * W
        L = H * (0.2 + rng.random() * 0.75)
        wd = 1.5 + rng.random() * 3.5
        for y in range(int(H * 0.03), int(min(H - 6, L))):
            t = y / L
            xc = x0 + math.sin(t * 4 + x0) * 1.5
            d = np.abs((xs - xc + W / 2) % W - W / 2)
            T[y] = np.maximum(T[y], np.clip(wd * (1 - 0.35 * t) - d, 0, 1) * (0.75 + 0.2 * t))
        by = int(min(H - 8, L))
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        dx = np.abs((xx - x0 + W / 2) % W - W / 2)
        T = np.maximum(T, sstep(0.4, 1.0, np.exp(-((dx / (wd * 1.6)) ** 2 + ((yy - by) / (wd * 2.2)) ** 2) * 1.5)) * 0.95)
    T = T * (0.8 + 0.3 * src)  # real leak-streak texture inside the runs
    return colorize(T, seed)


def reduce(rgba, seed):
    out = rgba.copy()
    out[..., :3] = saturate(out[..., :3], 0.5) * 0.55
    h, w = out.shape[:2]
    keep = sstep(0.38, 0.55, fbm((w, h), 10, 3, seed + 99))
    a = out[..., 3] * np.clip(0.6 + keep * 0.6, 0, 1)
    a = cv2.erode(a, np.ones((3, 3), np.uint8))  # the smallest droplets and thin films vanish
    out[..., 3] = a
    return out


DECALS = [
    ('blood_pool', 0, lambda: pool(11), (1.2, 1.2)), ('blood_pool', 1, lambda: pool(12), (0.9, 0.9)),
    ('blood_pool', 2, lambda: pool(13), (1.6, 1.6)),
    ('blood_smear', 0, lambda: smear(21), (0.6, 0.6)), ('blood_smear', 1, lambda: smear(22), (0.6, 0.6)),
    ('blood_spatter', 0, lambda: spatter(31), (0.8, 0.8)), ('blood_spatter', 1, lambda: spatter(32), (0.5, 0.5)),
    ('blood_spatter', 2, lambda: spatter(33), (1.2, 1.2)),
    ('blood_handprint', 0, lambda: handprint(41), (0.24, 0.24)),
    ('blood_handprint', 1, lambda: handprint(42, dragged=True), (0.24, 0.24)),
    ('blood_drip', 0, lambda: drip(51), (0.3, 0.6)), ('blood_drip', 1, lambda: drip(52), (0.3, 0.6)),
    ('blood_drip', 2, lambda: drip(53), (0.3, 0.6)),
]


def build(w, keys):
    for kind, var, fn, size in DECALS:
        if keys and kind not in keys:
            continue
        rgba = fn()
        for reduced in (False, True):
            img = reduce(rgba, var) if reduced else rgba
            img = bleed_rgb(img, passes=6)
            key = f'{kind}:{var}' + (':reduced' if reduced else '')
            rel = f'decals/{kind}_{var}' + ('_reduced' if reduced else '') + '.webp'
            h, wd = img.shape[:2]
            w.entry('decals', key, rel, img, alpha=True,
                    extra={'size': list(size), 'aspect': round(wd / h, 4), 'gore': 'reduced' if reduced else 'full'})
        print('  decal', kind, var, flush=True)
