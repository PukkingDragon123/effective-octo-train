// A flock of cattle egrets (นกยางควาย) lifting off a paddy at dawn: sculpted white bodies with
// S-curved necks, yellow bills and trailing legs; wings are separate sculpted blades that beat
// with a slow downstroke and glide. They climb away in a loose, shifting V.
//   const f = createEgretFlock(9); scene.add(f.root); f.takeOff(origin, direction)
import * as THREE from 'three';
import { audio } from '../audio/index.js';
import { paintedMaterial } from '../render/index.js';
import { Sculpt } from './sculpt.js';
import { Entity, TAU, noise, rand } from './util.js';

let GEO = null;
function geos() {
  if (GEO) return GEO;
  const B = new Sculpt({ cell: 0.009 });
  B.ellipsoid([0, 0, 0], [0.07, 0.075, 0.17], { k: 0.03 });
  B.capsule([0, 0.04, -0.12], [0, 0.11, -0.16], 0.035, 0.025, { k: 0.02 });
  B.capsule([0, 0.11, -0.16], [0, 0.13, -0.24], 0.025, 0.022, { k: 0.015 });
  B.sphere([0, 0.14, -0.25], 0.03, { k: 0.01 });
  B.capsule([0, 0.135, -0.27], [0, 0.125, -0.34], 0.011, 0.003, { k: 0.004, tag: 2 }); // bill
  B.capsule([0.02, -0.04, 0.14], [0.02, -0.05, 0.33], 0.008, 0.006, { k: 0.004, tag: 3 }); // legs trailing
  B.capsule([-0.02, -0.04, 0.14], [-0.02, -0.05, 0.33], 0.008, 0.006, { k: 0.004, tag: 3 });
  B.ellipsoid([0, 0.01, 0.2], [0.05, 0.015, 0.08], { k: 0.02 }); // tail
  const body = B.build({ color: (x, y, z, nx, ny, nz, tag, ao) => (tag === 2 ? [0.85, 0.7, 0.25] : tag === 3 ? [0.2, 0.18, 0.14] : [0.92 * (0.7 + 0.3 * ao), 0.91 * (0.7 + 0.3 * ao), 0.86 * (0.7 + 0.3 * ao)]) }).geometry;
  const W = new Sculpt({ cell: 0.008 });
  W.ellipsoid([0.2, 0, 0.02], [0.2, 0.012, 0.085], { k: 0.01 });
  W.ellipsoid([0.36, 0, 0.05], [0.1, 0.008, 0.06], { k: 0.02 });
  const wing = W.build({ color: (x, y, z, nx, ny, nz, tag, ao) => [0.9, 0.9, 0.86].map((v) => v * (0.75 + 0.25 * ao)) }).geometry;
  const mat = paintedMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.85, brush: 0.4, wet: 0.1, puddles: 0, side: THREE.DoubleSide });
  mat.userData.shared = true;
  body.userData.shared = wing.userData.shared = true;
  GEO = { body, wing, mat };
  return GEO;
}

export class EgretFlock extends Entity {
  constructor(n = 9) {
    super('egrets');
    const G = geos();
    this.birds = [];
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(G.body, G.mat);
      const wl = new THREE.Group(), wr = new THREE.Group();
      const ml = new THREE.Mesh(G.wing, G.mat), mr = new THREE.Mesh(G.wing, G.mat);
      mr.scale.x = 1;
      ml.scale.x = -1;
      wl.add(ml);
      wr.add(mr);
      wl.position.set(-0.05, 0.03, -0.03);
      wr.position.set(0.05, 0.03, -0.03);
      g.add(b, wl, wr);
      g.scale.setScalar(rand(0.9, 1.1));
      this.root.add(g);
      this.birds.push({ g, wl, wr, ph: Math.random() * TAU, off: new THREE.Vector3((i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.9, rand(-0.3, 0.3), Math.ceil(i / 2) * 0.8), rate: rand(2.2, 2.8) });
    }
    this.root.visible = false;
    this.dir = new THREE.Vector3(0, 0, -1);
    this.pos = new THREE.Vector3();
    this.speed = 6;
  }
  /** Lift off from `origin` heading `dir` (world). */
  takeOff(origin, dir) {
    this.pos.copy(origin);
    this.dir.copy(dir).setY(0).normalize();
    this.climb = 0;
    this.root.visible = true;
    audio.play('wind_chime', { position: origin, volume: 0.15, rate: 1.6 });
    return this;
  }
  step(dt) {
    if (!this.root.visible) return;
    const t = this.time;
    this.climb = Math.min(1, (this.climb || 0) + dt * 0.25);
    this.pos.addScaledVector(this.dir, this.speed * dt);
    this.pos.y += (2.2 * (1 - this.climb) + 0.5) * dt;
    const yaw = Math.atan2(-this.dir.x, -this.dir.z);
    for (const b of this.birds) {
      b.ph += dt * b.rate * TAU * (this.climb < 0.6 ? 1.2 : 0.8);
      const glide = noise.noise2D(t * 0.3, b.off.x) > 0.3 ? 0.25 : 1;
      const s = Math.sin(b.ph) * glide;
      b.wl.rotation.z = -0.15 + s * 0.85;
      b.wr.rotation.z = 0.15 - s * 0.85;
      const o = b.off.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      b.g.position.copy(this.pos).add(o).add(new THREE.Vector3(0, Math.sin(b.ph + 1.5) * 0.06 + noise.noise2D(t * 0.4, b.off.z) * 0.4, 0));
      b.g.rotation.set(-0.2 * (1 - this.climb) + Math.sin(b.ph) * 0.03, yaw, noise.noise2D(t * 0.5, b.off.x) * 0.12);
    }
  }
}

export function createEgretFlock(n = 9) {
  return new EgretFlock(n);
}
