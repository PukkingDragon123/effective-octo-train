# Build the intro motorbike (moto.glb): an old generic 1990s Thai step-through underbone
# (unbadged), with leg shields, front wire basket, round headlight in the handlebar nacelle,
# chrome mirrors, kick-starter, worn seat, finned horizontal engine, spoked wheels.
#
#   blender -b --factory-startup -P tools/blender/build_moto.py -- [--nobake] [--size 2048] [--samples 8]
#
# Frame: Blender X right, Y forward, Z up; origin on the ground at mid-wheelbase.
import os
import sys
import math
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))

import numpy as np
import bpy
import bmesh
from mathutils import Vector, Matrix
import vlib
from vlib import (log, new_mesh_obj, grid_faces, sweep, lathe, tube, box, extrude_outline, resample, rounded_rect_2d,
                  rrect_profile, circle_profile, assign_mat, mat, join, lerp, smoothstep, recalc_normals, add_bevel,
                  apply_modifiers, set_sharp_by_angle, add_solidify, delete, duplicate, set_origin, parent_keep, empty,
                  set_pivot_props)

AXF = np.array([0.0, 0.635, 0.275])
AXR = np.array([0.0, -0.585, 0.275])
HEAD = np.array([0.0, 0.360, 0.840])                       # steering head (on the axis)
STEER = np.array([0.0, 0.438, -0.899])                      # axis pointing down to the front axle
STEER /= np.linalg.norm(STEER)
R_WHEEL = 0.276


def M_to(p, z_dir):
    q = Vector((0, 0, 1)).rotation_difference(Vector(z_dir))
    return Matrix.Translation(Vector(p)) @ q.to_matrix().to_4x4()


def orient(ob, d):
    me = ob.data
    if len(me.polygons):
        n = np.mean([p.normal[:] for p in me.polygons], axis=0)
        if np.dot(n, d) < 0:
            recalc_normals(ob, inside=True)
    return ob


# ---------------------------------------------------------------------------------------
def wheel(name, front):
    parts = []
    # tyre 2.50-17: lathe around X with grooves
    R, w = R_WHEEL, 0.034
    rim_r = 0.218
    prof = [(-0.024, rim_r + 0.004), (-0.031, rim_r + 0.018), (-0.035, 0.245), (-0.033, 0.262), (-0.024, 0.272),
            (-0.012, R), (-0.009, R - 0.004), (-0.005, R - 0.004), (-0.003, R), (0.003, R), (0.005, R - 0.004),
            (0.009, R - 0.004), (0.012, R), (0.024, 0.272), (0.033, 0.262), (0.035, 0.245), (0.031, rim_r + 0.018),
            (0.024, rim_r + 0.004)]
    segs = 72
    verts = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        for x, r in prof:
            rr = r
            if r >= R - 1e-6 and i % 3 == 0 and abs(x) > 0.004:
                rr = R - 0.0035
            verts.append((x, rr * math.cos(a), rr * math.sin(a)))
    ty = new_mesh_obj(name + '_tyre', verts, grid_faces(segs, len(prof), closed_u=True, flip=True), smooth=True)
    recalc_normals(ty)
    set_sharp_by_angle(ty, 40)
    assign_mat(ty, 'rubber')
    parts.append(ty)
    # chrome rim (U channel)
    rim = lathe(name + '_rim', [(0.232, -0.019), (0.226, -0.021), (0.214, -0.016), (0.205, -0.008), (0.203, 0.0),
                                (0.205, 0.008), (0.214, 0.016), (0.226, 0.021), (0.232, 0.019)], segments=56, axis='X',
                mat=mat('chrome'))
    parts.append(rim)
    # hub with drum brake
    hub = lathe(name + '_hub', [(0.0, -0.075), (0.035, -0.075), (0.072, -0.07), (0.075, -0.05), (0.06, -0.04),
                                (0.034, -0.035), (0.034, 0.035), (0.045, 0.045), (0.048, 0.06), (0.03, 0.065),
                                (0.0, 0.065)], segments=32, axis='X', mat=mat('metal_steel'))
    parts.append(hub)
    # 36 spokes (crossed lacing)
    sp = []
    for k in range(36):
        a = 2 * math.pi * k / 36
        side = -1 if k % 2 else 1
        x_h = side * (0.040 if k % 4 < 2 else 0.032)
        a2 = a + (0.32 if (k // 2) % 2 else -0.32)
        p0 = (x_h, 0.040 * math.cos(a), 0.040 * math.sin(a))
        p1 = (side * 0.004, 0.205 * math.cos(a2), 0.205 * math.sin(a2))
        sp.append(tube('spoke', [p0, p1], 0.0016, 4, cap=False))
    spokes = join(sp, name=name + '_spokes')
    assign_mat(spokes, 'metal_steel')
    parts.append(spokes)
    # axle nut + brake arm
    nut = lathe(name + '_nut', [(0.0, 0.07), (0.012, 0.07), (0.012, 0.085), (0.0, 0.086)], segments=6, axis='X',
                mat=mat('metal_steel'))
    parts.append(nut)
    ob = join(parts, name=name)
    ob.data.transform(Matrix.Translation(Vector(AXF if front else AXR)))
    return ob


def main():
    a = vlib.args_after_dashes()
    bake = '--nobake' not in a
    size = int(a[a.index('--size') + 1]) if '--size' in a else 2048
    samples = int(a[a.index('--samples') + 1]) if '--samples' in a else 8
    out = os.path.join(REPO, 'public', 'assets', 'vehicle')
    if '--out' in a:
        out = a[a.index('--out') + 1]
    t0 = time.time()
    vlib.reset_scene()
    # one atlas for the whole bike
    for k, d in vlib.MAT_DEFS.items():
        if d['atlas']:
            d['atlas'] = 'moto'
    vlib.MAT_DEFS['paint_moto']['color'] = (0.30, 0.07, 0.06)
    body, steer = [], []

    # ---- frame ---------------------------------------------------------------------------
    bone = [(0, 0.395, 0.735), (0, 0.32, 0.62), (0, 0.20, 0.47), (0, 0.06, 0.41), (0, -0.10, 0.44), (0, -0.22, 0.55),
            (0, -0.34, 0.66), (0, -0.50, 0.70), (0, -0.88, 0.73)]
    frame = sweep('frame', resample(np.array(bone, float), 30), circle_profile(0.030, 14), cap=True)
    head_tube = lathe('headtube', [(0.0, -0.09), (0.027, -0.09), (0.027, 0.09), (0.0, 0.09)], segments=20)
    head_tube.data.transform(M_to(HEAD, -STEER))
    for o in (frame, head_tube):
        assign_mat(o, 'paint_moto')
    body += [frame, head_tube]
    # underbone cover (plastic shroud over the tube between the shield and the seat)
    secs = []
    path = resample(np.array(bone[1:7], float), 14)
    cov = sweep('bone_cover', path, rrect_profile(0.17, 0.12, 0.05, 4), scale=np.concatenate([np.linspace(1.15, 1.0, 7),
                                                                                              np.linspace(1.0, 1.25, 7)]),
                normals=np.tile(np.array([0, 0, 1.0]), (14, 1)), cap=True)
    assign_mat(cov, 'paint_moto')
    body.append(cov)
    # leg shield: curved panel around the head tube
    verts = []
    nu, nv = 20, 12
    for i in range(nu + 1):
        s = lerp(-1, 1, i / nu)
        for j in range(nv + 1):
            z = lerp(0.40, 0.88, j / nv)
            w = lerp(0.30, 0.46, smoothstep(0.40, 0.75, z)) * (1 - 0.15 * smoothstep(0.80, 0.88, z))
            y0 = 0.30 + (z - 0.40) * 0.10
            verts.append((s * w / 2, y0 - 0.11 * s * s - 0.02 * (1 - s * s), z))
    shield = new_mesh_obj('leg_shield', verts, grid_faces(nu + 1, nv + 1), smooth=True)
    orient(shield, np.array([0, 1, 0]))
    add_solidify(shield, 0.004, offset=-1)
    add_bevel(shield, 0.0015, 2, angle=40)
    apply_modifiers(shield)
    assign_mat(shield, 'paint_moto')
    body.append(shield)
    # inner shield (rider side) black plastic lining with a small glovebox lid
    lid = box('shield_lid', (0.16, 0.012, 0.09), center=(0.0, 0.272, 0.70), bevel_w=0.004)
    assign_mat(lid, 'plastic_black')
    body.append(lid)

    # ---- engine ---------------------------------------------------------------------------
    crank = box('crankcase', (0.30, 0.30, 0.24), center=(0.0, -0.05, 0.33), bevel_w=0.05)
    assign_mat(crank, 'metal_steel')
    covers = []
    for sx in (1, -1):
        c = lathe('casecover', [(0.0, 0.0), (0.11, 0.0), (0.118, 0.012), (0.105, 0.028), (0.0, 0.03)], segments=32,
                  axis='X', mat=mat('metal_steel'))
        c.data.transform(Matrix.Translation((sx * 0.15, -0.06, 0.33)) @ Matrix.Diagonal((sx, 1, 1, 1)))
        recalc_normals(c)
        covers.append(c)
    # finned cylinder pointing forward, tilted up 12 deg
    fins = []
    prof = [(0.0, 0.0)]
    for k in range(9):
        y0 = 0.012 + k * 0.016
        prof += [(0.040, y0), (0.068, y0 + 0.002), (0.068, y0 + 0.006), (0.040, y0 + 0.008)]
    prof += [(0.045, 0.16), (0.06, 0.17), (0.055, 0.20), (0.03, 0.215), (0.0, 0.217)]
    cyl = lathe('cylinder', prof, segments=28, mat=mat('metal_steel'))
    cyl.data.transform(Matrix.Translation((0.0, 0.08, 0.37)) @ Matrix.Rotation(math.radians(-78), 4, 'X'))
    plug = tube('plug', [(0.0, 0.29, 0.43), (0.0, 0.31, 0.47)], 0.009, 10)
    plugcap = tube('plugcap', [(0.0, 0.31, 0.47), (0.0, 0.30, 0.52), (-0.04, 0.22, 0.56)], 0.008, 8)
    assign_mat(plugcap, 'rubber')
    carb = box('carb', (0.07, 0.08, 0.06), center=(0.0, 0.03, 0.50), bevel_w=0.015)
    airbox = box('airbox', (0.16, 0.14, 0.10), center=(0.0, -0.10, 0.52), bevel_w=0.03)
    assign_mat(airbox, 'plastic_black')
    eng = join([crank, cyl, plug, carb] + covers, name='engine')
    assign_mat(eng, 'metal_steel')
    body += [eng, plugcap, airbox]
    # exhaust: header from the head down and back on the right, chrome muffler + heat shield
    hdr = [(0.03, 0.27, 0.36), (0.06, 0.24, 0.24), (0.12, 0.10, 0.20), (0.15, -0.15, 0.22), (0.16, -0.30, 0.26)]
    header = sweep('header', resample(np.array(hdr), 18), circle_profile(0.017, 12), cap=False)
    muf = lathe('muffler', [(0.0, 0.0), (0.020, 0.0), (0.044, 0.06), (0.048, 0.10), (0.048, 0.40), (0.040, 0.47),
                            (0.016, 0.50), (0.016, 0.54), (0.0, 0.54)], segments=24, axis='Y', mat=mat('chrome'))
    muf.data.transform(Matrix.Translation((0.16, -0.26, 0.262)) @ Matrix.Rotation(math.radians(188), 4, 'Z') @
                       Matrix.Rotation(math.radians(-8), 4, 'X'))
    shield_p = []
    for k in range(9):
        y = -0.30 - k * 0.04
        shield_p.append((0.16 + 0.052, y, 0.27 + 0.0 * k))
    hs = sweep('heatshield', np.array(shield_p), [(-0.03, 0.0), (-0.015, 0.004), (0.0, 0.005), (0.015, 0.004), (0.03, 0.0)],
               closed_profile=False, normals=np.tile(np.array([1.0, 0, 0.3]), (9, 1)), cap=False)
    add_solidify(hs, 0.0015)
    apply_modifiers(hs)
    ex = join([header, muf, hs], name='exhaust')
    assign_mat(ex, 'chrome')
    body.append(ex)
    # kick-starter (right) + gear pedal (left) + footrests
    kshaft = tube('kshaft', [(0.15, -0.14, 0.31), (0.19, -0.14, 0.31)], 0.012, 10)
    karm = sweep('karm', resample(np.array([(0.19, -0.14, 0.31), (0.20, -0.25, 0.38), (0.205, -0.32, 0.43)]), 8),
                 rrect_profile(0.012, 0.02, 0.004, 2), cap=True)
    kpeg = tube('kpeg', [(0.205, -0.32, 0.43), (0.255, -0.325, 0.43)], 0.011, 10)
    assign_mat(kpeg, 'rubber')
    gear = sweep('gear', resample(np.array([(-0.19, -0.04, 0.30), (-0.20, 0.06, 0.29), (-0.20, 0.14, 0.31)]), 6),
                 rrect_profile(0.01, 0.018, 0.004, 2), cap=True)
    gtoe = tube('gtoe', [(-0.20, 0.14, 0.31), (-0.25, 0.14, 0.31)], 0.009, 8)
    fbar = tube('footbar', [(-0.22, 0.06, 0.30), (0.22, 0.06, 0.30)], 0.011, 10)
    pegs = [tube('peg', [(sx * 0.16, 0.06, 0.30), (sx * 0.25, 0.06, 0.30)], 0.017, 12) for sx in (1, -1)]
    for p in pegs + [gtoe]:
        assign_mat(p, 'rubber')
    mech = join([kshaft, karm, gear, fbar], name='controls')
    assign_mat(mech, 'metal_steel')
    body += [mech, kpeg, gtoe] + pegs

    # ---- rear: swingarm, chain case, shocks, cowl, fender, seat, rack, tail light ------------
    piv = np.array([0.0, -0.13, 0.35])
    arms = []
    for sx in (1, -1):
        pth = resample(np.array([piv + np.array([sx * 0.085, 0, 0]), AXR + np.array([sx * 0.085, 0.02, 0])]), 6)
        arms.append(sweep('swing', pth, rrect_profile(0.022, 0.045, 0.008, 3), cap=True,
                          normals=np.tile(np.array([0, 0, 1.0]), (6, 1))))
    chain = extrude_outline('chaincase', rounded_rect_2d(-0.62, 0.23, -0.06, 0.33, 0.05, 6), -0.125, -0.095, plane='YZ')
    add_bevel(chain, 0.006, 2, angle=30)
    apply_modifiers(chain)
    assign_mat(chain, 'plastic_black')
    sw = join(arms, name='swingarm')
    assign_mat(sw, 'paint_moto')
    shocks = []
    for sx in (1, -1):
        b0 = AXR + np.array([sx * 0.10, 0.03, 0.02])
        b1 = np.array([sx * 0.11, -0.66, 0.70])
        d = (b1 - b0) / np.linalg.norm(b1 - b0)
        body_t = tube('shock', [tuple(b0), tuple(b1)], 0.012, 12)
        coil = []
        for k in range(60):
            t = 0.18 + 0.64 * k / 59
            ang = k * 0.55
            nrm = np.cross(d, np.array([1.0, 0, 0]))
            nrm /= np.linalg.norm(nrm)
            bn = np.cross(d, nrm)
            coil.append(b0 + (b1 - b0) * t + (nrm * math.cos(ang) + bn * math.sin(ang)) * 0.024)
        spring = sweep('spring', np.array(coil), circle_profile(0.0042, 6), cap=True)
        shocks += [body_t, spring]
    sh = join(shocks, name='shocks')
    assign_mat(sh, 'chrome')
    body += [sw, chain, sh]
    # rear cowl (body cover under the seat) with side covers
    secs = []
    ys = np.linspace(-0.16, -0.94, 16)
    verts = []
    prof_n = 18
    for y in ys:
        t = (y + 0.16) / -0.78
        w = lerp(0.26, 0.16, t ** 1.4)
        top = lerp(0.70, 0.76, smoothstep(0.0, 0.5, t))
        bot = lerp(0.42, 0.66, smoothstep(0.0, 1.0, t))
        for k in range(prof_n):
            a = 2 * math.pi * k / prof_n
            c, s = math.cos(a), math.sin(a)
            x = w / 2 * np.sign(c) * abs(c) ** 0.6
            z = (top + bot) / 2 + (top - bot) / 2 * np.sign(s) * abs(s) ** 0.6
            verts.append((x, y, z))
    cowl = new_mesh_obj('cowl', verts, grid_faces(len(ys), prof_n, closed_v=True), smooth=True)
    bm = bmesh.new()
    bm.from_mesh(cowl.data)
    bmesh.ops.holes_fill(bm, edges=bm.edges, sides=0)
    bm.to_mesh(cowl.data)
    bm.free()
    recalc_normals(cowl)
    assign_mat(cowl, 'paint_moto')
    body.append(cowl)
    # rear fender
    fp = []
    for k in range(16):
        a = math.radians(95 + 85 * k / 15)
        fp.append(AXR + np.array([0, (R_WHEEL + 0.045) * math.cos(a), (R_WHEEL + 0.045) * math.sin(a)]))
    rf = sweep('rfender', np.array(fp), [(-0.05, 0.0), (-0.045, 0.02), (0.0, 0.026), (0.045, 0.02), (0.05, 0.0)],
               closed_profile=False, normals=np.array([(p - AXR) / np.linalg.norm(p - AXR) for p in fp]), cap=False)
    add_solidify(rf, 0.002)
    apply_modifiers(rf)
    assign_mat(rf, 'paint_moto')
    body.append(rf)
    # seat (worn dual seat)
    from taxi_interior import pillow
    seat, _ = pillow('seat', 0.235, 0.68, 0.085, n=3.0, nx=20, ny=16,
                     top_fn=lambda x, y: 0.012 * (1 - (x / 0.12) ** 2) - 0.008 * math.exp(-((y + 0.05) / 0.08) ** 2))
    seat.data.transform(Matrix.Translation((0.0, -0.49, 0.735)) @ Matrix.Rotation(math.radians(2), 4, 'X'))
    assign_mat(seat, 'vinyl_seat')
    strap = tube('seatstrap', [(-0.12, -0.45, 0.80), (0.0, -0.45, 0.832), (0.12, -0.45, 0.80)], 0.004, 6)
    assign_mat(strap, 'vinyl_seat')
    body += [seat, strap]
    # rear rack (chrome)
    rk = [tube('rack', [(-0.10, -0.74, 0.80), (-0.10, -0.98, 0.80), (0.10, -0.98, 0.80), (0.10, -0.74, 0.80)], 0.008, 8)]
    for y in (-0.80, -0.87, -0.94):
        rk.append(tube('rackx', [(-0.10, y, 0.80), (0.10, y, 0.80)], 0.0055, 6))
    for sx in (1, -1):
        rk.append(tube('rackleg', [(sx * 0.10, -0.74, 0.80), (sx * 0.12, -0.66, 0.70)], 0.007, 8))
    rack = join(rk, name='rack')
    assign_mat(rack, 'chrome')
    body.append(rack)
    # tail light + rear indicators + plate bracket
    tl_house = box('tail_house', (0.13, 0.05, 0.07), center=(0.0, -0.955, 0.745), bevel_w=0.012)
    assign_mat(tl_house, 'plastic_black')
    body.append(tl_house)
    tl = box('light_tail', (0.115, 0.012, 0.055), center=(0.0, -0.984, 0.745), bevel_w=0.008)
    assign_mat(tl, 'lens_red')
    inds = []
    for sx in (1, -1):
        for y, z in ((-0.93, 0.72),):
            st = tube('istalk', [(sx * 0.06, y, z), (sx * 0.15, y, z)], 0.006, 8)
            assign_mat(st, 'plastic_black')
            ln = lathe('ilens', [(0.0, 0.0), (0.022, 0.0), (0.024, 0.03), (0.0, 0.045)], segments=14, axis='X',
                       mat=mat('lens_amber'))
            ln.data.transform(Matrix.Translation((sx * 0.15, y, z)) @ Matrix.Diagonal((sx, 1, 1, 1)))
            recalc_normals(ln)
            inds += [st, ln]
    plate = box('plate_bracket', (0.17, 0.004, 0.12), center=(0.0, -0.99, 0.62), bevel_w=0.003)
    assign_mat(plate, 'metal_steel')
    body += inds + [plate]
    # stands
    cs = tube('centrestand', [(-0.13, -0.18, 0.30), (-0.13, -0.40, 0.22), (0.13, -0.40, 0.22), (0.13, -0.18, 0.30)],
              0.011, 8)
    ss = tube('sidestand', [(-0.15, -0.05, 0.30), (-0.17, -0.30, 0.20)], 0.01, 8)
    stands = join([cs, ss], name='stands')
    assign_mat(stands, 'paint_black')
    body.append(stands)
    wheel_r = wheel('wheel_r', False)

    # ---- steering assembly -----------------------------------------------------------------
    up = -STEER
    top_clamp = HEAD + up * 0.11
    bot_clamp = HEAD - up * 0.10
    fork = []
    side_vec = np.array([1.0, 0, 0])
    for sx in (1, -1):
        a0 = top_clamp + side_vec * sx * 0.075
        a1 = AXF + side_vec * sx * 0.075 + np.array([0, 0.0, 0.0])
        mid = a0 + (a1 - a0) * 0.45
        fork.append(tube('stanchion', [tuple(a0), tuple(mid)], 0.016, 14))
        sl = tube('slider', [tuple(mid), tuple(a1 + up * 0.02)], 0.022, 14)
        fork.append(sl)
        cover = tube('forkcover', [tuple(a0 + up * 0.02), tuple(a0 - up * 0.17)], 0.027, 14)
        fork.append(cover)
    clamp_b = box('clamp', (0.20, 0.06, 0.03), center=(0, 0, 0), bevel_w=0.008)
    clamp_b.data.transform(M_to(bot_clamp, up))
    fk = join(fork, name='fork')
    assign_mat(fk, 'chrome')
    assign_mat(clamp_b, 'paint_moto')
    steer += [fk, clamp_b]
    # front fender (on the fork)
    fp = []
    for k in range(18):
        a = math.radians(-5 + 125 * k / 17)
        fp.append(AXF + np.array([0, (R_WHEEL + 0.04) * math.cos(a), (R_WHEEL + 0.04) * math.sin(a)]))
    ff = sweep('ffender', np.array(fp), [(-0.055, 0.0), (-0.05, 0.022), (0.0, 0.03), (0.05, 0.022), (0.055, 0.0)],
               closed_profile=False, normals=np.array([(p - AXF) / np.linalg.norm(p - AXF) for p in fp]), cap=False)
    add_solidify(ff, 0.002)
    apply_modifiers(ff)
    assign_mat(ff, 'paint_moto')
    steer.append(ff)
    # handlebar nacelle (cover) with the headlight in front and the speedo on top
    nac_c = HEAD + up * 0.20 + np.array([0, 0.06, 0.0])
    nac, _ = pillow('nacelle', 0.30, 0.22, 0.13, n=2.8, nx=26, ny=16)
    nac.data.transform(Matrix.Translation(Vector(nac_c - np.array([0, 0, 0.065]))))
    assign_mat(nac, 'paint_moto')
    steer.append(nac)
    hl_c = nac_c + np.array([0, 0.115, -0.005])
    rim = lathe('hl_rim', [(0.0, -0.06), (0.074, -0.05), (0.081, -0.01), (0.083, 0.0), (0.079, 0.006), (0.072, 0.004)],
                segments=40, axis='Y', mat=mat('chrome'))
    rim.data.transform(Matrix.Translation(Vector(hl_c)) @ Matrix.Rotation(math.radians(-3), 4, 'X'))
    refl = lathe('hl_refl', [(0.0, -0.05), (0.035, -0.045), (0.06, -0.02), (0.072, 0.0)], segments=32, axis='Y',
                 mat=mat('chrome'))
    refl.data.transform(Matrix.Translation(Vector(hl_c)) @ Matrix.Rotation(math.radians(-3), 4, 'X'))
    recalc_normals(refl, inside=True)
    bulb = lathe('hl_bulb', [(0.0, -0.045), (0.009, -0.04), (0.010, -0.02), (0.006, -0.012), (0.0, -0.01)], segments=12,
                 axis='Y', mat=mat('lens_clear'))
    bulb.data.transform(Matrix.Translation(Vector(hl_c)) @ Matrix.Rotation(math.radians(-3), 4, 'X'))
    lens_prof = [(0.0, 0.012)] + [(0.0725 * k / 10, 0.012 - 0.008 * (k / 10) ** 2 - 0.0006 * (k % 2)) for k in range(1, 11)]
    lens = lathe('light_head', lens_prof, segments=40, axis='Y', mat=mat('lens_clear'))
    lens.data.transform(Matrix.Translation(Vector(hl_c)) @ Matrix.Rotation(math.radians(-3), 4, 'X'))
    orient(lens, np.array([0, 1, 0]))
    steer += [rim, refl, bulb]
    speedo = lathe('speedo', [(0.0, 0.0), (0.042, 0.0), (0.045, 0.01), (0.04, 0.016), (0.0, 0.016)], segments=28,
                   mat=mat('plastic_black'))
    speedo.data.transform(Matrix.Translation(Vector(nac_c + np.array([0, -0.02, 0.06]))) @
                          Matrix.Rotation(math.radians(-25), 4, 'X'))
    sglass = lathe('speedo_glass', [(0.0, 0.017), (0.036, 0.016)], segments=24, mat=mat('glass'))
    sglass.data.transform(Matrix.Translation(Vector(nac_c + np.array([0, -0.02, 0.06]))) @
                          Matrix.Rotation(math.radians(-25), 4, 'X'))
    steer += [speedo, sglass]
    # bars + grips + levers + switch pods + mirrors
    gy = nac_c[1] - 0.06
    gz = nac_c[2] + 0.02
    bars = tube('bars', [(-0.25, gy - 0.02, gz), (-0.12, gy, gz), (0.12, gy, gz), (0.25, gy - 0.02, gz)], 0.011, 12)
    assign_mat(bars, 'chrome')
    grips = []
    for sx in (1, -1):
        g = lathe('grip', [(0.0, 0.0), (0.016, 0.0), (0.017, 0.01)] + [(0.0165 + 0.0008 * (k % 2), 0.01 + 0.01 * k)
                                                                       for k in range(11)] +
                  [(0.018, 0.118), (0.0, 0.12)], segments=16, axis='X', mat=mat('rubber'))
        g.data.transform(Matrix.Translation((sx * 0.25, gy - 0.02, gz)) @ Matrix.Diagonal((sx, 1, 1, 1)))
        recalc_normals(g)
        grips.append(g)
        pod = box('switchpod', (0.04, 0.045, 0.045), center=(sx * 0.23, gy - 0.02, gz), bevel_w=0.01)
        assign_mat(pod, 'plastic_black')
        grips.append(pod)
        lever = sweep('lever', resample(np.array([(sx * 0.24, gy + 0.01, gz + 0.005), (sx * 0.31, gy + 0.045, gz - 0.005),
                                                 (sx * 0.37, gy + 0.04, gz - 0.01)]), 8), rrect_profile(0.006, 0.014, 0.003, 2),
                      cap=True)
        assign_mat(lever, 'metal_steel')
        grips.append(lever)
        # mirror: chrome stalk + round chrome-backed head facing the rider
        m0 = np.array([sx * 0.18, gy - 0.01, gz + 0.01])
        m1 = np.array([sx * 0.25, gy - 0.05, gz + 0.24])
        st = tube('mstalk', [tuple(m0), tuple(m0 + (m1 - m0) * 0.5 + np.array([sx * 0.02, 0, 0])), tuple(m1)], 0.0055, 10)
        assign_mat(st, 'chrome')
        head = lathe('mhead', [(0.0, 0.0), (0.05, 0.0), (0.057, 0.006), (0.058, 0.014), (0.052, 0.018), (0.0, 0.022)],
                     segments=28, axis='Y', mat=mat('chrome'))
        head.data.transform(Matrix.Translation(Vector(m1 + np.array([0, 0.012, 0.05]))) @
                            Matrix.Rotation(math.radians(180 + sx * 12), 4, 'Z'))
        mg = lathe('mglass', [(0.0, 0.0), (0.049, 0.0)], segments=24, axis='Y', mat=mat('mirror'))
        mg.data.transform(Matrix.Translation(Vector(m1 + np.array([0, 0.0115, 0.05]))) @
                          Matrix.Rotation(math.radians(180 + sx * 12), 4, 'Z'))
        orient(mg, np.array([0, -1, 0]))
        grips += [st, head, mg]
    steer += [bars] + grips
    # front wire basket below the headlight
    bk = []
    bc = HEAD + up * 0.02 + np.array([0, 0.30, -0.08])
    bw, bd, bh = 0.32, 0.22, 0.19
    x0, x1, y0, y1, z0, z1 = bc[0] - bw / 2, bc[0] + bw / 2, bc[1] - bd / 2, bc[1] + bd / 2, bc[2] - bh / 2, bc[2] + bh / 2
    rim_top = [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    bk.append(tube('brim', rim_top + [rim_top[0]], 0.004, 6, cap=False))
    bk.append(tube('bbot', [(x0 + 0.02, y0 + 0.02, z0), (x1 - 0.02, y0 + 0.02, z0), (x1 - 0.02, y1 - 0.02, z0),
                            (x0 + 0.02, y1 - 0.02, z0), (x0 + 0.02, y0 + 0.02, z0)], 0.003, 6, cap=False))
    for k in range(13):
        t = k / 12
        x = lerp(x0, x1, t)
        bk.append(tube('bw', [(x, y1, z1), (lerp(x0 + 0.02, x1 - 0.02, t), y1 - 0.02, z0)], 0.0018, 4))
        bk.append(tube('bw', [(x, y0, z1), (lerp(x0 + 0.02, x1 - 0.02, t), y0 + 0.02, z0)], 0.0018, 4))
    for k in range(9):
        t = k / 8
        y = lerp(y0, y1, t)
        bk.append(tube('bw', [(x0, y, z1), (x0 + 0.02, lerp(y0 + 0.02, y1 - 0.02, t), z0)], 0.0018, 4))
        bk.append(tube('bw', [(x1, y, z1), (x1 - 0.02, lerp(y0 + 0.02, y1 - 0.02, t), z0)], 0.0018, 4))
    for k in range(1, 4):
        z = lerp(z0, z1, k / 4)
        inset = 0.02 * (1 - k / 4)
        ring = [(x0 + inset, y0 + inset, z), (x1 - inset, y0 + inset, z), (x1 - inset, y1 - inset, z),
                (x0 + inset, y1 - inset, z), (x0 + inset, y0 + inset, z)]
        bk.append(tube('bh', ring, 0.0018, 4, cap=False))
    for k in range(1, 8):
        x = lerp(x0 + 0.02, x1 - 0.02, k / 8)
        bk.append(tube('bb', [(x, y0 + 0.02, z0), (x, y1 - 0.02, z0)], 0.0018, 4))
    bk.append(tube('bstay', [(0.0, y0, z0 + 0.04), tuple(HEAD - up * 0.06 + np.array([0, 0.03, 0]))], 0.007, 8))
    basket = join(bk, name='basket')
    assign_mat(basket, 'metal_steel')
    steer.append(basket)
    # front indicators on the nacelle sides
    for sx in (1, -1):
        ln = lathe('find', [(0.0, 0.0), (0.02, 0.0), (0.022, 0.025), (0.0, 0.04)], segments=14, axis='Y',
                   mat=mat('lens_amber'))
        ln.data.transform(Matrix.Translation(Vector(nac_c + np.array([sx * 0.16, 0.07, -0.02]))))
        steer.append(ln)
    wheel_f = wheel('wheel_f', True)

    # ---- nodes -----------------------------------------------------------------------------
    body_ob = join(body, name='body')
    hb = join(steer, name='handlebar')
    for o in (body_ob, hb, wheel_r, wheel_f, lens, tl):
        o.data.name = o.name
    tl.name = 'light_tail'
    tl.data.name = 'light_tail'
    set_origin(hb, HEAD)
    set_pivot_props(hb, tuple(-STEER), (-38, 38), 'steer')
    set_origin(wheel_f, AXF)
    set_origin(wheel_r, AXR)
    for w in (wheel_f, wheel_r):
        set_pivot_props(w, (-1, 0, 0), None, 'spin')   # +angle = rolling forward
    set_origin(lens, hl_c)
    set_origin(tl, (0.0, -0.984, 0.745))
    root = empty('moto', (0, 0, 0))
    for o in (body_ob, hb, wheel_r, tl):
        parent_keep(o, root)
    for o in (wheel_f, lens):
        parent_keep(o, hb)
    E = {}
    E['seat'] = ((0.0, -0.32, 0.832), root)
    E['footL'] = ((-0.205, 0.06, 0.318), root)
    E['footR'] = ((0.205, 0.06, 0.318), root)
    E['eye'] = ((0.0, -0.20, 1.44), root)
    E['handleL'] = ((-0.31, gy - 0.02, gz), hb)
    E['handleR'] = ((0.31, gy - 0.02, gz), hb)
    E['headlight'] = (tuple(hl_c + np.array([0, 0.012, 0])), hb)
    empties = []
    for k, (p, par) in E.items():
        e = empty(k, p)
        e['anchor'] = k
        parent_keep(e, par)
        empties.append(e)
    objs = [root, body_ob, hb, wheel_r, wheel_f, lens, tl] + empties
    meshes = [o for o in objs if o.type == 'MESH']
    tot = sum(vlib.tri_count(o) for o in meshes)
    log('moto tris', tot, {o.name: vlib.tri_count(o) for o in meshes})
    vlib.atlas_unwrap(meshes, 'moto', margin=0.003)
    files = {}
    if bake:
        tex_dir = os.path.join(REPO, '.shots', 'blender-bake')
        glass = [o for o in meshes if all((m is None) or (m.get('atlas', '') == '') for m in o.data.materials)]
        imgs = vlib.bake_masks(meshes, ['moto'], size=size, samples=samples, out_dir=tex_dir)
        p = os.path.join(tex_dir, 'mask_moto.jpg')
        vlib.save_jpeg(imgs['moto'], p, quality=88)
        files['moto'] = p
    glb = os.path.join(out, 'moto.glb')
    vlib.export_glb(glb, objs)
    mat_atlas = {k: 'moto' for k, v in vlib.MAT_DEFS.items() if v['atlas']}
    if files:
        vlib.inject_masks(glb, files, mat_atlas, extras={'generator': 'tools/blender/build_moto.py', 'tris': int(tot)})
    vlib.rename_anchor_nodes(glb)
    log('exported', glb, os.path.getsize(glb) // 1024, 'KB', round(time.time() - t0, 1), 's')


if __name__ == '__main__':
    main()
