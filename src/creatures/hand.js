// Sculpted, skinned ghost hand + forearm (SDF -> surface nets -> skinned mesh), used by the
// gigantic hand at Ma Ruay shrine (scaled ×2.5–4.5), the long fingers on the door frame and the
// grey arm that reaches in through an open window. Unit: palm length (wrist -> middle knuckle) = 1.
// Rest pose: wrist at the origin, fingers along +Y, palm facing +Z, thumb on the +X side,
// forearm down to -Y. Curling a finger = rotating its joints about local +X (toward the palm).
import * as THREE from 'three';
import { Sculpt, skinnedMesh } from './sculpt.js';
import { creatureMaterial } from './skin.js';
import { Twitch, clamp, damp } from './util.js';

const FINGERS = [
  // name, base x, base y, splay x, lengths (proximal, middle, distal), radius
  { n: 'i', x: 0.29, y: 0.96, sx: 0.09, L: [0.45, 0.27, 0.22], r: 0.088 },
  { n: 'm', x: 0.09, y: 1.0, sx: 0.015, L: [0.5, 0.31, 0.24], r: 0.092 },
  { n: 'r', x: -0.11, y: 0.96, sx: -0.06, L: [0.47, 0.29, 0.23], r: 0.086 },
  { n: 'p', x: -0.3, y: 0.86, sx: -0.15, L: [0.37, 0.22, 0.19], r: 0.074 },
];
const GEO = new Map();

function v(a) {
  return new THREE.Vector3(a[0], a[1], a[2]);
}

/**
 * opts: fingerScale (1 human, 1.3 uncanny, 1.6 spider-long), thickness (finger radius ×), bony (0..1:
 * sunken palm, sharp knuckles, tendons), nails (claw length), forearm (length), cell, wrist (thinness)
 */
export function handGeometry(opts = {}) {
  const key = JSON.stringify(opts);
  if (GEO.has(key)) return GEO.get(key);
  const fs = opts.fingerScale ?? 1.25, th = opts.thickness ?? 0.9, bony = opts.bony ?? 0.6, nails = opts.nails ?? 0.12, L = opts.forearm ?? 2.2;
  const S = new Sculpt({ cell: opts.cell ?? 0.024 });
  const bones = [
    { name: 'arm', parent: null, pos: [0, -L, 0] },
    { name: 'wrist', parent: 'arm', pos: [0, 0, 0] },
  ];
  // ---- forearm, wrist, palm
  S.capsule([0, -L - 0.2, 0], [0, -0.22, 0], 0.34 * (opts.wrist ?? 1), 0.26 * (opts.wrist ?? 1), { bone: 'arm', k: 0.08, flat: [1.0, 0.74], hint: [0, 0, 1], tag: 3 });
  // forearm muscle bellies (wasted on a ghost) + radius / ulna ridges
  S.ellipsoid([0.06, -L * 0.62, 0.03], [0.3, 0.6, 0.22], { bone: 'arm', k: 0.12, tag: 3 });
  S.capsule([0.2, -L * 0.8, -0.05], [0.24, -0.18, -0.06], 0.07, 0.06, { bone: 'arm', k: 0.08, tag: 3 });
  S.capsule([-0.22, -L * 0.8, -0.04], [-0.27, -0.12, -0.07], 0.06, 0.07, { bone: 'arm', k: 0.08, tag: 3 });
  S.sphere([-0.29, -0.07, -0.08], 0.075, { bone: 'arm', k: 0.05 }); // ulna head
  S.ellipsoid([0, 0.04, 0], [0.31, 0.17, 0.17], { bone: 'wrist', k: 0.08 });
  S.box([0.01, 0.52, 0], [0.38, 0.4, 0.085 - bony * 0.012], 0.08, { bone: 'wrist', k: 0.1 });
  S.ellipsoid([0.0, 0.62, -0.02], [0.4, 0.38, 0.1], { bone: 'wrist', k: 0.1 });
  S.ellipsoid([0.27, 0.27, 0.08], [0.17, 0.27, 0.12 - bony * 0.02], { bone: 't1', k: 0.08 }); // thenar
  S.ellipsoid([-0.3, 0.4, 0.05], [0.12, 0.32, 0.09], { bone: 'wrist', k: 0.08 }); // hypothenar
  // sunken palm hollow + creases (life / head / heart lines)
  S.ellipsoid([0.0, 0.55, 0.16], [0.2, 0.22, 0.06], { op: 'sub', k: 0.08 + bony * 0.04 });
  for (const [a, b] of [
    [[0.3, 0.6, 0.12], [0.05, 0.12, 0.13]],
    [[0.32, 0.62, 0.12], [-0.25, 0.55, 0.12]],
    [[-0.42, 0.78, 0.11], [0.18, 0.74, 0.12]],
  ]) S.capsule(a, b, 0.011, 0.009, { op: 'sub', k: 0.014 });
  // ---- fingers
  for (const f of FINGERS) {
    const dir = new THREE.Vector3(f.sx, 1, 0).normalize();
    const base = new THREE.Vector3(f.x, f.y, 0);
    const lens = f.L.map((l) => l * fs);
    const p1 = base.clone(), p2 = p1.clone().addScaledVector(dir, lens[0]), p3 = p2.clone().addScaledVector(dir, lens[1]), p4 = p3.clone().addScaledVector(dir, lens[2]);
    const r = f.r * th;
    const n = f.n;
    bones.push({ name: n + '1', parent: 'wrist', pos: p1.toArray() }, { name: n + '2', parent: n + '1', pos: p2.toArray() }, { name: n + '3', parent: n + '2', pos: p3.toArray() }, { name: n + '4', parent: n + '3', pos: p4.toArray() });
    // metacarpal under the back of the hand (tendon ridge) + the knuckle
    S.capsule([f.x * 0.35, 0.08, -0.07], [f.x, f.y - 0.06, -0.07], 0.026 + bony * 0.008, 0.03, { bone: 'wrist', k: 0.05 });
    S.sphere([f.x, f.y - 0.02, -0.035], r * (1.05 + bony * 0.15), { bone: n + '1', k: 0.06, wk: 0.6 });
    // phalanges (slightly thinner mid-shaft than at the joints: bony)
    const mid = (a, b) => a.clone().lerp(b, 0.5);
    S.capsule(p1.toArray(), mid(p1, p2).toArray(), r, r * (0.86 - bony * 0.06), { bone: n + '1', k: 0.035 });
    S.capsule(mid(p1, p2).toArray(), p2.toArray(), r * (0.86 - bony * 0.06), r * 0.9, { bone: n + '1', k: 0.035 });
    S.sphere(p2.clone().add(new THREE.Vector3(0, 0, -0.01)).toArray(), r * 0.95, { bone: n + '2', k: 0.03, wk: 0.5 });
    S.capsule(p2.toArray(), mid(p2, p3).toArray(), r * 0.86, r * (0.75 - bony * 0.05), { bone: n + '2', k: 0.03 });
    S.capsule(mid(p2, p3).toArray(), p3.toArray(), r * (0.75 - bony * 0.05), r * 0.8, { bone: n + '2', k: 0.03 });
    S.sphere(p3.clone().add(new THREE.Vector3(0, 0, -0.008)).toArray(), r * 0.82, { bone: n + '3', k: 0.025, wk: 0.5 });
    S.capsule(p3.toArray(), p4.toArray(), r * 0.74, r * 0.55, { bone: n + '3', k: 0.025 });
    // pads on the palm side
    S.ellipsoid(p4.clone().addScaledVector(dir, -lens[2] * 0.42).add(new THREE.Vector3(0, 0, r * 0.32)).toArray(), [r * 0.62, lens[2] * 0.36, r * 0.42], { bone: n + '3', k: 0.025 });
    // long, cracked nail: a curved claw over the fingertip
    if (nails > 0) {
      const nb = p3.clone().lerp(p4, 0.38).add(new THREE.Vector3(0, 0, -r * 0.62));
      const nt = p4.clone().addScaledVector(dir, nails * fs).add(new THREE.Vector3(0, 0, r * 0.1));
      const nc = p4.clone().addScaledVector(dir, nails * 0.45 * fs).add(new THREE.Vector3(0, 0, -r * 0.38));
      S.capsule(nb.toArray(), nc.toArray(), r * 0.56, r * 0.42, { bone: n + '3', k: 0.006, flat: [1.0, 0.32], hint: [0, 0, 1], tag: 2 });
      S.capsule(nc.toArray(), nt.toArray(), r * 0.42, r * 0.1, { bone: n + '3', k: 0.006, flat: [1.0, 0.36], hint: [0, 0, 1], tag: 2 });
    }
  }
  // ---- thumb
  {
    const c = new THREE.Vector3(0.36, 0.2, 0.08);
    const d1 = new THREE.Vector3(0.55, 0.72, 0.42).normalize();
    const d2 = new THREE.Vector3(0.42, 0.85, 0.32).normalize();
    const d3 = new THREE.Vector3(0.3, 0.92, 0.25).normalize();
    const l = [0.42, 0.33 * fs, 0.28 * fs];
    const p2 = c.clone().addScaledVector(d1, l[0]), p3 = p2.clone().addScaledVector(d2, l[1]), p4 = p3.clone().addScaledVector(d3, l[2]);
    bones.push({ name: 't1', parent: 'wrist', pos: c.toArray() }, { name: 't2', parent: 't1', pos: p2.toArray() }, { name: 't3', parent: 't2', pos: p3.toArray() }, { name: 't4', parent: 't3', pos: p4.toArray() });
    const r = 0.1 * th;
    S.capsule(c.toArray(), p2.toArray(), r * 1.15, r, { bone: 't1', k: 0.06 });
    S.sphere(p2.toArray(), r * 1.02, { bone: 't2', k: 0.04, wk: 0.5 });
    S.capsule(p2.toArray(), p3.toArray(), r * 0.95, r * 0.86, { bone: 't2', k: 0.035 });
    S.sphere(p3.toArray(), r * 0.86, { bone: 't3', k: 0.03, wk: 0.5 });
    S.capsule(p3.toArray(), p4.toArray(), r * 0.84, r * 0.6, { bone: 't3', k: 0.03 });
    if (nails > 0) {
      const nb = p3.clone().lerp(p4, 0.4).addScaledVector(new THREE.Vector3(-0.3, 0, -1).normalize(), r * 0.62);
      const nt = p4.clone().addScaledVector(d3, nails * 0.9 * fs);
      S.capsule(nb.toArray(), nt.toArray(), r * 0.55, r * 0.12, { bone: 't3', k: 0.006, flat: [1, 0.34], hint: [-0.3, 0, -1], tag: 2 });
    }
  }
  const pale = opts.color || [0.6, 0.62, 0.55];
  const res = S.build({
    bones,
    sigma: 0.03,
    color: (x, y, z, nx, ny, nz, tag, ao) => {
      let c;
      if (tag === 2) c = [0.36, 0.31, 0.2]; // yellowed horn
      else {
        const palm = Math.max(0, nz) * (y > -0.1 && y < 1.0 ? 1 : 0);
        c = [pale[0] + palm * 0.06, pale[1] + palm * 0.02, pale[2] + palm * 0.02];
        // bruised knuckles + darkened, rotting fingertips; forearm sinks into grime toward the elbow
        const tip = Math.max(0, Math.min(1, (y - 1.35) / 0.9));
        c = [c[0] * (1 - tip * 0.45), c[1] * (1 - tip * 0.5), c[2] * (1 - tip * 0.45)];
        if (nz < -0.3 && y > 0.75 && y < 1.15) c = [c[0] * 0.86, c[1] * 0.78, c[2] * 0.86];
        const low = Math.max(0, Math.min(1, (-y - 0.4) / 1.6));
        c = [c[0] * (1 - low * 0.5), c[1] * (1 - low * 0.45), c[2] * (1 - low * 0.5)];
      }
      const a = 0.55 + 0.45 * ao;
      return [c[0] * a, c[1] * a, c[2] * a];
    },
  });
  GEO.set(key, res);
  return res;
}

/** A ghost hand rig: skinned mesh + finger control. */
export class HandRig {
  constructor(opts = {}) {
    const { geometry, boneDefs } = handGeometry(opts.shape || {});
    this.material =
      opts.material ||
      creatureMaterial({
        detail: 'ghostSkin', detailScale: opts.detailScale ?? 3.2, detailAmount: 0.75, bump: opts.bump ?? 1.2,
        color: opts.tint ?? 0xffffff, roughness: 0.62, skin: true, sss: 0.7, pale: opts.pale ?? 0.45, wet: opts.wet ?? 0.35,
        brush: 0.35, emissive: opts.emissive ?? 0x0b1410, emissiveIntensity: 1, rim: opts.rim ?? 0.35, puddles: 0,
      });
    const { mesh, rig } = skinnedMesh(geometry, this.material, boneDefs);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.mesh = mesh;
    this.rig = rig;
    this.b = rig.byName;
    this.curl = { i: 0, m: 0, r: 0, p: 0, t: 0 };
    this.curlT = { i: 0, m: 0, r: 0, p: 0, t: 0 };
    this.spread = 0;
    this.spreadT = 0;
    this.speed = 4;
    this.twitchAmt = opts.twitch ?? 0.25;
    this.tw = { i: new Twitch(1.4, 1), m: new Twitch(1.1, 1), r: new Twitch(1.6, 1), p: new Twitch(2, 1), t: new Twitch(1.2, 1) };
    this.wristBend = 0; // + = bend the palm forward (+Z)
    this._q = new THREE.Quaternion();
    this._ax = new THREE.Vector3(1, 0, 0);
    this._az = new THREE.Vector3(0, 0, 1);
    // thumb curl axis: perpendicular to the thumb's rest direction and the palm normal
    const td = this.b.t2.userData.rest.clone().normalize();
    this._thumbAx = new THREE.Vector3().crossVectors(td, new THREE.Vector3(0, 0, 1)).normalize();
    this._thumbAx2 = new THREE.Vector3(0, 0, 1);
  }
  /** Curl targets: number (all) or {i,m,r,p,t}; 0 open, 1 fist, < 0 hyper-extended (claw spread). */
  setCurl(c, speed = 4) {
    this.speed = speed;
    if (typeof c === 'number') for (const k of Object.keys(this.curlT)) this.curlT[k] = c;
    else Object.assign(this.curlT, c);
  }
  update(dt) {
    const tw = this.twitchAmt;
    for (const k of Object.keys(this.curl)) this.curl[k] = damp(this.curl[k], this.curlT[k], this.speed, dt);
    this.spread = damp(this.spread, this.spreadT, 3, dt);
    const fingers = ['i', 'm', 'r', 'p'];
    for (let f = 0; f < 4; f++) {
      const n = fingers[f];
      const c = this.curl[n] + this.tw[n].update(dt) * tw * 0.35;
      const a = c * Math.PI * 0.5;
      // claws: hyper-extension bends the tips back, curls drive all three joints
      this.b[n + '1'].quaternion.setFromAxisAngle(this._ax, a * 0.95);
      this._q.setFromAxisAngle(this._az, (f - 1.5) * -0.07 * this.spread);
      this.b[n + '1'].quaternion.multiply(this._q);
      this.b[n + '2'].quaternion.setFromAxisAngle(this._ax, c < 0 ? a * 0.3 : a * 1.15);
      this.b[n + '3'].quaternion.setFromAxisAngle(this._ax, c < 0 ? a * 0.9 : a * 0.85);
    }
    const t = this.curl.t + this.tw.t.update(dt) * tw * 0.3;
    this.b.t1.quaternion.setFromAxisAngle(this._thumbAx, t * 0.55);
    this._q.setFromAxisAngle(this._thumbAx2, t * 0.5);
    this.b.t1.quaternion.multiply(this._q);
    this.b.t2.quaternion.setFromAxisAngle(this._thumbAx, t * 0.6);
    this.b.t3.quaternion.setFromAxisAngle(this._thumbAx, t * 0.8);
    this.b.wrist.quaternion.setFromAxisAngle(this._ax, this.wristBend);
  }
  dispose() {
    this.mesh.removeFromParent();
    this.material.dispose();
    this.rig.skeleton.dispose();
  }
}

export { clamp };
