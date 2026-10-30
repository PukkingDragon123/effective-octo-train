# Review-render helpers: a neutral studio (ground, soft key/fill/rim, gradient sky) and the
# standard camera set used for .shots/blender-*.png. Cycles CPU + OIDN denoising.
import math
import bpy
from mathutils import Vector
import vlib
from vlib import V


def studio(ground=True, sky=1.0, key=1.0, ground_color=(0.18, 0.18, 0.18), night=False):
    vlib.setup_render()
    if night:
        vlib.studio_world(strength=0.25 * sky, color=(0.05, 0.07, 0.09), top=(0.12, 0.16, 0.2))
    else:
        vlib.studio_world(strength=0.9 * sky, color=(0.42, 0.45, 0.48), top=(0.85, 0.88, 0.92))
    objs = []
    if ground:
        me = bpy.data.meshes.new('ground')
        s = 30
        me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
        g = bpy.data.objects.new('ground', me)
        vlib.link(g)
        m = bpy.data.materials.new('ground_mat')
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*ground_color, 1)
        b.inputs['Roughness'].default_value = 0.75
        me.materials.append(m)
        objs.append(g)
    e = key
    objs.append(vlib.add_light('key', 'AREA', (4.5, 3.5, 5.5), (0, 0, 0), energy=1600 * e, size=4.0))
    vlib.look_at(objs[-1], (0, 0, 0.5))
    objs.append(vlib.add_light('fill', 'AREA', (-5.0, -2.0, 3.0), (0, 0, 0), energy=600 * e, size=6.0,
                               color=(0.85, 0.9, 1.0)))
    vlib.look_at(objs[-1], (0, 0, 0.6))
    objs.append(vlib.add_light('rim', 'AREA', (-1.0, -6.0, 2.5), (0, 0, 0), energy=700 * e, size=5.0))
    vlib.look_at(objs[-1], (0, 0, 0.8))
    objs.append(vlib.add_light('top', 'AREA', (0, 0, 6.0), (0, 0, 0), energy=500 * e, size=8.0))
    return objs


CAMS = {
    # name: (location, target, lens)
    'front34': ((4.3, 5.2, 1.55), (0.0, 0.25, 0.62), 50),
    'rear34': ((-4.2, -5.4, 1.6), (0.0, -0.3, 0.62), 50),
    'side': ((-8.6, 0.0, 0.85), (0.0, 0.0, 0.66), 50),
    'side_r': ((8.6, 0.0, 0.85), (0.0, 0.0, 0.66), 50),
    'front': ((0.0, 9.0, 0.75), (0.0, 0.0, 0.68), 50),
    'rear': ((0.0, -9.0, 0.8), (0.0, 0.0, 0.68), 50),
    'top': ((0.0, 0.0, 12.0), (0.0, 0.001, 0.0), 40),
}


def cam(name):
    loc, tgt, lens = CAMS[name]
    return vlib.camera('cam_' + name, loc, tgt, lens=lens)
