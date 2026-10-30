# Shared helpers for the MakeHuman character pipeline (run inside headless Blender 4.2 with MPFB2).
#
# Coordinate spaces
#   Blender: Z up, the character faces -Y, its left is +X.
#   glTF / game model space: Y up, the character faces +Z, its left is +X.
#   toG(blender xyz) = (x, z, -y). MakeHuman target files are in glTF axes already (decimetres).
import bpy, json, struct, math, os, gzip
import numpy as np
from mathutils import Vector, Matrix, Quaternion

MPFB = 'bl_ext.user_default.mpfb'


def mpfb(mod):
    import importlib
    return importlib.import_module(MPFB + '.' + mod)


def toG(v):
    return (v[0], v[2], -v[1])


def toG_np(a):
    return np.stack([a[:, 0], a[:, 2], -a[:, 1]], axis=1)


def fromG(v):
    return Vector((v[0], -v[2], v[1]))


# ---------------------------------------------------------------- Quaternius skeleton (glTF space)
def read_glb_json(path):
    with open(path, 'rb') as f:
        b = f.read()
    jl = struct.unpack('<I', b[12:16])[0]
    return json.loads(b[20:20 + jl].decode('utf8'))


def quaternius_skeleton(glb_path):
    """names (joint order), parent indices, global rest rotations (x,y,z,w) and positions (glTF space)."""
    j = read_glb_json(glb_path)
    nodes = j['nodes']
    joints = j['skins'][0]['joints']
    parent_of = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []):
            parent_of[c] = i
    G = {}

    def glob(i):
        if i in G:
            return G[i]
        n = nodes[i]
        t = Vector(n.get('translation', [0, 0, 0]))
        r = n.get('rotation', [0, 0, 0, 1])
        q = Quaternion((r[3], r[0], r[1], r[2]))
        s = n.get('scale', [1, 1, 1])
        m = Matrix.Translation(t) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((s[0], s[1], s[2], 1))
        if i in parent_of:
            m = glob(parent_of[i]) @ m
        G[i] = m
        return m
    names = [nodes[i]['name'] for i in joints]
    jset = {ji: k for k, ji in enumerate(joints)}
    parent = [jset.get(parent_of.get(ji, -1), -1) for ji in joints]
    rots, pos = [], []
    for ji in joints:
        m = glob(ji)
        loc, rot, sc = m.decompose()
        rots.append((rot.x, rot.y, rot.z, rot.w))
        pos.append(tuple(loc))
    return {'names': names, 'parent': parent, 'gq': rots, 'gp': pos}


# ---------------------------------------------------------------- MakeHuman age macro
def age_macro(age):
    if age < 11:
        return max(0.0, (age - 1) / 10 * 0.1875)
    if age < 25:
        return 0.1875 + (age - 11) / 14 * 0.3125
    return min(1.0, 0.5 + (age - 25) / 65 * 0.5)


# ---------------------------------------------------------------- target files
def read_target(path):
    """MakeHuman .target(.gz) -> (indices int32, deltas float32 Nx3 in glTF metres)."""
    op = gzip.open if path.endswith('.gz') else open
    idx, d = [], []
    with op(path, 'rt') as f:
        for line in f:
            line = line.strip()
            if not line or line[0] == '#':
                continue
            p = line.split()
            if len(p) < 4:
                continue
            idx.append(int(p[0]))
            d.append((float(p[1]) * 0.1, float(p[2]) * 0.1, float(p[3]) * 0.1))
    return np.array(idx, dtype=np.int32), np.array(d, dtype=np.float32).reshape(-1, 3)


# ---------------------------------------------------------------- scene helpers
def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images, bpy.data.node_groups):
        for b in list(coll):
            try:
                coll.remove(b)
            except Exception:
                pass


def evaluated_coords(obj, disable_masks=True):
    """World-space coordinates of every vertex of obj after modifiers (armature), Blender space (N,3)."""
    saved = []
    if disable_masks:
        for m in obj.modifiers:
            if m.type == 'MASK':
                saved.append((m, m.show_viewport))
                m.show_viewport = False
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    n = len(me.vertices)
    co = np.zeros(n * 3, dtype=np.float64)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    mw = np.array(obj.matrix_world)
    co = co @ mw[:3, :3].T + mw[:3, 3]
    ev.to_mesh_clear()
    for m, v in saved:
        m.show_viewport = v
    return co


def rotation_between(a, b):
    a = a.normalized()
    b = b.normalized()
    return a.rotation_difference(b)


# Bones re-posed into the Quaternius T-pose: (bone, child-joint used for its direction)
REPOSE = []
for s in ('l', 'r'):
    REPOSE += [('upperarm_' + s, 'lowerarm_' + s), ('lowerarm_' + s, 'hand_' + s), ('hand_' + s, 'middle_01_' + s)]
    for f in ('thumb', 'index', 'middle', 'ring', 'pinky'):
        REPOSE += [(f'{f}_01_{s}', f'{f}_02_{s}'), (f'{f}_02_{s}', f'{f}_03_{s}'), (f'{f}_03_{s}', f'{f}_04_leaf_{s}')]
    REPOSE += [('thigh_' + s, 'calf_' + s), ('calf_' + s, 'foot_' + s), ('foot_' + s, 'ball_' + s), ('ball_' + s, 'ball_leaf_' + s)]


def mh_name(q):
    return {'Head': 'head', 'root': 'Root'}.get(q, q)


def tpose(arm, Q):
    """Pose the MPFB game_engine armature so its limbs follow the Quaternius rest directions.
    Returns {quaternius bone name: posed joint position (Blender space)}."""
    qi = {n: i for i, n in enumerate(Q['names'])}
    gp = [Vector(p) for p in Q['gp']]
    pb = arm.pose.bones
    for b in pb:
        b.rotation_mode = 'QUATERNION'
        b.rotation_quaternion = (1, 0, 0, 0)
        b.location = (0, 0, 0)
        b.scale = (1, 1, 1)
    bpy.context.view_layer.update()
    mw = arm.matrix_world

    def head_w(name):
        return mw @ pb[name].head

    def tail_w(name):
        return mw @ pb[name].tail

    def child_pos(child):
        if child.endswith('_leaf_l') or child.endswith('_leaf_r'):
            par = child.replace('_04_leaf', '_03').replace('ball_leaf', 'ball')
            return tail_w(par)
        return head_w(mh_name(child))

    for bone, child in REPOSE:
        if bone not in pb:
            continue
        # target direction from the Quaternius joints (glTF -> Blender)
        tq = gp[qi[child]] - gp[qi[bone]]
        tgt = fromG(tq).normalized()
        cur = (child_pos(child) - head_w(bone))
        if cur.length < 1e-6:
            continue
        R = rotation_between(cur, tgt)
        h = pb[bone].head.copy()
        M = Matrix.Translation(h) @ R.to_matrix().to_4x4() @ Matrix.Translation(-h)
        pb[bone].matrix = M @ pb[bone].matrix
        bpy.context.view_layer.update()
    # palm orientation: align the knuckle line (index_01 -> pinky_01) with the Quaternius one, twisting the forearm
    for s in ('l', 'r'):
        hand = 'hand_' + s
        axis = (head_w('middle_01_' + s) - head_w(hand)).normalized()
        cur = head_w('pinky_01_' + s) - head_w('index_01_' + s)
        tq = fromG(gp[qi['pinky_01_' + s]] - gp[qi['index_01_' + s]])
        cur -= axis * cur.dot(axis)
        tq -= axis * tq.dot(axis)
        if cur.length < 1e-6 or tq.length < 1e-6:
            continue
        ang = cur.normalized().angle(tq.normalized())
        if cur.cross(tq).dot(axis) < 0:
            ang = -ang
        print(f'[tpose] palm twist {s}: {math.degrees(ang):.1f} deg')
        for bn, share in (('lowerarm_' + s, 0.6), (hand, 0.4)):
            ax = (head_w(hand) - head_w('lowerarm_' + s)).normalized() if bn != hand else axis
            R = Quaternion(ax, ang * share)
            h = pb[bn].head.copy()
            M = Matrix.Translation(h) @ R.to_matrix().to_4x4() @ Matrix.Translation(-h)
            pb[bn].matrix = M @ pb[bn].matrix
            bpy.context.view_layer.update()
    joints = {}
    for qn in Q['names']:
        if qn == 'root':
            joints[qn] = mw @ Vector((0, 0, 0))
        elif '_leaf_' in qn:
            joints[qn] = child_pos(qn)
        elif mh_name(qn) in pb:
            joints[qn] = head_w(mh_name(qn))
        else:
            raise RuntimeError('no MH bone for ' + qn)
    return joints


def make_human(phen, targets=(), proxies=None, rig='game_engine'):
    """Create an MPFB human. phen: macro dict; targets: [(name, value)]; proxies: dict bodypart -> asset path."""
    HumanService = mpfb('services.humanservice').HumanService
    hi = HumanService._create_default_human_info_dict()
    p = hi['phenotype']
    for k, v in phen.items():
        if k == 'race':
            p['race'] = dict(v)
        else:
            p[k] = v
    hi['rig'] = rig
    hi['targets'] = [{'target': n, 'value': v} for n, v in targets]
    for k, v in (proxies or {}).items():
        hi[k] = v
    hi['skin_material_type'] = 'NONE'
    hi['eyes_material_type'] = 'NONE'
    hi['clothes_material_type'] = 'NONE'
    s = HumanService.get_default_deserialization_settings()
    s['subdiv_levels'] = 0
    s['load_clothes'] = False
    bm = HumanService.deserialize_from_dict(hi, s)
    arm = bm.parent
    return bm, arm
