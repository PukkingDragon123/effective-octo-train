"""Photo detail sets for props / world / creature surfaces that used to be flat colour or
procedural-only (galvanised steel, worn plastic, rubber, glazed ceramic, cardboard / paper,
brick, bamboo culms, plant stems, creature hide).

Most of these are TINTABLE detail maps: props multiply them with their vertex colours (tint +
baked weathering), so the colour maps are near-neutral with a fixed linear mean (NEUTRAL_MEAN)
and src/props/lib/materials.js scales the material colour by 1 / mean. Wear (grime in the pores,
water streaks, rust bleed, scuffs) is in the photo maps; dirt at the bottom and moss on the
damp side come from the painted material / the prop kit on top.

No overpaint brushwork here: real photo detail, kept sharp (unsharp mask, never blurred).
"""
import numpy as np
from scipy import ndimage

from pbcore import (blend_normals, blur, blur_dir, cavity_from_height, cells, decode_normal, fbm, grade, hex2rgb, load,
                    lum, match_stats, normal_from_height, norm01, resize_tile, saturate, scale_normal, sstep, streaks,
                    unsharp, apply_layer)
from surfaces import maps

# linear mean every tintable map is normalised to (materials.js divides by it)
NEUTRAL_MEAN = {
    'galv': 0.40, 'plastic_worn': 0.50, 'rubber_worn': 0.40, 'ceramic': 0.60, 'paper_worn': 0.50, 'stem_fibre': 0.50,
}


def to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def neutral(col, key, warm=(1.0, 1.0, 1.0), sat=0.12):
    """Desaturate toward a near-neutral detail map whose LINEAR mean is NEUTRAL_MEAN[key]."""
    c = saturate(col, sat) * np.asarray(warm, np.float32)
    lin = to_lin(np.clip(c, 0, 1))
    for _ in range(4):  # iterate: clipping changes the mean slightly
        m = lin.reshape(-1, 3).mean(0)
        lin = np.clip(lin * (NEUTRAL_MEAN[key] * np.asarray(warm, np.float32) / np.maximum(m, 1e-4)), 0, 1)
    return to_srgb(lin).astype(np.float32)


def hp(sid, S):
    """Borrowed เฮียผัด PBR set: colour, OpenGL normal, roughness (ORM green), ao (ORM red)."""
    col = load(sid, 'albedo', (S, S))
    nrm = decode_normal(load(sid, 'normal', (S, S)))
    orm = load(sid, 'orm', (S, S))
    return {'color': col, 'normal': nrm, 'rough': orm[..., 1], 'ao': orm[..., 0]}


def lum_n(a):
    return norm01(lum(a))


def out_set(key, col, nrm, rough, sharpen=0.4):
    if sharpen:
        col = unsharp(col, 0.8, sharpen)
    res = {key: ('color', np.clip(col, 0, 1))}
    if nrm is not None:
        res[key + '_normal'] = ('normal', nrm)
    if rough is not None:
        res[key + '_rough'] = ('rough', np.clip(rough, 0.03, 1))
    return res


# =======================================================================================
# Galvanised steel: guardrails, poles hardware, buckets, pipes, shelving, cages
# =======================================================================================
def galv(S=1024):
    g = hp('hp_galvanized_steel', S)
    a = hp('hp_aluminium_scratched', S)
    r = hp('hp_steel_rusty', S)
    lk = load('acg_Leaking006', 'color', (S, S))
    # zinc spangle (galvanised photo) with the dull, chalky mottling of the weathered sheet
    base = lum(g['color'])[..., None] * 0.65 + lum(a['color'])[..., None] * 0.35
    base = np.repeat(base, 3, 2)
    white_rust = sstep(0.55, 0.8, fbm(S, 5, 5, 701) * 0.7 + lum_n(a['color']) * 0.4)
    base = apply_layer(base, base * 0.6 + 0.42, white_rust * 0.35)
    # rust: the rusty-metal scan's orange blooms, only where the zinc is gone
    rr = r['color']
    rustiness = np.clip(lum(np.abs(rr - saturate(rr, 0))) * 4.5, 0, 1)
    region = sstep(0.5, 0.75, fbm(S, 3, 4, 702))
    rmask = np.clip(sstep(0.15, 0.55, rustiness) * region, 0, 1)
    rcol = saturate(rr, 0.75) * 0.85
    col = apply_layer(base, rcol, rmask)
    # rust bleed + water streaks run DOWN the image (down the post / rail face)
    bleed = np.clip(blur_dir(rmask, 70, axis=0) * 1.6 - rmask, 0, 1)
    col = apply_layer(col, col * hex2rgb('#7a4a2a') * 1.4, bleed * 0.55)
    st = streaks(S, 70, 703, (0.15, 0.6), (2, 6))
    col = apply_layer(col, col * (0.55 + lum(lk)[..., None] * 0.35), st * 0.4)
    # grime in the scratches / spangle boundaries
    cav = np.clip(cavity_from_height(lum(g['color']), 3), 0, 1)
    col = col * (1 - cav[..., None] * 0.25)
    col = neutral(col, 'galv', warm=(1.0, 0.99, 0.96), sat=0.55)
    nrm = blend_normals(g['normal'], a['normal'], 0.6)
    nrm = blend_normals(nrm, r['normal'], 0.8 * rmask[..., None] + 0.1)
    rough = g['rough'] * 0.6 + a['rough'] * 0.4
    rough = rough * (1 - rmask) + np.maximum(r['rough'], 0.8) * rmask
    rough = np.clip(rough * 0.9 + white_rust * 0.12 + st * 0.08, 0.25, 1)
    return out_set('galv', col, nrm, rough)


# =======================================================================================
# Worn PP plastic: stools, buckets, crates, chairs, delineator bodies, jerry cans
# =======================================================================================
def plastic_worn(S=1024):
    p = hp('hp_plastic_rough', S)
    sc = maps('acg_Scratches001', S)
    s4 = maps('acg_Scratches004', S)
    base = np.repeat(lum(p['color'])[..., None], 3, 2)
    base = lum(p['color']).mean() + (base - lum(p['color']).mean()) * 1.6  # the scan's scuffs, stronger
    scr = norm01(lum(sc['color'])) * 0.6 + norm01(lum(s4['color'])) * 0.4
    # UV chalking: sun-faded pale patches; fine scratches read lighter; dirt settles in blotches
    chalk = sstep(0.55, 0.85, fbm(S, 4, 5, 711))
    col = apply_layer(base, base * 0.8 + 0.25, chalk * 0.3)
    col = apply_layer(col, col * 1.15 + 0.04, sstep(0.35, 0.8, scr) * 0.45)
    grime = sstep(0.5, 0.85, fbm(S, 9, 4, 712) * 0.7 + fbm(S, 30, 3, 713) * 0.3)
    col = apply_layer(col, col * hex2rgb('#6a6050') * 1.2, blur(grime, 1.2) * 0.2)
    col = neutral(col, 'plastic_worn', warm=(1.0, 0.99, 0.97), sat=0.0)
    n = blend_normals(p['normal'], sc['normal'], 0.5) if 'normal' in sc else p['normal']
    if 'normal' in s4:
        n = blend_normals(n, s4['normal'], 0.4)
    rough = p['rough'] * 0.7 + 0.25 + chalk * 0.12 + grime * 0.1 - sstep(0.4, 0.8, scr) * 0.06
    return out_set('plastic_worn', col, n, rough)


# =======================================================================================
# Rubber: tyres, hoses, cables, black plastic (fine grain, dust, scuffs)
# =======================================================================================
def rubber_worn(S=512):
    rb = maps('acg_Rubber004', S)
    sc = maps('acg_Scratches004', S)
    g = norm01(lum(rb['color']))
    base = np.repeat((0.5 + (g - 0.5) * 0.22)[..., None], 3, 2)  # granular scan, subdued
    dust = sstep(0.5, 0.85, fbm(S, 5, 5, 721) * 0.8 + g * 0.2)
    col = apply_layer(base, base * 0.6 + hex2rgb('#8a8070') * 0.55, dust * 0.4)
    scr = sstep(0.4, 0.85, norm01(lum(sc['color']))) if 'color' in sc else 0
    col = apply_layer(col, col * 1.3, scr * 0.45)
    col = neutral(col, 'rubber_worn', warm=(1.0, 0.99, 0.97), sat=0.0)
    n = scale_normal(rb['normal'], 1.8)
    if 'normal' in sc:
        n = blend_normals(n, sc['normal'], 0.6)
    rough = np.clip(rb['rough'] * 0.4 + 0.52 + dust * 0.15 - scr * 0.12, 0.4, 1)
    return out_set('rubber_worn', col, n, rough, sharpen=0.25)


# =======================================================================================
# Glazed ceramic / porcelain / painted plaster figures: crazing, pinholes, glaze runs, grime
# =======================================================================================
def ceramic(S=1024):
    pw = maps('ph_peeling_painted_wall', S)
    dr = maps('acg_SurfaceImperfections010', S)
    sc = maps('acg_Scratches004', S)
    # crazing: the crack network of the painted-wall scan, scaled finer and thinned to hairlines
    ch = resize_tile(np.tile(pw['height'], (2, 2)), (S, S))
    craze = sstep(0.06, 0.0, ch - blur(ch, 1.5) + 0.035)
    craze = np.clip(craze * sstep(0.35, 0.65, fbm(S, 3, 4, 731) + 0.2), 0, 1)
    drips = norm01(lum(dr['color'])) if 'color' in dr else np.zeros((S, S), np.float32)
    scr = norm01(lum(sc['color'])) if 'color' in sc else np.zeros((S, S), np.float32)
    glaze = 0.84 + (fbm(S, 3, 4, 734) - 0.5) * 0.08 + (fbm(S, 24, 3, 732) - 0.5) * 0.03
    col = np.repeat(glaze[..., None], 3, 2) * hex2rgb('#f4efe4')
    # glaze runs (slightly darker, thicker glaze), grime in the crazing, pinholes, dirty patches
    col = apply_layer(col, col * 0.9, sstep(0.3, 0.8, drips) * 0.35)
    col = apply_layer(col, col * hex2rgb('#5a5040') * 0.95, craze * 0.3)
    pin = sstep(0.93, 0.99, fbm(S, 90, 2, 735))
    col = apply_layer(col, col * 0.5, pin * 0.5)
    dirt = sstep(0.55, 0.9, fbm(S, 5, 5, 736) * 0.8 + fbm(S, 20, 3, 737) * 0.25)
    col = apply_layer(col, col * hex2rgb('#8a7a60') * 1.05, dirt * 0.4)
    col = neutral(col, 'ceramic', warm=(1.0, 0.985, 0.95), sat=0.4)
    h = 1 - craze * 0.35 - pin * 0.5 + sstep(0.3, 0.8, drips) * 0.15
    n = normal_from_height(blur(h, 0.7), 2.0)
    if 'normal' in sc:
        n = blend_normals(n, sc['normal'], 0.2)
    # glossy glaze, duller where dirty, scratched or crazed
    rough = np.clip(0.14 + dirt * 0.35 + scr * 0.15 + craze * 0.2, 0.08, 1)
    return out_set('ceramic', col, n, rough, sharpen=0.3)


# =======================================================================================
# Cardboard / paper: boxes, newspapers, talismans, joss paper stacks
# =======================================================================================
def paper_worn(S=1024):
    p3 = maps('acg_Paper003', S)
    cb = maps('acg_Cardboard001', S)
    lk = load('acg_Leaking012A', 'color', (S, S))
    base = lum(p3['color'])[..., None] * 0.55 + lum(cb['color'])[..., None] * 0.45
    col = np.repeat(base, 3, 2)
    # water tide-lines and mould freckles, darker creases
    tide = sstep(0.35, 0.6, 1 - norm01(lum(lk)))
    region = sstep(0.55, 0.8, fbm(S, 3, 4, 741))
    col = apply_layer(col, col * hex2rgb('#8a7050') * 1.0, tide * region * 0.55)
    freck = sstep(0.9, 0.98, fbm(S, 70, 2, 742)) * sstep(0.5, 0.8, fbm(S, 4, 3, 743))
    col = apply_layer(col, col * 0.4, freck * 0.6)
    col = neutral(col, 'paper_worn', warm=(1.0, 0.97, 0.9), sat=0.2)
    n = blend_normals(p3['normal'], cb['normal'], 0.6)
    rough = np.clip(0.82 + (p3['rough'] - 0.5) * 0.2 if 'rough' in p3 else np.full((S, S), 0.86), 0.6, 1)
    return out_set('paper_worn', col, n, rough)


# =======================================================================================
# Brick: ruined temple walls, crematorium chimney (vertex colours tint it; mean like the old map)
# =======================================================================================
def brick(S=1024):
    b = hp('hp_brick_exposed_red', S)
    lk = load('acg_Leaking004', 'color', (S, S))
    ms = maps('acg_Moss002', S)
    col = saturate(b['color'], 0.55)
    # soot / water streaks down the wall, efflorescence salts on the mortar, moss in the joints
    st = streaks(S, 60, 751, (0.2, 0.7), (2, 6))
    col = apply_layer(col, col * (0.45 + lum(lk)[..., None] * 0.4), st * 0.45)
    mortar = sstep(0.55, 0.8, 1 - norm01(b['ao']) * 0.5 - norm01(lum(b['color'])) * 0.6 + 0.35)
    salts = sstep(0.6, 0.85, fbm(S, 6, 4, 752)) * mortar
    col = apply_layer(col, col * 0.5 + 0.38, salts * 0.4)
    mz = sstep(0.62, 0.85, fbm(S, 4, 5, 753)) * mortar
    col = apply_layer(col, saturate(ms['color'], 0.45) * 0.8, mz * 0.6)
    col = grade(col, sat=0.85, contrast=1.04)
    col = match_stats(col, hex2rgb('#6a5248'), strength=0.9)
    n = b['normal']
    rough = np.clip(b['rough'] * 0.8 + 0.18 + mz * 0.05, 0.5, 1)
    return out_set('brick', col, n, rough)


# =======================================================================================
# Bamboo culm + plant-stem fibres, assembled from single canes of the bamboo scan
# =======================================================================================
def _canes(sid='acg_Bamboo001A'):
    col = load(sid, 'color')
    nrm = decode_normal(load(sid, 'normalgl'))
    rough = load(sid, 'roughness', mode='L')
    L = lum(col)
    H, W = L.shape
    prof = ndimage.uniform_filter1d(L.mean(0), 5, mode='wrap')
    # cane boundaries = dark column minima, ~40 px apart
    mins = [x for x in range(W) if prof[x] == prof[max(0, x - 18):x + 19].min()]
    edges = sorted(set(mins))
    strips = []
    for a, b in zip(edges, edges[1:]):
        if b - a < 28:
            continue
        c0, c1 = a + (b - a) // 4, b - (b - a) // 4  # flat-lit centre half of the cane
        rows = ndimage.uniform_filter1d(L[:, c0:c1].mean(1), 3, mode='wrap')
        nodes = [y for y in range(H) if rows[y] == rows[max(0, y - 40):y + 41].min() and rows[y] < np.median(rows) * 0.8]
        strips.append(dict(c0=c0, c1=c1, nodes=nodes))
    return col, nrm, rough, strips


def _assemble(col, nrm, rough, strips, W, H, node=True, seed=1):
    """Tile of side-by-side cane centres, each internode resampled to H rows (node ring near the bottom)."""
    rng = np.random.default_rng(seed)
    cols, ns, rs = [], [], []
    good = [s for s in strips if len(s['nodes']) >= 2]
    while sum(c.shape[1] for c in cols) - 6 * max(0, len(cols) - 1) < W + 14:
        s = good[rng.integers(len(good))]
        k = rng.integers(len(s['nodes']) - 1)
        n0, n1 = s['nodes'][k], s['nodes'][k + 1]
        if n1 - n0 < 90:
            continue
        if node:
            y0, y1 = n0 + 6, n1 + 6  # top just below ring n0, bottom just past ring n1 (ring ~6 rows from the bottom)
        else:
            y0, y1 = n0 + 10, n1 - 10  # internode only (no ring)
        sl = slice(s['c0'], s['c1'])
        rows = np.arange(y0, y1) % col.shape[0]
        def rs_(a):
            a = a[rows][:, sl]
            from PIL import Image
            if a.ndim == 2:
                im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), 'L')
                return np.asarray(im.resize((a.shape[1], H), Image.LANCZOS), np.float32) / 255
            im = Image.fromarray((np.clip(a * 0.5 + 0.5 if a.min() < 0 else a, 0, 1) * 255).astype(np.uint8), 'RGB')
            out = np.asarray(im.resize((a.shape[1], H), Image.LANCZOS), np.float32) / 255
            return out
        cols.append(rs_(col))
        nn = rs_(nrm) * 2 - 1
        ns.append(nn / (np.linalg.norm(nn, axis=2, keepdims=True) + 1e-6))
        rs.append(rs_(rough))
    # cross-fade neighbours over 6 px so the strips read as one surface
    def join(parts, ch):
        out = parts[0]
        for p in parts[1:]:
            f = 6
            w = np.linspace(0, 1, f)[None, :, None] if ch else np.linspace(0, 1, f)[None, :]
            mid = out[:, -f:] * (1 - w) + p[:, :f] * w
            out = np.concatenate([out[:, :-f], mid, p[:, f:]], 1)
        return out
    c, n, r = join(cols, 1), join(ns, 1), join(rs, 0)
    # wrap seam in u: cross-fade the overhang back onto the start
    over = c.shape[1] - W
    if over > 0:
        f = min(over, 12)
        def wrapfix(a):
            head, tail = a[:, :W].copy(), a[:, W:W + f]
            w = np.linspace(1, 0, f)[None, :] if a.ndim == 2 else np.linspace(1, 0, f)[None, :, None]
            head[:, :f] = tail * w + head[:, :f] * (1 - w)
            return head
        c, n, r = wrapfix(c), wrapfix(n), wrapfix(r)
    n = n / (np.linalg.norm(n, axis=2, keepdims=True) + 1e-6)
    return c[:, :W], n[:, :W], r[:, :W]


def bamboo_culm(S=512):
    col, nrm, rough, strips = _canes()
    c, n, r = _assemble(col, nrm, rough, strips, S, S, node=True, seed=761)
    # v seam: the tile runs ring -> ring, cross-fade the top/bottom 8 rows
    f = 8
    w = np.linspace(0, 1, f)[:, None, None]
    c[:f] = c[-f:] * (1 - w) + c[:f] * w
    n[:f] = n[-f:] * (1 - w) + n[:f] * w
    r[:f] = r[-f:] * (1 - w[..., 0]) + r[:f] * w[..., 0]
    # weathering on living culms: waxy grey bloom near the node, dark mould freckles, dry streaks
    yy = np.linspace(0, 1, S)[:, None]
    bloom = sstep(0.75, 0.97, yy) * 0.35 + sstep(0.55, 0.85, fbm(S, (3, 8), 4, 762)) * 0.25
    c = apply_layer(c, saturate(c, 0.3) * 0.85 + 0.12, bloom)
    mould = sstep(0.88, 0.97, fbm(S, (40, 60), 3, 763)) * sstep(0.45, 0.75, fbm(S, 3, 3, 764))
    c = apply_layer(c, c * hex2rgb('#3a3426') * 1.2, mould * 0.7)
    dry = sstep(0.6, 0.85, fbm(S, (6, 1.5), 4, 765))
    c = apply_layer(c, saturate(c, 0.4) * hex2rgb('#b89a6a') * 1.1, dry * 0.35)
    c = grade(c, sat=0.62, contrast=1.05)
    c = match_stats(c, hex2rgb('#6e7c46'), strength=0.9)
    return out_set('bamboo_culm', c, n, np.clip(r * 0.8 + 0.15, 0.3, 1), sharpen=0.5)


def stem_fibre(S=512):
    col, nrm, rough, strips = _canes()
    c, n, r = _assemble(col, nrm, rough, strips, S, S, node=False, seed=771)
    f = 16
    w = np.linspace(0, 1, f)[:, None, None]
    c[:f] = c[-f:] * (1 - w) + c[:f] * w
    n[:f] = n[-f:] * (1 - w) + n[:f] * w
    L = lum(c)
    hi = L - blur(L, 6) + 0.5  # longitudinal striations only (the scan's colour is not used)
    lk = load('acg_Leaking006', 'color', (S, S))
    base = np.repeat(np.clip(0.55 + (hi - 0.5) * 1.6, 0, 1)[..., None], 3, 2)
    # dark sap blotches and papery dry patches (banana pseudostems, petioles)
    blot = sstep(0.62, 0.85, fbm(S, (6, 1.5), 5, 772))
    base = apply_layer(base, base * 0.6, blot * 0.35)
    dry = sstep(0.58, 0.85, fbm(S, (5, 1), 4, 773))
    base = apply_layer(base, base * hex2rgb('#d8b890') * 1.15, dry * 0.3)
    base = apply_layer(base, base * (0.6 + lum(lk)[..., None] * 0.4), streaks(S, 40, 774, (0.3, 0.8), (1, 3)) * 0.3)
    base = neutral(base, 'stem_fibre', warm=(1.0, 0.97, 0.9), sat=1.0)
    return out_set('stem_fibre', base, n, None, sharpen=0.4)


# =======================================================================================
# Creature hide (elephant): leather grain + rock cracks; RGB = mean-0.5 modulation, A = height
# =======================================================================================
def creature_hide(S=512):
    le = maps('ph_brown_leather', S)
    rk = maps('ph_mossy_rock', S)
    lh = le['height'] if 'height' in le else norm01(lum(le['color']))
    # deep wrinkle network from the rock scan's crevices at two scales
    rh = rk['height']
    big = resize_tile(rh, (S, S))
    fine = resize_tile(np.tile(rh, (3, 3)), (S, S))
    wr = np.clip((blur(big, 3) - big) * 6, 0, 1) * 0.6 + np.clip((blur(fine, 2) - fine) * 6, 0, 1) * 0.4
    h = np.clip(0.55 + (lh - 0.5) * 0.5 - wr * 0.6, 0, 1)
    mod = 0.5 + (lum(le['color']) - lum(le['color']).mean()) * 0.6 - wr * 0.25
    mud = sstep(0.6, 0.85, fbm(S, 4, 4, 781))
    rgb = np.stack([mod + mud * 0.06, mod + mud * 0.03, mod - mud * 0.03], -1)
    rgba = np.concatenate([np.clip(rgb, 0, 1), h[..., None]], -1)
    return {'creature_hide': ('rgba_data', rgba.astype(np.float32))}


# =======================================================================================
# Creek / pond surface: dark water, floating leaves and pollen scum; photo ripple normals
# =======================================================================================
def water_surface(S=1024):
    w = hp('hp_water_canal_calm', S)
    lv = maps('ph_forest_leaves_04', S)
    dk = maps('ph_dry_decay_leaves', S)
    # floating debris: clumps of leaf litter drifting together (elongated along the flow = v)
    clump = sstep(0.62, 0.78, fbm(S, (4, 2), 5, 791) * 0.75 + fbm(S, (16, 8), 3, 792) * 0.25)
    leaves = apply_layer(lv['color'], dk['color'], sstep(0.4, 0.6, fbm(S, 6, 3, 793)))
    leaf_alpha = sstep(0.25, 0.45, lum(leaves)) * clump  # the litter scan's dark gaps stay open water
    water = np.ones((S, S, 3), np.float32) * hex2rgb('#14191b')
    water = water * (0.85 + 0.3 * fbm(S, 3, 4, 794)[..., None])
    film = sstep(0.55, 0.8, fbm(S, (6, 1.5), 5, 795)) * 0.35  # pale pollen / dust film in streaks
    col = apply_layer(water, water * 1.6 + hex2rgb('#3a3a2a') * 0.25, film)
    col = apply_layer(col, grade(leaves, sat=0.7) * 0.55, leaf_alpha)
    n = blend_normals(w['normal'], scale_normal(lv['normal'], 0.0), 1.0)
    n = n * (1 - leaf_alpha[..., None]) + scale_normal(lv['normal'], 0.6) * leaf_alpha[..., None]
    n = n / (np.linalg.norm(n, axis=2, keepdims=True) + 1e-6)
    rough = np.clip(0.05 + film * 0.12 + leaf_alpha * 0.75, 0.04, 1)
    return out_set('water_surface', col, n, rough, sharpen=0.3)


# =======================================================================================
# Woven bamboo strips (กระด้ง winnowing trays, baskets): the woven band of a bamboo wall scan
# (between its battens) stacked into a seamless tile, with soot, rice dust and age
# =======================================================================================
def bamboo_weave(S=1024):
    b = hp('hp_bamboo_woven', 1024)
    band, f = 256, 24
    y0 = 400  # woven band between the battens (rows ~390..690 of the 1024 scan)
    def stack(a):
        seg = a[y0:y0 + band + f]
        out = np.zeros((band * 4,) + a.shape[1:], np.float32)
        w = np.linspace(0, 1, f).reshape((f,) + (1,) * (a.ndim - 1))
        for k in range(4):
            out[k * band:(k + 1) * band] = seg[:band]
        for k in range(4):  # cross-fade each band's head with the previous band's overhang
            r0 = k * band
            prev = seg[band:band + f]
            out[r0:r0 + f] = prev * (1 - w) + seg[:f] * w
        return out
    col, n, r = stack(b['color']), stack(b['normal']), stack(b['rough'])
    n = n / (np.linalg.norm(n, axis=2, keepdims=True) + 1e-6)
    soot = blur(sstep(0.5, 0.9, fbm(S, 3, 3, 801)), 4)
    col = apply_layer(col, col * hex2rgb('#3a2c20') * 1.4, soot * 0.35)
    dust = blur(sstep(0.6, 0.9, fbm(S, 8, 3, 802)), 2)
    col = apply_layer(col, col * 0.75 + hex2rgb('#d8ccb0') * 0.25, dust * 0.25)
    col = grade(col, sat=0.8, contrast=1.05)
    col = match_stats(col, hex2rgb('#8a6c48'), strength=0.8)
    return out_set('bamboo_weave', col, n, np.clip(r * 0.8 + 0.2 + soot * 0.05, 0.4, 1), sharpen=0.35)


PROP_SURFACES = {
    'built/galv': (galv, 1024),
    'built/plastic_worn': (plastic_worn, 1024),
    'built/rubber_worn': (rubber_worn, 512),
    'built/ceramic': (ceramic, 1024),
    'built/paper_worn': (paper_worn, 1024),
    'built/brick': (brick, 1024),
    'nature/bamboo_culm': (bamboo_culm, 512),
    'nature/stem_fibre': (stem_fibre, 512),
    'nature/creature_hide': (creature_hide, 512),
    'nature/water_surface': (water_surface, 1024),
    'built/bamboo_weave': (bamboo_weave, 1024),
}
