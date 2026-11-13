# Driver's-seat visibility check of an exported taxi GLB (what the player sees from driverEye).
#
#   blender -b --factory-startup -P tools/blender/sightlines.py -- public/assets/vehicle/taxi.glb
#
# Reports (Blender frame: +Y forward, driver at +X; glass, lenses and the mirrors' own glass are
# see-through): headliner clearance above the eye, the nearest road point visible straight ahead
# and 1.5 m to either side of the car's axis, the lowest clear sightline angle, the visible
# fraction of each mirror's reflector (sampled 9 x 5 points), and what blocks the rest.
import sys
import math
import bpy
from mathutils import Vector

SEE_THROUGH = ('glass', 'lens', 'display')


def first_solid(sc, dg, o, d, maxd=60.0, skip=()):
    o = o.copy()
    travelled = 0.0
    for _ in range(12):
        hit, loc, nrm, idx, ob, mw = sc.ray_cast(dg, o, d, distance=maxd - travelled)
        if not hit:
            return None, None, None
        name = ob.name
        m = ob.data.materials[ob.data.polygons[idx].material_index].name if ob.data.materials else ''
        travelled += (loc - o).length
        if m.split('.')[0] in SEE_THROUGH or name.split('.')[0] in skip:
            o = loc + d * 0.0015
            continue
        return name, m, loc
    return None, None, None


def main():
    path = sys.argv[sys.argv.index('--') + 1]
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    bpy.ops.import_scene.gltf(filepath=path)
    sc = bpy.context.scene
    me = bpy.data.meshes.new('ground')
    s = 40
    me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    sc.collection.objects.link(bpy.data.objects.new('ground', me))
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    eye = bpy.data.objects['driverEye'].matrix_world.translation.copy()
    print(f'SIGHT eye {tuple(round(c, 3) for c in eye)}')
    n, m, loc = first_solid(sc, dg, eye, Vector((0, 0, 1)))
    print(f'SIGHT headliner clearance {round(loc.z - eye.z, 3) if loc else None} ({n}/{m})')
    for lat in (0.0, -1.5, 1.5):
        best, blk = None, None
        for k in range(0, 400):
            a = math.radians(2.0 + k * 0.05)
            target = Vector((eye.x + lat, eye.y + eye.z / math.tan(a), 0.0))
            d = (target - eye).normalized()
            n, m, loc = first_solid(sc, dg, eye, d)
            if k == 0:
                print('SIGHT first ray', round(math.degrees(a), 2), n, m)
            if n == 'ground':
                best = (round(math.degrees(a), 2), round(loc.y - eye.y, 2))
            else:
                if best is not None:
                    break
                blk = (n, m)
        print(f'SIGHT road ahead (lateral {lat:+.1f} m): steepest clear angle / nearest road (m ahead of eye) {best},'
              f' then blocked by {blk}')
    for mname in ('mirror_rear_surface', 'mirror_left_surface', 'mirror_right_surface'):
        ob = bpy.data.objects.get(mname)
        if ob is None:
            print('SIGHT', mname, 'missing')
            continue
        vs = [ob.matrix_world @ v.co for v in ob.data.vertices]
        lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
        hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
        seen, total, blockers = 0, 0, {}
        for i in range(9):
            for j in range(5):
                t = Vector(((i + 0.5) / 9, (i + 0.5) / 9, (j + 0.5) / 5))
                p = Vector((lo.x + (hi.x - lo.x) * t.x, lo.y + (hi.y - lo.y) * t.y, lo.z + (hi.z - lo.z) * t.z))
                d = (p - eye)
                dist = d.length
                d.normalize()
                n, m, loc = first_solid(sc, dg, eye, d, maxd=dist + 0.05)
                total += 1
                if n is None or n.split('.')[0] == mname or (loc - eye).length > dist - 0.01:
                    seen += 1
                else:
                    key = n.split('.')[0] + '/' + m
                    blockers.setdefault(key, []).append(tuple(round(c, 2) for c in loc))
        summary = {k: (len(v), v[0], v[-1]) for k, v in blockers.items()}
        print(f'SIGHT {mname}: {round(100 * seen / total)}% visible, blocked by {summary}')
        print(f'SIGHT   {mname} bbox {tuple(round(c, 3) for c in lo)} .. {tuple(round(c, 3) for c in hi)}')


main()
