# Texture bake for the vehicle models: turns the semantic build materials into a few export
# materials with painted, weathered atlases (no flat colours in the game).
#
#   1. bake_inputs(): per atlas, Cycles bakes the R/G/B mask (AO, edge/curvature, cavity) plus
#      world position, world normal and a material-id map (cheap 1-sample emission bakes).
#   2. compose(): numpy painter. Per source material a recipe mixes base colour, CC0 photo
#      texture detail (public/assets/textures, see docs/credits/textures.md) and wear driven
#      by the masks and the world position: paint chips on edges and around door handles,
#      faded clearcoat on roof / bonnet / boot lid, rust bleed at seams and wheel arches, road
#      grime low on the body, scuffed bumpers, sun-faded black trim, oxidised lenses, a
#      cracked and bleached dash top, worn and stained seat fabric, a bald carpet patch under
#      the driver's heel. Output: albedo (sRGB) + ORM (R = AO, G = roughness, B = metalness).
#   3. remap_export() swaps the build materials for the export materials (EXPORT), and
#      inject_textures() writes the atlases into the GLB (baseColor + occlusion +
#      metallicRoughness) after the glTF export.
import os
import math
import json
import numpy as np
import bpy
import vlib
from vlib import log

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
TEX = os.path.join(REPO, 'public', 'assets', 'textures')

# export material -> source (build) materials. Atlas-less ones carry plain PBR values.
EXPORT = {
    'paint': dict(src=['paint_green', 'paint_yellow']),
    'paint_moto': dict(src=['paint_moto']),
    'chrome': dict(src=['chrome', 'metal_steel']),
    'rubber_black': dict(src=['rubber', 'plastic_black', 'paint_black']),
    'lens': dict(src=['lens_clear', 'lens_red', 'lens_amber'], alpha=0.82),
    'sign_lamp': dict(src=['sign_panel', 'sign_text']),
    'plastic_dash': dict(src=['plastic_dash']),
    'fabric_carpet': dict(src=['fabric_headliner', 'carpet']),
    'vinyl_seat': dict(src=['vinyl_seat', 'wood_beads']),
    'glass': dict(src=['glass'], plain=((0.62, 0.70, 0.68), 0.05, 0.0), alpha=0.25),
    'display': dict(src=['emissive_meter', 'emissive_gauge', 'plate'], plain=((0.06, 0.06, 0.06), 0.4, 0.0)),
    'mirror': dict(src=['mirror'], plain=((0.9, 0.9, 0.9), 0.04, 1.0)),
}
SRC_TO_EXPORT = {s: k for k, d in EXPORT.items() for s in d['src']}


# ---------------------------------------------------------------------------------------
# small numpy toolkit
# ---------------------------------------------------------------------------------------
def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    t = np.asarray(t, np.float32)
    if t.ndim == 1 and (np.ndim(a) == 2 or np.ndim(b) == 2):
        t = t[:, None]
    return a + (b - a) * t


def lum(c):
    return c[:, 0] * 0.2126 + c[:, 1] * 0.7152 + c[:, 2] * 0.0722


def _hash(ix, iy, iz, seed):
    h = (ix.astype(np.uint32) * np.uint32(374761393) + iy.astype(np.uint32) * np.uint32(668265263) +
         iz.astype(np.uint32) * np.uint32(2246822519) + np.uint32((seed * 144665 + 7) & 0xffffffff))
    h = (h ^ (h >> np.uint32(13))) * np.uint32(1274126177)
    h = h ^ (h >> np.uint32(16))
    return (h & np.uint32(0xffffff)).astype(np.float32) / 16777216.0


_ROT = np.array([[0.8, 0.36, -0.48], [-0.36, 0.93, 0.08], [0.48, 0.08, 0.87]], np.float32)


def vnoise(P, seed=0):
    i = np.floor(P)
    f = (P - i).astype(np.float32)
    i = i.astype(np.int64)
    u = f * f * (3 - 2 * f)
    acc = np.zeros(len(P), np.float32)
    for dx in (0, 1):
        wx = u[:, 0] if dx else 1 - u[:, 0]
        for dy in (0, 1):
            wy = u[:, 1] if dy else 1 - u[:, 1]
            for dz in (0, 1):
                wz = u[:, 2] if dz else 1 - u[:, 2]
                acc += _hash(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed) * wx * wy * wz
    return acc


def fbm(P, scale, octaves=4, seed=0, gain=0.5):
    """Fractal value noise, re-spread to roughly 0..1 (mean 0.5)."""
    Q = (P * np.asarray(scale, np.float32)).astype(np.float32)
    s = np.zeros(len(P), np.float32)
    a, norm = 1.0, 0.0
    for o in range(octaves):
        s += a * vnoise(Q, seed * 7 + o * 31)
        norm += a
        a *= gain
        Q = (Q @ _ROT) * 2.03 + 0.37
    s /= norm
    return np.clip((s - 0.5) * (2.2 + 0.35 * octaves) + 0.5, 0, 1)


def ridge(n):
    return 1.0 - np.abs(2.0 * n - 1.0)


def sample(tex, u, v, clamp_v=False):
    h, w = tex.shape[:2]
    x = u * w - 0.5
    y = (np.clip(v, 0.0, 0.999) if clamp_v else v) * h - 0.5
    x0 = np.floor(x)
    y0 = np.floor(y)
    fx = (x - x0)[:, None]
    fy = (y - y0)[:, None]
    x0 = x0.astype(np.int64) % w
    y0i = y0.astype(np.int64)
    x1 = (x0 + 1) % w
    if clamp_v:
        y1 = np.clip(y0i + 1, 0, h - 1)
        y0i = np.clip(y0i, 0, h - 1)
    else:
        y0i = y0i % h
        y1 = (y0i + 1) % h
    a = tex[y0i, x0] * (1 - fx) + tex[y0i, x1] * fx
    b = tex[y1, x0] * (1 - fx) + tex[y1, x1] * fx
    return a * (1 - fy) + b * fy


def tri(tex, P, N, scale, sharp=4.0, offset=(0.0, 0.0, 0.0)):
    """Triplanar sample: `scale` metres per texture tile."""
    w = np.abs(N) ** sharp
    w /= w.sum(1, keepdims=True) + 1e-8
    Q = (P + np.asarray(offset)) / scale
    cx = sample(tex, Q[:, 1], Q[:, 2])
    cy = sample(tex, Q[:, 0] + 0.31, Q[:, 2])
    cz = sample(tex, Q[:, 0] + 0.17, Q[:, 1] + 0.53)
    return cx * w[:, 0:1] + cy * w[:, 1:2] + cz * w[:, 2:3]


_TEX_CACHE = {}


def photo(rel, px=512):
    """CC0 photo texture (public/assets/textures/<rel>) as float RGB (rows bottom-up), px square."""
    k = (rel, px)
    if k in _TEX_CACHE:
        return _TEX_CACHE[k]
    img = bpy.data.images.load(os.path.join(TEX, rel))
    if img.size[0] != px:
        img.scale(px, px)
    a = np.empty(px * px * 4, np.float32)
    img.pixels.foreach_get(a)
    a = a.reshape(px, px, 4)[:, :, :3].copy()
    bpy.data.images.remove(img)
    _TEX_CACHE[k] = a
    return a


def box_blur(a, r):
    """Separable box blur (2 passes ~ gaussian) on an (S, S) array."""
    if r <= 0:
        return a
    for _ in range(2):
        for ax in (0, 1):
            c = np.cumsum(np.pad(a, [(r + 1, r) if i == ax else (0, 0) for i in range(2)], mode='edge'), axis=ax)
            if ax == 0:
                a = (c[2 * r + 1:] - c[:-2 * r - 1]) / (2 * r + 1)
            else:
                a = (c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)
    return a


# ---------------------------------------------------------------------------------------
# baking the inputs
# ---------------------------------------------------------------------------------------
def _emit_bake(objs, atlases, size, mats, build, label, samples=1):
    """Bake an emission graph (build(nt, material) -> colour socket) into one float image per atlas."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    imgs = {}
    for a in atlases:
        img = bpy.data.images.new(f'bk_{a}_{label}', size, size, alpha=False, float_buffer=True)
        img.colorspace_settings.name = 'Non-Color'
        img.generated_color = (0, 0, 0, 1)
        imgs[a] = img
    for m in mats.values():
        nt = m.node_tree
        out = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'][0]
        em = nt.nodes.new('ShaderNodeEmission')
        em.name = '_bk_em'
        nt.links.new(build(nt, m), em.inputs['Color'])
        nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.name = '_bk_img'
        tex.image = imgs[m['atlas']]
        for n in nt.nodes:
            n.select = False
        tex.select = True
        nt.nodes.active = tex
    vlib._select_only(objs)
    bpy.ops.object.bake(type='EMIT', margin=8, use_clear=True)
    for m in mats.values():
        nt = m.node_tree
        for n in [n for n in nt.nodes if n.name.startswith('_bk_')]:
            nt.nodes.remove(n)
        out = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'][0]
        bsdf = [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'][0]
        nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    res = {}
    for a, img in imgs.items():
        arr = np.empty(size * size * 4, np.float32)
        img.pixels.foreach_get(arr)
        res[a] = arr.reshape(size, size, 4)[:, :, :3].copy()
        bpy.data.images.remove(img)
    log('bake', label, 'done')
    return res


def bake_inputs(objs, atlases, size=2048, samples=4, ao_samples=8, out_dir=None):
    objs = [o for o in objs if o.type == 'MESH' and len(o.data.polygons)]
    mats = {}
    for o in objs:
        for m in o.data.materials:
            if m and m.get('atlas') in atlases:
                mats[m.name] = m
    names = {a: sorted(n for n, m in mats.items() if m['atlas'] == a) for a in atlases}
    masks = vlib.bake_masks(objs, atlases, size=size, samples=samples, out_dir=out_dir, ao_samples=ao_samples)

    def geo_pos(nt, m):
        g = nt.nodes.new('ShaderNodeNewGeometry')
        g.name = '_bk_geo'
        mp = nt.nodes.new('ShaderNodeVectorMath')
        mp.name = '_bk_map'
        mp.operation = 'MULTIPLY_ADD'
        mp.inputs[1].default_value = (1 / 6, 1 / 6, 1 / 6)
        mp.inputs[2].default_value = (0.5, 0.5, 0.5)
        nt.links.new(g.outputs['Position'], mp.inputs[0])
        return mp.outputs[0]

    def geo_nrm(nt, m):
        g = nt.nodes.new('ShaderNodeNewGeometry')
        g.name = '_bk_geo'
        mp = nt.nodes.new('ShaderNodeVectorMath')
        mp.name = '_bk_map'
        mp.operation = 'MULTIPLY_ADD'
        mp.inputs[1].default_value = (0.5, 0.5, 0.5)
        mp.inputs[2].default_value = (0.5, 0.5, 0.5)
        nt.links.new(g.outputs['Normal'], mp.inputs[0])
        return mp.outputs[0]

    def mat_id(nt, m):
        rgb = nt.nodes.new('ShaderNodeRGB')
        rgb.name = '_bk_rgb'
        k = names[m['atlas']].index(m.name) + 1
        rgb.outputs[0].default_value = (k / 32.0, 0.0, 0.0, 1.0)
        return rgb.outputs[0]

    pos = _emit_bake(objs, atlases, size, mats, geo_pos, 'pos')
    nrm = _emit_bake(objs, atlases, size, mats, geo_nrm, 'nrm')
    mid = _emit_bake(objs, atlases, size, mats, mat_id, 'mid')
    out = {}
    for a in atlases:
        mk = np.empty(size * size * 4, np.float32)
        masks[a].pixels.foreach_get(mk)
        n = nrm[a] * 2 - 1
        n /= np.linalg.norm(n, axis=2, keepdims=True) + 1e-8
        out[a] = dict(mask=mk.reshape(size, size, 4)[:, :, :3].copy(), pos=pos[a] * 6 - 3, nrm=n,
                      mid=np.rint(mid[a][:, :, 0] * 32.0).astype(np.int32), names=names[a])
    return out


# ---------------------------------------------------------------------------------------
# painter
# ---------------------------------------------------------------------------------------
class Ctx:
    """Per-vehicle wear zones (Blender world frame: X right, Y forward, Z up)."""

    def __init__(self, kind='taxi', axles=(), arch_r=0.31, handles=(), seat_centres=(), heel=None, dash=None,
                 colors=None, length=4.27):
        self.kind = kind
        self.axles = axles            # (y, z) of each axle
        self.arch_r = arch_r
        self.handles = handles        # world centres of outer door handles
        self.seat_centres = seat_centres
        self.heel = heel              # (x, y) of the driver's heel on the carpet
        self.dash = dash              # (ymin, ymax, zmin) of the dash top zone
        self.colors = colors or {}
        self.half_len = length / 2


YELLOW = np.array([0.84, 0.66, 0.26], np.float32)
GREEN = np.array([0.15, 0.39, 0.26], np.float32)
PRIMER = np.array([0.56, 0.55, 0.51], np.float32)
BARE = np.array([0.36, 0.36, 0.37], np.float32)
DIRT = np.array([0.33, 0.28, 0.22], np.float32)
DUST = np.array([0.60, 0.56, 0.49], np.float32)


class Painter:
    def __init__(self, ctx, size):
        self.ctx = ctx
        self.size = size
        s = 512 if size >= 2048 else 256
        self.t_paint_y = photo('vehicle/taxi_paint_yellow.webp', 512)
        self.t_paint_g = photo('vehicle/taxi_paint_green.webp', 512)
        self.t_rust = photo('built/rust.webp', s)
        self.t_soil = photo('ground/soil.webp', s)
        self.t_dash = photo('vehicle/dash_plastic.webp', s)
        self.t_seat = photo('vehicle/fabric_seat.webp', s)
        self.t_vinyl = photo('vehicle/leather_seat.webp', s)
        self.t_head = photo('vehicle/headliner.webp', 512)
        self.t_carpet = photo('vehicle/carpet.webp', s)
        self.t_metal = photo('built/metal_painted.webp', s)
        up = self.t_paint_y[int(512 * 0.3):]
        self.paint_mean = float(lum(up.reshape(-1, 3)).mean())

    # -- shared terms -------------------------------------------------------------------
    def common(self, P, N, M):
        AO, E, C = M[:, 0], M[:, 1], M[:, 2]
        z = P[:, 2]
        return AO, E, C, z, N[:, 2]

    def arch(self, P):
        a = np.zeros(len(P), np.float32)
        for (ay, az) in self.ctx.axles:
            d = np.sqrt((P[:, 1] - ay) ** 2 + (P[:, 2] - az) ** 2)
            a = np.maximum(a, sstep(self.ctx.arch_r + 0.12, self.ctx.arch_r + 0.02, d))
        return a

    def grime_low(self, P, z, top=0.62):
        splash = fbm(P, (9, 3, 16), 4, seed=11)
        low = sstep(top, 0.20, z)
        return np.clip(low * (0.35 + 0.75 * splash), 0, 1)

    def rust_col(self, P, N):
        return tri(self.t_rust, P, N, 0.45) * 0.95

    def dirt_col(self, P, N):
        return tri(self.t_soil, P, N, 0.9) * 0.75 + DIRT * 0.35

    # -- recipes: return (rgb, rough, metal) ----------------------------------------------
    def paint(self, P, N, M, cav_seam, which):
        AO, E, C, z, up = self.common(P, N, M)
        n = len(P)
        if which == 'moto':
            base = np.tile(self.ctx.colors.get('moto', np.array([0.36, 0.08, 0.07], np.float32)), (n, 1))
            T = None
        else:
            base = np.tile(YELLOW if which == 'yellow' else GREEN, (n, 1))
            tex = self.t_paint_y if which == 'yellow' else self.t_paint_g
            # body-mapped livery photo: sides run along the car with the sill rust band at the
            # bottom (v clamped), tops use the clean upper part of the photo
            vz = (z - 0.17) / 1.12
            sx = sample(tex, P[:, 1] / 1.3, vz, clamp_v=True)
            sy = sample(tex, P[:, 0] / 1.3 + 0.4, vz, clamp_v=True)
            sz = sample(tex, P[:, 0] / 1.3, 0.38 + 0.6 * np.mod(P[:, 1] / 1.5, 1.0), clamp_v=True)
            w = np.abs(N) ** 4
            w /= w.sum(1, keepdims=True) + 1e-8
            T = sx * w[:, 0:1] + sy * w[:, 1:2] + sz * w[:, 2:3]
        if T is not None:
            lt = np.clip(lum(T) / self.paint_mean, 0.55, 1.4)
            rust_t = sstep(1.7, 2.6, T[:, 0] / (T[:, 1] + 0.02)) * sstep(0.45, 0.2, z)
        else:
            lt = 0.9 + 0.2 * fbm(P, (3, 0.6, 9), 3, seed=3)
            rust_t = np.zeros(n, np.float32)
        col = base * (0.80 + 0.20 * lt)[:, None]
        blot = fbm(P, 1.6, 4, seed=1)
        col *= (0.93 + 0.14 * blot)[:, None]
        rough = 0.40 + 0.08 * blot
        metal = np.zeros(n, np.float32)
        # faded clearcoat on roof, bonnet, boot lid (and the tank / seat cowl tops of the bike)
        topf = sstep(0.45, 0.9, up) * (0.45 + 0.55 * fbm(P, 2.2, 4, seed=2))
        chalk = mix(col, lum(col)[:, None] * 0.9 + 0.13 + col * 0.25, 0.65)
        col = mix(col, chalk, topf * 0.7)
        peel = topf * sstep(0.64, 0.70, fbm(P, 5.5, 4, seed=4))
        col = mix(col, chalk * 1.06 + 0.03, peel * 0.8)
        rough = rough + 0.32 * topf + 0.25 * peel
        # scratches + chips: convex edges, door-handle cups, bumper corners, stone chips low / front
        convex = E * sstep(0.7, 0.95, C)
        hz = np.zeros(n, np.float32)
        for h in self.ctx.handles:
            d2 = ((P[:, 1] - h[1]) / 0.10) ** 2 + ((P[:, 2] - h[2]) / 0.05) ** 2 + ((P[:, 0] - h[0]) / 0.08) ** 2
            hz = np.maximum(hz, np.exp(-d2))
        endz = sstep(self.ctx.half_len - 0.32, self.ctx.half_len - 0.05, np.abs(P[:, 1])) * sstep(0.75, 0.55, z)
        nchip = fbm(P, 38, 3, seed=5)
        chipv = convex * 1.25 + (nchip - 0.5) * 1.1 + hz * 0.55 + endz * 0.25 * sstep(0.4, 0.7, nchip)
        stone = sstep(0.83, 0.86, fbm(P, 95, 2, seed=6)) * np.maximum(sstep(0.55, 0.3, z), sstep(1.6, 2.05, P[:, 1]))
        chip_p = np.maximum(sstep(0.58, 0.63, chipv), stone)
        chip_m = sstep(0.76, 0.80, chipv)
        lowr = sstep(0.75, 0.3, z)
        core = mix(np.tile(BARE, (n, 1)), self.rust_col(P, N), np.clip(0.35 + lowr, 0, 1))
        col = mix(col, PRIMER * (0.9 + 0.2 * nchip)[:, None], chip_p)
        col = mix(col, core, chip_m)
        rough = mix(rough, 0.7, chip_p)
        metal = metal + chip_m * (1 - np.clip(0.35 + lowr, 0, 1)) * 0.6
        # fingernail scratches in the handle cups + long scuffs on bumper ends
        scr = sstep(0.93, 0.985, ridge(fbm(P, (25, 55, 140), 3, seed=12))) * hz
        scr = np.maximum(scr, sstep(0.94, 0.99, ridge(fbm(P, (6, 4, 160), 3, seed=13))) * endz)
        col = mix(col, lum(col)[:, None] * 0.6 + 0.32, scr * 0.75)
        rough = rough + scr * 0.3
        # rust bleed out of seams and gaps, running down in streaks; rust at the wheel arches
        streak = fbm(P, (55, 55, 2.5), 3, seed=7)
        rb = cav_seam * (0.35 + 0.9 * sstep(0.45, 0.75, streak)) * (0.55 + 0.45 * lowr)
        rb = sstep(0.18, 0.55, rb)
        arch = self.arch(P) * sstep(0.5, 0.65, np.abs(P[:, 0]))
        ar = arch * sstep(0.42, 0.62, fbm(P, 22, 3, seed=8) + arch * 0.25)
        rust = np.clip(np.maximum(rb * 0.75, np.maximum(ar, rust_t)), 0, 1)
        col = mix(col, self.rust_col(P, N), rust)
        rough = mix(rough, 0.9, rust)
        metal = metal * (1 - rust)
        # road grime and dust low on the body, mud around the arches, dust in every cavity
        g = np.clip(self.grime_low(P, z) * 0.85 + arch * 0.45, 0, 0.92)
        col = mix(col, self.dirt_col(P, N), g * 0.8)
        col = mix(col, DUST, (1 - C) * 0.45 + sstep(0.85, 0.3, AO) * 0.2)
        rough = rough + g * 0.35
        col *= (0.78 + 0.22 * AO)[:, None]
        return col, np.clip(rough, 0.05, 1), np.clip(metal, 0, 1)

    def metal(self, P, N, M, chrome=True):
        AO, E, C, z, up = self.common(P, N, M)
        n = len(P)
        base = np.tile(np.array([0.80, 0.80, 0.78] if chrome else [0.56, 0.56, 0.57], np.float32), (n, 1))
        pits = sstep(0.6, 0.7, fbm(P, 70, 3, seed=21)) * np.clip(0.25 + (1 - C) * 0.9 + sstep(0.6, 0.25, z) * 0.5, 0, 1)
        haze = fbm(P, 9, 3, seed=22)
        col = base * (0.85 + 0.2 * haze)[:, None]
        col = mix(col, self.rust_col(P, N), pits * 0.85)
        g = np.clip(self.grime_low(P, z, 0.55) + (1 - C) * 0.8, 0, 1)
        col = mix(col, self.dirt_col(P, N) * 0.7, g * 0.7)
        rough = (0.2 if chrome else 0.42) + 0.25 * haze + pits * 0.5 + g * 0.4 + \
            0.15 * sstep(0.7, 0.72, fbm(P, 45, 2, seed=23))
        metal = np.clip(1 - pits * 0.9 - g * 0.6, 0, 1)
        col *= (0.8 + 0.2 * AO)[:, None]
        return col, np.clip(rough, 0.05, 1), metal

    def black(self, P, N, M, kind):
        AO, E, C, z, up = self.common(P, N, M)
        n = len(P)
        v = fbm(P, 30, 3, seed=31)
        if kind == 'rubber':
            col = np.tile(np.array([0.045, 0.045, 0.045], np.float32), (n, 1)) * (0.85 + 0.3 * v)[:, None]
            # tyre bloom (browned sidewalls) + worn tread + dust in grooves
            side = np.zeros(n, np.float32)
            tread = np.zeros(n, np.float32)
            for (ay, az) in self.ctx.axles:
                d = np.sqrt((P[:, 1] - ay) ** 2 + (P[:, 2] - az) ** 2)
                near = d < self.ctx.arch_r + 0.01
                side = np.maximum(side, near * sstep(0.17, 0.2, d) * sstep(0.29, 0.26, d) * (np.abs(N[:, 0]) > 0.5))
                tread = np.maximum(tread, near * sstep(0.26, 0.285, d) * (np.abs(N[:, 0]) < 0.6))
            col = mix(col, np.array([0.13, 0.11, 0.09], np.float32), side * (0.45 + 0.4 * fbm(P, 12, 3, seed=32)))
            col = mix(col, np.array([0.095, 0.09, 0.085], np.float32), tread * 0.8)
            col = mix(col, DUST * 0.55, (1 - C) * 0.85 + sstep(0.5, 0.15, z) * 0.15)
            rough = 0.88 + 0.08 * v
        elif kind == 'plastic':
            col = np.tile(np.array([0.055, 0.055, 0.056], np.float32), (n, 1))
            fade = sstep(0.4, 0.85, up) * (0.5 + 0.5 * fbm(P, 4, 3, seed=33))
            col = mix(col, np.array([0.17, 0.17, 0.165], np.float32), fade * 0.8)
            scuff = E * sstep(0.7, 0.95, C) * sstep(0.45, 0.6, v)
            col = mix(col, np.array([0.22, 0.21, 0.2], np.float32), scuff)
            col = mix(col, DUST * 0.6, (1 - C) * 0.6 + self.grime_low(P, z, 0.5) * 0.4)
            rough = 0.62 + 0.2 * fade
        else:  # painted black steel: wheels, housings, underbody, wiper arms
            col = np.tile(np.array([0.04, 0.04, 0.042], np.float32), (n, 1)) * (0.9 + 0.2 * v)[:, None]
            chip = sstep(0.6, 0.66, E * sstep(0.7, 0.95, C) * 1.2 + (fbm(P, 45, 3, seed=34) - 0.5))
            col = mix(col, self.rust_col(P, N) * 0.8, chip)
            g = np.clip(self.grime_low(P, z, 0.6) + (1 - C) * 0.7, 0, 1)
            col = mix(col, self.dirt_col(P, N) * 0.8, g * 0.6)
            rough = 0.5 + 0.3 * chip + 0.3 * g
        col *= (0.8 + 0.2 * AO)[:, None]
        return col, np.clip(rough, 0.05, 1), np.zeros(n, np.float32)

    def lens(self, P, N, M, kind):
        AO, E, C, z, up = self.common(P, N, M)
        n = len(P)
        base = {'clear': [0.82, 0.82, 0.78], 'red': [0.62, 0.05, 0.04], 'amber': [0.92, 0.48, 0.08]}[kind]
        col = np.tile(np.array(base, np.float32), (n, 1))
        if kind == 'clear':  # oxidised, yellowed polycarbonate
            col = mix(col, np.array([0.86, 0.78, 0.55], np.float32), 0.35 + 0.4 * fbm(P, 14, 3, seed=41))
        col = mix(col, DIRT, (1 - C) * 0.6 + sstep(0.6, 0.85, fbm(P, 30, 3, seed=42)) * 0.25)
        return col, np.clip(0.12 + (1 - C) * 0.5, 0, 1), np.zeros(n, np.float32)

    def sign(self, P, N, M, text):
        AO, E, C, z, up = self.common(P, N, M)
        n = len(P)
        col = np.tile(np.array([0.66, 0.09, 0.07] if text else [0.90, 0.87, 0.77], np.float32), (n, 1))
        streak = fbm(P, (40, 40, 4), 3, seed=51)
        col = mix(col, DIRT, sstep(0.55, 0.85, streak) * 0.35 + (1 - C) * 0.5)
        return col * (0.85 + 0.15 * AO)[:, None], np.full(n, 0.45, np.float32), np.zeros(n, np.float32)

    def dash(self, P, N, M):
        AO, E, C, z, up = self.common(P, N, M)
        n = len(P)
        T = tri(self.t_dash, P, N, 0.35)
        lt = np.clip(lum(T) / max(float(lum(T).mean()), 1e-3), 0.6, 1.5)
        col = np.tile(np.array([0.105, 0.10, 0.093], np.float32), (n, 1)) * (0.82 + 0.18 * lt)[:, None]
        rough = 0.68 + 0.06 * lt
        # sun-bleached, dusty dash top and parcel-shelf-facing surfaces
        sun = sstep(0.4, 0.85, up) * sstep(0.62, 0.8, z) * (0.55 + 0.45 * fbm(P, 5, 3, seed=61))
        col = mix(col, np.array([0.21, 0.195, 0.175], np.float32), sun * 0.75)
        rough = rough + sun * 0.15
        # cracked dash top (branching dark hairlines, worst on the passenger side and near the screen)
        if self.ctx.dash is not None:
            y0, y1, z0 = self.ctx.dash
            zone = sstep(0.35, 0.6, up) * (P[:, 1] > y0) * (P[:, 1] < y1) * (z > z0)
            zone = zone * np.clip(sstep(0.45, 0.62, fbm(P, 2.2, 2, seed=62)) + sstep(0.0, -0.6, P[:, 0]) * 0.6, 0, 1)
            crack = sstep(0.965, 0.995, ridge(fbm(P, 7, 4, seed=63))) * zone
            crack = np.maximum(crack, sstep(0.975, 0.997, ridge(fbm(P, 16, 3, seed=64))) * zone * 0.8)
            col = mix(col, np.array([0.025, 0.022, 0.02], np.float32), crack)
            col = mix(col, col * 1.25 + 0.03, sstep(0.9, 0.96, ridge(fbm(P, 7, 4, seed=63))) * zone * 0.4)
        # hand-polished edges and switch surrounds, kick scuffs low on door cards
        conv = E * sstep(0.7, 0.95, C)
        col = mix(col, col * 1.5 + 0.03, conv * 0.7)
        rough = rough - conv * 0.3
        kick = sstep(0.45, 0.3, z) * sstep(0.55, 0.62, np.abs(P[:, 0])) * sstep(0.5, 0.75, fbm(P, (4, 20, 6), 3, seed=65))
        col = mix(col, np.array([0.25, 0.23, 0.2], np.float32), kick * 0.6)
        col = mix(col, DUST * 0.5, (1 - C) * 0.55)
        col *= (0.75 + 0.25 * AO)[:, None]
        return col, np.clip(rough, 0.2, 1), np.zeros(n, np.float32)

    def fabric(self, P, N, M, kind):
        AO, E, C, z, up = self.common(P, N, M)
        n = len(P)
        if kind == 'headliner':
            T = tri(self.t_head, P, N, 0.95)
            col = T * np.array([0.92, 0.88, 0.80], np.float32)
            nic = 0.25 + 0.35 * sstep(-0.9, 0.1, P[:, 1]) + 0.2 * fbm(P, 3, 3, seed=71)
            col = mix(col, col * np.array([0.82, 0.72, 0.52], np.float32), np.clip(nic, 0, 1))
            sag = np.exp(-(((P[:, 0] + 0.46) / 0.16) ** 2 + ((P[:, 1] + 0.82) / 0.16) ** 2))
            col = mix(col, col * np.array([0.62, 0.55, 0.42], np.float32), sag * 0.7)
            rough = np.full(n, 0.95, np.float32)
        else:  # carpet + parcel shelf
            T = tri(self.t_carpet, P, N, 0.55)
            col = T * 0.95
            rough = np.full(n, 0.97, np.float32)
            if self.ctx.heel is not None:
                hx, hy = self.ctx.heel
                heel = np.exp(-(((P[:, 0] - hx) / 0.09) ** 2 + ((P[:, 1] - hy) / 0.11) ** 2)) * sstep(0.35, 0.2, z)
                col = mix(col, np.array([0.24, 0.21, 0.17], np.float32), heel * 0.75)
                rough = rough - heel * 0.2
            sand = sstep(0.62, 0.8, fbm(P, 18, 3, seed=72)) * (0.4 + 0.6 * sstep(0.45, 0.62, np.abs(P[:, 0])))
            col = mix(col, DUST * 0.8, sand * 0.45 * sstep(0.4, 0.2, z))
        col = mix(col, col * 0.55, (1 - C) * 0.6)
        col *= (0.72 + 0.28 * AO)[:, None]
        return col, np.clip(rough, 0.2, 1), np.zeros(n, np.float32)

    def seat(self, P, N, M):
        AO, E, C, z, up = self.common(P, N, M)
        n = len(P)
        if self.ctx.kind == 'moto':
            # cracked black vinyl with a split showing yellowed foam
            T = tri(self.t_vinyl, P, N, 0.3)
            lt = np.clip(lum(T) / max(float(lum(T).mean()), 1e-3), 0.6, 1.5)
            col = np.tile(np.array([0.06, 0.055, 0.052], np.float32), (n, 1)) * (0.75 + 0.3 * lt)[:, None]
            wear = sstep(0.5, 0.9, up) * sstep(0.45, 0.7, fbm(P, 6, 3, seed=81))
            col = mix(col, np.array([0.16, 0.15, 0.14], np.float32), wear * 0.6)
            tear = sstep(0.975, 0.995, ridge(fbm(P, (9, 3, 9), 3, seed=82))) * sstep(0.6, 0.9, up)
            col = mix(col, np.array([0.72, 0.62, 0.38], np.float32), tear * 0.9)
            crack = sstep(0.96, 0.99, ridge(fbm(P, 24, 3, seed=83))) * wear
            col = mix(col, col * 0.4, crack)
            rough = 0.5 + 0.3 * wear + tear * 0.4
        else:
            # woven seat fabric (grey-blue), worn pale on the bolsters and the cushion centres
            T = tri(self.t_seat, P, N, 0.32)
            lt = np.clip(lum(T) / max(float(lum(T).mean()), 1e-3), 0.55, 1.6)
            seatc = np.array([0.23, 0.25, 0.29], np.float32)
            col = mix(seatc * lt[:, None], T * 0.9, 0.25)
            wz = np.zeros(n, np.float32)
            for (sx, sy, sz) in self.ctx.seat_centres:
                d2 = ((P[:, 0] - sx) / 0.17) ** 2 + ((P[:, 1] - sy) / 0.2) ** 2 + ((P[:, 2] - sz) / 0.25) ** 2
                wz = np.maximum(wz, np.exp(-d2))
            conv = E * sstep(0.65, 0.95, C)
            wear = np.clip(conv * 0.9 + wz * sstep(0.35, 0.7, fbm(P, 8, 3, seed=84)) * 1.2, 0, 1)
            col = mix(col, lum(col)[:, None] * 1.3 + 0.07, wear * 0.7)
            stain = sstep(0.68, 0.76, fbm(P, 5, 4, seed=85))
            col = mix(col, col * np.array([0.62, 0.55, 0.45], np.float32), stain * 0.6)
            pill = sstep(0.75, 0.9, fbm(P, 160, 2, seed=86)) * wear
            col = mix(col, col * 1.25 + 0.04, pill * 0.5)
            rough = 0.9 - wear * 0.12
        col = mix(col, col * 0.5, (1 - C) * 0.7)
        col *= (0.72 + 0.28 * AO)[:, None]
        return col, np.clip(rough, 0.2, 1), np.zeros(n, np.float32)

    def beads(self, P, N, M):
        AO, E, C, z, up = self.common(P, N, M)
        n = len(P)
        v = vnoise(P * 55.0, 91)
        col = np.array([0.44, 0.27, 0.13], np.float32) * (0.62 + 0.7 * v)[:, None]
        grain = sstep(0.4, 0.9, ridge(fbm(P, (300, 300, 40), 2, seed=92)))
        col *= (0.9 + 0.12 * grain)[:, None]
        col = mix(col, col * 0.35, (1 - C) * 0.9)
        col *= (0.65 + 0.35 * AO)[:, None]
        return col, np.clip(0.3 + (1 - C) * 0.5, 0, 1), np.zeros(n, np.float32)

    # -- dispatch -----------------------------------------------------------------------
    def run(self, name, P, N, M, cav_seam):
        if name == 'paint_yellow':
            return self.paint(P, N, M, cav_seam, 'yellow')
        if name == 'paint_green':
            return self.paint(P, N, M, cav_seam, 'green')
        if name == 'paint_moto':
            return self.paint(P, N, M, cav_seam, 'moto')
        if name in ('chrome', 'metal_steel'):
            return self.metal(P, N, M, chrome=name == 'chrome')
        if name == 'rubber':
            return self.black(P, N, M, 'rubber')
        if name == 'plastic_black':
            return self.black(P, N, M, 'plastic')
        if name == 'paint_black':
            return self.black(P, N, M, 'paint')
        if name.startswith('lens_'):
            return self.lens(P, N, M, name[5:])
        if name in ('sign_panel', 'sign_text'):
            return self.sign(P, N, M, name == 'sign_text')
        if name == 'plastic_dash':
            return self.dash(P, N, M)
        if name == 'fabric_headliner':
            return self.fabric(P, N, M, 'headliner')
        if name == 'carpet':
            return self.fabric(P, N, M, 'carpet')
        if name == 'vinyl_seat':
            return self.seat(P, N, M)
        if name == 'wood_beads':
            return self.beads(P, N, M)
        d = vlib.MAT_DEFS.get(name, dict(color=(0.5, 0.5, 0.5), rough=0.6, metal=0.0))
        n = len(P)
        return (np.tile(np.array(d['color'], np.float32) ** (1 / 2.2), (n, 1)), np.full(n, d['rough'], np.float32),
                np.full(n, d['metal'], np.float32))


def compose(data, ctx, size):
    """data from bake_inputs()[atlas] -> (albedo HxWx3 sRGB, orm HxWx3)."""
    pt = Painter(ctx, size)
    mid = data['mid']
    M = data['mask'].copy()
    # soften bake noise a touch more on AO / cavity
    M[:, :, 0] = box_blur(M[:, :, 0], 1)
    covered = mid > 0
    cav = 1.0 - M[:, :, 2]
    cav_seam = np.clip(box_blur(cav * covered, max(2, size // 400)) * 3.0, 0, 1)
    alb = np.zeros((size, size, 3), np.float32)
    orm = np.zeros((size, size, 3), np.float32)
    orm[:, :, 0] = 1.0
    orm[:, :, 1] = 0.8
    for k, name in enumerate(data['names'], start=1):
        sel = mid == k
        if not sel.any():
            continue
        P = data['pos'][sel]
        N = data['nrm'][sel]
        Mk = M[sel]
        col, rough, metal = pt.run(name, P, N, Mk, cav_seam[sel])
        alb[sel] = np.clip(col, 0, 1)
        orm[sel, 0] = np.clip(0.25 + 0.75 * Mk[:, 0], 0, 1)
        orm[sel, 1] = rough
        orm[sel, 2] = metal
        log('painted', name, int(sel.sum()), 'texels')
    # bleed colours into the empty gutter so mips / bilinear never pick up black
    for _ in range(3):
        empty = ~covered
        if not empty.any():
            break
        for arr in (alb, orm):
            acc = np.zeros_like(arr)
            cnt = np.zeros(covered.shape, np.float32)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                sh = np.roll(np.roll(arr, dy, 0), dx, 1)
                ok = np.roll(np.roll(covered, dy, 0), dx, 1)
                acc += sh * ok[:, :, None]
                cnt += ok
            fill = empty & (cnt > 0)
            arr[fill] = acc[fill] / cnt[fill][:, None]
        covered = covered | (np.roll(covered, 1, 0) | np.roll(covered, -1, 0) | np.roll(covered, 1, 1) |
                             np.roll(covered, -1, 1))
    return alb, orm


def save_rgb(arr, path, quality=88, size=None, srgb=True):
    """Save an (S, S, 3) array (rows bottom-up, display values) as JPEG through Blender."""
    S = arr.shape[0]
    img = bpy.data.images.new(os.path.basename(path), S, S, alpha=False)
    img.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    px = np.ones((S, S, 4), np.float32)
    px[:, :, :3] = arr
    img.pixels.foreach_set(px.ravel())
    if size and size != S:
        img.scale(size, size)
    sc = bpy.context.scene
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0
    sc.view_settings.gamma = 1
    s = sc.render.image_settings
    s.file_format = 'JPEG'
    s.quality = quality
    s.color_mode = 'RGB'
    try:
        s.color_management = 'FOLLOW_SCENE'
    except Exception:
        pass
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save_render(path, scene=sc)
    bpy.data.images.remove(img)
    return path


# ---------------------------------------------------------------------------------------
# export materials
# ---------------------------------------------------------------------------------------
def _export_mat(name):
    if name in bpy.data.materials and bpy.data.materials[name].get('export'):
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m['export'] = 1
    m.use_nodes = True
    d = EXPORT[name]
    b = m.node_tree.nodes.get('Principled BSDF')
    c, r, mt = d.get('plain', ((0.8, 0.8, 0.8), 0.6, 0.0))
    b.inputs['Base Color'].default_value = (*c, 1)
    b.inputs['Roughness'].default_value = r
    b.inputs['Metallic'].default_value = mt
    return m


def remap_export(objs):
    """Replace build materials with the merged export materials (same face assignment)."""
    used = set()
    # free the export names ('chrome', 'glass', ...) held by build materials
    for m in list(bpy.data.materials):
        if not m.get('export') and m.name in EXPORT:
            m['src'] = m.name
            m.name = '_src_' + m.name
    for o in objs:
        if o.type != 'MESH':
            continue
        me = o.data
        for i, m in enumerate(me.materials):
            if m is None or m.get('export'):
                continue
            ex = SRC_TO_EXPORT.get(m.get('src', m.name))
            if ex is None:
                raise RuntimeError(f'no export material for {m.name} on {o.name}')
            me.materials[i] = _export_mat(ex)
            used.add(ex)
    return sorted(used)


def inject_textures(path, atlas_files, export_atlas, extras=None):
    """atlas_files {atlas: (albedo.jpg, orm.jpg)}; export_atlas {export material: atlas}.
    Rewrites every material's PBR block from EXPORT (+ baked atlases)."""
    js, binc = vlib.read_glb(path)
    js['images'], js['textures'], js['samplers'] = [], [], [{'magFilter': 9729, 'minFilter': 9987,
                                                             'wrapS': 33071, 'wrapT': 33071}]
    tex_of = {}
    for a, files in atlas_files.items():
        idx = []
        for kind, fp in zip(('albedo', 'orm'), files):
            with open(fp, 'rb') as f:
                img = f.read()
            while len(binc) % 4:
                binc.append(0)
            off = len(binc)
            binc.extend(img)
            js['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(img)})
            js['images'].append({'name': f'{a}_{kind}', 'bufferView': len(js['bufferViews']) - 1,
                                 'mimeType': 'image/jpeg'})
            js['textures'].append({'name': f'{a}_{kind}', 'sampler': 0, 'source': len(js['images']) - 1})
            idx.append(len(js['textures']) - 1)
        tex_of[a] = idx
    for m in js.get('materials', []):
        d = EXPORT.get(m['name'])
        if d is None:
            continue
        alpha = d.get('alpha', 1.0)
        a = export_atlas.get(m['name'])
        if a in tex_of:
            ta, to = tex_of[a]
            pbr = {'baseColorFactor': [1, 1, 1, alpha], 'baseColorTexture': {'index': ta},
                   'metallicFactor': 1.0, 'roughnessFactor': 1.0, 'metallicRoughnessTexture': {'index': to}}
            m['occlusionTexture'] = {'index': to, 'strength': 1.0}
            m.setdefault('extras', {})['atlas'] = a
        else:
            c, r, mt = d.get('plain', ((0.8, 0.8, 0.8), 0.6, 0.0))
            pbr = {'baseColorFactor': [c[0], c[1], c[2], alpha], 'metallicFactor': mt, 'roughnessFactor': r}
            m.pop('occlusionTexture', None)
        m['pbrMetallicRoughness'] = pbr
        m.pop('extensions', None)
        m.pop('emissiveFactor', None)
        m.pop('emissiveTexture', None)
        if alpha < 1:
            m['alphaMode'] = 'BLEND'
        else:
            m.pop('alphaMode', None)
    used_ext = set()
    for coll in ('materials', 'textures', 'meshes', 'nodes'):
        for it in js.get(coll, []):
            used_ext.update(it.get('extensions', {}).keys())
    if 'extensionsUsed' in js:
        js['extensionsUsed'] = [e for e in js['extensionsUsed'] if e in used_ext]
        if not js['extensionsUsed']:
            del js['extensionsUsed']
    js['buffers'][0]['byteLength'] = len(binc)
    if extras:
        js.setdefault('asset', {}).setdefault('extras', {}).update(extras)
    if not js['images']:
        for k in ('images', 'textures', 'samplers'):
            del js[k]
    vlib.write_glb(path, js, binc)


def bake_all(objs, atlases, ctx, size=2048, samples=4, ao_samples=8, out_dir=None, sizes=None, quality=86,
             lod_size=512):
    """Bake + paint every atlas. Returns {atlas: (albedo.jpg, orm.jpg)} and LOD copies."""
    data = bake_inputs(objs, atlases, size=size, samples=samples, ao_samples=ao_samples, out_dir=out_dir)
    files, lod = {}, {}
    for a in atlases:
        alb, orm = compose(data[a], ctx, size)
        out_sz = (sizes or {}).get(a, size)
        pa = save_rgb(alb, os.path.join(out_dir, f'{a}_albedo.jpg'), quality=quality, size=out_sz)
        po = save_rgb(orm, os.path.join(out_dir, f'{a}_orm.jpg'), quality=90, size=max(512, out_sz // 2), srgb=False)
        files[a] = (pa, po)
        lod[a] = (save_rgb(alb, os.path.join(out_dir, f'{a}_albedo_lod.jpg'), quality=82, size=lod_size),
                  save_rgb(orm, os.path.join(out_dir, f'{a}_orm_lod.jpg'), quality=82, size=lod_size // 2, srgb=False))
        log('atlas painted', a, os.path.getsize(pa) // 1024, 'KB +', os.path.getsize(po) // 1024, 'KB')
    return files, lod
