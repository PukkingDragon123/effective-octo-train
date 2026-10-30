// Body sculpting: anatomical SDF primitives driven by proportions, garment shells,
// meshing, per-vertex region/material, analytic skin weights and painted vertex
// colours. Hands and feet are meshed separately at higher resolution (Hands.js)
// and merged into the same skinned geometry (one draw call per body).
import * as THREE from 'three';
import { clamp, lerp, smoothstep, noise } from '../core/math.js';
import { ellipsoid, sphere, roundCone, capsule, custom, SDFGrid, primsBounds, basisFromYZ, basisFromEuler, smin, sdEllipsoid } from './SDF.js';
import { surfaceNets, finishMesh, computeAO, smoothAttribute } from './Mesher.js';
import { decimate } from './Decimate.js';
import { BONE_INDEX as BI, BONE_COUNT } from './Rig.js';
import { outfitPlan, shell, skirtPrim, patternColor, hexRGB, planeD } from './Clothing.js';
import { buildHandParts, buildFootParts } from './Hands.js';

const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
};
export { V };

// ---------------------------------------------------------------------------
// Anatomy
// ---------------------------------------------------------------------------
export function anatomyPrims(P, L) {
  const s = P.H / 1.7;
  const G = {};
  const all = [];
  const put = (group, p) => {
    (G[group] ||= []).push(p);
    all.push(p);
    return p;
  };
  const yP = P.hipsY, yS = P.shoulderY, yC = P.chestY, yN = P.neckY;
  const mus = P.muscle;
  const fem = P.fem;
  const R = (o) => ({ region: 'torso', ...o });

  // ---- torso core
  put('pelvis', ellipsoid([0, yP - 0.012 * s, 0.002], [P.pelvisHalfW * 0.9, 0.1 * s, P.pelvisDepth], R({ k: 0.05 * s, tag: 'pelvis' })));
  put('waist', ellipsoid([0, yP + 0.05 * s, -0.022 * s], [P.waistHalfW * 0.94, 0.075 * s, P.waistDepth * 0.86], R({ k: 0.05 * s, tag: 'lowerAbs' })));
  const yWaist = lerp(yP, yC, 0.45);
  P.waistLineY = lerp(yP, yC, fem ? 0.4 : 0.3);
  put('waist', ellipsoid([0, yWaist, 0.008 * s], [P.waistHalfW, 0.11 * s, P.waistDepth], R({ k: 0.07 * s, tag: 'waist' })));
  put('chest', ellipsoid([0, yC + 0.004 * s, 0.006 * s], [P.chestHalfW, 0.168 * s, P.chestDepth], R({ k: 0.06 * s, tag: 'ribcage' })));
  put('chest', ellipsoid([0, yS - 0.048 * s, 0.014 * s], [P.chestHalfW * 0.93, 0.074 * s, P.chestDepth * 0.84], R({ k: 0.05 * s, tag: 'upperChest' })));
  for (const sg of [-1, 1]) {
    // lats / back mass
    put('chest', ellipsoid([sg * 0.082 * s, yC + 0.02 * s, 0.03 * s], [0.06 * s * (0.8 + 0.3 * mus), 0.12 * s, 0.058 * s], R({ k: 0.05 * s, tag: 'lat' })));
    // scapulae
    put('chest', ellipsoid([sg * 0.07 * s, yS - 0.075 * s, 0.075 * s + P.chestDepth * 0.2], [0.05 * s, 0.07 * s, 0.026 * s], R({ k: 0.045 * s, tag: 'scapula' })));
    if (!fem) {
      const sag = P.sag * 0.025 * s + (P.build === 'heavy' ? 0.012 * s : 0);
      put('pecs', ellipsoid([sg * 0.058 * s, yC + 0.05 * s - sag, -0.062 * s - P.chestDepth * 0.12], [0.068 * s, 0.052 * s + sag * 0.6, 0.03 * s * (0.75 + 0.45 * mus) + sag * 0.5],
        R({ k: 0.04 * s, tag: 'pec', basis: basisFromEuler(0.2, sg * 0.25, sg * -0.15) })));
    } else if (P.breast > 0.01) {
      const b = P.breast;
      const sag = P.sag * 0.04 * s;
      put('breasts', ellipsoid([sg * 0.062 * s, yC + 0.018 * s - sag, -0.075 * s - P.chestDepth * 0.12], [0.056 * s * b, 0.054 * s * b + sag * 0.5, 0.046 * s * b],
        R({ k: 0.035 * s, tag: 'breast', basis: basisFromEuler(0.25 + P.sag * 0.3, sg * 0.32, 0) })));
    }
    // obliques / love handles
    put('waist', ellipsoid([sg * 0.105 * s * Math.pow(P.fat, 0.3), yP + 0.065 * s, 0.006 * s], [0.042 * s * P.fat, 0.07 * s, 0.07 * s * Math.pow(P.fat, 0.5)], R({ k: 0.05 * s, tag: 'oblique' })));
    // trapezius slope
    put('trap', roundCone([sg * 0.03 * s, yN + 0.005 * s, P.neckZ + 0.022 * s], [sg * (P.shoulderX - 0.02 * s), yS + 0.026 * s, 0.016 * s], 0.034 * s, 0.028 * s, R({ k: 0.04 * s, tag: 'trap' })));
    // clavicle ridge
    put('clav', capsule([sg * 0.02 * s, yS - 0.002 * s, -0.052 * s], [sg * (P.shoulderX - 0.005 * s), yS + 0.03 * s, -0.012 * s], 0.0115 * s, R({ k: 0.022 * s, tag: 'clavicle' })));
  }
  if (P.belly > 0.05) {
    const b = P.belly;
    put('belly', ellipsoid([0, yP + 0.075 * s, -0.045 * s - 0.035 * s * b], [(0.115 + 0.035 * b) * s, (0.1 + 0.025 * b) * s, (0.075 + 0.035 * b) * s], R({ k: 0.08 * s, tag: 'belly' })));
  }
  // neck
  for (const p of neckPrims(P, 0, 0)) put('neck', p);

  // ---- arms
  for (const side of ['L', 'R']) {
    const sg = side === 'R' ? 1 : -1;
    const S = L['upperArm' + side].pos, E = L['forearm' + side].pos, W = L['hand' + side].pos;
    const dir = V.norm(V.sub(E, S));
    const B = basisFromYZ(dir[0], dir[1], dir[2], 0, 0, 1);
    const front = [-B[6], -B[7], -B[8]];
    const lu = V.len(V.sub(E, S)), lf = V.len(V.sub(W, E));
    const ru = P.upperArmR, rf = P.forearmR;
    const A = (o) => ({ region: 'arm' + side, ...o });
    const g = 'upperArm' + side, gf = 'forearm' + side;
    put(g, ellipsoid(V.add(V.add(S, V.mul(dir, 0.03 * s)), [0, 0.008 * s, 0]), [0.05 * s * (0.85 + 0.2 * mus), 0.068 * s, 0.052 * s * (0.85 + 0.15 * mus)], A({ k: 0.035 * s, basis: B, tag: 'deltoid' })));
    put(g, roundCone(S, E, ru, ru * 0.74, A({ k: 0.03 * s, tag: 'upperArm' })));
    put(g, ellipsoid(V.add(V.lerp(S, E, 0.56), V.mul(front, 0.012 * s)), [ru * 0.74, lu * 0.27, ru * 0.66 * (0.8 + 0.3 * mus)], A({ k: 0.025 * s, basis: B, tag: 'biceps' })));
    put(g, ellipsoid(V.add(V.lerp(S, E, 0.4), V.mul(front, -0.012 * s)), [ru * 0.8, lu * 0.32, ru * 0.66], A({ k: 0.025 * s, basis: B, tag: 'triceps' })));
    put(gf, sphere(V.add(E, V.mul(front, -0.006 * s)), rf * 0.9, A({ k: 0.03 * s, tag: 'elbow' })));
    put(gf, roundCone(E, W, rf, P.wristR, A({ k: 0.025 * s, tag: 'forearm' })));
    const HB = L['hand' + side].basis;
    put(gf, ellipsoid(V.lerp(E, W, 0.27), [rf * 1.06, lf * 0.3, rf * 0.84], A({ k: 0.03 * s, basis: basisFromYZ(dir[0], dir[1], dir[2], HB[6], HB[7], HB[8]), tag: 'forearmMuscle' })));
    put(gf, ellipsoid(W, [P.wristR * 1.12, 0.022 * s, P.wristR * 0.74], A({ k: 0.015 * s, basis: HB, tag: 'wrist' })));
  }
  // ---- legs
  for (const side of ['L', 'R']) {
    const sg = side === 'R' ? 1 : -1;
    const Pj = L['thigh' + side].pos, K = L['shin' + side].pos, An = L['foot' + side].pos;
    const dir = V.norm(V.sub(K, Pj));
    const B = basisFromYZ(dir[0], dir[1], dir[2], 0, 0, 1);
    const back = [B[6], B[7], B[8]];
    const lat = [sg, 0, 0];
    const lt = V.len(V.sub(K, Pj));
    const dirS = V.norm(V.sub(An, K));
    const BS = basisFromYZ(dirS[0], dirS[1], dirS[2], 0, 0, 1);
    const ls = V.len(V.sub(An, K));
    const Lg = (o) => ({ region: 'leg' + side, ...o });
    const gt = 'thigh' + side, gs = 'shin' + side;
    const tr = P.thighR;
    put(gt, roundCone(V.add(Pj, [sg * 0.014 * s, 0.025 * s, 0.004 * s]), K, tr, P.kneeR * 1.02, Lg({ k: 0.04 * s, tag: 'thigh' })));
    put(gt, ellipsoid(V.add(V.lerp(Pj, K, 0.45), V.add(V.mul(back, -0.02 * s), V.mul(lat, 0.006 * s))), [tr * 0.8, lt * 0.36, tr * 0.74], Lg({ k: 0.035 * s, basis: B, tag: 'quad' })));
    put(gt, ellipsoid(V.add(V.lerp(Pj, K, 0.22), V.mul(lat, -0.028 * s)), [tr * 0.62, lt * 0.3, tr * 0.72], Lg({ k: 0.04 * s, basis: B, tag: 'adductor' })));
    put(gt, ellipsoid(V.add(V.lerp(Pj, K, 0.46), V.mul(back, 0.022 * s)), [tr * 0.74, lt * 0.34, tr * 0.7], Lg({ k: 0.035 * s, basis: B, tag: 'hamstring' })));
    if (fem) put(gt, ellipsoid(V.add(V.lerp(Pj, K, 0.12), V.mul(lat, 0.035 * s)), [tr * 0.6, lt * 0.22, tr * 0.7], Lg({ k: 0.05 * s, basis: B, tag: 'hipFat' })));
    put('glute' + side, ellipsoid([sg * 0.07 * s, P.hipsY - 0.058 * s, 0.05 * s + P.pelvisDepth * 0.08], V.mul([0.078, 0.092, 0.07], s * (fem ? 1.1 : 1) * Math.pow(P.fat, 0.5) * (1 - 0.15 * P.sag)),
      { k: 0.04 * s, region: 'glute' + side, tag: 'glute', basis: basisFromEuler(-0.25, 0, sg * 0.15) }));
    put(gs, sphere(V.add(K, V.mul(back, -0.004 * s)), P.kneeR, Lg({ k: 0.03 * s, tag: 'knee' })));
    put(gs, ellipsoid(V.add(V.add(K, V.mul(back, -P.kneeR * 0.78)), [0, 0.008 * s, 0]), [0.021 * s, 0.025 * s, 0.012 * s], Lg({ k: 0.02 * s, tag: 'patella' })));
    put(gs, roundCone(K, An, P.calfR * 0.88, P.ankleR, Lg({ k: 0.03 * s, tag: 'calf' })));
    put(gs, ellipsoid(V.add(V.lerp(K, An, 0.3), V.add([BS[6] * P.calfR * 0.32, BS[7] * P.calfR * 0.32, BS[8] * P.calfR * 0.32], V.mul(lat, -0.004 * s))), [P.calfR * 0.84, ls * 0.22, P.calfR * 0.74], Lg({ k: 0.035 * s, basis: BS, tag: 'gastroc' })));
    put(gs, sphere(An, P.ankleR * 1.02, Lg({ k: 0.02 * s, tag: 'ankle' })));
  }
  return { all, G };
}

/** Neck column + sternocleidomastoids + larynx, offset by (dy, dz) (head-local uses -headY, -headZ). */
export function neckPrims(P, dy, dz) {
  const s = P.H / 1.7;
  const o = (p) => [p[0], p[1] + dy, p[2] + dz];
  const out = [];
  const R = { k: 0.04 * s, region: 'neck', mat: 'skin', tag: 'neck' };
  out.push(roundCone(o(P.neckBot), o(P.neckTop), P.neckR * 1.1, P.neckR, R));
  for (const sg of [-1, 1]) {
    out.push(capsule(o([sg * 0.04 * s, P.headY + 0.012 * s, P.headZ + 0.02 * s]), o([sg * 0.012 * s, P.shoulderY + 0.0 * s, -0.03 * s]), 0.0115 * s, { ...R, k: 0.022 * s, tag: 'scm' }));
  }
  if (!P.fem && P.adult > 0.5) out.push(ellipsoid(o([0, lerp(P.neckY, P.chinY, 0.5), P.neckTop[2] - P.neckR * 0.9]), [0.011 * s, 0.015 * s, 0.009 * s], { ...R, k: 0.015 * s, tag: 'adam' }));
  return out;
}

// ---------------------------------------------------------------------------
// Garments
// ---------------------------------------------------------------------------
function garmentPrims(plan, P, L, G) {
  const s = P.H / 1.7;
  const out = [];
  const yS = P.shoulderY, yC = P.chestY, yP = P.hipsY;
  const top = plan.top, bot = plan.bottom;
  const torsoGroup = [...G.pelvis, ...G.waist, ...G.chest, ...(G.pecs || []), ...(G.breasts || []), ...(G.belly || []), ...G.trap, ...G.clav];
  if (G.breasts) torsoGroup.push(ellipsoid([0, yC + 0.01 * s, -0.08 * s - P.chestDepth * 0.12], [0.1 * s * P.breast, 0.05 * s, 0.035 * s * P.breast], { k: 0.04 * s }));
  const loose = top.loose ?? 0.012;
  const foldN = (x, y, z, f) => noise.noise3D(x * f, y * f, z * f);
  // ---- top
  const sleeves = (len, extraLoose = 0, mat = 'top') => {
    for (const side of ['L', 'R']) {
      const S = L['upperArm' + side].pos, E = L['forearm' + side].pos, W = L['hand' + side].pos;
      const dir = V.norm(V.sub(E, S));
      const lu = V.len(V.sub(E, S)), lf = V.len(V.sub(W, E));
      const total = lu + lf;
      const cut = len * total;
      const grp = [...G['upperArm' + side]];
      if (cut > lu - 0.03) grp.push(...G['forearm' + side]);
      const th = (x, y, z) => {
        const u = (x - S[0]) * dir[0] + (y - S[1]) * dir[1] + (z - S[2]) * dir[2];
        // looser toward the cuff for short sleeves, wrinkles near the elbow
        const fl = 0.006 + extraLoose + (len < 0.6 ? 0.012 * clamp(u / Math.max(0.05, cut), 0, 1) : 0);
        const wr = Math.sin(u * 95 + foldN(x, y, z, 30) * 2) * 0.0025 * smoothstep(0.06, 0.0, Math.abs(u - lu));
        return fl + wr + foldN(x, y, z, 25) * 0.002;
      };
      out.push(shell(grp, th, (x, y, z) => ((x - S[0]) * dir[0] + (y - S[1]) * dir[1] + (z - S[2]) * dir[2]) - cut, { mat, tmax: 0.035, blend: 0.03 * s, tag: 'sleeve' + side }));
    }
  };
  const neckHole = (x, y, z, rExtra, frontDip, backDip = 0.01) => {
    const rn = Math.hypot(x, (z - P.neckZ) * 1.15);
    const dip = z < P.neckZ ? smoothstep(P.neckZ, P.neckZ - 0.07 * s, z) * frontDip : backDip * smoothstep(P.neckZ, P.neckZ + 0.06 * s, z);
    const hole = P.neckR + rExtra - rn;
    const above = y - (yS - 0.028 * s - dip);
    return Math.min(hole, above); // >0 => inside hole & above neckline: removed
  };
  const st = top.style;
  if (st === 'tshirt' || st === 'shirt' || st === 'blouse' || st === 'hoodie' || st === 'jacket' || st === 'dress') {
    const tucked = !!top.tucked;
    const hemY = st === 'dress' ? P.waistLineY : tucked ? P.waistLineY - 0.01 * s : yP - 0.06 * s + (top.hemY ?? 0) * s;
    const th = (x, y, z) => {
      let t = 0.007 + loose * 0.6;
      // drape: looser lower down / front, folds
      t += loose * 0.5 * smoothstep(yC, yP, y);
      t += foldN(x, y * 0.5, z, 18) * 0.0035 + Math.sin(x * 60 + y * 25 + foldN(x, y, z, 9) * 3) * 0.0015;
      return t;
    };
    const clip = (x, y, z) => Math.max(hemY - y, neckHole(x, y, z, st === 'hoodie' ? 0.012 : 0.016 * s, st === 'jacket' ? 0.11 * s : st === 'shirt' ? 0.045 * s : 0.03 * s));
    out.push(shell(torsoGroup, th, clip, { mat: 'top', tmax: 0.06, blend: 0.05 * s, tag: 'torsoTop' }));
    sleeves(top.sleeve ?? 0.36, st === 'jacket' || st === 'hoodie' ? 0.01 : 0.004);
    if (top.collar) {
      // folded collar ring around the neck base
      out.push(custom((x, y, z) => {
        const yy = y - (yS + 0.012 * s);
        const rn = Math.hypot(x, (z - P.neckZ) * 1.1);
        const ring = Math.hypot(rn - (P.neckR + 0.012 * s), yy * 0.8) - 0.012 * s;
        // open at the front
        const open = z < P.neckZ - P.neckR * 0.7 ? Math.abs(x) < 0.018 * s ? 1 : 0 : 0;
        return open ? Math.max(ring, 0.01) : ring;
      }, [-0.12 * s, yS - 0.04 * s, -0.12 * s, 0.12 * s, yS + 0.06 * s, 0.12 * s], { k: 0.006, mat: 'top', bias: 0.005, tag: 'collar' }));
    }
    if (st === 'hoodie') {
      out.push(ellipsoid([0, yS + 0.02 * s, P.neckZ + 0.075 * s], [0.12 * s, 0.05 * s, 0.05 * s], { k: 0.03, mat: 'top', bias: 0.005, tag: 'hood', basis: basisFromEuler(0.5, 0, 0) }));
    }
  } else if (st === 'tank') {
    const hemY = yP - 0.07 * s;
    const th = (x, y, z) => 0.004 + loose * 0.5 + foldN(x, y, z, 20) * 0.002;
    const clip = (x, y, z) => {
      let c = Math.max(hemY - y, neckHole(x, y, z, 0.03 * s, 0.07 * s, 0.03 * s));
      for (const sg of [-1, 1]) {
        const S = L[sg > 0 ? 'upperArmR' : 'upperArmL'].pos;
        const ah = 0.098 * s - Math.hypot((x - S[0] + sg * 0.025 * s) * 1.0, (y - S[1] + 0.04 * s) * 0.85, (z - S[2]) * 1.2);
        c = Math.max(c, ah);
      }
      return c;
    };
    out.push(shell(torsoGroup, th, clip, { mat: 'top', tmax: 0.03, blend: 0.05 * s, tag: 'tank' }));
  } else if (st === 'robe') {
    // saffron robe: wraps the torso, right shoulder bare, cloth over the left shoulder & upper arm
    const p0 = [0.115 * s, yC + 0.0 * s, 0];
    const n = V.norm([0.78, 0.62, 0]);
    const th = (x, y, z) => {
      const u = (x * -0.62 + y * 0.78);
      return 0.009 + loose * 0.6 + Math.sin(u * 70 + foldN(x, y, z, 8) * 2) * 0.004 + foldN(x, y, z, 16) * 0.003;
    };
    const clip = (x, y, z) => Math.max(P.waistLineY - 0.08 * s - y, planeD(x, y, z, p0, n), neckHole(x, y, z, 0.012 * s, 0.02 * s));
    out.push(shell(torsoGroup, th, clip, { mat: 'top', tmax: 0.05, blend: 0.05 * s, tag: 'robe' }));
    // drape over the left upper arm
    const S = L.upperArmL.pos, E = L.forearmL.pos;
    const dir = V.norm(V.sub(E, S));
    const lu = V.len(V.sub(E, S));
    out.push(shell(G.upperArmL, (x, y, z) => 0.016 + foldN(x, y, z, 14) * 0.004, (x, y, z) => ((x - S[0]) * dir[0] + (y - S[1]) * dir[1] + (z - S[2]) * dir[2]) - lu * 0.85, { mat: 'top', tmax: 0.03, blend: 0.03, tag: 'robeArm' }));
    // shoulder/arm gap filler: hanging cloth fold from the left shoulder down the side
    out.push(roundCone([-P.shoulderX * 0.95, yS - 0.01 * s, 0.01 * s], [-P.chestHalfW * 1.02, yC - 0.1 * s, 0.01 * s], 0.045 * s, 0.03 * s, { k: 0.04 * s, mat: 'top', bias: 0.004, tag: 'robeFold' }));
  } else if (st === 'sabai') {
    const p0 = [0.115 * s, yC - 0.02 * s, 0];
    const n = V.norm([0.82, 0.57, 0]);
    const th = (x, y, z) => 0.006 + foldN(x, y, z, 14) * 0.003 + Math.sin((x * -0.57 + y * 0.82) * 80) * 0.002;
    const clip = (x, y, z) => {
      const below = (yC - 0.085 * s) - y;
      return Math.max(below, planeD(x, y, z, p0, n), neckHole(x, y, z, 0.02 * s, 0.02 * s));
    };
    out.push(shell(torsoGroup, th, clip, { mat: 'top', tmax: 0.03, blend: 0.05 * s, tag: 'sabai' }));
    // tail hanging down the back from the left shoulder
    out.push(roundCone([-0.07 * s, yS + 0.01 * s, 0.07 * s], [-0.05 * s, yP - 0.06 * s, 0.075 * s + P.chestDepth * 0.2], 0.03 * s, 0.022 * s, { k: 0.05 * s, mat: 'top', bias: 0.004, tag: 'sabaiTail', data: { flat: true } }));
  } else if (st === 'shroud') {
    const th = (x, y, z) => 0.016 + foldN(x, y, z, 10) * 0.006;
    out.push(shell([...torsoGroup, ...G.upperArmL, ...G.upperArmR, ...G.forearmL, ...G.forearmR, ...G.neck], th, null, { mat: 'top', tmax: 0.03, blend: 0.06 * s, tag: 'shroud' }));
  }
  // ---- bottom
  const bs = bot.style;
  const waistTop = (bot.top ?? P.waistLineY + 0.01 * s);
  if (bs === 'pants' || bs === 'shorts') {
    const bl = bot.loose ?? 0.014;
    const hipGroup = [...G.pelvis, G.waist[0], ...(G.belly || []), ...G.waist.filter((p) => p.tag === 'oblique'), ...(G.gluteL || []), ...(G.gluteR || [])];
    const thH = (x, y, z) => 0.006 + bl * 0.4 + foldN(x, y, z, 16) * 0.002;
    out.push(shell(hipGroup, thH, (x, y, z) => y - waistTop, { mat: 'bottom', tmax: 0.04, blend: 0.04 * s, tag: 'pantsHips' }));
    for (const side of ['L', 'R']) {
      const Pj = L['thigh' + side].pos, K = L['shin' + side].pos, An = L['foot' + side].pos;
      const axis = V.norm(V.sub(An, Pj));
      const total = V.len(V.sub(An, Pj)) + 0.03 * s;
      const cut = (bot.length ?? 1) * total;
      const grp = [...G['thigh' + side], ...(G['glute' + side] || [])];
      if (cut > V.len(V.sub(K, Pj)) - 0.06) grp.push(...G['shin' + side]);
      const kneeU = V.len(V.sub(K, Pj));
      const th = (x, y, z) => {
        const u = (x - Pj[0]) * axis[0] + (y - Pj[1]) * axis[1] + (z - Pj[2]) * axis[2];
        const flare = (bot.flare ?? 0) * smoothstep(kneeU, cut, u);
        const wr = Math.sin(u * 70 + foldN(x, y, z, 20) * 2.5) * 0.003 * (smoothstep(0.12, 0.0, Math.abs(u - kneeU)) + smoothstep(cut - 0.15, cut, u) * 0.8);
        return 0.006 + bl * 0.55 + flare + wr + foldN(x, y, z, 22) * 0.002;
      };
      out.push(shell(grp, th, (x, y, z) => Math.max(((x - Pj[0]) * axis[0] + (y - Pj[1]) * axis[1] + (z - Pj[2]) * axis[2]) - cut, y - waistTop), { mat: 'bottom', tmax: 0.06, blend: 0.035 * s, tag: 'pants' + side }));
      if (cut > kneeU + 0.05 && bs === 'pants') {
        // straight-leg tube from the knee down so trousers don't cling to the calf
        const hem = V.add(Pj, V.mul(axis, cut - 0.01));
        const r = P.kneeR + bl * 0.6 + 0.004;
        out.push(custom((x, y, z) => {
          let d = sdCapsuleFlat(x, y, z, K, hem, r * 1.02, r * (1.06 + (bot.flare ?? 0) * 8));
          const u = (x - Pj[0]) * axis[0] + (y - Pj[1]) * axis[1] + (z - Pj[2]) * axis[2];
          d -= Math.sin(u * 60 + foldN(x, y, z, 15) * 3) * 0.002;
          return Math.max(d, u - cut);
        }, [Math.min(K[0], hem[0]) - 0.1, hem[1] - 0.05, Math.min(K[2], hem[2]) - 0.1, Math.max(K[0], hem[0]) + 0.1, K[1] + 0.05, Math.max(K[2], hem[2]) + 0.1], { k: 0.05 * s, mat: 'bottom', bias: 0.005, tag: 'pantsTube' + side }));
      }
    }
  } else if (bs === 'skirt') {
    const hipGroup = [...G.pelvis, G.waist[0], ...(G.belly || []), ...(G.gluteL || []), ...(G.gluteR || [])];
    out.push(shell(hipGroup, (x, y, z) => 0.008 + foldN(x, y, z, 14) * 0.002, (x, y, z) => y - waistTop, { mat: plan.bottom.sameAsTop ? 'top' : 'bottom', tmax: 0.03, blend: 0.04 * s, tag: 'skirtHips' }));
    const legLen = P.hipJointY - P.ankleY;
    const yBot = P.hipJointY - (bot.length ?? 0.6) * legLen;
    plan.bottom.yBot = yBot;
    const hipW = P.pelvisHalfW * 1.0 + 0.012;
    const flare = bot.flare ?? 0.04;
    out.push(skirtPrim(P, {
      yTop: P.hipsY + 0.01 * s, yBot,
      rxTop: hipW, rzTop: P.pelvisDepth + 0.025 * s,
      rxBot: Math.max(hipW * 0.82, P.hipJointX + P.thighR * 0.9) + flare + (bot.length > 0.8 ? 0 : 0.02), rzBot: P.thighR * 1.15 + flare * 0.8 + 0.01,
      cz: 0.005 * s, folds: bot.folds ?? 1, seed: 3, pleat: !!bot.pleat,
    }, { mat: plan.bottom.sameAsTop ? 'top' : 'bottom', k: 0.06 * s }));
  }
  return out;
}

function sdCapsuleFlat(x, y, z, a, b, r1, r2) {
  // round cone with flat-ish ends (we only need the side)
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  let h = ((x - a[0]) * bax + (y - a[1]) * bay + (z - a[2]) * baz) / l2;
  const hc = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = x - a[0] - bax * hc, dy = y - a[1] - bay * hc, dz = z - a[2] - baz * hc;
  const r = r1 + (r2 - r1) * hc;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

// ---------------------------------------------------------------------------
// Skin weights (analytic per region)
// ---------------------------------------------------------------------------
export function makeWeightFns(P, L) {
  const s = P.H / 1.7;
  const ys = [P.spineY, P.chestY, P.neckY, P.headY];
  const bws = [0.06 * s, 0.07 * s, 0.04 * s, 0.025 * s];
  const chain = [BI.hips, BI.spine, BI.chest, BI.neck, BI.head];
  const torso = (x, y, z, w) => {
    const t0 = smoothstep(ys[0] - bws[0], ys[0] + bws[0], y);
    const t1 = smoothstep(ys[1] - bws[1], ys[1] + bws[1], y);
    const t2 = smoothstep(ys[2] - bws[2], ys[2] + bws[2], y);
    const t3 = smoothstep(ys[3] - bws[3], ys[3] + bws[3], y);
    const tw = [1 - t0, Math.max(0, t0 - t1), Math.max(0, t1 - t2), Math.max(0, t2 - t3), t3];
    // clavicle influence near the shoulders
    const side = x >= 0 ? 'R' : 'L';
    const S = L['upperArm' + side].pos;
    const dS = Math.hypot(x - S[0], y - S[1], z - S[2]);
    const c = smoothstep(0.13 * s, 0.035 * s, dS) * 0.85 * smoothstep(0.02, 0.07 * s, Math.abs(x));
    // thighs near the groin / hip
    const Pj = L['thigh' + side].pos;
    const tl = smoothstep(P.hipJointY + 0.03 * s, P.crotchY - 0.03 * s, y) * smoothstep(0.01, 0.06 * s, Math.abs(x)) * 0.5;
    const rest = 1 - c - tl;
    for (let i = 0; i < 5; i++) w[chain[i]] += tw[i] * rest;
    w[BI['clavicle' + side]] += c;
    w[BI['thigh' + side]] += tl;
    void Pj;
  };
  const arm = (side, x, y, z, w) => {
    const C = L['clavicle' + side].pos, S = L['upperArm' + side].pos, E = L['forearm' + side].pos, Wr = L['hand' + side].pos;
    const du = V.norm(V.sub(E, S)), df = V.norm(V.sub(Wr, E));
    const us = (x - S[0]) * du[0] + (y - S[1]) * du[1] + (z - S[2]) * du[2];
    const ue = (x - E[0]) * du[0] + (y - E[1]) * du[1] + (z - E[2]) * du[2];
    const uw = (x - Wr[0]) * df[0] + (y - Wr[1]) * df[1] + (z - Wr[2]) * df[2];
    const a = smoothstep(-0.06 * s, 0.045 * s, us);
    const b = smoothstep(-0.04 * s, 0.04 * s, ue);
    const c = smoothstep(-0.018 * s, 0.022 * s, uw);
    const cl = 1 - a;
    w[BI['clavicle' + side]] += cl * 0.8;
    w[BI.chest] += cl * 0.2;
    w[BI['upperArm' + side]] += a * (1 - b);
    // forearm twist is carried by the forearm bone; the hand bone takes the wrist
    w[BI['forearm' + side]] += a * b * (1 - c);
    w[BI['hand' + side]] += a * b * c;
    void C;
  };
  const leg = (side, x, y, z, w) => {
    const Pj = L['thigh' + side].pos, K = L['shin' + side].pos, An = L['foot' + side].pos, Bl = L['toe' + side].pos;
    const dt = V.norm(V.sub(K, Pj)), ds = V.norm(V.sub(An, K)), df = V.norm(V.sub(Bl, An));
    const up = (x - Pj[0]) * dt[0] + (y - Pj[1]) * dt[1] + (z - Pj[2]) * dt[2];
    const uk = (x - K[0]) * dt[0] + (y - K[1]) * dt[1] + (z - K[2]) * dt[2];
    const ua = (x - An[0]) * ds[0] + (y - An[1]) * ds[1] + (z - An[2]) * ds[2];
    const ub = (x - Bl[0]) * df[0] + (y - Bl[1]) * df[1] + (z - Bl[2]) * df[2];
    const a = smoothstep(-0.07 * s, 0.07 * s, up);
    const b = smoothstep(-0.045 * s, 0.045 * s, uk);
    const c = smoothstep(-0.03 * s, 0.025 * s, ua);
    const d = smoothstep(-0.015 * s, 0.015 * s, ub);
    w[BI.hips] += 1 - a;
    w[BI['thigh' + side]] += a * (1 - b);
    w[BI['shin' + side]] += a * b * (1 - c);
    w[BI['foot' + side]] += a * b * c * (1 - d);
    w[BI['toe' + side]] += a * b * c * d;
  };
  const glute = (side, x, y, z, w) => {
    const f = smoothstep(P.hipJointY + 0.02 * s, P.crotchY - 0.05 * s, y) * 0.65;
    w[BI.hips] += 1 - f;
    w[BI['thigh' + side]] += f;
  };
  const skirt = (x, y, z, w) => {
    const f = clamp((P.hipJointY + 0.02 * s - y) / (P.hipJointY - P.kneeY), 0, 1.4);
    const sideT = smoothstep(-0.05 * s, 0.05 * s, x); // 0 = L, 1 = R
    const leg = Math.min(0.85, f * 0.85);
    const shin = Math.max(0, f - 1) * 0.6;
    const thigh = Math.max(0, leg - shin);
    w[BI.hips] += 1 - leg;
    w[BI.thighR] += thigh * sideT;
    w[BI.thighL] += thigh * (1 - sideT);
    w[BI.shinR] += shin * sideT;
    w[BI.shinL] += shin * (1 - sideT);
  };
  return {
    weights(region, x, y, z, w) {
      switch (region) {
        case 'armL': return arm('L', x, y, z, w);
        case 'armR': return arm('R', x, y, z, w);
        case 'legL': return leg('L', x, y, z, w);
        case 'legR': return leg('R', x, y, z, w);
        case 'gluteL': return glute('L', x, y, z, w);
        case 'gluteR': return glute('R', x, y, z, w);
        case 'skirt': return skirt(x, y, z, w);
        default: return torso(x, y, z, w);
      }
    },
    arm, leg, torso,
  };
}

/** Keep the 4 strongest influences per vertex. dense: Float32Array(count*BONE_COUNT) */
export function packWeights(dense, count) {
  const si = new Uint16Array(count * 4);
  const sw = new Float32Array(count * 4);
  const idx = [0, 0, 0, 0], val = [0, 0, 0, 0];
  for (let v = 0; v < count; v++) {
    idx.fill(0); val.fill(0);
    const o = v * BONE_COUNT;
    for (let b = 0; b < BONE_COUNT; b++) {
      const x = dense[o + b];
      if (x <= val[3]) continue;
      let k = 3;
      while (k > 0 && x > val[k - 1]) { val[k] = val[k - 1]; idx[k] = idx[k - 1]; k--; }
      val[k] = x; idx[k] = b;
    }
    const sum = val[0] + val[1] + val[2] + val[3] || 1;
    for (let k = 0; k < 4; k++) { si[v * 4 + k] = idx[k]; sw[v * 4 + k] = val[k] / sum; }
  }
  return { si, sw };
}

// ---------------------------------------------------------------------------
// Painting helpers
// ---------------------------------------------------------------------------
export function skinRGB(spec) {
  const t = clamp(spec.skinTone ?? 0.5, 0, 1);
  const light = [0.93, 0.78, 0.66], mid = [0.77, 0.57, 0.43], dark = [0.45, 0.31, 0.22];
  const c = t < 0.5 ? light.map((v, i) => lerp(v, mid[i], t * 2)) : mid.map((v, i) => lerp(v, dark[i], (t - 0.5) * 2));
  const g = spec.ghost || {};
  if (g.pale) {
    const pale = [0.8, 0.82, 0.8];
    const k = clamp(g.pale, 0, 1) * 0.8;
    for (let i = 0; i < 3; i++) c[i] = lerp(c[i], pale[i], k);
  }
  return c;
}

const lin = (v) => Math.pow(Math.max(0, v), 2.2);

/** Paint skin at a point (sRGB in, out). Region-aware blush & tonal variation, ghost decay. */
export function paintSkin(base, x, y, z, ao, P, spec, out, region) {
  const n = noise.noise3D(x * 6.5, y * 6.5, z * 6.5);
  const n2 = noise.noise3D(x * 23 + 5, y * 23, z * 23);
  let r = base[0] * (1 + n * 0.045 + n2 * 0.02), g = base[1] * (1 + n * 0.035 + n2 * 0.015), b = base[2] * (1 + n * 0.03);
  // warm blush on joints / extremities
  let blush = 0;
  if (region && (region.startsWith('hand') || region.startsWith('foot'))) blush = 0.12;
  blush += smoothstep(0.04, 0.0, Math.abs(y - P.kneeY)) * 0.06;
  r *= 1 + blush * 0.25; g *= 1 - blush * 0.05; b *= 1 - blush * 0.06;
  // creases: AO darkens toward a warm red-brown (subsurface look)
  const occ = 1 - ao;
  r *= 1 - occ * 0.55; g *= 1 - occ * 0.68; b *= 1 - occ * 0.66;
  const gh = spec.ghost || {};
  if (gh.decay) {
    const d = noise.noise3D(x * 9 + 11, y * 9, z * 9);
    const k = clamp((d + 0.2) * 1.4, 0, 1) * gh.decay * 0.7;
    r = lerp(r, 0.36, k); g = lerp(g, 0.4, k); b = lerp(b, 0.34, k);
  }
  if (gh.bloodStains) {
    const d = noise.noise3D(x * 7 + 3, y * 4, z * 7);
    const k = d > 0.45 - gh.bloodStains * 0.3 ? gh.bloodStains * 0.8 : 0;
    r = lerp(r, 0.32, k); g = lerp(g, 0.05, k); b = lerp(b, 0.04, k);
  }
  if (gh.wet) { r *= 1 - gh.wet * 0.12; g *= 1 - gh.wet * 0.1; b *= 1 - gh.wet * 0.06; }
  out[0] = r; out[1] = g; out[2] = b;
  return out;
}

// ---------------------------------------------------------------------------
// Part builder: prims -> mesh with colour + weights
// ---------------------------------------------------------------------------
/**
 * opts: { prims, h, margin, relax, region(prims...) default, weightFn(region,x,y,z,dense), colorFn(mat,x,y,z,ao,region,n,out) , smoothW, clip }
 */
export function buildPart(opts) {
  return paintPart(meshPart(opts), opts);
}

/** Mesh a primitive stack (in its own local frame). Returns { mesh, ao, grid, rawTris }. */
export function meshPart(opts) {
  const prims = opts.prims;
  const b = opts.bounds || primsBounds(prims, 0.03);
  const grid = new SDFGrid(b.slice(0, 3), b.slice(3), opts.h).build(prims, opts.margin ?? 0.05);
  let mesh = surfaceNets(grid, { relax: opts.relax ?? 2, project: 2, clip: opts.clip });
  const rawTris = mesh.indices.length / 3;
  if (opts.targetTris && rawTris > opts.targetTris) {
    const d = decimate(mesh.positions, mesh.indices, opts.targetTris, { weightFn: opts.detailFn, lengthPenalty: opts.lengthPenalty ?? 2e-7 });
    mesh = finishMesh(grid, d.positions, d.indices, { relax: 0, project: 1 });
  }
  const ao = computeAO(mesh, grid, opts.ao || {});
  return { mesh, ao, grid, rawTris };
}

/** Mirror a local-space meshed part across x = 0 (positions, normals, winding). */
export function mirrorMeshed(md) {
  const m = md.mesh;
  const pos = new Float32Array(m.positions), nor = new Float32Array(m.normals);
  for (let i = 0; i < pos.length; i += 3) { pos[i] = -pos[i]; nor[i] = -nor[i]; }
  const idx = new Uint32Array(m.indices.length);
  for (let i = 0; i < idx.length; i += 3) { idx[i] = m.indices[i]; idx[i + 1] = m.indices[i + 2]; idx[i + 2] = m.indices[i + 1]; }
  return { mesh: { positions: pos, normals: nor, indices: idx, count: m.count, adj: m.adj }, ao: md.ao, grid: md.grid, mirrored: true, rawTris: md.rawTris };
}

/**
 * Compute material/region/weights/colours. opts.xform(local[3]) -> rig[3] (and xformN for normals)
 * maps local mesh space into rig space (identity when omitted). Ownership lookups use local coords
 * (un-mirrored when md.mirrored).
 */
export function paintPart(md, opts) {
  const { mesh, ao, grid } = md;
  const n = mesh.count;
  const lp = mesh.positions;
  const pos = opts.xform ? new Float32Array(n * 3) : lp;
  const nor = opts.xform ? new Float32Array(n * 3) : mesh.normals;
  if (opts.xform) {
    const t = [0, 0, 0];
    for (let v = 0; v < n; v++) {
      opts.xform(lp[v * 3], lp[v * 3 + 1], lp[v * 3 + 2], t);
      pos[v * 3] = t[0]; pos[v * 3 + 1] = t[1]; pos[v * 3 + 2] = t[2];
      opts.xformN(mesh.normals[v * 3], mesh.normals[v * 3 + 1], mesh.normals[v * 3 + 2], t);
      nor[v * 3] = t[0]; nor[v * 3 + 1] = t[1]; nor[v * 3 + 2] = t[2];
    }
  }
  const dense = new Float32Array(n * BONE_COUNT);
  const colors = new Float32Array(n * 3);
  const mats = new Array(n);
  const regions = new Array(n);
  const col = [0, 0, 0];
  const own = [null, null];
  const wtmp = new Float32Array(BONE_COUNT);
  const mx = md.mirrored ? -1 : 1;
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    grid.owners(lp[v * 3] * mx, lp[v * 3 + 1], lp[v * 3 + 2], own);
    const best = own[0];
    let reg = own[1] ? own[1].region : null;
    if (best && best.region === 'skirt') reg = 'skirt';
    if (!reg || opts.defaultRegion) reg = opts.defaultRegion || reg || 'torso';
    regions[v] = reg;
    const mat = best ? best.mat : 'skin';
    mats[v] = mat;
    wtmp.fill(0);
    opts.weightFn(reg, x, y, z, wtmp, best, lp[v * 3] * mx, lp[v * 3 + 1], lp[v * 3 + 2]);
    dense.set(wtmp, v * BONE_COUNT);
    opts.colorFn(mat, x, y, z, ao[v], reg, nor, v, col, best, lp[v * 3] * mx, lp[v * 3 + 1], lp[v * 3 + 2]);
    colors[v * 3] = lin(col[0]);
    colors[v * 3 + 1] = lin(col[1]);
    colors[v * 3 + 2] = lin(col[2]);
  }
  const meshView = { adj: mesh.adj, count: n };
  if (opts.smoothW !== 0) {
    const active = [];
    for (let bi = 0; bi < BONE_COUNT; bi++) {
      for (let v = 0; v < n; v++) if (dense[v * BONE_COUNT + bi] > 0) { active.push(bi); break; }
    }
    smoothAttribute(meshView, dense, BONE_COUNT, opts.smoothW ?? 2, 0.5, active);
  }
  smoothAttribute(meshView, colors, 3, 1, 0.6);
  const { si, sw } = packWeights(dense, n);
  return { positions: pos, normals: nor, indices: mesh.indices, colors, skinIndex: si, skinWeight: sw, count: n, mats, regions, ao, rawTris: md.rawTris };
}

/** Merge parts into a single BufferGeometry. */
export function mergeParts(parts, extra = {}) {
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.count; ni += p.indices.length; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  const idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const p of parts) {
    pos.set(p.positions, ov * 3);
    nor.set(p.normals, ov * 3);
    col.set(p.colors, ov * 3);
    si.set(p.skinIndex, ov * 4);
    sw.set(p.skinWeight, ov * 4);
    for (let i = 0; i < p.indices.length; i++) idx[oi + i] = p.indices[i] + ov;
    ov += p.count;
    oi += p.indices.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  Object.assign(g.userData, extra);
  return g;
}

// ---------------------------------------------------------------------------
// Body assembly
// ---------------------------------------------------------------------------
export function buildBodyGeometry(spec, P, L, quality = 1) {
  const t0 = performance.now();
  const s = P.H / 1.7;
  const plan = outfitPlan(spec);
  const { all, G } = anatomyPrims(P, L);
  const garments = garmentPrims(plan, P, L, G);
  const prims = [...all, ...garments];
  const W = makeWeightFns(P, L);
  const skin = skinRGB(spec);
  const topRGB = hexRGB(plan.top.color);
  const botRGB = hexRGB(plan.bottom.color);
  const ghost = spec.ghost || {};
  const tmp = [0, 0, 0];
  const yS = P.shoulderY, yC = P.chestY;
  const garmentColor = (mat, x, y, z, ao, out) => {
    const g = mat === 'top' ? plan.top : plan.bottom;
    const base = mat === 'top' ? topRGB : botRGB;
    patternColor(g, x, y, z, base, out);
    let r = out[0], gg = out[1], b = out[2];
    // details
    if (mat === 'top') {
      if (g.buttons && z < 0 && Math.abs(x) < 0.006 * s && y < yS - 0.03 && y > P.waistLineY) {
        const k = (Math.abs(((y * 100) % 9) - 4.5) < 0.9) ? 0.5 : 0.12;
        r *= 1 - k * 0.5; gg *= 1 - k * 0.5; b *= 1 - k * 0.5;
      }
      if (g.pocket && z < 0 && x < -0.035 * s && x > -0.12 * s && y < yC + 0.09 * s && y > yC + 0.0 * s) {
        const edge = Math.min(Math.abs(x + 0.035 * s), Math.abs(x + 0.12 * s), Math.abs(y - yC - 0.0 * s), Math.abs(y - yC - 0.09 * s));
        if (edge < 0.006 || Math.abs(y - yC - 0.075 * s) < 0.004) { r *= 0.82; gg *= 0.82; b *= 0.82; }
      }
      if (g.nameTag && z < 0 && x > 0.04 * s && x < 0.11 * s && Math.abs(y - yC - 0.05 * s) < 0.012 * s) {
        const k = noise.noise3D(x * 300, y * 300, 1) > 0 ? 0.6 : 0.2;
        r = lerp(r, 0.15, k); gg = lerp(gg, 0.2, k); b = lerp(b, 0.6, k);
      }
      if (g.style === 'jacket' && z < 0 && y < yS + 0.01 && y > P.waistLineY - 0.06) {
        // open front: inner shirt V
        const w = lerp(0.075 * s, 0.01 * s, clamp((yS - y) / (yS - P.waistLineY), 0, 1));
        if (Math.abs(x) < w) {
          const inn = hexRGB(g.inner ?? 0xe8e4da);
          r = inn[0]; gg = inn[1]; b = inn[2];
        } else if (Math.abs(x) < w + 0.02 * s) { r *= 0.6; gg *= 0.6; b *= 0.6; }
      }
      if (g.style === 'sabai' || g.style === 'robe') {
        // painted fold shading along the diagonal drape
        const u = x * -0.62 + y * 0.78;
        const f = Math.sin(u * 70 + noise.noise3D(x * 8, y * 8, z * 8) * 2);
        r *= 1 + f * 0.07; gg *= 1 + f * 0.07; b *= 1 + f * 0.06;
        if (g.accent) {
          const edge = Math.abs(planeD(x, y, z, [0.115 * s, yC - 0.02 * s, 0], V.norm([0.82, 0.57, 0])));
          if (edge < 0.012) { const a = hexRGB(g.accent); r = lerp(r, a[0], 0.8); gg = lerp(gg, a[1], 0.8); b = lerp(b, a[2], 0.8); }
        }
      }
      if (g.faded) {
        const f = g.faded * (0.6 + noise.noise3D(x * 5, y * 5, z * 5) * 0.4);
        const l = (r + gg + b) / 3;
        r = lerp(r, l * 1.08, f * 0.5); gg = lerp(gg, l * 1.08, f * 0.5); b = lerp(b, l * 1.05, f * 0.5);
      }
      if (g.stained) {
        const st = noise.noise3D(x * 11 + 2, y * 11, z * 11);
        const k = st > 0.35 ? g.stained * 0.35 : 0;
        r = lerp(r, 0.62, k); gg = lerp(gg, 0.55, k); b = lerp(b, 0.38, k);
      }
    }
    // belt
    const beltC = plan.bottom.belt ?? (plan.belt && (plan.top.style === 'dress' || plan.bottom.style === 'skirt') ? plan.belt : null);
    if (beltC !== null && beltC !== undefined && Math.abs(y - (P.waistLineY - 0.005)) < 0.016 * s) {
      const bc = hexRGB(beltC);
      r = bc[0]; gg = bc[1]; b = bc[2];
      if (z < -0.05 && Math.abs(x) < 0.022 * s) { r = 0.6; gg = 0.55; b = 0.4; }
    }
    if (plan.sash && Math.abs(y - (P.waistLineY + 0.02 * s)) < 0.03 * s) {
      const sc = hexRGB(plan.sash);
      const chk = (Math.sin(x * 120) > 0) !== (Math.sin(y * 120) > 0) ? 0.85 : 1.1;
      r = sc[0] * chk; gg = sc[1] * chk; b = sc[2] * chk;
    }
    if (plan.apron && z < -0.02 && Math.abs(x) < 0.15 * s && y > P.kneeY + 0.12 * s && y < yC + 0.06 * s) {
      const ac = hexRGB(plan.apron);
      const chk = noise.noise3D(x * 30, y * 30, z * 30) * 0.06;
      r = ac[0] + chk; gg = ac[1] + chk; b = ac[2] + chk;
      // pocket
      if (Math.abs(x) < 0.09 * s && Math.abs(y - (P.hipsY - 0.03 * s)) < 0.05 * s) {
        const edge = Math.min(0.09 * s - Math.abs(x), 0.05 * s - Math.abs(y - (P.hipsY - 0.03 * s)));
        if (edge < 0.007) { r *= 0.75; gg *= 0.75; b *= 0.75; }
      }
    }
    // cloth AO: darker, slightly cooler in folds
    const occ = 1 - ao;
    r *= 1 - occ * 0.7; gg *= 1 - occ * 0.68; b *= 1 - occ * 0.6;
    if (ghost.wet) { r *= 1 - ghost.wet * 0.18; gg *= 1 - ghost.wet * 0.16; b *= 1 - ghost.wet * 0.12; }
    if (ghost.bloodStains) {
      const d = noise.noise3D(x * 6 + 1, y * 3, z * 6);
      if (d > 0.5 - ghost.bloodStains * 0.35) { const k = ghost.bloodStains * 0.75; r = lerp(r, 0.3, k); gg = lerp(gg, 0.04, k); b = lerp(b, 0.03, k); }
    }
    if (ghost.decay) {
      const d = noise.noise3D(x * 5 + 9, y * 5, z * 5);
      const k = clamp(d + 0.3, 0, 1) * ghost.decay * 0.4;
      r = lerp(r, 0.3, k); gg = lerp(gg, 0.29, k); b = lerp(b, 0.24, k);
    }
    out[0] = r; out[1] = gg; out[2] = b;
    return out;
  };
  const colorFn = (mat, x, y, z, ao, reg, nrm, v, out) => {
    if (mat === 'skin') return paintSkin(skin, x, y, z, ao, P, spec, out, reg);
    return garmentColor(mat, x, y, z, ao, out);
  };
  const h = 0.0135 * s;
  const bodyPart = buildPart({
    prims, h, margin: 0.045, relax: 2, targetTris: Math.round(11500 * quality),
    weightFn: (reg, x, y, z, w) => W.weights(reg, x, y, z, w),
    colorFn,
    ao: { strength: 4 },
    // remove the bare neck: the head mesh carries the whole neck column down into the shoulders
    clip: (x, y, z) => {
      if (y >= P.headY - 0.006 * s) return false;
      if (y < P.shoulderY - 0.004 * s) return true;
      const t = clamp((y - P.neckBot[1]) / (P.neckTop[1] - P.neckBot[1]), 0, 1);
      const az = lerp(P.neckBot[2], P.neckTop[2], t);
      const r = P.neckR * lerp(1.1, 1.0, t);
      return Math.hypot(x, (z - az)) > r + 0.007 * s;
    },
  });
  const parts = [bodyPart];
  const ctx = { spec, P, L, plan, skin, W, garmentColor, colorFn };
  parts.push(...buildHandParts(ctx, quality));
  parts.push(...buildFootParts(ctx, quality));
  const geo = mergeParts(parts, { plan });
  geo.userData.buildMs = performance.now() - t0;
  geo.userData.tris = geo.index.count / 3;
  return geo;
}
