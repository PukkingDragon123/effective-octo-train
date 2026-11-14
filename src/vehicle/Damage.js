// Taxi crash damage for the night (repaired at the garage between nights: repair()).
//   hit({ point, speed, rail, solid })  speed = m/s into the obstacle
//   * dents: body vertices around the hit pushed in (falloff), normals rebuilt
//   * headlights: one side cracked (flickers), then out; both = dark
//   * windshield: a spider-web crack (thin geometry strips on the glass) on a hard frontal hit
//   * bumper: hangs off its corner (the GLB bumper node, if any) after a big hit
//   * steam from under the bonnet, growing with the damage; handling worse a little (level)
//   * impact sounds by severity, sparks on steel
import * as THREE from 'three';
import { audio } from '../audio/index.js';
import { particles } from '../render/index.js';
import { makeRng } from '../core/math.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3(), _m = new THREE.Matrix4();

export class TaxiDamage {
  constructor(taxi) {
    this.t = taxi;
    this.level = 0; // 0..1, worse handling
    this.pull = 0; // steering pull (a bent wheel)
    this.lights = { L: 0, R: 0 };
    this.orig = new Map(); // geometry -> original positions
    this.cracks = [];
    this.bumper = null;
    this.steam = null;
    this.rng = makeRng(77);
  }

  hit(c = {}) {
    const sev = Math.max(0, c.speed || 0);
    if (sev < 1.4 || !c.point) return;
    const t = this.t;
    const local = t.bodyInner.worldToLocal(c.point.clone());
    const front = local.z < -0.9, rear = local.z > 0.9;
    const side = Math.sign(local.x) || 1;
    // sound by severity, sparks on steel
    audio.play('collision_thud', { position: c.point, volume: Math.min(1, 0.35 + sev / 8), rate: sev > 6 ? 0.8 : 1 });
    if (sev > 3) audio.play('scratch_glass', { position: c.point, volume: Math.min(1, sev / 9), rate: 0.55 }); // metal screech
    if (sev > 6) audio.play('bone_crack', { position: c.point, volume: 0.45, rate: 0.7 });
    if (c.rail) {
      try {
        particles.emit('sparks', { position: c.point.clone(), burst: true, autoDispose: true, count: Math.round(20 + sev * 6) });
      } catch (e) {
        /* sparks optional */
      }
    }
    // the body gives
    this.dent(c.point, Math.min(0.11, 0.012 + sev * 0.009), 0.32 + Math.min(0.3, sev * 0.025));
    if (front && sev > 3) this.breakLight(side, sev > 7 ? 1 : 0.5);
    if (front && sev > 6.5) this.crack(sev);
    if ((front || rear) && sev > 5.5) this.hangBumper(front, side);
    this.level = Math.min(1, this.level + sev * 0.035);
    this.pull = Math.max(-0.08, Math.min(0.08, this.pull + side * sev * 0.004));
    if (this.level > 0.25) this.smoke();
  }

  /** Push body vertices near a world point inward (toward the car's centre line). */
  dent(worldPoint, depth, radius) {
    const t = this.t;
    const skip = new Set();
    for (const id of t.glass?.ids || []) skip.add(t.glass.panes[id].mesh);
    t.bodyInner.getWorldPosition(_c);
    const root = t.ext?.shell || t.bodyInner;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || skip.has(o) || !o.geometry?.attributes?.position || /wheel|tyre|tire|glass|lens|mirror/i.test(o.name)) return;
      const geo = o.geometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      _w.copy(geo.boundingSphere.center).applyMatrix4(o.matrixWorld);
      const sc = o.matrixWorld.getMaxScaleOnAxis();
      if (_w.distanceTo(worldPoint) > geo.boundingSphere.radius * sc + radius) return;
      // own the geometry before deforming it (shared GLB data), remember the original
      if (!geo.userData._dentOwned) {
        o.geometry = o.geometry.clone();
        o.geometry.userData._dentOwned = true;
        this.orig.set(o.geometry, { mesh: o, src: geo, pos: Float32Array.from(geo.attributes.position.array) });
      }
      const g2 = o.geometry;
      const pa = g2.attributes.position;
      _m.copy(o.matrixWorld).invert();
      let any = false;
      for (let i = 0; i < pa.count; i++) {
        _v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld);
        const d = _v.distanceTo(worldPoint);
        if (d > radius) continue;
        const k = 1 - d / radius;
        // inward: from the hit toward the car's middle, flattened
        _w.copy(_c).sub(worldPoint).setY(0).normalize().multiplyScalar(depth * k * k * (0.8 + 0.4 * this.rng()));
        _v.add(_w).applyMatrix4(_m);
        pa.setXYZ(i, _v.x, _v.y, _v.z);
        any = true;
      }
      if (any) {
        pa.needsUpdate = true;
        g2.computeVertexNormals();
      }
    });
  }

  breakLight(side, amount) {
    const k = side > 0 ? 'R' : 'L';
    this.lights[k] = Math.min(1, this.lights[k] + amount);
    if (this.t.lights) this.t.lights.headDamage = (this.lights.L + this.lights.R) / 2;
    audio.play('scratch_glass', { object: this.t.anchors?.['headlight' + k] || this.t.root, volume: 0.6, rate: 1.5 });
  }

  /** A spider-web crack where the driver looks through the windshield (thin strips on the glass). */
  crack(sev) {
    const t = this.t;
    const pane = t.glass?.panes?.windshield;
    if (!pane?.mesh || this.cracks.length >= 2) return;
    const eye = t.anchors.driverEye.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, -1).transformDirection(t.bodyInner.matrixWorld);
    const rc = new THREE.Raycaster(eye, fwd.clone().add(new THREE.Vector3(-0.15 * this.cracks.length, -0.05, 0)).normalize(), 0.05, 2);
    const hit = rc.intersectObject(pane.mesh, false)[0];
    if (!hit) return;
    const n = hit.face ? hit.face.normal.clone().transformDirection(pane.mesh.matrixWorld) : fwd.clone().negate();
    if (n.dot(fwd) > 0) n.negate(); // toward the cabin
    const u = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
    const v = new THREE.Vector3().crossVectors(u, n).normalize();
    const C = hit.point.clone().addScaledVector(n, 0.0025);
    const pos = [];
    const seg = (a, b, w) => {
      const d = b.clone().sub(a).normalize();
      const s = new THREE.Vector3().crossVectors(d, n).normalize().multiplyScalar(w);
      pos.push(...a.clone().add(s).toArray(), ...a.clone().sub(s).toArray(), ...b.clone().add(s).toArray(), ...a.clone().sub(s).toArray(), ...b.clone().sub(s).toArray(), ...b.clone().add(s).toArray());
    };
    const P = (r, a) => C.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r);
    const arms = 9 + Math.round(sev / 3);
    const ringR = [0.04, 0.09, 0.16];
    const angs = [];
    for (let i = 0; i < arms; i++) {
      const a0 = (i / arms) * Math.PI * 2 + (this.rng() - 0.5) * 0.4;
      angs.push(a0);
      let prev = C.clone(), r = 0, a = a0;
      const len = 0.14 + this.rng() * 0.22 + sev * 0.01;
      while (r < len) {
        r += 0.02 + this.rng() * 0.035;
        a += (this.rng() - 0.5) * 0.18;
        const p = P(r, a);
        seg(prev, p, 0.0012 * (1 - r / len) + 0.0004);
        prev = p;
      }
    }
    for (const rr of ringR) for (let i = 0; i < arms; i++) if (this.rng() < 0.75) seg(P(rr * (0.9 + this.rng() * 0.2), angs[i]), P(rr * (0.9 + this.rng() * 0.2), angs[(i + 1) % arms]), 0.0006);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xe8ecea, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
    mesh.name = 'windshieldCrack';
    mesh.renderOrder = 6;
    pane.mesh.add(mesh);
    mesh.applyMatrix4(new THREE.Matrix4().copy(pane.mesh.matrixWorld).invert());
    this.cracks.push(mesh);
    audio.play('scratch_glass', { position: hit.point, volume: 0.9, rate: 1.8 });
  }

  hangBumper(front, side) {
    if (this.bumper) return;
    let node = null;
    (this.t.ext?.shell || this.t.bodyInner).traverse((o) => {
      if (!node && /bumper/i.test(o.name) && /front|_f\b|fr/i.test(o.name) === front) node = o;
    });
    if (!node) return;
    this.bumper = { node, rot: node.rotation.clone(), pos: node.position.clone() };
    node.rotation.z += side * 0.12;
    node.rotation.x += front ? 0.18 : -0.18;
    node.position.y -= 0.06;
    audio.play('collision_thud', { object: node, volume: 0.5, rate: 0.6, delay: 0.25 });
  }

  smoke() {
    const hood = this.t.anchors?.hood;
    if (!hood) return;
    try {
      if (!this.steam) this.steam = particles.emit('smoke', { object: hood, count: 40, intensity: 0, radius: 0.25 });
      this.steam.setIntensity?.(Math.min(1, (this.level - 0.2) * 1.4));
    } catch (e) {
      this.steam = null;
    }
  }

  /** A new night: Ah Kong has hammered it all straight again. */
  repair() {
    for (const { mesh, src } of this.orig.values()) {
      mesh.geometry.dispose();
      mesh.geometry = src;
    }
    this.orig.clear();
    for (const c of this.cracks.splice(0)) {
      c.removeFromParent();
      c.geometry.dispose();
      c.material.dispose();
    }
    if (this.bumper) {
      this.bumper.node.rotation.copy(this.bumper.rot);
      this.bumper.node.position.copy(this.bumper.pos);
      this.bumper = null;
    }
    this.steam?.dispose?.();
    this.steam = null;
    this.lights.L = this.lights.R = 0;
    if (this.t.lights) this.t.lights.headDamage = 0;
    this.level = 0;
    this.pull = 0;
  }
}
