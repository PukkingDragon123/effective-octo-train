# Build the runtime MakeHuman character pack (public/assets/characters/mh/mh.json + mh.bin).
#
#   BLENDER_USER_RESOURCES=<dir with MPFB2 + asset packs> \
#     blender --background --python tools/characters/build_mh.py -- [--out public/assets/characters/mh] [--only body1,body2]
#   python3 tools/characters/textures.py          # then the textures (skins, hair, parts atlas, eyes)
#
# What it bakes (all in game model space = glTF: metres, Y up, the character faces +Z, its left is +X):
#   * B0: a neutral MakeHuman body re-posed into the Quaternius T-pose (so the CC0 Universal Animation
#     Library clips play unchanged): positions of every kept base-mesh vertex.
#   * bodies: one T-posed MakeHuman body per entry of cast.BODIES (macros + detail targets, height
#     solved), stored as int16 deltas from B0, with its 65 Quaternius-named joint positions.
#   * the body render mesh (MakeHuman topology + UVs), top-4 skin weights (MPFB "game engine" rig
#     renamed to the Quaternius bone names), vertex masks (lips, scalp, ears, nails, head).
#   * sparse morphs: ARKit face units (expressions), face-detail axes (variety), the ghost "uncanny".
#   * proxies fitted at runtime to any body: eyes, eyebrows, eyelashes, teeth, tongue, hair styles,
#     the low-poly LOD bodies and our clothing shells. Each proxy vertex = barycentric combination
#     of 3 base vertices + an offset scaled by the body's local extents (MakeHuman's mhclo fitting).
import bpy, bmesh, sys, os, json, math, time, argparse
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib
import mhlib
importlib.reload(mhlib)
from mhlib import *
import cast as CAST
importlib.reload(CAST)
import shells as SHELLS
importlib.reload(SHELLS)

REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--out', default=os.path.join(REPO, 'public/assets/characters/mh'))
ap.add_argument('--qglb', default=os.path.join(REPO, 'public/assets/characters/body_m.glb'))
ap.add_argument('--only', default='')
args = ap.parse_args(argv)
os.makedirs(args.out, exist_ok=True)
T0 = time.time()


def log(*a):
    print(f'[build_mh {time.time() - T0:6.1f}s]', *a, flush=True)


LocationService = mpfb('services.locationservice').LocationService
HumanService = mpfb('services.humanservice').HumanService
Mhclo = mpfb('entities.clothes.mhclo').Mhclo
SYS_TARGETS = LocationService.get_mpfb_data('targets')
USER_DATA = LocationService.get_user_data()


def target_path(name):
    """'nose/nose-scale-horiz-incr' -> file path (system targets or user data packs)."""
    for root in (SYS_TARGETS, os.path.join(USER_DATA, 'targets')):
        for ext in ('.target.gz', '.target'):
            p = os.path.join(root, name + ext)
            if os.path.isfile(p):
                return p
    raise FileNotFoundError(name)


def expand(name):
    return [name.replace('{s}', s) for s in ('l', 'r')] if '{s}' in name else [name]


def asset_path(sub, rel):
    p = os.path.join(USER_DATA, sub, rel)
    if not os.path.isfile(p):
        raise FileNotFoundError(p)
    return p


# ====================================================================== Quaternius skeleton
Q = quaternius_skeleton(args.qglb)
QN = Q['names']
QI = {n: i for i, n in enumerate(QN)}
MH2Q = {mh_name(q): q for q in QN}
log('quaternius bones', len(QN))

# ====================================================================== neutral body B0
NEUTRAL = {'gender': 0.5, 'age': 0.5, 'muscle': 0.5, 'weight': 0.5, 'height': 0.5, 'proportions': 0.5,
           'race': {'asian': 0.8, 'african': 0.12, 'caucasian': 0.08}}
clear_scene()
bm0, arm0 = make_human(NEUTRAL)
J0 = tpose(arm0, Q)
P0 = toG_np(evaluated_coords(bm0))            # (NB, 3) T-posed neutral
NB = P0.shape[0]
me0 = bm0.data
vg_names = {g.index: g.name for g in bm0.vertex_groups}
groups = {}
for v in me0.vertices:
    for g in v.groups:
        if g.weight > 0:
            groups.setdefault(vg_names[g.group], []).append(v.index)
groups = {k: np.array(v, dtype=np.int64) for k, v in groups.items()}
BODY = np.zeros(NB, bool)
BODY[groups['body']] = True
log('B0 verts', NB, 'body', int(BODY.sum()))

# body polygons -> triangles + per-corner uvs
uvl = me0.uv_layers.active.data
body_tris, body_tri_uv = [], []
for poly in me0.polygons:
    vs = list(poly.vertices)
    if not all(BODY[i] for i in vs):
        continue
    ls = list(poly.loop_indices)
    for k in range(1, len(vs) - 1):
        body_tris.append((vs[0], vs[k], vs[k + 1]))
        body_tri_uv.append((tuple(uvl[ls[0]].uv), tuple(uvl[ls[k]].uv), tuple(uvl[ls[k + 1]].uv)))
body_tris = np.array(body_tris, dtype=np.int64)
log('body tris', len(body_tris))

# skin weights for every base vertex (top 4, Quaternius bone order)
def vertex_weights(obj, names_map):
    vgn = {g.index: g.name for g in obj.vertex_groups}
    n = len(obj.data.vertices)
    W = np.zeros((n, len(QN)), dtype=np.float32)
    for v in obj.data.vertices:
        for g in v.groups:
            nm = vgn[g.group]
            q = names_map.get(nm)
            if q is not None and g.weight > 0:
                W[v.index, QI[q]] += g.weight
    return W


W0 = vertex_weights(bm0, MH2Q)


def top4(W):
    idx = np.argsort(-W, axis=1)[:, :4]
    w = np.take_along_axis(W, idx, axis=1)
    s = w.sum(1, keepdims=True)
    s[s == 0] = 1
    w = w / s
    w8 = np.round(w * 255).astype(np.int32)
    # make the bytes sum to 255 exactly (largest gets the remainder)
    w8[:, 0] += 255 - w8.sum(1)
    w8[W.sum(1) == 0] = 0
    idx[W.sum(1) == 0] = 0
    return idx.astype(np.uint8), np.clip(w8, 0, 255).astype(np.uint8)


# ====================================================================== bodies
def solve_and_make(name, spec):
    sex = spec['sex']
    phen = {'gender': 1.0 if sex == 'm' else 0.0, 'age': age_macro(spec['age']), 'muscle': spec.get('muscle', 0.5),
            'weight': spec.get('weight', 0.5), 'proportions': spec.get('prop', 0.5),
            'cupsize': spec.get('cup', 0.5), 'firmness': 0.6 if spec['age'] < 40 else 0.3 if spec['age'] > 60 else 0.45,
            'race': {'asian': spec['race'][0], 'african': spec['race'][1], 'caucasian': spec['race'][2]}}
    targets = []
    for t, v in spec.get('face', []) + spec.get('body', []):
        for nm in expand(t):
            targets.append((os.path.basename(nm), v))

    def height_at(hm):
        clear_scene()
        p = dict(phen, height=hm)
        bm, arm = make_human(p, targets)
        co = evaluated_coords(bm)
        top = co[BODY][:, 2].max()
        return top, bm, arm
    want = spec['h']
    h0, *_ = height_at(0.5)
    hm1 = min(1.0, max(0.0, 0.5 + (want - h0) * 2.0))
    h1, *_ = height_at(hm1)
    if abs(h1 - h0) > 1e-4:
        hm2 = min(1.0, max(0.0, 0.5 + (want - h0) * (hm1 - 0.5) / (h1 - h0)))
    else:
        hm2 = hm1
    h2, bm, arm = height_at(hm2)
    J = tpose(arm, Q)
    P = toG_np(evaluated_coords(bm))
    joints = np.array([toG(J[n]) for n in QN], dtype=np.float32)
    log(f'body {name}: height macro {hm2:.3f} -> {h2:.3f} m (want {want})')
    return P, joints, float(h2)


body_names = list(CAST.BODIES.keys())
if args.only:
    body_names = [b for b in body_names if b in args.only.split(',')]
BODIES = {}
for nm in body_names:
    P, joints, h = solve_and_make(nm, CAST.BODIES[nm])
    BODIES[nm] = (P, joints, h)

# rebuild B0 (the scene was cleared) for the proxies and shells
clear_scene()
bm0, arm0 = make_human(NEUTRAL)
J0 = tpose(arm0, Q)
P0b = toG_np(evaluated_coords(bm0))
assert np.abs(P0b - P0).max() < 1e-4, 'B0 not reproducible'
J0g = np.array([toG(J0[n]) for n in QN], dtype=np.float32)

# ====================================================================== morph targets
def target_delta(name):
    d = np.zeros((NB, 3), dtype=np.float32)
    for nm in expand(name):
        idx, dd = read_target(target_path(nm))
        d[idx] += dd
    return d


EYE_HELPERS = np.concatenate([groups['helper-l-eye'], groups['helper-r-eye']])
MORPHS = {}
for fu in CAST.FACEUNITS:
    d = target_delta('faceunits/' + fu)
    d[EYE_HELPERS] = 0          # lids move, the eyeballs are rotated by the eye bones
    MORPHS['fu:' + fu] = d
for ax, pos, neg in CAST.FACE_AXES:
    MORPHS['fa:' + ax + '+'] = target_delta(pos)
    if neg:
        MORPHS['fa:' + ax + '-'] = target_delta(neg)
unc = np.zeros((NB, 3), dtype=np.float32)
for t, v in CAST.UNCANNY:
    unc += target_delta(t) * v
MORPHS['ghost:uncanny'] = unc
log('morphs', len(MORPHS))

# ====================================================================== proxies (fitted to B0-T)
PROXIES = {}


def mesh_loops(obj):
    """faces (list of vertex index lists) and per-corner uvs of a mesh object."""
    me = obj.data
    uv = me.uv_layers.active.data if me.uv_layers.active else None
    faces, fuv = [], []
    for p in me.polygons:
        faces.append(list(p.vertices))
        fuv.append([tuple(uv[l].uv) if uv else (0.0, 0.0) for l in p.loop_indices])
    return faces, fuv


def render_split(faces, fuv, keep_vert=None, keep_face=None):
    """unique (vertex, uv) render vertices + triangles."""
    key, rv, ruv, tris = {}, [], [], []
    for fi, (f, uvs) in enumerate(zip(faces, fuv)):
        if keep_face is not None and not keep_face(fi):
            continue
        if keep_vert is not None and not all(keep_vert(i) for i in f):
            continue
        ids = []
        for vi, uv in zip(f, uvs):
            k = (vi, round(uv[0], 5), round(uv[1], 5))
            if k not in key:
                key[k] = len(rv)
                rv.append(vi)
                ruv.append(uv)
            ids.append(key[k])
        for k in range(1, len(ids) - 1):
            tris.append((ids[0], ids[k], ids[k + 1]))
    return np.array(rv, dtype=np.int64), np.array(ruv, dtype=np.float32).reshape(-1, 2), np.array(tris, dtype=np.int64).reshape(-1, 3)


def mhclo_binding(mh, pT, base):
    """Binding of proxy vertices (T-posed positions pT) to base vertices from an mhclo's ref triangles."""
    n = len(pT)
    bi = np.zeros((n, 3), dtype=np.int64)
    bw = np.zeros((n, 3), dtype=np.float32)
    for i in range(n):
        m = mh.verts.get(i)
        if m is None:
            raise RuntimeError('mhclo missing vertex %d' % i)
        vs, ws = m['verts'], m['weights']
        for k in range(3):
            bi[i, k] = vs[k] if k < len(vs) else vs[0]
            bw[i, k] = ws[k] if k < len(ws) else 0.0
    off = pT - (base[bi] * bw[:, :, None]).sum(1)
    return bi, bw, off


def scale_pairs_from_mhclo(mh):
    if not mh.x_scale:
        return None
    return [[mh.x_scale[0], mh.x_scale[1]], [mh.y_scale[0], mh.y_scale[1]], [mh.z_scale[0], mh.z_scale[1]]]


def scale_pairs_auto(bi):
    """per-axis extreme reference vertices of a proxy's bound vertex set."""
    vs = np.unique(bi.reshape(-1))
    pr = []
    for a in range(3):
        c = P0[vs, a]
        pr.append([int(vs[np.argmin(c)]), int(vs[np.argmax(c)])])
    return pr


def proxy_weights(bi, bw):
    W = (W0[bi] * bw[:, :, None]).sum(1)
    return W


def add_mh_proxy(key, sub, rel, part, kind, drop_islands=None, decimate=None, tex=None):
    path = asset_path(sub, rel)
    asset_type = {'eyes': 'eyes', 'eyebrows': 'eyebrows', 'eyelashes': 'eyelashes', 'teeth': 'teeth', 'tongue': 'tongue',
                  'hair': 'hair', 'proxymeshes': 'Proxymeshes'}[sub]
    obj = HumanService.add_mhclo_asset(path, bm0, asset_type=asset_type, subdiv_levels=0, material_type='NONE')
    mh = Mhclo()
    mh.load(path)
    pT = toG_np(evaluated_coords(obj, disable_masks=False))
    faces, fuv = mesh_loops(obj)
    keepv = None
    if drop_islands:
        # connected components; drop the ones the predicate rejects (e.g. the eye's outer cornea shell)
        n = len(obj.data.vertices)
        par = list(range(n))

        def find(a):
            while par[a] != a:
                par[a] = par[par[a]]
                a = par[a]
            return a
        for f in faces:
            for v in f[1:]:
                ra, rb = find(f[0]), find(v)
                if ra != rb:
                    par[ra] = rb
        comp = {}
        for v in range(n):
            comp.setdefault(find(v), []).append(v)
        keep = np.ones(n, bool)
        for c in comp.values():
            if drop_islands(pT[c]):
                keep[c] = False
        keepv = lambda i: keep[i]
    bi, bw, off = mhclo_binding(mh, pT, P0)
    rv, ruv, tris = render_split(faces, fuv, keep_vert=keepv)
    W = proxy_weights(bi, bw)
    PROXIES[key] = dict(kind=kind, part=part, rv=rv, uv=ruv, tris=tris, bi=bi[rv], bw=bw[rv], off=off[rv], W=W[rv],
                        pairs=scale_pairs_from_mhclo(mh) or scale_pairs_auto(bi), tex=tex, src=rel, weld=rv)
    bpy.data.objects.remove(obj, do_unlink=True)
    log(f'proxy {key}: {len(rv)} verts, {len(tris)} tris')


def mhmat_texture(sub, rel):
    """diffuse texture file of a proxy (from its .mhmat)."""
    folder = os.path.dirname(asset_path(sub, rel))
    for f in os.listdir(folder):
        if f.endswith('.mhmat'):
            for line in open(os.path.join(folder, f), encoding='utf8', errors='ignore'):
                w = line.split()
                if len(w) >= 2 and w[0] == 'diffuseTexture':
                    p = os.path.join(folder, os.path.basename(w[1]))
                    if os.path.isfile(p):
                        return p
    return None


TEXJOBS = {'hair': {}, 'parts': {}, 'eye': None}
# eyes: keep the eyeball (drop the larger outer cornea shell of each eye)
def _cornea(pts):
    return (pts.max(0) - pts.min(0))[2] > 0.0222
add_mh_proxy('eyes', 'eyes', 'high-poly/high-poly.mhclo', part=7, kind='eyes', drop_islands=_cornea)
TEXJOBS['eye'] = os.path.join(USER_DATA, 'eyes', 'materials', 'brown_eye.png')
for k, rel in CAST.BROWS.items():
    add_mh_proxy('brows_' + k, 'eyebrows', rel, part=3, kind='brows', tex='brows_' + k)
    TEXJOBS['parts']['brows_' + k] = mhmat_texture('eyebrows', rel)
for k, rel in CAST.LASHES.items():
    add_mh_proxy('lashes_' + k, 'eyelashes', rel, part=4, kind='lashes', tex='lashes_' + k)
    TEXJOBS['parts']['lashes_' + k] = mhmat_texture('eyelashes', rel)
add_mh_proxy('teeth', 'teeth', 'teeth_base/teeth_base.mhclo', part=5, kind='teeth', tex='teeth')
TEXJOBS['parts']['teeth'] = mhmat_texture('teeth', 'teeth_base/teeth_base.mhclo')
add_mh_proxy('tongue', 'tongue', 'tongue01/tongue01.mhclo', part=6, kind='tongue', tex='tongue')
TEXJOBS['parts']['tongue'] = mhmat_texture('tongue', 'tongue01/tongue01.mhclo')
for k, rel in CAST.HAIR.items():
    try:
        add_mh_proxy('hair_' + k, 'hair', rel, part=2, kind='hair', tex='hair_' + k)
        TEXJOBS['hair']['hair_' + k] = mhmat_texture('hair', rel)
    except Exception as e:
        log('hair', k, 'FAILED', e)
for k, rel in (('lod_m', 'male1591/male1591.proxy'), ('lod_f', 'female1605/female1605.proxy')):
    try:
        add_mh_proxy(k, 'proxymeshes', rel, part=0, kind='lod')
    except Exception as e:
        log('lod', k, 'FAILED', e)

# ====================================================================== landmarks (B0, base indices)
def landmarks_pre():
    head = np.zeros(NB, bool)
    head[groups['head']] = True
    lips = groups['lips']
    P = P0
    L = {}
    cx = lambda idx: idx[np.abs(P[idx, 0]) < 0.004]
    lc = cx(lips)
    # mouth corners: lips vertices furthest from the midline
    L['mouthL'] = int(lips[np.argmax(P[lips, 0])])
    L['mouthR'] = int(lips[np.argmin(P[lips, 0])])
    # midline lips: the lower lip drops with jawOpen, the upper lip does not
    dy = MORPHS['fu:jawOpen'][lc, 1]
    front = lc[P[lc, 2] > P[lc, 2].max() - 0.012]
    dyf = MORPHS['fu:jawOpen'][front, 1]
    upper = front[dyf > -0.0015]
    lower = front[dyf < -0.003]
    if not len(upper) or not len(lower):
        my = P[[L['mouthL'], L['mouthR']], 1].mean()
        upper = front[P[front, 1] >= my]
        lower = front[P[front, 1] < my]
    L['upperLip'] = int(upper[np.argmax(P[upper, 2])])
    L['lowerLip'] = int(lower[np.argmax(P[lower, 2])])
    L['upperLipEdge'] = int(upper[np.argmin(P[upper, 1])])
    L['lowerLipEdge'] = int(lower[np.argmax(P[lower, 1])])
    del dy
    mid = np.nonzero(head & BODY & (np.abs(P[:, 0]) < 0.003))[0]
    eyey = P[groups['helper-l-eye'], 1].mean()
    mouthy = P[[L['mouthL'], L['mouthR']], 1].mean()
    band = mid[(P[mid, 1] < eyey - 0.015) & (P[mid, 1] > mouthy + 0.008)]
    L['noseTip'] = int(band[np.argmax(P[band, 2])])
    below = mid[(P[mid, 1] < mouthy - 0.02) & (P[mid, 2] > P[L['lowerLip'], 2] - 0.05)]
    # chin: lowest front midline vertex before the surface turns under the jaw
    front = below[P[below, 2] > P[L['lowerLip'], 2] - 0.03]
    L['chin'] = int(front[np.argmin(P[front, 1])]) if len(front) else int(below[np.argmax(P[below, 2])])
    brow = mid[(P[mid, 1] > eyey + 0.01) & (P[mid, 1] < eyey + 0.04)]
    L['brow'] = int(brow[np.argmax(P[brow, 2])])
    top = np.nonzero(head & BODY)[0]
    L['top'] = int(top[np.argmax(P[top, 1])])
    L['earL'] = int(groups['ears'][np.argmax(P[groups['ears'], 0])])
    L['earR'] = int(groups['ears'][np.argmin(P[groups['ears'], 0])])
    return L



# ====================================================================== clothing shells (authored on B0-T)
body_bvh = BVHTree.FromPolygons([tuple(p) for p in P0], [tuple(t) for t in body_tris], all_triangles=True)
ctx = SHELLS.Ctx(P0=P0, tris=body_tris, W=W0, QI=QI, J=J0g, QN=QN, bvh=body_bvh, groups=groups, log=log)
HEADV = np.zeros(NB, bool)
HEADV[groups['head']] = True
head_tris = body_tris[HEADV[body_tris].all(1)]
head_bvh = BVHTree.FromPolygons([tuple(p) for p in P0], [tuple(t) for t in head_tris], all_triangles=True)
SHELL_SET = SHELLS.build_all(ctx)
for fn in (SHELLS.veil, SHELLS.bun):
    try:
        SHELL_SET.update(fn(ctx, landmarks_pre()))
    except Exception as e:
        import traceback
        traceback.print_exc()
        log(fn.__name__, 'FAILED', e)
for key, sh in SHELL_SET.items():
    pos, faces, fuv = sh['pos'], sh['faces'], sh['uv']
    tri_set = head_tris if sh.get('bind') == 'head' else body_tris
    bvh = head_bvh if sh.get('bind') == 'head' else body_bvh
    # bind every shell vertex to the nearest body triangle
    n = len(pos)
    bi = np.zeros((n, 3), dtype=np.int64)
    bw = np.zeros((n, 3), dtype=np.float32)
    for i in range(n):
        loc, nrm, ti, dist = bvh.find_nearest(Vector(pos[i]))
        t = tri_set[ti]
        a, b, c = P0[t[0]], P0[t[1]], P0[t[2]]
        w = SHELLS.barycentric(np.array(loc), a, b, c)
        bi[i] = t
        bw[i] = w
    off = pos - (P0[bi] * bw[:, :, None]).sum(1)
    W = sh['W'] if sh.get('W') is not None else proxy_weights(bi, bw)
    rv, ruv, tris = render_split(faces, fuv)
    PROXIES[key] = dict(kind=sh.get('kind', 'shell'), part=sh.get('part', 1), rv=rv, uv=ruv, tris=tris, bi=bi[rv], bw=bw[rv], off=off[rv], W=W[rv],
                        pairs=scale_pairs_auto(bi), tex=None, src='generated', weld=rv, hide=sh.get('hide'),
                        uvspace=sh.get('uvspace', 'atlas'))
    log(f'shell {key}: {len(rv)} verts, {len(tris)} tris, hide {0 if sh.get("hide") is None else len(sh["hide"])}')

# ====================================================================== compact the base vertex set
used = BODY.copy()
for p in PROXIES.values():
    used[np.unique(p['bi'])] = True
    for pr in p['pairs']:
        used[pr] = True
KEEP = np.nonzero(used)[0]
REMAP = -np.ones(NB, dtype=np.int64)
REMAP[KEEP] = np.arange(len(KEEP))
NK = len(KEEP)
log('kept base verts', NK, 'of', NB)


# ====================================================================== landmarks (B0, compact indices)
LM = landmarks_pre()
for k, v in LM.items():
    used[v] = True
assert all(REMAP[v] >= 0 for v in LM.values()), 'landmark not kept'
log('landmarks', {k: tuple(np.round(P0[v], 3)) for k, v in LM.items()})

# vertex masks: bit0 lips, bit1 scalp, bit2 ears, bit3 nails, bit4 head, bit5 nipples, bit6 eyelid area
MASK = np.zeros(NB, dtype=np.uint8)
for bit, gname in ((0, 'lips'), (1, 'scalp'), (2, 'ears'), (3, 'fingernails'), (3, 'toenails'), (4, 'head'), (5, 'nipple')):
    if gname in groups:
        MASK[groups[gname]] |= (1 << bit)
blink = np.linalg.norm(MORPHS['fu:eyeBlinkLeft'] + MORPHS['fu:eyeBlinkRight'], axis=1)
MASK[blink > 0.0005] |= (1 << 6)

# ====================================================================== write
BIN = bytearray()
META = {'version': 1, 'space': 'glTF metres, Y up, faces +Z, left +X', 'nb': int(NK),
        'bones': {'names': QN, 'parent': Q['parent'], 'gq': [list(map(float, q)) for q in Q['gq']]},
        'bodies': {}, 'morphs': {}, 'proxies': {}, 'landmarks': {k: int(REMAP[v]) for k, v in LM.items()},
        'faceAxes': [a[0] for a in CAST.FACE_AXES], 'faceunits': CAST.FACEUNITS,
        'hairStyles': {k: 'hair_' + k for k in list(CAST.HAIR) + ['bun'] if 'hair_' + k in PROXIES},
        'brows': list(CAST.BROWS.keys()), 'credits': 'MakeHuman system assets + CC0 community packs (docs/credits/characters.md)'}


def put(arr):
    a = np.ascontiguousarray(arr)
    while len(BIN) % 4:
        BIN.append(0)
    off = len(BIN)
    BIN.extend(a.tobytes())
    return {'o': off, 'n': int(a.size), 't': {np.dtype(np.float32): 'f32', np.dtype(np.int16): 'i16', np.dtype(np.uint16): 'u16',
                                                 np.dtype(np.uint32): 'u32', np.dtype(np.uint8): 'u8', np.dtype(np.int8): 'i8'}[a.dtype]}


def q16(d):
    m = float(np.abs(d).max()) if d.size else 0.0
    s = max(m, 1e-6) / 32767.0
    return np.round(d / s).astype(np.int16), s


P0k = P0[KEEP].astype(np.float32)
META['b0'] = put(P0k)
META['b0joints'] = put(J0g.astype(np.float32))
for nm, (P, joints, h) in BODIES.items():
    d, s = q16((P[KEEP] - P0[KEEP]).astype(np.float32))
    spec = CAST.BODIES[nm]
    META['bodies'][nm] = {'d': put(d), 's': s, 'joints': put(joints.astype(np.float32)), 'height': h,
                          'sex': spec['sex'], 'age': spec['age'], 'build': [spec.get('muscle', 0.5), spec.get('weight', 0.5)]}
# body render mesh
rv, ruv, tris = render_split([list(t) for t in body_tris], [list(u) for u in body_tri_uv])
META['body'] = {'rv': put(REMAP[rv].astype(np.uint16)), 'uv': put(ruv.astype(np.float32)), 'tris': put(tris.astype(np.uint16)),
                'ntris': int(len(tris)), 'baseTris': put(REMAP[body_tris].astype(np.uint16))}
bi_, bw_ = top4(W0[KEEP])
META['skin'] = {'i': put(bi_), 'w': put(bw_)}
META['mask'] = put(MASK[KEEP])
# body triangle index per render triangle == same order (render_split keeps the face order 1:1)
assert len(tris) == len(body_tris)
for nm, d in MORPHS.items():
    dk = d[KEEP]
    nz = np.nonzero(np.abs(dk).max(1) > 1e-6)[0]
    if not len(nz):
        continue
    qd, s = q16(dk[nz].astype(np.float32))
    META['morphs'][nm] = {'i': put(nz.astype(np.uint16)), 'd': put(qd), 's': s}
for key, p in PROXIES.items():
    bi_c = REMAP[p['bi']]
    assert (bi_c >= 0).all(), key
    pairs = [[int(REMAP[a]), int(REMAP[b])] for a, b in p['pairs']]
    ref = [abs(float(P0[a, ax] - P0[b, ax])) for ax, (a, b) in enumerate(p['pairs'])]
    si, sw = top4(p['W'])
    offq, offs = q16(p['off'].astype(np.float32))
    # uvs are stored as uint16 over [-0.25, 1.25] (some MakeHuman hair uvs overshoot 0..1 a little)
    assert p['uv'].min() > -0.25 and p['uv'].max() < 1.25, (key, p['uv'].min(), p['uv'].max())
    # weld map: render vertices sharing a source vertex (normals are averaged across uv seams)
    _, weld = np.unique(p['weld'], return_inverse=True)
    ent = {'kind': p['kind'], 'part': p['part'], 'nv': int(len(p['rv'])), 'ntris': int(len(p['tris'])),
           'tris': put(p['tris'].astype(np.uint32 if len(p['rv']) > 65535 else np.uint16)), 'uv': put(np.clip(np.round((p['uv'] + 0.25) / 1.5 * 65535), 0, 65535).astype(np.uint16)),
           'bi': put(bi_c.astype(np.uint16)), 'bw': put(np.clip(np.round(p['bw'] * 65535), 0, 65535).astype(np.uint16)),
           'off': put(offq), 'offs': offs,
           'pairs': pairs, 'ref': ref, 'si': put(si), 'sw': put(sw), 'weld': put(weld.astype(np.uint16)),
           'tex': p['tex'], 'uvspace': p.get('uvspace', 'mh'), 'src': p['src']}
    if p.get('hide') is not None:
        ent['hide'] = put(np.array(sorted(p['hide']), dtype=np.uint16))
    if p.get('extra'):
        ent['extra'] = p['extra']
    META['proxies'][key] = ent
META['textures'] = {'jobs': TEXJOBS}
with open(os.path.join(args.out, 'mh.bin'), 'wb') as f:
    f.write(bytes(BIN))
with open(os.path.join(args.out, 'mh.json'), 'w') as f:
    json.dump(META, f, separators=(',', ':'))
with open(os.path.join(HERE, '.texjobs.json'), 'w') as f:
    json.dump(TEXJOBS, f, indent=1)
log('wrote', len(BIN) // 1024, 'KB bin,', os.path.getsize(os.path.join(args.out, 'mh.json')) // 1024, 'KB json')
