# Review renders of an exported GLB (what the game receives, not the build scene).
#
#   blender -b --factory-startup -P tools/blender/render_glb.py -- --glb public/assets/vehicle/taxi.glb
#           [--out .shots/blender-taxi] [--cams front34,rear34,pov] [--samples 12] [--res 960x540]
#           [--night]
#
# Writes <out>-<cam>.png. Cameras (Blender frame: +Y forward, driver at +X):
#   front34 rear34 side side_r front rear top (exterior), pov (driver eye), pov_left (driver looks
#   at the passenger side), rear_seat (from the back seat forward), back (driver turned to the rear
#   bench), dash (close-up of the cluster / meter), wheel (front wheel close-up), moto34 / moto_side /
#   moto_rider (motorbike scale).
import os
import sys
import math

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))

import bpy
import vlib
import review

CAMS = dict(review.CAMS)
CAMS.update({
    'pov': ((0.37, -0.22, 1.13), (0.12, 1.6, 0.80), 22),
    'pov_left': ((0.37, -0.22, 1.13), (-1.2, 0.6, 0.75), 22),
    'rear_seat': ((-0.25, -1.05, 1.08), (0.25, 0.6, 0.85), 22),
    'back': ((0.30, -0.10, 1.12), (-0.1, -1.6, 0.70), 22),
    'dash': ((0.30, -0.05, 1.02), (0.30, 0.62, 0.86), 30),
    'wheel': ((1.75, 2.15, 0.45), (0.75, 1.31, 0.30), 45),
    'moto34': ((2.2, 2.4, 1.0), (0.0, 0.0, 0.55), 50),
    'moto_side': ((-4.0, 0.0, 0.75), (0.0, 0.0, 0.55), 50),
    'moto_rider': ((0.0, -0.25, 1.45), (0.0, 1.2, 0.75), 30),
})


def parse():
    a = vlib.args_after_dashes()
    o = dict(glb=None, out=os.path.join(REPO, '.shots', 'blender'), cams='front34,rear34,pov', samples=12,
             res=(960, 540), night=False)
    i = 0
    while i < len(a):
        k = a[i]
        if k == '--glb':
            o['glb'] = a[i + 1]; i += 1
        elif k == '--out':
            o['out'] = a[i + 1]; i += 1
        elif k == '--cams':
            o['cams'] = a[i + 1]; i += 1
        elif k == '--samples':
            o['samples'] = int(a[i + 1]); i += 1
        elif k == '--res':
            w, h = a[i + 1].split('x'); o['res'] = (int(w), int(h)); i += 1
        elif k == '--night':
            o['night'] = True
        i += 1
    return o


def main():
    o = parse()
    vlib.reset_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(o['glb']))
    review.studio(night=o['night'])
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = o['res']
    sc.cycles.samples = o['samples']
    sc.render.threads = 4
    for name in o['cams'].split(','):
        loc, tgt, lens = CAMS[name]
        cam = vlib.camera('cam_' + name, loc, tgt, lens=lens)
        vlib.render_to(cam, f"{o['out']}-{name}.png")


if __name__ == '__main__':
    main()
