// กระสือ (Krasue): a beautiful woman's head floating at night, long wet hair hanging, eyes
// glowing, trailing her own organs: windpipe, heart, lungs, liver and coils of intestine that
// glow green-gold and drip. Built on a characters-system humanoid (painted face, eyes, hair
// springs) whose body below the neck is collapsed by bone scale; the organs are sculpted meshes
// and the intestines are verlet ropes skinned with dynamic tubes.
//   const k = createKrasue(); scene.add(k.root); k.floatTo(pos); k.notice(camera); k.setGlow(1)
import * as THREE from 'three';
import { audio } from '../audio/index.js';
import { lightPool, particles } from '../render/index.js';
import { engine } from '../core/Engine.js';
import { SPECS, human } from './humans.js';
import { Sculpt } from './sculpt.js';
import { glowFleshMaterial } from './skin.js';
import { Entity, Rope, DynamicTube, animate, sleep, damp, clamp, noise, worldPos, easeInOut, TAU } from './util.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
let ORGANS = null;

/** Sculpted organs (cached): heart, two lungs, liver lump, windpipe. Local space: neck base at 0, down = -Y. */
export function organGeometries() {
  if (ORGANS) return ORGANS;
  const mk = (fn, cell = 0.007) => {
    const S = new Sculpt({ cell });
    fn(S);
    return S.build({}).geometry;
  };
  ORGANS = {
    trachea: mk((S) => {
      S.capsule([0, 0.02, 0], [0, -0.17, 0.01], 0.022, 0.02, { k: 0.01 });
      for (let i = 0; i < 7; i++) S.custom((x, y, z) => { // cartilage rings
        const yy = -0.02 - i * 0.022;
        const q = Math.hypot(x, z - 0.003) - 0.023;
        return Math.hypot(q, y - yy) - 0.005;
      }, [-0.04, -0.2, -0.04, 0.04, 0.03, 0.04], { k: 0.004 });
      S.capsule([0, -0.17, 0.01], [-0.06, -0.22, 0.0], 0.016, 0.013, { k: 0.01 });
      S.capsule([0, -0.17, 0.01], [0.06, -0.22, 0.0], 0.016, 0.013, { k: 0.01 });
    }),
    heart: mk((S) => {
      S.ellipsoid([0, -0.25, 0.03], [0.055, 0.07, 0.05], { axis: [0.35, -1, 0.15], k: 0.02 });
      S.ellipsoid([-0.02, -0.21, 0.035], [0.045, 0.045, 0.042], { k: 0.025 }); // atria
      S.capsule([0.0, -0.2, 0.03], [0.01, -0.15, 0.03], 0.02, 0.018, { k: 0.012 }); // aorta root
      S.custom((x, y, z) => { // aortic arch
        const q = Math.hypot(x + 0.025, y + 0.14) - 0.03;
        return Math.max(Math.hypot(q, z - 0.03) - 0.014, -(y + 0.14));
      }, [-0.08, -0.16, -0.01, 0.03, -0.09, 0.07], { k: 0.01 });
      S.capsule([0.03, -0.22, 0.05], [0.07, -0.16, 0.06], 0.013, 0.009, { k: 0.01 }); // vessels
      S.capsule([-0.04, -0.27, 0.04], [-0.09, -0.3, 0.02], 0.01, 0.006, { k: 0.008 });
    }),
    lungL: mk((S) => {
      S.ellipsoid([-0.075, -0.27, 0.0], [0.06, 0.12, 0.05], { axis: [-0.15, 1, 0], k: 0.03 });
      S.ellipsoid([-0.085, -0.34, 0.01], [0.055, 0.06, 0.05], { k: 0.03 });
      S.capsule([-0.03, -0.31, 0.06], [-0.13, -0.27, 0.05], 0.007, 0.006, { op: 'sub', k: 0.008 }); // fissure
    }),
    lungR: mk((S) => {
      S.ellipsoid([0.08, -0.27, 0.0], [0.065, 0.12, 0.05], { axis: [0.15, 1, 0], k: 0.03 });
      S.ellipsoid([0.09, -0.35, 0.01], [0.06, 0.06, 0.05], { k: 0.03 });
      S.capsule([0.03, -0.25, 0.06], [0.14, -0.29, 0.05], 0.007, 0.006, { op: 'sub', k: 0.008 });
      S.capsule([0.04, -0.33, 0.06], [0.14, -0.36, 0.05], 0.007, 0.006, { op: 'sub', k: 0.008 });
    }),
    liver: mk((S) => {
      S.ellipsoid([0.02, -0.43, 0.0], [0.11, 0.05, 0.07], { axis: [0.3, 1, 0.1], k: 0.03 });
      S.ellipsoid([-0.05, -0.45, 0.01], [0.06, 0.04, 0.05], { k: 0.03 });
      S.ellipsoid([0.06, -0.47, 0.03], [0.035, 0.03, 0.03], { k: 0.02 }); // gall bladder
    }),
  };
  return ORGANS;
}

export class Krasue extends Entity {
  constructor(opts = {}) {
    super('krasue');
    this.h = human(SPECS.krasue, opts);
    this.humanoid = this.h;
    this.h.setMode('float');
    this.root.add(this.h.root);
    this._collapse();
    this.h.setGhost({ stare: 0.6, noBlink: 1, unlimited: 1 }, 100);
    this.h.setExpression({ smile: 0.15, creepy: 0.3 });
    // --- organs
    const G = organGeometries();
    this.fleshMat = glowFleshMaterial({ color: 0x7a2a22, emissive: 0x9cff5a, emissiveIntensity: 0.5 });
    this.lungMat = glowFleshMaterial({ color: 0x9a5a58, emissive: 0x8aff70, emissiveIntensity: 0.35 });
    this.gutMat = glowFleshMaterial({ color: 0x8a4a3a, emissive: 0xc6ff6a, emissiveIntensity: 0.7, detailScale: 14 });
    this.organs = new THREE.Group();
    this.organs.name = 'krasueOrgans';
    this.root.add(this.organs);
    const add = (geo, mat) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = false;
      this.organs.add(m);
      return m;
    };
    add(G.trachea, this.lungMat);
    this.heart = add(G.heart, this.fleshMat);
    add(G.lungL, this.lungMat);
    add(G.lungR, this.lungMat);
    add(G.liver, this.fleshMat);
    this._keep = new Set(Object.values(G));
    // --- intestines: ropes from points on the organ cluster
    this.guts = [];
    const starts = [[0.0, -0.46, 0.02, 30, 0.026], [0.05, -0.44, -0.02, 24, 0.022], [-0.06, -0.42, 0.0, 34, 0.024], [0.02, -0.3, 0.05, 16, 0.014]];
    for (const [x, y, z, n, r] of starts) {
      const rope = new Rope(n, 0.045, new THREE.Vector3(x, y, z));
      rope.gravity = -5;
      rope.damping = 0.975;
      const tube = new DynamicTube(n, 8, (t) => r * (1 - t * 0.35), this.gutMat);
      engine.scene.add(tube.mesh);
      this.guts.push({ rope, tube, off: new THREE.Vector3(x, y, z), phase: Math.random() * TAU, init: false });
    }
    // --- light + drips + sound
    this.lightAnchor = new THREE.Object3D();
    this.lightAnchor.position.set(0, -0.35, 0.05);
    this.organs.add(this.lightAnchor);
    this.glow = 1;
    this.glowT = 1;
    this.light = opts.light === false ? null : lightPool.add({ object: this.lightAnchor, color: 0xb8ff70, intensity: 4, distance: 9, decay: 1.8, flicker: 'candle', glow: { size: 0.9, color: 0xc8ff80, opacity: 0.6 }, priority: 3 });
    try {
      this.drips = particles.emit('blood', { object: this.lightAnchor, radius: 0.08, height: 3 });
    } catch (e) {
      this.drips = null;
    }
    this._hum = audio.loop('electric_buzz', { object: this.organs, volume: 0.12, rate: 0.5 });
    this.target = null;
    this.vel = new THREE.Vector3();
    this.headOffset = new THREE.Vector3(0, 1.0, 0);
    this.goal = null;
    this.speed = 1.6;
    this.noticeTarget = null;
    this._yaw = 0;
  }

  /** Collapse every bone below the neck into one point (the head floats free). */
  _collapse() {
    const b = (n) => this.h.bones[n] || this.h.rig?.bone?.(n);
    const pelvis = b('pelvis'), neck = b('neck_01');
    if (!pelvis || !neck) return;
    const s = 0.002;
    pelvis.scale.multiplyScalar(s);
    // the spine chain inherits the collapse; the neck restores full scale
    neck.scale.multiplyScalar(1 / s);
    this._collapsed = true;
  }

  /** Neck base (world) = where the organs hang from. */
  neckBase(out = new THREE.Vector3()) {
    const n = this.h.bones.neck_01 || this.h.bones.neck;
    if (!n) return worldPos(this.h.root, out);
    n.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(n.matrixWorld);
  }

  /** Head position (world). */
  get headPos() {
    return this.h.headPosition;
  }

  setGlow(v) {
    this.glowT = clamp(v, 0, 2);
  }
  /** Turn the face toward a target (Object3D | Vector3) and hold it there; null releases. */
  notice(target) {
    this.noticeTarget = target;
    this.h.lookAt(target || null, { speed: 3, unlimited: true });
    this.h.setGhost({ stare: target ? 1 : 0.6 }, 2);
    if (target) audio.play('giggle', { object: this.organs, volume: 0.5, rate: 0.85 });
  }
  /** Drift to a world position (the head arrives there). Resolves on arrival. */
  floatTo(pos, speed = 1.6) {
    this.goal = pos.clone();
    this.speed = speed;
    return new Promise((res) => {
      this._arrive = res;
    });
  }
  /** Place the head at a world position immediately. */
  placeHead(pos) {
    this.root.position.copy(pos).sub(this.headOffset);
    this.goal = null;
    for (const g of this.guts) g.init = false;
  }

  step(dt) {
    const t = this.time;
    // measured head offset (root -> neck base) keeps placement exact
    const nb = this.neckBase(_v);
    const rp = worldPos(this.root, _v2);
    this.headOffset.lerp(_v.sub(rp), 0.2);
    // drift
    if (this.goal) {
      const cur = _v.copy(this.root.position).add(this.headOffset);
      const d = _v2.subVectors(this.goal, cur);
      const dist = d.length();
      if (dist < 0.08) {
        this.goal = null;
        this.vel.multiplyScalar(0.5);
        const r = this._arrive;
        this._arrive = null;
        r?.(true);
      } else {
        d.normalize().multiplyScalar(Math.min(this.speed, dist * 1.4));
        this.vel.x = damp(this.vel.x, d.x, 2.2, dt);
        this.vel.y = damp(this.vel.y, d.y, 2.2, dt);
        this.vel.z = damp(this.vel.z, d.z, 2.2, dt);
      }
    } else this.vel.multiplyScalar(Math.exp(-2 * dt));
    this.root.position.addScaledVector(this.vel, dt);
    this.root.position.y += Math.sin(t * 1.3) * 0.06 * dt + noise.noise2D(t * 0.4, 2.2) * 0.05 * dt;
    // face the direction of travel unless staring at something
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.15 && !this.noticeTarget) {
      const yaw = Math.atan2(-this.vel.x, -this.vel.z);
      let dy = yaw - this._yaw;
      while (dy > Math.PI) dy -= TAU;
      while (dy < -Math.PI) dy += TAU;
      this._yaw += dy * (1 - Math.exp(-2 * dt));
    }
    this.h.root.rotation.y = this._yaw;
    this.h.root.rotation.z = noise.noise2D(t * 0.3, 7.7) * 0.08 - this.vel.x * 0.04;
    // organs follow the neck base with the head's yaw, lagging a little (they hang)
    const nb2 = this.neckBase(_v);
    this.organs.parent.updateWorldMatrix(true, false);
    this.organs.position.copy(this.organs.parent.worldToLocal(nb2));
    this.organs.rotation.y = this._yaw;
    this.organs.rotation.x = clamp(-this.vel.z * 0.15, -0.5, 0.5) + Math.sin(t * 0.9) * 0.05;
    this.organs.rotation.z = clamp(this.vel.x * 0.15, -0.5, 0.5);
    // heartbeat
    const beat = Math.pow(Math.max(0, Math.sin(t * 7.2)), 8) + Math.pow(Math.max(0, Math.sin(t * 7.2 - 0.9)), 10) * 0.6;
    this.heart.scale.setScalar(1 + beat * 0.08);
    this.glow = damp(this.glow, this.glowT, 2, dt);
    const g = this.glow * (0.75 + beat * 0.35 + noise.noise2D(t * 3, 1.1) * 0.08);
    this.fleshMat.emissiveIntensity = 0.45 * g;
    this.lungMat.emissiveIntensity = 0.3 * g;
    this.gutMat.emissiveIntensity = 0.65 * g;
    if (this.light) this.light.setIntensity(4.5 * g);
    // intestines
    this.organs.updateWorldMatrix(true, false);
    for (const gut of this.guts) {
      const anchor = _v.copy(gut.off).applyMatrix4(this.organs.matrixWorld);
      if (!gut.init) {
        for (let i = 0; i < gut.rope.n; i++) {
          gut.rope.p[i].copy(anchor).y -= i * gut.rope.seg;
          gut.rope.q[i].copy(gut.rope.p[i]);
        }
        gut.init = true;
      }
      gut.rope.pin(anchor);
      gut.rope.wind.set(Math.sin(t * 0.7 + gut.phase) * 0.6 - this.vel.x * 2, 0, Math.cos(t * 0.5 + gut.phase) * 0.6 - this.vel.z * 2);
      gut.rope.step(dt);
      const ph = t * 3 + gut.phase;
      gut.tube.set(gut.rope.p, (i) => 1 + 0.22 * Math.max(0, Math.sin(i * 0.9 - ph)) + 0.08 * Math.sin(i * 2.7));
    }
  }

  /** Swoop away fast and vanish into the trees. */
  async flee(dir, duration = 2.2) {
    const d = dir ? dir.clone().normalize() : new THREE.Vector3(Math.random() - 0.5, 0.2, Math.random() - 0.5).normalize();
    const p = this.root.position.clone().add(this.headOffset).addScaledVector(d, 16);
    this.notice(null);
    this.floatTo(p, 7);
    await sleep(duration * 0.6);
    await animate(duration * 0.4, (k) => {
      this.h.setOpacity(1 - k);
      this.setGlow(1 - k);
      for (const g of this.guts) g.tube.mesh.visible = k < 0.95;
      this.organs.visible = k < 0.95;
    }, easeInOut);
  }

  dispose() {
    this.light?.remove();
    this.drips?.dispose();
    this._hum?.stop(0.5);
    for (const g of this.guts) {
      g.tube.mesh.removeFromParent();
      g.tube.geometry.dispose();
    }
    this.gutMat.dispose();
    this.h.dispose();
    super.dispose();
  }
}
