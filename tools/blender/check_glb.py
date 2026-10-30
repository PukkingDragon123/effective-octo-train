#!/usr/bin/env python3
"""Node-free GLB contract check: parses the GLB JSON chunk (no three.js, no Blender) and
verifies every contract node name exists, pivot extras are present, display quads have
0..1 UVs, and reports triangles / materials / textures / size.

    python3 tools/blender/check_glb.py public/assets/vehicle/taxi.glb [taxi_lod.glb moto.glb ...]
"""
import json
import struct
import sys
import os

TAXI_NODES = [
    'body', 'glass_windshield', 'glass_rear', 'glass_fl', 'glass_fr', 'glass_rl', 'glass_rr',
    'mirror_rear_surface', 'mirror_left_surface', 'mirror_right_surface',
    'door_fl', 'door_fr', 'door_rl', 'door_rr', 'hood', 'trunk', 'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr',
    'steering_wheel', 'needle_speedo', 'needle_tacho', 'needle_fuel', 'needle_temp', 'gear_lever', 'handbrake_lever',
    'pedal_throttle', 'pedal_brake', 'pedal_clutch', 'glovebox_lid', 'sun_visor_driver', 'window_crank_fl',
    'window_crank_fr', 'window_crank_rl', 'window_crank_rr', 'rearview_mirror', 'key_slot', 'wiper_l', 'wiper_r',
    'light_head_l', 'light_head_r', 'light_tail_l', 'light_tail_r', 'light_ind_fl', 'light_ind_fr', 'light_ind_rl',
    'light_ind_rr', 'light_brake', 'light_reverse', 'roof_sign', 'vacant_lamp',
    'meter_display', 'radio_display', 'gauge_speedo_face', 'gauge_tacho_face', 'gauge_small_face', 'plate_front',
    'plate_rear',
]
TAXI_PIVOTS = ['door_fl', 'door_fr', 'door_rl', 'door_rr', 'hood', 'trunk', 'wheel_fl', 'wheel_fr', 'wheel_rl',
               'wheel_rr', 'steering_wheel', 'needle_speedo', 'needle_tacho', 'needle_fuel', 'needle_temp', 'gear_lever',
               'handbrake_lever', 'pedal_throttle', 'pedal_brake', 'pedal_clutch', 'glovebox_lid', 'sun_visor_driver',
               'window_crank_fl', 'window_crank_fr', 'window_crank_rl', 'window_crank_rr', 'rearview_mirror', 'key_slot',
               'wiper_l', 'wiper_r']
TAXI_ANCHORS = ['driverSeat', 'frontPassengerSeat', 'rearLeftSeat', 'rearRightSeat', 'rearCenterSeat', 'driverEye',
                'steeringWheel', 'gearKnob', 'handbrake', 'keySlot', 'pedalThrottle', 'pedalBrake', 'pedalClutch',
                'radioKnob', 'meter', 'cabinLight', 'headlightStalk', 'wiperStalk', 'hornPad', 'windowCrankFR',
                'windowCrankFL', 'amuletHang', 'rearviewMirror', 'mirrorLeft', 'mirrorRight', 'trunk', 'roofTop', 'hood',
                'headlightL', 'headlightR', 'taillightL', 'taillightR', 'gloveBox', 'sunVisorDriver', 'doorFL', 'doorFR',
                'doorRL', 'doorRR', 'dashSticker']
DISPLAY = ['meter_display', 'radio_display', 'gauge_speedo_face', 'gauge_tacho_face', 'gauge_small_face',
           'plate_front', 'plate_rear']
LOD_NODES = ['body', 'glass', 'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr', 'light_head_l', 'light_head_r',
             'light_tail_l', 'light_tail_r', 'light_brake', 'roof_sign']
MOTO_NODES = ['body', 'handlebar', 'wheel_f', 'wheel_r', 'light_head', 'light_tail']
MOTO_EMPTIES = ['seat', 'handleL', 'handleR', 'footL', 'footR', 'eye', 'headlight']
MOTO_PIVOTS = ['handlebar', 'wheel_f', 'wheel_r']

CTYPE = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, ver, length = struct.unpack_from('<4sII', data, 0)
    assert magic == b'glTF', 'not a GLB'
    off, js, binc = 12, None, b''
    while off < length:
        clen, ctype = struct.unpack_from('<I4s', data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == b'JSON':
            js = json.loads(chunk.decode('utf8'))
        elif ctype == b'BIN\x00':
            binc = chunk
        off += 8 + clen
    return js, binc


def accessor_values(js, binc, idx):
    a = js['accessors'][idx]
    bv = js['bufferViews'][a['bufferView']]
    fmt, size = CTYPE[a['componentType']]
    n = NCOMP[a['type']]
    stride = bv.get('byteStride', size * n)
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    out = []
    for i in range(a['count']):
        out.append(struct.unpack_from('<' + fmt * n, binc, base + i * stride))
    return out


def check(path):
    js, binc = read_glb(path)
    name = os.path.basename(path)
    nodes = js.get('nodes', [])
    by_name = {n.get('name'): n for n in nodes}
    errors = []
    if name.startswith('taxi_lod'):
        need, piv, emp = LOD_NODES, [], []
    elif name.startswith('taxi'):
        need, piv, emp = TAXI_NODES, TAXI_PIVOTS, TAXI_ANCHORS
    else:
        need, piv, emp = MOTO_NODES, MOTO_PIVOTS, MOTO_EMPTIES
    for n in need:
        if n not in by_name:
            errors.append(f'missing node {n}')
        elif 'mesh' not in by_name[n]:
            errors.append(f'node {n} has no mesh')
    anchors = {n.get('extras', {}).get('anchor'): n for n in nodes if n.get('extras', {}).get('anchor')}
    for n in emp:
        a = anchors.get(n) or (by_name.get(n) if by_name.get(n) and 'mesh' not in by_name[n] else None)
        if a is None:
            errors.append(f'missing anchor {n}')
        elif 'mesh' in a:
            errors.append(f'anchor {n} should be an empty')
        elif a.get('name') != n:
            errors.append(f'anchor {n} is named {a.get("name")}')
    for n in piv:
        ex = by_name.get(n, {}).get('extras', {})
        if 'pivotAxis' not in ex:
            errors.append(f'pivot {n} lacks extras.pivotAxis')
        if 'rotation' in by_name.get(n, {}) and by_name[n]['rotation'] != [0, 0, 0, 1]:
            errors.append(f'pivot {n} has a rest rotation')
    dupes = [k for k in by_name if sum(1 for n in nodes if n.get('name') == k and 'mesh' in n) > 1]
    if dupes:
        errors.append(f'duplicate node names {dupes}')
    # triangles
    tris = 0
    mesh_tris = {}
    for mi, m in enumerate(js.get('meshes', [])):
        t = 0
        for p in m['primitives']:
            if 'indices' in p:
                t += js['accessors'][p['indices']]['count'] // 3
            else:
                t += js['accessors'][p['attributes']['POSITION']]['count'] // 3
        mesh_tris[mi] = t
    for n in nodes:
        if 'mesh' in n:
            tris += mesh_tris[n['mesh']]
    # display quads: UVs within 0..1 and spanning it
    if name.startswith('taxi') and not name.startswith('taxi_lod'):
        for d in DISPLAY:
            n = by_name.get(d)
            if not n or 'mesh' not in n:
                continue
            p = js['meshes'][n['mesh']]['primitives'][0]
            uv = accessor_values(js, binc, p['attributes']['TEXCOORD_0'])
            us = [u for u, v in uv]
            vs = [v for u, v in uv]
            if min(us) < -1e-4 or max(us) > 1 + 1e-4 or min(vs) < -1e-4 or max(vs) > 1 + 1e-4 or \
                    max(us) - min(us) < 0.99 or max(vs) - min(vs) < 0.99:
                errors.append(f'display {d} UVs not clean 0..1: u[{min(us):.3f},{max(us):.3f}] v[{min(vs):.3f},{max(vs):.3f}]')
    mats = sorted(m.get('name') for m in js.get('materials', []))
    imgs = [(i.get('name'), i.get('mimeType')) for i in js.get('images', [])]
    print(f'== {name}: {os.path.getsize(path) / 1e6:.2f} MB, {len(nodes)} nodes, {tris} triangles')
    print('   materials:', ', '.join(mats))
    print('   images:', imgs)
    if errors:
        print('   FAIL:')
        for e in errors:
            print('    -', e)
    else:
        print(f'   OK: {len(need)} contract nodes, {len(emp)} empties, {len(piv)} pivots present')
    return not errors


if __name__ == '__main__':
    ok = True
    for p in sys.argv[1:]:
        ok = check(p) and ok
    sys.exit(0 if ok else 1)
