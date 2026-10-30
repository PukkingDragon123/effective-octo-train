# Build the hero taxi (taxi.glb) and its exterior LOD (taxi_lod.glb).
#
#   blender -b --factory-startup -P tools/blender/build_taxi.py -- [--nobake] [--size 2048]
#           [--samples 8] [--out public/assets/vehicle] [--blend path.blend]
#
# See tools/blender/README.md for the node / material / pivot contract.
import os
import sys
import time
import math
import json

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))

import numpy as np
import bpy
import bmesh
from mathutils import Vector, Matrix
import vlib
from vlib import log, join, delete, duplicate, set_origin, parent_keep, empty, set_pivot_props, assign_mat, mat
import taxi_body as tb
import taxi_exterior as te
import taxi_parts as tp
import taxi_interior as ti
import weather

ATLASES = ['ext_paint', 'ext_parts', 'int_hard', 'int_soft']

TAXI_ANCHORS = ['driverSeat', 'frontPassengerSeat', 'rearLeftSeat', 'rearRightSeat', 'rearCenterSeat', 'driverEye',
                'steeringWheel', 'gearKnob', 'handbrake', 'keySlot', 'pedalThrottle', 'pedalBrake', 'pedalClutch',
                'radioKnob', 'meter', 'cabinLight', 'headlightStalk', 'wiperStalk', 'hornPad', 'windowCrankFR',
                'windowCrankFL', 'amuletHang', 'rearviewMirror', 'mirrorLeft', 'mirrorRight', 'trunk', 'roofTop', 'hood',
                'headlightL', 'headlightR', 'taillightL', 'taillightR', 'gloveBox', 'sunVisorDriver', 'doorFL', 'doorFR',
                'doorRL', 'doorRR', 'dashSticker']


def parse_args():
    a = vlib.args_after_dashes()
    opt = dict(bake=True, size=2048, samples=4, ao=8, out=os.path.join(REPO, 'public', 'assets', 'vehicle'), blend=None,
               pack=True)
    i = 0
    while i < len(a):
        k = a[i]
        if k == '--nobake':
            opt['bake'] = False
        elif k == '--size':
            opt['size'] = int(a[i + 1]); i += 1
        elif k == '--samples':
            opt['samples'] = int(a[i + 1]); i += 1
        elif k == '--out':
            opt['out'] = a[i + 1]; i += 1
        elif k == '--blend':
            opt['blend'] = a[i + 1]; i += 1
        elif k == '--ao':
            opt['ao'] = int(a[i + 1]); i += 1
        elif k == '--nopack':
            opt['pack'] = False
        i += 1
    return opt


def centroid(ob):
    vs = np.array([ob.matrix_world @ v.co for v in ob.data.vertices])
    return vs.mean(axis=0)


def inner_panel(ob, name, offset=0.022):
    """Underside liner of a hood / trunk lid (painted black), so the lid reads solid when open."""
    o = duplicate(ob, name)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.normal_update()
    # keep only the outer skin (faces whose normal points mostly up/out), push inward
    for v in bm.verts:
        v.co -= v.normal * offset
    for f in bm.faces:
        f.normal_flip()
    bm.to_mesh(o.data)
    bm.free()
    for vg in list(o.vertex_groups):
        o.vertex_groups.remove(vg)
    o.data.normals_split_custom_set([(0, 0, 0)] * len(o.data.loops)) if o.data.has_custom_normals else None
    assign_mat(o, 'paint_black')
    m = o.modifiers.new('Dec', 'DECIMATE')
    m.ratio = 0.35
    vlib.apply_modifiers(o)
    return o


def dent(ob, center, radius, depth):
    """Small weathering dent pushed along -normal (keeps custom normals roughly valid)."""
    c = Vector(center)
    me = ob.data
    for v in me.vertices:
        d = (v.co - c).length
        if d < radius:
            f = (1 - (d / radius) ** 2) ** 2
            v.co -= v.normal * depth * f


# Triangle budget (~80-120k for the hero model): parts that are seen small or never up close are
# collapsed; panels, glass, lamps, displays and the dash keep their full meshes.
DECIMATE = {
    'wheel_fl': 0.42, 'wheel_fr': 0.42, 'wheel_rl': 0.42, 'wheel_rr': 0.42, 'grille': 0.45,
    'roof_sign_base': 0.45, 'bumper_inserts': 0.5, 'underbody': 0.35, 'exhaust': 0.5, 'wiper_l': 0.55,
    'wiper_r': 0.55, 'seal_ws': 0.55, 'seal_rw': 0.55, 'drip_l': 0.5, 'drip_r': 0.5, 'parcel_shelf': 0.45,
    'floor': 0.6, 'steering_wheel': 0.8, 'centre_stack': 0.8, 'seat_driver': 0.7, 'seat_pass': 0.7,
    'rear_bench': 0.7, 'doorcard_fl': 0.62, 'doorcard_fr': 0.62, 'doorcard_rl': 0.62, 'doorcard_rr': 0.62,
    'pillar_trims': 0.7, 'glovebox_lid': 0.75, 'console': 0.8, 'seat_belts': 0.7, 'light_head_l': 0.7,
    'light_head_r': 0.7, 'headlamp_unit_l': 0.6, 'headlamp_unit_r': 0.6, 'tail_unit_l': 0.6, 'tail_unit_r': 0.6,
}
KEEP = {'body', 'door_fl', 'door_fr', 'door_rl', 'door_rr', 'hood', 'trunk', 'dash', 'cluster', 'meter_box',
        'headliner', 'bead_cover', 'roof_sign', 'vacant_lamp', 'meter_display', 'radio_display', 'cluster_glass',
        'dome_light'}


def decimate_part(o, ratio):
    n = vlib.tri_count(o)
    m = o.modifiers.new('Dec', 'DECIMATE')
    m.decimate_type = 'COLLAPSE'
    m.ratio = ratio
    m.use_collapse_triangulate = True
    vlib.apply_modifiers(o)
    if o.data.has_custom_normals:
        with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
    o.data.shade_smooth()
    vlib.set_sharp_by_angle(o, 38)
    o.data.validate()
    return n - vlib.tri_count(o)


def apply_budget(parts):
    saved = 0
    for name, o in parts.items():
        if o.type != 'MESH' or name in KEEP or name.startswith(('glass_', 'needle_', 'gauge_', 'plate_', 'mirror_')):
            continue
        n = vlib.tri_count(o)
        r = DECIMATE.get(name)
        if r is None:
            r = 0.6 if n > 700 else None
        if r is None or r >= 1:
            continue
        saved += decimate_part(o, r)
    log('budget: removed', saved, 'tris')


def main():
    opt = parse_args()
    t0 = time.time()
    vlib.reset_scene()
    E = te.Ext()
    E.build()
    log('exterior panels', round(time.time() - t0, 1))
    P = tp.Parts(E)
    P.build()
    log('parts', round(time.time() - t0, 1))
    I = ti.Interior(E, P)
    I.build()
    log('interior', round(time.time() - t0, 1))
    X = dict(E.objs)
    X.update(P.objs)
    IN = I.objs
    parts_tris = sorted(((n, vlib.tri_count(o)) for n, o in list(X.items()) + list(IN.items())
                         if o.type == 'MESH'), key=lambda x: -x[1])
    log('PARTS', ' '.join(f'{n}:{c}' for n, c in parts_tris[:60]))
    apply_budget(X)
    apply_budget(IN)
    handles = [tuple(centroid(X[f'handle_{k}'])) for k in ('fl', 'fr', 'rl', 'rr')]

    # ---------------- weathering ---------------------------------------------------------
    dent(X['door_rl'], (-0.84, -0.62, 0.40), 0.06, 0.006)

    # ---------------- hood / trunk ----------------------------------------------------------
    hood = join([X.pop('hood'), inner_panel(E.objs['hood'], 'hood_inner')], name='hood')
    trunk = join([X.pop('trunk'), inner_panel(E.objs['trunk'], 'trunk_inner')], name='trunk')

    # ---------------- doors ---------------------------------------------------------------
    doors = {}
    for key in ('fl', 'fr', 'rl', 'rr'):
        s = key[1]
        fr = key[0]
        parts = [X.pop('door_' + key), X.pop(f'sash_{fr}{s}'), X.pop(f'beltstrip_{fr}{s}'), X.pop(f'handle_{fr}{s}'),
                 X.pop(f'moulding_{fr}{s}'), IN.pop(f'doorcard_{fr}{s}')]
        if fr == 'f':
            parts += [X.pop(f'keyhole_f{s}'), X.pop(f'sail_{s}'), X.pop(f'mirror_housing_{s}')]
        else:
            parts += [X.pop(f'divbar_{s}')]
        doors[key] = join(parts, name='door_' + key)

    # ---------------- static body + interior ------------------------------------------------
    named_nodes = {}
    keep_sep = ['glass_windshield', 'glass_rear', 'glass_fl', 'glass_fr', 'glass_rl', 'glass_rr', 'glass_ql',
                'glass_qr', 'mirror_left_surface', 'mirror_right_surface', 'light_head_l', 'light_head_r',
                'light_ind_fl', 'light_ind_fr', 'light_ind_rl', 'light_ind_rr', 'light_tail_l', 'light_tail_r',
                'light_brake', 'light_reverse', 'roof_sign', 'plate_front', 'plate_rear', 'wiper_l', 'wiper_r',
                'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']
    for k in keep_sep:
        named_nodes[k] = X.pop(k)
    body = join([o for o in X.values()], name='body')
    in_sep = ['steering_wheel', 'needle_speedo', 'needle_tacho', 'needle_fuel', 'needle_temp', 'gear_lever',
              'handbrake_lever', 'pedal_throttle', 'pedal_brake', 'pedal_clutch', 'glovebox_lid', 'sun_visor_driver',
              'window_crank_fl', 'window_crank_fr', 'window_crank_rl', 'window_crank_rr', 'rearview_mirror',
              'mirror_rear_surface', 'key_slot', 'meter_display', 'radio_display', 'gauge_speedo',
              'gauge_tacho', 'gauge_fuel', 'gauge_temp', 'vacant_lamp', 'cluster_glass', 'dome_light']
    for k in in_sep:
        named_nodes[k] = IN.pop(k)
    interior = join([o for o in IN.values()], name='interior')
    named_nodes.update(body=body, interior=interior, hood=hood, trunk=trunk)
    for k, d in doors.items():
        named_nodes['door_' + k] = d
    for nm, ob in named_nodes.items():
        ob.name = nm
        ob.data.name = nm
        for vg in list(ob.vertex_groups):
            ob.vertex_groups.remove(vg)

    # ---------------- pivots / origins -----------------------------------------------------
    piv = {}
    for side, s in ((1, 'r'), (-1, 'l')):
        piv['door_f' + s] = ((side * 0.800, 0.805, 0.60), (0, 0, side), (0, 70), 'hinge')
        piv['door_r' + s] = ((side * 0.800, -0.212, 0.60), (0, 0, side), (0, 70), 'hinge')
    piv['hood'] = ((0.0, 1.034, tb.T_hood(0, 1.034) - 0.01), (1, 0, 0), (0, 55), 'hinge')
    piv['trunk'] = ((0.0, -1.648, tb.T_deck(0, -1.648) - 0.01), (-1, 0, 0), (0, 65), 'hinge')
    for nm in ('wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'):
        ob = named_nodes[nm]
        piv[nm] = (tuple(ob.location), (-1, 0, 0), None, 'spin')   # +angle = rolling forward
    for nm in ('wiper_l', 'wiper_r'):
        ob = named_nodes[nm]
        piv[nm] = (tuple(ob['_pivot']), tuple(ob['_axis']), (0, 95), 'hinge')
        del ob['_pivot'], ob['_axis']
    for nm, (p, ax, rng, kind) in I.pivots.items():
        piv[nm] = (tuple(p), tuple(ax), rng, kind)
    for nm, (p, ax, rng, kind) in piv.items():
        ob = named_nodes[nm]
        if nm.startswith('wheel_'):
            set_pivot_props(ob, ax, rng, kind)
            continue
        set_origin(ob, p)
        set_pivot_props(ob, ax, rng, kind)
    # origins of plain nodes at their bbox centre (lights, glass, displays) for nicer transforms
    for nm, ob in named_nodes.items():
        if nm in piv or nm in ('body', 'interior'):
            continue
        set_origin(ob, centroid(ob))

    # ---------------- hierarchy --------------------------------------------------------------
    root = empty('taxi', (0, 0, 0))
    root['contract'] = 'tools/blender/README.md'
    parent_keep(body, root)
    for nm in ('wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'):
        parent_keep(named_nodes[nm], root)
    child_of = {
        'glass_fl': 'door_fl', 'glass_fr': 'door_fr', 'glass_rl': 'door_rl', 'glass_rr': 'door_rr',
        'glass_ql': 'door_rl', 'glass_qr': 'door_rr', 'mirror_left_surface': 'door_fl',
        'mirror_right_surface': 'door_fr', 'window_crank_fl': 'door_fl', 'window_crank_fr': 'door_fr',
        'window_crank_rl': 'door_rl', 'window_crank_rr': 'door_rr', 'mirror_rear_surface': 'rearview_mirror',
    }
    order = sorted(named_nodes.keys(), key=lambda n: (n in child_of, n))
    for nm in order:
        ob = named_nodes[nm]
        if nm in ('body',) or nm.startswith('wheel_'):
            continue
        parent_keep(ob, named_nodes[child_of.get(nm, 'body')])

    # ---------------- anchors ---------------------------------------------------------------
    A = dict(I.anchor)
    hl = centroid(named_nodes['light_head_l'])
    hr = centroid(named_nodes['light_head_r'])
    tl = centroid(named_nodes['light_tail_l'])
    tr = centroid(named_nodes['light_tail_r'])
    A['headlightL'], A['headlightR'] = tuple(hl), tuple(hr)
    A['taillightL'], A['taillightR'] = tuple(tl), tuple(tr)
    A['mirrorLeft'] = tuple(centroid(named_nodes['mirror_left_surface']))
    A['mirrorRight'] = tuple(centroid(named_nodes['mirror_right_surface']))
    A['trunk'] = (0.0, -2.07, tb.T_deck(0, -2.0) - 0.005)
    A['roofTop'] = (0.0, -0.33, tb.T_roof(0, -0.33))
    A['hood'] = (0.0, 1.60, tb.T_hood(0, 1.6))
    for key, y in (('doorFL', -0.055), ('doorFR', -0.055), ('doorRL', -0.905), ('doorRR', -0.905)):
        side = 1 if key.endswith('R') else -1
        loc, n = E.surf_x(y, 0.742, side)
        A[key] = tuple(np.array(loc) + np.array(n) * 0.01)
    parent_of = {'hornPad': 'steering_wheel', 'steeringWheel': 'steering_wheel', 'gloveBox': 'glovebox_lid',
                 'sunVisorDriver': 'sun_visor_driver', 'rearviewMirror': 'rearview_mirror',
                 'amuletHang': 'rearview_mirror', 'trunk': 'trunk', 'hood': 'hood', 'doorFL': 'door_fl',
                 'doorFR': 'door_fr', 'doorRL': 'door_rl', 'doorRR': 'door_rr', 'mirrorLeft': 'door_fl',
                 'mirrorRight': 'door_fr', 'windowCrankFR': 'window_crank_fr', 'windowCrankFL': 'window_crank_fl',
                 'keySlot': 'key_slot', 'gearKnob': 'gear_lever', 'handbrake': 'handbrake_lever',
                 'pedalThrottle': 'pedal_throttle', 'pedalBrake': 'pedal_brake', 'pedalClutch': 'pedal_clutch'}
    missing = [k for k in TAXI_ANCHORS if k not in A]
    assert not missing, missing
    anchors = {}
    for k in TAXI_ANCHORS:
        e = empty(k if k not in named_nodes else k + '__anchor', A[k])
        e['anchor'] = k
        parent_keep(e, named_nodes[parent_of.get(k, 'body')])
        anchors[k] = e

    all_objs = [root] + list(named_nodes.values()) + list(anchors.values())
    meshes = [o for o in all_objs if o.type == 'MESH']
    tris = {o.name: vlib.tri_count(o) for o in meshes}
    ext_names = [n for n in tris if n not in ('interior',) and n not in in_sep]
    log('TRIS total', sum(tris.values()), 'interior+int nodes', sum(tris[n] for n in tris if n == 'interior' or n in in_sep),
        'exterior', sum(tris[n] for n in ext_names))
    for n, c in sorted(tris.items(), key=lambda x: -x[1])[:12]:
        log('  ', n, c)

    # ---------------- weld + tidy ----------------------------------------------------------
    for o in meshes:
        bad = o.data.validate(clean_customdata=False)
        if bad:
            log('validated (fixed)', o.name)

    # ---------------- UV atlases + painted bake ------------------------------------------------
    for o in [o for o in bpy.data.objects if o.name.startswith('master_')]:
        delete(o)
    out = opt['out']
    os.makedirs(out, exist_ok=True)
    tex_dir = os.path.join(REPO, '.shots', 'blender-bake')
    for a in ATLASES:
        used = vlib.atlas_unwrap(meshes, a, margin=0.003)
        log('atlas', a, len(used), 'objects')
    files, lod_files = {}, {}
    if opt['bake']:
        glass_like = [o for o in meshes if all((m is None) or (m.get('atlas', '') == '') for m in o.data.materials)]
        for o in glass_like:
            o.hide_render = True
        ctx = weather.Ctx(
            kind='taxi', axles=[(tb.AXF, tb.AXLE_Z), (tb.AXR, tb.AXLE_Z)], arch_r=0.335, handles=handles,
            seat_centres=[(0.37, -0.14, 0.52), (-0.37, -0.14, 0.52), (0.37, -0.42, 0.82), (-0.37, -0.42, 0.82),
                          (0.40, -1.02, 0.49), (-0.40, -1.02, 0.49), (0.0, -1.02, 0.49), (0.40, -1.30, 0.78),
                          (-0.40, -1.30, 0.78)],
            heel=(0.40, 0.62), dash=(0.40, 0.95, 0.78), length=4.27)
        files, lod_files = weather.bake_all([o for o in meshes if o not in glass_like], ATLASES, ctx,
                                            size=opt['size'], samples=opt['samples'], ao_samples=opt['ao'],
                                            out_dir=tex_dir, sizes={'int_soft': opt['size'] // 2})
        for o in glass_like:
            o.hide_render = False
        log('baked', round(time.time() - t0, 1))
    else:
        log('nobake: exporting flat export materials')
    used_mats = weather.remap_export(meshes)
    log('export materials', len(used_mats), used_mats)

    if opt['blend']:
        bpy.ops.wm.save_as_mainfile(filepath=opt['blend'])

    # ---------------- export full model -------------------------------------------------------
    export_atlas = {'paint': 'ext_paint', 'chrome': 'ext_parts', 'rubber_black': 'ext_parts', 'lens': 'ext_parts',
                    'sign_lamp': 'ext_parts', 'plastic_dash': 'int_hard', 'fabric_carpet': 'int_hard',
                    'vinyl_seat': 'int_soft'}
    glb = os.path.join(out, 'taxi.glb')
    vlib.export_glb(glb, all_objs)
    extras = {'generator': 'tools/blender/build_taxi.py', 'units': 'metres', 'forward': '-Z', 'driverSide': '+X',
              'textures': 'baseColor = painted, weathered albedo; occlusion/metallicRoughness = ORM atlas',
              'tris': int(sum(vlib.tri_count(o) for o in meshes))}
    weather.inject_textures(glb, files, export_atlas, extras=extras)
    vlib.rename_anchor_nodes(glb)
    if opt['pack']:
        pack_glb(glb)
    log('exported', glb, os.path.getsize(glb) // 1024, 'KB', 'tris', extras['tris'])

    # ---------------- LOD -------------------------------------------------------------------
    for o in all_objs:
        o.name = o.name + '__full'
        if o.type == 'MESH':
            o.data.name = o.name
    build_lod(named_nodes, out, lod_files, export_atlas, opt)
    log('done', round(time.time() - t0, 1))


def pack_glb(path):
    """gltfpack: vertex-cache / fetch optimisation + KHR_mesh_quantization for normals (float
    positions and UVs: the game rebuilds glass / mirror geometry in place)."""
    import subprocess
    tmp = path + '.pack.glb'
    cmd = ['npx', '--yes', 'gltfpack@0.21.0', '-i', path, '-o', tmp, '-kn', '-km', '-ke', '-vpf', '-vtf']
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=600, cwd=REPO)
        os.replace(tmp, path)
        log('gltfpack ok', path)
    except Exception as e:
        log('gltfpack failed (keeping the plain export)', getattr(e, 'stderr', e))
        if os.path.exists(tmp):
            os.remove(tmp)


def build_lod(N, out, lod_files, export_atlas, opt):
    """Exterior-only low LOD (~15k tris) for distance and the menu cinematic."""
    def copy_world(ob, name):
        o = duplicate(ob, name + '_tmp')
        o.parent = None
        o.matrix_world = ob.matrix_world.copy()
        vlib.apply_transform(o)
        for c in list(o.keys()):
            del o[c]
        return o

    def decimate(o, target):
        n = vlib.tri_count(o)
        if n > target:
            m = o.modifiers.new('Dec', 'DECIMATE')
            m.decimate_type = 'COLLAPSE'
            m.ratio = max(target / n, 0.01)
            m.use_collapse_triangulate = True
            vlib.apply_modifiers(o)
        if o.data.has_custom_normals:
            with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
                bpy.ops.mesh.customdata_custom_splitnormals_clear()
        o.data.shade_smooth()
        vlib.set_sharp_by_angle(o, 34)
        o.data.validate()
        return o

    lod = []
    root = empty('taxi_lod', (0, 0, 0))
    body_src = ['body', 'door_fl', 'door_fr', 'door_rl', 'door_rr', 'hood', 'trunk', 'wiper_l', 'wiper_r',
                'plate_front', 'plate_rear']
    body = join([copy_world(N[n], n + '_c') for n in body_src], name='body')
    # drop tiny / hidden-in-distance details before decimating: keep everything, decimation handles it
    decimate(body, 6400)
    glass = join([copy_world(N[n], n + '_c') for n in N if n.startswith('glass_')], name='glass')
    decimate(glass, 300)
    interior = copy_world(N['interior'], 'interior_c')
    interior.name = 'interior'
    decimate(interior, 1000)
    nodes = [body, glass, interior]
    for nm in ('light_head_l', 'light_head_r', 'light_tail_l', 'light_tail_r', 'light_brake', 'roof_sign'):
        o = copy_world(N[nm], nm)
        o.name = nm
        decimate(o, 200)
        nodes.append(o)
    for nm in ('wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'):
        o = copy_world(N[nm], nm)
        o.name = nm
        decimate(o, 620)
        set_origin(o, N[nm].matrix_world.translation)
        set_pivot_props(o, (-1, 0, 0), None, 'spin')
        nodes.append(o)
    for o in nodes:
        o.data.name = o.name
        parent_keep(o, root)
    tot = sum(vlib.tri_count(o) for o in nodes)
    log('LOD tris', tot)
    glb = os.path.join(out, 'taxi_lod.glb')
    vlib.export_glb(glb, [root] + nodes)
    weather.inject_textures(glb, lod_files, export_atlas, extras={'lodOf': 'taxi.glb', 'tris': int(tot)})
    if opt['pack']:
        pack_glb(glb)
    log('exported', glb, os.path.getsize(glb) // 1024, 'KB')


if __name__ == '__main__':
    main()
