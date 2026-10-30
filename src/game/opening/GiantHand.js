// The gigantic hand at ศาลเจ้ามารวย, for the menu incident and endings.
// Uses C's createGiantHand (src/creatures) when it builds real geometry; otherwise this
// module's own fallback: a vast, ash-pale, wet hand and forearm that rise out of the
// ground mist, open, lean over the road, close around a body and sink back.
// API (both paths): { root, rise(dur) -> Promise, grab(target: Object3D) -> Promise, sink(dur) -> Promise,
//                     update(dt), dispose(), fallback: bool }
import * as THREE from 'three';
import * as Creatures from '../../creatures/index.js';
import { paintedMaterial } from '../../render/index.js';
import { clamp, easeInOut, makeRng, noise, smoothstep } from '../../core/math.js';
import { wait } from '../util.js';
import { g } from '../context.js';

const S = 1; // metres per hand unit (the palm is ~2.6 m wide)

function displace(geo, amp, freq, seed) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = noise.noise3D(x * freq + seed, y * freq, z * freq) * amp + noise.noise3D(x * freq * 4.1, y * freq * 4.3 + seed, z * freq * 3.7) * amp * 0.25;
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A finger segment: a slightly flattened capsule from the knuckle (origin) up +Y. */
function segment(len, rad, mat, seed) {
  const geo = new THREE.CapsuleGeometry(rad, len, 6, 14);
  geo.translate(0, len / 2 + rad * 0.2, 0);
  geo.scale(1, 1, 0.82);
  // knuckle creases
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const pinch = Math.exp(-((y - len * 0.97) ** 2) / (rad * rad * 0.15)) * 0.08;
    p.setX(i, p.getX(i) * (1 - pinch));
    p.setZ(i, p.getZ(i) * (1 - pinch));
  }
  geo.computeVertexNormals();
  displace(geo, rad * 0.06, 2.2 / rad, seed);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = false;
  return m;
}

function nail(w, l, mat) {
  const geo = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  geo.scale(w * 0.5, 0.05 * w, l * 0.5);
  const m = new THREE.Mesh(geo, mat);
  return m;
}

/** Build the fallback hand. */
function buildFallbackHand() {
  const rng = makeRng(4404);
  const skin = paintedMaterial({ color: 0x8b8c82, roughness: 0.62, brush: 0.9, wet: 0.85, pale: 0.55, sss: 0.25, dirt: 0.35, dirtColor: 0x2b2a24, dirtHeight: 0.6, puddles: 0, name: 'giantHandSkin' });
  const dark = paintedMaterial({ color: 0x4a4038, roughness: 0.5, brush: 0.6, wet: 0.9, puddles: 0, name: 'giantHandNail' });
  const root = new THREE.Group();
  root.name = 'giantHand';
  const arm = new THREE.Group(); // pivots at the ground: leans forward to grab
  root.add(arm);
  // forearm out of the ground
  {
    const geo = new THREE.CylinderGeometry(1.05 * S, 1.45 * S, 12 * S, 22, 24, true);
    geo.translate(0, -6 * S + 0.3, 0);
    displace(geo, 0.14, 0.55, 3.1);
    const fa = new THREE.Mesh(geo, skin);
    arm.add(fa);
    // tendons / veins as low ridges
    for (let i = 0; i < 4; i++) {
      const a = -0.6 + i * 0.4;
      const cg = new THREE.CapsuleGeometry(0.09, 7.5, 4, 8);
      const c = new THREE.Mesh(cg, skin);
      c.position.set(Math.sin(a) * 1.08, -4.6, -Math.cos(a) * 1.08);
      c.rotation.x = 0.03;
      arm.add(c);
    }
  }
  const wrist = new THREE.Group();
  wrist.position.set(0, 0.2 * S, 0);
  arm.add(wrist);
  // palm: a rounded slab, palm facing -Z
  const palm = new THREE.Group();
  wrist.add(palm);
  {
    const geo = new THREE.SphereGeometry(1, 28, 22);
    geo.scale(1.38 * S, 1.75 * S, 0.62 * S);
    geo.translate(0, 1.55 * S, 0.05);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // flatter palm face, heel bulge and a thumb mound
      let zz = z;
      if (z < 0) zz *= 0.72 + 0.28 * smoothstep(1.4, 3.1, y);
      if (x < -0.4 && y < 1.6 && z < 0) zz -= 0.22 * (1 - Math.abs(y - 0.9)) * smoothstep(-0.4, -1.2, x);
      p.setZ(i, zz);
    }
    geo.computeVertexNormals();
    displace(geo, 0.05, 1.3, 7.7);
    palm.add(new THREE.Mesh(geo, skin));
  }
  const fingers = [];
  const spec = [
    // x on the palm, base y, lengths of three segments, radius, splay
    { x: 1.0, y: 2.9, l: [0.95, 0.66, 0.5], r: 0.26, splay: -0.22 },
    { x: 0.36, y: 3.25, l: [1.2, 0.84, 0.6], r: 0.29, splay: -0.07 },
    { x: -0.3, y: 3.2, l: [1.12, 0.78, 0.56], r: 0.28, splay: 0.06 },
    { x: -0.92, y: 2.95, l: [0.88, 0.6, 0.46], r: 0.25, splay: 0.2 },
  ];
  for (const [i, f] of spec.entries()) {
    const chain = [];
    let parent = palm;
    let y0 = f.y;
    for (let k = 0; k < 3; k++) {
      const piv = new THREE.Group();
      piv.position.set(k === 0 ? f.x * S : 0, (k === 0 ? y0 : spec[i].l[k - 1]) * S, k === 0 ? 0.04 : 0);
      if (k === 0) piv.rotation.z = f.splay;
      parent.add(piv);
      const seg = segment(f.l[k] * S, f.r * S * (1 - k * 0.12), skin, i * 3 + k + rng());
      piv.add(seg);
      if (k === 2) {
        const n = nail(f.r * 1.3, f.l[k] * 0.6, dark);
        n.position.set(0, f.l[k] * 0.62, f.r * 0.62);
        n.rotation.x = -0.12;
        piv.add(n);
      }
      chain.push(piv);
      parent = piv;
    }
    fingers.push({ chain, phase: rng() * 6 });
  }
  // thumb from the side of the palm, opposing
  {
    const chain = [];
    const piv0 = new THREE.Group();
    piv0.position.set(-1.2 * S, 0.95 * S, -0.25);
    piv0.rotation.set(-0.5, 0, 0.95);
    palm.add(piv0);
    let parent = piv0;
    const L = [0.95, 0.72, 0.55];
    for (let k = 0; k < 3; k++) {
      const piv = k === 0 ? piv0 : new THREE.Group();
      if (k > 0) {
        piv.position.set(0, L[k - 1] * S, 0);
        parent.add(piv);
      }
      piv.add(segment(L[k] * S, 0.33 * S * (1 - k * 0.12), skin, 30 + k));
      if (k === 2) {
        const n = nail(0.42, 0.34, dark);
        n.position.set(0, 0.36, 0.2);
        piv.add(n);
      }
      chain.push(piv);
      parent = piv;
    }
    fingers.push({ chain, phase: 2.2, thumb: true });
  }
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
      o.frustumCulled = false;
    }
  });
  return { root, arm, wrist, palm, fingers };
}

class FallbackHand {
  constructor() {
    const b = buildFallbackHand();
    Object.assign(this, b);
    this.fallback = true;
    this.curl = 0.15; // 0 open .. 1 fist
    this.lean = 0;
    this.height = -14;
    this.twitch = 1;
    this._t = 0;
    this.root.position.y = 0;
    this.arm.position.y = this.height;
    this.root.visible = false;
    this.held = null;
  }
  _pose() {
    this.arm.position.y = this.height;
    this.arm.rotation.x = -this.lean;
    this.wrist.rotation.x = -this.lean * 0.55;
    const t = this._t;
    for (const f of this.fingers) {
      const tw = Math.sin(t * 2.3 + f.phase) * 0.05 * this.twitch + noise.noise2D(t * 1.7, f.phase) * 0.06 * this.twitch;
      f.chain.forEach((piv, k) => {
        const c = this.curl * (f.thumb ? 0.9 : 1) * (k === 0 ? 1.05 : k === 1 ? 1.35 : 1.15) + tw;
        if (f.thumb) piv.rotation.x = (k === 0 ? -0.5 : 0) - c * 0.9;
        else piv.rotation.x = -c;
      });
    }
  }
  update(dt) {
    this._t += dt;
    this._pose();
  }
  _tween(dur, fn) {
    return new Promise((res) => {
      let t = 0;
      const off = g.engine.onUpdate((dt) => {
        t += dt;
        const k = clamp(t / dur);
        fn(k, dt);
        if (k >= 1) {
          off();
          res();
        }
      }, 21);
    });
  }
  async rise(dur = 4.5) {
    this.root.visible = true;
    const h0 = this.height;
    await this._tween(dur, (k) => {
      const e = 1 - (1 - k) ** 3;
      this.height = h0 + (0 - h0) * e;
      this.curl = 0.55 - 0.5 * smoothstep(0.35, 1, k);
    });
  }
  /** Lean over the target, close around it, lift it. */
  async grab(target) {
    const tp = target?.getWorldPosition ? target.getWorldPosition(new THREE.Vector3()) : null;
    // aim the lean so the palm comes down over the target
    let leanTo = 0.9;
    if (tp) {
      const base = this.root.getWorldPosition(new THREE.Vector3());
      const d = Math.hypot(tp.x - base.x, tp.z - base.z);
      this.root.rotation.y = Math.atan2(-(tp.x - base.x), -(tp.z - base.z));
      leanTo = clamp(Math.asin(clamp(d / 6.2, 0, 1)), 0.35, 1.25);
    }
    await this._tween(1.1, (k) => {
      this.lean = leanTo * easeInOut(k);
      this.curl = 0.05 + 0.1 * k;
    });
    g.cameraRig?.shake?.(0.35);
    await this._tween(0.45, (k) => {
      this.curl = 0.15 + 0.85 * easeInOut(k);
    });
    if (target?.isObject3D) {
      this.palm.attach(target);
      this.held = target;
    }
    await this._tween(1.6, (k) => {
      this.lean = leanTo * (1 - easeInOut(k) * 0.85);
      this.height = 1.2 * easeInOut(k);
    });
  }
  async sink(dur = 3.5) {
    const h0 = this.height;
    await this._tween(dur, (k) => {
      this.height = h0 + (-16 - h0) * easeInOut(k);
      this.lean *= 0.98;
    });
    this.root.visible = false;
  }
  dispose() {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
  }
}

/** Is a creature entity real geometry (not the stub)? */
function hasMeshes(root) {
  let n = 0;
  root?.traverse?.((o) => {
    if (o.isMesh || o.isSkinnedMesh) n++;
  });
  return n > 0;
}

/**
 * The hand to use: C's when it is real, else the fallback. Placed at `pos` facing `faceYaw`.
 */
export function makeGiantHand(pos, faceYaw = 0, opts = {}) {
  let hand = null;
  try {
    if (typeof Creatures.createGiantHand === 'function') {
      const h = Creatures.createGiantHand({ position: pos?.clone?.(), scale: opts.scale ?? 4.0 });
      if (h && hasMeshes(h.root)) hand = h;
      else h?.dispose?.();
    }
  } catch (e) {
    console.warn('[game-a] createGiantHand failed, using the fallback hand', e);
    hand = null;
  }
  if (!hand) hand = new FallbackHand();
  if (pos) hand.root.position.copy(pos);
  hand.root.rotation.y = faceYaw;
  g.engine.scene.add(hand.root);
  const off = g.engine.onUpdate((dt) => hand.update?.(dt), 21);
  const dispose = hand.dispose?.bind(hand);
  hand.dispose = () => {
    off();
    try {
      dispose?.();
    } catch (e) {
      hand.root?.removeFromParent();
    }
    hand.root?.removeFromParent();
  };
  const rise = hand.rise?.bind(hand);
  const grab = hand.grab?.bind(hand);
  const sink = hand.sink?.bind(hand);
  // never let a creature promise hang a cinematic
  hand.rise = (d) => Promise.race([Promise.resolve(rise?.(d)), wait((d ?? 4.5) + 3)]);
  hand.grab = (t, o) => Promise.race([Promise.resolve(grab?.(t, o)), wait(8)]);
  hand.sink = (d) => Promise.race([Promise.resolve(sink?.(d)), wait((d ?? 3.5) + 3)]);
  return hand;
}
