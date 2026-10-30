// Head: separate high-resolution SDF (cranium, brow ridge, eye sockets,
// cheekbones, nose, lips, chin, jaw, ears, upper neck), eyeballs and eyelid
// shells merged into ONE skinned geometry with:
//   * a warped-cylindrical UV into a painted face texture (Face.js) + an eye tile,
//   * morph targets for expressions / blinking (FACS-like atoms),
//   * skin weights: neck/head chain, jaw (lower face), eyes, lids.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, makeRng, hashString, noise } from '../core/math.js';
import { ellipsoid, sphere, roundCone, capsule, custom, basisFromEuler, primsBounds } from './SDF.js';
import { BONE_INDEX as BI, BONE_COUNT } from './Rig.js';
import { meshPart, neckPrims } from './BodyBuilder.js';
import { packWeights } from './BodyBuilder.js';

export const MORPHS = ['browUp', 'browInnerUp', 'browDown', 'smile', 'frown', 'mouthWide', 'blinkL', 'blinkR', 'lidWide', 'squint', 'cheekL', 'cheekR', 'lipPress', 'sneer'];
export const MORPH_INDEX = Object.fromEntries(MORPHS.map((m, i) => [m, i]));

/** Face shape parameters (head-local metres, origin = head pivot). */
export function faceParams(spec, P) {
  const f = spec.face || {};
  const seed = f.seed ?? hashString(String(spec.id || 'anon'));
  const rng = makeRng(seed);
  const j = (a) => 1 + (rng() - 0.5) * 2 * a;
  const hs = P.headScale;
  const fem = P.fem, child = P.child, old = P.old;
  const fs = hs * (1 - child * 0.16); // face features scale
  const F = {
    hs, fs, fem, child, old, seed,
    eyeX: 0.0318 * hs * j(0.03), eyeY: 0.06 * hs, eyeZ: -0.0705 * hs,
    eyeR: 0.0121 * hs,
    eyeSize: (f.eyeSize ?? 1) * j(0.05) * (1 + child * 0.06),
    eyeTilt: (fem ? 0.06 : 0.03) + (rng() - 0.5) * 0.06,
    lidOpen: (0.85 + rng() * 0.15) * (1 - old * 0.18),
    epicanthic: 0.6 + rng() * 0.3,
    noseW: (f.noseWidth ?? 1) * j(0.08) * (fem ? 0.92 : 1),
    noseLen: j(0.06) * (1 - child * 0.12) * (1 + old * 0.06),
    noseProj: j(0.12) * (1 - child * 0.25) * 0.9,
    lipFull: j(0.12) * (fem ? 1.12 : 1) * (1 - old * 0.3),
    mouthW: j(0.06) * (fem ? 0.95 : 1),
    jaw: (f.jaw ?? 1) * j(0.06) * (fem ? 0.9 : 1.05) * (1 - child * 0.12),
    chin: j(0.1) * (fem ? 0.92 : 1.04),
    cheek: (f.cheek ?? 1) * j(0.1) * (1 + child * 0.35 + (P.fat - 1) * 0.6) * (1 - old * 0.25),
    cheekbone: j(0.1) * (1 - child * 0.4),
    brow: (fem ? 0.5 : 1) * j(0.15) * (1 - child * 0.6),
    earSize: j(0.08) * (1 + old * 0.15),
    fat: P.fat,
    wrinkles: f.wrinkles ?? clamp((P.age - 35) / 45, 0, 1),
    smileRest: f.smile ?? 0,
  };
  // landmarks (head-local)
  const fy = (y) => F.eyeY + (y - 0.06) * fs;
  F.browY = fy(0.078);
  F.noseTipY = fy(0.017 - (F.noseLen - 1) * 0.01);
  F.noseBaseY = fy(0.006 - (F.noseLen - 1) * 0.006);
  F.mouthY = fy(-0.0135);
  F.chinY = -(P.headY - P.chinY);
  F.crownY = P.H - P.headY;
  F.mouthZ = -0.0905 * lerp(hs, fs, 0.6);
  F.cornerX = 0.0238 * fs * F.mouthW;
  return F;
}

/** SDF primitives of the head in head-local space (origin = head pivot, -Z = face). */
export function headPrims(P, F, spec) {
  const hs = F.hs, fs = F.fs;
  const prims = [];
  const add = (p) => (prims.push(p), p);
  const R = (o) => ({ region: 'head', mat: 'skin', ...o });
  const SUB = (o) => ({ op: 'sub', ...o });
  const fat = F.fat;
  const cY = F.crownY;
  const eY = F.eyeY;
  // face-space point: features below the eyes shrink with fs (children), x/z scale with fs
  const f = (x, y, z) => [x * fs, eY + (y - 0.06) * fs, z * lerp(hs, fs, 0.6)];
  const k = (v) => v * hs;
  // ---- cranium: broad vault, flat-ish occiput, sloping forehead
  add(ellipsoid([0, cY - 0.09 * hs, 0.014 * hs], [0.0765 * hs, 0.09 * hs, 0.093 * hs], R({ k: k(0.02) })));
  add(ellipsoid([0, 0.06 * hs, 0.05 * hs], [0.062 * hs, 0.06 * hs, 0.055 * hs], R({ k: k(0.03) }))); // occipital / back of skull base
  add(ellipsoid(f(0, 0.108, -0.04), [0.066 * hs, 0.056 * hs, 0.052 * hs], R({ k: k(0.03) }))); // forehead
  for (const sg of [-1, 1]) add(ellipsoid([sg * 0.074 * hs, 0.088 * hs, -0.036 * hs], [0.012 * hs, 0.022 * hs, 0.02 * hs], SUB({ k: k(0.018) }))); // temples
  // ---- face mask: one smooth volume from the cheekbones down to the jaw (keeps the face soft)
  add(ellipsoid(f(0, 0.012, -0.03), [0.06 * fs * (0.92 + 0.08 * F.jaw), 0.064 * fs, 0.055 * fs], R({ k: k(0.03) })));
  // ---- midface (maxilla + nasal base) and the mouth "muzzle" (teeth arch)
  add(ellipsoid(f(0, 0.026, -0.05), [0.045 * fs, 0.04 * fs, 0.042 * fs], R({ k: k(0.028) })));
  add(ellipsoid(f(0, -0.012, -0.066), [0.03 * fs, 0.025 * fs, 0.026 * fs], R({ k: k(0.024) })));
  // ---- cheekbones (zygoma body + arch), cheeks
  for (const sg of [-1, 1]) {
    const cb = F.cheekbone;
    add(ellipsoid(f(sg * 0.048, 0.044, -0.056), [0.02 * fs * cb, 0.014 * fs, 0.02 * fs], R({ k: k(0.022), basis: basisFromEuler(0, sg * 0.55, sg * -0.25) })));
    add(capsule(f(sg * 0.054, 0.045, -0.048), f(sg * 0.062, 0.043, -0.012), 0.0085 * fs, R({ k: k(0.02) })));
    add(ellipsoid(f(sg * 0.036, 0.006, -0.06), [0.024 * fs * F.cheek, 0.026 * fs, 0.021 * fs * F.cheek], R({ k: k(0.028) })));
    if (F.old > 0.35) add(ellipsoid(f(sg * 0.042, -0.03, -0.05), [0.016 * fs, 0.016 * fs, 0.016 * fs], R({ k: k(0.022) }))); // jowls
  }
  // ---- mandible: ramus (TMJ -> gonion) + body (gonion -> chin) + chin (subtle, well blended)
  const jw = F.jaw;
  for (const sg of [-1, 1]) {
    const tmj = f(sg * 0.057, 0.034, -0.006);
    const gon = f(sg * 0.046 * jw, -0.026, -0.008);
    const chn = f(sg * 0.016, -0.05, -0.07);
    add(capsule(tmj, gon, 0.009 * hs, R({ k: k(0.024) })));
    add(capsule(gon, chn, 0.0085 * fs, R({ k: k(0.024) })));
  }
  add(ellipsoid(f(0, -0.046, -0.074), [0.02 * fs * F.chin, 0.014 * fs, 0.014 * fs * F.chin], R({ k: k(0.018) })));
  // soft under-jaw for heavy / elderly (double chin)
  if (fat > 1.1 || F.old > 0.55) add(ellipsoid(f(0, -0.056, -0.048), [0.03 * fs, 0.013 * fs + (fat - 1) * 0.012, 0.026 * fs], R({ k: k(0.025) })));
  // ---- brow ridge + glabella
  const br = F.brow;
  for (const sg of [-1, 1]) add(capsule(f(sg * 0.009, 0.077, -0.088), f(sg * 0.05, 0.08, -0.071), (0.006 + 0.004 * br) * fs, R({ k: k(0.013) })));
  add(ellipsoid(f(0, 0.07, -0.086), [0.011 * fs, 0.013 * fs, 0.009 * fs], R({ k: k(0.012) })));
  // ---- eye sockets (carved to fit the eyeballs; lids are separate shells)
  for (const sg of [-1, 1]) {
    const ex = sg * F.eyeX;
    add(ellipsoid([ex, eY + 0.0015 * hs, F.eyeZ - 0.0055 * hs], [0.0178 * hs * F.eyeSize, 0.0125 * hs * F.eyeSize, 0.0135 * hs], SUB({ k: k(0.0065), basis: basisFromEuler(0, 0, sg * -F.eyeTilt) })));
    // upper-lid fullness (East Asian: fuller lid, low crease) and the lower lid / tear trough
    add(ellipsoid([ex + sg * 0.002 * hs, eY + 0.0118 * hs, F.eyeZ - 0.0095 * hs], [0.0168 * hs, 0.0052 * hs * (0.8 + 0.4 * F.epicanthic), 0.0072 * hs], R({ k: k(0.0055) })));
    add(ellipsoid([ex, eY - 0.0142 * hs, F.eyeZ - 0.0078 * hs], [0.0158 * hs, 0.0045 * hs, 0.0068 * hs], R({ k: k(0.0055) })));
  }
  // ---- nose: bridge, tip, alae, nostrils (lower bridge, broader alae)
  const nw = F.noseW, np = F.noseProj;
  const tip = f(0, F.noseTipY / fs - 0.0, -0.104 - 0.006 * np);
  tip[1] = F.noseTipY;
  add(roundCone(f(0, 0.066, -0.088), [0, F.noseTipY + 0.009 * fs, tip[2] + 0.005 * fs], 0.0058 * fs, 0.0078 * fs * nw, R({ k: k(0.0075) })));
  add(ellipsoid(tip, [0.0108 * fs * nw, 0.0098 * fs, 0.0102 * fs], R({ k: k(0.0055) })));
  for (const sg of [-1, 1]) {
    add(ellipsoid([sg * 0.0132 * fs * nw, F.noseBaseY + 0.0068 * fs, tip[2] + 0.0105 * fs], [0.0082 * fs * nw, 0.007 * fs, 0.0078 * fs], R({ k: k(0.0038) })));
    add(ellipsoid([sg * 0.0066 * fs * nw, F.noseBaseY + 0.0032 * fs, tip[2] + 0.0068 * fs], [0.0041 * fs * nw, 0.0024 * fs, 0.0046 * fs], SUB({ k: k(0.002) })));
  }
  // ---- lips (subtle volumes on the muzzle)
  const lf = F.lipFull;
  const mz = F.mouthZ;
  add(ellipsoid([0, F.mouthY + 0.0052 * fs, mz + 0.0012 * hs], [F.cornerX * 0.97, 0.0048 * fs * lf, 0.0066 * fs], R({ k: k(0.006), basis: basisFromEuler(-0.35, 0, 0) })));
  add(ellipsoid([0, F.mouthY - 0.006 * fs, mz + 0.0026 * fs], [F.cornerX * 0.84, 0.0056 * fs * lf, 0.0068 * fs], R({ k: k(0.006), basis: basisFromEuler(0.35, 0, 0) })));
  add(capsule([0, F.noseBaseY - 0.0015 * fs, mz + 0.0035 * fs], [0, F.mouthY + 0.0098 * fs, mz - 0.0005 * fs], 0.0015 * fs, SUB({ k: k(0.0026) }))); // philtrum
  add(ellipsoid([0, F.mouthY, mz - 0.0024 * fs], [F.cornerX * 0.97, 0.0014 * fs, 0.0074 * fs], SUB({ k: k(0.0022) }))); // lip line
  for (const sg of [-1, 1]) add(sphere([sg * F.cornerX * 1.03, F.mouthY + 0.0004, mz + 0.005 * fs], 0.0027 * fs, SUB({ k: k(0.0036) })));
  // mentolabial sulcus (groove under the lower lip)
  add(capsule([-0.011 * fs, F.mouthY - 0.0155 * fs, mz + 0.002 * fs], [0.011 * fs, F.mouthY - 0.0155 * fs, mz + 0.002 * fs], 0.0028 * fs, SUB({ k: k(0.006) })));
  // ---- ears
  const es = F.earSize;
  for (const sg of [-1, 1]) {
    const ec = [sg * 0.0745 * hs, 0.047 * hs, 0.007 * hs];
    const eb = basisFromEuler(0.2, sg * -0.42, sg * 0.06);
    add(ellipsoid(ec, [0.0088 * hs, 0.029 * hs * es, 0.0175 * hs * es], R({ k: k(0.0055), basis: eb })));
    add(ellipsoid([ec[0] + sg * 0.0045 * hs, ec[1] + 0.001 * hs, ec[2] - 0.0005 * hs], [0.0058 * hs, 0.0165 * hs * es, 0.0098 * hs * es], SUB({ k: k(0.0038), basis: eb }))); // concha
    add(sphere([ec[0] - sg * 0.001 * hs, ec[1] - 0.025 * hs * es, ec[2] - 0.004 * hs], 0.0072 * hs * es, R({ k: k(0.0055) }))); // lobe
    add(capsule([ec[0] - sg * 0.008 * hs, ec[1] + 0.002 * hs, ec[2] - 0.012 * hs], [ec[0] - sg * 0.014 * hs, ec[1] - 0.002 * hs, ec[2] - 0.02 * hs], 0.004 * hs, R({ k: k(0.005) }))); // tragus/base
  }
  // ---- upper neck (identical to the body's neck column) + skull-to-neck join behind the jaw
  for (const p of neckPrims(P, -P.headY, -P.headZ)) add(p);
  add(roundCone([0, P.neckTop[1] - P.headY, P.neckTop[2] - P.headZ], [0, 0.035 * hs, 0.02 * hs], P.neckR * 0.98, P.neckR * 0.9, R({ k: k(0.03) })));
  return prims;
}

// ---------------------------------------------------------------------------
// UV mapping (warped cylinder around the head's vertical axis)
// ---------------------------------------------------------------------------
export function makeUV(F) {
  const yMin = -0.14 * F.hs, yMax = F.crownY + 0.005;
  const zc = 0.008 * F.hs;
  return (x, y, z, out) => {
    const th = Math.atan2(x, -(z - zc)); // 0 = front
    const t = Math.abs(th) / Math.PI;
    const w = 1 - (1 - t) * (1 - t);
    out[0] = 0.5 + Math.sign(th) * w * 0.5;
    out[1] = clamp((y - yMin) / (yMax - yMin), 0, 1) * 0.86;
    return out;
  };
}
export const EYE_TILE = { u0: 0.0, v0: 0.875, size: 0.12 };
export const MOUTH_UV = [0.18, 0.93]; // dark mouth interior swatch

// ---------------------------------------------------------------------------
// Eyes & lids
// ---------------------------------------------------------------------------
function eyeball(F, sg, out) {
  const R = F.eyeR, c = [sg * F.eyeX, F.eyeY, F.eyeZ];
  const W = 18, H = 14;
  const base = out.pos.length / 3;
  for (let j = 0; j <= H; j++) {
    const v = j / H;
    const ph = v * Math.PI; // 0 top .. PI bottom
    for (let i = 0; i <= W; i++) {
      const u = i / W;
      const th = u * Math.PI * 2;
      let nx = Math.sin(ph) * Math.sin(th), ny = Math.cos(ph), nz = -Math.sin(ph) * Math.cos(th);
      // cornea bulge in front
      const front = Math.max(0, -nz);
      const bulge = 1 + Math.pow(front, 6) * 0.07;
      out.pos.push(c[0] + nx * R * bulge, c[1] + ny * R * bulge, c[2] + nz * R * bulge);
      out.nor.push(nx, ny, nz);
      // planar front projection into the eye tile (back hemisphere -> sclera edge)
      const k = nz < 0 ? 1 : 1 + nz * 2;
      const pu = clamp(nx * 0.5 * k, -0.5, 0.5), pv = clamp(ny * 0.5 * k, -0.5, 0.5);
      out.uv.push(EYE_TILE.u0 + (0.5 + pu) * EYE_TILE.size, EYE_TILE.v0 + (0.5 + pv) * EYE_TILE.size);
      out.bone.push(sg > 0 ? BI.eyeR : BI.eyeL);
      out.kind.push(1);
    }
  }
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const a = base + j * (W + 1) + i, b = a + 1, c2 = a + (W + 1), d = c2 + 1;
      out.idx.push(a, c2, b, b, c2, d);
    }
  }
}

/** Eyelid shells (upper + lower) around one eye. Records blink/wide/squint deltas. */
function eyelids(F, sg, out, uvFn) {
  const R0 = F.eyeR;
  const c = [sg * F.eyeX, F.eyeY, F.eyeZ];
  const a0 = 1.28 * F.eyeSize; // half-width of the opening (azimuth)
  const a1 = a0 + 0.45;
  const tilt = F.eyeTilt * sg;
  const upOpen = 0.43 * F.lidOpen * F.eyeSize, loOpen = -0.42 * F.eyeSize;
  const NA = 16, NB = 7;
  const tmpUV = [0, 0];
  const lid = (upper) => {
    const base = out.pos.length / 3;
    for (let j = 0; j <= NB; j++) {
      const t = j / NB; // 0 = margin, 1 = outer edge
      for (let i = 0; i <= NA; i++) {
        const a = -a1 + (2 * a1 * i) / NA;
        const inside = clamp(1 - Math.abs(a) / a0, 0, 1);
        const prof = Math.pow(Math.sin(inside * Math.PI * 0.5), upper ? 0.75 : 0.9);
        // inner corner slightly lower (epicanthic), outer corner tilted up
        const cornerTilt = (a * sg > 0 ? 1 : -1) * 0;
        const mUp = upOpen * prof + tilt * (a / a0) * 0.5;
        const mLo = loOpen * prof + tilt * (a / a0) * 0.5;
        const margin = upper ? mUp : mLo;
        const edge = upper ? 1.25 : -1.15;
        const b = lerp(margin, edge, Math.pow(t, 1.25));
        // radius: thin margin hugging the eye, flaring into the socket wall
        const R = R0 * (1.05 + 0.02 * (1 - t) + 0.42 * t * t + (j === 0 ? -0.025 : 0)) * (upper ? 1.0 : 0.99);
        const az = a * sg;
        const nx = Math.sin(az) * Math.cos(b), ny = Math.sin(b), nz = -Math.cos(az) * Math.cos(b);
        void cornerTilt;
        const px = c[0] + nx * R, py = c[1] + ny * R, pz = c[2] + nz * R;
        out.pos.push(px, py, pz);
        out.nor.push(nx, ny, nz);
        uvFn(px, py, pz, tmpUV);
        out.uv.push(tmpUV[0], tmpUV[1]);
        out.bone.push(BI.head);
        out.kind.push(upper ? 2 : 3);
        // morph deltas: blink (upper closes to the lower line), wide, squint
        const w = Math.pow(1 - t, 1.6);
        const closeB = lerp(margin, lerp(mLo, mUp, 0.18), 1) ;
        const rot = (db) => {
          const b2 = b + db;
          return [c[0] + Math.sin(az) * Math.cos(b2) * R - px, c[1] + Math.sin(b2) * R - py, c[2] + -Math.cos(az) * Math.cos(b2) * R - pz];
        };
        if (upper) {
          out.blink.push(...rot((closeB - margin) * w));
          out.wide.push(...rot(0.22 * w * prof));
          out.squint.push(...rot(-0.12 * w * prof));
        } else {
          out.blink.push(...rot(0.1 * w * prof));
          out.wide.push(...rot(-0.06 * w * prof));
          out.squint.push(...rot(0.2 * w * prof));
        }
        out.side.push(sg);
        if (j === 0) (upper ? out.marginUp : out.marginLo).push([px, py, pz, sg]);
      }
    }
    for (let j = 0; j < NB; j++) {
      for (let i = 0; i < NA; i++) {
        const a = base + j * (NA + 1) + i, b = a + 1, c2 = a + (NA + 1), d = c2 + 1;
        // winding: outward normals (mirrors between the eyes)
        const flip = sg > 0;
        if (upper !== flip) out.idx.push(a, b, c2, b, d, c2);
        else out.idx.push(a, c2, b, b, c2, d);
      }
    }
  };
  lid(true);
  lid(false);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
/**
 * Build the head geometry in RIG space (bind pose). Returns { geometry, F, uvFn, landmarks }.
 */
export function buildHeadGeometry(spec, P, L, W, quality = 1) {
  const t0 = performance.now();
  const F = P.face || faceParams(spec, P);
  const prims = headPrims(P, F, spec);
  const hs = F.hs;
  const b = primsBounds(prims, 0.01);
  // detail weighting: face front gets more triangles than the scalp / neck
  const detailFn = (x, y, z) => {
    const front = smoothstep(-0.02, -0.08, z) * smoothstep(-0.07, -0.03, y) * smoothstep(0.13, 0.09, y);
    const ear = smoothstep(0.06, 0.07, Math.abs(x)) * smoothstep(0.0, 0.03, y) * smoothstep(0.09, 0.07, y);
    return 1 + front * 22 + ear * 6;
  };
  const md = meshPart({ prims, h: 0.0031 * hs, margin: 0.012, relax: 2, targetTris: Math.round(7600 * quality), detailFn, bounds: b, ao: { strength: 3.2, steps: [0.003, 0.006, 0.012, 0.024] } });
  const mesh = md.mesh;
  const n = mesh.count;
  const uvFn = makeUV(F);
  // --- assemble arrays: head surface + eyes + lids
  const pos = [], nor = [], uv = [], idx = [], kinds = [];
  const tmp = [0, 0];
  for (let v = 0; v < n; v++) {
    const x = mesh.positions[v * 3], y = mesh.positions[v * 3 + 1], z = mesh.positions[v * 3 + 2];
    pos.push(x, y, z);
    nor.push(mesh.normals[v * 3], mesh.normals[v * 3 + 1], mesh.normals[v * 3 + 2]);
    uvFn(x, y, z, tmp);
    uv.push(tmp[0], tmp[1]);
    kinds.push(0);
  }
  for (let i = 0; i < mesh.indices.length; i++) idx.push(mesh.indices[i]);
  const ao = Array.from(md.ao);
  const extra = { pos: [], nor: [], uv: [], idx: [], bone: [], kind: [], blink: [], wide: [], squint: [], side: [], marginUp: [], marginLo: [] };
  eyeball(F, -1, extra);
  eyeball(F, 1, extra);
  const eyeEnd = extra.pos.length / 3;
  eyelids(F, -1, extra, uvFn);
  eyelids(F, 1, extra, uvFn);
  const base = n;
  for (let i = 0; i < extra.pos.length; i++) pos.push(extra.pos[i]);
  for (let i = 0; i < extra.nor.length; i++) nor.push(extra.nor[i]);
  for (let i = 0; i < extra.uv.length; i++) uv.push(extra.uv[i]);
  for (let i = 0; i < extra.idx.length; i++) idx.push(extra.idx[i] + base);
  for (let i = 0; i < extra.kind.length; i++) { kinds.push(extra.kind[i]); ao.push(1); }
  const total = pos.length / 3;

  // --- weights
  const dense = new Float32Array(total * BONE_COUNT);
  const w = new Float32Array(BONE_COUNT);
  const mouthY = F.mouthY;
  const jawW = new Float32Array(total);
  for (let v = 0; v < total; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    w.fill(0);
    const k = kinds[v];
    if (k === 1) {
      w[extra.bone[v - base]] = 1;
    } else if (k >= 2) {
      w[BI.head] = 1;
    } else {
      W.torso(x, y + P.headY, z + P.headZ, w);
      // jaw: below the mouth line, in front of the jaw hinge, down to the chin/throat
      const A = smoothstep(mouthY + 0.0025 * hs, mouthY - 0.0045 * hs, y);
      const B = smoothstep(0.018 * hs, -0.012 * hs, z);
      const C = smoothstep(F.chinY - 0.03 * hs, F.chinY + 0.006 * hs, y);
      const side = smoothstep(0.072 * hs, 0.05 * hs, Math.abs(x));
      const j = A * B * C * side;
      jawW[v] = j;
      if (j > 0) {
        for (let i = 0; i < BONE_COUNT; i++) w[i] *= 1 - j;
        w[BI.jaw] += j;
      }
    }
    dense.set(w, v * BONE_COUNT);
  }
  const { si, sw } = packWeights(dense, total);
  // mouth seam: vertices around the lip line with mixed jaw weight get the dark mouth UV
  for (let v = 0; v < n; v++) {
    const j = jawW[v];
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    if (j > 0.3 && j < 0.7 && Math.abs(x) < F.cornerX * 0.92 && Math.abs(y - mouthY) < 0.004 * hs && z < F.mouthZ + 0.012 * hs) {
      uv[v * 2] = MOUTH_UV[0];
      uv[v * 2 + 1] = MOUTH_UV[1];
    }
  }

  // --- morph targets (relative deltas)
  const morphs = MORPHS.map(() => new Float32Array(total * 3));
  const M = Object.fromEntries(MORPHS.map((m, i) => [m, morphs[i]]));
  const fall = (dx, dy, dz, r) => {
    const d2 = (dx * dx + dy * dy + dz * dz) / (r * r);
    return d2 >= 1 ? 0 : (1 - d2) * (1 - d2);
  };
  const cx = F.cornerX, my = F.mouthY, mz = F.mouthZ;
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    if (z > 0.0) continue;
    const o = v * 3;
    const sg = x >= 0 ? 1 : -1;
    const ax = Math.abs(x);
    const front = smoothstep(-0.03 * hs, -0.07 * hs, z);
    // corners of the mouth
    const fc = fall(ax - cx, y - my, z - mz - 0.004, 0.024 * hs) * front;
    const lipZone = fall(ax * 0.7, (y - my) * 1.2, z - mz, 0.03 * hs) * front;
    // smile: corners up/back/out, cheeks up, lower lid region up a bit
    const cheek = fall(ax - 0.036 * hs, y - 0.022 * hs, z + 0.068 * hs, 0.03 * hs) * front;
    M.smile[o] += sg * fc * 0.0035 * hs; M.smile[o + 1] += fc * 0.0055 * hs + cheek * 0.0035 * hs; M.smile[o + 2] += fc * 0.004 * hs - cheek * 0.0012 * hs;
    // upper lip slight raise in smile (show the teeth line)
    M.smile[o + 1] += lipZone * smoothstep(my - 0.002, my + 0.006, y) * 0.0012 * hs;
    M.frown[o] += sg * fc * 0.0015 * hs; M.frown[o + 1] -= fc * 0.0045 * hs; M.frown[o + 2] += fc * 0.001 * hs;
    // chin boss up in frown
    const chin = fall(x, y - (F.chinY + 0.018 * hs), z + 0.08 * hs, 0.018 * hs);
    M.frown[o + 1] += chin * 0.0015 * hs;
    // mouthWide (creepy stretch): corners far outward/back, lips thin
    const wide = fall(ax - cx * 0.6, (y - my) * 1.4, z - mz, 0.035 * hs) * front;
    const sideK = smoothstep(0, cx * 1.2, ax);
    M.mouthWide[o] += sg * wide * sideK * 0.011 * hs; M.mouthWide[o + 2] += wide * sideK * 0.006 * hs;
    M.mouthWide[o + 1] += wide * (y > my ? 0.0012 : -0.0012) * hs;
    // lip press: lips pull in & together
    M.lipPress[o + 2] += lipZone * 0.002 * hs; M.lipPress[o + 1] += lipZone * (y > my ? -0.0008 : 0.0008) * hs;
    // brows
    const browZone = fall(ax - 0.03 * hs, (y - F.browY - 0.006 * hs) * 1.3, z + 0.082 * hs, 0.034 * hs) * front;
    const inner = smoothstep(0.032 * hs, 0.008 * hs, ax);
    const forehead = fall(ax * 0.6, y - F.browY - 0.03 * hs, z + 0.085 * hs, 0.04 * hs) * front;
    M.browUp[o + 1] += browZone * 0.0055 * hs + forehead * 0.0018 * hs;
    M.browInnerUp[o + 1] += browZone * inner * 0.0065 * hs - browZone * (1 - inner) * 0.0008 * hs;
    M.browDown[o + 1] -= browZone * 0.0042 * hs; M.browDown[o] -= sg * browZone * inner * 0.0025 * hs; M.browDown[o + 2] -= browZone * 0.0014 * hs;
    // cheek twitch (one side): cheek + corner raise
    const tw = cheek * 0.004 * hs + fc * 0.003 * hs;
    if (sg < 0) M.cheekL[o + 1] += tw; else M.cheekR[o + 1] += tw;
    // sneer: nostril wing + upper lip raise
    const sn = fall(ax - 0.014 * hs, y - F.noseBaseY - 0.004 * hs, z + 0.095 * hs, 0.016 * hs);
    M.sneer[o + 1] += sn * 0.0028 * hs;
    // squint: lower lid area (skin) up
    const under = fall(ax - F.eyeX, y - (F.eyeY - 0.016 * hs), z - F.eyeZ + 0.008 * hs, 0.016 * hs);
    M.squint[o + 1] += under * 0.0022 * hs;
    M.smile[o + 1] += under * 0.0016 * hs;
  }
  // lids
  for (let v = eyeEnd; v < extra.pos.length / 3; v++) {
    const gi = base + v;
    const li = v - eyeEnd;
    const o = gi * 3;
    const sg = extra.side[li];
    const bk = sg < 0 ? M.blinkL : M.blinkR;
    bk[o] = extra.blink[li * 3]; bk[o + 1] = extra.blink[li * 3 + 1]; bk[o + 2] = extra.blink[li * 3 + 2];
    M.lidWide[o] = extra.wide[li * 3]; M.lidWide[o + 1] = extra.wide[li * 3 + 1]; M.lidWide[o + 2] = extra.wide[li * 3 + 2];
    M.squint[o] = extra.squint[li * 3]; M.squint[o + 1] = extra.squint[li * 3 + 1]; M.squint[o + 2] = extra.squint[li * 3 + 2];
    // smile pushes the lower lid up slightly
    if (kinds[gi] === 3) { M.smile[o] += extra.squint[li * 3] * 0.4; M.smile[o + 1] += extra.squint[li * 3 + 1] * 0.4; M.smile[o + 2] += extra.squint[li * 3 + 2] * 0.4; }
  }

  // --- to rig space
  const posR = new Float32Array(pos.length);
  for (let v = 0; v < total; v++) {
    posR[v * 3] = pos[v * 3];
    posR[v * 3 + 1] = pos[v * 3 + 1] + P.headY;
    posR[v * 3 + 2] = pos[v * 3 + 2] + P.headZ;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(posR, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  // AO baked into vertex colour (white elsewhere)
  const col = new Float32Array(total * 3);
  for (let v = 0; v < total; v++) {
    const a = 0.45 + 0.55 * ao[v];
    col[v * 3] = Math.pow(a, 1.6) * 1.0; col[v * 3 + 1] = Math.pow(a, 1.9); col[v * 3 + 2] = Math.pow(a, 1.9);
    if (kinds[v] === 1) { col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = 1; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  g.morphAttributes.position = morphs.map((m) => new THREE.BufferAttribute(m, 3));
  g.morphTargetsRelative = true;
  g.computeBoundingSphere();
  g.computeBoundingBox();
  g.userData.buildMs = performance.now() - t0;
  g.userData.tris = idx.length / 3;
  g.userData.rawTris = md.rawTris;
  return { geometry: g, F, uvFn, lidMargins: { up: extra.marginUp, lo: extra.marginLo } };
}
