"""Photobashed tileable surfaces: CC0 photo scans + painted overpaint + weathering.

Each recipe returns {key: (kind, array)} with kind in 'color' | 'normal' | 'rough' | 'height'.
Keys match src/textures (tex(key)). Colour means are calibrated against the procedural
library (PROC_MEAN) so materials tuned by other modules keep their overall value/hue,
while the detail becomes real photo detail.
"""
import numpy as np

from pbcore import (blend_normals, blur, blur_dir, brush_strokes, cavity_from_height, cells, decode_normal,
                    edge_wear, fbm, grade, has_map, hex2rgb, kuwahara, load, lum, match_stats, normal_from_height,
                    norm01, painterly, resize_tile, saturate, scale_normal, sstep, streaks, unsharp, apply_layer,
                    flat_normal)

# mean sRGB colour of each procedural texture (see src/textures/mat_*.js), used as calibration
PROC_MEAN = {
    'asphalt': '#424243', 'bark': '#575147', 'bark_banyan': '#676357', 'carpet': '#2c2723', 'cloth_green': '#226736',
    'cloth_red': '#982623', 'cloth_yellow': '#b68c1e', 'concrete': '#7f7c72', 'concrete_moss': '#5b6046',
    'dash_plastic': '#262628', 'fabric_cotton': '#cdc7b9', 'fabric_denim': '#36486b', 'fabric_seat': '#3c4350',
    'fabric_silk': '#c4bcab', 'gold_leaf': '#9c7a31', 'gravel': '#544f49', 'headliner': '#a89c84',
    'lantern_paper': '#af3d20', 'leaf_litter': '#2e2318', 'leather_seat': '#3c2119', 'metal_painted': '#6c7c76',
    'monk_robe': '#ad6420', 'moss': '#3c4f16', 'paint_peel_red': '#75251d', 'paint_peel_white': '#bcb9aa',
    'red_lacquer': '#771613', 'rock': '#5d5e55', 'roof_corrugated': '#756458', 'roof_tiles': '#7b402b',
    'rust': '#784220', 'soil': '#413325', 'taxi_paint': '#e0ddd7', 'taxi_paint_green': '#22683c',
    'taxi_paint_yellow': '#d3ab2c', 'wood_old': '#756c5f', 'wood_planks': '#675d51',
}

PH = dict(color='diffuse', normal='nor_gl', rough='rough', height='displacement', ao='ao')
ACG = dict(color='color', normal='normalgl', rough='roughness', height='displacement', ao='ambientocclusion',
           opacity='opacity')


def maps(sid, S, tile_square=True):
    """Standard maps of a source at S x S (non-square sources are tiled to square first)."""
    names = PH if sid.startswith('ph_') else ACG
    out = {}
    for k, n in names.items():
        if not has_map(sid, n):
            continue
        mode = 'L' if k in ('rough', 'height', 'ao', 'opacity') else 'RGB'
        a = load(sid, n, None, mode)
        H, W = a.shape[:2]
        if tile_square and W != H:
            if W < H:
                r = H // W
                parts = [np.roll(a, (i * H) // (2 * r), axis=0) for i in range(r)]
                a = np.concatenate(parts, axis=1)
            else:
                r = W // H
                parts = [np.roll(a, (i * W) // (2 * r), axis=1) for i in range(r)]
                a = np.concatenate(parts, axis=0)
        a = resize_tile(a, (S, S))
        out[k] = decode_normal(a) if k == 'normal' else a
    if 'height' in out:
        out['height'] = norm01(out['height'])
    return out


def target(key):
    return hex2rgb(PROC_MEAN[key])


def finish(key, col, nrm=None, rough=None, height=None, strength=0.85, std=None, sharpen=0.35):
    col = match_stats(col, target(key), strength=strength, std_scale=std)
    if sharpen:
        col = unsharp(col, 0.8, sharpen)
    out = {key: ('color', col)}
    if nrm is not None:
        out[key + '_normal'] = ('normal', nrm)
    if rough is not None:
        out[key + '_rough'] = ('rough', np.clip(rough, 0.02, 1))
    if height is not None:
        out[key + '_height'] = ('height', height)
    return out


# =======================================================================================
# Ground & stone
# =======================================================================================
def asphalt(S=2048):
    m = maps('ph_asphalt_02', S)
    col, n, r, h = m['color'], m['normal'], m['rough'], m['height']
    tr = maps('ph_asphalt_track', S)
    # --- tar patches (repairs): irregular rectangles of darker, finer, newer asphalt
    rng = np.random.default_rng(7)
    patch = np.zeros((S, S), np.float32)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    edge_n = fbm(S, 24, 4, 71)
    for _ in range(5):
        cx, cy = rng.random() * S, rng.random() * S
        w, hh = S * (0.08 + rng.random() * 0.22), S * (0.05 + rng.random() * 0.14)
        a = (rng.random() - 0.5) * 0.25
        dx = (xx - cx + S / 2) % S - S / 2
        dy = (yy - cy + S / 2) % S - S / 2
        u = dx * np.cos(a) + dy * np.sin(a)
        v = -dx * np.sin(a) + dy * np.cos(a)
        d = np.maximum(np.abs(u) - w / 2, np.abs(v) - hh / 2) + (edge_n - 0.5) * S * 0.02
        patch = np.maximum(patch, sstep(2.0, -2.0, d))
    patch_col = grade(tr['color'], sat=0.5, contrast=1.1) * 0.62
    col = apply_layer(col, patch_col, patch)
    h = h * (1 - patch * 0.6) + (tr['height'] * 0.4 + 0.45) * patch
    n = blend_normals(n * (1 - patch[..., None]) + tr['normal'] * patch[..., None], normal_from_height(blur(patch, 1.5), 5))
    r = r * (1 - patch) + (tr['rough'] * 0.9) * patch
    # --- crack network + black tar crack-sealing bands (common on Thai rural roads)
    f1, _ = cells(S // 4, 26, seed=11)
    f1b, _ = cells(S // 4, 26, seed=12)
    edges = resize_tile(np.abs(f1 - f1b), (S, S))
    crack_n = fbm(S, 10, 5, 13)
    crack = sstep(0.06, 0.0, edges) * sstep(0.35, 0.6, crack_n)
    fine = fbm(S, 60, 4, 14, aniso=(1, 1))
    crack = np.maximum(crack, sstep(0.035, 0.0, np.abs(fine - 0.5)) * sstep(0.55, 0.75, crack_n) * 0.7)
    crack *= 1 - patch * 0.7
    seal = blur(sstep(0.2, 0.6, blur(crack, 3) * 3), 1.2) * sstep(0.45, 0.7, fbm(S, 6, 3, 15))
    col = apply_layer(col, col * 0.35, crack * 0.85)
    col = apply_layer(col, np.full_like(col, 0.045), seal * 0.9)
    h = h - crack * 0.35 + seal * 0.08
    r = r * (1 - seal * 0.55) - crack * 0.1
    # --- wetness: low areas and seal bands get glossier (puddle film), grime in cavities
    cav = np.clip(cavity_from_height(h, 10), 0, 1)
    wet = sstep(0.25, 0.8, cav) * sstep(0.35, 0.7, fbm(S, 5, 3, 16))
    r = r * (1 - wet * 0.45)
    col = col * (1 - wet[..., None] * 0.22)
    # --- tyre polish: two faint smoother bands along v (wheel tracks) slightly darker
    u = np.linspace(0, 1, S, endpoint=False)[None, :]
    tracks = (sstep(0.12, 0.0, np.abs(u - 0.28)) + sstep(0.12, 0.0, np.abs(u - 0.72))) * 0.5
    r = r * (1 - tracks * 0.18)
    col = col * (1 - tracks[..., None] * 0.08)
    col = grade(col, sat=0.55, contrast=1.08, shadow_tint='#1d2a30', shadow_amt=0.25)
    col = painterly(col, sigma=10, strokes=int(2600 * (S / 2048) ** 2), length=46, width=15, seed=17, opacity=0.32,
                    detail=1.12, kuwa=5)
    n = blend_normals(n, normal_from_height(blur(h, 1.0), 2.5), 0.6)
    out = finish('asphalt', col, n, r, None, strength=0.9)
    out['asphalt_height'] = ('height', norm01(h))
    return out


def concrete(S=1024):
    m = maps('ph_dirty_concrete', S)
    col, n, r, h = m['color'], m['normal'], m['rough'], m['height']
    st = streaks(S, n=70, seed=21, length=(0.15, 0.6), width=(2, 6), soft=1.5)
    lk = load('acg_Leaking004', 'color', (S, S))
    col = apply_layer(col, col * (0.55 + lum(lk)[..., None] * 0.4), st * 0.55)
    cav = np.clip(cavity_from_height(h, 8), 0, 1)
    col = apply_layer(col, col * hex2rgb('#4a4a40') * 1.4, cav * 0.35)
    col = grade(col, sat=0.6, contrast=1.05, shadow_tint='#26302c', shadow_amt=0.2)
    col = painterly(col, sigma=7, strokes=1500, length=30, width=10, seed=22, opacity=0.35, detail=1.1)
    r = r * (1 - st * 0.15)
    return finish('concrete', col, n, r)


def concrete_moss(S=1024):
    m = maps('ph_dirty_concrete', S)
    col, n, r, h = m['color'], m['normal'], m['rough'], m['height']
    cm = maps('ph_concrete_moss', S)
    mo = maps('acg_Moss002', S)
    # mossy plaster as a mid layer for stains, moss scan for the lush cushions
    noise = fbm(S, 5, 4, 31)
    cav = np.clip(cavity_from_height(blur(h, 3), 18), 0, 1) * 0.5 + fbm(S, 12, 4, 36) * 0.5
    stain = sstep(0.4, 0.75, noise * 0.7 + cav * 0.6)
    col = apply_layer(col, col * 0.4 + cm['color'] * 0.75, stain * 0.8)
    cush = fbm(S, 7, 3, 32, beta=1.4)
    moss_m = sstep(0.58, 0.72, noise * 0.55 + cush * 0.35 + cav * 0.3)
    moss_m = np.clip(moss_m + sstep(0.8, 0.9, fbm(S, 11, 3, 33)) * 0.7, 0, 1)
    moss_m = np.clip(moss_m * (0.75 + 0.5 * sstep(0.3, 0.7, mo['height'])), 0, 1)
    mcol = grade(mo['color'], sat=0.85, contrast=1.08) * hex2rgb('#d4d684') * 1.3
    col = apply_layer(col, mcol, moss_m)
    h = h * (1 - moss_m) + (0.55 + mo['height'] * 0.45) * moss_m
    n = blend_normals(n * (1 - moss_m[..., None]) + mo['normal'] * moss_m[..., None], normal_from_height(blur(moss_m, 2), 3))
    r = r * (1 - moss_m) + 0.92 * moss_m
    st = streaks(S, n=50, seed=34, length=(0.2, 0.6), width=(2, 5))
    col = apply_layer(col, col * 0.6, st * 0.4 * (1 - moss_m))
    col = grade(col, sat=0.78, contrast=1.05, shadow_tint='#1f2c22', shadow_amt=0.25)
    col = painterly(col, sigma=6, strokes=1700, length=24, width=9, seed=35, opacity=0.4, detail=1.1)
    return finish('concrete_moss', col, n, r, strength=0.7)


def moss(S=1024):
    a, b = maps('acg_Moss002', S), maps('acg_Moss003', S)
    m = sstep(0.4, 0.6, fbm(S, 4, 4, 41))
    col = a['color'] * (1 - m[..., None]) + b['color'] * m[..., None]
    n = a['normal'] * (1 - m[..., None]) + b['normal'] * m[..., None]
    r = a['rough'] * (1 - m) + b['rough'] * m
    col = grade(col, sat=0.8, contrast=1.08)
    col = painterly(col, sigma=5, strokes=1600, length=16, width=7, seed=42, opacity=0.4, detail=1.15)
    return finish('moss', col, n, r)


def soil(S=1024):
    a, b = maps('ph_red_laterite_soil_stones', S), maps('ph_forest_ground_04', S)
    m = sstep(0.35, 0.65, fbm(S, 4, 4, 51))[..., None]
    col = a['color'] * (1 - m) + b['color'] * m
    n = a['normal'] * (1 - m) + b['normal'] * m
    r = a['rough'] * (1 - m[..., 0]) + b['rough'] * m[..., 0]
    col = grade(col, sat=0.7, contrast=1.05, shadow_tint='#1f1a14', shadow_amt=0.2)
    col = painterly(col, sigma=6, strokes=1500, length=20, width=8, seed=52, opacity=0.38, detail=1.12)
    return finish('soil', col, n, r)


def gravel(S=1024):
    m = maps('ph_rocky_gravel', S)
    col = grade(m['color'], sat=0.6, contrast=1.05)
    col = painterly(col, sigma=4, strokes=1200, length=12, width=6, seed=61, opacity=0.3, detail=1.12)
    return finish('gravel', col, m['normal'], m['rough'])


def leaf_litter(S=1024):
    a, b = maps('ph_forest_leaves_04', S), maps('ph_dry_decay_leaves', S)
    m = sstep(0.4, 0.6, fbm(S, 3, 4, 71))[..., None]
    col = a['color'] * (1 - m) + b['color'] * m
    n = a['normal'] * (1 - m) + b['normal'] * m
    r = a['rough'] * (1 - m[..., 0]) + b['rough'] * m[..., 0]
    col = grade(col, sat=0.7, contrast=1.1, shadow_tint='#141a12', shadow_amt=0.3)
    col = painterly(col, sigma=5, strokes=1500, length=16, width=7, seed=72, opacity=0.35, detail=1.12)
    return finish('leaf_litter', col, n, r, strength=0.75)


def rock(S=1024):
    m = maps('ph_mossy_rock', S)
    col = grade(m['color'], sat=0.7, contrast=1.08, shadow_tint='#1d2622', shadow_amt=0.25)
    col = painterly(col, sigma=7, strokes=1700, length=28, width=10, seed=81, opacity=0.4, detail=1.12)
    return finish('rock', col, m['normal'], m['rough'])


# =======================================================================================
# Bark & wood
# =======================================================================================
def _moss_on(col, n, r, h, S, seed, amount=0.5, side=None):
    mo = maps('acg_Moss002', S)
    cav = np.clip(cavity_from_height(h, 10), 0, 1)
    mm = sstep(0.62, 0.85, fbm(S, (3, 8), 4, seed, aniso=(1, 3)) * 0.7 + cav * 0.5) * amount
    if side is not None:
        u = np.linspace(0, 1, S, endpoint=False)[None, :]
        mm = mm * (0.4 + 0.6 * (0.5 + 0.5 * np.cos((u - side) * 2 * np.pi)))
    mcol = mo['color'] * hex2rgb('#b8c87a') * 1.3
    col = apply_layer(col, mcol, mm)
    n = blend_normals(n * (1 - mm[..., None]) + mo['normal'] * mm[..., None], normal_from_height(blur(mm, 2), 2))
    r = r * (1 - mm) + 0.9 * mm
    return col, n, r


def bark(S=1024):
    m = maps('ph_bark_willow_02', S)
    col, n, r, h = m['color'], m['normal'], m['rough'], m['height']
    col, n, r = _moss_on(col, n, r, h, S, 91, 0.6, side=0.2)
    col = grade(col, sat=0.65, contrast=1.1, shadow_tint='#18201c', shadow_amt=0.3)
    col = painterly(col, sigma=6, strokes=1700, length=36, width=8, seed=92, opacity=0.4, detail=1.12,
                    angle=np.pi / 2)
    return finish('bark', col, n, r)


def bark_banyan(S=1024):
    m = maps('ph_chinese_hackberry_bark', S)
    col, n, r, h = m['color'], m['normal'], m['rough'], m['height']
    # banyan: smooth grey, vertical flutes and lichen blotches
    u = np.linspace(0, 1, S, endpoint=False)[None, :]
    warp = fbm(S, (2, 5), 4, 101) * 3.0 + fbm(S, (6, 2), 3, 105) * 0.8
    flutes = (0.5 + 0.5 * np.sin(u * 2 * np.pi * 3 + warp)).astype(np.float32)
    flutes = flutes ** 1.5
    h2 = h * 0.7 + flutes * 0.3
    n = blend_normals(n, normal_from_height(blur(flutes, 4), 5), 0.6)
    col = col * (0.88 + 0.18 * flutes[..., None])
    # tone down the scan's pale lichen spots, keep them as faint mottling
    L = lum(col)
    spots = sstep(0.05, 0.2, L - blur(L, 12))
    col = apply_layer(col, blur(col, 6), spots * 0.6)
    col = saturate(col, 0.5) * hex2rgb('#e8e4d8') * 1.05
    lichen = sstep(0.7, 0.85, fbm(S, (8, 4), 4, 102))
    col = apply_layer(col, col * 0.5 + hex2rgb('#9da08a') * 0.45, lichen * 0.35)
    col, n, r = _moss_on(col, n, r, h2, S, 103, 0.35)
    col = grade(col, sat=0.7, contrast=1.06, shadow_tint='#1e2522', shadow_amt=0.2)
    col = painterly(col, sigma=6, strokes=1500, length=36, width=9, seed=104, opacity=0.38, detail=1.1,
                    angle=np.pi / 2)
    return finish('bark_banyan', col, n, r)


def wood(S=1024):
    a = maps('ph_wood_planks_grey', S)
    b = maps('ph_weathered_planks', S)
    out = {}
    for key, m, seed in (('wood_old', a, 111), ('wood_planks', b, 112)):
        col = grade(m['color'], sat=0.55, contrast=1.06, shadow_tint='#1d211e', shadow_amt=0.2)
        st = streaks(S, n=40, seed=seed, length=(0.2, 0.7), width=(2, 5))
        col = apply_layer(col, col * 0.55, st * 0.4)
        col = painterly(col, sigma=6, strokes=1400, length=40, width=8, seed=seed + 5, opacity=0.35, detail=1.1,
                        angle=np.pi / 2)
        out.update(finish(key, col, m['normal'], m['rough']))
    return out


# =======================================================================================
# Built
# =======================================================================================
def rust(S=1024):
    a, b = maps('ph_rust_coarse_01', S), maps('acg_Rust004', S)
    m = sstep(0.4, 0.6, fbm(S, 4, 4, 121))[..., None]
    col = a['color'] * (1 - m) + b['color'] * m
    n = blend_normals(a['normal'] * (1 - m) + b['normal'] * m, normal_from_height(fbm(S, 40, 3, 122), 1.5))
    r = a['rough'] * (1 - m[..., 0]) + b['rough'] * m[..., 0]
    st = streaks(S, 60, 123, (0.2, 0.7), (2, 6))
    col = apply_layer(col, col * hex2rgb('#5a2a12') * 1.6, st * 0.5)
    col = grade(col, sat=0.75, contrast=1.08)
    col = painterly(col, sigma=6, strokes=1500, length=24, width=9, seed=124, opacity=0.38, detail=1.12)
    return finish('rust', col, n, r)


def metal_painted(S=1024):
    m = maps('acg_PaintedMetal014', S)
    col, n, r, h = m['color'], m['normal'], m['rough'], m['height']
    lk = load('acg_Leaking006', 'color', (S, S))
    st = streaks(S, 55, 131, (0.15, 0.6), (2, 5))
    rustish = lum(np.abs(col - saturate(col, 0)))  # rust is the saturated orange part
    bleed = blur_dir(sstep(0.05, 0.2, rustish), 60, axis=0) * 0.8
    col = apply_layer(col, col * hex2rgb('#6a3a1c') * 1.5, np.clip(bleed - sstep(0.05, 0.2, rustish), 0, 1) * 0.6)
    col = apply_layer(col, col * (0.6 + lum(lk)[..., None] * 0.35), st * 0.4)
    col = grade(col, sat=0.65, contrast=1.05, shadow_tint='#1f2a2a', shadow_amt=0.2)
    col = painterly(col, sigma=6, strokes=1500, length=30, width=9, seed=132, opacity=0.35, detail=1.1)
    return finish('metal_painted', col, n, r, strength=0.8)


def _peel(base_sid, crack_sid, S, key, tint, seed):
    b = maps(base_sid, S)
    c = maps(crack_sid, S)
    col, n, r, h = b['color'], b['normal'], b['rough'], b['height']
    # crackle structure from the peeling wall scan (its height has the crack network)
    ch = c['height']
    crack = sstep(0.12, 0.0, ch - blur(ch, 3) + 0.06)
    flakes = sstep(0.62, 0.72, fbm(S, 5, 5, seed) * 0.8 + (1 - ch) * 0.3)
    base = saturate(col, 0.25) * 0.75 + hex2rgb('#8f8a7c') * 0.15
    paint = col
    if tint is not None:
        paint = saturate(col, 0.15) * hex2rgb(tint) * 1.55
    out = apply_layer(paint, base, flakes)
    out = apply_layer(out, out * 0.45, crack * (1 - flakes) * 0.8)
    h = h * 0.4 + (1 - flakes) * 0.4 + (1 - crack) * 0.2
    n = blend_normals(n, normal_from_height(blur(h, 0.8), 5), 0.9)
    st = streaks(S, 60, seed + 1, (0.2, 0.7), (2, 5))
    out = apply_layer(out, out * 0.6, st * 0.35)
    r = r * (1 - flakes) + 0.92 * flakes
    out = grade(out, sat=0.75, contrast=1.05, shadow_tint='#20262a', shadow_amt=0.2)
    out = painterly(out, sigma=6, strokes=1400, length=28, width=9, seed=seed + 2, opacity=0.35, detail=1.1)
    return finish(key, out, n, r, strength=0.8)


def paint_peel(S=1024):
    out = _peel('ph_worn_plaster_wall', 'ph_peeling_painted_wall', S, 'paint_peel_white', '#e6e2d4', 141)
    out.update(_peel('ph_red_plaster_weathered', 'ph_peeling_painted_wall', S, 'paint_peel_red', None, 142))
    return out


def roof_tiles(S=1024):
    m = maps('ph_clay_roof_tiles_02', S)
    col, n, r, h = m['color'], m['normal'], m['rough'], m['height']
    cav = np.clip(cavity_from_height(h, 8), 0, 1)
    lich = sstep(0.6, 0.8, fbm(S, 8, 4, 151) * 0.7 + cav * 0.4)
    col = apply_layer(col, col * 0.4 + hex2rgb('#6d7350') * 0.5, lich * 0.55)
    st = streaks(S, 60, 152, (0.2, 0.8), (2, 6))
    col = apply_layer(col, col * 0.5, st * 0.45)
    col = grade(col, sat=0.65, contrast=1.06, shadow_tint='#22201e', shadow_amt=0.25)
    col = painterly(col, sigma=5, strokes=1500, length=20, width=8, seed=153, opacity=0.35, detail=1.1)
    return finish('roof_tiles', col, n, r)


def roof_corrugated(S=1024):
    a, b = maps('ph_worn_corrugated_iron', S), maps('ph_rusty_corrugated_iron', S)
    # rusty iron where water sits: bottom of the sheet and along streaks
    v = np.linspace(0, 1, S, endpoint=False)[:, None]
    st = streaks(S, 80, 161, (0.2, 0.8), (2, 7))
    m = np.clip(sstep(0.55, 0.85, fbm(S, (3, 7), 4, 162, aniso=(1, 3))) + st * 0.6 + sstep(0.75, 1.0, v) * 0.4, 0, 1)
    col = a['color'] * (1 - m[..., None]) + b['color'] * m[..., None]
    n = a['normal']
    r = a['rough'] * (1 - m) + b['rough'] * m
    col = grade(col, sat=0.65, contrast=1.06)
    col = painterly(col, sigma=6, strokes=1400, length=40, width=8, seed=163, opacity=0.35, detail=1.1,
                    angle=np.pi / 2)
    return finish('roof_corrugated', col, n, r, strength=0.8)


def gold_leaf(S=1024):
    m = maps('acg_Foil002', S)
    col, n, r, h = m['color'], m['normal'], m['rough'], m['height']
    # gold leaf laid in ~8 cm squares: slight tone per square, overlapping seams, bole showing through
    k = 8
    yy, xx = np.mgrid[0:S, 0:S]
    jit = fbm(S, 6, 3, 171) * 6
    gx = ((xx + jit) / (S / k)).astype(int) % k
    gy = ((yy + jit * 0.7) / (S / k)).astype(int) % k
    rng = np.random.default_rng(172)
    tone = rng.random((k, k)).astype(np.float32)
    sq = tone[gy, gx]
    seam_x = np.abs(((xx + jit) % (S / k)) - 1.5) < 1.5
    seam_y = np.abs(((yy + jit * 0.7) % (S / k)) - 1.5) < 1.5
    seam = (seam_x | seam_y).astype(np.float32)
    col = col * (0.85 + 0.3 * sq[..., None])
    col = saturate(col, 1.1) * hex2rgb('#ffd890') * 1.1
    bole = sstep(0.72, 0.8, fbm(S, 9, 5, 173)) * (0.5 + 0.5 * seam)
    col = apply_layer(col, hex2rgb('#6b1d12') * (0.7 + 0.3 * fbm(S, 40, 3, 174)[..., None]), bole)
    col = apply_layer(col, col * 0.6, seam * 0.35)
    r = r * (1 - bole) + 0.7 * bole
    grime = sstep(0.5, 0.9, fbm(S, 4, 4, 175)) * 0.45
    col = apply_layer(col, col * hex2rgb('#3a2c18') * 1.5, grime)
    r = np.clip(r * 0.8 + grime * 0.3, 0, 1)
    n = blend_normals(n, normal_from_height(blur(seam, 1) * 0.3 + bole * 0.4, 3), 0.7)
    col = painterly(col, sigma=5, strokes=1200, length=18, width=7, seed=176, opacity=0.3, detail=1.1)
    return finish('gold_leaf', col, n, r, strength=0.75)


def red_lacquer(S=1024):
    m = maps('ph_lacquered_cherry_wood', S)
    c = maps('ph_peeling_painted_wall', S)
    wood = m['color']
    ch = c['height']
    craq = sstep(0.1, 0.0, ch - blur(ch, 2.5) + 0.05)
    lacq = saturate(wood, 0.3) * hex2rgb('#c8231a') * 2.0
    lacq = lacq * (0.8 + 0.3 * fbm(S, 5, 4, 181)[..., None])
    worn = sstep(0.7, 0.82, fbm(S, 7, 5, 182))
    col = apply_layer(lacq, wood * 0.6, worn)
    col = apply_layer(col, col * 0.35, craq * 0.7)
    grime = sstep(0.45, 0.85, fbm(S, 4, 4, 183)) * 0.4
    col = apply_layer(col, col * 0.45, grime)
    r = 0.25 + craq * 0.35 + worn * 0.4 + grime * 0.3 + fbm(S, 30, 3, 184) * 0.08
    n = blend_normals(m['normal'], normal_from_height(1 - craq * 0.6 - worn * 0.3, 4), 1.0)
    col = painterly(col, sigma=5, strokes=1300, length=22, width=8, seed=185, opacity=0.35, detail=1.1)
    return finish('red_lacquer', col, n, r, strength=0.8)


def lantern_paper(S=1024):
    p = maps('acg_Paper005', S)
    base = saturate(p['color'], 0.0)
    red = hex2rgb('#c2321c')
    col = base * red * 1.9
    col = col * (0.85 + 0.25 * fbm(S, 6, 4, 191)[..., None])
    # horizontal bamboo ribs (dark lines with light halos), gold bands top & bottom
    v = np.linspace(0, 1, S, endpoint=False)[:, None]
    ribs = (np.abs(((v * 18) % 1) - 0.5) < 0.03).astype(np.float32)
    ribs = blur(np.repeat(ribs, S, 1), 1.2)
    col = apply_layer(col, col * 0.45, ribs * 0.8)
    band = ((v < 0.07) | (v > 0.93)).astype(np.float32)
    band = np.repeat(band, S, 1)
    gold = maps('acg_Foil002', S)['color'] * hex2rgb('#ffcf7a') * 1.2
    col = apply_layer(col, gold, band)
    stain = sstep(0.55, 0.85, fbm(S, 5, 4, 192)) * 0.35
    col = apply_layer(col, col * 0.5, stain)
    col = painterly(col, sigma=5, strokes=1100, length=26, width=9, seed=193, opacity=0.3, detail=1.15)
    out = finish('lantern_paper', col, None, None, strength=0.6)
    return out


# =======================================================================================
# Vehicle
# =======================================================================================
def taxi_paint(S=1024):
    sc1 = load('acg_Scratches001', 'color', (S, S), 'L')
    sc2 = load('acg_Scratches004', 'color', (S, S), 'L')
    spots = load('acg_SurfaceImperfections006', 'color', (S, S), 'L')
    lk = load('acg_Leaking004', 'color', (S, S), 'L')
    rust = maps('acg_Rust004', S)
    v = np.linspace(0, 1, S, endpoint=False)[:, None]  # 0 = top of image (v=1), 1 = bottom (v=0, sills)
    bottom = np.repeat(sstep(0.55, 1.0, v), S, 1)
    scr = np.clip(norm01(sc1) * 0.6 + norm01(sc2) * 0.6, 0, 1)
    scr = sstep(0.45, 0.95, scr)
    sp = sstep(0.55, 0.95, norm01(spots))
    leak = sstep(0.4, 0.9, 1 - norm01(lk))
    mud = np.clip(bottom * (0.6 + 0.6 * fbm(S, (6, 3), 4, 201, aniso=(1, 0.5))) - 0.25, 0, 1)
    mud = np.clip(mud + blur_dir(sstep(0.7, 0.9, fbm(S, 12, 3, 202)) * bottom, 50, axis=0) * 0.5, 0, 1)
    rustm = sstep(0.78, 0.92, fbm(S, 10, 4, 203) * 0.7 + bottom * 0.5) * bottom
    # weathering layer (near white; multiplied by material.color)
    w = np.ones((S, S, 3), np.float32) * hex2rgb('#efece6')
    w = apply_layer(w, w * 0.82, scr * 0.5)
    w = apply_layer(w, w * 0.78, sp * 0.35)
    w = apply_layer(w, w * hex2rgb('#c8c0b0'), leak * 0.45)
    w = apply_layer(w, hex2rgb('#7a6a55') * (0.7 + 0.5 * fbm(S, 30, 3, 204)[..., None]), mud * 0.8)
    w = apply_layer(w, rust['color'] * 1.1, rustm)
    w = painterly(w, sigma=4, strokes=900, length=30, width=8, seed=205, opacity=0.25, detail=1.05, kuwa=0,
                  angle=np.pi / 2)
    out = {'taxi_paint': ('color', match_stats(w, target('taxi_paint'), 0.6))}
    for key, pc, primer in (('taxi_paint_green', '#22683c', '#8d8a80'), ('taxi_paint_yellow', '#d6ad2a', '#9c9688')):
        paint = np.ones((S, S, 3), np.float32) * hex2rgb(pc) * (0.92 + 0.12 * fbm(S, 4, 4, 206)[..., None])
        chips = sstep(0.82, 0.9, fbm(S, 14, 5, 207) * 0.6 + scr * 0.5) * (0.4 + bottom * 0.8)
        col = paint * w * 1.04
        col = apply_layer(col, hex2rgb(primer) * w, np.clip(chips, 0, 1))
        col = apply_layer(col, rust['color'], rustm * 0.9)
        out.update({key: ('color', unsharp(col, 0.8, 0.3))})
    h = 1 - scr * 0.25 - sp * 0.1 - rustm * 0.2 + mud * 0.3
    n = blend_normals(scale_normal(rust['normal'], 0.6) * rustm[..., None] + flat_normal(S, S) * (1 - rustm[..., None]),
                      normal_from_height(blur(h, 0.7), 2.0))
    r = 0.28 + scr * 0.25 + sp * 0.15 + mud * 0.5 + rustm * 0.55 + leak * 0.1
    out['taxi_paint_normal'] = ('normal', n)
    out['taxi_paint_rough'] = ('rough', np.clip(r, 0.05, 1))
    return out


def dash_plastic(S=1024):
    m = maps('acg_Plastic012A', S)
    sc = load('acg_Scratches001', 'color', (S, S), 'L')
    col = saturate(m['color'], 0.2)
    scr = sstep(0.5, 0.95, norm01(sc))
    dust = sstep(0.45, 0.85, fbm(S, 6, 5, 211)) * 0.35
    col = apply_layer(col, col + 0.08, scr * 0.5)
    col = apply_layer(col, hex2rgb('#5e5850'), dust * 0.5)
    r = m['rough'] * 0.9 + dust * 0.15 - scr * 0.05
    col = painterly(col, sigma=5, strokes=900, length=24, width=8, seed=212, opacity=0.2, detail=1.05, kuwa=0)
    return finish('dash_plastic', col, m['normal'], r, strength=0.85)


def leather_seat(S=1024):
    m = maps('ph_brown_leather', S)
    col, n, r, h = m['color'], m['normal'], m['rough'], m['height']
    wear = sstep(0.62, 0.8, fbm(S, 5, 5, 221))
    crack = sstep(0.04, 0.0, np.abs(fbm(S, 30, 4, 222) - 0.5)) * wear
    col = apply_layer(col, col * 1.5 + 0.04, wear * 0.4)
    col = apply_layer(col, col * 0.4, crack * 0.8)
    r = r * (1 - wear * 0.2) + crack * 0.3
    n = blend_normals(n, normal_from_height(1 - crack, 3), 1)
    col = painterly(col, sigma=5, strokes=1000, length=22, width=8, seed=223, opacity=0.3, detail=1.1)
    return finish('leather_seat', col, n, r)


def fabric_seat(S=1024):
    m = maps('acg_Fabric012', S)
    col = m['color']
    stain = sstep(0.6, 0.85, fbm(S, 5, 4, 231)) * 0.35
    col = apply_layer(col, col * hex2rgb('#6f6250') * 1.4, stain)
    col = painterly(col, sigma=5, strokes=800, length=24, width=8, seed=232, opacity=0.25, detail=1.1, kuwa=0)
    return finish('fabric_seat', col, m['normal'], m['rough'])


def headliner(S=1024):
    m = maps('acg_Fabric062', S)
    col = m['color']
    # water rings & nicotine yellowing
    rings = np.zeros((S, S), np.float32)
    rng = np.random.default_rng(241)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    for _ in range(5):
        cx, cy, R = rng.random() * S, rng.random() * S, S * (0.06 + rng.random() * 0.12)
        dx = (xx - cx + S / 2) % S - S / 2
        dy = (yy - cy + S / 2) % S - S / 2
        d = np.sqrt(dx * dx + dy * dy) / R + (fbm(S, 12, 3, int(rng.integers(1000))) - 0.5) * 0.3
        rings = np.maximum(rings, sstep(0.1, 0.0, np.abs(d - 1)) * 0.8 + sstep(1.0, 0.6, d) * 0.25)
    nic = sstep(0.4, 0.9, fbm(S, 3, 4, 242)) * 0.5
    col = apply_layer(col, col * hex2rgb('#b39a6a') * 1.2, nic)
    col = apply_layer(col, col * hex2rgb('#8a7350') * 1.1, rings)
    col = painterly(col, sigma=6, strokes=900, length=30, width=10, seed=243, opacity=0.25, detail=1.1, kuwa=0)
    return finish('headliner', col, m['normal'], None)


def carpet(S=1024):
    m = maps('ph_dirty_carpet', S)
    col = grade(m['color'], sat=0.5)
    col = painterly(col, sigma=4, strokes=700, length=16, width=7, seed=251, opacity=0.25, detail=1.1, kuwa=0)
    return finish('carpet', col, m['normal'], None)


# =======================================================================================
# Cloth
# =======================================================================================
def cloths(S=1024):
    out = {}
    cot = maps('acg_Fabric061', S)
    col = saturate(cot['color'], 0.3)
    col = painterly(col, sigma=5, strokes=700, length=24, width=8, seed=261, opacity=0.2, detail=1.1, kuwa=0)
    out.update(finish('fabric_cotton', col, cot['normal'], None))
    sat = maps('ph_crepe_satin', S)
    silk = saturate(sat['color'], 0.0)
    silk = norm01(lum(silk))[..., None] * 0.35 + 0.65
    silk = np.repeat(silk, 3, 2) * hex2rgb('#efe6d2')
    out.update(finish('fabric_silk', silk, sat['normal'], sat['rough']))
    for key, c in (('cloth_red', '#b82a24'), ('cloth_yellow', '#d6a424'), ('cloth_green', '#24763c')):
        cl = (norm01(lum(sat['color']))[..., None] * 0.55 + 0.55) * hex2rgb(c)
        fade = sstep(0.55, 0.9, fbm(S, 4, 4, hash(key) % 1000)) * 0.25
        cl = apply_layer(cl, saturate(cl, 0.4) * 1.15, fade)
        out[key] = ('color', match_stats(cl, target(key), 0.7))
    out['cloth_normal'] = ('normal', sat['normal'])
    den = maps('ph_denim_fabric', S)
    out.update(finish('fabric_denim', grade(den['color'], sat=0.85), den['normal'], None))
    # monk robe: saffron linen with kathina "paddy field" panel seams (layout as mat_body.js)
    lin = maps('ph_rough_linen', S)
    robe = (norm01(lum(lin['color']))[..., None] * 0.5 + 0.6) * hex2rgb('#c8701e')
    robe = robe * (0.9 + 0.2 * fbm(S, 3, 4, 271)[..., None])
    seams = np.zeros((S, S), np.float32)
    colsX = [0, 0.06, 0.3, 0.36, 0.64, 0.7, 0.94, 1]
    for x in colsX:
        xi = int(x * S) % S
        seams[:, max(0, xi - 2):xi + 2] = 1
    for i in range(5):
        x0, x1 = int(colsX[i] * S), int(colsX[i + 1] * S)
        rows = [0.33, 0.66] if i % 2 == 0 else [0.25, 0.5, 0.75]
        for y in rows:
            yi = int(y * S)
            seams[yi - 2:yi + 2, x0:x1] = 1
    seams = blur(seams, 1.2)
    robe = apply_layer(robe, robe * 0.62, seams * 0.9)
    hn = normal_from_height(1 - seams * 0.6, 4)
    out.update(finish('monk_robe', robe, blend_normals(lin['normal'], hn), None, strength=0.8))
    # sarong (pha khao ma): woven check over the cotton weave
    v = np.linspace(0, 1, S, endpoint=False)
    def band(t):
        k = (t * 8) % 1
        return (k < 0.42).astype(np.float32) * 1.0 + ((k > 0.5) & (k < 0.56)).astype(np.float32) * 0.5
    bx, by = band(v)[None, :], band(v)[:, None]
    base = hex2rgb('#2f5a8a')
    c1, c2 = hex2rgb('#b33a2c'), hex2rgb('#d8cfb8')
    sar = np.ones((S, S, 3), np.float32) * base
    sar = apply_layer(sar, c1 * 0.9, np.clip(bx * 0.6, 0, 1))
    sar = apply_layer(sar, c1 * 0.75, np.clip(by * 0.6, 0, 1))
    sar = apply_layer(sar, c2, ((bx > 0.4) & (by > 0.4)).astype(np.float32) * 0.0 + (bx * by > 0.24) * 0.5)
    weave = norm01(lum(cot['color']))[..., None]
    sar = sar * (0.7 + 0.45 * weave)
    fade = sstep(0.5, 0.9, fbm(S, 4, 4, 281)) * 0.3
    sar = apply_layer(sar, saturate(sar, 0.5) * 1.1, fade)
    out['fabric_sarong'] = ('color', unsharp(grade(sar, sat=0.8), 0.8, 0.3))
    out['fabric_sarong_normal'] = ('normal', cot['normal'])
    return out


# family -> (recipe, size, rough_size)
SURFACES = {
    'ground/asphalt': (asphalt, 2048),
    'ground/concrete': (concrete, 1024),
    'ground/concrete_moss': (concrete_moss, 1024),
    'ground/moss': (moss, 1024),
    'ground/soil': (soil, 1024),
    'ground/gravel': (gravel, 1024),
    'ground/leaf_litter': (leaf_litter, 1024),
    'ground/rock': (rock, 1024),
    'nature/bark': (bark, 1024),
    'nature/bark_banyan': (bark_banyan, 1024),
    'built/wood': (wood, 1024),
    'built/rust': (rust, 1024),
    'built/metal_painted': (metal_painted, 1024),
    'built/paint_peel': (paint_peel, 1024),
    'built/roof_tiles': (roof_tiles, 1024),
    'built/roof_corrugated': (roof_corrugated, 1024),
    'built/gold_leaf': (gold_leaf, 1024),
    'built/red_lacquer': (red_lacquer, 1024),
    'built/lantern_paper': (lantern_paper, 1024),
    'vehicle/taxi_paint': (taxi_paint, 1024),
    'vehicle/dash_plastic': (dash_plastic, 1024),
    'vehicle/leather_seat': (leather_seat, 1024),
    'vehicle/fabric_seat': (fabric_seat, 1024),
    'vehicle/headliner': (headliner, 1024),
    'vehicle/carpet': (carpet, 1024),
    'cloth/cloths': (cloths, 1024),
}
