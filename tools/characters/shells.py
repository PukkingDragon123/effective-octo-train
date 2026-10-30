# Clothing shells for the MakeHuman bodies, authored on the neutral T-posed body B0 (glTF space).
#
# Each shell is cut from the body surface itself (so it fits), pushed out by an "ease" that grows
# toward loose areas and hems, bridged over concavities (cloth spans the chest and the small of the
# back instead of following every hollow), Laplacian-smoothed, kept outside the skin, cut at clean
# planar hems and given a turned-back hem lip (visible cloth thickness). Skirts / sarongs are tubes
# around the convex hull of both legs. UVs follow the procedural atlas layout of
# src/characters/glb/layout.js (torso / arm / leg / skirt / foot regions) so the existing painters
# (fabrics, prints, collars, cut-outs, sequins, name tags) dress them.
#
# build_mh.py binds every shell vertex to the nearest body triangle so the runtime refits the
# clothes to any body (fat, thin, child, elder).
import math
import numpy as np
from mathutils import Vector, geometry

ATLAS = 1024.0
INSET = 5.0
R = {
    'torso': (0, 0, 512, 400), 'leg': (512, 0, 288, 512), 'arm': (800, 0, 224, 400), 'foot': (512, 512, 192, 160),
    'skirt': (0, 720, 400, 200),
}


def ruv(reg, s, t):
    if reg not in R:
        return (0.5, 0.5)
    x, y, w, h = R[reg]
    s = min(1.0, max(0.0, s))
    t = min(1.0, max(0.0, t))
    return ((x + INSET + s * (w - 2 * INSET)) / ATLAS, (y + INSET + t * (h - 2 * INSET)) / ATLAS)


def interp(pairs, x):
    p = pairs
    i = 0
    while i < len(p) - 2 and x > p[i + 1][0]:
        i += 1
    (x0, y0), (x1, y1) = p[i], p[i + 1]
    return y0 + (y1 - y0) * (x - x0) / ((x1 - x0) or 1)


def barycentric(p, a, b, c):
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11 = v0 @ v0, v0 @ v1, v1 @ v1
    d20, d21 = v2 @ v0, v2 @ v1
    den = d00 * d11 - d01 * d01
    if abs(den) < 1e-14:
        return np.array([1.0, 0.0, 0.0], dtype=np.float32)
    v = (d11 * d20 - d01 * d21) / den
    w = (d00 * d21 - d01 * d20) / den
    u = 1 - v - w
    return np.array([u, v, w], dtype=np.float32)


def smooth01(a, b, x):
    t = min(1.0, max(0.0, (x - a) / ((b - a) or 1e-9)))
    return t * t * (3 - 2 * t)


class Ctx:
    def __init__(self, **kw):
        self.__dict__.update(kw)
        P, T = self.P0, self.tris
        # area-weighted vertex normals of the body
        n = np.zeros_like(P)
        fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
        for k in range(3):
            np.add.at(n, T[:, k], fn)
        ln = np.linalg.norm(n, axis=1, keepdims=True)
        ln[ln == 0] = 1
        self.N = n / ln
        J = {nm: self.J[i] for i, nm in enumerate(self.QN)}
        self.Jd = J
        body = np.zeros(len(P), bool)
        body[self.groups['body']] = True
        self.body = body
        top = P[body][:, 1].max()
        self.zmap = [(J['foot_l'][1], 0.075), (J['calf_l'][1], 0.48), (J['thigh_l'][1], 0.9), (J['spine_01'][1], 1.05),
                     (J['spine_03'][1], 1.24), (J['upperarm_l'][1], 1.405), (J['neck_01'][1], 1.445), (J['Head'][1], 1.555), (top, 1.784)]
        self.zinv = [(b, a) for a, b in self.zmap]
        ux, lx, hx, cx = J['upperarm_l'][0], J['lowerarm_l'][0], J['hand_l'][0], J['clavicle_l'][0]
        k1 = 0.29 / (lx - ux)
        self.armmap = [(cx, -(ux - cx) * k1), (ux, 0.0), (lx, 0.29), (hx, 0.54), (hx + 0.3, 0.54 + 0.3 * 0.25 / (hx - lx))]
        self.arminv = [(b, a) for a, b in self.armmap]
        self.shX = ux
        qi = self.QI
        W = self.W
        self.armW = sum(W[:, qi[f'{b}_{s}']] for b in ('upperarm', 'lowerarm', 'hand') for s in ('l', 'r'))
        self.legW = sum(W[:, qi[f'{b}_{s}']] for b in ('thigh', 'calf', 'foot', 'ball') for s in ('l', 'r'))
        self.footW = sum(W[:, qi[f'{b}_{s}']] for b in ('foot', 'ball') for s in ('l', 'r'))
        self.crotchY = self.yOf(0.885)

    def yref(self, y):
        return interp(self.zmap, y)

    def yOf(self, r):
        return interp(self.zinv, r)

    def armD(self, ax):
        return interp(self.armmap, ax)

    def xOfD(self, d):
        return interp(self.arminv, d)

    # axis centres for the cylindrical projections
    def torso_cz(self, y):
        P = self.P0
        m = self.body & (np.abs(P[:, 1] - y) < 0.012) & (np.abs(P[:, 0]) < self.shX - 0.02)
        return float(P[m, 2].mean()) if m.any() else 0.0

    def leg_axis(self, y, side):
        J = self.Jd
        s = 'l' if side > 0 else 'r'
        pts = [J['thigh_' + s], J['calf_' + s], J['foot_' + s]]
        if y >= pts[0][1]:
            return pts[0][0], pts[0][2]
        for a, b in ((pts[0], pts[1]), (pts[1], pts[2])):
            if b[1] <= y <= a[1]:
                t = (a[1] - y) / ((a[1] - b[1]) or 1)
                return a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t
        return pts[2][0], pts[2][2]

    def arm_axis(self, ax):
        J = self.Jd
        pts = [J['upperarm_l'], J['lowerarm_l'], J['hand_l']]
        if ax <= pts[0][0]:
            return pts[0][1], pts[0][2]
        for a, b in ((pts[0], pts[1]), (pts[1], pts[2])):
            if a[0] <= ax <= b[0]:
                t = (ax - a[0]) / ((b[0] - a[0]) or 1)
                return a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t
        return pts[2][1], pts[2][2]


# ---------------------------------------------------------------------- UV mapping per region
def corner_uv(ctx, reg, p, extra=None):
    """(s, t) in a region for a point p (glTF)."""
    x, y, z = p
    if reg == 'torso':
        cz = extra if extra is not None else ctx.torso_cz(y)
        s = 0.5 + math.atan2(x, z - cz) / (2 * math.pi)
        t = (1.5 - ctx.yref(y)) / 0.72
    elif reg == 'leg':
        side = 1 if x >= 0 else -1
        cx, cz = ctx.leg_axis(y, side)
        s = 0.5 + math.atan2(side * (x - cx), z - cz) / (2 * math.pi)
        t = 1.0 - ctx.yref(y)
    elif reg == 'arm':
        cy, cz = ctx.arm_axis(abs(x))
        s = 0.5 + math.atan2(z - cz, y - cy) / (2 * math.pi)
        t = (ctx.armD(abs(x)) + 0.06) / 0.62
    elif reg == 'skirt':
        y0, y1, cz = extra
        s = 0.5 + math.atan2(x, z - cz) / (2 * math.pi)
        t = (y0 - y) / ((y0 - y1) or 1)
    elif reg == 'foot':
        side = 1 if x >= 0 else -1
        cx, cy, z0, z1 = extra[side]
        s = 0.5 + math.atan2(side * (x - cx), y - cy) / (2 * math.pi)
        t = (z - z0) / ((z1 - z0) or 1)
    else:
        s = t = 0.5
    return s, t


def face_uvs(ctx, reg, pts, extra=None):
    st = [corner_uv(ctx, reg, p, extra) for p in pts]
    if reg in ('torso', 'leg', 'arm', 'skirt', 'foot'):
        ss = [a for a, _ in st]
        if max(ss) - min(ss) > 0.5:
            mean = sum(ss) / len(ss)
            if mean >= 0.5:
                st = [(1.0 if a < 0.5 else a, b) for a, b in st]
            else:
                st = [(0.0 if a > 0.5 else a, b) for a, b in st]
    return [ruv(reg, s, t) for s, t in st]


# ---------------------------------------------------------------------- mesh helpers
def submesh(ctx, inside):
    """body triangles with at least one vertex inside -> (src vertex ids, local faces)."""
    T = ctx.tris
    sel = inside[T].any(1)
    ft = T[sel]
    src = np.unique(ft.reshape(-1))
    loc = -np.ones(len(ctx.P0), dtype=np.int64)
    loc[src] = np.arange(len(src))
    return src, loc[ft], np.nonzero(sel)[0]


def neighbours(n, faces):
    nb = [set() for _ in range(n)]
    edges = {}
    for f in faces:
        for k in range(len(f)):
            a, b = int(f[k]), int(f[(k + 1) % len(f)])
            nb[a].add(b)
            nb[b].add(a)
            e = (min(a, b), max(a, b))
            edges[e] = edges.get(e, 0) + 1
    boundary = np.zeros(n, bool)
    for (a, b), c in edges.items():
        if c == 1:
            boundary[a] = boundary[b] = True
    return [np.array(sorted(s), dtype=np.int64) for s in nb], boundary, [e for e, c in edges.items() if c == 1]


def laplacian(pos, nb, fixed, it=4, lam=0.5):
    p = pos.copy()
    for _ in range(it):
        avg = np.array([p[n].mean(0) if len(n) else p[i] for i, n in enumerate(nb)])
        upd = p + lam * (avg - p)
        upd[fixed] = p[fixed]
        p = upd
    return p


def keep_outside(ctx, pos, min_ease):
    for i in range(len(pos)):
        loc, nrm, ti, dist = ctx.bvh.find_nearest(Vector(pos[i]))
        if loc is None:
            continue
        d = Vector(pos[i]) - loc
        s = d.dot(nrm)
        m = min_ease[i] if hasattr(min_ease, '__len__') else min_ease
        if s < m:
            pos[i] = np.array(loc + nrm * m + (d - nrm * s) * 0.5)
    return pos


def hull_push(ctx, pos, mask, key_fn, k, bin_h=0.015):
    """push vertices toward the convex hull of their horizontal slice (cloth bridges hollows)."""
    if k <= 0:
        return pos
    keys = {}
    for i in np.nonzero(mask)[0]:
        keys.setdefault(key_fn(i), []).append(i)
    out = pos.copy()
    for key, ids in keys.items():
        if len(ids) < 6:
            continue
        pts2 = [(float(pos[i, 0]), float(pos[i, 2])) for i in ids]
        hull = geometry.convex_hull_2d(pts2)
        poly = [pts2[h] for h in hull]
        cx = sum(p[0] for p in poly) / len(poly)
        cz = sum(p[1] for p in poly) / len(poly)
        for i, (x, z) in zip(ids, pts2):
            dx, dz = x - cx, z - cz
            r = math.hypot(dx, dz)
            if r < 1e-5:
                continue
            ux, uz = dx / r, dz / r
            # ray from the centre through the point: distance to the hull boundary
            best = None
            for a in range(len(poly)):
                (x1, z1), (x2, z2) = poly[a], poly[(a + 1) % len(poly)]
                ex, ez = x2 - x1, z2 - z1
                den = ux * ez - uz * ex
                if abs(den) < 1e-12:
                    continue
                tt = ((x1 - cx) * ez - (z1 - cz) * ex) / den
                uu = ((x1 - cx) * uz - (z1 - cz) * ux) / den
                if tt > 0 and -1e-6 <= uu <= 1 + 1e-6:
                    best = tt if best is None else max(best, tt)
            if best is None or best <= r:
                continue
            nr = r + (best - r) * k
            out[i, 0] = cx + ux * nr
            out[i, 2] = cz + uz * nr
    return out


def hem_lip(pos, faces, uvs, bedges, inward, depth=0.004, back=0.005, back_dir=None):
    """turned-back hem: an inner strip under each boundary edge (cloth thickness)."""
    n0 = len(pos)
    dup = {}
    newpos = []
    for a, b in bedges:
        for v in (a, b):
            if v not in dup:
                d = -inward[v] * depth
                if back_dir is not None:
                    d = d + back_dir(v) * back
                dup[v] = n0 + len(newpos)
                newpos.append(pos[v] + d)
    if not newpos:
        return pos, faces, uvs
    pos = np.concatenate([pos, np.array(newpos)], 0)
    # uv of a boundary vertex: from any face corner that uses it
    vuv = {}
    for f, fu in zip(faces, uvs):
        for v, u in zip(f, fu):
            vuv.setdefault(int(v), u)
    faces = list(faces)
    uvs = list(uvs)
    for a, b in bedges:
        faces.append([a, b, dup[b], dup[a]])
        uvs.append([vuv[a], vuv[b], vuv[b], vuv[a]])
    return pos, faces, uvs


def vertex_normals(pos, faces):
    n = np.zeros_like(pos)
    for f in faces:
        a, b, c = pos[f[0]], pos[f[1]], pos[f[2]]
        fn = np.cross(b - a, c - a)
        for v in f:
            n[v] += fn
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    ln[ln == 0] = 1
    return n / ln


# ---------------------------------------------------------------------- generic body-cut shell
def body_shell(ctx, inside, clamp_fn, ease_fn, bridge=None, smooth_it=4, min_ease=0.003, region_fn=None, lip=True, back_fn=None):
    src, faces, src_tris = submesh(ctx, inside)
    P = ctx.P0[src].copy()
    N = ctx.N[src]
    pos = P + N * np.array([ease_fn(p) for p in P])[:, None]
    nb, boundary, bedges = neighbours(len(pos), faces)
    if bridge is not None:
        pos = bridge(pos)
    pos = laplacian(pos, nb, boundary, it=smooth_it)
    pos = keep_outside(ctx, pos, np.array([max(min_ease, ease_fn(p) * 0.6) for p in P]))
    pos = np.array([clamp_fn(p) for p in pos])
    faces = [list(map(int, f)) for f in faces]
    uvs = []
    for f in faces:
        c = pos[f].mean(0)
        reg = region_fn(c) if region_fn else 'torso'
        uvs.append(face_uvs(ctx, reg, [pos[v] for v in f]))
    if lip:
        inward = vertex_normals(pos, faces)
        pos, faces, uvs = hem_lip(pos, faces, uvs, bedges, inward, back_dir=back_fn)
    return pos, faces, uvs, src_tris


def hide_set(ctx, vin):
    """body triangles whose three vertices all satisfy vin (covered well inside a garment)."""
    T = ctx.tris
    return set(int(i) for i in np.nonzero(vin[T].all(1))[0])


# ---------------------------------------------------------------------- garments
def tops(ctx):
    P = ctx.P0
    out = {}
    neckY = ctx.yOf(1.5)
    shX = ctx.shX + 0.012
    specs = {'t': (0.975, 0.004, 0.006, 0.35, 0.004), 'u': (0.86, 0.006, 0.012, 0.6, 0.012),
             'l': (0.875, 0.008, 0.016, 0.75, 0.02), 'j': (0.87, 0.011, 0.018, 0.85, 0.016)}
    for key, (hemR, e0, belly, bridgeK, flare) in specs.items():
        hemY = ctx.yOf(hemR)
        inside = ctx.body & (P[:, 1] >= hemY) & (P[:, 1] <= neckY) & (np.abs(P[:, 0]) <= shX) & ((ctx.armW < 0.5) | (np.abs(P[:, 0]) < ctx.shX - 0.01))

        def ease(p, hemY=hemY, e0=e0, belly=belly, flare=flare):
            yr = ctx.yref(p[1])
            e = e0
            e += belly * smooth01(1.3, 1.1, yr)                    # looser from the chest down
            e += flare * smooth01(hemY + 0.08, hemY, p[1])         # hem flare
            e *= 1.0 - 0.6 * smooth01(1.43, 1.49, yr)             # snug at the neck
            return e

        def clamp(p, hemY=hemY):
            q = p.copy()
            q[1] = min(max(q[1], hemY), neckY)
            if abs(q[0]) > shX:
                q[0] = math.copysign(shX, q[0])
            return q

        def bridge(pos, k=bridgeK):
            m = (np.abs(pos[:, 0]) < ctx.shX - 0.03) & (pos[:, 1] < ctx.yOf(1.34))
            return hull_push(ctx, pos, m, lambda i: int(pos[i, 1] / 0.015), k)
        pos, faces, uvs, _ = body_shell(ctx, inside, clamp, ease, bridge=bridge, smooth_it=5)
        vin = ctx.body & (P[:, 1] >= hemY + 0.03) & (np.abs(P[:, 0]) < ctx.shX - 0.03) & (np.array([ctx.yref(y) for y in P[:, 1]]) < 1.15)
        out['shell_top_' + key] = dict(pos=pos, faces=faces, uv=uvs, hide=hide_set(ctx, vin))
    return out


def sleeves(ctx):
    P = ctx.P0
    out = {}
    startX = ctx.shX - 0.035
    specs = {'cap': (0.065, 0.006, 0.006), 'short': (0.15, 0.007, 0.009), 'rolled': (0.33, 0.008, 0.006), 'long': (0.535, 0.007, 0.004)}
    ax = np.abs(P[:, 0])
    for key, (endD, e0, flare) in specs.items():
        endX = ctx.xOfD(endD)
        inside = ctx.body & (ax >= startX) & (ax <= endX) & ((ctx.armW > 0.3) | (ax > ctx.shX + 0.02))

        def ease(p, endX=endX, e0=e0, flare=flare, key=key):
            a = abs(p[0])
            e = e0 + flare * smooth01(endX - 0.06, endX, a)
            if key == 'rolled':
                e += 0.007 * smooth01(endX - 0.045, endX - 0.035, a)   # rolled cuff
            return e

        def clamp(p, endX=endX):
            q = p.copy()
            a = min(max(abs(q[0]), startX), endX)
            q[0] = math.copysign(a, q[0])
            return q
        pos, faces, uvs, _ = body_shell(ctx, inside, clamp, ease, smooth_it=3, region_fn=lambda c: 'arm')
        vin = ctx.body & (ax >= ctx.shX + 0.03) & (ax <= endX - 0.03) & (ctx.armW > 0.6)
        out['shell_sleeve_' + key] = dict(pos=pos, faces=faces, uv=uvs, hide=hide_set(ctx, vin))
    return out


def bottoms(ctx):
    P = ctx.P0
    out = {}
    waistY = ctx.yOf(1.0)
    specs = {'shorts': (0.64, 0.008, 0.016, 0.5), 'knee': (0.5, 0.009, 0.02, 0.5), 'trousers': (0.06, 0.007, 0.01, 0.4), 'loose': (0.1, 0.016, 0.03, 0.85)}
    lowerW = ctx.legW + ctx.W[:, ctx.QI['pelvis']] + ctx.W[:, ctx.QI['spine_01']]
    for key, (hemR, e0, flare, bridgeK) in specs.items():
        hemY = ctx.yOf(hemR)
        inside = ctx.body & (P[:, 1] <= waistY) & (P[:, 1] >= hemY) & (np.abs(P[:, 0]) < ctx.shX) & (lowerW > 0.3)

        def ease(p, hemY=hemY, e0=e0, flare=flare, key=key):
            e = e0 * (0.6 + 0.4 * smooth01(waistY, waistY - 0.06, p[1]))
            if key in ('trousers', 'loose'):
                e += (0.006 if key == 'trousers' else 0.014) * smooth01(ctx.yOf(0.55), ctx.yOf(0.3), p[1])
            e += flare * smooth01(hemY + 0.12, hemY, p[1])
            return e

        def clamp(p, hemY=hemY):
            q = p.copy()
            q[1] = min(max(q[1], hemY), waistY)
            return q

        def bridge(pos, k=bridgeK):
            # per leg below the crotch, whole hips above
            def key_fn(i):
                y = pos[i, 1]
                side = 0 if y > ctx.crotchY else (1 if pos[i, 0] >= 0 else -1)
                return (int(y / 0.015), side)
            return hull_push(ctx, pos, np.ones(len(pos), bool), key_fn, k)

        def region(c):
            return 'torso' if c[1] > ctx.crotchY else 'leg'
        pos, faces, uvs, _ = body_shell(ctx, inside, clamp, ease, bridge=bridge, smooth_it=4, region_fn=region)
        vin = ctx.body & (P[:, 1] <= waistY - 0.04) & (P[:, 1] >= hemY + 0.04) & (ctx.legW + ctx.W[:, ctx.QI['pelvis']] > 0.6)
        out['shell_bot_' + key] = dict(pos=pos, faces=faces, uv=uvs, hide=hide_set(ctx, vin))
    return out


def skirt_weights(ctx, pos, y0, y1):
    QI = ctx.QI
    W = np.zeros((len(pos), len(ctx.QN)), dtype=np.float32)
    for i, p in enumerate(pos):
        f = min(1.0, max(0.0, (y0 - p[1]) / ((y0 - ctx.yOf(0.1)) or 1)))
        hip = smooth01(y0 + 0.02, ctx.crotchY, p[1])
        wl = 0.78 * smooth01(0.0, 0.6, f) * hip
        b = min(1.0, max(0.0, 0.5 + p[0] / 0.12))
        W[i, QI['pelvis']] = 1.0 - wl
        W[i, QI['thigh_l']] = wl * b
        W[i, QI['thigh_r']] = wl * (1 - b)
        if p[1] > y0 - 0.03:
            W[i, QI['spine_01']] = 0.3 * smooth01(y0 - 0.03, y0 + 0.02, p[1])
    return W


def skirts(ctx):
    P = ctx.P0
    out = {}
    waistY = ctx.yOf(1.0)
    specs = {'skirt_knee': (0.47, 0.012, 0.02, 24, 0.006), 'skirt_wrap': (0.1, 0.006, 0.016, 11, 0.005),
             'skirt_wrapknee': (0.45, 0.006, 0.014, 11, 0.005), 'skirt_long': (0.12, 0.01, 0.065, 13, 0.011)}
    lower = ctx.body & (np.abs(P[:, 0]) < ctx.shX - 0.02)
    NA = 48
    rng = np.random.RandomState(7)
    for key, (hemR, e0, flare, folds, famp) in specs.items():
        hemY = ctx.yOf(hemR)
        ys = list(np.arange(waistY, hemY, -0.022)) + [hemY]
        rings = []
        cz_mid = ctx.torso_cz(ctx.crotchY + 0.03)
        phase = rng.rand(4) * 6.28
        prev = None
        for y in ys:
            m = lower & (np.abs(P[:, 1] - y) < 0.012)
            pts2 = [(float(a), float(b)) for a, b in P[m][:, [0, 2]]]
            if len(pts2) < 6:
                pts2 = prev
            prev = pts2
            hull = [pts2[h] for h in geometry.convex_hull_2d(pts2)]
            cx = sum(p[0] for p in hull) / len(hull)
            cz = sum(p[1] for p in hull) / len(hull)
            f = (waistY - y) / ((waistY - hemY) or 1)
            ring = []
            for k in range(NA + 1):
                # k = 0 at the back centre (atlas s = 0), NA / 2 at the front (s = 0.5)
                th = math.pi + 2 * math.pi * (k % NA) / NA
                ang = th - 2 * math.pi if th > math.pi else th
                ux, uz = math.sin(th), math.cos(th)
                best = 0.0
                for a in range(len(hull)):
                    (x1, z1), (x2, z2) = hull[a], hull[(a + 1) % len(hull)]
                    ex, ez = x2 - x1, z2 - z1
                    den = ux * ez - uz * ex
                    if abs(den) < 1e-12:
                        continue
                    tt = ((x1 - cx) * ez - (z1 - cz) * ex) / den
                    uu = ((x1 - cx) * uz - (z1 - cz) * ux) / den
                    if tt > 0 and -1e-6 <= uu <= 1 + 1e-6:
                        best = max(best, tt)
                e = e0 + flare * f ** 1.6
                fold = famp * smooth01(0.05, 0.6, f) * (math.sin(th * folds + phase[0] + 0.6 * math.sin(th * 3 + phase[1])) + 0.35 * math.sin(th * (folds * 2 + 1) + phase[2]))
                if key.startswith('skirt_wrap'):
                    # the sarong's front tuck: a soft vertical fold at the front-left
                    fold += 0.006 * math.exp(-((ang - 0.754) / 0.12) ** 2) * (0.4 + 0.6 * f)
                r = best + e + fold
                ring.append((cx + ux * r, y, cz + uz * r))
            rings.append(ring)
        pos = np.array([p for ring in rings for p in ring], dtype=np.float64)
        pos = keep_outside(ctx, pos, 0.004)
        faces, uvs = [], []
        W1 = NA + 1
        for j in range(len(rings) - 1):
            for k in range(NA):
                a, b, c, d = j * W1 + k, j * W1 + k + 1, (j + 1) * W1 + k + 1, (j + 1) * W1 + k
                quad = [a, d, c, b]   # outward winding (ring goes counter-clockwise seen from above)
                faces.append(quad)
                ym = (pos[a][1] + pos[c][1]) / 2
                st = []
                for v, (kk, jj) in zip(quad, ((k, j), (k, j + 1), (k + 1, j + 1), (k + 1, j))):
                    s = kk / NA
                    if ym > ctx.crotchY:
                        st.append(ruv('torso', s, (1.5 - ctx.yref(pos[v][1])) / 0.72))
                    else:
                        st.append(ruv('skirt', s, (ctx.crotchY - pos[v][1]) / ((ctx.crotchY - hemY) or 1)))
                uvs.append(st)
        nb, boundary, bedges = neighbours(len(pos), faces)
        bedges = [e for e in bedges if pos[e[0]][1] < hemY + 0.005 and pos[e[1]][1] < hemY + 0.005]
        inward = vertex_normals(pos, faces)
        pos, faces, uvs = hem_lip(pos, faces, uvs, bedges, inward, depth=0.004, back=0.006, back_dir=lambda v: np.array([0.0, 1.0, 0.0]))
        W = skirt_weights(ctx, pos, waistY, hemY)
        out[key] = dict(pos=pos, faces=faces, uv=uvs, W=W, hide=None)
        del cz_mid
    return out


def shoes(ctx):
    P = ctx.P0
    J = ctx.Jd
    out = {}
    # foot axes for the uv projection
    ex = {}
    for side, s in ((1, 'l'), (-1, 'r')):
        m = ctx.body & (ctx.footW > 0.5) & (np.sign(P[:, 0]) == side)
        ex[side] = (float(J['foot_' + s][0]), float(J['foot_' + s][1]) * 0.5, float(P[m, 2].min()), float(P[m, 2].max()))
    ankleY = J['foot_l'][1] + 0.025
    inside = ctx.body & (P[:, 1] <= ankleY) & (ctx.footW + ctx.W[:, ctx.QI['calf_l']] + ctx.W[:, ctx.QI['calf_r']] > 0.3)

    def ease(p):
        e = 0.004
        e += 0.004 * smooth01(0.02, 0.0, p[1])     # welt / sole edge
        return e

    def clamp(p):
        q = p.copy()
        q[1] = min(q[1], ankleY)
        return q
    pos, faces2, _, _ = body_shell(ctx, inside, clamp, ease, smooth_it=2, lip=False, region_fn=lambda c: 'none')
    # sole: flatten the bottom onto the ground
    pos[:, 1] = np.where(pos[:, 1] < 0.006, -0.002, pos[:, 1])
    uvs = [face_uvs(ctx, 'foot', [pos[v] for v in f], ex) for f in faces2]
    nb, boundary, bedges = neighbours(len(pos), faces2)
    inward = vertex_normals(pos, faces2)
    pos, faces2, uvs = hem_lip(pos, faces2, uvs, bedges, inward, depth=0.003)
    vin = ctx.body & (P[:, 1] <= ankleY - 0.03) & (ctx.footW > 0.6)
    out['shell_shoe'] = dict(pos=pos, faces=faces2, uv=uvs, hide=hide_set(ctx, vin))
    # sandals: a 1 cm sole slab under each foot + a V thong strap
    spos, sfaces, suv = [], [], []
    U = ruv('foot', 0.04, 0.5)
    for side, s in ((1, 'l'), (-1, 'r')):
        m = ctx.body & (ctx.footW > 0.3) & (np.sign(P[:, 0]) == side) & (P[:, 1] < 0.03)
        pts2 = [(float(a), float(b)) for a, b in P[m][:, [0, 2]]]
        hull = [pts2[h] for h in geometry.convex_hull_2d(pts2)]
        cx = sum(p[0] for p in hull) / len(hull)
        cz = sum(p[1] for p in hull) / len(hull)
        # resample the outline at 28 angles, 6 mm outside the footprint
        outline = []
        for k in range(28):
            th = 2 * math.pi * k / 28
            ux, uz = math.sin(th), math.cos(th)
            best = 0.0
            for a in range(len(hull)):
                (x1, z1), (x2, z2) = hull[a], hull[(a + 1) % len(hull)]
                exx, ezz = x2 - x1, z2 - z1
                den = ux * ezz - uz * exx
                if abs(den) < 1e-12:
                    continue
                tt = ((x1 - cx) * ezz - (z1 - cz) * exx) / den
                uu = ((x1 - cx) * uz - (z1 - cz) * ux) / den
                if tt > 0 and -1e-6 <= uu <= 1 + 1e-6:
                    best = max(best, tt)
            outline.append((cx + ux * (best + 0.006), cz + uz * (best + 0.006)))
        b0 = len(spos)
        for (x, z) in outline:
            spos.append((x, -0.004, z))
        for (x, z) in outline:
            spos.append((x, 0.009, z))
        n = len(outline)
        for k in range(n):
            a, b = k, (k + 1) % n
            sfaces.append([b0 + a, b0 + b, b0 + n + b, b0 + n + a])
            suv.append([U] * 4)
        ctop = len(spos)
        spos.append((cx, 0.009, cz))
        cbot = len(spos)
        spos.append((cx, -0.004, cz))
        for k in range(n):
            a, b = k, (k + 1) % n
            sfaces.append([ctop, b0 + n + a, b0 + n + b])
            suv.append([U] * 3)
            sfaces.append([cbot, b0 + b, b0 + a])
            suv.append([U] * 3)
        # thong: from the toe gap over the instep to both sides (follows the skin, 3 mm out)
        fm = ctx.body & (ctx.footW > 0.5) & (np.sign(P[:, 0]) == side)
        zt = P[fm, 2].max()
        gap_c = fm & (P[:, 2] > zt - 0.05) & (P[:, 2] < zt - 0.03)
        gap = P[gap_c][np.argmin(np.abs(P[gap_c, 0] - (cx - side * 0.012)))] if gap_c.any() else np.array([cx, 0.03, zt - 0.04])
        zm = cz + 0.0
        sides = []
        for sd in (1, -1):
            cm = fm & (np.abs(P[:, 2] - zm) < 0.012) & (P[:, 1] < 0.03)
            cand = P[cm]
            if len(cand):
                sides.append(cand[np.argmax(cand[:, 0] * sd)])
        for end in sides:
            path = []
            for k in range(11):
                t = k / 10
                p = gap * (1 - t) + end * t
                p = p + np.array([0, 0.025 * math.sin(math.pi * t), 0])
                loc, nrm, ti, dist = ctx.bvh.find_nearest(Vector(p))
                q = np.array(loc + nrm * 0.004)
                path.append(q)
            r = 0.0045
            base = len(spos)
            for k, q in enumerate(path):
                tng = path[min(k + 1, 10)] - path[max(k - 1, 0)]
                tng /= np.linalg.norm(tng) + 1e-9
                up = np.array([0, 1.0, 0])
                sdv = np.cross(tng, up)
                sdv /= np.linalg.norm(sdv) + 1e-9
                upv = np.cross(sdv, tng)
                for j in range(6):
                    a = 2 * math.pi * j / 6
                    spos.append(tuple(q + (sdv * math.cos(a) + upv * math.sin(a) * 0.45) * r))
            for k in range(10):
                for j in range(6):
                    a0, a1 = base + k * 6 + j, base + k * 6 + (j + 1) % 6
                    b0_, b1 = a0 + 6, a1 + 6
                    sfaces.append([a0, a1, b1, b0_])
                    suv.append([U] * 4)
    spos = np.array(spos, dtype=np.float64)
    out['shell_sandal'] = dict(pos=spos, faces=sfaces, uv=suv, hide=None)
    return out


def build_all(ctx):
    out = {}
    for fn in (tops, sleeves, bottoms, skirts, shoes):
        try:
            r = fn(ctx)
            out.update(r)
        except Exception as e:  # keep the build going; the runtime skips missing shells
            import traceback
            traceback.print_exc()
            ctx.log('shell group', fn.__name__, 'FAILED', e)
    for k, v in out.items():
        v['pos'] = np.asarray(v['pos'], dtype=np.float64)
    return out


def veil(ctx, lm):
    """Wet hair hanging over the face (ghost 'hairOverFace'): clumped strand ribbons from the
    hairline down past the chin, 1-2 cm in front of the face. uv.x = (strand + across) / K, uv.y = root -> tip.
    The shader draws the strands procedurally (part 8) and can open a gap over one eye."""
    P = ctx.P0
    brow, nose, chin = P[lm['brow']], P[lm['noseTip']], P[lm['chin']]
    rng = np.random.RandomState(11)
    K = 26
    xs = np.sort(rng.uniform(-0.082, 0.082, K))
    pos, faces, uvs = [], [], []
    seg = 14
    for k, x0 in enumerate(xs):
        # root on the scalp above the hairline
        ry = brow[1] + 0.05 + 0.018 * (abs(x0) / 0.08) ** 2 * -1 + rng.uniform(-0.006, 0.006)
        loc, nrm, ti, dist = ctx.bvh.find_nearest(Vector((x0, ry, brow[2] + 0.05)))
        root = np.array(loc + nrm * 0.006)
        front = nose[2] + 0.014 + rng.uniform(0.0, 0.012) - 0.035 * (abs(x0) / 0.085) ** 2
        tipy = chin[1] - rng.uniform(0.06, 0.2)
        w0 = rng.uniform(0.009, 0.02)
        sway = rng.uniform(-0.012, 0.012)
        base = len(pos)
        for j in range(seg + 1):
            t = j / seg
            y = root[1] + (tipy - root[1]) * t
            # out from the forehead over the brow ridge, then hanging straight, clumping toward the tip
            z = root[2] + (front - root[2]) * min(1.0, t * 3.2)
            x = x0 * (1 - 0.15 * t) + sway * t * t
            w = w0 * (1 - 0.65 * t) + 0.002
            for a in (-0.5, 0.5):
                pos.append((x + a * w, y, z + 0.002 * math.sin(k * 1.7 + j)))
        for j in range(seg):
            a0 = base + j * 2
            faces.append([a0, a0 + 2, a0 + 3, a0 + 1])
            uvs.append([((k + 0.04) / K, j / seg), ((k + 0.04) / K, (j + 1) / seg), ((k + 0.96) / K, (j + 1) / seg), ((k + 0.96) / K, j / seg)])
    pos = np.array(pos, dtype=np.float64)
    W = np.zeros((len(pos), len(ctx.QN)), dtype=np.float32)
    W[:, ctx.QI['Head']] = 1.0
    return {'hair_veil': dict(pos=pos, faces=faces, uv=uvs, W=W, hide=None, part=8, uvspace='mh', bind='head', kind='veil')}



def bun(ctx, lm):
    """Our own hair bun (มวยผม): strands combed back over the scalp from the hairline into a twisted knot at
    the back of the head. Ribbon cards drawn with procedural strands (part 9). uv.x = (strand + across) / K, uv.y along."""
    P = ctx.P0
    brow, top, eL, eR = P[lm['brow']], P[lm['top']], P[lm['earL']], P[lm['earR']]
    c0 = np.array([0.0, (eL[1] + top[1]) * 0.5 - 0.01, (eL[2] + eR[2]) * 0.5 - 0.004])

    def surf(d, lift):
        """head surface along direction d from the head centre, lifted along the normal"""
        d = d / (np.linalg.norm(d) + 1e-9)
        o = Vector(c0 + d * 0.3)
        loc, nrm, ti, dist = ctx.bvh.ray_cast(o, Vector(-d))
        if loc is None:
            return c0 + d * 0.1, d
        return np.array(loc) + np.array(nrm) * lift, np.array(nrm)
    # knot anchor: back of the head, a little above the ears
    back, nb_ = surf(np.array([0.0, 0.18, -1.0]), 0.0)
    knot = back + nb_ * 0.024
    pos, faces, uvs = [], [], []
    K = 64
    k_id = [0]

    def ribbon(pts, widths, normals):
        k = k_id[0]
        k_id[0] += 1
        base = len(pos)
        n = len(pts)
        for j in range(n):
            if j == 0:
                tg = pts[1] - pts[0]
            elif j == n - 1:
                tg = pts[-1] - pts[-2]
            else:
                tg = pts[j + 1] - pts[j - 1]
            tg = tg / (np.linalg.norm(tg) + 1e-9)
            sd = np.cross(tg, normals[j])
            sd = sd / (np.linalg.norm(sd) + 1e-9)
            for a in (-0.5, 0.5):
                pos.append(tuple(pts[j] + sd * a * widths[j]))
        for j in range(n - 1):
            a0 = base + j * 2
            faces.append([a0, a0 + 2, a0 + 3, a0 + 1])
            u0, u1 = (k % K + 0.04) / K, (k % K + 0.96) / K
            uvs.append([(u0, j / (n - 1)), (u0, (j + 1) / (n - 1)), (u1, (j + 1) / (n - 1)), (u1, j / (n - 1))])
    # combed strands: hairline -> knot, 2.5-4 mm over the scalp
    NS = 46
    for i in range(NS):
        th = -2.55 + 5.1 * i / (NS - 1)            # yaw around the head (0 = front)
        front = math.cos(th)
        el = 0.42 * max(front, 0) + 0.12 + (-0.35 * max(-front, 0))   # elevation of the hairline
        d0 = np.array([math.sin(th) * math.cos(el), math.sin(el), math.cos(th) * math.cos(el)])
        h0, _ = surf(d0, 0.0025)
        pts, nrms, wid = [], [], []
        for j in range(12):
            t = j / 11
            q = h0 * (1 - t) + knot * t
            dd = q - c0
            p, nn = surf(dd, 0.0025 + 0.004 * t)
            if t > 0.85:
                p = p * (1 - (t - 0.85) / 0.15) + knot * ((t - 0.85) / 0.15)
            pts.append(p)
            nrms.append(nn)
            wid.append(0.026 * (1 - 0.6 * t) + 0.004)
        ribbon(pts, wid, nrms)
    # the knot: strands twisted around a torus facing backwards
    ax = nb_ / (np.linalg.norm(nb_) + 1e-9)
    u = np.cross(ax, np.array([0.0, 1.0, 0.0]))
    u /= np.linalg.norm(u) + 1e-9
    v = np.cross(u, ax)
    Rm, rm = 0.024, 0.013
    for s in range(14):
        pts, nrms, wid = [], [], []
        ph0 = 2 * math.pi * s / 14
        for j in range(25):
            t = j / 24
            ph = ph0 + t * 2 * math.pi * 1.1
            tw = ph0 * 3 + t * 6 * math.pi
            ring = u * math.cos(ph) + v * math.sin(ph)
            tube = ring * math.cos(tw) + ax * math.sin(tw)
            p = knot + ring * Rm + tube * rm * 0.6 + ax * 0.006
            pts.append(p)
            nrms.append(tube)
            wid.append(0.016)
        ribbon(pts, wid, nrms)
    pos = np.array(pos, dtype=np.float64)
    W = np.zeros((len(pos), len(ctx.QN)), dtype=np.float32)
    W[:, ctx.QI['Head']] = 1.0
    return {'hair_bun': dict(pos=pos, faces=faces, uv=uvs, W=W, hide=None, part=9, uvspace='mh', bind='head', kind='hair')}
