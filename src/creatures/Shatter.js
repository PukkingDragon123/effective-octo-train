// Breaking taxi glass. A PaneBreak lives on one pane (fl fr rl rr rear) and does it for real:
//   crackAt(uv)  an impact: a crushed white star, then radial cracks racing out with concentric
//                spider-web rings (drawn into a crack map on the pane's own mask uvs, so it follows
//                the window's exact shape; the cracks catch the headlights and the cabin light)
//   burst()      the tempered pane gives: the glass disappears from the frame except a jagged rim
//                of cracked fragments, and ~400 small irregular glass nuggets fly in with gravity,
//                bounce off the seats, the dash and the floor (body space, they ride with the car),
//                tinkle and settle where they land for the rest of the night
//   smear()      blood dragged across the jagged rim (gore-aware)
//   afterwards   wind (and rain, when it rains) comes in through the hole
//   repair()     the next night: the glass is whole again (repairAllPanes(taxi) on a new night)
//   const b = breakPane(taxi, 'rr'); await b.crackAt({x:0.4,y:0.5}); b.burst({ from: worldPoint })
import * as THREE from 'three';
import { audio } from '../audio/index.js';
import { paintedMaterial, particles, GLOBAL_UNIFORMS } from '../render/index.js';
import { settings } from '../core/Settings.js';
import { Entity, rand, clamp, animate, TAU } from './util.js';
import { paneFrame, dirToBody, toBody } from './taxiGeo.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
const REGISTRY = new WeakMap(); // taxi -> Map(paneId -> PaneBreak)
let NUGGET = null;

/** An irregular tempered-glass nugget: a jittered, squashed icosahedron, flat-shaded facets. */
function nuggetGeometry() {
  if (NUGGET) return NUGGET;
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  const p = g.attributes.position;
  const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
  const jit = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = key(p.getX(i), p.getY(i), p.getZ(i));
    if (!jit.has(k)) jit.set(k, [0.75 + Math.random() * 0.5, 0.75 + Math.random() * 0.5, 0.75 + Math.random() * 0.5]);
    const j = jit.get(k);
    p.setXYZ(i, p.getX(i) * j[0] * 1.15, p.getY(i) * j[1] * 0.55, p.getZ(i) * j[2]);
  }
  g.computeVertexNormals();
  g.userData.shared = true;
  NUGGET = g;
  return g;
}

/** Rough cabin collision in taxi body space: the height things land on at (x, z). */
function cabinFloor(x, z) {
  const ax = Math.abs(x);
  if (z < -0.62) return z < -0.95 ? 0.32 : 0.92 + (z + 0.62) * 0.25; // dash top, footwell under it
  if (z > -0.05 && z < 0.55 && ax > 0.1 && ax < 0.68) return 0.52; // front seat cushions
  if (z > 0.72 && z < 1.32 && ax < 0.72) return 0.5; // rear bench
  if (z >= 1.32) return 0.93; // parcel shelf
  return 0.24; // floor
}

export class PaneBreak extends Entity {
  constructor(taxi, id) {
    super('paneBreak:' + id);
    this.taxi = taxi;
    this.id = id;
    this.pane = taxi.glass?.panes?.[id] || null;
    this.state = 'whole';
    this.impacts = [];
    // crack map (pane mask uv space; canvas y = 1 - v)
    const S = 512;
    this.size = S;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = S;
    this.g = this.canvas.getContext('2d');
    this.cracks = document.createElement('canvas'); // accumulated crack lines (white on transparent)
    this.cracks.width = this.cracks.height = S;
    this.cg = this.cracks.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.channel = 1; // the pane's mask uvs (uv1)
    this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.anisotropy = 8;
    this._compose();
    this.mat = paintedMaterial({
      color: 0xe4eee8, map: this.tex, alphaMap: this.tex, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      roughness: 0.05, metalness: 0.0, envReflect: 2, emissive: 0x0b0f0d, brush: 0, puddles: 0, wet: 0.3,
    });
    this.mat.polygonOffset = true;
    this.mat.polygonOffsetFactor = -1;
    this.mat.polygonOffsetUnits = -4;
    this.overlay = null;
    if (this.pane?.mesh) {
      this.overlay = new THREE.Mesh(this.pane.mesh.geometry, this.mat);
      this.overlay.name = 'paneCracks_' + id;
      this.overlay.renderOrder = 6;
      this.overlay.frustumCulled = false;
      this.pane.mesh.parent.add(this.overlay);
      this._follow();
    }
    this.shards = null;
    this.wind = null;
    this.drips = null;
    this._tink = 0;
    this._keep = new Set([nuggetGeometry()]);
  }

  _follow() {
    const m = this.pane.mesh;
    this.overlay.position.copy(m.position);
    this.overlay.quaternion.copy(m.quaternion);
    this.overlay.scale.copy(m.scale);
  }

  // ---------------------------------------------------------------- crack map
  _compose() {
    const g = this.g, S = this.size;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    if (this.state === 'broken') {
      // the jagged rim of fragments still in the frame (dim = glassy, alpha from the alpha map)
      g.save();
      g.fillStyle = 'rgb(92,96,94)';
      g.fillRect(0, 0, S, S);
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = '#000';
      g.beginPath();
      this.hole.forEach(([x, y], i) => (i ? g.lineTo(x * S, y * S) : g.moveTo(x * S, y * S)));
      g.closePath();
      g.fill();
      g.restore();
      // the cracks only where glass is left
      g.save();
      g.beginPath();
      g.rect(0, 0, S, S);
      this.hole.forEach(([x, y], i) => (i ? g.lineTo(x * S, y * S) : g.moveTo(x * S, y * S)));
      g.closePath();
      g.clip('evenodd');
      g.drawImage(this.cracks, 0, 0);
      if (this.bloodCanvas) g.drawImage(this.bloodCanvas, 0, 0);
      g.restore();
    } else g.drawImage(this.cracks, 0, 0);
    this.tex.needsUpdate = true;
  }

  /** Add an impact at mask uv {x, y} (0..1). opts { strength 0..1, rays, grow (s) }. Resolves when grown. */
  async crackAt(uv, opts = {}) {
    if (this.state === 'broken' || !this.overlay) return;
    const S = this.size;
    const cx = (uv.x ?? 0.5) * S, cy = (1 - (uv.y ?? 0.5)) * S;
    const strength = opts.strength ?? 0.7;
    const n = opts.rays ?? Math.round(9 + strength * 7);
    const rays = [];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU + rand(-0.18, 0.18);
      const len = S * (0.12 + strength * rand(0.25, 0.55));
      const pts = [[cx, cy]];
      let a = a0, x = cx, y = cy;
      const steps = 10 + ((Math.random() * 6) | 0);
      for (let k = 1; k <= steps; k++) {
        a += rand(-0.22, 0.22);
        x += (Math.cos(a) * len) / steps;
        y += (Math.sin(a) * len) / steps;
        pts.push([x, y]);
        // side branches
        if (Math.random() < 0.18 * strength) rays.push({ pts: [[x, y], [x + Math.cos(a + rand(-1, 1)) * len * 0.12, y + Math.sin(a + rand(-1, 1)) * len * 0.12]], w: 0.8, branch: true });
      }
      rays.push({ pts, w: rand(1.0, 1.9) });
    }
    this.impacts.push({ cx, cy, rays, strength });
    this.state = 'cracked';
    audio.play('bone_crack', { object: this.overlay, volume: 0.55 + strength * 0.4, rate: rand(1.6, 2.1) });
    audio.play('scratch_glass', { object: this.overlay, volume: 0.6, rate: rand(1.8, 2.4) });
    const cg = this.cg;
    const grow = opts.grow ?? 0.32;
    let drawn = 0;
    await animate(grow, (k) => {
      // crushed white star at the impact
      cg.fillStyle = 'rgba(255,255,255,0.9)';
      cg.beginPath();
      cg.arc(cx, cy, 3 + strength * 6 * k, 0, TAU);
      cg.fill();
      cg.strokeStyle = 'rgba(255,255,255,0.95)';
      cg.lineCap = 'round';
      for (const r of rays) {
        const m = Math.floor((r.pts.length - 1) * k);
        cg.lineWidth = r.w;
        cg.beginPath();
        cg.moveTo(r.pts[0][0], r.pts[0][1]);
        for (let i = 1; i <= m; i++) cg.lineTo(r.pts[i][0], r.pts[i][1]);
        cg.stroke();
      }
      // concentric spider-web rings once the rays are out
      if (k > 0.55) {
        const rk = (k - 0.55) / 0.45;
        cg.lineWidth = 0.9;
        for (const ring of [0.22, 0.42, 0.66]) {
          if (rk < ring) continue;
          cg.beginPath();
          const main = rays.filter((r) => !r.branch);
          main.forEach((r, i) => {
            const p = r.pts[Math.floor((r.pts.length - 1) * ring * 0.9)];
            if (!p) return;
            const jx = p[0] + rand(-2, 2), jy = p[1] + rand(-2, 2);
            if (i === 0) cg.moveTo(jx, jy);
            else cg.lineTo(jx, jy);
          });
          cg.closePath();
          cg.stroke();
        }
      }
      if (k - drawn > 0.08) {
        drawn = k;
        if (Math.random() < 0.6) audio.play('spark', { object: this.overlay, volume: 0.18, rate: rand(1.8, 2.6) });
      }
      this._compose();
    });
  }

  /**
   * The pane bursts inward. opts { from: world point of the blow (default the last impact), speed,
   * count, shards=true }. The pane mesh hides; a jagged cracked rim stays in the frame.
   */
  burst(opts = {}) {
    if (this.state === 'broken' || !this.pane) return;
    const t = this.taxi;
    this.state = 'broken';
    // jagged hole: most of the pane, deep teeth near where it was hit
    const imp = this.impacts[this.impacts.length - 1] || { cx: this.size / 2, cy: this.size / 2 };
    const icx = imp.cx / this.size, icy = imp.cy / this.size;
    const hole = [];
    const N = 46;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const c = Math.cos(a), s = Math.sin(a);
      // distance to the unit square border from the impact along (c, s)
      const tx = c > 0 ? (1 - icx) / c : c < 0 ? -icx / c : Infinity;
      const ty = s > 0 ? (1 - icy) / s : s < 0 ? -icy / s : Infinity;
      const edge = Math.min(tx, ty);
      const inset = 0.035 + Math.random() * 0.07 + (Math.random() < 0.22 ? rand(0.08, 0.2) : 0);
      const r = Math.max(0.05, edge - inset);
      hole.push([icx + c * r, icy + s * r]);
    }
    this.hole = hole;
    this.pane.mesh.visible = false;
    this._compose();
    // sound: a layered tempered-glass burst
    const at = this.overlay;
    audio.play('collision_thud', { object: at, volume: 1, rate: 1.35 });
    audio.play('scare_hit', { object: at, volume: 0.9, rate: 1.2 });
    audio.play('coins', { object: at, volume: 1, rate: 1.8 });
    audio.play('coins', { object: at, volume: 0.8, rate: 2.4, delay: 0.05 });
    audio.play('wind_chime', { object: at, volume: 0.45, rate: 2.6 });
    audio.play('scratch_glass', { object: at, volume: 0.9, rate: 2.8 });
    if (opts.shards !== false) this._spawnShards(opts);
    this._weather();
  }

  _spawnShards(opts) {
    const t = this.taxi;
    const f = paneFrame(t, this.id);
    const body = t.bodyInner || t.root;
    const N = dirToBody(t, f.normal, new THREE.Vector3()).normalize(); // outward
    const U = dirToBody(t, f.up, new THREE.Vector3()).normalize();
    const R = dirToBody(t, f.right, new THREE.Vector3()).normalize();
    const C = toBody(t, f.center, new THREE.Vector3());
    const count = opts.count ?? 420;
    const mat = paintedMaterial({ color: 0xcfe6dc, roughness: 0.04, metalness: 0.05, transparent: true, opacity: 0.82, envReflect: 2.5, emissive: 0x0a0e0c, brush: 0, puddles: 0, wet: 0.4 });
    const mesh = new THREE.InstancedMesh(nuggetGeometry(), mat, count);
    mesh.frustumCulled = false;
    mesh.name = 'glassNuggets_' + this.id;
    body.add(mesh);
    const P = [];
    const sp = opts.speed ?? 3.2;
    for (let i = 0; i < count; i++) {
      const u = rand(-0.5, 0.5) * f.w * 0.92, v = rand(-0.5, 0.5) * f.h * 0.92;
      const p = C.clone().addScaledVector(R, u).addScaledVector(U, v).addScaledVector(N, -0.01);
      const vel = N.clone().multiplyScalar(-sp * rand(0.35, 1.2)).addScaledVector(R, rand(-1, 1) * 0.9).addScaledVector(U, rand(-0.6, 1.1));
      P.push({ p, v: vel, r: new THREE.Euler(rand(0, TAU), rand(0, TAU), rand(0, TAU)), w: new THREE.Vector3(rand(-20, 20), rand(-20, 20), rand(-20, 20)), s: rand(0.006, 0.013) * (Math.random() < 0.07 ? 2.2 : 1), sleep: false, delay: rand(0, 0.06) });
    }
    this.shards = { mesh, mat, P };
    this._writeShards(0);
  }

  _writeShards(dt) {
    const S = this.shards;
    if (!S) return;
    let awake = 0;
    for (let i = 0; i < S.P.length; i++) {
      const s = S.P[i];
      if (!s.sleep && dt > 0) {
        if (s.delay > 0) s.delay -= dt;
        else {
          s.v.y -= 9.8 * dt;
          s.p.addScaledVector(s.v, dt);
          s.r.x += s.w.x * dt;
          s.r.y += s.w.y * dt;
          s.r.z += s.w.z * dt;
          // cabin side walls
          if (Math.abs(s.p.x) > 0.8 && Math.sign(s.v.x) === Math.sign(s.p.x) && s.p.y > 0.25) {
            s.p.x = Math.sign(s.p.x) * 0.8;
            s.v.x *= -0.35;
          }
          if (s.p.y > 1.36) {
            s.p.y = 1.36;
            s.v.y *= -0.2;
          }
          const fy = cabinFloor(s.p.x, s.p.z) + s.s * 0.4;
          if (s.p.y < fy) {
            s.p.y = fy;
            const hit = -s.v.y;
            s.v.y = hit * 0.28;
            s.v.x *= 0.55;
            s.v.z *= 0.55;
            s.w.multiplyScalar(0.5);
            if (hit > 1.2 && this._tink < 14) {
              this._tink++;
              audio.play('coins', { object: this.taxi.bodyInner || this.taxi.root, offset3: [s.p.x, s.p.y, s.p.z], volume: clamp(hit * 0.05, 0.03, 0.16), rate: rand(1.7, 2.6) });
            }
            if (s.v.lengthSq() < 0.02) {
              s.sleep = true;
              s.r.x = Math.round(s.r.x / (Math.PI / 2)) * (Math.PI / 2) + rand(-0.2, 0.2);
              s.r.z = Math.round(s.r.z / (Math.PI / 2)) * (Math.PI / 2) + rand(-0.2, 0.2);
            }
          }
          awake++;
        }
      }
      _q.setFromEuler(_e.set(s.r.x, s.r.y, s.r.z));
      _m.compose(s.p, _q, _s.setScalar(s.s));
      S.mesh.setMatrixAt(i, _m);
    }
    S.mesh.instanceMatrix.needsUpdate = true;
    S.awake = awake;
  }

  /** Blood dragged across the jagged rim (the arm pulled back out over the glass). */
  smear(uv = { x: 0.5, y: 0.5 }) {
    const reduced = settings.get('gore') === 'reduced';
    if (!this.bloodCanvas) {
      this.bloodCanvas = document.createElement('canvas');
      this.bloodCanvas.width = this.bloodCanvas.height = this.size;
    }
    const g = this.bloodCanvas.getContext('2d');
    const S = this.size;
    const x = uv.x * S, y = (1 - uv.y) * S;
    g.strokeStyle = reduced ? 'rgba(70,20,20,0.7)' : 'rgba(150,20,18,0.9)';
    g.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      g.lineWidth = rand(3, 9);
      g.beginPath();
      g.moveTo(x + rand(-30, 30), y + rand(-20, 20));
      g.quadraticCurveTo(x + rand(-80, 80), y + rand(20, 80), x + rand(-120, 120), y + rand(60, 160));
      g.stroke();
    }
    this._compose();
  }

  _weather() {
    // wind (and rain, when it rains) comes in through the hole
    this.wind = audio.loop('amb_wind_trees', { object: this.overlay, volume: 0.35 });
    this.anchor = new THREE.Object3D();
    const f = paneFrame(this.taxi, this.id);
    this.anchor.position.copy(toBody(this.taxi, f.center.clone().addScaledVector(f.up, f.h * 0.45), new THREE.Vector3()));
    (this.taxi.bodyInner || this.taxi.root).add(this.anchor);
    try {
      this.drips = particles.emit('drips', { object: this.anchor, radius: Math.max(0.15, f.w * 0.4), height: 0.9, intensity: 0 });
    } catch (e) {
      this.drips = null;
    }
  }

  step(dt) {
    if (this.overlay && this.state !== 'broken' && this.pane?.mesh) this._follow();
    this._tink = Math.max(0, this._tink - dt * 20);
    if (this.shards && this.shards.awake !== 0) this._writeShards(dt);
    if (this.drips) this.drips.setIntensity((GLOBAL_UNIFORMS.uRain?.value ?? 0) > 0.12 ? 1 : 0);
    // the wind rises and falls with the car's speed
    if (this.wind) this.wind.setVolume(0.15 + clamp((this.taxi.speedKmh || 0) / 80, 0, 1) * 0.5, 0.3);
  }

  /** Whole again (a new night). */
  repair() {
    if (this.pane?.mesh) this.pane.mesh.visible = true;
    this.wind?.stop(0.5);
    this.drips?.dispose();
    this.anchor?.removeFromParent();
    if (this.shards) {
      this.shards.mesh.removeFromParent();
      this.shards.mat.dispose();
      this.shards = null;
    }
    this.overlay?.removeFromParent();
    this.mat.dispose();
    this.tex.dispose();
    const reg = REGISTRY.get(this.taxi);
    if (reg?.get(this.id) === this) reg.delete(this.id);
    this.dispose();
  }
}

/** The PaneBreak for a taxi pane (created on first use). */
export function breakPane(taxi, id) {
  let reg = REGISTRY.get(taxi);
  if (!reg) REGISTRY.set(taxi, (reg = new Map()));
  let b = reg.get(id);
  if (!b || b.disposed) reg.set(id, (b = new PaneBreak(taxi, id)));
  return b;
}
/** Is a pane broken right now? */
export function isPaneBroken(taxi, id) {
  return REGISTRY.get(taxi)?.get(id)?.state === 'broken';
}
/** Repair every broken / cracked pane of a taxi (new night). */
export function repairAllPanes(taxi) {
  const reg = taxi && REGISTRY.get(taxi);
  if (!reg) return;
  for (const b of [...reg.values()]) b.repair();
  reg.clear();
}
