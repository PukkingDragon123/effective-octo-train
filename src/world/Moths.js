// Moths at the lamps: real-photo moth sprites (CC0 Wikimedia Commons specimen photos, cut out:
// public/assets/props/moths/moth_atlas.png, credits in docs/credits/textures.md) circling the
// nearest lit lamps on erratic orbits, darting into the bulb and bouncing off, wings fluttering
// (fast scale flip), each throwing a tiny soft shadow on the ground away from the lamp.
// Two instanced draw calls for the moths + one for the shadows, whatever the lamp count.
import * as THREE from 'three';
import { engine } from '../core/Engine.js';

const MAX_LAMPS = 6, PER_LAMP = 9, CAP = MAX_LAMPS * PER_LAMP;
const LAMP_RANGE = 45; // only lamps this close to the camera get moths (m)
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion();
const _qr = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1), _down = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const _l = new THREE.Vector3();

function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(0,0,0,0.9)');
  grd.addColorStop(0.5, 'rgba(0,0,0,0.45)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Moths {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'moths';
    this.lamps = []; // active lamp anchors
    this.extra = []; // lamp anchors added by game code (addLamp)
    this._t = 0;
    this._scan = 0;
    this.enabled = true;
    // per-moth state
    this.st = Array.from({ length: CAP }, (_, i) => ({
      ang: (i * 2.39996) % (Math.PI * 2), dir: i % 3 ? 1 : -1, r0: 0.25 + ((i * 0.618) % 1) * 0.55,
      h: ((i * 0.377) % 1) * 0.7 - 0.25, sp: 1.6 + ((i * 0.733) % 1) * 2.4, ph: i * 1.7, bump: 1 + ((i * 0.51) % 1) * 4,
      dart: 0, var: i % 2, size: 0.04 + ((i * 0.291) % 1) * 0.03,
    }));
    const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || './';
    const tex = new THREE.TextureLoader().load(base + 'assets/props/moths/moth_atlas.png');
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, color: 0xc8b8a0, fog: true, name: 'moths' });
    this.meshes = [0, 1].map((v) => {
      const geo = new THREE.PlaneGeometry(1, 1);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5 + v * 0.5);
      const m = new THREE.InstancedMesh(geo, mat, CAP);
      m.count = 0;
      m.frustumCulled = false;
      m.name = 'mothSprites' + v;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
      return m;
    });
    this.shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: softDot(), transparent: true, depthWrite: false, opacity: 0.32, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true, name: 'mothShadows' }), CAP);
    this.shadows.count = 0;
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 2;
    this.shadows.name = 'mothShadows';
    this.group.add(this.shadows);
  }

  /** Lit lamps (main lamp anchors of placed props that still have a light). */
  /** Add a lamp anchor that isn't a placed prop (e.g. the garage tube set up by game code). */
  addLamp(anchor) {
    if (anchor && !this.extra.includes(anchor)) this.extra.push(anchor);
  }

  _candidates() {
    const out = [...this.extra];
    for (const r of this.world.placement?.results || []) {
      if (r.lampAnchor && r.lights && r.lights.length) out.push(r.lampAnchor);
    }
    return out;
  }

  update(dt, focus, camera) {
    if (!this.enabled || !focus) return;
    this._t += dt;
    this._scan -= dt;
    if (this._scan <= 0) {
      this._scan = 0.5;
      const near = [];
      for (const a of this._candidates()) {
        if (!a.parent) continue;
        a.getWorldPosition(_l);
        const d = _l.distanceTo(focus);
        if (d < LAMP_RANGE) near.push([d, a]);
      }
      near.sort((x, y) => x[0] - y[0]);
      this.lamps = near.slice(0, MAX_LAMPS).map((x) => x[1]);
    }
    const counts = [0, 0];
    let ns = 0;
    const cam = camera || engine.camera;
    const cq = cam ? cam.quaternion : _q.identity();
    for (let li = 0; li < this.lamps.length; li++) {
      const L = this.lamps[li].getWorldPosition(_l);
      const gy = this.world.getHeight(L.x, L.z);
      for (let k = 0; k < PER_LAMP; k++) {
        const s = this.st[li * PER_LAMP + k];
        // erratic orbit; every few seconds a dart into the bulb and a bounce off it
        s.bump -= dt;
        if (s.bump <= 0) {
          s.dart = 1;
          s.bump = 1.5 + Math.random() * 4;
        }
        s.dart = Math.max(0, s.dart - dt * 3.2);
        const pull = Math.sin(Math.min(1, s.dart) * Math.PI); // 0 -> 1 -> 0 over ~0.3 s
        s.ang += s.dir * s.sp * dt * (1 + 0.6 * Math.sin(this._t * 3.1 + s.ph));
        const r = s.r0 * (1 + 0.35 * Math.sin(this._t * 2.3 + s.ph * 1.3)) * (1 - 0.88 * pull);
        const x = L.x + Math.cos(s.ang) * r + Math.sin(this._t * 17 + s.ph) * 0.03;
        const y = L.y + s.h * (1 - pull) + Math.sin(this._t * 5.7 + s.ph) * 0.12 + Math.sin(this._t * 23 + s.ph * 2) * 0.02;
        const z = L.z + Math.sin(s.ang) * r + Math.cos(this._t * 15 + s.ph) * 0.03;
        // fast wing flutter: the sprite flips its width (wings up / down), banking into the turn
        s.ph += dt * (30 + 6 * Math.sin(s.ph));
        const flap = 0.2 + 0.8 * Math.abs(Math.sin(s.ph));
        _qr.setFromAxisAngle(_z, Math.sin(this._t * 4 + s.ph * 0.2) * 0.7 + s.ang * 0.15);
        _q.copy(cq).multiply(_qr);
        _p.set(x, y, z);
        _s.set(s.size * flap * (s.var ? 0.9 : 1.25), s.size * (s.var ? 0.9 : 1.25) * 0.75, 1);
        _m.compose(_p, _q, _s);
        const mesh = this.meshes[s.var];
        mesh.setMatrixAt(counts[s.var]++, _m);
        // tiny shadow cast away from the lamp onto the ground
        const dy = L.y - y;
        if (dy > 0.05 && L.y - gy > 0.5) {
          const t = (L.y - gy) / dy;
          if (t < 25) {
            _p.set(L.x + (x - L.x) * t, gy + 0.03, L.z + (z - L.z) * t);
            const sz = s.size * Math.min(6, t) * 1.2;
            _s.set(sz * flap, sz * 0.8, 1);
            _m.compose(_p, _down, _s);
            this.shadows.setMatrixAt(ns++, _m);
          }
        }
      }
    }
    this.meshes.forEach((m, i) => {
      m.count = counts[i];
      m.visible = counts[i] > 0;
      if (counts[i]) m.instanceMatrix.needsUpdate = true;
    });
    this.shadows.count = ns;
    this.shadows.visible = ns > 0;
    if (ns) this.shadows.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.group.traverse((o) => o.geometry?.dispose?.());
  }
}
