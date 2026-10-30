// Hands (5 digits with knuckles, thenar/hypothenar pads, nails) and feet
// (barefoot toes, flip-flop sandals, closed shoes, socks), sculpted as separate
// higher-resolution SDF parts in a local frame and transformed into rig space.
import { clamp, smoothstep, lerp, noise } from '../core/math.js';
import { ellipsoid, sphere, roundCone, roundBox, custom, sdRoundBox } from './SDF.js';
import { BONE_INDEX as BI } from './Rig.js';
import { handLayout } from './Rig.js';
import { hexRGB } from './Clothing.js';
import { meshPart, mirrorMeshed, paintPart, paintSkin, V } from './BodyBuilder.js';

/** Build a frame transform: local (lx,ly,lz) -> rig = O + X*lx + Y*ly + Z*lz */
function frame(O, X, Y, Z) {
  const tp = (p) => [O[0] + X[0] * p[0] + Y[0] * p[1] + Z[0] * p[2], O[1] + X[1] * p[0] + Y[1] * p[1] + Z[1] * p[2], O[2] + X[2] * p[0] + Y[2] * p[1] + Z[2] * p[2]];
  const tb = (B) => {
    // B columns are local axes -> rig axes
    const col = (i) => [X[0] * B[i] + Y[0] * B[i + 1] + Z[0] * B[i + 2], X[1] * B[i] + Y[1] * B[i + 1] + Z[1] * B[i + 2], X[2] * B[i] + Y[2] * B[i + 1] + Z[2] * B[i + 2]];
    return [...col(0), ...col(3), ...col(6)];
  };
  const toLocal = (x, y, z) => {
    const dx = x - O[0], dy = y - O[1], dz = z - O[2];
    return [dx * X[0] + dy * X[1] + dz * X[2], dx * Y[0] + dy * Y[1] + dz * Y[2], dx * Z[0] + dy * Z[1] + dz * Z[2]];
  };
  const xform = (x, y, z, out) => {
    out[0] = O[0] + X[0] * x + Y[0] * y + Z[0] * z;
    out[1] = O[1] + X[1] * x + Y[1] * y + Z[1] * z;
    out[2] = O[2] + X[2] * x + Y[2] * y + Z[2] * z;
    return out;
  };
  const xformN = (x, y, z, out) => {
    out[0] = X[0] * x + Y[0] * y + Z[0] * z;
    out[1] = X[1] * x + Y[1] * y + Z[1] * z;
    out[2] = X[2] * x + Y[2] * y + Z[2] * z;
    return out;
  };
  return { tp, tb, toLocal, xform, xformN, X, Y, Z, O };
}
const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function segParam(p, a, b) {
  const ab = V.sub(b, a);
  const l2 = V.dot(ab, ab);
  const t = V.dot(V.sub(p, a), ab) / l2;
  const tc = clamp(t, 0, 1);
  const q = V.add(a, V.mul(ab, tc));
  return { t, d: V.len(V.sub(p, q)), len: Math.sqrt(l2) };
}

const LOCAL = frame([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);

/** Both hands: meshed once (right hand, local frame) and mirrored for the left. Returns [L, R] parts. */
export function buildHandParts(ctx, quality = 1) {
  const md = meshHand(ctx, quality);
  return [paintHand(ctx, 'L', mirrorMeshed(md)), paintHand(ctx, 'R', md)];
}

function meshHand(ctx, quality) {
  const { P } = ctx;
  const F = LOCAL;
  const side = 'R';
  const HL = handLayout(P, 1);
  const s = HL.scale, sx = HL.sx;
  const fem = P.fem;
  const thin = (fem ? 0.92 : 1) * (1 - P.old * 0.08);
  const prims = [];
  const add = (p) => (prims.push(p), p);
  const sk = (o) => ({ region: 'hand' + side, mat: 'skin', ...o });
  // wrist (overlaps forearm)
  add(ellipsoid(F.tp([0, -0.012 * s, 0.001]), [0.027 * s * thin, 0.034 * s, 0.018 * s], sk({ k: 0.012 * s, basis: F.tb(IDENT) })));
  // palm body
  add(custom((x, y, z) => {
    const [lx, ly, lz] = F.toLocal(x, y, z);
    // tapered rounded slab: wider at knuckles, slightly cupped
    const wy = clamp(ly / (0.09 * s), 0, 1);
    const hx = (0.034 + 0.008 * wy) * s * thin;
    const cup = (lx * lx) * 3.0;
    return sdRoundBox(lx - sx * 0.002 * s, ly - 0.052 * s, lz - 0.0015 * s + cup, hx, 0.04 * s, 0.0105 * s * thin, 0.009 * s);
  }, boxAround(F, [0, 0.05 * s, 0], 0.075 * s), sk({ k: 0.01 * s })));
  // thenar (thumb ball) & hypothenar
  const md = HL.thumb.d1;
  add(ellipsoid(F.tp([sx * 0.019 * s, 0.036 * s, -0.008 * s]), [0.017 * s * thin, 0.03 * s, 0.013 * s], sk({ k: 0.012 * s, basis: F.tb(rotBasisY(md)) })));
  add(ellipsoid(F.tp([-sx * 0.029 * s, 0.045 * s, -0.006 * s]), [0.012 * s * thin, 0.032 * s, 0.011 * s], sk({ k: 0.01 * s })));
  // distal palm pad under the knuckles
  add(ellipsoid(F.tp([sx * 0.002 * s, 0.083 * s, -0.007 * s]), [0.039 * s * thin, 0.014 * s, 0.01 * s], sk({ k: 0.008 * s })));
  // fingers
  for (const f of ['index', 'middle', 'ring', 'pinky']) {
    const d = HL[f];
    const r = d.r * thin;
    const k1 = F.tp(d.k1), k2 = F.tp(d.k2), tip = F.tp(d.tip);
    add(sphere(F.tp([d.k1[0], d.k1[1], d.k1[2] + 0.004 * s]), r * 1.12, sk({ k: 0.007 * s })));
    add(roundCone(k1, k2, r * 1.04, r * 0.92, sk({ k: 0.004 * s })));
    add(sphere(k2, r * 0.97, sk({ k: 0.004 * s })));
    const mid = V.lerp(k2, tip, 0.55);
    add(roundCone(k2, mid, r * 0.92, r * 0.84, sk({ k: 0.003 * s })));
    add(roundCone(mid, tip, r * 0.86, r * 0.74, sk({ k: 0.003 * s })));
  }
  // thumb
  {
    const d = HL.thumb;
    const t1 = F.tp(d.k1), t2 = F.tp(d.k2), tip = F.tp(d.tip);
    add(roundCone(t1, t2, d.r * 1.3 * thin, d.r * 1.08 * thin, sk({ k: 0.01 * s })));
    add(sphere(t2, d.r * 1.06 * thin, sk({ k: 0.005 * s })));
    const mid = V.lerp(t2, tip, 0.5);
    add(roundCone(t2, mid, d.r * 1.02 * thin, d.r * 0.95 * thin, sk({ k: 0.004 * s })));
    add(roundCone(mid, tip, d.r * 0.98 * thin, d.r * 0.8 * thin, sk({ k: 0.004 * s })));
  }
  const h = 0.0036 * s;
  return meshPart({ prims, h, margin: 0.012, relax: 2, targetTris: Math.round(2600 * quality), ao: { strength: 3, steps: [0.004, 0.008, 0.016, 0.03] } });
}

function paintHand(ctx, side, md) {
  const { P, L, spec, skin, W } = ctx;
  const hb = L['hand' + side].basis;
  const F = frame(L['hand' + side].pos, [hb[0], hb[1], hb[2]], [hb[3], hb[4], hb[5]], [hb[6], hb[7], hb[8]]);
  const HL = handLayout(P, side === 'R' ? 1 : -1);
  const s = HL.scale;
  // weights
  const fingerSegs = {};
  for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
    const d = HL[f];
    fingerSegs[f] = { k1: F.tp(d.k1), k2: F.tp(d.k2), tip: F.tp(d.tip) };
  }
  let lastInfo = null;
  const tmpW = new Float32Array(64);
  const weightFn = (reg, x, y, z, w) => {
    const [, ly] = F.toLocal(x, y, z);
    lastInfo = null;
    if (ly < 0.03 * s) {
      // wrist zone: same function as the arm so the seam deforms identically
      const a = tmpW.fill(0);
      W.arm(side, x, y, z, a);
      const blend = smoothstep(0.03 * s, 0.012 * s, ly);
      for (let i = 0; i < w.length; i++) w[i] += a[i] * blend;
      w[BI['hand' + side]] += 1 - blend;
      return;
    }
    const p = [x, y, z];
    let best = null, bd = Infinity, info = null;
    for (const f in fingerSegs) {
      const g = fingerSegs[f];
      const a = segParam(p, g.k1, g.k2), b = segParam(p, g.k2, g.tip);
      const d = Math.min(a.d, b.d);
      if (d < bd) { bd = d; best = f; info = { a, b }; }
    }
    const g = fingerSegs[best];
    const u1 = info.a.t * info.a.len; // distance along proximal from the knuckle
    const u2 = info.b.t * info.b.len; // along distal from the PIP
    const isThumb = best === 'thumb';
    const w1 = isThumb ? smoothstep(-0.006 * s, 0.012 * s, u1) * 0.85 + 0.1 : smoothstep(-0.007 * s, 0.007 * s, u1);
    const w2 = smoothstep(-0.006 * s, 0.006 * s, u2);
    // fade influence away from the finger surface (palm webbing stays on the hand)
    const near = smoothstep(0.03 * s, 0.012 * s, bd);
    const f1 = w1 * near;
    w[BI['hand' + side]] += 1 - f1;
    w[BI[best + '1' + side]] += f1 * (1 - w2);
    w[BI[best + '2' + side]] += f1 * w2;
    lastInfo = { finger: best, u2, len2: info.b.len };
  };
  const nailC = [lerp(skin[0], 0.93, 0.5), lerp(skin[1], 0.78, 0.5), lerp(skin[2], 0.74, 0.5)];
  const colorFn = (mat, x, y, z, ao, reg, nrm, v, out) => {
    paintSkin(skin, x, y, z, Math.min(1, ao * 1.05), P, spec, out, 'hand' + side);
    const nx = nrm[v * 3], ny = nrm[v * 3 + 1], nz = nrm[v * 3 + 2];
    const dors = nx * F.Z[0] + ny * F.Z[1] + nz * F.Z[2];
    // palms lighter and pinker
    if (dors < -0.2) {
      const k = smoothstep(-0.2, -0.7, dors) * 0.35;
      out[0] = lerp(out[0], Math.min(1, out[0] * 1.18 + 0.05), k);
      out[1] = lerp(out[1], out[1] * 1.08, k);
      out[2] = lerp(out[2], out[2] * 1.08, k);
    }
    const info = lastInfo;
    if (info && dors > 0.45 && info.u2 > info.len2 * (info.finger === 'thumb' ? 0.55 : 0.62)) {
      const k = smoothstep(0.45, 0.75, dors);
      out[0] = lerp(out[0], nailC[0], k); out[1] = lerp(out[1], nailC[1], k); out[2] = lerp(out[2], nailC[2], k);
      if (spec.ghost?.decay) { out[0] *= 0.6; out[1] *= 0.62; out[2] *= 0.58; }
    }
    // knuckle creases (dorsal): slight darkening over the joints
    return out;
  };
  return paintPart(md, { xform: F.xform, xformN: F.xformN, weightFn, colorFn, defaultRegion: 'hand' + side, smoothW: 1 });
}

function rotBasisY(dir) {
  // basis with Y along dir, Z ~ local +Z
  const y = V.norm(dir);
  let z = [0, 0, 1];
  const d = V.dot(z, y);
  z = V.norm(V.sub(z, V.mul(y, d)));
  const x = V.cross(y, z);
  return [...x, ...y, ...z];
}

function boxAround(F, c, r) {
  const p = F.tp(c);
  return [p[0] - r, p[1] - r, p[2] - r, p[0] + r, p[1] + r, p[2] + r];
}

// ---------------------------------------------------------------------------
// Feet
// ---------------------------------------------------------------------------
function footFrame(L, side) {
  const sg = side === 'R' ? 1 : -1;
  const A = L['foot' + side].pos, Bl = L['toe' + side].pos;
  const fwd = V.norm([Bl[0] - A[0], 0, Bl[2] - A[2]]);
  const lat = V.norm(V.cross([0, 1, 0], fwd)).map((v) => v * -sg); // outward
  if (lat[0] * sg < 0) for (let i = 0; i < 3; i++) lat[i] = -lat[i];
  return frame(A, lat, [0, 1, 0], fwd);
}

/** Both feet: meshed once in the (outward, up, forward) foot frame; the right frame is left-handed so its winding flips. */
export function buildFootParts(ctx, quality = 1) {
  const md = meshFoot(ctx, quality);
  const flipped = { ...md, mesh: { ...md.mesh, indices: flipWinding(md.mesh.indices) } };
  return [paintFoot(ctx, 'L', md), paintFoot(ctx, 'R', flipped)];
}

function flipWinding(idx) {
  const o = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i += 3) { o[i] = idx[i]; o[i + 1] = idx[i + 2]; o[i + 2] = idx[i + 1]; }
  return o;
}

function meshFoot(ctx, quality) {
  const { P, L, plan } = ctx;
  const side = 'R';
  const F = LOCAL;
  const s = P.footLen / 0.258;
  const ay = L.footR.pos[1]; // ankle height above ground
  const gy = -ay; // ground in local
  const shoes = plan.shoes || 'sandals';
  const prims = [];
  const add = (p) => (prims.push(p), p);
  const sk = (o) => ({ region: 'foot' + side, mat: 'skin', ...o });
  const thin = P.fem ? 0.92 : 1;
  // lower shin / ankle (overlaps body)
  add(roundCone(F.tp([0, 0.07 * s, -0.008 * s]), F.tp([0, 0.0, -0.006 * s]), P.ankleR * 1.0, P.ankleR * 0.98, sk({ k: 0.01 * s })));
  // malleoli
  add(sphere(F.tp([0.022 * s * thin, -0.004 * s, -0.008 * s]), 0.012 * s, sk({ k: 0.01 * s })));
  add(sphere(F.tp([-0.021 * s * thin, 0.006 * s, -0.004 * s]), 0.012 * s, sk({ k: 0.01 * s })));
  // achilles
  add(roundCone(F.tp([0, 0.07 * s, -0.035 * s]), F.tp([0, gy + 0.04 * s, -0.052 * s]), 0.013 * s, 0.015 * s, sk({ k: 0.012 * s })));
  // heel
  add(ellipsoid(F.tp([0.002 * s, gy + 0.033 * s, -0.035 * s]), [0.03 * s * thin, 0.034 * s, 0.038 * s], sk({ k: 0.015 * s })));
  // midfoot (dorsum higher on the medial side, lateral edge low)
  add(ellipsoid(F.tp([0.004 * s, gy + 0.035 * s, 0.055 * s]), [0.038 * s * thin, 0.032 * s, 0.085 * s], sk({ k: 0.02 * s, basis: F.tb(rotX(-0.2)) })));
  add(ellipsoid(F.tp([0.026 * s, gy + 0.016 * s, 0.07 * s]), [0.016 * s, 0.016 * s, 0.07 * s], sk({ k: 0.015 * s })));
  // ball
  add(ellipsoid(F.tp([-0.001 * s, gy + 0.02 * s, 0.135 * s]), [0.046 * s * thin, 0.02 * s, 0.03 * s], sk({ k: 0.015 * s })));
  // toes (big toe medial = -lateral)
  const toes = [
    { x: -0.027, z0: 0.15, len: 0.05, r: 0.0125 },
    { x: -0.006, z0: 0.155, len: 0.042, r: 0.0088 },
    { x: 0.01, z0: 0.15, len: 0.036, r: 0.0084 },
    { x: 0.024, z0: 0.14, len: 0.031, r: 0.008 },
    { x: 0.036, z0: 0.125, len: 0.025, r: 0.0076 },
  ];
  if (shoes !== 'shoes') {
    toes.forEach((t, i) => {
      const a = F.tp([t.x * s * thin, gy + 0.018 * s, t.z0 * s]);
      const spread = (i - 1.5) * 0.004 * s;
      const b = F.tp([(t.x * s + spread) * thin, gy + t.r * s * 0.95, (t.z0 + t.len) * s]);
      add(roundCone(a, b, t.r * s * 1.05, t.r * s * 0.95, sk({ k: 0.006 * s })));
    });
  }
  let soleTop = gy;
  if (shoes === 'sandals') {
    // flip-flop sole + V strap
    const sole = add(custom((x, y, z) => {
      const [lx, ly, lz] = F.toLocal(x, y, z);
      const zz = lz - 0.065 * s;
      const wx = lerp(0.034, 0.05, smoothstep(-0.07 * s, 0.1 * s, lz)) * s;
      return sdRoundBox(lx - 0.002 * s, ly - (gy + 0.006 * s), zz, wx, 0.0065 * s, 0.135 * s, 0.006 * s);
    }, boxAround(F, [0, gy, 0.065 * s], 0.2 * s), { k: 0.004 * s, mat: 'sole', bias: 0.002, region: 'foot' + side }));
    void sole;
    soleTop = gy + 0.012 * s;
    const post = F.tp([-0.017 * s, gy + 0.014 * s, 0.155 * s]);
    for (const sx of [-1, 1]) {
      const mid = F.tp([sx * 0.016 * s, gy + 0.04 * s, 0.105 * s]);
      const end = F.tp([sx * 0.043 * s, gy + 0.02 * s, 0.07 * s]);
      add(roundCone(post, mid, 0.0052 * s, 0.0058 * s, { k: 0.003 * s, mat: 'strap', bias: 0.003, region: 'foot' + side }));
      add(roundCone(mid, end, 0.0058 * s, 0.006 * s, { k: 0.003 * s, mat: 'strap', bias: 0.003, region: 'foot' + side }));
    }
    // lift the foot onto the sole
    for (const p of prims) if (p.mat === 'skin') { const e = p.eval; p.eval = (x, y, z) => e(x, y - 0.011 * s, z); p.bbox = [p.bbox[0], p.bbox[1] + 0.011 * s, p.bbox[2], p.bbox[3], p.bbox[4] + 0.011 * s, p.bbox[5]]; }
  } else if (shoes === 'shoes') {
    // closed shoe: upper shell + toe box + sole
    const up = add(custom((x, y, z) => {
      const [lx, ly, lz] = F.toLocal(x, y, z);
      let d = 1;
      // heel cup
      d = Math.min(d, sdEll(lx - 0.002 * s, ly - (gy + 0.036 * s), lz + 0.035 * s, 0.038 * s, 0.042 * s, 0.045 * s));
      // vamp
      d = smoothMin(d, sdEll(lx - 0.004 * s, ly - (gy + 0.034 * s), lz - 0.06 * s, 0.046 * s, 0.038 * s, 0.1 * s), 0.02 * s);
      // toe box
      d = smoothMin(d, sdEll(lx + 0.001 * s, ly - (gy + 0.025 * s), lz - 0.16 * s, 0.047 * s, 0.026 * s, 0.06 * s), 0.02 * s);
      // collar height: lower at the sides, higher over the tongue
      return Math.max(d, ly - (gy + 0.07 * s + Math.max(0, lz) * 0.15));
    }, boxAround(F, [0, gy + 0.04 * s, 0.07 * s], 0.18 * s), { k: 0.005 * s, mat: 'shoe', bias: 0.004, region: 'foot' + side }));
    void up;
    add(custom((x, y, z) => {
      const [lx, ly, lz] = F.toLocal(x, y, z);
      const wx = lerp(0.036, 0.05, smoothstep(-0.07 * s, 0.1 * s, lz)) * s;
      return sdRoundBox(lx - 0.002 * s, ly - (gy + 0.008 * s), lz - 0.068 * s, wx, 0.008 * s, 0.14 * s, 0.006 * s);
    }, boxAround(F, [0, gy, 0.065 * s], 0.2 * s), { k: 0.004 * s, mat: 'sole', bias: 0.006, region: 'foot' + side }));
    // lift foot
    for (const p of prims) if (p.mat === 'skin') { const e = p.eval; p.eval = (x, y, z) => e(x, y - 0.014 * s, z); p.bbox = [p.bbox[0], p.bbox[1] + 0.014 * s, p.bbox[2], p.bbox[3], p.bbox[4] + 0.014 * s, p.bbox[5]]; }
    soleTop = gy + 0.016 * s;
  }
  void soleTop;
  const h = 0.0048 * s;
  return meshPart({ prims, h, margin: 0.015, relax: 2, targetTris: Math.round(2200 * quality), ao: { strength: 3, steps: [0.005, 0.01, 0.02, 0.035] } });
}

function paintFoot(ctx, side, md) {
  const { P, L, spec, skin, W, plan } = ctx;
  const F = footFrame(L, side);
  const s = P.footLen / 0.258;
  const gy = -L['foot' + side].pos[1];
  const shoes = plan.shoes || 'sandals';
  const shoeC = hexRGB(plan.shoeColor ?? (spec.age < 16 ? 0x151515 : 0x1c1a18));
  const soleC = shoes === 'sandals' ? hexRGB(plan.sandalColor ?? 0x2a4a7a) : [0.12, 0.11, 0.1];
  const strapC = [0.86, 0.84, 0.8];
  const sockC = plan.socks ? hexRGB(plan.socks) : null;
  const sockTop = P.ankleY + (plan.sockLen ?? 0.3) * (P.kneeY - P.ankleY);
  const weightFn = (reg, x, y, z, w) => W.leg(side, x, y, z, w);
  const colorFn = (mat, x, y, z, ao, reg, nrm, v, out) => {
    if (mat === 'sole') {
      const ny = nrm[v * 3 + 1];
      const top = ny > 0.5;
      const c = top ? [soleC[0] * 1.15, soleC[1] * 1.1, soleC[2] * 1.05] : shoes === 'sandals' ? [0.9, 0.88, 0.84] : soleC;
      out[0] = c[0] * (0.6 + 0.4 * ao); out[1] = c[1] * (0.6 + 0.4 * ao); out[2] = c[2] * (0.6 + 0.4 * ao);
      return out;
    }
    if (mat === 'strap') { out[0] = strapC[0] * ao; out[1] = strapC[1] * ao; out[2] = strapC[2] * ao; return out; }
    if (mat === 'shoe') {
      const n = noise.noise3D(x * 40, y * 40, z * 40) * 0.05;
      const lz = F.toLocal(x, y, z);
      // laces
      let k = 1;
      if (Math.abs(lz[0]) < 0.012 * s && lz[2] > 0.03 * s && lz[2] < 0.11 * s && Math.sin(lz[2] * 400) > 0.3) k = 1.6;
      out[0] = (shoeC[0] + n) * k * (0.55 + 0.45 * ao); out[1] = (shoeC[1] + n) * k * (0.55 + 0.45 * ao); out[2] = (shoeC[2] + n) * k * (0.55 + 0.45 * ao);
      return out;
    }
    if (sockC && y < sockTop && y > 0.0) {
      const n = noise.noise3D(x * 50, y * 50, z * 50) * 0.04;
      out[0] = (sockC[0] + n) * (0.6 + 0.4 * ao); out[1] = (sockC[1] + n) * (0.6 + 0.4 * ao); out[2] = (sockC[2] + n) * (0.6 + 0.4 * ao);
      return out;
    }
    paintSkin(skin, x, y, z, ao, P, spec, out, 'foot' + side);
    // toenails
    const [lx, ly, lz] = F.toLocal(x, y, z);
    const ny = nrm[v * 3 + 1];
    if (shoes !== 'shoes' && lz > 0.165 * s && ny > 0.55 && ly > gy + 0.012 * s) {
      const k = smoothstep(0.55, 0.85, ny) * 0.55;
      out[0] = lerp(out[0], 0.9, k); out[1] = lerp(out[1], 0.78, k); out[2] = lerp(out[2], 0.72, k);
    }
    // dusty soles
    if (ly < gy + 0.01 * s) { out[0] *= 0.8; out[1] *= 0.78; out[2] *= 0.76; }
    return out;
  };
  return paintPart(md, { xform: F.xform, xformN: F.xformN, weightFn, colorFn, defaultRegion: 'foot' + side, smoothW: 1 });
}

function rotX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, c, s, 0, -s, c];
}
function sdEll(x, y, z, a, b, c) {
  const k0 = Math.hypot(x / a, y / b, z / c);
  const k1 = Math.hypot(x / (a * a), y / (b * b), z / (c * c));
  return k1 < 1e-9 ? -Math.min(a, b, c) : (k0 * (k0 - 1)) / k1;
}
function smoothMin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
