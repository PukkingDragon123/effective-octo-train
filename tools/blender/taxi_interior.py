# Taxi interior (right-hand drive, driver at +X): sculpted early-90s Japanese dashboard with
# gauge binnacle hood, centre stack (vents, radio, heater sliders, ashtray), glovebox lid,
# outer vents, cluster with separate UV'd gauge faces and needles, 4-spoke wheel with horn
# pad and stalks, ignition cylinder, taxi meter box and vacant lamp, bucket seats with
# bolsters / piping / stitched channels and a wooden-bead cover on the driver seat, rear
# bench, door cards (armrest, pocket, speaker, crank, inner handle, lock pin), pillar trims,
# sagging headliner, dome light, visors, rearview mirror, belts, carpet, mats, console,
# gear lever with boot, handbrake, pedals, parcel shelf.
import math
import numpy as np
import bpy
import bmesh
from mathutils import Vector, Matrix
import vlib
from vlib import (V, log, new_mesh_obj, grid_faces, sweep, lathe, tube, box, extrude_outline, resample,
                  rounded_poly_2d, rounded_rect_2d, rrect_profile, circle_profile, assign_mat, mat, join, lerp,
                  clamp, smoothstep, recalc_normals, add_bevel, apply_modifiers, set_sharp_by_angle, add_solidify,
                  planar_uv, delete, duplicate, Spline1D)
import taxi_body as tb
from taxi_body import hermite_sections


def orient(ob, ref_dir):
    me = ob.data
    if len(me.polygons):
        n = np.mean([p.normal[:] for p in me.polygons], axis=0)
        if np.dot(n, ref_dir) < 0:
            recalc_normals(ob, inside=True)
    return ob


def frame_matrix(origin, x, y, z):
    return Matrix(((x[0], y[0], z[0], origin[0]), (x[1], y[1], z[1], origin[1]),
                   (x[2], y[2], z[2], origin[2]), (0, 0, 0, 1)))


def quad(name, center, right, up, w, h, material, flip=False):
    c = np.array(center)
    r = np.array(right) / np.linalg.norm(right)
    u = np.array(up) / np.linalg.norm(up)
    v = [c - r * w / 2 - u * h / 2, c + r * w / 2 - u * h / 2, c + r * w / 2 + u * h / 2, c - r * w / 2 + u * h / 2]
    f = [(0, 1, 2, 3)] if not flip else [(0, 3, 2, 1)]
    uv = [(0, 0), (1, 0), (1, 1), (0, 1)] if not flip else [(0, 0), (0, 1), (1, 1), (1, 0)]
    ob = new_mesh_obj(name, v, f, smooth=False, uvs=uv)
    assign_mat(ob, material)
    return ob


def pillow(name, w, d, h, n=4.0, nx=22, ny=18, top_fn=None, end_round=0.10, bottom_flat=True):
    """Rounded upholstered block: sections along local Y (depth, front = +d/2), closed
    loops in (x, z). top_fn(x, y) adds to the top surface height (bolsters, channels)."""
    secs = []
    ys = np.linspace(d / 2, -d / 2, ny)
    for y in ys:
        e = abs(y) / (d / 2)
        s_end = (1 - e ** 10) ** 0.1 if e < 1 else 0.0
        s_end = max(s_end, 0.02)
        loop = []
        for k in range(nx):
            a = 2 * math.pi * k / nx
            c, s = math.cos(a), math.sin(a)
            x = w / 2 * np.sign(c) * abs(c) ** (2 / n)
            z = h / 2 * np.sign(s) * abs(s) ** (2 / n) + h / 2
            if bottom_flat and z < h * 0.15:
                z = h * 0.15 * (z / (h * 0.15)) ** 1.5 if z > 0 else 0.0
            if top_fn is not None and z > h * 0.6:
                z += top_fn(x, y) * smoothstep(h * 0.6, h, z)
            # round the front/back ends
            zz = h * 0.5 + (z - h * 0.5) * (s_end ** 0.5)
            xx = x * (0.93 + 0.07 * s_end)
            loop.append((xx, y, zz))
        secs.append(loop)
    verts = [p for s in secs for p in s]
    faces = grid_faces(ny, nx, closed_v=True)
    ob = new_mesh_obj(name, verts, faces, smooth=True)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.holes_fill(bm, edges=bm.edges, sides=0)
    bm.to_mesh(ob.data)
    bm.free()
    recalc_normals(ob)
    return ob, secs


class Interior:
    def __init__(self, E, P):
        self.E = E
        self.P = P
        self.objs = {}
        self.anchor = {}
        self.pivots = {}

    def build(self):
        self.dashboard()
        self.cluster()
        self.centre_stack()
        self.steering()
        self.meter_and_vacant()
        self.seats()
        self.door_cards()
        self.cabin_trim()
        self.floor_console_pedals()
        self.mirror_visors_belts()
        return self.objs

    # ---------------------------------------------------------------------------------
    # dashboard
    # ---------------------------------------------------------------------------------
    PROF = {
        'pass': [(0.945, 0.902, 0), (0.86, 0.936, 0), (0.74, 0.950, 0), (0.645, 0.947, .25), (0.606, 0.924, 0),
                 (0.600, 0.862, 0), (0.604, 0.742, 0), (0.618, 0.600, 0), (0.660, 0.533, .2), (0.80, 0.505, 0)],
        'stack': [(0.945, 0.902, 0), (0.86, 0.938, 0), (0.74, 0.953, 0), (0.635, 0.951, .25), (0.580, 0.930, 0),
                  (0.564, 0.862, 0), (0.560, 0.722, 0), (0.568, 0.600, 0), (0.600, 0.450, .2), (0.78, 0.420, 0)],
        'bin': [(0.945, 0.902, 0), (0.84, 0.946, 0), (0.680, 0.978, 0), (0.520, 0.993, .3), (0.497, 0.973, .1),
                (0.628, 0.930, .35), (0.606, 0.800, .35), (0.584, 0.768, .2), (0.612, 0.620, 0), (0.680, 0.530, .2)],
    }

    def dash_profile(self, x):
        wb = smoothstep(0.115, 0.205, x) * (1 - smoothstep(0.555, 0.645, x))
        ws = 1 - smoothstep(0.105, 0.165, abs(x))
        wp = max(0.0, 1 - wb - ws)
        out = []
        for k in range(10):
            p = np.zeros(3)
            for key, w in (('pass', wp), ('stack', ws), ('bin', wb)):
                p += w * np.array(self.PROF[key][k])
            out.append(tuple(p))
        # glovebox recess (lid sits in front of it)
        g = smoothstep(-0.585, -0.565, x) * (1 - smoothstep(-0.22, -0.19, x))
        if g > 0:
            for k in (6,):
                y, z, t = out[k]
                out[k] = (y + 0.018 * g, z, t)
        # outer ends curve back toward the doors
        e = smoothstep(0.60, 0.668, abs(x))
        if e > 0:
            out = [(y - 0.03 * e * (k >= 4), z, t) for k, (y, z, t) in enumerate(out)]
        return out

    def dash_y(self, x, z):
        """Dash face y at (x, z) (for placing things on the face)."""
        prof = self.dash_profile(x)
        rows, _ = hermite_sections(prof, [8] * 9)
        best = None
        for i in range(len(rows) - 1):
            (y0, z0), (y1, z1) = rows[i], rows[i + 1]
            if (z0 - z) * (z1 - z) <= 0 and abs(z1 - z0) > 1e-6 and i > 30:
                t = (z - z0) / (z1 - z0)
                best = y0 + (y1 - y0) * t
                break
        return best

    def dash_top_z(self, x, y):
        prof = self.dash_profile(x)
        rows, _ = hermite_sections(prof, [8] * 9)
        for i in range(0, 30):
            (y0, z0), (y1, z1) = rows[i], rows[i + 1]
            if (y0 - y) * (y1 - y) <= 0:
                t = (y - y0) / (y1 - y0 + 1e-12)
                return z0 + (z1 - z0) * t
        return 0.95

    def dashboard(self):
        xs = np.concatenate([np.linspace(-0.668, -0.60, 4), np.linspace(-0.58, -0.20, 13), np.linspace(-0.18, 0.10, 10),
                             np.linspace(0.12, 0.22, 6), np.linspace(0.24, 0.52, 8), np.linspace(0.54, 0.62, 4),
                             np.linspace(0.64, 0.668, 2)])
        xs = np.unique(np.round(xs, 4))
        seg = [2, 3, 3, 3, 2, 4, 3, 2, 3]
        G = []
        for x in xs:
            rows, _ = hermite_sections(self.dash_profile(x), seg)
            G.append([(x, y, z) for y, z in rows])
        G = np.array(G)
        dash = new_mesh_obj('dash', G.reshape(-1, 3), grid_faces(len(xs), G.shape[1], flip=True), smooth=True)
        orient(dash, np.array([0, -0.6, 0.6]))
        # end caps
        caps = []
        for i in (0, -1):
            loop = list(G[i]) + [(G[i][-1][0], 0.95, 0.50), (G[i][0][0], 0.95, 0.90)]
            c = new_mesh_obj('dcap', loop, [tuple(range(len(loop)))], smooth=False)
            caps.append(c)
        dash = join([dash] + caps, name='dash')
        assign_mat(dash, 'plastic_dash')
        set_sharp_by_angle(dash, 60)
        self.objs['dash'] = dash
        # a crack in the passenger-side top pad (weathering)
        pts = []
        rng = np.random.default_rng(7)
        x0 = -0.52
        for k in range(14):
            x = x0 + k * 0.012 + rng.uniform(-0.003, 0.003)
            y = 0.70 + k * 0.004 + rng.uniform(-0.004, 0.004)
            pts.append((x, y, self.dash_top_z(x, y) + 0.0008))
        crack = sweep('dash_crack', np.array(pts), [(0.0, -0.0012), (0.0006, 0.0), (0.0, 0.0012)],
                      closed_profile=False, normals=np.tile(np.array([0, 0, 1.0]), (14, 1)))
        assign_mat(crack, 'plastic_black')
        self.objs['dash_crack'] = crack
        # glovebox lid
        lid_x0, lid_x1, z0, z1 = -0.560, -0.222, 0.603, 0.728
        verts = []
        nx, nz = 16, 6
        for i in range(nx + 1):
            x = lerp(lid_x0, lid_x1, i / nx)
            for j in range(nz + 1):
                z = lerp(z0, z1, j / nz)
                y = self.dash_y(-0.40, z)
                y = (y if y is not None else 0.61) - 0.0185
                verts.append((x, y, z))
        lid = new_mesh_obj('glovebox_lid', verts, grid_faces(nx + 1, nz + 1), smooth=True)
        orient(lid, np.array([0, -1, 0]))
        add_solidify(lid, 0.008, offset=1)
        add_bevel(lid, 0.0025, 2, angle=30)
        apply_modifiers(lid)
        set_sharp_by_angle(lid, 40)
        latch = box('latch', (0.07, 0.012, 0.022), center=(-0.391, self.dash_y(-0.4, 0.712) - 0.026, 0.712),
                    bevel_w=0.003)
        lid = join([lid, latch], name='glovebox_lid')
        assign_mat(lid, 'plastic_dash')
        self.objs['glovebox_lid'] = lid
        hinge = Vector((-0.391, self.dash_y(-0.4, z0) - 0.012, z0))
        self.pivots['glovebox_lid'] = (hinge, (1, 0, 0), (0, 75), 'hinge')
        self.anchor['gloveBox'] = (-0.391, self.dash_y(-0.4, 0.665) - 0.03, 0.665)
        # glovebox cavity behind
        cav = extrude_outline('glove_cav', rounded_rect_2d(-0.55, 0.60, -0.23, 0.80, 0.02, 3), 0.61, 0.72, plane='XY')
        recalc_normals(cav, inside=True)
        assign_mat(cav, 'plastic_black')
        self.objs['glove_cav'] = cav
        # outer vents (driver pod, passenger end)
        for x, w in ((0.612, 0.080), (-0.612, 0.075)):
            z = 0.858
            y = self.dash_y(x, z)
            v = self.vent(f'vent_out_{"r" if x > 0 else "l"}', (x, y - 0.002, z), w, 0.062, rot=(-1 if x > 0 else 1) * 8)
            self.objs[v.name] = v
        # dash sticker spot (faded cartoon elephant, painted by the game) on the passenger face
        self.anchor['dashSticker'] = (-0.45, self.dash_y(-0.45, 0.842) - 0.002, 0.842)

    def vent(self, name, center, w, h, rot=0.0, nslat=5):
        c = np.array(center)
        parts = []
        outer = rounded_rect_2d(-w / 2, -h / 2, w / 2, h / 2, 0.008, 4)
        inner = rounded_rect_2d(-w / 2 + 0.006, -h / 2 + 0.006, w / 2 - 0.006, h / 2 - 0.006, 0.004, 4)
        ring = []
        verts = [(x, 0.0, z) for x, z in outer] + [(x, -0.006, z) for x, z in outer] + \
                [(x, -0.006, z) for x, z in inner] + [(x, 0.03, z) for x, z in inner]
        m = len(outer)
        faces = []
        for k in range(3):
            for i in range(m):
                j = (i + 1) % m
                faces.append((k * m + i, k * m + j, (k + 1) * m + j, (k + 1) * m + i))
        faces.append(tuple(range(4 * m - 1, 3 * m - 1, -1)))
        bz = new_mesh_obj(name + '_bz', verts, faces, smooth=True)
        recalc_normals(bz)
        set_sharp_by_angle(bz, 40)
        parts.append(bz)
        for k in range(nslat):
            z = lerp(-h / 2 + 0.012, h / 2 - 0.012, k / max(nslat - 1, 1))
            s = box('slat', (w - 0.014, 0.012, 0.0022), center=(0, 0.004, z))
            s.data.transform(Matrix.Translation((0, 0.004, z)) @ Matrix.Rotation(math.radians(12), 4, 'X') @
                             Matrix.Translation((0, -0.004, -z)))
            parts.append(s)
        knob = box('vknob', (0.012, 0.008, 0.016), center=(0.0, -0.007, 0.0), bevel_w=0.002)
        parts.append(knob)
        ob = join(parts, name=name)
        assign_mat(ob, 'plastic_black')
        M = Matrix.Translation(Vector(c)) @ Matrix.Rotation(math.radians(rot), 4, 'Z')
        ob.data.transform(M)
        return ob

    # ---------------------------------------------------------------------------------
    def cluster(self):
        # cluster panel plane under the binnacle hood, tilted toward the driver's eye
        ctr = np.array([0.372, 0.612, 0.866])
        eye = np.array([0.37, -0.24, 1.15])
        nrm = eye - ctr
        nrm /= np.linalg.norm(nrm)
        right = np.array([1.0, 0, 0])
        up = np.cross(nrm, right)
        up = -up if up[2] < 0 else up
        self.cl_frame = (ctr, nrm, right, up)
        M = frame_matrix(ctr, right, up, nrm)   # local x right, y up, z toward the eye
        panel = extrude_outline('cluster_panel', rounded_rect_2d(-0.215, -0.075, 0.215, 0.075, 0.025, 6), -0.03, 0.0,
                                plane='XY')
        add_bevel(panel, 0.003, 2, angle=30)
        apply_modifiers(panel)
        panel.data.transform(M)
        assign_mat(panel, 'plastic_black')
        parts = [panel]
        gauges = {'tacho': (-0.078, 0.003, 0.050), 'speedo': (0.076, 0.003, 0.054)}
        for nm, (gx, gy, r) in gauges.items():
            # dial cup: chrome-dark bezel ring + shallow pod
            prof = [(r + 0.010, 0.0), (r + 0.010, 0.004), (r + 0.006, 0.009), (r + 0.002, 0.008), (r + 0.001, 0.0),
                    (r, -0.006)]
            ring = lathe(f'{nm}_ring', prof, segments=48, mat=mat('plastic_dash'))
            ring.data.transform(M @ Matrix.Translation((gx, gy, 0.0)))
            parts.append(ring)
            face = quad(f'gauge_{nm}_face', (0, 0, 0), (1, 0, 0), (0, 1, 0), 2 * r, 2 * r, 'emissive_gauge')
            face.data.transform(M @ Matrix.Translation((gx, gy, -0.0055)))
            self.objs[face.name] = face
            needle = self.needle(f'needle_{"speedo" if nm == "speedo" else "tacho"}', r * 0.88)
            piv = M @ Vector((gx, gy, -0.002))
            needle.data.transform(M.to_3x3().to_4x4())
            needle.data.transform(Matrix.Translation(piv))
            self.objs[needle.name] = needle
            self.pivots[needle.name] = (piv, tuple(-nrm), (0, 270), 'needle')
        # small gauges (fuel above, temp below) on one face quad, right of the speedo
        sx = 0.172
        sface = quad('gauge_small_face', (0, 0, 0), (1, 0, 0), (0, 1, 0), 0.052, 0.104, 'emissive_gauge')
        sface.data.transform(M @ Matrix.Translation((sx, 0.0, -0.004)))
        self.objs['gauge_small_face'] = sface
        sb = extrude_outline('small_bez', rounded_rect_2d(-0.03, -0.056, 0.03, 0.056, 0.012, 4), -0.003, 0.006,
                             plane='XY')
        bm = bmesh.new()
        bm.from_mesh(sb.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if abs(f.normal.z) > 0.9], context='FACES')
        bm.to_mesh(sb.data)
        bm.free()
        sb.data.transform(M @ Matrix.Translation((sx, 0.0, 0.0)))
        assign_mat(sb, 'plastic_dash')
        parts.append(sb)
        for nm, gy in (('needle_fuel', 0.026), ('needle_temp', -0.026)):
            nd = self.needle(nm, 0.019, w=0.0022)
            piv = M @ Vector((sx - 0.012, gy, -0.002))
            nd.data.transform(M.to_3x3().to_4x4())
            nd.data.transform(Matrix.Translation(piv))
            self.objs[nm] = nd
            self.pivots[nm] = (piv, tuple(-nrm), (0, 90), 'needle')
        # warning-light strip between the dials
        strip = quad('warn_strip', (0, 0, 0), (1, 0, 0), (0, 1, 0), 0.05, 0.012, 'plastic_black')
        strip.data.transform(M @ Matrix.Translation((0.0, -0.058, 0.0005)))
        parts.append(strip)
        cl = join(parts, name='cluster')
        self.objs['cluster'] = cl
        # clear cover
        verts = []
        for i in range(9):
            for j in range(4):
                x = lerp(-0.205, 0.205, i / 8)
                y = lerp(-0.068, 0.068, j / 3)
                verts.append(tuple(M @ Vector((x, y, 0.013 + 0.006 * (1 - (x / 0.205) ** 2)))))
        cg = new_mesh_obj('cluster_glass', verts, grid_faces(9, 4), smooth=True)
        orient(cg, nrm)
        assign_mat(cg, 'glass')
        planar_uv(cg, right, up)
        self.objs['cluster_glass'] = cg

    def needle(self, name, length, w=0.0032):
        tail = 0.012
        verts = [(-w / 2, -tail, 0.0), (w / 2, -tail, 0.0), (w * 0.18, length, 0.0), (-w * 0.18, length, 0.0),
                 (-w / 2, -tail, 0.0012), (w / 2, -tail, 0.0012), (w * 0.18, length, 0.0012), (-w * 0.18, length, 0.0012)]
        faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        nd = new_mesh_obj(name + '_b', verts, faces, smooth=False)
        recalc_normals(nd)
        assign_mat(nd, 'emissive_meter')
        hub = lathe(name + '_hub', [(0.0, 0.0), (0.0065, 0.0), (0.0065, 0.003), (0.004, 0.0045), (0.0, 0.0048)],
                    segments=16, mat=mat('plastic_black'))
        return join([nd, hub], name=name)

    # ---------------------------------------------------------------------------------
    def centre_stack(self):
        parts = []
        # centre vents
        for x in (-0.062, 0.062):
            z = 0.842
            y = self.dash_y(x, z)
            parts.append(self.vent('vent_c', (x, y - 0.002, z), 0.098, 0.056, nslat=5))
        # radio (1-DIN): faceplate, display, knobs, buttons, cassette door
        zr = 0.740
        yr = self.dash_y(0.0, zr) - 0.004
        fp = extrude_outline('radio_fp', rounded_rect_2d(-0.092, zr - 0.026, 0.092, zr + 0.026, 0.004, 3), yr - 0.012, yr,
                             plane='XZ')
        add_bevel(fp, 0.0018, 2, angle=30)
        apply_modifiers(fp)
        set_sharp_by_angle(fp, 35)
        assign_mat(fp, 'plastic_black')
        parts.append(fp)
        disp = quad('radio_display', (-0.012, yr - 0.0125, zr + 0.009), (1, 0, 0), (0, 0, 1), 0.07, 0.018,
                    'emissive_gauge')
        orient(disp, np.array([0, -1, 0]))
        self.objs['radio_display'] = disp
        slot = box('cass', (0.075, 0.004, 0.014), center=(-0.012, yr - 0.0125, zr - 0.010), bevel_w=0.001)
        assign_mat(slot, 'plastic_dash')
        parts.append(slot)
        for k, x in enumerate((-0.0675, 0.0675)):
            kn = lathe('knob', [(0.0, 0.0), (0.0105, 0.0), (0.011, 0.004), (0.0105, 0.014), (0.009, 0.0165),
                                (0.0, 0.017)], segments=20, axis='Y', mat=mat('plastic_black'))
            kn.data.transform(Matrix.Translation((x, yr - 0.012, zr - 0.002)) @ Matrix.Rotation(math.pi, 4, 'Z'))
            parts.append(kn)
        self.anchor['radioKnob'] = (-0.0675, yr - 0.03, zr - 0.002)
        for k in range(5):
            b = box('btn', (0.011, 0.006, 0.007), center=(-0.04 + k * 0.014, yr - 0.014, zr - 0.020), bevel_w=0.0012)
            assign_mat(b, 'plastic_dash')
            parts.append(b)
        # heater control panel with three sliders
        zh = 0.672
        yh = self.dash_y(0.0, zh) - 0.002
        hp = extrude_outline('heater', rounded_rect_2d(-0.09, zh - 0.022, 0.09, zh + 0.022, 0.005, 3), yh - 0.006, yh,
                             plane='XZ')
        add_bevel(hp, 0.0015, 2, angle=30)
        apply_modifiers(hp)
        assign_mat(hp, 'plastic_black')
        parts.append(hp)
        for x in (-0.055, 0.0, 0.055):
            sl = box('hslot', (0.045, 0.003, 0.004), center=(x, yh - 0.0065, zh - 0.004))
            assign_mat(sl, 'plastic_dash')
            kn = box('hknob', (0.012, 0.012, 0.016), center=(x + 0.01, yh - 0.012, zh - 0.004), bevel_w=0.002)
            assign_mat(kn, 'plastic_dash')
            parts += [sl, kn]
        # ashtray (chrome-trimmed pull tray)
        za = 0.606
        ya = self.dash_y(0.0, za) - 0.002
        at = extrude_outline('ashtray', rounded_rect_2d(-0.07, za - 0.018, 0.07, za + 0.018, 0.005, 3), ya - 0.008, ya,
                             plane='XZ')
        add_bevel(at, 0.0015, 2, angle=30)
        apply_modifiers(at)
        assign_mat(at, 'plastic_black')
        trim = box('atrim', (0.08, 0.004, 0.006), center=(0.0, ya - 0.0095, za + 0.004), bevel_w=0.0015)
        assign_mat(trim, 'chrome')
        parts += [at, trim]
        stack = join(parts, name='centre_stack')
        self.objs['centre_stack'] = stack

    # ---------------------------------------------------------------------------------
    def steering(self):
        Wc = np.array([0.372, 0.262, 0.842])
        col = np.array([0.0, 0.949, -0.316])     # toward the dash
        col /= np.linalg.norm(col)
        z_ax = -col                               # toward the driver
        x_ax = np.array([1.0, 0, 0])
        y_ax = np.cross(z_ax, x_ax)
        M = frame_matrix(Wc, x_ax, y_ax, z_ax)    # local: x right, y up (in wheel plane), z to driver
        R = 0.188
        # rim: oval section, slightly fatter at the grips
        path = [(R * math.cos(2 * math.pi * k / 72), R * math.sin(2 * math.pi * k / 72), 0.0) for k in range(72)]
        prof = circle_profile(1.0, 12, rx=0.0145, ry=0.0125)
        rim = sweep('rim', np.array(path), prof, closed_path=True, normals=np.tile(np.array([0, 0, 1.0]), (72, 1)))
        parts = [rim]
        # four spokes: two near-horizontal upper, two lower; flattened, tapering
        for ang in (-12, 192, -62, 242):
            a = math.radians(ang)
            d = np.array([math.cos(a), math.sin(a), 0.0])
            pts = [d * 0.055 + np.array([0, 0, 0.012]), d * 0.11 + np.array([0, 0, 0.004]), d * (R - 0.006)]
            pts = resample(np.array(pts), 8)
            sp = sweep('spoke', pts, rrect_profile(0.036 if abs(ang) < 20 or abs(ang - 180) < 20 else 0.026, 0.011,
                                                   0.005, 3),
                       normals=np.tile(np.array([0, 0, 1.0]), (8, 1)), scale=np.linspace(1.0, 0.8, 8), cap=True)
            parts.append(sp)
        # horn pad: pillowy rounded shape
        pad, _ = pillow('pad', 0.150, 0.112, 0.045, n=3.2, nx=24, ny=14,
                        top_fn=lambda x, y: 0.006 * (1 - (x / 0.075) ** 2) * (1 - (y / 0.056) ** 2))
        pad.data.transform(Matrix.Translation((0, 0, -0.016)))
        parts.append(pad)
        hub = lathe('hub', [(0.0, -0.06), (0.04, -0.06), (0.05, -0.03), (0.055, 0.0), (0.0, 0.0)], segments=24)
        parts.append(hub)
        wheel = join(parts, name='steering_wheel')
        assign_mat(wheel, 'plastic_dash')
        wheel.data.transform(M)
        self.objs['steering_wheel'] = wheel
        self.pivots['steering_wheel'] = (Vector(Wc), tuple(z_ax), (-540, 540), 'spin')
        self.anchor['steeringWheel'] = tuple(Wc)
        self.anchor['hornPad'] = tuple(Wc + z_ax * 0.03)
        # column shroud with stalks and the ignition cylinder
        p0 = Wc + col * 0.075
        p1 = Wc + col * 0.33
        sh = sweep('shroud', resample(np.array([p0, p1]), 6), rrect_profile(0.105, 0.085, 0.03, 4),
                   normals=np.tile(np.array([0, 0, 1.0]), (6, 1)), scale=np.linspace(0.9, 1.05, 6), cap=True)
        assign_mat(sh, 'plastic_dash')
        stalks = []
        for nm, sx, tip in (('headlightStalk', 1, np.array([0.585, 0.335, 0.800])),
                            ('wiperStalk', -1, np.array([0.165, 0.335, 0.800]))):
            base = Wc + col * 0.11 + np.array([sx * 0.048, 0, -0.005])
            pts = resample(np.array([base, base + (tip - base) * 0.6 + np.array([0, 0, 0.004]), tip]), 8)
            st = sweep('stalk', pts, circle_profile(0.0055, 10), scale=np.linspace(1.0, 1.25, 8), cap=True)
            knob = lathe('stk', [(0.0, 0.0), (0.008, 0.0), (0.0085, 0.025), (0.006, 0.03), (0.0, 0.031)], segments=12)
            d = (tip - base) / np.linalg.norm(tip - base)
            knob.data.transform(Matrix.Translation(Vector(tip)) @ Vector((0, 0, 1)).rotation_difference(Vector(d)).to_matrix().to_4x4()
                                @ Matrix.Translation((0, 0, -0.022)))
            stalks += [st, knob]
            self.anchor[nm] = tuple(tip)
        stk = join(stalks, name='stalks')
        assign_mat(stk, 'plastic_black')
        # ignition: chrome bezel on the right side of the shroud + rotating cylinder (key_slot)
        kpos = Wc + col * 0.20 + np.array([0.058, 0, 0.004])
        bez = lathe('ign_bezel', [(0.0, 0.0), (0.015, 0.0), (0.016, 0.003), (0.0125, 0.007), (0.0, 0.007)],
                    segments=24, axis='X', mat=mat('chrome'))
        bez.data.transform(Matrix.Translation(Vector(kpos)))
        cyl = lathe('key_slot', [(0.0, 0.0), (0.0105, 0.0), (0.0105, 0.009), (0.0, 0.0095)], segments=20, axis='X',
                    mat=mat('metal_steel'))
        slit = box('slit', (0.002, 0.0028, 0.012), center=(0.0098, 0.0, 0.0), mat=mat('plastic_black'))
        ks = join([cyl, slit], name='key_slot')
        ks.data.transform(Matrix.Translation(Vector(kpos)))
        self.objs['key_slot'] = ks
        self.pivots['key_slot'] = (Vector(kpos), (1, 0, 0), (0, 90), 'spin')
        self.anchor['keySlot'] = tuple(kpos + np.array([0.012, 0, 0]))
        self.objs['steering_column'] = join([sh, stk, bez], name='steering_column')

    # ---------------------------------------------------------------------------------
    def meter_and_vacant(self):
        # taxi meter box on the dash top, display facing the cabin
        mx, my = -0.065, 0.715
        mz = self.dash_top_z(mx, my)
        body = extrude_outline('meter_box', rounded_rect_2d(-0.095, -0.045, 0.095, 0.045, 0.012, 4), 0.0, 0.062,
                               plane='XY')
        add_bevel(body, 0.003, 2, angle=30)
        apply_modifiers(body)
        set_sharp_by_angle(body, 35)
        body.data.transform(Matrix.Translation((mx, my, mz + 0.004)) @ Matrix.Rotation(math.radians(-6), 4, 'X'))
        assign_mat(body, 'plastic_black')
        foot = box('meter_foot', (0.15, 0.06, 0.008), center=(mx, my, mz + 0.002), bevel_w=0.002, mat=mat('plastic_black'))
        btns = []
        for k in range(3):
            b = box('mbtn', (0.022, 0.012, 0.006), center=(mx - 0.03 + k * 0.03, my - 0.01, mz + 0.067), bevel_w=0.0015)
            btns.append(b)
        bt = join(btns, name='mbtns')
        assign_mat(bt, 'plastic_dash')
        win = extrude_outline('meter_win', rounded_rect_2d(-0.07, -0.016, 0.07, 0.016, 0.004, 3), 0.0, 0.004, plane='XZ')
        win.data.transform(Matrix.Translation((mx, my - 0.046 - 0.002, mz + 0.036)) @ Matrix.Rotation(math.radians(-6), 4, 'X'))
        bm = bmesh.new()
        bm.from_mesh(win.data)
        bm.to_mesh(win.data)
        bm.free()
        assign_mat(win, 'plastic_dash')
        disp = quad('meter_display', (0, 0, 0), (1, 0, 0), (0, 0, 1), 0.125, 0.026, 'emissive_meter')
        disp.data.transform(Matrix.Translation((mx, my - 0.0485, mz + 0.036)) @ Matrix.Rotation(math.radians(-6), 4, 'X')
                            @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Rotation(math.pi, 4, 'Y')
                            @ Matrix.Rotation(-math.pi / 2, 4, 'X'))
        orient(disp, np.array([0, -1, 0.1]))
        # rebuild display cleanly facing -Y with UVs left->right as seen from the cabin
        delete(disp)
        c = np.array([mx, my - 0.0485, mz + 0.036])
        disp = quad('meter_display', c, (1, 0, 0), (0, math.sin(math.radians(-6)) * -1, math.cos(math.radians(6))),
                    0.125, 0.026, 'emissive_meter', flip=False)
        orient(disp, np.array([0, -1, 0]))
        self.objs['meter_display'] = disp
        self.objs['meter_box'] = join([body, foot, bt, win], name='meter_box')
        self.anchor['meter'] = (mx, my - 0.05, mz + 0.036)
        # vacant lamp: small red sign standing on the dash near the passenger-side windshield corner
        vx, vy = -0.470, 0.855
        vz = self.dash_top_z(vx, vy)
        frame = extrude_outline('vac_frame', rounded_rect_2d(-0.082, -0.040, 0.082, 0.040, 0.006, 3), -0.012, 0.012,
                                plane='XZ')
        add_bevel(frame, 0.002, 2, angle=30)
        apply_modifiers(frame)
        frame.data.transform(Matrix.Translation((vx, vy, vz + 0.055)))
        stand = box('vac_stand', (0.05, 0.05, 0.016), center=(vx, vy, vz + 0.008), bevel_w=0.003)
        vf = join([frame, stand], name='vacant_frame')
        assign_mat(vf, 'plastic_black')
        self.objs['vacant_frame'] = vf
        fr = quad('vacant_front', (vx, vy + 0.0125, vz + 0.055), (-1, 0, 0), (0, 0, 1), 0.14, 0.065, 'emissive_meter')
        orient(fr, np.array([0, 1, 0]))
        bk = quad('vacant_back', (vx, vy - 0.0125, vz + 0.055), (1, 0, 0), (0, 0, 1), 0.14, 0.065, 'emissive_meter')
        orient(bk, np.array([0, -1, 0]))
        vl = join([fr, bk], name='vacant_lamp')
        self.objs['vacant_lamp'] = vl

    # ---------------------------------------------------------------------------------
    def seats(self):
        def cushion_top(x, y):
            # side bolsters + two stitched channels across the insert
            b = 0.032 * smoothstep(0.15, 0.215, abs(x))
            ch = -0.006 * (math.exp(-((y - 0.06) / 0.008) ** 2) + math.exp(-((y + 0.08) / 0.008) ** 2)) * (abs(x) < 0.15)
            return b + ch

        def back_top(x, y):
            b = 0.045 * smoothstep(0.14, 0.215, abs(x))
            ch = -0.006 * sum(math.exp(-((y - c) / 0.008) ** 2) for c in (-0.12, 0.02, 0.16)) * (abs(x) < 0.14)
            return b + ch
        seat_objs = {}
        for side, nm in ((1, 'driver'), (-1, 'pass')):
            sx = 0.372 * side
            parts = []
            cu, csecs = pillow('cushion', 0.50, 0.50, 0.12, n=3.6, nx=26, ny=18, top_fn=cushion_top)
            # tilt: front edge higher
            cu.data.transform(Matrix.Translation((sx, -0.12, 0.395)) @ Matrix.Rotation(math.radians(6), 4, 'X'))
            parts.append(cu)
            bk, bsecs = pillow('back', 0.50, 0.60, 0.13, n=3.6, nx=26, ny=20, top_fn=back_top)
            # backrest: local y -> up, local z -> forward (front face)
            Mb = Matrix.Translation((sx, -0.40, 0.765)) @ Matrix.Rotation(math.radians(15), 4, 'X') @ \
                Matrix.Translation((0, -0.065, 0)) @ Matrix.Rotation(-math.pi / 2, 4, 'X')
            bk.data.transform(Mb)
            recalc_normals(bk)
            parts.append(bk)
            hr, _ = pillow('headrest', 0.26, 0.16, 0.10, n=3.0, nx=20, ny=12)
            Mh = Matrix.Translation((sx, -0.505, 1.165)) @ Matrix.Rotation(math.radians(12), 4, 'X') @ \
                Matrix.Translation((0, -0.05, 0)) @ Matrix.Rotation(-math.pi / 2, 4, 'X')
            hr.data.transform(Mh)
            recalc_normals(hr)
            parts.append(hr)
            # piping along bolster ridges (cushion + backrest)
            for secs, Mx in ((csecs, Matrix.Translation((sx, -0.12, 0.395)) @ Matrix.Rotation(math.radians(6), 4, 'X')),
                             (bsecs, Mb)):
                for sgn in (1, -1):
                    pts = []
                    for loop in secs[1:-1]:
                        L = np.array(loop)
                        k = np.argmin(np.abs(L[:, 0] - sgn * 0.15) + (L[:, 2] < 0.08) * 9)
                        pts.append(tuple(Mx @ Vector(L[k] + np.array([0, 0, 0.002]))))
                    if len(pts) > 3:
                        parts.append(tube('piping', resample(np.array(pts), 20), 0.0038, 8))
            seat = join(parts, name=f'seat_{nm}')
            assign_mat(seat, 'vinyl_seat')
            # frame + rails + recliner cover
            fr = []
            for dx in (-0.2, 0.2):
                fr.append(box('rail', (0.035, 0.52, 0.03), center=(sx + dx, -0.14, 0.265), bevel_w=0.004))
                fr.append(box('riser', (0.03, 0.42, 0.11), center=(sx + dx, -0.14, 0.33), bevel_w=0.004))
            for dx in (-0.06, 0.06):
                fr.append(tube('hrpost', [(sx + dx, -0.495, 1.03), (sx + dx, -0.505, 1.13)], 0.0055, 10))
            rec = box('recliner', (0.03, 0.12, 0.10), center=(sx + side * 0.262, -0.36, 0.45), bevel_w=0.012)
            lever = tube('reclever', [(sx + side * 0.28, -0.32, 0.47), (sx + side * 0.285, -0.20, 0.45)], 0.007, 8)
            frame = join(fr + [rec, lever], name=f'seatframe_{nm}')
            assign_mat(frame, 'plastic_black')
            seat_objs[nm] = (seat, frame, Mb, sx)
            self.objs[seat.name] = seat
            self.objs[frame.name] = frame
        self.anchor['driverSeat'] = (0.372, -0.14, 0.50)
        self.anchor['frontPassengerSeat'] = (-0.372, -0.14, 0.50)
        self.anchor['driverEye'] = (0.372, -0.24, 1.15)
        # ---- wooden bead cover on the driver seat ----
        seat, frame, Mb, sx = seat_objs['driver']
        bvh = vlib.bvh_of(seat)
        sphere = self._bead_proto()
        beads = []
        pitch = 0.0255
        # backrest: rays toward the backrest front face
        bdir = Mb.to_3x3() @ Vector((0, 0, -1))
        bup = Mb.to_3x3() @ Vector((0, 1, 0))
        borg = Mb @ Vector((0, 0, 0.30))
        for i in range(-7, 8):
            for j in range(0, 20):
                o = borg + Vector((i * pitch, 0, 0)) + bup * (-0.22 + j * pitch)
                hit = bvh.ray_cast(o, bdir, 0.6)
                if hit[0] is not None:
                    beads.append((hit[0], hit[1]))
        corg = Vector((sx, -0.12, 0.70))
        for i in range(-7, 8):
            for j in range(-8, 8):
                o = corg + Vector((i * pitch, j * pitch, 0))
                hit = bvh.ray_cast(o, Vector((0, 0, -1)), 0.6)
                if hit[0] is not None and hit[0].z > 0.42:
                    beads.append((hit[0], hit[1]))
        rng = np.random.default_rng(3)
        verts, faces = [], []
        pv = [v.co.copy() for v in sphere.data.vertices]
        pf = [tuple(p.vertices) for p in sphere.data.polygons]
        for loc, nrm in beads:
            q = Vector((0, 0, 1)).rotation_difference(nrm)
            s = 1.0 + rng.uniform(-0.06, 0.06)
            M = Matrix.Translation(loc + nrm * 0.0085) @ q.to_matrix().to_4x4() @ \
                Matrix.Rotation(rng.uniform(0, 3.14), 4, 'Z') @ Matrix.Diagonal((s, s, s * 0.78, 1))
            base = len(verts)
            verts += [tuple(M @ v) for v in pv]
            faces += [tuple(base + k for k in f) for f in pf]
        delete(sphere)
        bd = new_mesh_obj('bead_cover', verts, faces, smooth=True)
        assign_mat(bd, 'wood_beads')
        self.objs['bead_cover'] = bd
        log('beads', len(beads))
        # ---- rear bench ----
        def bench_top(x, y):
            return 0.018 * smoothstep(0.50, 0.62, abs(x)) - 0.004 * (abs(abs(x) - 0.22) < 0.01)
        rb, rbs = pillow('bench', 1.30, 0.46, 0.13, n=4.5, nx=34, ny=16, top_fn=bench_top)
        rb.data.transform(Matrix.Translation((0, -1.04, 0.335)) @ Matrix.Rotation(math.radians(5), 4, 'X'))
        rbk, _ = pillow('benchback', 1.30, 0.56, 0.13, n=4.5, nx=34, ny=18,
                        top_fn=lambda x, y: 0.02 * smoothstep(0.50, 0.62, abs(x)) - 0.005 * sum(
                            math.exp(-((y - c) / 0.009) ** 2) for c in (-0.08, 0.10)) * (abs(x) < 0.5))
        Mrb = Matrix.Translation((0, -1.33, 0.715)) @ Matrix.Rotation(math.radians(24), 4, 'X') @ \
            Matrix.Translation((0, -0.065, 0)) @ Matrix.Rotation(-math.pi / 2, 4, 'X')
        rbk.data.transform(Mrb)
        recalc_normals(rbk)
        bench = join([rb, rbk], name='rear_bench')
        assign_mat(bench, 'vinyl_seat')
        self.objs['rear_bench'] = bench
        self.anchor['rearLeftSeat'] = (-0.40, -1.02, 0.47)
        self.anchor['rearRightSeat'] = (0.40, -1.02, 0.47)
        self.anchor['rearCenterSeat'] = (0.0, -1.02, 0.48)

    @staticmethod
    def _bead_proto():
        verts = []
        rings, segs = 4, 7
        r = 0.0098
        verts.append((0, 0, -r))
        for i in range(1, rings):
            phi = math.pi * i / rings - math.pi / 2
            for j in range(segs):
                th = 2 * math.pi * j / segs
                verts.append((r * math.cos(phi) * math.cos(th), r * math.cos(phi) * math.sin(th), r * math.sin(phi)))
        verts.append((0, 0, r))
        faces = []
        for j in range(segs):
            faces.append((0, 1 + (j + 1) % segs, 1 + j))
        for i in range(rings - 2):
            for j in range(segs):
                a = 1 + i * segs + j
                b = 1 + i * segs + (j + 1) % segs
                faces.append((a, b, b + segs, a + segs))
        top = len(verts) - 1
        for j in range(segs):
            a = 1 + (rings - 2) * segs + j
            b = 1 + (rings - 2) * segs + (j + 1) % segs
            faces.append((a, b, top))
        ob = new_mesh_obj('bead', verts, faces, smooth=True)
        recalc_normals(ob)
        return ob

    # ---------------------------------------------------------------------------------
    def door_cards(self):
        E = self.E
        for side in (1, -1):
            s = 'r' if side > 0 else 'l'
            for door, yf, yr in (('f', 0.79, -0.165), ('r', -0.228, -1.02)):
                nm = f'doorcard_{door}{s}'

                def zmin(y, door=door):
                    if door == 'r':
                        d = math.hypot(y - tb.AXR, 0.0)
                        # follow the wheel-arch cutout at the lower rear
                        r = 0.40
                        if y < -0.80:
                            dz = math.sqrt(max(r * r - (y - tb.AXR) ** 2, 0))
                            return max(0.275, tb.AXLE_Z + dz + 0.02)
                    return 0.275

                ztop = 0.880

                def xin(y, z, door=door, yf=yf, yr=yr):
                    arm = 0.050 * smoothstep(0.575, 0.592, z) * (1 - smoothstep(0.655, 0.672, z)) * \
                        smoothstep(yr + 0.02, yr + 0.12, y) * (1 - smoothstep(yf - 0.10, yf - 0.02, y))
                    pocket = 0.0
                    if door == 'f':
                        pocket = 0.032 * smoothstep(0.33, 0.345, z) * (1 - smoothstep(0.405, 0.42, z)) * \
                            smoothstep(yr + 0.05, yr + 0.10, y) * (1 - smoothstep(yf - 0.30, yf - 0.24, y))
                    cap = 0.012 * smoothstep(0.84, 0.86, z)
                    edge = 0.012 * (1 - smoothstep(0.0, 0.03, min(y - yr, yf - y, z - zmin(y), ztop - z)))
                    return 0.676 - arm - pocket - cap + edge
                ny, nz = 34, 28
                verts = []
                for i in range(ny + 1):
                    y = lerp(yr, yf, i / ny)
                    z0 = zmin(y)
                    for j in range(nz + 1):
                        z = lerp(z0, ztop, j / nz)
                        verts.append((side * xin(y, z), y, z))
                card = new_mesh_obj(nm, verts, grid_faces(ny + 1, nz + 1), smooth=True)
                orient(card, np.array([-side, 0, 0]))
                # rim back to the door shell (closes the door volume)
                bm = bmesh.new()
                bm.from_mesh(card.data)
                edges = [e for e in bm.edges if e.is_boundary]
                ret = bmesh.ops.extrude_edge_only(bm, edges=edges)
                for v in [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]:
                    v.co.x = side * 0.765
                bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
                bm.to_mesh(card.data)
                bm.free()
                orient(card, np.array([-side, 0, 0]))
                set_sharp_by_angle(card, 70)
                assign_mat(card, 'plastic_dash')
                parts = [card]
                # speaker grille (front doors)
                if door == 'f':
                    sy, sz = yf - 0.13, 0.50
                    prof = [(0.0, 0.0)] + [(0.004 + 0.0055 * k, 0.0012 * (k % 2)) for k in range(10)] + [(0.062, 0.0),
                                                                                                        (0.066, -0.004)]
                    spk = lathe('speaker', prof, segments=32, axis='X', mat=mat('plastic_black'))
                    spk.data.transform(Matrix.Translation((side * (xin(sy, sz) - 0.001), sy, sz)) @
                                       Matrix.Diagonal((-side, 1, 1, 1)))
                    recalc_normals(spk)
                    orient(spk, np.array([-side, 0, 0]))
                    parts.append(spk)
                # inner handle in a recessed bezel
                hy, hz = yf - 0.09, 0.762
                bez = extrude_outline('hbez', rounded_rect_2d(hy - 0.055, hz - 0.018, hy + 0.055, hz + 0.018, 0.012, 4),
                                      0.0, 0.006, plane='YZ')
                bez.data.transform(Matrix.Translation((side * (xin(hy, hz) - 0.006), 0, 0)))
                assign_mat(bez, 'plastic_black')
                lev = box('hlever', (0.012, 0.075, 0.012), center=(side * (xin(hy, hz) - 0.010), hy + 0.005, hz),
                          bevel_w=0.004, mat=mat('chrome'))
                parts += [bez, lev]
                # lock pin on the window sill cap at the rear
                ly = yr + 0.07
                pin = lathe('pin', [(0.0, 0.0), (0.004, 0.0), (0.004, 0.03), (0.0065, 0.032), (0.0065, 0.046),
                                    (0.005, 0.05), (0.0, 0.051)], segments=12, mat=mat('plastic_black'))
                pin.data.transform(Matrix.Translation((side * 0.668, ly, ztop - 0.005)))
                parts.append(pin)
                dc = join(parts, name=nm)
                self.objs[nm] = dc
                # window crank (pivot node)
                cy, cz = (yf - 0.30, 0.520) if door == 'f' else (yf - 0.22, 0.520)
                cx = side * (xin(cy, cz) - 0.002)
                hub = lathe('crank_hub', [(0.0, 0.0), (0.016, 0.0), (0.016, 0.008), (0.010, 0.014), (0.0, 0.015)],
                            segments=16, axis='X', mat=mat('chrome'))
                arm = box('crank_arm', (0.008, 0.075, 0.012), center=(0.012, -0.034, 0.0), bevel_w=0.003,
                          mat=mat('chrome'))
                knob = lathe('crank_knob', [(0.0, 0.0), (0.009, 0.0), (0.0095, 0.03), (0.007, 0.034), (0.0, 0.035)],
                             segments=12, axis='X', mat=mat('plastic_black'))
                knob.data.transform(Matrix.Translation((0.014, -0.068, 0.0)))
                ck = join([hub, arm, knob], name=f'window_crank_{door}{s}')
                if side > 0:
                    ck.data.transform(Matrix.Diagonal((-1, 1, 1, 1)))
                    recalc_normals(ck)
                ck.data.transform(Matrix.Translation((cx, cy, cz)))
                self.objs[ck.name] = ck
                self.pivots[ck.name] = (Vector((cx, cy, cz)), (-side, 0, 0), (0, 3600), 'spin')
                if door == 'f':
                    self.anchor['windowCrankF' + ('R' if side > 0 else 'L')] = (cx - side * 0.04, cy - 0.068, cz)

    # ---------------------------------------------------------------------------------
    def cabin_trim(self):
        # headliner with a sagging rear-left corner
        verts = []
        nx, ny = 24, 22
        for i in range(nx + 1):
            x = lerp(-0.60, 0.60, i / nx)
            for j in range(ny + 1):
                y = lerp(-0.935, 0.045, j / ny)
                z = tb.T_roof(x, y) - 0.034
                edge = smoothstep(0.48, 0.60, abs(x))
                z -= 0.030 * edge
                ey = max(smoothstep(-0.02, 0.045, y), smoothstep(-0.86, -0.935, y))
                z -= 0.022 * ey
                sag = 0.045 * math.exp(-(((x + 0.46) / 0.13) ** 2 + ((y + 0.82) / 0.13) ** 2))
                z -= sag
                verts.append((x, y, z))
        hl = new_mesh_obj('headliner', verts, grid_faces(nx + 1, ny + 1), smooth=True)
        orient(hl, np.array([0, 0, -1]))
        assign_mat(hl, 'fabric_headliner')
        self.objs['headliner'] = hl
        # dome light
        dz = tb.T_roof(0, -0.25) - 0.036
        dl = extrude_outline('dome', rounded_rect_2d(-0.065, -0.30, 0.065, -0.20, 0.012, 4), dz - 0.012, dz, plane='XY')
        add_bevel(dl, 0.003, 2, angle=30)
        apply_modifiers(dl)
        assign_mat(dl, 'lens_clear')
        dlb = extrude_outline('domeb', rounded_rect_2d(-0.075, -0.31, 0.075, -0.19, 0.015, 4), dz - 0.006, dz + 0.002,
                              plane='XY', mat=mat('plastic_dash'))
        self.objs['dome_light'] = join([dlb, dl], name='dome_light')
        self.anchor['cabinLight'] = (0.0, -0.25, dz - 0.014)
        # pillar trims (A, B, C) as rounded strips
        parts = []
        for side in (1, -1):
            a_path = [(side * 0.705, 0.83, 0.90), (side * 0.66, 0.45, 1.08), (side * 0.60, 0.05, 1.255)]
            parts.append(sweep('apil', resample(np.array(a_path), 12), rrect_profile(0.02, 0.075, 0.009, 3),
                               normals=np.tile(np.array([-side, 0, 0.3]), (12, 1)), cap=True))
            b_path = [(side * 0.665, -0.205, 0.30), (side * 0.655, -0.20, 0.88), (side * 0.585, -0.19, 1.26)]
            parts.append(sweep('bpil', resample(np.array(b_path), 10), rrect_profile(0.022, 0.085, 0.009, 3),
                               normals=np.tile(np.array([-side, 0, 0.0]), (10, 1)), cap=True))
            c_path = [(side * 0.66, -1.07, 0.90), (side * 0.62, -0.97, 1.10), (side * 0.575, -0.905, 1.255)]
            parts.append(sweep('cpil', resample(np.array(c_path), 10), rrect_profile(0.025, 0.13, 0.01, 3),
                               normals=np.tile(np.array([-side, 0, 0.2]), (10, 1)), cap=True))
            # rear quarter trim beside the bench
            q = extrude_outline('qtrim', [(-1.05, 0.30), (-1.46, 0.36), (-1.55, 0.95), (-1.10, 0.92)], side * 0.69,
                                side * 0.70, plane='YZ')
            parts.append(q)
            # kick panel + sill scuff plate
            parts.append(box('sill', (0.05, 1.95, 0.045), center=(side * 0.695, -0.13, 0.232), bevel_w=0.008))
            k = extrude_outline('kick', [(0.85, 0.26), (0.97, 0.33), (0.97, 0.60), (0.86, 0.62)], side * 0.70,
                                side * 0.715, plane='YZ')
            parts.append(k)
        trim = join(parts, name='pillar_trims')
        assign_mat(trim, 'plastic_dash')
        self.objs['pillar_trims'] = trim
        # parcel shelf with speaker grilles
        shelf = extrude_outline('parcel', rounded_rect_2d(-0.66, -1.62, 0.66, -1.36, 0.04, 4), 0.955, 0.968,
                                plane='XY')
        spk = []
        for x in (-0.40, 0.40):
            sp = lathe('pspk', [(0.0, 0.0)] + [(0.006 * k, 0.001 * (k % 2)) for k in range(1, 12)] + [(0.07, 0.0)],
                       segments=32, mat=mat('plastic_black'))
            sp.data.transform(Matrix.Translation((x, -1.50, 0.9685)))
            spk.append(sp)
        sh = join([shelf], name='parcel_shelf')
        assign_mat(sh, 'carpet')
        self.objs['parcel_shelf'] = join([sh] + spk, name='parcel_shelf')

    # ---------------------------------------------------------------------------------
    def floor_console_pedals(self):
        # carpeted floor with tunnel, toe board, rear riser
        verts = []
        nx, ny = 30, 40
        for i in range(nx + 1):
            x = lerp(-0.70, 0.70, i / nx)
            for j in range(ny + 1):
                y = lerp(-1.42, 0.96, j / ny)
                z = 0.238
                z += 0.115 * (1 - smoothstep(0.10, 0.17, abs(x)))         # tunnel
                z += 0.27 * smoothstep(0.62, 0.95, y) ** 1.3                # toe board
                z += 0.07 * smoothstep(-0.70, -0.82, y)                      # rear seat riser
                verts.append((x, y, z))
        fl = new_mesh_obj('floor', verts, grid_faces(nx + 1, ny + 1), smooth=True)
        orient(fl, np.array([0, 0, 1]))
        assign_mat(fl, 'carpet')
        mats_ = []
        for cx, cy, w, d in ((0.37, 0.42, 0.42, 0.50), (-0.37, 0.42, 0.42, 0.50), (0.38, -0.55, 0.40, 0.30),
                             (-0.38, -0.55, 0.40, 0.30)):
            m = extrude_outline('mat', rounded_rect_2d(cx - w / 2, cy - d / 2, cx + w / 2, cy + d / 2, 0.04, 4), 0.0, 0.006,
                                plane='XY')
            for v in m.data.vertices:
                y = v.co.y
                v.co.z += 0.240 + 0.27 * smoothstep(0.62, 0.95, y) ** 1.3 + 0.07 * smoothstep(-0.70, -0.82, y)
            mats_.append(m)
        mt = join(mats_, name='floor_mats')
        assign_mat(mt, 'rubber')
        self.objs['floor'] = fl
        self.objs['floor_mats'] = mt
        # centre console over the tunnel
        sec = [(-0.12, 0.0), (0.12, 0.0), (0.125, 0.06), (0.10, 0.075), (-0.10, 0.075), (-0.125, 0.06)]
        path = []
        for y in np.linspace(0.58, -0.42, 14):
            z = 0.345 + 0.09 * smoothstep(0.30, 0.58, y) + 0.12 * smoothstep(-0.12, -0.24, y)
            path.append((0.0, y, z))
        con = sweep('console', np.array(path), [(b, a) for a, b in rounded_poly_2d(sec, [0.01, 0.01, 0.02, 0.02, 0.02, 0.02], 3)],
                    normals=np.tile(np.array([0, 0, 1.0]), (14, 1)), cap=True)
        assign_mat(con, 'plastic_dash')
        set_sharp_by_angle(con, 50)
        self.objs['console'] = con
        # gear lever with boot (pivot at the ball)
        gb = np.array([0.050, 0.235, 0.385])
        boot = lathe('boot', [(0.065, 0.0)] + [(0.058 - 0.0045 * k + 0.0045 * (k % 2), 0.012 * k) for k in range(1, 10)]
                     + [(0.014, 0.125)], segments=24, mat=mat('vinyl_seat'))
        boot.data.transform(Matrix.Translation(Vector(gb + np.array([0, 0, 0.035]))))
        bezel = lathe('gbez', [(0.07, 0.0), (0.075, 0.004), (0.068, 0.009)], segments=24, mat=mat('plastic_dash'))
        bezel.data.transform(Matrix.Translation(Vector(gb + np.array([0, 0, 0.033]))))
        shaft = tube('gshaft', [tuple(gb), tuple(gb + np.array([0, -0.018, 0.25]))], 0.0075, 10)
        assign_mat(shaft, 'metal_steel')
        knob = lathe('gknob', [(0.0, -0.01), (0.012, -0.008), (0.020, 0.008), (0.022, 0.024), (0.018, 0.036),
                               (0.010, 0.042), (0.0, 0.043)], segments=20, mat=mat('plastic_black'))
        knob.data.transform(Matrix.Translation(Vector(gb + np.array([0, -0.020, 0.262]))))
        gl = join([shaft, knob, boot], name='gear_lever')
        self.objs['gear_lever'] = gl
        self.objs['gear_bezel'] = bezel
        self.pivots['gear_lever'] = (Vector(gb), (1, 0, 0), (-12, 12), 'gimbal')
        self.anchor['gearKnob'] = tuple(gb + np.array([0, -0.020, 0.29]))
        # handbrake lever (driver side of the console)
        hb = np.array([0.095, -0.075, 0.432])
        lev_path = resample(np.array([hb, hb + np.array([0, 0.12, 0.035]), hb + np.array([0, 0.235, 0.075])]), 10)
        lev = sweep('hblev', lev_path, rrect_profile(0.028, 0.032, 0.01, 3), scale=np.linspace(0.9, 1.1, 10), cap=True,
                    normals=np.tile(np.array([0, 0, 1.0]), (10, 1)))
        btn = lathe('hbbtn', [(0.0, 0.0), (0.008, 0.0), (0.008, 0.012), (0.0, 0.013)], segments=12, axis='Y',
                    mat=mat('chrome'))
        btn.data.transform(Matrix.Translation(Vector(hb + np.array([0, 0.235, 0.075]))))
        hbl = join([lev, btn], name='handbrake_lever')
        assign_mat(hbl, 'plastic_black')
        self.objs['handbrake_lever'] = hbl
        self.pivots['handbrake_lever'] = (Vector(hb), (1, 0, 0), (0, 22), 'hinge')
        self.anchor['handbrake'] = tuple(hb + np.array([0, 0.20, 0.07]))
        # pedals (hanging), pivots under the dash
        for nm, x, w, anc in (('pedal_clutch', 0.165, 0.065, 'pedalClutch'), ('pedal_brake', 0.305, 0.075, 'pedalBrake'),
                              ('pedal_throttle', 0.455, 0.045, 'pedalThrottle')):
            piv = np.array([x, 0.78, 0.66])
            pad_c = np.array([x, 0.70, 0.36 if nm != 'pedal_throttle' else 0.31])
            arm = sweep('parm', resample(np.array([piv, piv + np.array([0, -0.03, -0.12]), pad_c + np.array([0, 0.01, 0.02])]), 8),
                        rrect_profile(0.014, 0.008, 0.003, 2), cap=True, normals=np.tile(np.array([1.0, 0, 0]), (8, 1)))
            assign_mat(arm, 'metal_steel')
            pad = box('ppad', (w, 0.014, 0.075 if nm != 'pedal_throttle' else 0.11), center=(0, 0, 0), bevel_w=0.004)
            ribs = [box('rib', (w * 0.8, 0.003, 0.004), center=(0, -0.0085, -0.03 + k * 0.012)) for k in range(6)]
            padj = join([pad] + ribs, name='padj')
            padj.data.transform(Matrix.Translation(Vector(pad_c)) @ Matrix.Rotation(math.radians(-20), 4, 'X'))
            assign_mat(padj, 'rubber')
            pd = join([arm, padj], name=nm)
            self.objs[nm] = pd
            self.pivots[nm] = (Vector(piv), (1, 0, 0), (0, 18), 'hinge')
            self.anchor[anc] = tuple(pad_c + np.array([0, -0.012, 0]))

    # ---------------------------------------------------------------------------------
    def mirror_visors_belts(self):
        # rearview mirror: stem from the header, ball joint, head (pivot), glass facing back
        top = np.array([0.0, 0.055, 1.272])
        ball = np.array([0.0, 0.118, 1.218])
        stem = tube('rv_stem', [tuple(top), tuple(top + (ball - top) * 0.5 + np.array([0, 0, 0.004])), tuple(ball)], 0.0065, 10)
        foot = box('rv_foot', (0.05, 0.035, 0.012), center=tuple(top + np.array([0, 0, 0.004])), bevel_w=0.004)
        mount = join([stem, foot], name='rearview_mount')
        assign_mat(mount, 'plastic_black')
        self.objs['rearview_mount'] = mount
        head, _ = pillow('rv_head', 0.245, 0.034, 0.066, n=4.0, nx=26, ny=8)
        head.data.transform(Matrix.Translation(Vector(ball + np.array([0, -0.004, -0.033]))))
        assign_mat(head, 'plastic_black')
        gl = quad('mirror_rear_surface', tuple(ball + np.array([0, -0.0215, 0.0])), (1, 0, 0), (0, 0, 1), 0.228, 0.054,
                  'mirror')
        orient(gl, np.array([0, -1, 0]))
        self.objs['rearview_mirror'] = head
        self.objs['mirror_rear_surface'] = gl
        self.pivots['rearview_mirror'] = (Vector(ball), (0, 0, 1), (-15, 15), 'ball')
        self.anchor['rearviewMirror'] = tuple(ball + np.array([0, -0.022, 0.0]))
        self.anchor['amuletHang'] = tuple(ball + np.array([0.0, -0.005, -0.04]))
        # sun visors (driver = pivot node; passenger static)
        for side, nm in ((1, 'sun_visor_driver'), (-1, 'sun_visor_pass')):
            x0, x1 = (0.13, 0.55) if side > 0 else (-0.55, -0.13)
            hinge_y, hinge_z = 0.018, 1.262
            v, _ = pillow(nm, x1 - x0, 0.150, 0.022, n=4.0, nx=22, ny=10)
            # pillow is along local y (depth): stowed flat under the headliner, hanging back from the hinge
            v.data.transform(Matrix.Translation(((x0 + x1) / 2, hinge_y - 0.080, hinge_z - 0.020)))
            rod = tube('vrod', [(x0 - 0.01 if side > 0 else x1 + 0.01, hinge_y, hinge_z),
                                (x1 if side > 0 else x0, hinge_y, hinge_z)], 0.005, 10)
            clip = box('vclip', (0.03, 0.02, 0.012), center=((x1 + 0.03 if side > 0 else x0 - 0.03), hinge_y - 0.01, hinge_z),
                       bevel_w=0.003)
            assign_mat(v, 'fabric_headliner')
            assign_mat(rod, 'plastic_dash')
            assign_mat(clip, 'plastic_dash')
            vis = join([v, rod], name=nm)
            self.objs[nm] = vis
            self.objs[nm + '_clip'] = clip
            if side > 0:
                self.pivots[nm] = (Vector((0.34, hinge_y, hinge_z)), (1, 0, 0), (0, 95), 'hinge')
                self.anchor['sunVisorDriver'] = (0.34, hinge_y - 0.08, hinge_z - 0.035)
        # seat belts (front: B-pillar webbing; rear: C-pillar webbing) + buckles
        parts = []
        for side in (1, -1):
            pth = [(side * 0.625, -0.245, 1.16), (side * 0.632, -0.27, 0.80), (side * 0.645, -0.30, 0.45),
                   (side * 0.655, -0.33, 0.30)]
            parts.append(sweep('belt', resample(np.array(pth), 12), rrect_profile(0.004, 0.047, 0.0015, 1),
                               normals=np.tile(np.array([side, 0, 0.0]), (12, 1)), cap=True))
            parts.append(box('dring', (0.02, 0.012, 0.06), center=(side * 0.635, -0.24, 1.165), bevel_w=0.004))
            for sx in (0.372 * side,):
                bk = box('buckle', (0.03, 0.06, 0.05), center=(sx - side * 0.27, -0.32, 0.47), bevel_w=0.006)
                parts.append(bk)
            for x in (side * 0.58, side * 0.12):
                pth = [(x, -1.40, 0.97), (x * 0.98, -1.33, 0.72), (x * 0.96, -1.26, 0.48)]
                parts.append(sweep('rbelt', resample(np.array(pth), 8), rrect_profile(0.004, 0.047, 0.0015, 1),
                                   normals=np.tile(np.array([0, 1.0, 0.3]), (8, 1)), cap=True))
        belts = join(parts, name='seat_belts')
        assign_mat(belts, 'vinyl_seat')
        self.objs['seat_belts'] = belts
