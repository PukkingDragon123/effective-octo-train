# Taxi exterior sheet metal: cut the master surface into real panels (separate doors, hood,
# trunk lid, bumpers, fuel flap) with true panel gaps, rolled edges and return flanges,
# wheel-arch lips, lamp openings; then glass, door sashes, seals and mouldings.
import math
import numpy as np
import bpy
import bmesh
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree
import vlib
from vlib import (V, log, duplicate, delete, boolean, separate_loose, split_by_attr, roll_edges,
                  transfer_normals, bvh_of, new_mesh_obj, sweep, extrude_outline, cookie_cutter, coons_patch,
                  resample, rounded_poly_2d, mat, set_mats, assign_mat, lerp, clamp, smoothstep, ease, join,
                  merge_doubles, recalc_normals, planar_uv, lathe, grid_faces, apply_modifiers)
import taxi_body as tb

GAP = 0.0035        # visible panel gap
ROLL_R = 0.0016     # rolled edge radius
CUT_W = GAP + 2 * ROLL_R


# ---------------------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------------------
def kd_of(points):
    kd = KDTree(max(len(points), 1))
    for i, p in enumerate(points):
        kd.insert(p, i)
    kd.balance()
    return kd


def seam_points(ob, attr='part', ignore=(5,)):
    me = ob.data
    vals = np.zeros(len(me.polygons), np.int32)
    me.attributes[attr].data.foreach_get('value', vals)
    vp = {}
    for p in me.polygons:
        if vals[p.index] in ignore:
            continue
        for vi in p.vertices:
            vp.setdefault(vi, set()).add(int(vals[p.index]))
    return [me.vertices[vi].co.copy() for vi, s in vp.items() if len(s) > 1]


def boundary_dirs(v):
    """(tangent, outward in-surface dir) at a boundary vertex."""
    be = [e for e in v.link_edges if e.is_boundary]
    if len(be) >= 2:
        t = be[1].other_vert(v).co - be[0].other_vert(v).co
    elif len(be) == 1:
        t = be[0].other_vert(v).co - v.co
    else:
        return None, None
    t.normalize()
    n = v.normal
    o = t.cross(n)
    o.normalize()
    fc = Vector()
    for f in v.link_faces:
        fc += f.calc_center_median()
    fc /= max(len(v.link_faces), 1)
    if o.dot(v.co - fc) < 0:
        o = -o
    return t, o


def shrink_seams(ob, kd, dist, bvh):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    moves = []
    for v in bm.verts:
        if not v.is_boundary:
            continue
        co, idx, d = kd.find(v.co)
        if d is None or d > 1e-5:
            continue
        t, o = boundary_dirs(v)
        if o is None:
            continue
        moves.append((v, v.co - o * dist))
    for v, p in moves:
        hit = bvh.find_nearest(p)
        v.co = hit[0] if hit[0] is not None else p
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


def thick_polyline_2d(pts, w):
    """Closed outline around a 2D polyline with width w (for X-extruded seam slabs)."""
    P = np.asarray(pts, float)
    n = len(P)
    L, R = [], []
    for i in range(n):
        a = P[max(i - 1, 0)]
        b = P[min(i + 1, n - 1)]
        t = b - a
        t /= np.linalg.norm(t)
        nrm = np.array([-t[1], t[0]])
        L.append(P[i] + nrm * w / 2)
        R.append(P[i] - nrm * w / 2)
    return [tuple(p) for p in L] + [tuple(p) for p in R[::-1]]


def slab_x(name, pts_yz, w, x0, x1):
    return extrude_outline(name, thick_polyline_2d(pts_yz, w), x0, x1, plane='YZ')


def arch_cutter(name, y, z, r, side):
    x0, x1 = (0.35, 1.3) if side > 0 else (-1.3, -0.35)
    return lathe(name, [(r, x0), (r, x1)], segments=72, axis='X', center=(0, y, z), cap_ends=True, smooth=False)


def mark_cutter(ob):
    ob.data.materials.clear()
    ob.data.materials.append(cutter_mat())
    return ob


def cutter_mat():
    if '_cutter' in bpy.data.materials:
        return bpy.data.materials['_cutter']
    return bpy.data.materials.new('_cutter')


def cut(ob, cutter, op='DIFFERENCE'):
    """Boolean with cutter faces removed from the result (sheet-metal cut)."""
    mark_cutter(cutter)
    if len(ob.data.materials) == 0:
        ob.data.materials.append(mat('paint_green'))
    names = [m.name if m else '' for m in ob.data.materials]
    if '_cutter' not in names:
        ob.data.materials.append(cutter_mat())
    boolean(ob, cutter, op=op)
    names = [m.name if m else '' for m in ob.data.materials]
    ci = names.index('_cutter')
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    dead = [f for f in bm.faces if f.material_index == ci]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.materials.pop(index=ci)
    ob.data.update()
    return ob


def zone_materials(ob):
    """paint_yellow for zone 1, paint_green for zone 0."""
    me = ob.data
    z = np.zeros(len(me.polygons), np.int32)
    me.attributes['zone'].data.foreach_get('value', z)
    me.materials.clear()
    me.materials.append(mat('paint_green'))
    me.materials.append(mat('paint_yellow'))
    me.polygons.foreach_set('material_index', z.astype(np.int32))


def add_skin_group(ob):
    vg = ob.vertex_groups.new(name='skin')
    vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    return vg


class Ext:
    """Builds the exterior; keeps references for parts/interior placement."""

    def __init__(self):
        self.gref = tb.BodyGrid('ref')
        self.master = self.gref.build_master('master_ref')
        self.master.hide_render = True
        self.bvh = bvh_of(self.master)
        self.g = tb.BodyGrid('geo')
        self.geo = self.g.build_master('master_geo')
        self.geo.hide_render = True
        self.objs = {}
        self.loops = {}

    # ---------------- surface queries -------------------------------------------------
    def surf_x(self, y, z, side=1):
        """Outer surface x at side-view (y, z) by raycast toward the centre."""
        hit = self.bvh.ray_cast(Vector((side * 1.5, y, z)), Vector((-side, 0, 0)), 3.0)
        if hit[0] is None:
            return None, None
        return hit[0], hit[1]

    def nearest(self, p):
        loc, nrm, idx, d = self.bvh.find_nearest(Vector(p))
        return loc, nrm

    def W(self, s, t):
        """Mirrored W evaluation: s<0 -> left side. s in u-space (0 = front centre)."""
        u = abs(s)
        p = tb.W_eval(u, t)
        if s < 0:
            p = p * np.array([-1, 1, 1])
        return p

    def Wr(self, s, t):
        """Rear-centred W evaluation: s = 3 - u (0 = rear centre); s<0 -> left."""
        u = 3.0 - abs(s)
        p = tb.W_eval(u, t)
        if s < 0:
            p = p * np.array([-1, 1, 1])
        return p

    def G(self, c, r):
        """Bilinear evaluation of the greenhouse half grid, c<0 mirrored."""
        Gg = self.g.G
        nc, nr = Gg.shape[:2]
        cc = clamp(abs(c), 0, nc - 1.0001)
        rr = clamp(r, 0, nr - 1.0001)
        i, j = int(cc), int(rr)
        fi, fj = cc - i, rr - j
        p = ((1 - fi) * (1 - fj) * Gg[i, j] + fi * (1 - fj) * Gg[i + 1, j] +
             (1 - fi) * fj * Gg[i, j + 1] + fi * fj * Gg[i + 1, j + 1])
        if c < 0:
            p = p * np.array([-1, 1, 1])
        return p

    def u_at_x_front(self, x):
        """Front-quadrant u where the max-width outline has this x."""
        us = np.linspace(0, 1, 2001)
        xs = np.array([tb.O(u)[0] for u in us])
        return float(np.interp(x, xs, us))

    def u_at_y_front(self, y):
        us = np.linspace(0, 1, 2001)
        ys = np.array([tb.O(u)[1] for u in us])
        return float(np.interp(y, ys[::-1], us[::-1]))

    def s_at_x_rear(self, x):
        us = np.linspace(2, 3, 2001)
        xs = np.array([tb.O(u)[0] for u in us])
        return float(3.0 - np.interp(x, xs[::-1], us[::-1]))

    def s_at_y_rear(self, y):
        us = np.linspace(2, 3, 2001)
        ys = np.array([tb.O(u)[1] for u in us])
        return float(3.0 - np.interp(y, ys, us))

    def t_at_z(self, u, z, t0=0.0, t1=7.0):
        ts = np.linspace(t0, t1, 120)
        zs = np.array([tb.W_eval(u, t)[2] for t in ts])
        return float(np.interp(z, zs, ts)) if zs[-1] > zs[0] else float(np.interp(z, zs[::-1], ts[::-1]))

    # ---------------- loops in parameter space --------------------------------------------
    def param_loop(self, fn, s0, s1, tb_fn, tt_fn, n_s=60, n_end=10, round_s=0.0):
        """Closed loop in (s, t) space: bottom tb_fn(s), top tt_fn(s), ends rounded."""
        pts = []
        ss = np.linspace(s0, s1, n_s)
        for s in ss:
            pts.append((s, tb_fn(s)))
        # right end: semi-rounded cap
        for k in range(1, n_end):
            a = math.pi * (k / n_end)
            tb_, tt_ = tb_fn(s1), tt_fn(s1)
            tm = 0.5 * (tb_ + tt_)
            hr = 0.5 * (tt_ - tb_)
            pts.append((s1 + round_s * math.sin(a), tm - hr * math.cos(a)))
        for s in ss[::-1]:
            pts.append((s, tt_fn(s)))
        for k in range(1, n_end):
            a = math.pi * (k / n_end)
            tb_, tt_ = tb_fn(s0), tt_fn(s0)
            tm = 0.5 * (tb_ + tt_)
            hr = 0.5 * (tt_ - tb_)
            pts.append((s0 - round_s * math.sin(a), tm + hr * math.cos(a)))
        P = np.array([fn(s, t) for s, t in pts])
        return P, pts

    def normals_at(self, P):
        out = []
        for p in P:
            loc, n = self.nearest(p)
            out.append(np.array(n))
        return np.array(out)

    # ---------------- build ----------------------------------------------------------
    def build(self):
        self.build_panels()
        self.build_glass_and_trim()
        return self.objs

    def build_panels(self):
        g = self.g
        work = duplicate(self.geo, 'work')
        work.hide_render = False
        seam_kd = kd_of(seam_points(work))
        # delete side-window apertures
        bm = bmesh.new()
        bm.from_mesh(work.data)
        lay = bm.faces.layers.int.get('part')
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f[lay] == 5], context='FACES')
        bm.to_mesh(work.data)
        bm.free()
        parts = split_by_attr(work, 'part', {0: 'body_shell', 1: 'hood', 2: 'trunk', 3: 'bumper_f', 4: 'bumper_r'})
        delete(work)
        body = parts['body_shell']
        for nm in ('hood', 'trunk', 'bumper_f', 'bumper_r', 'body_shell'):
            shrink_seams(parts[nm], seam_kd, GAP / 2 + ROLL_R, self.bvh)

        # ---- cutters ---------------------------------------------------------------
        cutters = []
        for side in (1, -1):
            cutters.append(arch_cutter('c_archF', tb.AXF, tb.AXLE_Z, 0.345, side))
            cutters.append(arch_cutter('c_archR', tb.AXR, tb.AXLE_Z, 0.338, side))
        # door seams (side-view polylines, extruded along X)
        front_edge = [(0.836, 0.2445), (0.843, 0.32), (0.848, 0.50), (0.845, 0.66), (0.835, 0.78), (0.818, 0.85),
                      (0.806, 0.870), (0.800, 0.884), (0.799, 0.890)]
        b_edge = [(-0.192, 0.2445), (-0.196, 0.60), (-0.200, 0.96)]
        rear_edge = [(-0.79, 0.2445)]
        for k in range(0, 9):
            ph = math.radians(60 * k / 8)
            rear_edge.append((tb.AXR + 0.364 * math.cos(ph), tb.AXLE_Z + 0.364 * math.sin(ph)))
        rear_edge += [(-1.03, 0.70), (-1.052, 0.80), (-1.06, 0.906)]
        self.door_lines = dict(front=front_edge, b=b_edge, rear=rear_edge)
        bottom = [(0.95, 0.246), (-0.90, 0.246)]
        self.door_bottom_z = 0.246
        for side in (1, -1):
            x0, x1 = (0.55, 1.2) if side > 0 else (-1.2, -0.55)
            for nm, ln in (('c_dF', front_edge), ('c_dB', b_edge), ('c_dR', rear_edge), ('c_dBot', bottom)):
                cutters.append(slab_x(nm, ln, CUT_W, x0, x1))
        # fuel flap (left rear quarter)
        flap_rect = rounded_poly_2d([(-1.468, 0.648), (-1.298, 0.648), (-1.298, 0.786), (-1.468, 0.786)], 0.022, 6)
        self.flap_rect = flap_rect
        for c in cutters:
            mark_cutter(c)
        # lamp / intake openings (cookie cutters in W parameter space)
        lamp_cutters = self.lamp_cutters()

        # ---- cut body ----------------------------------------------------------------
        coll = bpy.data.collections.new('_cutters')
        bpy.context.scene.collection.children.link(coll)
        for c in cutters + lamp_cutters['body']:
            for cc in c.users_collection:
                cc.objects.unlink(c)
            coll.objects.link(c)
        self._cut_coll(body, coll)
        # fuel flap hole + flap
        hole = extrude_outline('c_flap', self._offset_loop(flap_rect, CUT_W / 2), -1.2, -0.55, plane='YZ')
        flap_c = extrude_outline('c_flap2', self._offset_loop(flap_rect, -CUT_W / 2), -1.2, -0.55, plane='YZ')
        flap = duplicate(body, 'fuel_flap')
        cut(flap, flap_c, op='INTERSECT')
        cut(body, hole)
        delete([hole, flap_c])
        # bumpers: arches + intakes
        for nm, key in (('bumper_f', 'bumper_f'), ('bumper_r', 'bumper_r')):
            coll2 = bpy.data.collections.new('_c_' + nm)
            bpy.context.scene.collection.children.link(coll2)
            for c in [c for c in cutters if c.name.startswith('c_arch')] + lamp_cutters.get(key, []):
                coll2.objects.link(c)
            self._cut_coll(parts[nm], coll2)
            bpy.data.collections.remove(coll2)
        # hood / trunk get the lamp band top cut too (safety, usually untouched)
        for c in list(coll.objects):
            delete(c)
        bpy.data.collections.remove(coll)
        for k, lst in lamp_cutters.items():
            if k == '_loops':
                continue
            for c in lst:
                try:
                    if c.name in bpy.data.objects:
                        delete(c)
                except ReferenceError:
                    pass

        # ---- separate doors ---------------------------------------------------------
        isl = separate_loose(body)
        doors = {}
        rest = []
        for o in isl:
            o.data.update()
            vs = np.array([v.co[:] for v in o.data.vertices])
            c = vs.mean(axis=0)
            area = sum(p.area for p in o.data.polygons)
            if len(vs):
                log('island', o.name, len(o.data.polygons), 'area %.3f' % area, 'min', np.round(vs.min(0), 3),
                    'max', np.round(vs.max(0), 3))
            if area < 0.02 and len(vs) < 200:
                rest.append(o)
                continue
            if abs(c[0]) > 0.6 and c[2] > 0.3 and c[2] < 0.9 and -1.1 < c[1] < 0.9 and area < 1.5:
                key = ('r' if c[0] > 0 else 'l')
                key = ('f' if c[1] > -0.2 else 'r') + key
                doors['door_' + key] = o
            else:
                rest.append(o)
        big = max(rest, key=lambda o: len(o.data.polygons))
        small = [o for o in rest if o is not big]
        for o in small:
            log('dropping island', o.name, len(o.data.polygons))
        delete(small)
        body = big
        body.name = 'body'
        body.data.name = 'body'
        log('doors', sorted(doors.keys()))
        assert len(doors) == 4, doors.keys()

        # ---- finish panels ------------------------------------------------------------
        def arch_dist(co):
            best = 9
            for (y, r) in ((tb.AXF, 0.345), (tb.AXR, 0.338)):
                d = abs(math.hypot(co.y - y, co.z - tb.AXLE_Z) - r)
                best = min(best, d)
            return best

        def is_under(co):
            return co.z < 0.215 and abs(co.x) < 0.80

        def radius_fn(co):
            if arch_dist(co) < 0.006:
                return 0.004
            return ROLL_R

        def depth_fn_body(co):
            if arch_dist(co) < 0.006:
                return 0.035
            if abs(co.x) > 0.55 and co.z > 0.86 and -1.1 < co.y < 0.85:
                return 0.018         # belt / aperture flanges
            if abs(co.x) > 0.55 and 0.2 < co.z < 0.95 and -1.08 < co.y < 0.86:
                return 0.08          # door-opening jambs
            return 0.012

        def depth_fn_door(co):
            if co.z > 0.86:
                return 0.02
            return 0.085

        panels = dict(doors)
        panels.update(hood=parts['hood'], trunk=parts['trunk'], bumper_f=parts['bumper_f'],
                      bumper_r=parts['bumper_r'], body=body, fuel_flap=flap)
        for nm, o in panels.items():
            o.name = nm
            o.data.name = nm
            zone_materials(o)
            vlib.dissolve_fragments(o, 0.2)
            add_skin_group(o)
            if nm.startswith('door'):
                dfn = depth_fn_door
            elif nm == 'body':
                dfn = depth_fn_body
            elif nm in ('hood', 'trunk'):
                dfn = lambda co: 0.03
            elif nm == 'fuel_flap':
                dfn = lambda co: 0.004
            else:
                dfn = lambda co: 0.02
            roll_edges(o, segs=2, normal_src=self.bvh, radius_fn=radius_fn, depth_fn=dfn,
                       vsel=lambda co: not is_under(co))
            transfer_normals(o, self.master, vgroup='skin')
            self.objs[nm] = o
        if 'bumper_f' in self.objs:
            # the bumper lower lip is unpainted black plastic in the references? keep paint, but
            # flag the lower tuck as plastic for wear variety
            pass
        self.lamp_holes = lamp_cutters.get('_loops', {})

    def _cut_coll(self, ob, coll):
        if len(ob.data.materials) == 0:
            ob.data.materials.append(mat('paint_green'))
        names = [m.name if m else '' for m in ob.data.materials]
        if '_cutter' not in names:
            ob.data.materials.append(cutter_mat())
        for c in coll.objects:
            if c.type == 'MESH':
                c.data.materials.clear()
                c.data.materials.append(cutter_mat())
        boolean(ob, coll, op='DIFFERENCE')
        names = [m.name if m else '' for m in ob.data.materials]
        ci = names.index('_cutter')
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index == ci], context='FACES')
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.materials.pop(index=ci)

    @staticmethod
    def _offset_loop(loop, d):
        P = np.array(loop, float)
        c = P.mean(axis=0)
        out = []
        n = len(P)
        for i in range(n):
            a, b = P[i - 1], P[(i + 1) % n]
            t = b - a
            t /= np.linalg.norm(t)
            nrm = np.array([t[1], -t[0]])
            if np.dot(nrm, P[i] - c) < 0:
                nrm = -nrm
            out.append(tuple(P[i] + nrm * d))
        return out

    # ---------------- lamp / intake openings -------------------------------------------
    def lamp_cutters(self):
        out = {'body': [], 'bumper_f': [], 'bumper_r': [], '_loops': {}}
        # front band: headlights + grille between bumper top (t=7) and hood edge (t=9)
        ue = self.u_at_y_front(1.775)
        self.front_band = dict(ue=ue)

        def tt_front(s):
            a = abs(s)
            return 8.80 - 0.62 * smoothstep(0.50, ue, a)

        def tb_front(s):
            return 7.22 + 0.10 * smoothstep(0.55, ue, abs(s))

        P, st = self.param_loop(self.W, -ue, ue, tb_front, tt_front, n_s=80, n_end=8, round_s=0.02)
        Nn = self.normals_at(P)
        out['body'].append(cookie_cutter('c_fband', P, Nn, 0.04, 0.04))
        out['_loops']['front_band'] = (P, Nn, st)
        self.tt_front, self.tb_front = tt_front, tb_front
        # rear band: tail lights + garnish
        se = self.s_at_y_rear(-1.955)
        self.rear_band = dict(se=se)

        def tt_rear(s):
            return 8.80 - 0.55 * smoothstep(0.45, se, abs(s))

        def tb_rear(s):
            return 7.22 + 0.08 * smoothstep(0.5, se, abs(s))

        P, st = self.param_loop(self.Wr, -se, se, tb_rear, tt_rear, n_s=80, n_end=8, round_s=0.02)
        Nn = self.normals_at(P)
        out['body'].append(cookie_cutter('c_rband', P, Nn, 0.04, 0.04))
        out['_loops']['rear_band'] = (P, Nn, st)
        self.tt_rear, self.tb_rear = tt_rear, tb_rear
        # front bumper: long intake slot + indicator openings + lower intake
        u_slot = self.u_at_x_front(0.615)
        u_i0 = self.u_at_x_front(0.640)
        u_i1 = self.u_at_x_front(0.805)
        t_lo = self.t_at_z(0.0, 0.384)
        t_hi = self.t_at_z(0.0, 0.452)
        self.slot = dict(u=u_slot, t0=t_lo, t1=t_hi, ui0=u_i0, ui1=u_i1)
        P, st = self.param_loop(self.W, -u_slot, u_slot, lambda s: t_lo, lambda s: t_hi, n_s=90, n_end=6,
                                round_s=0.006)
        Nn = self.normals_at(P)
        out['bumper_f'].append(cookie_cutter('c_slot', P, Nn, 0.04, 0.04))
        out['_loops']['slot'] = (P, Nn, st)
        for sgn in (1, -1):
            def tlo(s, u=0):
                return self.t_at_z(abs(s), 0.386)

            def thi(s):
                return self.t_at_z(abs(s), 0.452)
            a, b = (u_i0, u_i1) if sgn > 0 else (-u_i1, -u_i0)
            P, st = self.param_loop(self.W, a, b, lambda s: tlo(s), lambda s: thi(s), n_s=30, n_end=6, round_s=0.006)
            Nn = self.normals_at(P)
            out['bumper_f'].append(cookie_cutter('c_ind', P, Nn, 0.04, 0.04))
            out['_loops']['ind_f' + ('r' if sgn > 0 else 'l')] = (P, Nn, st)
        u_lo = self.u_at_x_front(0.46)
        t2a = self.t_at_z(0.0, 0.282)
        t2b = self.t_at_z(0.0, 0.338)
        self.lower_intake = dict(u=u_lo, t0=t2a, t1=t2b)
        P, st = self.param_loop(self.W, -u_lo, u_lo, lambda s: t2a, lambda s: t2b, n_s=60, n_end=6, round_s=0.01)
        Nn = self.normals_at(P)
        out['bumper_f'].append(cookie_cutter('c_lowint', P, Nn, 0.04, 0.04))
        out['_loops']['lower_intake'] = (P, Nn, st)
        return out

    # ---------------- glass, sashes, seals ---------------------------------------------
    def build_glass_and_trim(self):
        self.build_ws_rw()
        self.build_side_glass()
        self.build_seals()

    def g_counts(self):
        return self.g.g_segcounts

    def build_ws_rw(self):
        nW, nA, nS, nC, nR = self.g_counts()
        NG = self.g.G.shape[0]
        r_top_ws = self.g.G_ROW_OF[3] - 0.35
        # windshield: columns +-(nW-1) (A-pillar starts at nW-1)
        cmax = nW - 1 - 0.18
        loop2 = rounded_poly_2d([(-cmax, 0.55), (cmax, 0.55), (cmax, r_top_ws), (-cmax, r_top_ws)],
                                [0.0, 0.0, 0.0, 0.0], 1)
        # rounded corners in metric-ish space: build explicitly
        loop2 = self._rrect_cr(-cmax, cmax, 0.55, r_top_ws, rc_bot=(1.2, 0.25), rc_top=(2.6, 0.55))
        P = np.array([self.G(c, r) for c, r in loop2])
        Nn = self.normals_at(P)
        cw = cookie_cutter('c_ws', P, Nn, 0.04, 0.04)
        cut(self.objs['body'], cw)
        delete(cw)
        self.ws_loop = (P, Nn)
        # rear window: last nR columns (centre at NG-1)
        c0 = NG - 1           # centre column index (x = 0)
        span = nR - 1 - 0.2   # columns toward the C pillar
        r_top_rw = self.g.G_ROW_OF[3] - 0.35
        loop2 = self._rrect_cr(-span, span, 0.6, r_top_rw, rc_bot=(1.6, 0.3), rc_top=(2.4, 0.5))
        P = np.array([self.G(self._rw_col(c), r) * np.array([np.sign(c) if c != 0 else 1, 1, 1]) for c, r in loop2])
        Nn = self.normals_at(P)
        cr = cookie_cutter('c_rw', P, Nn, 0.04, 0.04)
        cut(self.objs['body'], cr)
        delete(cr)
        self.rw_loop = (P, Nn)
        # re-roll new hole edges on the body (only new boundary loops near the glass)
        o = self.objs['body']
        # remove skin group weights etc.: roll only verts near the window loops
        kd = kd_of([Vector(p) for p in np.vstack([self.ws_loop[0], self.rw_loop[0]])])

        def near(co):
            p, i, d = kd.find(co)
            return d is not None and d < 0.03
        vg = o.vertex_groups.get('skin')
        roll_edges(o, segs=2, normal_src=self.bvh, radius=0.002, depth=0.02, vsel=near)
        # glass panes from the greenhouse surface, slightly larger than the opening
        ws = self._g_patch('glass_windshield', -cmax - 0.35, cmax + 0.35, 0.40, r_top_ws + 0.12, inset=0.004,
                           nu=40, nv=16)
        rw = self._g_patch('glass_rear', -span - 0.35, span + 0.35, 0.45, r_top_rw + 0.12, inset=0.004, nu=36,
                           nv=14, rear=True)
        for gl in (ws, rw):
            assign_mat(gl, 'glass')
            self.objs[gl.name] = gl
        planar_uv(ws, (1, 0, 0), (0, -0.42, 0.9))
        planar_uv(rw, (-1, 0, 0), (0, 0.45, 0.9))
        # rubber mouldings around both openings
        for nm, (P, Nn) in (('seal_ws', self.ws_loop), ('seal_rw', self.rw_loop)):
            prof = [(-0.004, -0.013), (0.0012, -0.012), (0.0032, -0.007), (0.0036, 0.0), (0.0028, 0.006),
                    (0.0005, 0.009), (-0.006, 0.0085), (-0.008, -0.004)]
            path = resample(np.vstack([P, P[:1]]), 90)[:-1]
            nn = self.normals_at(path)
            s = sweep(nm, path, prof, closed_path=True, closed_profile=True, normals=nn)
            # orient profile b axis outward of the hole: flip if needed
            assign_mat(s, 'rubber')
            self.objs[nm] = s

    def _rw_col(self, c):
        NG = self.g.G.shape[0]
        return (NG - 1) - abs(c)

    def _rrect_cr(self, c0, c1, r0, r1, rc_bot=(1.0, 0.3), rc_top=(2.0, 0.5), seg=8):
        """Rounded rectangle in (column,row) space with anisotropic corner radii."""
        pts = []

        def arc(cx, cy, rx, ry, a0, a1):
            for k in range(seg + 1):
                a = math.radians(a0 + (a1 - a0) * k / seg)
                pts.append((cx + rx * math.cos(a), cy + ry * math.sin(a)))
        arc(c1 - rc_bot[0], r0 + rc_bot[1], rc_bot[0], rc_bot[1], -90, 0)
        arc(c1 - rc_top[0], r1 - rc_top[1], rc_top[0], rc_top[1], 0, 90)
        arc(c0 + rc_top[0], r1 - rc_top[1], rc_top[0], rc_top[1], 90, 180)
        arc(c0 + rc_bot[0], r0 + rc_bot[1], rc_bot[0], rc_bot[1], 180, 270)
        # densify long edges
        out = []
        n = len(pts)
        for i in range(n):
            a, b = np.array(pts[i]), np.array(pts[(i + 1) % n])
            m = max(1, int(np.linalg.norm((b - a) * np.array([1.0, 3.0])) / 0.5))
            for k in range(m):
                out.append(tuple(a + (b - a) * k / m))
        return out

    def _g_patch(self, name, c0, c1, r0, r1, inset=0.004, nu=30, nv=12, rear=False):
        verts = []
        for i in range(nu + 1):
            c = lerp(c0, c1, i / nu)
            for j in range(nv + 1):
                r = lerp(r0, r1, j / nv)
                if rear:
                    p = self.G(self._rw_col(c), r) * np.array([np.sign(c) if c != 0 else 1, 1, 1])
                else:
                    p = self.G(c, r)
                loc, n = self.nearest(p)
                verts.append(np.array(loc) - np.array(n) * inset)
        faces = grid_faces(nu + 1, nv + 1)
        ob = new_mesh_obj(name, verts, faces, smooth=True)
        recalc_normals(ob)
        # make normals face outward (+ away from the car centre)
        me = ob.data
        c = np.mean([v.co[:] for v in me.vertices], axis=0)
        avg_n = np.mean([p.normal[:] for p in me.polygons], axis=0)
        outward = c - np.array([0, -0.45, 0.6])
        if np.dot(avg_n, outward) < 0:
            recalc_normals(ob, inside=True)
        return ob

    # ---------------- side glass (side-view outlines projected on the greenhouse) ---------
    def side_dlo(self):
        """Side-view (y, z) outlines of the four door windows + quarter glass, right side."""
        Ab, At = np.array([0.800, 0.884]), np.array([-0.060, 1.283])   # A-pillar rear edge line
        Cb, Ct = np.array([-1.060, 0.896]), np.array([-0.885, 1.283])  # C-pillar front edge line
        sash = 0.026
        top = 1.283 - sash
        belt_f, belt_r = 0.893, 0.899

        def line_off(a, b, d, toward):
            t = (b - a) / np.linalg.norm(b - a)
            n = np.array([-t[1], t[0]])
            if np.dot(n, toward - a) < 0:
                n = -n
            return a + n * d, b + n * d

        def inter(p, q, z):
            t = (z - p[1]) / (q[1] - p[1])
            return p + (q - p) * t
        a0, a1 = line_off(Ab, At, sash, np.array([0.0, 1.0]))
        c0, c1 = line_off(Cb, Ct, sash, np.array([-0.5, 1.0]))
        yB_f = -0.165   # front glass rear edge (B pillar)
        yB_r = -0.228   # rear glass front edge
        sail_y = 0.600  # mirror sail panel rear edge (front glass front-bottom)
        fa_top = inter(a0, a1, top)
        fa_sail = inter(a0, a1, belt_f + 0.105)
        front = [(sail_y, belt_f), (yB_f, belt_f), (yB_f, top), (fa_top[0], top), (fa_sail[0], fa_sail[1]),
                 (sail_y, fa_sail[1] - 0.012)]
        divider = -0.795
        cb = inter(c0, c1, belt_r)
        ctp = inter(c0, c1, top)
        rear = [(yB_r, belt_r), (divider + 0.012, belt_r), (divider + 0.012, top), (yB_r, top)]
        quarter = [(divider - 0.012, belt_r), (cb[0], belt_r), (ctp[0], top), (divider - 0.012, top)]
        return dict(front=front, rear=rear, quarter=quarter, a_line=(a0, a1), c_line=(c0, c1), top=top,
                    belt=(belt_f, belt_r), yB=(yB_f, yB_r), divider=divider, sail_y=sail_y)

    def _proj_patch2d(self, name, loop, radii, inset, side, nu=24, nv=10):
        """Coons fill of a rounded quad-ish side-view loop, projected to the glass surface."""
        dense = rounded_poly_2d(loop, radii, 6)
        P = np.array(dense)
        # split into 4 sides at the 4 corners of the polygon nearest the given corner points
        corners = [np.argmin(np.linalg.norm(P - np.array(c), axis=1)) for c in self._quad_corners(loop)]
        idx = sorted(corners)
        sides = []
        for k in range(4):
            a, b = idx[k], idx[(k + 1) % 4]
            seg = P[a:b + 1] if b > a else np.vstack([P[a:], P[:b + 1]])
            sides.append(seg)
        s0 = resample(sides[0], nu + 1)
        s2 = resample(sides[2][::-1], nu + 1)
        s1 = resample(sides[1], nv + 1)
        s3 = resample(sides[3][::-1], nv + 1)
        s0 = np.hstack([s0, np.zeros((nu + 1, 1))])
        s2 = np.hstack([s2, np.zeros((nu + 1, 1))])
        s1 = np.hstack([s1, np.zeros((nv + 1, 1))])
        s3 = np.hstack([s3, np.zeros((nv + 1, 1))])
        grid = coons_patch(s0, s2, s3, s1)
        verts = []
        for i in range(nu + 1):
            for j in range(nv + 1):
                y, z = grid[i, j, 0], grid[i, j, 1]
                loc, n = self.surf_x(y, z, side)
                if loc is None:
                    loc, n = Vector((side * 0.68, y, z)), Vector((side, 0, 0))
                p = np.array(loc) - np.array(n) * inset
                verts.append(p)
        faces = grid_faces(nu + 1, nv + 1)
        ob = new_mesh_obj(name, verts, faces, smooth=True)
        recalc_normals(ob)
        me = ob.data
        avg_n = np.mean([p.normal[:] for p in me.polygons], axis=0)
        if avg_n[0] * side < 0:
            recalc_normals(ob, inside=True)
        return ob

    @staticmethod
    def _quad_corners(loop):
        L = np.array(loop)
        if len(L) == 4:
            return [tuple(p) for p in L]
        # pick the 4 extreme corners: (min y,min z), (max y, min z), (max y, max z), (min y, max z)
        c = []
        for sy, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            k = np.argmax(L[:, 0] * sy + L[:, 1] * sz * 1.5)
            c.append(tuple(L[k]))
        return c

    def build_side_glass(self):
        D = self.side_dlo()
        self.dlo = D
        names = {('front', 1): 'glass_fr', ('front', -1): 'glass_fl', ('rear', 1): 'glass_rr', ('rear', -1): 'glass_rl',
                 ('quarter', 1): 'glass_qr', ('quarter', -1): 'glass_ql'}
        for (key, side), nm in names.items():
            loop = D[key]
            ext = 0.012   # glass runs into the sash channel
            L = np.array(Ext._offset_loop(loop, ext))
            radii = [0.004] * len(L)
            if key == 'front':
                radii = [0.004, 0.004, 0.02, 0.03, 0.01, 0.004]
            if key == 'quarter':
                radii = [0.004, 0.006, 0.012, 0.004]
            inset = 0.016 if key != 'quarter' else 0.013
            ob = self._proj_patch2d(nm, [tuple(p) for p in L], radii, inset, side, nu=20 if key != 'quarter' else 10,
                                    nv=10)
            assign_mat(ob, 'glass')
            planar_uv(ob, (0, -side, 0) if side > 0 else (0, 1, 0), (0, 0, 1))
            self.objs[nm] = ob

    def build_seals(self):
        """Door sashes (window frames), belt weatherstrips, drip mouldings, mirror sails."""
        D = self.dlo
        a0, a1 = D['a_line']
        c0, c1 = D['c_line']
        top = D['top']
        for side in (1, -1):
            s = 'r' if side > 0 else 'l'
            # front door sash: from sail top along A line, top rail, down B pillar
            fa_top = self._inter(a0, a1, top)
            pathf = [D['front'][4], (fa_top[0], top), ((D['yB'][0]), top), (D['yB'][0], D['belt'][0])]
            sf = self._sash(f'sash_f{s}', pathf, side, radii=[0, 0.03, 0.015, 0])
            self.objs[sf.name] = sf
            ctp = self._inter(c0, c1, top)
            cb = self._inter(c0, c1, D['belt'][1])
            pathr = [(D['yB'][1], D['belt'][1]), (D['yB'][1], top), (ctp[0], top), (cb[0], D['belt'][1])]
            sr = self._sash(f'sash_r{s}', pathr, side, radii=[0, 0.015, 0.02, 0])
            self.objs[sr.name] = sr
            # division bar between sliding glass and quarter glass
            dv = self._sash(f'divbar_{s}', [(D['divider'], D['belt'][1]), (D['divider'], top)], side, w=0.016, radii=[0, 0])
            self.objs[dv.name] = dv
            # mirror sail (black triangle plate in the front lower corner of the front door window)
            sail = self._sail(f'sail_{s}', side)
            self.objs[sail.name] = sail
            # belt weatherstrips on each door top edge
            for key, y0, y1 in (('f', D['sail_y'] + 0.02, D['yB'][0] + 0.008), ('r', D['yB'][1] - 0.008, -1.045)):
                pts = []
                for yy in np.linspace(y0, y1, 50):
                    hit = self.bvh.ray_cast(Vector((side * 0.733, yy, 1.1)), Vector((0, 0, -1)), 1.0)
                    if hit[0] is None:
                        continue
                    pts.append(np.array(hit[0]) + np.array([0, 0, 0.002]))
                if len(pts) > 3:
                    P = np.array(pts)
                    prof = [(0.0, -0.004), (0.003, -0.0035), (0.0055, -0.001), (0.0055, 0.002), (0.003, 0.0045),
                            (0.0, 0.005)]
                    nn = np.tile(np.array([0, 0, 1.0]), (len(P), 1))
                    w = sweep(f'beltstrip_{key}{s}', P, [(a, b * side) for a, b in prof][::(1 if side > 0 else -1)],
                              closed_profile=False, normals=nn, cap=False)
                    assign_mat(w, 'rubber')
                    self.objs[w.name] = w
            # drip moulding along the roof rail over both doors
            pts = []
            for yy in np.linspace(fa_top[0] + 0.02, ctp[0] - 0.02, 70):
                loc, n = self.surf_x(yy, 1.287, side)
                if loc is not None:
                    pts.append(np.array(loc))
            P = np.array(pts)
            prof = [(-0.002, -0.006), (0.004, -0.005), (0.006, 0.0), (0.004, 0.006), (-0.002, 0.007)]
            nn = np.tile(np.array([side, 0, 0.35]), (len(P), 1))
            dm = sweep(f'drip_{s}', P, prof if side > 0 else [(a, -b) for a, b in prof][::-1],
                       closed_profile=False, normals=nn, cap=True)
            assign_mat(dm, 'rubber')
            self.objs[dm.name] = dm

    @staticmethod
    def _inter(p, q, z):
        t = (z - p[1]) / (q[1] - p[1])
        return p + (q - p) * t

    def _sash(self, name, path2d, side, w=0.026, depth=0.020, radii=None):
        """Window frame channel swept along a side-view path, outer face flush with the surface."""
        dense = []
        P2 = [np.array(p, float) for p in path2d]
        # fillet the corners
        pts = []
        n = len(P2)
        for i in range(n):
            r = (radii[i] if radii else 0.0)
            if 0 < i < n - 1 and r > 0:
                a, b, c = P2[i - 1], P2[i], P2[i + 1]
                u = (a - b) / np.linalg.norm(a - b)
                v = (c - b) / np.linalg.norm(c - b)
                ang = math.acos(clamp(float(np.dot(u, v)), -1, 1))
                d = r / math.tan(ang / 2)
                p0, p1 = b + u * d, b + v * d
                for k in range(9):
                    t = k / 8
                    q = (1 - t) ** 2 * p0 + 2 * (1 - t) * t * b + t * t * p1
                    pts.append(q)
            else:
                pts.append(P2[i])
        L = np.array(pts)
        L = resample(L, max(8, int(sum(np.linalg.norm(np.diff(L, axis=0), axis=1)) / 0.025)))
        path, nrm = [], []
        for y, z in L:
            loc, nn = self.surf_x(y, z, side)
            if loc is None:
                loc, nn = Vector((side * 0.66, y, z)), Vector((side, 0, 0))
            path.append(np.array(loc))
            nrm.append(np.array(nn))
        prof = [(0.0005, -w / 2 + 0.003), (0.0, -w / 2 + 0.0005), (-0.003, -w / 2), (-depth, -w / 2),
                (-depth, w / 2), (-0.003, w / 2), (0.0, w / 2 - 0.0005), (0.0005, w / 2 - 0.003)]
        ob = sweep(name, np.array(path), prof, closed_profile=True, normals=np.array(nrm), cap=True)
        assign_mat(ob, 'plastic_black')
        return ob

    def _sail(self, name, side):
        D = self.dlo
        a0, a1 = D['a_line']
        bf = D['belt'][0]
        tip = self._inter(a0, a1, bf + 0.105)
        tri = [(D['sail_y'] + 0.012, bf - 0.004), (self._inter(a0, a1, bf)[0] - 0.004, bf - 0.004),
               (tip[0] - 0.004, tip[1] + 0.006), (D['sail_y'] + 0.012, tip[1] - 0.004)]
        dense = rounded_poly_2d(tri, [0.003, 0.004, 0.006, 0.004], 4)
        verts, faces = [], []
        P = np.array(dense)
        ctr = P.mean(axis=0)
        for y, z in list(P) + [ctr]:
            loc, n = self.surf_x(y, z, side)
            if loc is None:
                loc, n = Vector((side * 0.68, y, z)), Vector((side, 0, 0))
            verts.append(np.array(loc) + np.array(n) * 0.0015)
        m = len(P)
        for i in range(m):
            faces.append((i, (i + 1) % m, m))
        ob = new_mesh_obj(name, verts, faces, smooth=True)
        recalc_normals(ob)
        if np.mean([p.normal[0] for p in ob.data.polygons]) * side < 0:
            recalc_normals(ob, inside=True)
        vlib.add_solidify(ob, 0.004, offset=-1)
        apply_modifiers(ob)
        assign_mat(ob, 'plastic_black')
        return ob
