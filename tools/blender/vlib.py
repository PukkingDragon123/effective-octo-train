# Shared helpers for the procedural vehicle builds (Blender 4.2 LTS, run headless).
#
#   blender -b --factory-startup -P tools/blender/build_taxi.py -- [options]
#
# Conventions: Blender world frame X = right (driver side, RHD), Y = forward, Z = up,
# metres. The glTF exporter (+Y up) maps Blender (x, y, z) -> three.js (x, z, -y), so
# Blender +Y forward becomes three.js -Z forward and +X stays the driver side.
import bpy
import bmesh
import math
import os
import sys
import json
import struct
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

V = Vector
TAU = math.pi * 2.0


# ---------------------------------------------------------------------------------------
# scene
# ---------------------------------------------------------------------------------------
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.render.engine = 'CYCLES'
    return sc


def collection(name, parent=None):
    if name in bpy.data.collections:
        return bpy.data.collections[name]
    c = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(c)
    return c


_ACTIVE_COLL = [None]


def set_collection(c):
    _ACTIVE_COLL[0] = c


def link(obj):
    c = _ACTIVE_COLL[0] or bpy.context.scene.collection
    if obj.name not in c.objects:
        c.objects.link(obj)
    return obj


def args_after_dashes():
    a = sys.argv
    return a[a.index('--') + 1:] if '--' in a else []


def log(*a):
    print('[vlib]', *a, flush=True)


# ---------------------------------------------------------------------------------------
# small math
# ---------------------------------------------------------------------------------------
def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(a, b, x):
    t = clamp((x - a) / (b - a)) if b != a else (1.0 if x >= b else 0.0)
    return t * t * (3 - 2 * t)


def ease(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


class Spline1D:
    """Monotone cubic (Fritsch-Carlson) through (x, y) knots; clamped outside."""

    def __init__(self, pts):
        pts = sorted(pts)
        self.x = np.array([p[0] for p in pts], float)
        self.y = np.array([p[1] for p in pts], float)
        n = len(pts)
        d = np.diff(self.y) / np.maximum(np.diff(self.x), 1e-12)
        m = np.zeros(n)
        if n > 1:
            m[0], m[-1] = d[0], d[-1]
            for i in range(1, n - 1):
                if d[i - 1] * d[i] <= 0:
                    m[i] = 0.0
                else:
                    w1 = 2 * (self.x[i + 1] - self.x[i]) + (self.x[i] - self.x[i - 1])
                    w2 = (self.x[i + 1] - self.x[i]) + 2 * (self.x[i] - self.x[i - 1])
                    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
        self.m = m

    def __call__(self, x):
        xs, ys, m = self.x, self.y, self.m
        if len(xs) == 1:
            return float(ys[0])
        if x <= xs[0]:
            return float(ys[0])
        if x >= xs[-1]:
            return float(ys[-1])
        i = int(np.searchsorted(xs, x) - 1)
        h = xs[i + 1] - xs[i]
        t = (x - xs[i]) / h
        h00 = 2 * t**3 - 3 * t**2 + 1
        h10 = t**3 - 2 * t**2 + t
        h01 = -2 * t**3 + 3 * t**2
        h11 = t**3 - t**2
        return float(h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1])


def hermite_curve(ctrl, tension=None, samples=12, closed=False):
    """Cardinal/Hermite spline through control points (N, D) with per-point tension
    (0 = Catmull-Rom, 1 = sharp corner). Returns list of segment arrays [(samples+1, D)]."""
    P = np.asarray(ctrl, float)
    n = len(P)
    tens = np.zeros(n) if tension is None else np.asarray(tension, float)
    T = np.zeros_like(P)
    for i in range(n):
        if closed:
            a, b = P[(i - 1) % n], P[(i + 1) % n]
        else:
            a = P[max(i - 1, 0)]
            b = P[min(i + 1, n - 1)]
        T[i] = (1 - tens[i]) * (b - a) * (0.5 if (closed or 0 < i < n - 1) else 1.0)
    segs = []
    m = n if closed else n - 1
    for i in range(m):
        j = (i + 1) % n
        s = samples[i] if hasattr(samples, '__len__') else samples
        t = np.linspace(0, 1, s + 1)[:, None]
        h00 = 2 * t**3 - 3 * t**2 + 1
        h10 = t**3 - 2 * t**2 + t
        h01 = -2 * t**3 + 3 * t**2
        h11 = t**3 - t**2
        segs.append(h00 * P[i] + h10 * T[i] + h01 * P[j] + h11 * T[j])
    return segs


def polyline_length(p):
    p = np.asarray(p, float)
    return float(np.sum(np.linalg.norm(np.diff(p, axis=0), axis=1)))


def resample(p, n, weights=None):
    """Resample a polyline to n points uniformly by arc length."""
    p = np.asarray(p, float)
    seg = np.linalg.norm(np.diff(p, axis=0), axis=1)
    if weights is not None:
        seg = seg * weights
    s = np.concatenate([[0], np.cumsum(seg)])
    if s[-1] <= 1e-12:
        return np.repeat(p[:1], n, axis=0)
    tgt = np.linspace(0, s[-1], n)
    out = np.empty((n, p.shape[1]))
    for k in range(p.shape[1]):
        out[:, k] = np.interp(tgt, s, p[:, k])
    return out


def eval_polyline(p, t):
    """Point at normalized arc length t in [0, 1]."""
    p = np.asarray(p, float)
    seg = np.linalg.norm(np.diff(p, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    tgt = clamp(t) * s[-1]
    return np.array([np.interp(tgt, s, p[:, k]) for k in range(p.shape[1])])


def curve_dense(ctrl, tension=None, n=400, closed=False):
    segs = hermite_curve(ctrl, tension, samples=24, closed=closed)
    pts = np.concatenate([s[:-1] for s in segs] + [segs[-1][-1:]])
    return resample(pts, n)


def superellipse_quadrant(a, b, n, cx=0.0, cy=0.0, sx=1.0, sy=1.0, samples=200):
    """Quarter superellipse from (cx, cy + sy*b) [phi=0] to (cx + sx*a, cy) [phi=90deg]."""
    out = []
    for i in range(samples + 1):
        ph = (i / samples) * math.pi / 2
        s, c = math.sin(ph), math.cos(ph)
        x = a * (abs(s) ** (2.0 / n))
        y = b * (abs(c) ** (2.0 / n))
        out.append((cx + sx * x, cy + sy * y))
    return np.array(out)


def rounded_rect_2d(x0, y0, x1, y1, r, seg=8):
    """Closed CCW loop of a rounded rectangle (list of (x, y))."""
    r = min(r, (x1 - x0) / 2, (y1 - y0) / 2)
    pts = []
    for cx, cy, a0 in ((x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)):
        for k in range(seg + 1):
            a = math.radians(a0 + 90 * k / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def rounded_poly_2d(pts, radii, seg=8):
    """Closed polygon with per-corner fillet radii -> dense loop."""
    P = [np.array(p, float) for p in pts]
    n = len(P)
    out = []
    for i in range(n):
        a, b, c = P[i - 1], P[i], P[(i + 1) % n]
        r = radii[i] if hasattr(radii, '__len__') else radii
        u = a - b
        w = c - b
        lu, lw = np.linalg.norm(u), np.linalg.norm(w)
        u /= lu
        w /= lw
        ang = math.acos(clamp(float(np.dot(u, w)), -1, 1))
        if r <= 1e-6 or ang < 1e-3 or ang > math.pi - 1e-3:
            out.append(b)
            continue
        d = r / math.tan(ang / 2)
        d = min(d, lu * 0.49, lw * 0.49)
        r = d * math.tan(ang / 2)
        p0 = b + u * d
        p1 = b + w * d
        bis = (u + w)
        bis /= np.linalg.norm(bis)
        ctr = b + bis * (r / math.sin(ang / 2))
        a0 = math.atan2(*(p0 - ctr)[::-1])
        a1 = math.atan2(*(p1 - ctr)[::-1])
        da = (a1 - a0 + math.pi) % TAU - math.pi
        for k in range(seg + 1):
            t = a0 + da * k / seg
            out.append(ctr + r * np.array([math.cos(t), math.sin(t)]))
    return [tuple(p) for p in out]


# ---------------------------------------------------------------------------------------
# mesh construction
# ---------------------------------------------------------------------------------------
def new_mesh_obj(name, verts, faces, mats=None, mat_idx=None, smooth=True, uvs=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.update()
    ob = bpy.data.objects.new(name, me)
    link(ob)
    if mats:
        for m in mats:
            me.materials.append(m)
        if mat_idx is not None:
            me.polygons.foreach_set('material_index', np.asarray(mat_idx, np.int32))
    if smooth:
        me.shade_smooth()
    if uvs is not None:
        uvl = me.uv_layers.new(name='UVMap')
        # uvs: per loop (len = total loops) array (L, 2)
        uvl.data.foreach_set('uv', np.asarray(uvs, np.float32).ravel())
    return ob


def grid_faces(nu, nv, closed_u=False, closed_v=False, flip=False):
    """Quad faces for a grid of nu x nv vertices indexed i*nv + j."""
    faces = []
    mu = nu if closed_u else nu - 1
    mv = nv if closed_v else nv - 1
    for i in range(mu):
        i2 = (i + 1) % nu
        for j in range(mv):
            j2 = (j + 1) % nv
            a, b, c, d = i * nv + j, i2 * nv + j, i2 * nv + j2, i * nv + j2
            faces.append((a, d, c, b) if flip else (a, b, c, d))
    return faces


def grid_obj(name, P, closed_u=False, closed_v=False, flip=False, mat=None, smooth=True, uv=True):
    P = np.asarray(P, float)
    nu, nv = P.shape[0], P.shape[1]
    verts = P.reshape(-1, 3)
    faces = grid_faces(nu, nv, closed_u, closed_v, flip)
    ob = new_mesh_obj(name, verts, faces, mats=[mat] if mat else None, smooth=smooth)
    if uv:
        uvs = []
        for f in faces:
            for vi in f:
                i, j = divmod(vi, nv)
                uvs.append((i / max(nu - 1, 1), j / max(nv - 1, 1)))
        uvl = ob.data.uv_layers.new(name='UVMap')
        uvl.data.foreach_set('uv', np.asarray(uvs, np.float32).ravel())
    return ob


def coons_patch(c0, c1, d0, d1):
    """Bilinear Coons patch. c0, c1: (n, 3) curves along u at v=0 and v=1.
    d0, d1: (m, 3) curves along v at u=0 and u=1. Corners must match.
    Returns (n, m, 3)."""
    c0, c1, d0, d1 = map(lambda a: np.asarray(a, float), (c0, c1, d0, d1))
    n, m = len(c0), len(d0)
    # chord-length params for nicer spacing
    def params(c):
        s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(c, axis=0), axis=1))])
        return s / max(s[-1], 1e-12)
    su = 0.5 * (params(c0) + params(c1))
    sv = 0.5 * (params(d0) + params(d1))
    out = np.zeros((n, m, 3))
    P00, P10, P01, P11 = c0[0], c0[-1], c1[0], c1[-1]
    for i in range(n):
        u = su[i]
        for j in range(m):
            v = sv[j]
            Lc = (1 - v) * c0[i] + v * c1[i]
            Ld = (1 - u) * d0[j] + u * d1[j]
            B = (1 - u) * (1 - v) * P00 + u * (1 - v) * P10 + (1 - u) * v * P01 + u * v * P11
            out[i, j] = Lc + Ld - B
    return out


def join(objs, name=None):
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    if len(objs) == 1:
        if name:
            objs[0].name = name
            objs[0].data.name = name
        return objs[0]
    ctx = bpy.context
    for o in ctx.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    ctx.view_layer.objects.active = objs[0]
    with ctx.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs):
        bpy.ops.object.join()
    ob = objs[0]
    if name:
        ob.name = name
        ob.data.name = name
    return ob


def merge_doubles(ob, dist=1e-5):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


def recalc_normals(ob, inside=False):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if inside:
        for f in bm.faces:
            f.normal_flip()
    bm.to_mesh(ob.data)
    bm.free()


def mirror_x(ob, merge=True, dist=1e-5):
    """Mirror a half mesh (x >= 0) across X=0 and weld the seam (keeps face data)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    ret = bmesh.ops.duplicate(bm, geom=geom)
    nv = [e for e in ret['geom'] if isinstance(e, bmesh.types.BMVert)]
    nf = [e for e in ret['geom'] if isinstance(e, bmesh.types.BMFace)]
    for v in nv:
        v.co.x = -v.co.x
    bmesh.ops.reverse_faces(bm, faces=nf, flip_multires=False)
    if merge:
        seam = [v for v in bm.verts if abs(v.co.x) < dist * 10]
        bmesh.ops.remove_doubles(bm, verts=seam, dist=dist * 10)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return ob


def apply_transform(ob, loc=True, rot=True, scale=True):
    with bpy.context.temp_override(selected_editable_objects=[ob], active_object=ob, object=ob):
        bpy.ops.object.transform_apply(location=loc, rotation=rot, scale=scale)


def set_origin(ob, point):
    """Move object origin to world point without moving the geometry."""
    p = Vector(point)
    mw = ob.matrix_world.copy()
    local = mw.inverted() @ p
    ob.data.transform(Matrix.Translation(-local))
    ob.matrix_world = mw @ Matrix.Translation(local)


def apply_modifiers(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    for m in list(ob.modifiers):
        ob.modifiers.remove(m)
    ob.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return ob


def duplicate(ob, name=None, link_coll=True):
    o2 = ob.copy()
    o2.data = ob.data.copy()
    if name:
        o2.name = name
        o2.data.name = name
    if link_coll:
        link(o2)
    return o2


def delete(objs):
    if not isinstance(objs, (list, tuple)):
        objs = [objs]
    for o in objs:
        if o is None:
            continue
        me = o.data if o.type == 'MESH' else None
        bpy.data.objects.remove(o, do_unlink=True)
        if me is not None and me.users == 0:
            bpy.data.meshes.remove(me)


def tri_count(ob):
    if ob.type != 'MESH':
        return 0
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    ev.to_mesh_clear()
    return n


# ---------------------------------------------------------------------------------------
# lathe / sweep / tubes
# ---------------------------------------------------------------------------------------
def lathe(name, profile, segments=48, mat=None, axis='Z', closed_profile=False, smooth=True,
          center=(0, 0, 0), angle=TAU, cap_ends=False, mat_idx=None, mats=None):
    """Revolve a 2D profile [(r, h), ...] around an axis. axis 'Z': (r,h)->(r cos, r sin, h);
    'Y': around Y (h along Y); 'X': around X. Returns object."""
    prof = np.asarray(profile, float)
    m = len(prof)
    full = abs(angle - TAU) < 1e-6
    nseg = segments if full else segments + 1
    verts = []
    for i in range(nseg):
        a = angle * i / segments
        ca, sa = math.cos(a), math.sin(a)
        for r, h in prof:
            if axis == 'Z':
                verts.append((center[0] + r * ca, center[1] + r * sa, center[2] + h))
            elif axis == 'Y':
                verts.append((center[0] + r * ca, center[1] + h, center[2] + r * sa))
            else:
                verts.append((center[0] + h, center[1] + r * ca, center[2] + r * sa))
    faces = grid_faces(nseg, m, closed_u=full, closed_v=closed_profile, flip=(axis == 'Y'))
    fm = None
    if mat_idx is not None:
        # per profile segment material index
        fm = []
        mu = nseg if full else nseg - 1
        mv = m if closed_profile else m - 1
        for i in range(mu):
            for j in range(mv):
                fm.append(mat_idx[j])
    ob = new_mesh_obj(name, verts, faces, mats=(mats or ([mat] if mat else None)), mat_idx=fm, smooth=smooth)
    if cap_ends:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.holes_fill(bm, edges=bm.edges, sides=0)
        bm.to_mesh(ob.data)
        bm.free()
    return ob


def frames_along(path, up=(0, 0, 1)):
    """Rotation-minimizing frames (T, N, B) along a polyline."""
    P = np.asarray(path, float)
    n = len(P)
    T = np.zeros_like(P)
    for i in range(n):
        a = P[max(i - 1, 0)]
        b = P[min(i + 1, n - 1)]
        d = b - a
        T[i] = d / max(np.linalg.norm(d), 1e-12)
    N = np.zeros_like(P)
    upv = np.asarray(up, float)
    n0 = np.cross(upv, T[0])
    if np.linalg.norm(n0) < 1e-6:
        n0 = np.cross((1, 0, 0), T[0])
    n0 /= np.linalg.norm(n0)
    N[0] = n0
    for i in range(1, n):
        # double reflection method
        v1 = P[i] - P[i - 1]
        c1 = np.dot(v1, v1)
        if c1 < 1e-16:
            N[i] = N[i - 1]
            continue
        rL = N[i - 1] - (2 / c1) * np.dot(v1, N[i - 1]) * v1
        tL = T[i - 1] - (2 / c1) * np.dot(v1, T[i - 1]) * v1
        v2 = T[i] - tL
        c2 = np.dot(v2, v2)
        N[i] = rL - (2 / c2) * np.dot(v2, rL) * v2 if c2 > 1e-16 else rL
        N[i] /= max(np.linalg.norm(N[i]), 1e-12)
    B = np.cross(T, N)
    return T, N, B


def sweep(name, path, profile, mat=None, closed_path=False, closed_profile=True, normals=None,
          scale=None, smooth=True, cap=False, twist=None, mats=None, mat_idx=None):
    """Sweep a 2D profile [(a, b)] along a 3D path. Profile axis a -> frame N (or
    provided per-point 'normals' = the profile's +a direction), b -> binormal."""
    P = np.asarray(path, float)
    T, N, B = frames_along(P)
    if normals is not None:
        Nn = np.asarray(normals, float)
        for i in range(len(P)):
            v = Nn[i] - T[i] * np.dot(Nn[i], T[i])
            if np.linalg.norm(v) > 1e-9:
                N[i] = v / np.linalg.norm(v)
            B[i] = np.cross(T[i], N[i])
    prof = np.asarray(profile, float)
    verts = []
    for i in range(len(P)):
        s = 1.0 if scale is None else (scale[i] if hasattr(scale, '__len__') else scale)
        for a, b in prof:
            verts.append(P[i] + N[i] * a * s + B[i] * b * s)
    faces = grid_faces(len(P), len(prof), closed_u=closed_path, closed_v=closed_profile)
    fm = None
    if mat_idx is not None:
        mu = len(P) if closed_path else len(P) - 1
        mv = len(prof) if closed_profile else len(prof) - 1
        fm = [mat_idx[j] for i in range(mu) for j in range(mv)]
    ob = new_mesh_obj(name, verts, faces, mats=(mats or ([mat] if mat else None)), mat_idx=fm, smooth=smooth)
    if cap and not closed_path:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.holes_fill(bm, edges=bm.edges, sides=0)
        bm.to_mesh(ob.data)
        bm.free()
    return ob


def circle_profile(r, n=12, rx=None, ry=None):
    rx = r if rx is None else rx
    ry = r if ry is None else ry
    return [(rx * math.cos(TAU * i / n), ry * math.sin(TAU * i / n)) for i in range(n)]


def rrect_profile(w, h, r, seg=3):
    pts = rounded_rect_2d(-w / 2, -h / 2, w / 2, h / 2, r, seg)
    # dedupe
    out = []
    for p in pts:
        if not out or (abs(p[0] - out[-1][0]) > 1e-7 or abs(p[1] - out[-1][1]) > 1e-7):
            out.append(p)
    if abs(out[0][0] - out[-1][0]) < 1e-7 and abs(out[0][1] - out[-1][1]) < 1e-7:
        out.pop()
    return out


def tube(name, path, r, n=10, mat=None, cap=True, closed=False):
    return sweep(name, path, circle_profile(r, n), mat=mat, closed_path=closed, cap=cap)


def box(name, size, center=(0, 0, 0), mat=None, bevel_w=0.0, segs=2):
    sx, sy, sz = size
    cx, cy, cz = center
    v = [(cx + x * sx / 2, cy + y * sy / 2, cz + z * sz / 2) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    ob = new_mesh_obj(name, v, f, mats=[mat] if mat else None, smooth=False)
    if bevel_w > 0:
        add_bevel(ob, bevel_w, segs, angle=30)
        apply_modifiers(ob)
        set_sharp_by_angle(ob, 35)
    return ob


def extrude_outline(name, loop2d, z0, z1, plane='XZ', mat=None, offset=0.0, cap=True, bevel_w=0.0, segs=2):
    """Prism from a closed 2D loop. plane 'XZ': loop=(x,z), extrude along Y from z0..z1.
    'YZ': loop=(y,z) extrude along X. 'XY': loop=(x,y) extrude along Z."""
    L = list(loop2d)
    n = len(L)
    verts = []
    for d in (z0, z1):
        for a, b in L:
            if plane == 'XZ':
                verts.append((a, d, b))
            elif plane == 'YZ':
                verts.append((d, a, b))
            else:
                verts.append((a, b, d))
    faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    if cap:
        faces.append(tuple(range(n - 1, -1, -1)))
        faces.append(tuple(range(n, 2 * n)))
    ob = new_mesh_obj(name, verts, faces, mats=[mat] if mat else None, smooth=False)
    recalc_normals(ob)
    if bevel_w > 0:
        add_bevel(ob, bevel_w, segs, angle=30)
        apply_modifiers(ob)
        set_sharp_by_angle(ob, 35)
    return ob


def cookie_cutter(name, loop_pts, loop_normals, depth_in=0.03, depth_out=0.03):
    """Closed prism around a 3D loop on a surface, extruded along the per-point normals."""
    P = np.asarray(loop_pts, float)
    Nn = np.asarray(loop_normals, float)
    n = len(P)
    inner = P - Nn * depth_in
    outer = P + Nn * depth_out
    verts = list(inner) + list(outer)
    ci = P.mean(axis=0) - Nn.mean(axis=0) * depth_in
    co = P.mean(axis=0) + Nn.mean(axis=0) * depth_out
    verts += [ci, co]
    faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    for i in range(n):
        faces.append(((i + 1) % n, i, 2 * n))
        faces.append((n + i, n + (i + 1) % n, 2 * n + 1))
    ob = new_mesh_obj(name, verts, faces, smooth=False)
    recalc_normals(ob)
    return ob


# ---------------------------------------------------------------------------------------
# modifiers / normals
# ---------------------------------------------------------------------------------------
def add_bevel(ob, width, segments=2, angle=30, limit='ANGLE', harden=False, profile=0.5, clamp_overlap=True, vgroup=None):
    m = ob.modifiers.new('Bevel', 'BEVEL')
    m.width = width
    m.segments = segments
    m.limit_method = limit
    if limit == 'ANGLE':
        m.angle_limit = math.radians(angle)
    if vgroup:
        m.limit_method = 'VGROUP'
        m.vertex_group = vgroup
    m.profile = profile
    m.use_clamp_overlap = clamp_overlap
    m.harden_normals = harden
    m.miter_outer = 'MITER_ARC'
    return m


def add_weighted_normals(ob, keep_sharp=True, weight=50, face_influence=False):
    m = ob.modifiers.new('WN', 'WEIGHTED_NORMAL')
    m.keep_sharp = keep_sharp
    m.weight = weight
    m.use_face_influence = face_influence
    return m


def add_subsurf(ob, levels=1):
    m = ob.modifiers.new('Sub', 'SUBSURF')
    m.levels = levels
    m.render_levels = levels
    return m


def add_solidify(ob, thickness, offset=-1.0, rim=True):
    m = ob.modifiers.new('Solid', 'SOLIDIFY')
    m.thickness = thickness
    m.offset = offset
    m.use_rim = rim
    m.use_even_offset = True
    return m


def set_sharp_by_angle(ob, deg=30):
    me = ob.data
    try:
        me.set_sharp_from_angle(angle=math.radians(deg))
    except Exception:
        pass


def finish_hard(ob, bevel=0.0015, segs=2, angle=30, wn=True):
    """Standard hard-surface finish: angle bevel + weighted normals, applied."""
    if bevel > 0:
        add_bevel(ob, bevel, segs, angle=angle)
    set_sharp_by_angle(ob, angle + 5)
    if wn:
        add_weighted_normals(ob)
    apply_modifiers(ob)
    return ob


def boolean(ob, cutter, op='DIFFERENCE', solver='EXACT', apply=True, hole_tolerant=True):
    m = ob.modifiers.new('Bool', 'BOOLEAN')
    m.operation = op
    m.solver = solver
    if isinstance(cutter, bpy.types.Object):
        m.object = cutter
    else:
        m.operand_type = 'COLLECTION'
        m.collection = cutter
    if solver == 'EXACT':
        m.use_hole_tolerant = hole_tolerant
        m.use_self = False
    if apply:
        apply_modifiers(ob)
    return ob


def transfer_normals(ob, source, vgroup=None):
    """Copy custom split normals from a smooth source surface (nearest face interpolated)."""
    m = ob.modifiers.new('DT', 'DATA_TRANSFER')
    m.object = source
    m.use_loop_data = True
    m.data_types_loops = {'CUSTOM_NORMAL'}
    m.loop_mapping = 'POLYINTERP_NEAREST'
    m.mix_mode = 'REPLACE'
    m.mix_factor = 1.0
    if vgroup:
        m.vertex_group = vgroup
    apply_modifiers(ob)


def set_custom_normals_from_func(ob, fn):
    """fn(co Vector, face_normal Vector) -> normal Vector, evaluated per loop."""
    me = ob.data
    nl = []
    for p in me.polygons:
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            nl.append(tuple(fn(co, p.normal)))
    me.normals_split_custom_set(nl)


def separate_loose(ob):
    """Split ob into its connected islands; returns list of new objects (ob included)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.faces.ensure_lookup_table()
    seen = set()
    islands = []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack = [f]
        isl = []
        seen.add(f.index)
        while stack:
            g = stack.pop()
            isl.append(g.index)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        islands.append(isl)
    bm.free()
    if len(islands) <= 1:
        return [ob]
    out = []
    for k, isl in enumerate(islands):
        o2 = duplicate(ob, name=f'{ob.name}_{k}')
        keep = set(isl)
        bm = bmesh.new()
        bm.from_mesh(o2.data)
        bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
        bm.to_mesh(o2.data)
        bm.free()
        out.append(o2)
    delete(ob)
    return out


def split_by_attr(ob, attr, mapping):
    """Split by an int face attribute. mapping {value: new_name}. Returns dict name->obj."""
    vals = np.zeros(len(ob.data.polygons), np.int32)
    ob.data.attributes[attr].data.foreach_get('value', vals)
    out = {}
    for val, nm in mapping.items():
        idx = set(np.nonzero(vals == val)[0].tolist())
        if not idx:
            continue
        o2 = duplicate(ob, name=nm)
        bm = bmesh.new()
        bm.from_mesh(o2.data)
        bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in idx], context='FACES')
        bm.to_mesh(o2.data)
        bm.free()
        out[nm] = o2
    return out


def face_attr(ob, name, values):
    me = ob.data
    if name not in me.attributes:
        me.attributes.new(name, 'INT', 'FACE')
    me.attributes[name].data.foreach_set('value', np.asarray(values, np.int32))


def delete_faces(ob, pred):
    """Delete faces where pred(face_center Vector, face_normal) is True."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    dead = [f for f in bm.faces if pred(f.calc_center_median(), f.normal)]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    bm.to_mesh(ob.data)
    bm.free()


# ---------------------------------------------------------------------------------------
# panel finishing: rolled edge + return flange on every open boundary
# ---------------------------------------------------------------------------------------
def boundary_loops(bm):
    edges = [e for e in bm.edges if e.is_boundary]
    left = set(edges)
    loops = []
    while left:
        e = left.pop()
        loop = [e.verts[0], e.verts[1]]
        closed = False
        while True:
            v = loop[-1]
            nxt = None
            for e2 in v.link_edges:
                if e2 in left:
                    nxt = e2
                    break
            if nxt is None:
                break
            left.discard(nxt)
            w = nxt.other_vert(v)
            if w == loop[0]:
                closed = True
                break
            loop.append(w)
        loops.append((loop, closed))
    return loops


def roll_edges(ob, radius=0.0015, depth=0.006, segs=3, mat_index=None, normal_src=None, select=None,
               depth_fn=None, radius_fn=None, vsel=None, lip=False):
    """Turn every open boundary of a sheet into a rounded rolled edge + flange
    going 'behind' the surface (along -normal). normal_src: BVHTree of a smooth
    master surface for stable normals. select(co)->bool limits which loops."""
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    loops = boundary_loops(bm)
    newfaces = []
    for loop, closed in loops:
        n = len(loop)
        if n < 2:
            continue
        if select is not None and not select(sum((v.co for v in loop), Vector()) / n):
            continue
        # per-vertex normal & outward direction
        nrm, out = [], []
        for i, v in enumerate(loop):
            nv = v.normal.copy()
            if normal_src is not None:
                loc, fn, idx, dist = normal_src.find_nearest(v.co)
                if fn is not None:
                    nv = fn.copy()
                    if nv.dot(v.normal) < 0:
                        nv = -nv
            if closed:
                a, b = loop[i - 1].co, loop[(i + 1) % n].co
            else:
                a, b = loop[max(i - 1, 0)].co, loop[min(i + 1, n - 1)].co
            t = (b - a)
            t.normalize()
            o = t.cross(nv)
            o.normalize()
            # point away from the panel (adjacent faces' centroid)
            fc = Vector()
            cnt = 0
            for f in v.link_faces:
                fc += f.calc_center_median()
                cnt += 1
            if cnt and o.dot(v.co - fc / cnt) < 0:
                o = -o
            nrm.append(nv.normalized())
            out.append(o)
        rings = []
        for i, v in enumerate(loop):
            if vsel is not None and not vsel(v.co):
                rings.append(None)
                continue
            r = radius_fn(v.co) if radius_fn else radius
            dpt = depth_fn(v.co) if depth_fn else depth
            c = v.co - nrm[i] * r
            ring = []
            for k in range(1, segs + 1):
                th = (math.pi / 2) * k / segs
                ring.append(c + nrm[i] * (r * math.cos(th)) + out[i] * (r * math.sin(th)))
            ring.append(c + out[i] * r - nrm[i] * dpt)
            if lip:
                ring.append(c + out[i] * (r * 0.2) - nrm[i] * (dpt + r * 0.8) - out[i] * r * 0.6)
            rings.append([v] + [bm.verts.new(p) for p in ring])
        m = n if closed else n - 1
        for i in range(m):
            j = (i + 1) % n
            mi = None
            for e in loop[i].link_edges:
                if e.other_vert(loop[i]) is loop[j] and e.link_faces:
                    mi = e.link_faces[0].material_index
                    break
            if rings[i] is None or rings[j] is None:
                continue
            for k in range(len(rings[i]) - 1):
                try:
                    f = bm.faces.new((rings[i][k], rings[i][k + 1], rings[j][k + 1], rings[j][k]))
                    if mi is not None:
                        f.material_index = mi
                    newfaces.append(f)
                except ValueError:
                    pass
    # orient new faces consistently with neighbours
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if mat_index is not None:
        for f in newfaces:
            f.material_index = mat_index
    for f in newfaces:
        f.smooth = True
    bm.to_mesh(me)
    bm.free()
    me.update()
    return ob


# ---------------------------------------------------------------------------------------
# BVH helpers
# ---------------------------------------------------------------------------------------
def bvh_of(ob, world=True):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    if world:
        bm.transform(ob.matrix_world)
    t = BVHTree.FromBMesh(bm)
    bm.free()
    return t


def project_to(bvh, p, d):
    """Raycast from p along d (both directions); returns hit (loc, normal) or None."""
    p = Vector(p)
    d = Vector(d).normalized()
    best = None
    for s in (1, -1):
        hit = bvh.ray_cast(p - d * s * 0.0, d * s, 5.0)
        if hit[0] is not None:
            dist = (hit[0] - p).length
            if best is None or dist < best[2]:
                best = (hit[0], hit[1], dist)
    return best


# ---------------------------------------------------------------------------------------
# materials
# ---------------------------------------------------------------------------------------
# atlas: which baked mask atlas a material's faces are unwrapped into (None = no bake).
MAT_DEFS = {
    'paint_green': dict(color=(0.09, 0.32, 0.18), rough=0.42, metal=0.0, atlas='ext_paint', clearcoat=0.3),
    'paint_yellow': dict(color=(0.85, 0.62, 0.08), rough=0.42, metal=0.0, atlas='ext_paint', clearcoat=0.3),
    'chrome': dict(color=(0.8, 0.8, 0.8), rough=0.18, metal=1.0, atlas='ext_parts'),
    'rubber': dict(color=(0.025, 0.025, 0.025), rough=0.85, metal=0.0, atlas='ext_parts'),
    'plastic_black': dict(color=(0.03, 0.03, 0.032), rough=0.6, metal=0.0, atlas='ext_parts'),
    'metal_steel': dict(color=(0.55, 0.56, 0.58), rough=0.45, metal=1.0, atlas='ext_parts'),
    'plastic_dash': dict(color=(0.07, 0.072, 0.078), rough=0.7, metal=0.0, atlas='int_hard'),
    'carpet': dict(color=(0.05, 0.05, 0.055), rough=1.0, metal=0.0, atlas='int_hard'),
    'fabric_headliner': dict(color=(0.55, 0.53, 0.48), rough=0.95, metal=0.0, atlas='int_hard'),
    'vinyl_seat': dict(color=(0.16, 0.16, 0.17), rough=0.75, metal=0.0, atlas='int_soft'),
    'wood_beads': dict(color=(0.42, 0.25, 0.12), rough=0.45, metal=0.0, atlas='int_soft'),
    'glass': dict(color=(0.6, 0.7, 0.68), rough=0.05, metal=0.0, atlas=None, alpha=0.25),
    'mirror': dict(color=(0.9, 0.9, 0.9), rough=0.03, metal=1.0, atlas=None),
    'lens_clear': dict(color=(0.85, 0.87, 0.88), rough=0.08, metal=0.0, atlas='ext_parts', alpha=0.55),
    'lens_red': dict(color=(0.55, 0.02, 0.02), rough=0.12, metal=0.0, atlas='ext_parts', alpha=0.85),
    'lens_amber': dict(color=(0.9, 0.42, 0.03), rough=0.12, metal=0.0, atlas='ext_parts', alpha=0.85),
    'emissive_meter': dict(color=(0.05, 0.05, 0.05), rough=0.3, metal=0.0, atlas=None, emit=(1.0, 0.25, 0.1)),
    'emissive_gauge': dict(color=(0.05, 0.05, 0.05), rough=0.4, metal=0.0, atlas=None, emit=(0.5, 0.9, 0.6)),
    'plate': dict(color=(0.92, 0.92, 0.88), rough=0.5, metal=0.0, atlas=None),
    'sign_panel': dict(color=(0.93, 0.92, 0.86), rough=0.35, metal=0.0, atlas='ext_parts', emit=(0.0, 0.0, 0.0)),
    'sign_text': dict(color=(0.62, 0.04, 0.03), rough=0.4, metal=0.0, atlas='ext_parts'),
    'paint_black': dict(color=(0.02, 0.02, 0.022), rough=0.45, metal=0.0, atlas='ext_parts'),
    # motorbike extras
    'paint_moto': dict(color=(0.32, 0.05, 0.05), rough=0.5, metal=0.0, atlas='moto'),
}

_MAT_CACHE = {}


def mat(name):
    if name in _MAT_CACHE and _MAT_CACHE[name].name in bpy.data.materials:
        return _MAT_CACHE[name]
    d = MAT_DEFS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    c = d['color']
    bsdf.inputs['Base Color'].default_value = (c[0], c[1], c[2], 1)
    bsdf.inputs['Roughness'].default_value = d['rough']
    bsdf.inputs['Metallic'].default_value = d['metal']
    if 'alpha' in d:
        bsdf.inputs['Alpha'].default_value = d['alpha']
        m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else m.blend_method
    if 'emit' in d:
        e = d['emit']
        bsdf.inputs['Emission Color'].default_value = (e[0], e[1], e[2], 1)
        bsdf.inputs['Emission Strength'].default_value = 1.0
    if d.get('clearcoat'):
        bsdf.inputs['Coat Weight'].default_value = d['clearcoat']
    m.diffuse_color = (c[0], c[1], c[2], 1)
    m['atlas'] = d['atlas'] or ''
    _MAT_CACHE[name] = m
    return m


def set_mats(ob, names, idx=None):
    me = ob.data
    me.materials.clear()
    for n in names:
        me.materials.append(mat(n))
    if idx is not None:
        me.polygons.foreach_set('material_index', np.asarray(idx, np.int32))
    return ob


def assign_mat(ob, name):
    me = ob.data
    m = mat(name)
    if m.name not in [x.name for x in me.materials if x]:
        me.materials.append(m)
    k = [x.name if x else '' for x in me.materials].index(m.name)
    me.polygons.foreach_set('material_index', np.full(len(me.polygons), k, np.int32))
    return ob


def mat_by_pred(ob, name, pred):
    """Assign material `name` to faces where pred(center, normal) is True."""
    me = ob.data
    m = mat(name)
    names = [x.name if x else '' for x in me.materials]
    if m.name not in names:
        me.materials.append(m)
        names.append(m.name)
    k = names.index(m.name)
    for p in me.polygons:
        if pred(p.center, p.normal):
            p.material_index = k


# ---------------------------------------------------------------------------------------
# UV + atlas + bake
# ---------------------------------------------------------------------------------------
def _select_only(objs, active=None):
    vl = bpy.context.view_layer
    for o in list(vl.objects):
        if o is not None:
            try:
                o.select_set(False)
            except Exception:
                pass
    for o in objs:
        o.select_set(True)
    vl.objects.active = active or (objs[0] if objs else None)


def ensure_uv(ob, name='UVMap'):
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new(name=name)
    me.uv_layers.active = me.uv_layers[0]


def atlas_unwrap(objs, atlas, margin=0.004, angle=66, island_margin=0.006):
    """Smart-project + pack every face whose material belongs to `atlas`, across objs."""
    objs = [o for o in objs if o.type == 'MESH' and len(o.data.polygons)]
    use = []
    for o in objs:
        ensure_uv(o)
        mats = [m['atlas'] if (m and 'atlas' in m) else '' for m in o.data.materials]
        sel = np.array([mats[p.material_index] == atlas if p.material_index < len(mats) else False
                        for p in o.data.polygons], bool)
        if sel.any():
            o.data.polygons.foreach_set('select', sel)
            use.append(o)
    if not use:
        return []
    _select_only(use)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_mode(type='FACE')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=island_margin,
                             area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, margin_method='FRACTION', margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')
    return use


def planar_uv(ob, axis_u, axis_v, origin=None):
    """Clean 0..1 planar UVs from two world axes (for glass, display quads)."""
    me = ob.data
    ensure_uv(ob)
    uvl = me.uv_layers.active
    au, av = Vector(axis_u).normalized(), Vector(axis_v).normalized()
    mw = ob.matrix_world
    us, vs = [], []
    for lp in me.loops:
        p = mw @ me.vertices[lp.vertex_index].co
        us.append(p.dot(au))
        vs.append(p.dot(av))
    us, vs = np.array(us), np.array(vs)
    u = (us - us.min()) / max(us.max() - us.min(), 1e-9)
    v = (vs - vs.min()) / max(vs.max() - vs.min(), 1e-9)
    uvl.data.foreach_set('uv', np.stack([u, v], 1).astype(np.float32).ravel())


ATLAS_IMAGES = {}


def bake_masks(objs, atlases, size=2048, samples=48, out_dir=None, ao_dist=0.45, cav_dist=0.035, edge_r=0.006,
               threads=3):
    """Bake R=AO, G=edge/curvature (convex+concave sharp edges), B=cavity into one RGB
    image per atlas. Faces bake into the atlas of their material (one pass per channel)."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = threads
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    if not sc.world:
        sc.world = bpy.data.worlds.new('W')
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Color'].default_value = (1, 1, 1, 1)
        bg.inputs['Strength'].default_value = 1.0
    objs = [o for o in objs if o.type == 'MESH' and len(o.data.polygons)]
    mats = {}
    for o in objs:
        for m in o.data.materials:
            if m and m.get('atlas') in atlases:
                mats[m.name] = m
    imgs = {}
    chans = {}
    for a in atlases:
        imgs[a] = {}
    passes = [('ao', ao_dist), ('edge', edge_r), ('cav', cav_dist)]
    results = {a: {} for a in atlases}
    for pname, param in passes:
        # build temporary bake materials: emission of the channel shader + target image
        for a in atlases:
            img = bpy.data.images.new(f'bake_{a}_{pname}', size, size, alpha=False, float_buffer=False)
            img.colorspace_settings.name = 'Non-Color'
            img.generated_color = (1, 1, 1, 1) if pname != 'edge' else (0, 0, 0, 1)
            imgs[a][pname] = img
        saved = {}
        for mn, m in mats.items():
            nt = m.node_tree
            saved[mn] = [l for l in nt.links if l.to_node.type == 'OUTPUT_MATERIAL']
            out = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'][0]
            em = nt.nodes.new('ShaderNodeEmission')
            em.name = '_bk_em'
            if pname in ('ao', 'cav'):
                ao = nt.nodes.new('ShaderNodeAmbientOcclusion')
                ao.name = '_bk_ao'
                ao.inputs['Distance'].default_value = param
                ao.samples = 16
                ao.only_local = (pname == 'cav')
                nt.links.new(ao.outputs['AO'], em.inputs['Color'])
            else:
                bev = nt.nodes.new('ShaderNodeBevel')
                bev.name = '_bk_bev'
                bev.samples = 8
                bev.inputs['Radius'].default_value = param
                geo = nt.nodes.new('ShaderNodeNewGeometry')
                geo.name = '_bk_geo'
                dot = nt.nodes.new('ShaderNodeVectorMath')
                dot.name = '_bk_dot'
                dot.operation = 'DOT_PRODUCT'
                nt.links.new(bev.outputs['Normal'], dot.inputs[0])
                nt.links.new(geo.outputs['Normal'], dot.inputs[1])
                inv = nt.nodes.new('ShaderNodeMath')
                inv.name = '_bk_inv'
                inv.operation = 'SUBTRACT'
                inv.inputs[0].default_value = 1.0
                nt.links.new(dot.outputs['Value'], inv.inputs[1])
                mul = nt.nodes.new('ShaderNodeMath')
                mul.name = '_bk_mul'
                mul.operation = 'MULTIPLY'
                mul.use_clamp = True
                mul.inputs[1].default_value = 6.0
                nt.links.new(inv.outputs['Value'], mul.inputs[0])
                nt.links.new(mul.outputs['Value'], em.inputs['Color'])
            nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
            tex = nt.nodes.new('ShaderNodeTexImage')
            tex.name = '_bk_img'
            tex.image = imgs[m['atlas']][pname]
            for n in nt.nodes:
                n.select = False
            tex.select = True
            nt.nodes.active = tex
        _select_only(objs)
        sc.cycles.bake_type = 'EMIT'
        sc.render.bake.margin = 6
        sc.render.bake.use_clear = True
        log(f'bake pass {pname} over {len(objs)} objects ...')
        bpy.ops.object.bake(type='EMIT', margin=6, use_clear=True)
        # restore
        for mn, m in mats.items():
            nt = m.node_tree
            for n in [n for n in nt.nodes if n.name.startswith('_bk_')]:
                nt.nodes.remove(n)
            out = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'][0]
            bsdf = [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'][0]
            nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
        for a in atlases:
            results[a][pname] = imgs[a][pname]
    # compose RGB
    out_imgs = {}
    for a in atlases:
        px = {}
        for pname in ('ao', 'edge', 'cav'):
            img = results[a][pname]
            arr = np.empty(size * size * 4, np.float32)
            img.pixels.foreach_get(arr)
            px[pname] = arr.reshape(size, size, 4)[:, :, 0]
        rgb = np.ones((size, size, 4), np.float32)
        rgb[:, :, 0] = _soften(px['ao'], 1)
        rgb[:, :, 1] = _soften(px['edge'], 1)
        rgb[:, :, 2] = _soften(px['cav'], 1)
        img = bpy.data.images.new(f'mask_{a}', size, size, alpha=False)
        img.colorspace_settings.name = 'Non-Color'
        img.pixels.foreach_set(rgb.ravel())
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
            p = os.path.join(out_dir, f'mask_{a}.png')
            img.filepath_raw = p
            img.file_format = 'PNG'
            img.save()
        out_imgs[a] = img
        for pname in ('ao', 'edge', 'cav'):
            bpy.data.images.remove(results[a][pname])
    return out_imgs


def dissolve_fragments(ob, angle_deg=0.2):
    """Re-merge coplanar boolean fragments (keeps material borders and open boundaries)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(angle_deg), use_dissolve_boundaries=False,
                               verts=bm.verts, edges=bm.edges, delimit={'MATERIAL'})
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


def _soften(a, r=1):
    """Tiny box blur to hide bake sampling noise."""
    if r <= 0:
        return a
    b = a.copy()
    acc = np.zeros_like(a)
    k = 0
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            acc += np.roll(np.roll(b, dy, 0), dx, 1)
            k += 1
    return acc / k


# ---------------------------------------------------------------------------------------
# empties / custom props
# ---------------------------------------------------------------------------------------
def empty(name, loc, parent=None, size=0.05):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'PLAIN_AXES'
    e.empty_display_size = size
    link(e)
    e.matrix_world = Matrix.Translation(Vector(loc))
    e.location = Vector(loc)
    if parent is not None:
        parent_keep(e, parent)
    return e


def parent_keep(child, parent):
    bpy.context.view_layer.update()
    mw = child.matrix_world.copy()
    child.parent = parent
    child.matrix_parent_inverse = Matrix.Identity(4)
    child.matrix_world = mw


def b2t(v):
    """Blender vector -> three.js vector (x, z, -y)."""
    return [round(float(v[0]), 5), round(float(v[2]), 5), round(float(-v[1]), 5)]


def set_pivot_props(ob, axis_blender, rng_deg=None, kind='hinge', note=None):
    a = Vector(axis_blender).normalized()
    ob['pivotAxis'] = b2t(a)
    ob['pivotKind'] = kind
    if rng_deg is not None:
        ob['rangeDeg'] = [float(rng_deg[0]), float(rng_deg[1])]
    if note:
        ob['note'] = note


# ---------------------------------------------------------------------------------------
# export + GLB post-processing (inject mask atlases as occlusion textures)
# ---------------------------------------------------------------------------------------
def export_glb(path, objs):
    _select_only(objs)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_texcoords=True, export_normals=True, export_tangents=False, export_materials='EXPORT',
        export_image_format='NONE', export_extras=True, export_cameras=False, export_lights=False,
        export_animations=False, export_skins=False, export_morph=False, export_attributes=False,
        export_vertex_color='NONE' if bpy.app.version >= (4, 2, 0) else None,
    ) if bpy.app.version >= (4, 2, 0) else bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_materials='EXPORT', export_image_format='NONE', export_extras=True)


def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, ver, length = struct.unpack_from('<4sII', data, 0)
    assert magic == b'glTF'
    off = 12
    js, binc = None, b''
    while off < length:
        clen, ctype = struct.unpack_from('<I4s', data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == b'JSON':
            js = json.loads(chunk.decode('utf8'))
        elif ctype == b'BIN\x00':
            binc = chunk
        off += 8 + clen
    return js, bytearray(binc)


def write_glb(path, js, binc):
    jb = json.dumps(js, separators=(',', ':')).encode('utf8')
    jb += b' ' * ((4 - len(jb) % 4) % 4)
    binc = bytes(binc)
    binc += b'\x00' * ((4 - len(binc) % 4) % 4)
    total = 12 + 8 + len(jb) + 8 + len(binc)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(jb), b'JSON'))
        f.write(jb)
        f.write(struct.pack('<I4s', len(binc), b'BIN\x00'))
        f.write(binc)


def inject_masks(path, atlas_files, mat_atlas, extras=None):
    """atlas_files {atlas: jpg path}; mat_atlas {material name: atlas}. Adds images as
    occlusionTexture (R = AO; G = edge; B = cavity) on every material of that atlas."""
    js, binc = read_glb(path)
    js.setdefault('images', [])
    js.setdefault('textures', [])
    js.setdefault('samplers', [])
    js['samplers'].append({'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071})
    smp = len(js['samplers']) - 1
    tex_of = {}
    for a, fp in atlas_files.items():
        with open(fp, 'rb') as f:
            img = f.read()
        while len(binc) % 4:
            binc.append(0)
        off = len(binc)
        binc.extend(img)
        js['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(img)})
        mime = 'image/jpeg' if fp.lower().endswith(('.jpg', '.jpeg')) else 'image/png'
        js['images'].append({'name': f'mask_{a}', 'bufferView': len(js['bufferViews']) - 1, 'mimeType': mime})
        js['textures'].append({'name': f'mask_{a}', 'sampler': smp, 'source': len(js['images']) - 1})
        tex_of[a] = len(js['textures']) - 1
    for m in js.get('materials', []):
        a = mat_atlas.get(m.get('name'))
        if a in tex_of:
            m['occlusionTexture'] = {'index': tex_of[a], 'texCoord': 0, 'strength': 1.0}
            m.setdefault('extras', {})['maskAtlas'] = a
    js['buffers'][0]['byteLength'] = len(binc)
    if extras:
        js.setdefault('asset', {}).setdefault('extras', {}).update(extras)
    write_glb(path, js, binc)


def rename_anchor_nodes(path):
    """Give every node tagged extras.anchor exactly that name (Blender cannot hold the
    duplicate names 'hood' / 'trunk' used both by a pivot mesh and by an anchor empty)."""
    js, binc = read_glb(path)
    for n in js.get('nodes', []):
        a = n.get('extras', {}).get('anchor')
        if a:
            n['name'] = a
    write_glb(path, js, binc)


def save_jpeg(img_or_png, out_path, size=None, quality=90):
    """Convert a Blender image (or PNG path) to JPEG via Blender image save."""
    if isinstance(img_or_png, str):
        img = bpy.data.images.load(img_or_png)
    else:
        img = img_or_png
    if size and img.size[0] != size:
        img = img.copy()
        img.scale(size, size)
    sc = bpy.context.scene
    s = sc.render.image_settings
    s.file_format = 'JPEG'
    s.quality = quality
    s.color_mode = 'RGB'
    img.save_render(out_path, scene=sc)
    return out_path


# ---------------------------------------------------------------------------------------
# review rendering
# ---------------------------------------------------------------------------------------
def setup_render(res=(960, 540), samples=24, threads=3):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception:
        pass
    sc.cycles.max_bounces = 6
    sc.cycles.glossy_bounces = 3
    sc.cycles.transparent_max_bounces = 6
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = threads
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    return sc


def studio_world(strength=1.0, color=(0.55, 0.6, 0.65), top=(0.9, 0.92, 0.95)):
    sc = bpy.context.scene
    w = sc.world or bpy.data.worlds.new('W')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    grad = nt.nodes.new('ShaderNodeTexGradient')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[0].color = (*color, 1)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (*top, 1)
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = strength
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])


def add_light(name, kind, loc, rot=(0, 0, 0), energy=500, size=1.0, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if kind == 'AREA':
        ld.size = size
    elif kind in ('POINT', 'SPOT'):
        ld.shadow_soft_size = size
    elif kind == 'SUN':
        ld.angle = size
    ob = bpy.data.objects.new(name, ld)
    link(ob)
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def look_at(ob, target, roll=0.0):
    d = Vector(target) - ob.location
    q = d.to_track_quat('-Z', 'Y')
    ob.rotation_euler = q.to_euler()
    if roll:
        ob.rotation_euler.rotate_axis('Z', roll)


def camera(name, loc, target, lens=35.0, sensor=36.0):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.sensor_width = sensor
    cd.clip_start = 0.01
    ob = bpy.data.objects.new(name, cd)
    link(ob)
    ob.location = loc
    look_at(ob, target)
    return ob


def render_to(cam, path):
    sc = bpy.context.scene
    sc.camera = cam
    sc.render.filepath = path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    log('rendered', path)
