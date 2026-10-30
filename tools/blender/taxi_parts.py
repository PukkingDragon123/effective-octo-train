# Taxi exterior detail parts: lamps (housing, reflector bowl, bulb, fluted lens), grille with
# an original fictional badge, bumper inserts, plate holders, mirrors, door handles, keyholes,
# side mouldings, fuel filler, wipers, wheels (tyre with tread, steel rim, vented hubcap),
# roof TAXI-METER sign on a gutter rack, antenna, mud flaps, exhaust, underbody, wells, tubs.
import math
import numpy as np
import bpy
import bmesh
from mathutils import Vector, Matrix
import vlib
from vlib import (V, log, new_mesh_obj, grid_faces, sweep, lathe, tube, box, extrude_outline, resample,
                  rounded_poly_2d, rounded_rect_2d, rrect_profile, circle_profile, assign_mat, set_mats, mat, join,
                  lerp, clamp, smoothstep, recalc_normals, add_bevel, apply_modifiers, set_sharp_by_angle,
                  add_weighted_normals, finish_hard, add_solidify, planar_uv, delete, boolean, duplicate)
import taxi_body as tb


def _flip_if(ob, cond):
    if cond:
        recalc_normals(ob, inside=True)


def orient_out(ob, ref_dir):
    """Make face normals point along ref_dir on average."""
    me = ob.data
    if not len(me.polygons):
        return ob
    n = np.mean([p.normal[:] for p in me.polygons], axis=0)
    if np.dot(n, ref_dir) < 0:
        recalc_normals(ob, inside=True)
    return ob


class Parts:
    def __init__(self, E):
        self.E = E
        self.objs = {}

    # ---------------------------------------------------------------------------------
    # surface grids in W parameter space
    # ---------------------------------------------------------------------------------
    def wgrid(self, name, fn, s0, s1, t0, t1, ns, nt, inset, disp=None, t0f=None, t1f=None):
        """Grid over (s, t) on the body surface, pushed `inset` along -normal (+disp(i,j,s,t))."""
        E = self.E
        verts = []
        for i in range(ns + 1):
            s = lerp(s0, s1, i / ns)
            a = t0f(s) if t0f else t0
            b = t1f(s) if t1f else t1
            for j in range(nt + 1):
                t = lerp(a, b, j / nt)
                p = fn(s, t)
                loc, n = E.nearest(p)
                d = inset + (disp(i, j, s, t) if disp else 0.0)
                verts.append(np.array(loc) - np.array(n) * d)
        ob = new_mesh_obj(name, verts, grid_faces(ns + 1, nt + 1), smooth=True)
        return ob

    def frame_at(self, fn, s, t):
        """(point, normal, tangent_s, tangent_t) on the surface at (s, t)."""
        E = self.E
        p = np.array(fn(s, t))
        ps = np.array(fn(s + 0.004, t)) - np.array(fn(s - 0.004, t))
        pt = np.array(fn(s, t + 0.02)) - np.array(fn(s, t - 0.02))
        loc, n = E.nearest(p)
        n = np.array(n)
        ts = ps / np.linalg.norm(ps)
        tt = pt - n * np.dot(pt, n)
        tt /= np.linalg.norm(tt)
        return np.array(loc), n, ts, tt

    def housing_behind(self, name, lens, depth, shrink=0.85, mat_in='chrome', mat_out='paint_black'):
        """Closed housing behind a lens grid: walls from the lens rim back to a smaller back plate."""
        me = lens.data
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.normal_update()
        loops = vlib.boundary_loops(bm)
        loop = max(loops, key=lambda l: len(l[0]))[0]
        P = np.array([v.co[:] for v in loop])
        N = np.array([v.normal[:] for v in loop])
        bm.free()
        c = P.mean(axis=0)
        nav = N.mean(axis=0)
        nav /= np.linalg.norm(nav)
        back = c + (P - c) * shrink - nav * depth
        mid = c + (P - c) * (0.5 + shrink * 0.5) - nav * depth * 0.6
        n = len(P)
        verts = list(P - nav * 0.001) + list(mid) + list(back) + [c - nav * depth * 1.02]
        faces = []
        for k in range(2):
            for i in range(n):
                j = (i + 1) % n
                faces.append((k * n + i, k * n + j, (k + 1) * n + j, (k + 1) * n + i))
        for i in range(n):
            faces.append((2 * n + i, 2 * n + (i + 1) % n, 3 * n))
        ob = new_mesh_obj(name, verts, faces, smooth=True)
        recalc_normals(ob)
        # normals must face the lens (inward-looking housing)
        me = ob.data
        cen = np.mean([v.co[:] for v in me.vertices], axis=0)
        avg = np.mean([np.dot(np.array(p.normal[:]), (c - np.array(p.center[:]))) for p in me.polygons])
        if avg < 0:
            recalc_normals(ob, inside=True)
        assign_mat(ob, mat_in)
        return ob

    # ---------------------------------------------------------------------------------
    def build(self):
        self.front_lamps_and_grille()
        self.front_bumper_inserts()
        self.rear_lamps()
        self.plates_and_exhaust()
        self.mirrors()
        self.handles_and_mouldings()
        self.fuel_filler()
        self.wipers()
        self.wheels()
        self.roof_sign()
        self.antenna_and_flaps()
        self.underbody()
        return self.objs

    # ---------------------------------------------------------------------------------
    # front: headlights, corner lamps, grille, badge
    # ---------------------------------------------------------------------------------
    def front_lamps_and_grille(self):
        E = self.E
        W = E.W
        ue = E.front_band['ue']
        u_in = E.u_at_x_front(0.405)
        u_cnr = E.u_at_x_front(0.745)
        tb_f, tt_f = E.tb_front, E.tt_front
        for side in (1, -1):
            sfx = 'r' if side > 0 else 'l'
            s0, s1 = (u_in, u_cnr - 0.004) if side > 0 else (-(u_cnr - 0.004), -u_in)

            def flute(i, j, s, t, s0=s0):
                ph = (abs(s) - u_in) * 260.0
                tri = abs((ph % 1.0) - 0.5) * 2.0
                hz = abs(((t - 7.0) * 9.0) % 1.0 - 0.5) * 2.0
                return -0.0006 * tri - 0.00025 * hz
            lens = self.wgrid(f'light_head_{sfx}', W, s0, s1, 0, 0, 64, 10, 0.004, disp=flute,
                              t0f=lambda s: tb_f(s) - 0.12, t1f=lambda s: tt_f(s) + 0.10)
            orient_out(lens, np.array([0, 1, 0]))
            assign_mat(lens, 'lens_clear')
            self.objs[lens.name] = lens
            # corner (parking) lamp lens, separate segment of the same unit
            c0, c1 = (u_cnr + 0.004, ue) if side > 0 else (-ue, -(u_cnr + 0.004))
            cl = self.wgrid(f'lamp_corner_{sfx}', W, c0, c1, 0, 0, 14, 8, 0.004,
                            disp=lambda i, j, s, t: -0.0005 * (abs(((t - 7) * 12) % 1 - 0.5) * 2),
                            t0f=lambda s: tb_f(s) - 0.12, t1f=lambda s: tt_f(s) + 0.10)
            orient_out(cl, np.array([side, 1, 0]))
            assign_mat(cl, 'lens_clear')
            # housing + reflector + bulb
            hz = self.housing_behind(f'head_housing_{sfx}', lens, 0.085, shrink=0.8, mat_in='chrome')
            cz = self.housing_behind(f'corner_housing_{sfx}', cl, 0.05, shrink=0.75, mat_in='chrome')
            sm = 0.5 * (s0 + s1)
            tm = 0.5 * (tb_f(sm) + tt_f(sm))
            p, n, ts, tt = self.frame_at(W, sm, tm)
            refl = self.reflector(f'head_refl_{sfx}', p - n * 0.012, -n, ts, tt, 0.135, 0.058, 0.08)
            bulb = self.bulb(f'head_bulb_{sfx}', p - n * 0.072, -n, 0.011, 0.034, amber=False)
            # divider bar between headlamp and corner lamp
            pd, nd, tsd, ttd = self.frame_at(W, side * u_cnr, tm)
            path = [np.array(W(side * u_cnr, t)) for t in np.linspace(tb_f(side * u_cnr) - 0.05, tt_f(side * u_cnr) + 0.05, 10)]
            path = [np.array(E.nearest(q)[0]) - np.array(E.nearest(q)[1]) * 0.003 for q in path]
            div = sweep(f'head_div_{sfx}', np.array(path), rrect_profile(0.006, 0.007, 0.002, 2),
                        normals=np.tile(nd, (len(path), 1)), cap=True)
            assign_mat(div, 'plastic_black')
            sc = 0.5 * (c0 + c1)
            tcm = 0.5 * (tb_f(sc) + tt_f(sc))
            pc, ncn, _, _ = self.frame_at(W, sc, tcm)
            cbulb = self.bulb(f'corner_bulb_{sfx}', pc - ncn * 0.035, -ncn, 0.008, 0.022, amber=True)
            unit = join([cl, hz, cz, refl, bulb, div, cbulb], name=f'headlamp_unit_{sfx}')
            self.objs[unit.name] = unit
        # ---- grille -----------------------------------------------------------------------
        u_g = E.u_at_x_front(0.398)
        gb = self.wgrid('grille_back', W, -u_g, u_g, 0, 0, 30, 4, 0.045, t0f=lambda s: tb_f(s) - 0.15,
                        t1f=lambda s: tt_f(s) + 0.12)
        orient_out(gb, np.array([0, 1, 0]))
        assign_mat(gb, 'plastic_black')
        parts = [gb]
        # vertical slats (dark mesh look)
        for k in range(-10, 11):
            s = (k / 10.5) * u_g
            pts = []
            for t in np.linspace(tb_f(s) - 0.02, tt_f(s) + 0.02, 6):
                loc, n = E.nearest(W(s, t))
                pts.append(np.array(loc) - np.array(n) * 0.028)
            nn = E.nearest(W(s, 8.0))[1]
            sl = sweep(f'gslat{k}', np.array(pts), [(-0.012, -0.0012), (0.012, -0.0012), (0.012, 0.0012), (-0.012, 0.0012)],
                       normals=np.tile(np.array(nn), (len(pts), 1)), cap=True, smooth=False)
            parts.append(sl)
        slats = join(parts[1:], name='grille_slats')
        assign_mat(slats, 'plastic_black')
        # chrome horizontal bars + frame
        bars = []
        for t in (7.62, 8.02, 8.42):
            pts = []
            for s in np.linspace(-u_g * 0.985, u_g * 0.985, 40):
                loc, n = E.nearest(W(s, t))
                pts.append(np.array(loc) - np.array(n) * 0.006)
            P = np.array(pts)
            nn = np.array([E.nearest(q)[1] for q in P])
            h = 0.0105 if t == 8.02 else 0.0085
            prof = [(-0.008, -h / 2), (0.0, -h / 2), (0.003, -h / 2 + 0.002), (0.0042, 0.0), (0.003, h / 2 - 0.002),
                    (0.0, h / 2), (-0.008, h / 2)]
            bars.append(sweep('gbar', P, prof, normals=nn, cap=True))
        # frame
        frame_pts = []
        n_side = 6
        for s in np.linspace(-u_g, u_g, 44):
            frame_pts.append((s, tb_f(s) - 0.04))
        for t in np.linspace(tb_f(u_g) - 0.04, tt_f(u_g) + 0.03, n_side)[1:]:
            frame_pts.append((u_g, t))
        for s in np.linspace(u_g, -u_g, 44)[1:]:
            frame_pts.append((s, tt_f(s) + 0.03))
        for t in np.linspace(tt_f(-u_g) + 0.03, tb_f(-u_g) - 0.04, n_side)[1:-1]:
            frame_pts.append((-u_g, t))
        P = np.array([np.array(E.nearest(W(s, t))[0]) - np.array(E.nearest(W(s, t))[1]) * 0.004 for s, t in frame_pts])
        P = resample(np.vstack([P, P[:1]]), 80)[:-1]
        nn = np.array([E.nearest(q)[1] for q in P])
        frame = sweep('grille_frame', P, circle_profile(0.0048, 6, ry=0.0042), normals=nn, closed_path=True)
        chrome = join(bars + [frame], name='grille_chrome')
        assign_mat(chrome, 'chrome')
        # fictional badge: chrome oval ring with a stylised rising-sun-over-road mark
        p, n, ts, tt = self.frame_at(W, 0.0, 8.02)
        badge = self.badge('grille_badge', p + n * 0.003, n, ts, tt, 0.046, 0.031)
        grille = join([gb, slats, chrome, badge], name='grille')
        self.objs['grille'] = grille
        # radiator-support shadow plate behind the whole band
        back = self.wgrid('band_back', W, -ue, ue, 0, 0, 40, 3, 0.11, t0f=lambda s: tb_f(s) - 0.2,
                          t1f=lambda s: tt_f(s) + 0.2)
        orient_out(back, np.array([0, 1, 0]))
        assign_mat(back, 'plastic_black')
        self.objs['band_back'] = back

    def reflector(self, name, origin, axis, tx, ty, hw, hh, depth, f=None, nx=20, ny=10):
        """Rectangular paraboloid reflector bowl opening along -axis (toward the lens)."""
        axis = np.array(axis) / np.linalg.norm(axis)
        tx = np.array(tx) - axis * np.dot(tx, axis)
        tx /= np.linalg.norm(tx)
        ty = np.cross(axis, tx)
        if f is None:
            f = (hw * hw + hh * hh) / (4 * depth)
        verts = []
        for i in range(nx + 1):
            a = lerp(-hw, hw, i / nx)
            for j in range(ny + 1):
                b = lerp(-hh, hh, j / ny)
                z = (a * a + b * b) / (4 * f)
                verts.append(origin + tx * a + ty * b + axis * (depth - z))
        ob = new_mesh_obj(name, verts, grid_faces(nx + 1, ny + 1), smooth=True)
        orient_out(ob, -axis)
        assign_mat(ob, 'chrome')
        return ob

    def bulb(self, name, base, axis, r, length, amber=False):
        """Lathe bulb: metal socket + glass envelope + cap, axis pointing toward the lens."""
        axis = np.array(axis) / np.linalg.norm(axis)
        prof_metal = [(0.0, 0.0), (r * 1.25, 0.0), (r * 1.25, 0.006), (r * 0.95, 0.008), (r * 0.95, 0.012)]
        prof_glass = [(r * 0.9, 0.012), (r, 0.016), (r, length - r * 0.8), (r * 0.7, length - 0.15 * r),
                      (0.0, length)]
        m1 = lathe(name + '_m', prof_metal, segments=16, mat=mat('metal_steel'))
        m2 = lathe(name + '_g', prof_glass, segments=16, mat=mat('lens_amber' if amber else 'lens_clear'))
        ob = join([m1, m2], name=name)
        q = Vector((0, 0, 1)).rotation_difference(Vector(axis))
        ob.data.transform(Matrix.Translation(Vector(base)) @ q.to_matrix().to_4x4())
        return ob

    def badge(self, name, p, n, ts, tt, rx, ry):
        """Original fictional emblem: oval chrome ring around a stylised lotus bud."""
        ring_path = []
        for k in range(48):
            a = 2 * math.pi * k / 48
            ring_path.append(p + ts * rx * math.cos(a) + tt * ry * math.sin(a))
        ring = sweep(name + '_ring', np.array(ring_path), circle_profile(0.0032, 6, rx=0.0026),
                     normals=np.tile(n, (48, 1)), closed_path=True)
        # lotus bud: three petals (lens-shaped) made from lofted ovals
        petals = []
        for ang in (-35, 0, 35):
            a = math.radians(ang)
            d = ts * math.sin(a) + tt * math.cos(a)
            w = np.cross(n, d)
            pts = []
            for k in range(24):
                u = 2 * math.pi * k / 24
                L = ry * (0.78 if ang == 0 else 0.62)
                pts.append(p - tt * ry * 0.45 + d * (L * 0.5 * (1 - math.cos(u))) + w * (0.0065 * math.sin(u)))
            prof = [(0.0, -0.0012), (0.0016, 0.0), (0.0, 0.0012)]
            petals.append(sweep(name + '_p', np.array(pts), circle_profile(0.0016, 6), normals=np.tile(n, (24, 1)),
                                closed_path=True))
        base = []
        for k in range(20):
            a = math.pi * k / 19
            base.append(p - tt * ry * 0.55 + ts * rx * 0.55 * math.cos(a) * 1.0 - tt * ry * 0.12 * math.sin(a))
        bl = sweep(name + '_b', np.array(base), circle_profile(0.0018, 6), normals=np.tile(n, (20, 1)), cap=True)
        ob = join([ring] + petals + [bl], name=name)
        assign_mat(ob, 'chrome')
        return ob

    # ---------------------------------------------------------------------------------
    def front_bumper_inserts(self):
        E = self.E
        W = E.W
        sl = E.slot
        # slot: black insert with two slats
        back = self.wgrid('slot_back', W, -sl['u'], sl['u'], sl['t0'] - 0.25, sl['t1'] + 0.25, 30, 3, 0.03)
        orient_out(back, np.array([0, 1, 0]))
        parts = [back]
        for t in (sl['t0'] + 0.33 * (sl['t1'] - sl['t0']), sl['t0'] + 0.66 * (sl['t1'] - sl['t0'])):
            pts = [np.array(E.nearest(W(s, t))[0]) - np.array(E.nearest(W(s, t))[1]) * 0.012
                   for s in np.linspace(-sl['u'] * 0.99, sl['u'] * 0.99, 40)]
            nn = np.array([E.nearest(q)[1] for q in pts])
            parts.append(sweep('slotslat', np.array(pts), rrect_profile(0.018, 0.006, 0.002, 2), normals=nn, cap=True))
        lo = E.lower_intake
        back2 = self.wgrid('lowint_back', W, -lo['u'], lo['u'], lo['t0'] - 0.2, lo['t1'] + 0.2, 24, 3, 0.03)
        orient_out(back2, np.array([0, 1, 0]))
        parts.append(back2)
        for k in range(-9, 10):
            s = k / 9.5 * lo['u']
            pts = [np.array(E.nearest(W(s, t))[0]) - np.array(E.nearest(W(s, t))[1]) * 0.016
                   for t in np.linspace(lo['t0'] - 0.05, lo['t1'] + 0.05, 4)]
            nn = np.array([E.nearest(q)[1] for q in pts])
            parts.append(sweep('lislat', np.array(pts), [(-0.014, -0.0015), (0.014, -0.0015), (0.014, 0.0015),
                                                        (-0.014, 0.0015)], normals=nn, cap=True, smooth=False))
        ins = join(parts, name='bumper_inserts')
        assign_mat(ins, 'plastic_black')
        self.objs['bumper_inserts'] = ins
        # front indicators (amber, ribbed)
        for side in (1, -1):
            sfx = 'r' if side > 0 else 'l'
            a, b = (sl['ui0'], sl['ui1']) if side > 0 else (-sl['ui1'], -sl['ui0'])
            lens = self.wgrid(f'light_ind_f{sfx}', W, a - 0.004 * side, b + 0.004 * side, 0, 0, 16, 6, 0.003,
                              disp=lambda i, j, s, t: -0.0006 * abs(((t * 16) % 1) - 0.5) * 2,
                              t0f=lambda s: E.t_at_z(abs(s), 0.380), t1f=lambda s: E.t_at_z(abs(s), 0.458))
            orient_out(lens, np.array([side * 0.5, 1, 0]))
            assign_mat(lens, 'lens_amber')
            self.objs[lens.name] = lens
            h = self.housing_behind(f'ind_housing_f{sfx}', lens, 0.035, shrink=0.8, mat_in='chrome')
            sm = 0.5 * (a + b)
            p, n, ts, tt = self.frame_at(W, sm, 0.5 * (E.t_at_z(abs(sm), 0.38) + E.t_at_z(abs(sm), 0.458)))
            bl = self.bulb(f'ind_bulb_f{sfx}', p - n * 0.03, -n, 0.007, 0.02, amber=True)
            self.objs[f'ind_unit_f{sfx}'] = join([h, bl], name=f'ind_unit_f{sfx}')

    # ---------------------------------------------------------------------------------
    def rear_lamps(self):
        E = self.E
        Wr = E.Wr
        se = E.rear_band['se']
        s_in = E.s_at_x_rear(0.468)
        s_rev = E.s_at_x_rear(0.585)
        tb_r, tt_r = E.tb_rear, E.tt_rear

        def tmid(s, f):
            return lerp(tb_r(s) - 0.1, tt_r(s) + 0.1, f)
        rib = lambda i, j, s, t: -0.0005 * abs(((t * 10) % 1) - 0.5) * 2 - 0.0003 * abs(((abs(s) * 180) % 1) - 0.5) * 2
        lum = {}
        for side in (1, -1):
            sfx = 'r' if side > 0 else 'l'
            sg = lambda a, b: (a, b) if side > 0 else (-b, -a)
            # amber indicator strip (top)
            a, b = sg(s_in, se)
            ind = self.wgrid(f'light_ind_r{sfx}', Wr, a, b, 0, 0, 30, 3, 0.004, disp=rib,
                             t0f=lambda s: tmid(s, 0.70), t1f=lambda s: tmid(s, 1.0))
            orient_out(ind, np.array([0, -1, 0]))
            assign_mat(ind, 'lens_amber')
            self.objs[ind.name] = ind
            tail = self.wgrid(f'light_tail_{sfx}', Wr, a, b, 0, 0, 30, 4, 0.004, disp=rib,
                              t0f=lambda s: tmid(s, 0.36), t1f=lambda s: tmid(s, 0.70))
            orient_out(tail, np.array([0, -1, 0]))
            assign_mat(tail, 'lens_red')
            self.objs[tail.name] = tail
            a2, b2 = sg(s_rev, se)
            brk = self.wgrid(f'brake_{sfx}', Wr, a2, b2, 0, 0, 22, 3, 0.004, disp=rib,
                             t0f=lambda s: tmid(s, 0.0), t1f=lambda s: tmid(s, 0.36))
            orient_out(brk, np.array([0, -1, 0]))
            assign_mat(brk, 'lens_red')
            lum.setdefault('brake', []).append(brk)
            a3, b3 = sg(s_in, s_rev)
            rev = self.wgrid(f'reverse_{sfx}', Wr, a3, b3, 0, 0, 8, 3, 0.004, disp=rib,
                             t0f=lambda s: tmid(s, 0.0), t1f=lambda s: tmid(s, 0.36))
            orient_out(rev, np.array([0, -1, 0]))
            assign_mat(rev, 'lens_clear')
            lum.setdefault('reverse', []).append(rev)
            # housing behind the whole outer unit
            whole = self.wgrid('tmp_whole', Wr, a, b, 0, 0, 20, 4, 0.004, t0f=lambda s: tmid(s, 0.0),
                               t1f=lambda s: tmid(s, 1.0))
            h = self.housing_behind(f'tail_housing_{sfx}', whole, 0.06, shrink=0.8, mat_in='chrome')
            delete(whole)
            # segment dividers (black lines between lens zones)
            divs = []
            for f in (0.36, 0.70):
                pts = [np.array(E.nearest(Wr(s, tmid(s, f)))[0]) - np.array(E.nearest(Wr(s, tmid(s, f)))[1]) * 0.0025
                       for s in np.linspace(a, b, 24)]
                nn = np.array([E.nearest(q)[1] for q in pts])
                divs.append(sweep('tdiv', np.array(pts), rrect_profile(0.005, 0.004, 0.0015, 2), normals=nn, cap=True))
            pts = [np.array(E.nearest(Wr(side * s_rev, tmid(side * s_rev, f)))[0]) for f in np.linspace(0, 0.36, 6)]
            pts = [q - np.array(E.nearest(q)[1]) * 0.0025 for q in pts]
            nn = np.array([E.nearest(q)[1] for q in pts])
            divs.append(sweep('tdiv', np.array(pts), rrect_profile(0.005, 0.004, 0.0015, 2), normals=nn, cap=True))
            dv = join(divs, name=f'tail_div_{sfx}')
            assign_mat(dv, 'plastic_black')
            # small cup reflectors behind each zone
            cups = []
            for f, ss in ((0.85, 0.5), (0.53, 0.5), (0.18, 0.7)):
                sm = lerp(a, b, ss)
                p, n, ts, tt = self.frame_at(Wr, sm, tmid(sm, f))
                cups.append(self.bulb('tbulb', p - n * 0.04, -n, 0.006, 0.018))
            self.objs[f'tail_unit_{sfx}'] = join([h, dv] + cups, name=f'tail_unit_{sfx}')
        lb = join(lum['brake'], name='light_brake')
        lr = join(lum['reverse'], name='light_reverse')
        self.objs['light_brake'] = lb
        self.objs['light_reverse'] = lr
        # centre garnish (static reflector: amber strip over dark red, with a groove)
        g_up = self.wgrid('garnish_up', Wr, -s_in + 0.003, s_in - 0.003, 0, 0, 40, 3, 0.004,
                          t0f=lambda s: tmid(s, 0.70), t1f=lambda s: tmid(s, 1.0))
        orient_out(g_up, np.array([0, -1, 0]))
        assign_mat(g_up, 'lens_amber')
        g_lo = self.wgrid('garnish_lo', Wr, -s_in + 0.003, s_in - 0.003, 0, 0, 40, 6, 0.004,
                          disp=lambda i, j, s, t: -0.0004 * abs(((t * 14) % 1) - 0.5) * 2,
                          t0f=lambda s: tmid(s, 0.0), t1f=lambda s: tmid(s, 0.70))
        orient_out(g_lo, np.array([0, -1, 0]))
        assign_mat(g_lo, 'lens_red')
        gb = self.wgrid('garnish_back', Wr, -s_in, s_in, 0, 0, 20, 2, 0.03, t0f=lambda s: tmid(s, -0.1),
                        t1f=lambda s: tmid(s, 1.1))
        orient_out(gb, np.array([0, -1, 0]))
        assign_mat(gb, 'paint_black')
        # keyhole on the garnish (right side)
        p, n, ts, tt = self.frame_at(Wr, E.s_at_x_rear(0.30), tmid(E.s_at_x_rear(0.30), 0.84))
        kh = self.keyhole('trunk_keyhole', p, n, tt)
        self.objs['garnish'] = join([g_up, g_lo, gb, kh], name='garnish')
        # rear band dark backing
        back = self.wgrid('rband_back', Wr, -se, se, 0, 0, 40, 3, 0.09, t0f=lambda s: tb_r(s) - 0.2,
                          t1f=lambda s: tt_r(s) + 0.2)
        orient_out(back, np.array([0, -1, 0]))
        assign_mat(back, 'paint_black')
        self.objs['rband_back'] = back

    def keyhole(self, name, p, n, up):
        n = np.array(n) / np.linalg.norm(n)
        cyl = lathe(name + '_c', [(0.0, 0.0), (0.0085, 0.0), (0.0095, 0.0015), (0.0085, 0.004), (0.0, 0.0042)],
                    segments=24, mat=mat('chrome'))
        slot = box(name + '_s', (0.0018, 0.009, 0.0016), center=(0, 0, 0.0045), mat=mat('paint_black'))
        ob = join([cyl, slot], name=name)
        q = Vector((0, 0, 1)).rotation_difference(Vector(n))
        m = Matrix.Translation(Vector(p)) @ q.to_matrix().to_4x4()
        ob.data.transform(m)
        return ob

    # ---------------------------------------------------------------------------------
    def plates_and_exhaust(self):
        E = self.E
        # front plate on a black holder at the bumper centre
        tz = E.t_at_z(0.0, 0.302)
        p, n, ts, tt = self.frame_at(E.W, 0.0, tz)
        n = np.array([0, 1.0, -0.06])
        n /= np.linalg.norm(n)
        self.objs.update(self.plate('plate_front', p + n * 0.010, n, np.array([1, 0, 0])))
        tz = E.t_at_z(2.999, 0.455)
        pr = np.array(tb.W_eval(3.0, tz))
        loc, nr = E.nearest(pr)
        nr = np.array([0, -1.0, -0.03])
        nr /= np.linalg.norm(nr)
        self.objs.update(self.plate('plate_rear', np.array(loc) + nr * 0.008, nr, np.array([-1, 0, 0])))
        # exhaust (right rear, under the bumper), with a slash-cut tip
        path = [np.array([0.42, -1.55, 0.205]), np.array([0.44, -1.80, 0.205]), np.array([0.455, -2.0, 0.21]),
                np.array([0.46, -2.13, 0.215])]
        path = resample(np.array(path), 16)
        pipe = sweep('exhaust_pipe', path, circle_profile(0.022, 20), cap=False)
        tip = lathe('exhaust_tip', [(0.024, -0.12), (0.028, -0.11), (0.028, 0.0), (0.0245, 0.003), (0.0215, -0.06)],
                    segments=24, axis='Y', center=(0.46, -2.13, 0.215))
        ex = join([pipe, tip], name='exhaust')
        assign_mat(ex, 'metal_steel')
        self.objs['exhaust'] = ex

    def plate(self, name, center, n, right):
        """Plate holder (black) + plate display quad with clean 0..1 UVs."""
        n = np.array(n) / np.linalg.norm(n)
        right = np.array(right) - n * np.dot(right, n)
        right /= np.linalg.norm(right)
        up = np.cross(n, right)
        w, h = 0.34, 0.15
        hold = rounded_rect_2d(-w / 2 - 0.012, -h / 2 - 0.012, w / 2 + 0.012, h / 2 + 0.012, 0.012, 4)
        hb = extrude_outline(name + '_holder', hold, -0.012, 0.0, plane='XY', mat=mat('plastic_black'))
        add_bevel(hb, 0.002, 2, angle=30)
        apply_modifiers(hb)
        set_sharp_by_angle(hb, 35)
        M = Matrix(((right[0], up[0], n[0], center[0]), (right[1], up[1], n[1], center[1]),
                    (right[2], up[2], n[2], center[2]), (0, 0, 0, 1)))
        hb.data.transform(M)
        hb.name = name + '_holder'
        verts = [center - right * w / 2 - up * h / 2 + n * 0.002, center + right * w / 2 - up * h / 2 + n * 0.002,
                 center + right * w / 2 + up * h / 2 + n * 0.002, center - right * w / 2 + up * h / 2 + n * 0.002]
        q = new_mesh_obj(name, verts, [(0, 1, 2, 3)], smooth=False,
                         uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])
        assign_mat(q, 'plate')
        # embossed rim on the plate (a thin raised border)
        rim_path = [center + right * a + up * b + n * 0.0025 for a, b in rounded_rect_2d(-w / 2 + 0.006, -h / 2 + 0.006,
                                                                                        w / 2 - 0.006, h / 2 - 0.006, 0.008, 3)]
        rim = sweep(name + '_rim', np.array(rim_path), circle_profile(0.0012, 6), normals=np.tile(n, (len(rim_path), 1)),
                    closed_path=True)
        assign_mat(rim, 'plate')
        bolts = []
        for a in (-0.11, 0.11):
            b = lathe('bolt', [(0, 0.0), (0.006, 0.0), (0.0062, 0.0015), (0.004, 0.003), (0.0, 0.0032)], segments=12)
            b.data.transform(Matrix.Translation(Vector(center + right * a + up * 0.052 + n * 0.0022)) @
                             Vector((0, 0, 1)).rotation_difference(Vector(n)).to_matrix().to_4x4())
            bolts.append(b)
        bb = join(bolts, name=name + '_bolts')
        assign_mat(bb, 'metal_steel')
        holder = join([hb, rim, bb], name=name + '_holder')
        return {name: q, name + '_holder': holder}

    # ---------------------------------------------------------------------------------
    def mirrors(self):
        E = self.E
        D = E.dlo
        for side in (1, -1):
            sfx = 'r' if side > 0 else 'l'
            # sail centre
            ys, zs = D['sail_y'] + 0.06, D['belt'][0] + 0.045
            loc, n = E.surf_x(ys, zs, side)
            base = np.array(loc)
            head_c = base + np.array([side * 0.115, 0.012, 0.055])
            W_, H_, Dp = 0.175, 0.102, 0.072
            # face outline (superellipse) in local (lateral, up)
            secs = []
            nsec = 40
            prof = []
            for k in range(nsec):
                a = 2 * math.pi * k / nsec
                c, s = math.cos(a), math.sin(a)
                x = W_ / 2 * np.sign(c) * abs(c) ** (2 / 4.0)
                z = H_ / 2 * np.sign(s) * abs(s) ** (2 / 4.0)
                prof.append((x, z))
            # loft along +Y (forward): rim at y=0 (rear face), dome to the front
            stations = [(0.0, 1.0, 0.0), (0.004, 1.012, 0.0), (0.014, 1.012, 0.0), (0.03, 0.985, 0.004),
                        (0.048, 0.92, 0.008), (0.062, 0.78, 0.012), (0.070, 0.52, 0.016), (0.0735, 0.0, 0.018)]
            verts = []
            for dy, sc, lift in stations:
                for x, z in prof:
                    verts.append((x * sc, dy, z * sc + lift))
            faces = grid_faces(len(stations), nsec, closed_v=True)
            # inner cup (the glass recess) from rim inward
            rim_in = [(0.0, 0.94, 0.0), (0.010, 0.93, 0.0)]
            base_i = len(verts)
            for dy, sc, lift in rim_in:
                for x, z in prof:
                    verts.append((x * sc, dy, z * sc))
            faces += [(base_i + i + j * nsec, base_i + (i + 1) % nsec + j * nsec,
                       base_i + (i + 1) % nsec + (j + 1) * nsec, base_i + i + (j + 1) * nsec)
                      for j in range(1) for i in range(nsec)]
            # connect outer rim (station 0) to inner rim 0
            faces += [(i, (i + 1) % nsec, base_i + (i + 1) % nsec, base_i + i) for i in range(nsec)]
            housing = new_mesh_obj(f'mirror_housing_{sfx}', verts, faces, smooth=True)
            recalc_normals(housing)
            # glass (flat reflector quad-ish disc) recessed in the cup
            gl_verts = [(x * 0.925, 0.006, z * 0.925) for x, z in prof] + [(0.0, 0.006, 0.0)]
            gl_faces = [(i, nsec, (i + 1) % nsec) for i in range(nsec)]
            glass = new_mesh_obj(f'mirror_{"right" if side > 0 else "left"}_surface', gl_verts, gl_faces, smooth=False)
            uvs = []
            for f in glass.data.polygons:
                for vi in f.vertices:
                    v = glass.data.vertices[vi].co
                    uvs.append(((v.x / (W_ * 0.925) + 0.5), (v.z / (H_ * 0.925) + 0.5)))
            uvl = glass.data.uv_layers.new(name='UVMap')
            uvl.data.foreach_set('uv', np.array(uvs, np.float32).ravel())
            # glass faces backward (-Y)
            orient_out(glass, np.array([0, -1, 0]))
            assign_mat(glass, 'mirror')
            # arm: from sail to head
            arm_path = [base + np.array([side * 0.004, 0.0, 0.0]), base + np.array([side * 0.05, 0.008, 0.03]),
                        head_c + np.array([-side * 0.06, 0.03, -0.01])]
            arm_path = resample(np.array(arm_path), 10)
            arm = sweep(f'mirror_arm_{sfx}', arm_path, rrect_profile(0.034, 0.05, 0.012, 3),
                        scale=np.linspace(1.15, 0.8, 10), cap=True)
            foot = extrude_outline('mfoot', rounded_rect_2d(-0.035, -0.03, 0.035, 0.03, 0.012, 4), -0.006, 0.004,
                                   plane='XY')
            q = Vector((0, 0, 1)).rotation_difference(Vector(n))
            foot.data.transform(Matrix.Translation(Vector(base)) @ q.to_matrix().to_4x4())
            # place head: toe-out a little and face backward
            rot = Matrix.Rotation(math.radians(-7 * side), 4, 'Z')
            T = Matrix.Translation(Vector(head_c)) @ rot
            housing.data.transform(T)
            glass.data.transform(T)
            shell = join([housing, arm, foot], name=f'mirror_housing_{sfx}')
            assign_mat(shell, 'plastic_black')
            self.objs[shell.name] = shell
            self.objs[glass.name] = glass
            E.__dict__.setdefault('mirror_pos', {})[side] = head_c

    # ---------------------------------------------------------------------------------
    def handles_and_mouldings(self):
        E = self.E
        for side in (1, -1):
            sfx = 'r' if side > 0 else 'l'
            for door, yc in (('f', -0.055), ('r', -0.905)):
                h = self.handle(f'handle_{door}{sfx}', yc, 0.742, side)
                self.objs[h.name] = h
                if door == 'f':
                    loc, n = E.surf_x(yc + 0.105, 0.742, side)
                    kh = self.keyhole(f'keyhole_f{sfx}', np.array(loc) + np.array(n) * 0.0005, np.array(n),
                                      np.array([0, 0, 1]))
                    self.objs[kh.name] = kh
            # side protection mouldings (one per door)
            for door, y0, y1 in (('f', 0.835, -0.185), ('r', -0.205, -1.03)):
                pts, nn = [], []
                for y in np.linspace(y0, y1, 40):
                    loc, n = E.surf_x(y, 0.515, side)
                    if loc is None:
                        continue
                    pts.append(np.array(loc))
                    nn.append(np.array(n))
                P = np.array(pts)
                prof = [(-0.001, -0.017), (0.003, -0.0165), (0.0058, -0.012), (0.0068, 0.0), (0.0058, 0.012),
                        (0.003, 0.0165), (-0.001, 0.017)]
                m = sweep(f'moulding_{door}{sfx}', P, prof, normals=np.array(nn), closed_profile=True, cap=True)
                # taper ends
                assign_mat(m, 'rubber')
                orient_out(m, np.array([side, 0, 0]))
                self.objs[m.name] = m

    def handle(self, name, yc, zc, side):
        E = self.E
        L, Hh = 0.135, 0.042
        outline = rounded_rect_2d(-L / 2, -Hh / 2, L / 2, Hh / 2, 0.016, 6)
        inner = rounded_rect_2d(-L / 2 + 0.008, -Hh / 2 + 0.008, L / 2 - 0.008, Hh / 2 - 0.006, 0.010, 6)

        def proj(y, z, off):
            loc, n = E.surf_x(yc + y, zc + z, side)
            return np.array(loc) + np.array(n) * off, np.array(n)
        # bezel ring: outer rim raised 2.5mm, inner lip down into a recess
        rings = []
        for loop, off in ((outline, 0.0003), (outline, 0.0026), (inner, 0.0028), (inner, -0.006)):
            ring = []
            for y, z in loop:
                p, n = proj(y, z, off)
                ring.append(p)
            rings.append(ring)
        # recess bottom
        bottom = [proj(y * 0.9, z * 0.75, -0.016)[0] for y, z in inner]
        rings.append(bottom)
        n = len(outline)
        verts = [v for r in rings for v in r]
        faces = []
        for k in range(len(rings) - 1):
            for i in range(n):
                j = (i + 1) % n
                faces.append((k * n + i, k * n + j, (k + 1) * n + j, (k + 1) * n + i))
        cen = proj(0, 0, -0.016)[0]
        verts.append(cen)
        for i in range(n):
            faces.append((4 * n + i, 4 * n + (i + 1) % n, 5 * n))
        bez = new_mesh_obj(name + '_bezel', verts, faces, smooth=True)
        orient_out(bez, np.array([side, 0, 0]))
        set_sharp_by_angle(bez, 50)
        # pull lever inside the recess (flush flap)
        lev_out = rounded_rect_2d(-L / 2 + 0.014, -Hh / 2 + 0.010, L / 2 - 0.014, Hh / 2 - 0.009, 0.007, 4)
        lv = []
        for off in (0.0012, -0.008):
            lv.append([proj(y, z, off)[0] for y, z in lev_out])
        m = len(lev_out)
        verts = lv[0] + lv[1] + [np.mean(lv[0], axis=0) + np.array([side * 0.0012, 0, 0])]
        faces = [(i, (i + 1) % m, m + (i + 1) % m, m + i) for i in range(m)]
        faces += [(i, 2 * m, (i + 1) % m) for i in range(m)]
        lever = new_mesh_obj(name + '_lever', verts, faces, smooth=True)
        orient_out(lever, np.array([side, 0, 0]))
        set_sharp_by_angle(lever, 50)
        ob = join([bez, lever], name=name)
        assign_mat(ob, 'plastic_black')
        return ob

    def fuel_filler(self):
        E = self.E
        side = -1
        yc, zc = -1.383, 0.717
        loc, n = E.surf_x(yc, zc, side)
        p = np.array(loc)
        n = np.array(n)
        pocket = lathe('fuel_pocket', [(0.0, -0.045), (0.07, -0.045), (0.085, -0.04), (0.092, -0.01), (0.095, 0.0)],
                       segments=32, mat=mat('paint_black'))
        pocket.data.transform(Matrix.Scale(1.0, 4))
        cap = lathe('fuel_cap', [(0.0, -0.03), (0.032, -0.03), (0.033, -0.022), (0.03, -0.02), (0.0, -0.02)],
                    segments=24, mat=mat('plastic_black'))
        rib = []
        for k in range(8):
            a = 2 * math.pi * k / 8
            b = box('rib', (0.004, 0.034, 0.006), center=(0.0, 0.0, -0.017), mat=mat('plastic_black'))
            b.data.transform(Matrix.Rotation(a, 4, 'Z'))
            rib.append(b)
        ob = join([pocket, cap] + rib, name='fuel_filler')
        q = Vector((0, 0, 1)).rotation_difference(Vector(n))
        ob.data.transform(Matrix.Translation(Vector(p)) @ q.to_matrix().to_4x4() @
                          Matrix.Diagonal((1.0, 0.82, 1.0, 1.0)))
        self.objs['fuel_filler'] = ob
        E.fuel_hinge = (p, n)

    # ---------------------------------------------------------------------------------
    def wipers(self):
        E = self.E
        wsb = E.g.wsb
        for nm, xp, length in (('wiper_r', 0.50, 0.46), ('wiper_l', -0.07, 0.44)):
            # spindle on the cowl just below the glass
            yb = 0.978 - 0.098 * (abs(xp) / 0.64) ** 2.2
            pv = np.array([xp, yb + 0.03, tb.T_hood(xp, yb + 0.03) + 0.012])
            # arm direction: toward -x along the base, lying on the glass
            p_tip = np.array([xp - length, 0.0, 0.0])
            yb2 = 0.978 - 0.098 * (abs(p_tip[0]) / 0.64) ** 2.2
            p_tip[1] = yb2 - 0.05
            loc, n = E.nearest(np.array([p_tip[0], p_tip[1], 0.95]))
            ptip = np.array(loc) + np.array(n) * 0.016
            nrm = np.array(E.nearest(pv)[1])
            parts = []
            cap = lathe(nm + '_cap', [(0.0, 0.0), (0.016, 0.0), (0.017, 0.006), (0.014, 0.016), (0.0, 0.019)],
                        segments=20)
            cap.data.transform(Matrix.Translation(Vector(pv)) @
                               Vector((0, 0, 1)).rotation_difference(Vector(nrm)).to_matrix().to_4x4())
            parts.append(cap)
            # arm: stamped channel, tapering
            arm_pts = resample(np.array([pv + nrm * 0.014, pv + (ptip - pv) * 0.18 + nrm * 0.02,
                                         pv + (ptip - pv) * 0.6 + nrm * 0.006, ptip]), 18)
            prof = [(-0.004, -0.008), (0.004, -0.008), (0.005, -0.006), (0.005, 0.006), (0.004, 0.008),
                    (-0.004, 0.008), (-0.004, 0.006), (0.002, 0.006), (0.002, -0.006), (-0.004, -0.006)]
            arm = sweep(nm + '_arm', arm_pts, prof, normals=np.tile(nrm, (18, 1)), scale=np.linspace(1.0, 0.62, 18),
                        cap=True, smooth=False)
            parts.append(arm)
            # blade: carrier along the glass base direction, centred near the arm tip
            d = np.array([1.0, 0.0, 0.0])
            bl_len = 0.40 if nm == 'wiper_r' else 0.42
            c = ptip
            bpts = []
            for k in range(24):
                x = lerp(-bl_len / 2, bl_len / 2, k / 23)
                q = c + d * x
                loc, nn = E.nearest(q)
                bpts.append(np.array(loc) + np.array(nn) * 0.009)
            bpts = np.array(bpts)
            bn = np.array([E.nearest(q)[1] for q in bpts])
            carrier = sweep(nm + '_carrier', bpts, [(-0.002, -0.005), (0.004, -0.0045), (0.006, 0.0), (0.004, 0.0045),
                                                    (-0.002, 0.005)], normals=bn, cap=True, smooth=False,
                            scale=0.8 + 0.25 * np.sin(np.linspace(0, math.pi, 24)))
            rubber = sweep(nm + '_rubber', bpts - bn * 0.007, [(0.0, -0.0018), (0.004, -0.0018), (0.004, 0.0018),
                                                               (0.0, 0.0018), (-0.0035, 0.0003), (-0.0035, -0.0003)],
                           normals=bn, cap=True, smooth=False)
            # yokes: two secondary bridges
            yokes = []
            for a0 in (-0.33, 0.33):
                i0 = int((0.5 + a0) * 23)
                pth = resample(np.array([bpts[max(i0 - 4, 0)] + bn[i0] * 0.002, bpts[i0] + bn[i0] * 0.008,
                                         bpts[min(i0 + 4, 23)] + bn[i0] * 0.002]), 8)
                yokes.append(sweep(nm + '_yoke', pth, rrect_profile(0.004, 0.007, 0.0015, 2), cap=True))
            parts += [carrier] + yokes
            ob = join(parts, name=nm)
            assign_mat(ob, 'paint_black')
            rb = rubber
            assign_mat(rb, 'rubber')
            ob = join([ob, rb], name=nm)
            self.objs[nm] = ob
            ob['_pivot'] = list(pv)
            ob['_axis'] = list(nrm)

    # ---------------------------------------------------------------------------------
    def wheels(self):
        tyre = self.tyre('tyre')
        rim = self.steel_wheel('rim')
        cap = self.hubcap('hubcap')
        brake = lathe('brake', [(0.0, -0.10), (0.13, -0.10), (0.135, -0.09), (0.135, -0.05), (0.12, -0.045),
                                (0.06, -0.045), (0.05, -0.03), (0.0, -0.03)], segments=28, axis='X',
                      mat=mat('metal_steel'))
        proto = join([tyre, rim, cap, brake], name='wheel_proto')
        for nm, (x, y) in (('wheel_fl', (-tb.TRACK_F / 2, tb.AXF)), ('wheel_fr', (tb.TRACK_F / 2, tb.AXF)),
                           ('wheel_rl', (-tb.TRACK_R / 2, tb.AXR)), ('wheel_rr', (tb.TRACK_R / 2, tb.AXR))):
            w = duplicate(proto, nm)
            if x < 0:
                w.data.transform(Matrix.Rotation(math.pi, 4, 'Z'))
            w.location = (x, y, tb.AXLE_Z)
            self.objs[nm] = w
        delete(proto)

    def tyre(self, name):
        """175/65R14 tyre: lathe around X with sidewall bulge, shoulders, 3 circumferential grooves
        and staggered lateral grooves (tread blocks) in geometry."""
        R, Wd = 0.2915, 0.178
        rim_r = 0.1805
        # half profile (lateral x, radius r) from inner bead to outer bead
        P = [(-0.074, rim_r - 0.002), (-0.081, rim_r + 0.012), (-0.088, 0.215), (-0.0905, 0.250),
             (-0.083, 0.278), (-0.070, 0.288), (-0.050, R), (-0.042, R), (-0.040, R - 0.007),
             (-0.034, R - 0.007), (-0.032, R), (-0.012, R), (-0.010, R - 0.007), (-0.004, R - 0.007), (-0.002, R),
             (0.002, R), (0.004, R - 0.007), (0.010, R - 0.007), (0.012, R), (0.032, R), (0.034, R - 0.007),
             (0.040, R - 0.007), (0.042, R), (0.050, R), (0.070, 0.288), (0.083, 0.278),
             (0.0905, 0.250), (0.088, 0.215), (0.081, rim_r + 0.012), (0.074, rim_r - 0.002)]
        segs = 84
        verts = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            block = (i % 3 == 0)
            stagger = (i % 6 == 0)
            for k, (x, r) in enumerate(P):
                rr = r
                on_tread = r >= R - 1e-6
                if on_tread and block:
                    # lateral groove: shoulder blocks on alternating rows
                    if (abs(x) > 0.043) or (stagger and abs(x) < 0.031 and abs(x) > 0.013) or \
                            (not stagger and abs(x) <= 0.013 and abs(x) > 0.0):
                        rr = R - 0.0055
                verts.append((x, rr * math.cos(a), rr * math.sin(a)))
        faces = grid_faces(segs, len(P), closed_u=True, flip=True)
        ob = new_mesh_obj(name, verts, faces, smooth=True)
        recalc_normals(ob)
        set_sharp_by_angle(ob, 40)
        assign_mat(ob, 'rubber')
        # sidewall ring ribs (raised bands, no lettering)
        return ob

    def steel_wheel(self, name):
        # rim barrel + flange visible around the hubcap; dark painted steel
        prof = [(0.155, -0.075), (0.176, -0.076), (0.183, -0.072), (0.181, -0.062), (0.172, -0.058), (0.168, -0.035),
                (0.150, -0.025), (0.150, 0.025), (0.168, 0.035), (0.172, 0.058), (0.181, 0.062), (0.186, 0.068),
                (0.186, 0.074), (0.180, 0.078), (0.170, 0.072)]
        # lathe profile is (r, h): h along X
        rim = lathe(name, [(r, h) for r, h in prof], segments=40, axis='X', mat=mat('paint_black'))
        disc = lathe(name + '_disc', [(0.150, 0.02), (0.13, 0.035), (0.09, 0.04), (0.06, 0.045), (0.035, 0.042),
                                      (0.0, 0.042)], segments=32, axis='X', mat=mat('paint_black'))
        return join([rim, disc], name=name)

    def hubcap(self, name):
        """90s full-cover plastic hubcap: domed dish with 10 tapered vents and a plain centre."""
        prof = [(0.168, 0.066), (0.172, 0.070), (0.170, 0.076), (0.160, 0.080), (0.140, 0.083), (0.120, 0.087),
                (0.100, 0.090), (0.080, 0.094), (0.062, 0.097), (0.050, 0.101), (0.046, 0.106), (0.040, 0.108),
                (0.0, 0.110)]
        cap = lathe(name, [(r, h) for r, h in prof], segments=50, axis='X', mat=mat('metal_steel'))
        # vents: radial tapered prisms cut through the dish
        cutters = []
        for k in range(10):
            a = 2 * math.pi * (k + 0.5) / 10
            loop = [(-0.010, 0.072), (0.010, 0.072), (0.016, 0.135), (-0.016, 0.135)]
            loop = rounded_poly_2d(loop, [0.004, 0.004, 0.008, 0.008], 4)
            c = extrude_outline('vent', [(a2, b2) for a2, b2 in loop], 0.05, 0.13, plane='XY')
            # local: x' = tangential, y' = radial, z' = along axle -> map to wheel (X axle)
            M = Matrix(((0, 0, 1, 0), (math.cos(a + math.pi / 2), math.cos(a), 0, 0),
                        (math.sin(a + math.pi / 2), math.sin(a), 0, 0), (0, 0, 0, 1)))
            c.data.transform(M)
            cutters.append(c)
        cc = join(cutters, name='ventcut')
        boolean(cap, cc, op='DIFFERENCE')
        delete(cc)
        vlib.dissolve_fragments(cap, 0.2)
        set_sharp_by_angle(cap, 40)
        assign_mat(cap, 'metal_steel')
        # centre: a plain domed disc with a fine ring (no logo)
        ring = lathe(name + '_ring', [(0.050, 0.1015), (0.052, 0.1035), (0.050, 0.1055)], segments=32, axis='X',
                     mat=mat('chrome'))
        return join([cap, ring], name=name)

    # ---------------------------------------------------------------------------------
    def roof_sign(self):
        """TAXI-METER box sign on a two-bar gutter rack."""
        E = self.E
        yc = -0.33
        zr = tb.T_roof(0, yc)
        L, D, Hs = 0.64, 0.17, 0.145
        # trapezoid wedge profile (y, z): base wider, top narrower; ends rounded in plan
        prof = [(-D / 2, 0.0), (D / 2, 0.0), (D / 2 - 0.022, Hs), (-D / 2 + 0.022, Hs)]
        prof = rounded_poly_2d(prof, [0.006, 0.006, 0.012, 0.012], 4)
        body_parts = []
        # loft along x with rounded ends
        n_x = 28
        xs = np.linspace(-L / 2, L / 2, n_x)
        secs = []
        for x in xs:
            e = abs(x) / (L / 2)
            shrink = 1.0 - (0.0 if e < 0.92 else ((e - 0.92) / 0.08) ** 2 * 0.25)
            secs.append([(x, y * shrink, z * (1.0 if e < 0.92 else 1 - ((e - 0.92) / 0.08) ** 2 * 0.06))
                         for y, z in prof])
        verts = [p for s in secs for p in s]
        m = len(prof)
        faces = grid_faces(n_x, m, closed_v=True)
        ob = new_mesh_obj('roof_sign', verts, faces, smooth=True)
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.holes_fill(bm, edges=bm.edges, sides=0)
        bm.to_mesh(ob.data)
        bm.free()
        recalc_normals(ob)
        set_sharp_by_angle(ob, 40)
        assign_mat(ob, 'sign_panel')
        ob.data.transform(Matrix.Translation((0, yc, zr + 0.055)))
        # UVs: front face (+Y side faces) / back face planar; good enough for a canvas texture
        planar_uv(ob, (1, 0, 0), (0, 0, 1))
        # base tray + text letters (raised, on both inclined faces)
        tray = extrude_outline('sign_tray', rounded_rect_2d(-L / 2 - 0.01, -D / 2 - 0.01, L / 2 + 0.01, D / 2 + 0.01,
                                                            0.02, 6), 0.0, 0.022, plane='XY', mat=mat('plastic_black'))
        add_bevel(tray, 0.003, 2, angle=30)
        apply_modifiers(tray)
        tray.data.transform(Matrix.Translation((0, yc, zr + 0.035)))
        txt = []
        for face_sign in (1, -1):
            t = self.text_mesh('TAXI-METER', 0.060, 0.0016)
            # place on the inclined face: face normal tilted ~8.6 deg up from +-Y
            ang = math.atan2(0.022, Hs)
            Mrot = Matrix.Rotation(math.pi / 2 - ang * 1.0, 4, 'X') if face_sign > 0 else \
                Matrix.Rotation(math.pi / 2 - ang, 4, 'X')
            t.data.transform(Matrix.Translation((0, 0, 0)))
            # build in local: text in XY plane facing +Z -> rotate to face -Y (rear) or +Y (front)
            R = Matrix.Rotation(math.pi / 2 - ang, 4, 'X') if face_sign < 0 else \
                Matrix.Rotation(-(math.pi / 2 - ang), 4, 'X') @ Matrix.Rotation(math.pi, 4, 'Z')
            t.data.transform(R)
            yoff = face_sign * (D / 2 - 0.011 + 0.0012)
            t.data.transform(Matrix.Translation((0, yc + yoff, zr + 0.055 + Hs * 0.5)))
            txt.append(t)
        letters = join(txt, name='sign_letters')
        assign_mat(letters, 'sign_text')
        # rack: two crossbars with gutter clamps
        rack = []
        for dy in (-0.21, 0.21):
            y = yc + dy
            xs_ = np.linspace(-0.64, 0.64, 30)
            path = []
            for x in xs_:
                z = tb.T_roof(x, y) + 0.03 if abs(x) < 0.55 else tb.T_roof(min(abs(x), 0.6), y) + 0.03 - (abs(x) - 0.55) * 0.25
                path.append((x, y, max(z, 1.27)))
            bar = sweep('rack_bar', np.array(path), rrect_profile(0.028, 0.02, 0.004, 2), cap=True,
                        normals=np.tile(np.array([0, 0, 1.0]), (30, 1)))
            rack.append(bar)
            for sx in (-1, 1):
                loc, n = E.surf_x(y, 1.284, sx)
                if loc is None:
                    continue
                cl = box('clamp', (0.03, 0.05, 0.05), center=(loc[0] + sx * 0.004, y, loc[2] + 0.012), bevel_w=0.003)
                rack.append(cl)
            # posts from bar to sign tray
            for sx in (-0.2, 0.2):
                post = box('post', (0.025, 0.02, 0.05), center=(sx, y * 0 + yc + dy * 0.45, zr + 0.025), bevel_w=0.002)
                rack.append(post)
        rk = join(rack, name='sign_rack')
        assign_mat(rk, 'paint_black')
        self.objs['roof_sign'] = ob
        self.objs['roof_sign_base'] = join([tray, letters, rk], name='roof_sign_base')

    @staticmethod
    def text_mesh(s, size, depth):
        cu = bpy.data.curves.new('txt', 'FONT')
        cu.body = s
        cu.size = size
        cu.align_x = 'CENTER'
        cu.align_y = 'CENTER'
        cu.extrude = depth
        cu.resolution_u = 2
        ob = bpy.data.objects.new('txt', cu)
        vlib.link(ob)
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
        m = bpy.data.objects.new('txtm', me)
        vlib.link(m)
        bpy.data.objects.remove(ob, do_unlink=True)
        # bold-ish: stretch x slightly
        me.transform(Matrix.Diagonal((0.92, 1.0, 1.0, 1.0)))
        return m

    # ---------------------------------------------------------------------------------
    def antenna_and_flaps(self):
        E = self.E
        x, y = -0.705, 0.93
        z = tb.T_hood(x, y)
        base = lathe('ant_base', [(0.0, 0.0), (0.014, 0.0), (0.0145, 0.004), (0.01, 0.012), (0.006, 0.02),
                                  (0.0, 0.021)], segments=20)
        secs = []
        h0 = 0.02
        for r0, ln in ((0.0032, 0.25), (0.0024, 0.25), (0.0016, 0.24)):
            secs.append(lathe('ant', [(0.0, h0), (r0, h0), (r0, h0 + ln), (r0 * 0.6, h0 + ln + 0.002), (0.0, h0 + ln + 0.002)],
                              segments=10))
            h0 += ln
        tip = lathe('ant_tip', [(0.0, h0), (0.003, h0 + 0.002), (0.0032, h0 + 0.006), (0.0, h0 + 0.008)], segments=10)
        ant = join([base] + secs + [tip], name='antenna')
        ant.data.transform(Matrix.Translation((x, y, z - 0.002)) @ Matrix.Rotation(math.radians(-14), 4, 'X'))
        assign_mat(ant, 'chrome')
        self.objs['antenna'] = ant
        flaps = []
        for side in (1, -1):
            for yy in (tb.AXF - 0.375, tb.AXR - 0.37):
                sh = [(-0.085, 0.0), (0.085, 0.0), (0.09, 0.19), (-0.09, 0.19)]
                sh = rounded_poly_2d(sh, [0.01, 0.01, 0.0, 0.0], 3)
                f = extrude_outline('flap', sh, -0.003, 0.003, plane='XZ')
                add_bevel(f, 0.0012, 1, angle=30)
                apply_modifiers(f)
                f.data.transform(Matrix.Translation((side * 0.735, yy, 0.105)) @ Matrix.Rotation(math.radians(-6), 4, 'X'))
                flaps.append(f)
        fl = join(flaps, name='mud_flaps')
        assign_mat(fl, 'rubber')
        self.objs['mud_flaps'] = fl

    # ---------------------------------------------------------------------------------
    def underbody(self):
        parts = []
        # wheel-well liners (inner arches)
        for y, r in ((tb.AXF, 0.355), (tb.AXR, 0.345)):
            for side in (1, -1):
                verts, faces = [], []
                na = 28
                prof = [(side * 0.52, r + 0.02), (side * 0.80, r + 0.02)]
                for i in range(na + 1):
                    a = math.radians(-15 + 210 * i / na)
                    for x, rr in ((side * 0.50, r + 0.045), (side * 0.53, r + 0.03), (side * 0.83, r + 0.015)):
                        verts.append((x, y + rr * math.cos(a), tb.AXLE_Z + rr * math.sin(a)))
                faces = grid_faces(na + 1, 3)
                o = new_mesh_obj('liner', verts, faces, smooth=True)
                orient_out(o, np.array([0, 0, -1]))
                parts.append(o)
        # floor pan between/around the wheels
        pan_loop = [(-0.62, 1.92), (0.62, 1.92), (0.62, 1.70), (0.50, 1.66), (0.50, 0.94), (0.66, 0.90),
                    (0.66, -0.78), (0.50, -0.80), (0.50, -1.52), (0.62, -1.56), (0.62, -1.95), (-0.62, -1.95),
                    (-0.62, -1.56), (-0.50, -1.52), (-0.50, -0.80), (-0.66, -0.78), (-0.66, 0.90), (-0.50, 0.94),
                    (-0.50, 1.66), (-0.62, 1.70)]
        pan = extrude_outline('pan', pan_loop, 0.19, 0.205, plane='XY')
        parts.append(pan)
        # tunnel + exhaust run + diff + fuel tank silhouettes
        parts.append(box('tunnel', (0.22, 2.2, 0.08), center=(0.0, 0.3, 0.2), bevel_w=0.02))
        parts.append(box('tank', (0.9, 0.45, 0.16), center=(0.0, -1.0, 0.27), bevel_w=0.03))
        parts.append(box('diff', (0.28, 0.22, 0.16), center=(0.0, tb.AXR + 0.02, 0.28), bevel_w=0.03))
        parts.append(tube('axle', [(-0.6, tb.AXR, tb.AXLE_Z), (0.6, tb.AXR, tb.AXLE_Z)], 0.035, 16))
        parts.append(tube('xpipe', [(0.15, 1.5, 0.3), (0.12, 0.8, 0.16), (0.1, -0.6, 0.16), (0.30, -1.3, 0.2),
                                    (0.42, -1.55, 0.205)], 0.024, 12))
        # engine bay tub + trunk tub (dark volumes behind gaps)
        tub = extrude_outline('ebay', rounded_rect_2d(-0.70, 1.0, 0.70, 2.0, 0.12, 6), 0.32, 0.70, plane='XY')
        bm = bmesh.new()
        bm.from_mesh(tub.data)
        top = [f for f in bm.faces if f.normal.z > 0.9]
        bmesh.ops.delete(bm, geom=top, context='FACES')
        bm.to_mesh(tub.data)
        bm.free()
        recalc_normals(tub, inside=True)
        parts.append(tub)
        engine = box('engine', (0.5, 0.42, 0.36), center=(0.0, 1.55, 0.55), bevel_w=0.03)
        parts.append(engine)
        ttub = extrude_outline('ttub', rounded_rect_2d(-0.66, -2.0, 0.66, -1.55, 0.1, 6), 0.42, 0.92, plane='XY')
        bm = bmesh.new()
        bm.from_mesh(ttub.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z > 0.9], context='FACES')
        bm.to_mesh(ttub.data)
        bm.free()
        recalc_normals(ttub, inside=True)
        parts.append(ttub)
        ub = join(parts, name='underbody')
        assign_mat(ub, 'paint_black')
        self.objs['underbody'] = ub
