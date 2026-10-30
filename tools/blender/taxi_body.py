# Taxi body master surface: a 1990s compact Japanese sedan (generic, unbadged), traced from
# an orthographic E100-era sedan blueprint and side/front/rear photos (look-only refs).
#
# Blender frame: X right (driver side), Y forward, Z up; origin on the ground under the
# middle of the body. Length 4.27, width 1.69, height ~1.375, wheelbase 2.465.
#
# Construction (half body, x >= 0, mirrored at the end):
#   W  lower-body wrap: columns run around the plan outline (front quadrant, side, rear
#      quadrant); each column is a section curve (12 semantic control points) from the
#      tucked underside up over the shoulder onto the hood / belt / deck. Control point 7
#      is the shoulder crease (livery split), 9 is the hood / trunk seam.
#   Hood, cowl, lid, parcel: Coons patches welded to W's last row, z from heightfields.
#   G  greenhouse wrap from the belt / cowl / deck up to the roof rail and over the roof
#      edge (windshield, A-pillar corner, side, C-pillar corner, rear window segments).
#   Roof: Coons patch welded to G's last row.
# Every face carries 'part' (0 body, 1 hood, 2 trunk, 3 front bumper, 4 rear bumper,
# 5 side window aperture) and 'zone' (0 green lower, 1 yellow upper) attributes, plus
# grid indices so later steps can place features in the surface's (u, t) space.
import math
import numpy as np
from vlib import (Spline1D, clamp, lerp, ease, smoothstep, superellipse_quadrant, resample,
                  eval_polyline, coons_patch, new_mesh_obj, grid_faces, mirror_x, merge_doubles,
                  face_attr, log)

YF, YR = 2.135, -2.135
AXF, AXR = 1.31, -1.155
AXLE_Z = 0.292
WHEEL_R = 0.292
HALF_W = 0.845
TRACK_F, TRACK_R = 1.46, 1.45

# section segment sample counts between W control points 0..11
W_SEG = [2, 2, 2, 3, 3, 3, 2, 3, 4, 3, 3]
W_ROW_OF = np.concatenate([[0], np.cumsum(W_SEG)]).astype(int)  # row index of each ctrl pt
G_SEG = [1, 5, 5, 3, 3]
G_ROW_OF = np.concatenate([[0], np.cumsum(G_SEG)]).astype(int)

# W side anchors (y) where columns must exist
A_SIDE0 = 1.635      # end of front quadrant (bumper/fender seam)
A_HOOD = 1.02        # hood rear edge
A_ABASE = 0.88       # windshield base corner (A-pillar base)
A_BELT0 = 0.80       # side belt start (aperture front lower corner)
A_CBASE0 = -1.06     # aperture rear lower corner / C-pillar base start
A_CBASE1 = -1.58     # rear-window base corner
A_TRUNK = -1.64      # trunk lid front edge
A_SIDE1 = -1.685     # start of rear quadrant
SIDE_ANCHORS = [A_SIDE0, A_HOOD, A_ABASE, A_BELT0, A_CBASE0, A_CBASE1, A_TRUNK, A_SIDE1]
SIDE_COUNTS = [16, 4, 3, 50, 13, 2, 2]  # segments between anchors
N_FQ = 24   # front quadrant segments
N_RQ = 22   # rear quadrant segments
K_HOOD_CORNER = 15   # W column index of the hood's front corner (in the front quadrant)
K_LID_CORNER_FROM_END = 14  # rear quadrant: lid corner is this many columns before the rear centre


# ---------------------------------------------------------------------------------------
# heightfields
# ---------------------------------------------------------------------------------------
_zc_hood = Spline1D([(2.06, 0.728), (2.0, 0.745), (1.8, 0.779), (1.5, 0.832), (1.2, 0.872), (1.0, 0.898),
                     (0.9, 0.906), (0.8, 0.912)])
_zc_deck = Spline1D([(-1.5, 1.0), (-1.6, 1.001), (-1.8, 0.999), (-1.95, 0.992), (-2.05, 0.982)])


def T_hood(x, y):
    c = 0.034 * smoothstep(2.1, 1.6, y) + 0.026
    return _zc_hood(y) - c * (abs(x) / 0.70) ** 2.2


def T_deck(x, y):
    return _zc_deck(y) - 0.030 * (abs(x) / 0.70) ** 2.2


def T_roof(x, y):
    return 1.373 - 0.058 * (abs(x) / 0.6) ** 2.1 - 0.042 * ((y + 0.44) / 0.55) ** 2


# ---------------------------------------------------------------------------------------
# outlines
# ---------------------------------------------------------------------------------------
_FQ = superellipse_quadrant(HALF_W, YF - A_SIDE0, 3.1, 0.0, A_SIDE0, samples=600)
_RQ = superellipse_quadrant(HALF_W, A_SIDE1 - YR, 3.4, 0.0, A_SIDE1, sy=-1, samples=600)[::-1]
TB_FRONT_Y = 1.97
TB_REAR_Y = -1.985
_FQ_TB = superellipse_quadrant(0.665, TB_FRONT_Y - A_SIDE0, 2.8, 0.0, A_SIDE0, samples=600)
_RQ_TB = superellipse_quadrant(0.64, A_SIDE1 - TB_REAR_Y, 3.0, 0.0, A_SIDE1, sy=-1, samples=600)[::-1]


def _arc_param(poly):
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(poly, axis=0), axis=1))])
    return s / s[-1]


_FQ_S, _RQ_S, _FQTB_S, _RQTB_S = map(_arc_param, (_FQ, _RQ, _FQ_TB, _RQ_TB))


def _interp_poly(poly, s, t):
    return np.array([np.interp(t, s, poly[:, 0]), np.interp(t, s, poly[:, 1])])


def u_to_y_side(u):
    return lerp(A_SIDE0, A_SIDE1, u - 1.0)


def y_to_u_side(y):
    return 1.0 + (A_SIDE0 - y) / (A_SIDE0 - A_SIDE1)


def O(u):
    """Max-width plan outline point (x, y)."""
    if u <= 1.0:
        return _interp_poly(_FQ, _FQ_S, clamp(u))
    if u <= 2.0:
        return np.array([HALF_W, u_to_y_side(u)])
    return _interp_poly(_RQ, _RQ_S, clamp(u - 2.0))


_xtb = Spline1D([(1.70, 0.665), (A_HOOD, 0.665), (A_ABASE, 0.640), (A_BELT0, 0.715), (0.0, 0.716),
                 (A_CBASE0, 0.716), (-1.30, 0.700), (A_CBASE1, 0.640), (-1.70, 0.640)])
_ztb_belt = Spline1D([(A_BELT0, 0.884), (0.0, 0.890), (A_CBASE0, 0.896)])


def TB(u):
    """Top boundary of W (3D): inner end of each section."""
    if u <= 1.0:
        x, y = _interp_poly(_FQ_TB, _FQTB_S, clamp(u))
        return np.array([x, y, T_hood(x, y)])
    if u >= 2.0:
        x, y = _interp_poly(_RQ_TB, _RQTB_S, clamp(u - 2.0))
        return np.array([x, y, T_deck(x, y)])
    y = u_to_y_side(u)
    x = _xtb(y)
    if y >= A_ABASE:
        z = T_hood(x, y)
    elif y >= A_BELT0:
        s = ease((A_ABASE - y) / (A_ABASE - A_BELT0))
        z = lerp(T_hood(x, y), _ztb_belt(A_BELT0), s)
    elif y >= A_CBASE0:
        z = _ztb_belt(y)
    elif y >= A_CBASE1:
        s = ease((A_CBASE0 - y) / (A_CBASE0 - A_CBASE1))
        z = lerp(_ztb_belt(A_CBASE0), T_deck(x, y), s ** 1.2)
    else:
        z = T_deck(x, y)
    return np.array([x, y, z])


# ---------------------------------------------------------------------------------------
# section profiles: 12 control points (d, z, tension); d = inset from O along e
# ---------------------------------------------------------------------------------------
FRONT = [(0.30, 0.235, 0.0), (0.060, 0.226, 0.45), (0.016, 0.250, 0.1), (0.002, 0.330, 0.0),
         (0.0, 0.405, 0.0), (0.012, 0.485, 0.0), (0.036, 0.527, 0.25), (0.056, 0.547, 0.55),
         (0.064, 0.628, 0.0), (0.078, 0.700, 0.3), (0.106, 0.737, 0.0), None]
REAR = [(0.30, 0.270, 0.0), (0.060, 0.262, 0.45), (0.016, 0.288, 0.1), (0.002, 0.365, 0.0),
        (0.0, 0.450, 0.0), (0.010, 0.532, 0.0), (0.030, 0.574, 0.25), (0.046, 0.592, 0.55),
        (0.050, 0.700, 0.0), (0.054, 0.800, 0.2), (0.060, 0.955, 0.45), None]

# side stations: y -> 11 control points (d, z, tension). z of points 9/10 is None where
# it comes from the hood / deck heightfields.
_SIDE_ST = {
    A_SIDE0: [(0.20, 0.300, 0), (0.040, 0.272, .45), (0.012, 0.308, .1), (0.004, 0.380, 0), (0.0, 0.470, 0),
              (0.006, 0.580, 0), (0.014, 0.655, 0), (0.024, 0.702, .55), (0.050, 0.742, .1), (0.155, None, .3),
              (0.168, None, 0)],
    1.30: [(0.20, 0.290, 0), (0.040, 0.262, .45), (0.012, 0.298, .1), (0.004, 0.380, 0), (0.0, 0.480, 0),
           (0.006, 0.600, 0), (0.014, 0.680, 0), (0.024, 0.727, .55), (0.050, 0.776, .1), (0.155, None, .3),
           (0.168, None, 0)],
    A_HOOD: [(0.20, 0.250, 0), (0.040, 0.225, .45), (0.012, 0.263, .1), (0.005, 0.350, 0), (0.0, 0.470, 0),
             (0.006, 0.600, 0), (0.014, 0.700, 0), (0.024, 0.749, .55), (0.050, 0.812, .1), (0.155, None, .3),
             (0.168, None, 0)],
    A_ABASE: [(0.20, 0.215, 0), (0.040, 0.200, .45), (0.012, 0.236, .1), (0.006, 0.320, 0), (0.0, 0.460, 0),
              (0.005, 0.595, 0), (0.013, 0.705, 0), (0.023, 0.759, .55), (0.047, 0.835, .1), (0.120, None, .3),
              (0.170, None, 0)],
    A_BELT0: [(0.20, 0.205, 0), (0.040, 0.192, .45), (0.012, 0.226, .1), (0.006, 0.305, 0), (0.0, 0.455, 0),
              (0.004, 0.585, 0), (0.012, 0.703, 0), (0.022, 0.764, .55), (0.045, 0.845, .1), (0.066, 0.875, .25),
              (0.092, 0.887, 0)],
    0.0: [(0.20, 0.205, 0), (0.040, 0.190, .45), (0.012, 0.223, .1), (0.006, 0.300, 0), (0.0, 0.450, 0),
          (0.004, 0.585, 0), (0.012, 0.708, 0), (0.022, 0.780, .55), (0.045, 0.852, .1), (0.066, 0.885, .25),
          (0.092, 0.894, 0)],
    A_CBASE0: [(0.20, 0.215, 0), (0.040, 0.200, .45), (0.012, 0.236, .1), (0.006, 0.320, 0), (0.0, 0.460, 0),
               (0.004, 0.590, 0), (0.012, 0.715, 0), (0.022, 0.795, .55), (0.046, 0.862, .1), (0.067, 0.893, .25),
               (0.093, 0.901, 0)],
    -1.30: [(0.20, 0.270, 0), (0.040, 0.250, .45), (0.012, 0.288, .1), (0.005, 0.370, 0), (0.0, 0.470, 0),
            (0.005, 0.600, 0), (0.012, 0.720, 0), (0.022, 0.800, .55), (0.048, 0.880, .1), (0.090, 0.925, .25),
            (0.125, 0.940, 0)],
    A_CBASE1: [(0.20, 0.290, 0), (0.040, 0.270, .45), (0.012, 0.308, .1), (0.005, 0.380, 0), (0.0, 0.470, 0),
               (0.005, 0.600, 0), (0.012, 0.725, 0), (0.022, 0.803, .55), (0.050, 0.900, .1), (0.155, None, .3),
               (0.180, None, 0)],
    A_SIDE1: [(0.20, 0.300, 0), (0.040, 0.275, .45), (0.012, 0.313, .1), (0.005, 0.385, 0), (0.0, 0.470, 0),
              (0.005, 0.600, 0), (0.012, 0.728, 0), (0.022, 0.805, .55), (0.050, 0.905, .1), (0.155, None, .3),
              (0.172, None, 0)],
}
_SIDE_Y = sorted(_SIDE_ST.keys())
_SIDE_SPL = {}
for _k in range(11):
    for _c in range(3):
        pts = []
        for y in _SIDE_Y:
            v = _SIDE_ST[y][_k][_c]
            pts.append((y, np.nan if v is None else v))
        _SIDE_SPL[(_k, _c)] = pts


def _side_val(k, c, y):
    pts = [(yy, v) for yy, v in _SIDE_SPL[(k, c)] if not np.isnan(v)]
    return Spline1D(pts)(y)


_SIDE_CACHE = {}


def side_profile(y):
    key = round(y, 6)
    if key in _SIDE_CACHE:
        return _SIDE_CACHE[key]
    prof = []
    for k in range(11):
        d = _side_val(k, 0, y)
        t = _side_val(k, 2, y)
        x = HALF_W - d
        if k >= 9:
            if y >= A_ABASE:
                z = T_hood(x, y)
            elif y <= A_CBASE1:
                z = T_deck(x, y)
            else:
                z = _side_val(k, 1, y)
                if y > A_BELT0:
                    s = ease((y - A_BELT0) / (A_ABASE - A_BELT0))
                    z = lerp(z, T_hood(x, y), s)
                elif y < -1.30:
                    s = ease((-1.30 - y) / (-1.30 - A_CBASE1))
                    z = lerp(z, T_deck(x, y), s)
        else:
            z = _side_val(k, 1, y)
        prof.append((d, z, t))
    _SIDE_CACHE[key] = prof
    return prof


def section_ctrl(u):
    """Control points (12 x (d, z, tension)), origin O (2,), direction e (2,)."""
    o = O(u)
    tb = TB(u)
    e = tb[:2] - o
    dl = float(np.linalg.norm(e))
    e = e / max(dl, 1e-9)
    if u <= 1.0:
        w = ease(clamp(u) ** 0.9)
        a, b = FRONT, side_profile(A_SIDE0)
        prof = [tuple(lerp(np.array(a[k]), np.array(b[k]), w)) for k in range(11)]
    elif u >= 2.0:
        w = ease(clamp(3.0 - u) ** 0.9)
        a, b = REAR, side_profile(A_SIDE1)
        prof = [tuple(lerp(np.array(a[k]), np.array(b[k]), w)) for k in range(11)]
    else:
        prof = side_profile(u_to_y_side(u))
    prof = list(prof)
    # monotone inset safety for the top points
    d9 = min(prof[9][0], dl - 0.02)
    d10 = min(max(prof[10][0], d9 + 0.006), dl - 0.008)
    prof[9] = (d9, prof[9][1], prof[9][2])
    prof[10] = (d10, prof[10][1], prof[10][2])
    prof.append((dl, tb[2], 0.0))
    return prof, o, e


def hermite_sections(ctrl, seg_n, dense=40):
    """Section through 2D/3D control points with per-point tension. Tangent directions from
    neighbours, magnitude = chord of each segment (no loops). Returns rows (sum(seg_n)+1, D)
    sampled uniformly by arc length within each segment."""
    P = np.array([c[:-1] for c in ctrl], float)
    tau = np.array([c[-1] for c in ctrl], float)
    n = len(P)
    D = np.zeros_like(P)
    for i in range(n):
        a = P[max(i - 1, 0)]
        b = P[min(i + 1, n - 1)]
        v = b - a
        D[i] = v / max(np.linalg.norm(v), 1e-12)
    rows = []
    t = np.linspace(0, 1, dense + 1)[:, None]
    h00 = 2 * t**3 - 3 * t**2 + 1
    h10 = t**3 - 2 * t**2 + t
    h01 = -2 * t**3 + 3 * t**2
    h11 = t**3 - t**2
    segs = []
    for i in range(n - 1):
        c = np.linalg.norm(P[i + 1] - P[i])
        m0 = D[i] * c * (1 - tau[i])
        m1 = D[i + 1] * c * (1 - tau[i + 1])
        seg = h00 * P[i] + h10 * m0 + h01 * P[i + 1] + h11 * m1
        segs.append(seg)
        r = resample(seg, seg_n[i] + 1)
        rows.extend(r[:-1] if i < n - 2 else r)
    return np.array(rows), segs


def W_point_rows(u):
    prof, o, e = section_ctrl(u)
    rows2, _ = hermite_sections(prof, W_SEG)
    pts = np.zeros((len(rows2), 3))
    pts[:, 0] = o[0] + e[0] * rows2[:, 0]
    pts[:, 1] = o[1] + e[1] * rows2[:, 0]
    pts[:, 2] = rows2[:, 1]
    return pts


def W_eval(u, t):
    """Continuous evaluation: t in [0, 11] = control-point index space."""
    prof, o, e = section_ctrl(u)
    _, segs = hermite_sections(prof, W_SEG, dense=60)
    k = int(clamp(math.floor(t), 0, 10))
    f = t - k
    p2 = eval_polyline(segs[k], f)
    return np.array([o[0] + e[0] * p2[0], o[1] + e[1] * p2[0], p2[1]])


def W_columns():
    """List of u values for W columns + index lookup of anchors."""
    us = [i / N_FQ for i in range(N_FQ)]
    anchors_idx = {}
    for a in range(len(SIDE_ANCHORS) - 1):
        y0, y1 = SIDE_ANCHORS[a], SIDE_ANCHORS[a + 1]
        anchors_idx[y0] = len(us)
        n = SIDE_COUNTS[a]
        for i in range(n):
            us.append(y_to_u_side(lerp(y0, y1, i / n)))
    anchors_idx[SIDE_ANCHORS[-1]] = len(us)
    for i in range(N_RQ + 1):
        us.append(2.0 + i / N_RQ)
    return us, anchors_idx


# ---------------------------------------------------------------------------------------
# greenhouse curves
# ---------------------------------------------------------------------------------------
def ws_base(n):
    xs = np.linspace(0, 1, 400)
    pts = []
    for s in xs:
        x = 0.640 * s
        y = 0.978 - 0.098 * s ** 2.2
        pts.append((x, y, T_hood(x, y) + 0.004))
    return resample(np.array(pts), n)


def rw_base(n):
    pts = []
    for s in np.linspace(0, 1, 400):
        x = 0.640 * s
        y = -1.612 + 0.032 * s ** 2.2
        pts.append((x, y, T_deck(x, y) + 0.004))
    return resample(np.array(pts), n)


def ws_top(n):
    pts = []
    for s in np.linspace(0, 1, 400):
        x = 0.55 * s
        y = 0.075 - 0.068 * s ** 2.2
        pts.append((x, y, 1.300 - 0.016 * s ** 2))
    return resample(np.array(pts), n)


def a_top(n):
    pts = []
    for th in np.linspace(0, math.pi / 2, 200):
        pts.append((0.55 + 0.053 * math.sin(th), -0.06 + 0.067 * math.cos(th), 1.284 - 0.001 * math.sin(th)))
    return resample(np.array(pts), n)


def side_top(n):
    pts = []
    for s in np.linspace(0, 1, 200):
        pts.append((0.603, lerp(-0.06, -0.885, s), 1.283 + 0.004 * math.sin(math.pi * s)))
    return resample(np.array(pts), n)


def c_top(n):
    pts = []
    for th in np.linspace(0, math.pi / 2, 200):
        pts.append((0.55 + 0.053 * math.cos(th), -0.885 - 0.07 * math.sin(th), 1.283 + 0.010 * math.sin(th)))
    return resample(np.array(pts), n)


def rw_top(n):
    pts = []
    for s in np.linspace(1, 0, 400):
        x = 0.55 * s
        y = -0.975 + 0.020 * s ** 2.2
        pts.append((x, y, 1.317 - 0.024 * s ** 2))
    return resample(np.array(pts), n)


def plan_inward(curve, j, center_y=-0.45):
    """Horizontal inward unit normal of a plan polyline at index j (points toward the car)."""
    a = curve[max(j - 1, 0)]
    b = curve[min(j + 1, len(curve) - 1)]
    t = np.array([b[0] - a[0], b[1] - a[1]])
    t /= max(np.linalg.norm(t), 1e-12)
    nrm = np.array([-t[1], t[0]])
    to_c = np.array([0.0 - curve[j][0], center_y - curve[j][1]])
    if np.dot(nrm, to_c) < 0:
        nrm = -nrm
    return nrm


# ---------------------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------------------
class BodyGrid:
    """Holds every half-body grid (for feature placement) and builds the master mesh."""

    def __init__(self):
        self.us, self.aidx = W_columns()
        log('W columns', len(self.us), 'rows', W_ROW_OF[-1] + 1)
        self.W = np.array([W_point_rows(u) for u in self.us])     # (nc, nr, 3)
        self.TBrow = self.W[:, -1, :]
        nc = len(self.us)
        k_hood = self.aidx[A_HOOD]
        k_abase = self.aidx[A_ABASE]
        k_belt0 = self.aidx[A_BELT0]
        k_c0 = self.aidx[A_CBASE0]
        k_c1 = self.aidx[A_CBASE1]
        k_trunk = self.aidx[A_TRUNK]
        kc = K_HOOD_CORNER
        kr = nc - 1 - K_LID_CORNER_FROM_END
        self.k = dict(hood=k_hood, abase=k_abase, belt0=k_belt0, c0=k_c0, c1=k_c1, trunk=k_trunk, kc=kc, kr=kr)
        TBr = self.TBrow
        # ---- hood patch --------------------------------------------------------------
        c0 = TBr[0:kc + 1]                         # front edge (centre -> corner)
        d1 = TBr[kc:k_hood + 1]                    # side edge (corner -> hood rear)
        m = len(d1)
        hr = self.hood_rear(kc + 1)
        c1 = hr                                    # rear edge (centre -> side)
        sfrac = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(d1, axis=0), axis=1))])
        sfrac /= sfrac[-1]
        d0 = np.array([[0.0, lerp(TBr[0][1], hr[0][1], f), 0.0] for f in sfrac])
        d0[:, 2] = [T_hood(0, y) for y in d0[:, 1]]
        self.hood = self._proj(coons_patch(c0, c1, d0, d1), T_hood)
        # ---- cowl patch --------------------------------------------------------------
        wsb = ws_base(kc + 1)
        d1c = TBr[k_hood:k_abase + 1]
        sfrac = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(d1c, axis=0), axis=1))])
        sfrac /= sfrac[-1]
        d0c = np.array([[0.0, lerp(hr[0][1], wsb[0][1], f), 0.0] for f in sfrac])
        d0c[:, 2] = [T_hood(0, y) for y in d0c[:, 1]]
        # make the windshield base corner coincide with W's TB at A_ABASE
        wsb[-1] = TBr[k_abase]
        cowl = coons_patch(hr, wsb, d0c, d1c)
        # cowl rises slightly toward the glass
        for i in range(cowl.shape[0]):
            for j in range(cowl.shape[1]):
                x, y = cowl[i, j, 0], cowl[i, j, 1]
                cowl[i, j, 2] = T_hood(x, y) + 0.004 * smoothstep(hr[0][1], wsb[0][1], y)
        cowl[:, 0, :] = hr
        cowl[:, -1, :] = wsb
        cowl[0, :, :] = d0c if True else cowl[0]
        cowl[-1, :, :] = d1c
        self.cowl = cowl
        self.wsb = wsb
        # ---- deck patches ------------------------------------------------------------
        nr_ = nc - 1 - kr + 1                      # lid rear edge count (corner -> centre)
        rear_edge = TBr[kr:nc][::-1]               # centre -> corner
        tf = self.trunk_front(nr_)
        rwb = rw_base(nr_)
        rwb[-1] = TBr[k_c1]
        d1l = TBr[k_trunk:kr + 1]                  # side: trunk front -> lid corner
        sfrac = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(d1l, axis=0), axis=1))])
        sfrac /= sfrac[-1]
        d0l = np.array([[0.0, lerp(tf[0][1], rear_edge[0][1], f), 0.0] for f in sfrac])
        d0l[:, 2] = [T_deck(0, y) for y in d0l[:, 1]]
        tf[-1] = TBr[k_trunk]
        self.lid = self._proj(coons_patch(tf, rear_edge, d0l, d1l), T_deck)
        d1p = TBr[k_c1:k_trunk + 1]
        sfrac = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(d1p, axis=0), axis=1))])
        sfrac /= sfrac[-1]
        d0p = np.array([[0.0, lerp(rwb[0][1], tf[0][1], f), 0.0] for f in sfrac])
        d0p[:, 2] = [T_deck(0, y) + 0.004 * (1 - f) for y, f in zip(d0p[:, 1], sfrac)]
        parcel = coons_patch(rwb, tf, d0p, d1p)
        for i in range(parcel.shape[0]):
            for j in range(parcel.shape[1]):
                f = j / (parcel.shape[1] - 1)
                parcel[i, j, 2] = T_deck(parcel[i, j, 0], parcel[i, j, 1]) + 0.004 * (1 - f)
        parcel[:, 0, :] = rwb
        parcel[:, -1, :] = tf
        parcel[-1, :, :] = d1p
        self.parcel = parcel
        self.rwb = rwb
        # ---- greenhouse ----------------------------------------------------------------
        nA = k_belt0 - k_abase + 1
        nS = k_c0 - k_belt0 + 1
        nC = k_c1 - k_c0 + 1
        nW = kc + 1
        nR = nr_
        bottom = np.concatenate([wsb, TBr[k_abase + 1:k_belt0 + 1], TBr[k_belt0 + 1:k_c0 + 1],
                                 TBr[k_c0 + 1:k_c1 + 1], rwb[::-1][1:]])
        top = np.concatenate([ws_top(nW), a_top(nA)[1:], side_top(nS)[1:], c_top(nC)[1:], rw_top(nR)[1:]])
        assert len(bottom) == len(top), (len(bottom), len(top))
        seg_of = np.array([0] * nW + [1] * (nA - 1) + [2] * (nS - 1) + [3] * (nC - 1) + [4] * (nR - 1))
        self.g_seg = seg_of
        self.g_segcounts = (nW, nA, nS, nC, nR)
        G = []
        for j in range(len(top)):
            G.append(self.g_section(bottom, top, j, seg_of[j]))
        self.G = np.array(G)
        # ---- roof ----------------------------------------------------------------------
        RT = self.G[:, -1, :]
        NT = len(RT)
        F = nW + nA - 1
        S = NT - 2 * F + 2
        front = RT[0:F]
        side = RT[F - 1:F - 1 + S]
        rear = RT[F - 1 + S - 1:][::-1]
        assert len(rear) == F, (len(rear), F)
        sfrac = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(side, axis=0), axis=1))])
        sfrac /= sfrac[-1]
        cl = np.array([[0.0, lerp(front[0][1], rear[0][1], f), 0.0] for f in sfrac])
        cl[:, 2] = [T_roof(0, y) for y in cl[:, 1]]
        self.roof = self._proj(coons_patch(front, rear, cl, side), T_roof)

    # ---------------------------------------------------------------------------------
    @staticmethod
    def _proj(P, fn):
        Q = P.copy()
        ni, nj = Q.shape[:2]
        for i in range(ni):
            for j in range(nj):
                if 0 < i < ni - 1 and 0 < j < nj - 1:
                    Q[i, j, 2] = fn(Q[i, j, 0], Q[i, j, 1])
        return Q

    def hood_rear(self, n):
        side = self.TBrow[self.aidx[A_HOOD]]
        pts = []
        for s in np.linspace(0, 1, 300):
            x = side[0] * s
            y = lerp(1.032, side[1], s ** 2)
            pts.append((x, y, T_hood(x, y)))
        pts[-1] = tuple(side)
        return resample(np.array(pts), n)

    def trunk_front(self, n):
        side = self.TBrow[self.aidx[A_TRUNK]]
        pts = []
        for s in np.linspace(0, 1, 300):
            x = side[0] * s
            y = lerp(-1.648, side[1], s ** 2)
            pts.append((x, y, T_deck(x, y)))
        pts[-1] = tuple(side)
        return resample(np.array(pts), n)

    def g_section(self, bottom, top, j, seg):
        b = bottom[j]
        t = top[j]
        tc = top[:, :2]
        inw = plan_inward(tc, j)
        if seg == 0:
            inw = np.array([0.0, -1.0]) * 0.6 + inw * 0.4 if j == 0 else inw
        bulge = {0: 0.020, 1: 0.012, 2: 0.012, 3: 0.016, 4: 0.016}[seg]
        out3 = np.array([-inw[0], -inw[1], 0.0])
        mid = 0.5 * (b + t) + out3 * bulge
        p1 = b + (t - b) * 0.06 + out3 * bulge * 0.25
        # roof edge roll: up and inward
        roll = t + np.array([inw[0] * 0.022, inw[1] * 0.022, 0.0])
        roll[2] = t[2] + 0.034
        tb = t + np.array([inw[0] * 0.065, inw[1] * 0.065, 0.0])
        tb[2] = T_roof(tb[0], tb[1])
        roll[2] = min(roll[2], tb[2] - 0.004)
        tens = {0: 0.0, 1: 0.0, 2: 0.0, 3: 0.35, 4: 0.0, 5: 0.0}
        ctrl = [(*b, 0.2), (*p1, 0.0), (*mid, 0.0), (*t, 0.45), (*roll, 0.0), (*tb, 0.0)]
        rows, _ = hermite_sections(ctrl, G_SEG)
        return rows

    # ---------------------------------------------------------------------------------
    def build_master(self, name='master'):
        """Half grids -> welded, mirrored master mesh with face attributes."""
        verts = []
        faces = []
        part = []
        zone = []
        rowi = []
        coli = []
        src = []

        def add_grid(P, partf, zonef, srcid, flip=False):
            base = len(verts)
            ni, nj = P.shape[:2]
            verts.extend(P.reshape(-1, 3).tolist())
            for i in range(ni - 1):
                for j in range(nj - 1):
                    a, b, c, d = base + i * nj + j, base + (i + 1) * nj + j, base + (i + 1) * nj + j + 1, base + i * nj + j + 1
                    faces.append((a, d, c, b) if flip else (a, b, c, d))
                    part.append(partf(i, j))
                    zone.append(zonef(i, j))
                    rowi.append(j)
                    coli.append(i)
                    src.append(srcid)

        k = self.k
        nc = len(self.us)
        r7 = W_ROW_OF[7]
        r9 = W_ROW_OF[9]

        def w_part(i, j):
            if i < N_FQ and j < r7:
                return 3
            if i >= nc - 1 - N_RQ and j < r7:
                return 4
            if j >= r9 and i < k['hood']:
                return 1
            if j >= r9 and i >= k['trunk']:
                return 2
            return 0

        def w_zone(i, j):
            return 1 if j >= r7 else 0

        add_grid(self.W, w_part, w_zone, 0, flip=False)
        add_grid(self.hood, lambda i, j: 1, lambda i, j: 1, 1, flip=True)
        add_grid(self.cowl, lambda i, j: 0, lambda i, j: 1, 2, flip=True)
        add_grid(self.lid, lambda i, j: 2, lambda i, j: 1, 3, flip=False)
        add_grid(self.parcel, lambda i, j: 0, lambda i, j: 1, 4, flip=False)
        nW, nA, nS, nC, nR = self.g_segcounts
        s0 = nW - 1 + nA - 1
        s1 = s0 + nS - 1
        rr = G_ROW_OF[3]

        def g_part(i, j):
            if s0 <= i < s1 and j < rr:
                return 5
            return 0
        add_grid(self.G, g_part, lambda i, j: 1, 5, flip=False)
        add_grid(self.roof, lambda i, j: 0, lambda i, j: 1, 6, flip=True)
        ob = new_mesh_obj(name, verts, faces, smooth=True)
        face_attr(ob, 'part', part)
        face_attr(ob, 'zone', zone)
        face_attr(ob, 'row', rowi)
        face_attr(ob, 'col', coli)
        face_attr(ob, 'src', src)
        merge_doubles(ob, 1e-5)
        from vlib import recalc_normals
        recalc_normals(ob)
        mirror_x(ob)
        recalc_normals(ob)
        log('master faces', len(ob.data.polygons))
        return ob
