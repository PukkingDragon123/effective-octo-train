// Blood & gore for the horror beats (settings.gore = 'full' | 'reduced': reduced blood is
// darker, sparser and less saturated).
//   Glass (per-pane RGBA canvas sampled by the glass shader): blood_handprint, blood_smear,
//   blood_drip (creeps down from the top edge over time), blood_splatter; the windshield
//   wipers drag it into streaky smears instead of cleaning it.
//   Interior: setInteriorBlood(seat, amount) seeps a stain into a seat / floor mat (decal
//   projected on whatever mesh is there, procedural or GLB); bleedRoof(amount) swells drops
//   under the headliner seam that fall and splat on the dash.
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { paintedMaterial, paintBloodDecal, bloodDecalImage, whenBloodDecalsReady } from '../render/index.js';
import { settings } from '../core/Settings.js';
import { makeRng, clamp, lerp, smoothstep, noise } from '../core/math.js';
import { makeCanvas, toTexture } from './VehicleTextures.js';

const reduced = () => settings.get('gore') === 'reduced';
/** Blood palette: [core, body, edge, highlight] css colours for the current gore level. */
function palette() {
  return reduced()
    ? { core: [34, 10, 10], body: [52, 16, 15], edge: [66, 26, 22], hi: [96, 54, 48], alpha: 0.8, density: 0.45 }
    : { core: [46, 2, 5], body: [86, 4, 10], edge: [118, 10, 16], hi: [168, 74, 66], alpha: 1, density: 1 };
}
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// ---------------------------------------------------------------------------
// glass painting
// ---------------------------------------------------------------------------
/**
 * Palm + four fingers + thumb as one path: every finger is a rounded capsule that starts
 * inside the palm (no floating 'paw' pads). Fingers point to -y.
 */
export function handPath(g, x, y, s, rot, spread = 1) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.beginPath();
  g.ellipse(0, s * 0.22, s * 0.36, s * 0.42, 0, 0, Math.PI * 2);
  // [base x, base y, length, half width, angle]
  const F = [[-0.25, -0.08, 0.5, 0.078, -0.2], [-0.085, -0.13, 0.62, 0.082, -0.06], [0.075, -0.13, 0.66, 0.082, 0.05], [0.225, -0.08, 0.55, 0.076, 0.17], [0.3, 0.3, 0.46, 0.09, 1.05]];
  for (const [bx, by, len, hw, a0] of F) {
    const a = a0 * spread;
    const dx = Math.sin(a), dy = -Math.cos(a);
    const L = len * s, half = L / 2 + s * 0.06;
    const cx = bx * s + dx * (L / 2 - s * 0.06), cy = by * s + dy * (L / 2 - s * 0.06);
    g.moveTo(cx + Math.cos(a) * hw * s, cy + Math.sin(a) * hw * s);
    g.ellipse(cx, cy, hw * s, half, a, 0, Math.PI * 2);
  }
  g.restore();
}

/**
 * Paint a blood mark on a pane from the CC0 photo decals (render/BloodDecals.js; owner rule:
 * no blood is drawn in code). kind 'blood_handprint'|'blood_smear'|'blood_drip'|'blood_splatter'.
 * uv in pane mask space (0..1, v up). opts {size, angle, drag, path:[{x,y}...] (smear, uv),
 * drips, seed}. Marks requested before the decal images loaded are painted once they have.
 */
export function paintGlassBlood(pane, kind, uv, opts = {}) {
  if (!bloodDecalImage('handprint', 0)) {
    whenBloodDecalsReady().then(() => paintGlassBlood(pane, kind, uv, opts));
    return;
  }
  const B = pane.ensureBlood();
  const g = B.g, W = B.canvas.width, H = B.canvas.height;
  const P = palette();
  const rng = makeRng(opts.seed ?? ((Math.random() * 1e9) | 0));
  const x = (uv.x ?? uv[0]) * W, y = (1 - (uv.y ?? uv[1])) * H;
  const s = (opts.size ?? 1) * W * (pane.id === 'windshield' ? 0.07 : 0.12);
  const k = W / 640;
  const drip = (dx, dy, len = 1) => B.drips.push(newDrip(dx, dy, rng, len * k));
  const a = P.alpha;
  if (kind === 'blood_handprint') {
    const rot = opts.angle ?? rng.range(-0.35, 0.35);
    const sz = s * 2.7;
    if (opts.drag) {
      // the hand slid down: the dragged print (variant 1) stretched below the clean one
      paintBloodDecal(g, 'handprint', x, y + sz * 0.35, sz * 1.02, sz * 1.5, rot, { variant: 1, alpha: 0.8 * a });
    }
    paintBloodDecal(g, 'handprint', x, y, sz, sz, rot, { variant: opts.drag ? 1 : 0, alpha: a });
    const nd = Math.round((opts.drips ?? 3) * P.density);
    for (let i = 0; i < nd; i++) drip(x + rng.range(-sz * 0.3, sz * 0.3), y + sz * rng.range(0.15, 0.4), rng.range(0.5, 1));
  } else if (kind === 'blood_smear') {
    const u0 = uv.x ?? uv[0], v0 = uv.y ?? uv[1];
    const pts = (opts.path || [{ x: u0, y: v0 }, { x: u0 + 0.18 * Math.cos(opts.angle ?? -0.3), y: v0 + 0.18 * Math.sin(opts.angle ?? -0.3) }]).map((p) => [p.x * W, (1 - p.y) * H]);
    const variant = rng.int(0, 1);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const len = Math.hypot(bx - ax, by - ay);
      paintBloodDecal(g, 'smear', (ax + bx) / 2, (ay + by) / 2, len * 1.25 + s * 0.6, s * 1.1, Math.atan2(by - ay, bx - ax), { variant, alpha: a });
    }
    const nd = Math.round((opts.drips ?? 2) * P.density);
    for (let i = 0; i < nd; i++) drip(pts[0][0] + rng.range(-s * 0.3, s * 0.3), pts[0][1] + s * 0.15, 0.7);
  } else if (kind === 'blood_drip') {
    // runs creeping down from the top edge (or from uv)
    const n = Math.max(1, Math.round((opts.count ?? 3) * P.density));
    for (let i = 0; i < n; i++) drip(x + (i - (n - 1) / 2) * s * rng.range(0.25, 0.5), opts.fromTop === false ? y : 0, (opts.speed ?? 1) * rng.range(0.7, 1.3));
  } else if (kind === 'blood_splatter') {
    paintBloodDecal(g, 'spatter', x, y, s * 3.2, s * 3.2, opts.angle ?? rng() * Math.PI * 2, { variant: rng.int(0, 2), alpha: a });
    const nd = Math.round((opts.drips ?? 4) * P.density);
    for (let i = 0; i < nd; i++) drip(x + rng.range(-s * 0.5, s * 0.5), y + rng.range(0, s * 0.4), rng.range(0.6, 1.2));
  }
  B.tex.needsUpdate = true;
  pane.uniforms.uBloodOn.value = 1;
}

/** A running drip: one run of a photo drip decal, revealed downward with gravity. */
function newDrip(x, y, rng, len = 1) {
  const variant = rng.int(0, 2);
  const img = bloodDecalImage('drip', variant);
  // one run = a narrow column of the decal (it holds ~8 runs side by side)
  const cols = 8;
  const col = rng.int(0, cols - 1);
  const w = 18 * len, h = 150 * len * rng.range(0.6, 1.2);
  return { x, y, img, sx: (col / cols) * (img?.naturalWidth || 256), sw: (img?.naturalWidth || 256) / cols, w, h, shown: 0, v: rng.range(16, 32) * len, life: rng() * 6 };
}

/** Advance running drips on a pane: each reveals more of its photo run (stick-slip creep). */
export function updateGlassDrips(pane, dt) {
  const B = pane.blood;
  if (!B || !B.drips.length) return;
  const g = B.g;
  for (let i = B.drips.length - 1; i >= 0; i--) {
    const d = B.drips[i];
    d.life += dt;
    const surge = 0.35 + 0.65 * Math.max(0, Math.sin(d.life * 1.7 + d.x));
    const dy = Math.min(d.h - d.shown, d.v * surge * dt);
    if (dy > 0 && d.img) {
      const ih = d.img.naturalHeight;
      const s0 = (d.shown / d.h) * ih, s1 = ((d.shown + dy) / d.h) * ih;
      g.drawImage(d.img, d.sx, s0, d.sw, Math.max(1, s1 - s0), d.x - d.w / 2, d.y + d.shown, d.w, dy);
      d.shown += dy;
      d.v *= Math.exp(-dt * 0.06);
    }
    if (d.shown >= d.h - 0.01 || !d.img) B.drips.splice(i, 1);
  }
  B.tex.needsUpdate = true;
}

/**
 * Wiper blade dragging blood (windshield): the sector [phi0, phi1] around the pivot gets
 * smeared along the sweep, thinned, and left with streaks. Mask-space units as in
 * GlassSystem._sweepWipers (asp = mask aspect).
 */
export function smearGlassBlood(pane, pivot, phi0, phi1, r0, r1, asp, dir) {
  const B = pane.blood;
  if (!B || !B.any) return;
  const g = B.g, W = B.canvas.width, H = B.canvas.height;
  const P = palette();
  const toC = (phi, r) => [(pivot[0] - r * Math.cos(phi)) * W, (1 - (pivot[1] + r * Math.sin(phi) * asp)) * H];
  const sector = () => {
    g.beginPath();
    const n = 10;
    for (let k = 0; k <= n; k++) {
      const [px, py] = toC(lerp(phi0, phi1, k / n), r0);
      if (k === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    for (let k = n; k >= 0; k--) {
      const [px, py] = toC(lerp(phi0, phi1, k / n), r1);
      g.lineTo(px, py);
    }
    g.closePath();
  };
  if (!B.tmp) {
    B.tmp = makeCanvas(W, H);
    B.tg = B.tmp.getContext('2d');
  }
  B.tg.clearRect(0, 0, W, H);
  B.tg.drawImage(B.canvas, 0, 0);
  const [cx, cy] = toC(0, 0);
  const d = (phi1 - phi0) * (dir >= 0 ? 1 : -1);
  g.save();
  sector();
  g.clip();
  // the blade pushes it: drag copies along the sweep (motion smear)
  for (let k = 1; k <= 4; k++) {
    g.globalAlpha = 0.2;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.translate(cx, cy);
    g.rotate((d * k) / 4);
    g.translate(-cx, -cy);
    g.drawImage(B.tmp, 0, 0);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  // the rubber lifts some, leaving thin concentric streaks
  g.globalCompositeOperation = 'destination-out';
  g.globalAlpha = 0.16;
  sector();
  g.fill();
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.restore();
  B.tex.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// interior stains + roof bleed
// ---------------------------------------------------------------------------
const _stainCache = new Map();
/**
 * RGBA stain from the CC0 photo decals (pool / smear): rgb = the photo blood, alpha = its
 * coverage x a seep order (centre first) used with alphaTest so the stain spreads outward.
 */
function stainTexture(kind) {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const tex = toTexture(c);
  const paint = () => {
    const img = kind === 'seam' ? bloodDecalImage('smear', 1) : bloodDecalImage('pool', kind === 'splat' ? 2 : 0);
    if (!img) return false;
    g.clearRect(0, 0, S, S);
    g.drawImage(img, 0, 0, S, S);
    g.globalCompositeOperation = 'destination-in';
    const gr = kind === 'seam' ? g.createLinearGradient(0, S * 0.2, 0, S) : g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.55);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0.04)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'source-over';
    tex.needsUpdate = true;
    return true;
  };
  if (!paint()) whenBloodDecalsReady().then(paint);
  return tex;
}

function stainMaterial(kind) {
  const key = kind + (reduced() ? ':r' : ':f');
  if (!_stainCache.has(key)) _stainCache.set(key, stainTexture(kind));
  const tex = _stainCache.get(key);
  return paintedMaterial({ map: tex, color: 0xffffff, alphaTest: 0.98, roughness: 0.35, metalness: 0.05, brush: 0.2, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, name: 'blood_' + kind });
}

const SEATS = {
  driver: { from: 'driverSeat', off: [0, 0.35, -0.1], size: 0.34 },
  frontPassenger: { from: 'frontPassengerSeat', off: [0, 0.35, -0.1], size: 0.34 },
  rearLeft: { from: 'rearLeftSeat', off: [0, 0.35, -0.08], size: 0.36 },
  rearRight: { from: 'rearRightSeat', off: [0, 0.35, -0.08], size: 0.36 },
  rearCenter: { from: 'rearCenterSeat', off: [0, 0.35, -0.08], size: 0.34 },
  floorFront: { from: 'frontPassengerSeat', off: [0, 0.2, -0.5], size: 0.42, down: 1.0 },
  floorRear: { from: 'rearCenterSeat', off: [0, 0.2, -0.45], size: 0.5, down: 1.0 },
  floorDriver: { from: 'driverSeat', off: [-0.02, 0.2, -0.5], size: 0.36, down: 1.0 },
};

export class TaxiBlood {
  constructor(taxi) {
    this.taxi = taxi;
    this.group = new THREE.Group();
    this.group.name = 'blood';
    taxi.bodyInner.add(this.group);
    this.stains = {};
    this.roof = null;
    this.splats = [];
    this.drops = [];
    this._ray = new THREE.Raycaster();
    this._ray.layers.enableAll();
  }

  /** Cast a ray in body space against the cabin; returns {mesh, point(world), normal(world)} or null. */
  _hit(fromLocal, dirLocal, far = 1.2) {
    const t = this.taxi;
    t.root.updateMatrixWorld(true);
    const o = t.bodyInner.localToWorld(fromLocal.clone());
    const q = t.bodyInner.getWorldQuaternion(new THREE.Quaternion());
    this._ray.set(o, dirLocal.clone().normalize().applyQuaternion(q));
    this._ray.far = far;
    const hit = this._ray.intersectObjects(t.cabinSurfaces(), false).find((h) => h.face);
    if (!hit) return null;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (n.dot(this._ray.ray.direction) > 0) n.negate();
    return { mesh: hit.object, point: hit.point, normal: n };
  }

  /** Project a decal (world-space hit) and bring it into the body group. */
  _decal(hit, size, mat, spin = Math.random() * 6.28) {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.normal);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), spin));
    const e = new THREE.Euler().setFromQuaternion(q);
    let geo;
    try {
      geo = new DecalGeometry(hit.mesh, hit.point, e, size);
    } catch (err) {
      return null;
    }
    if (!geo.attributes.position.count) return null;
    const inv = new THREE.Matrix4().copy(this.taxi.bodyInner.matrixWorld).invert();
    geo.applyMatrix4(inv);
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 2;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  /** A stain seeping into a seat or the floor mat. seat: driver|frontPassenger|rearLeft|rearRight|rearCenter|floorFront|floorRear|floorDriver */
  setInteriorBlood(seat, amount = 1) {
    const spec = SEATS[seat];
    if (!spec) return;
    let st = this.stains[seat];
    if (!st) {
      const base = this.taxi.anchorLocal(spec.from).add(new THREE.Vector3(...spec.off));
      const hit = this._hit(base, new THREE.Vector3(0, -1, 0), spec.down ?? 0.8);
      if (!hit) return;
      const mat = stainMaterial('stain');
      const size = spec.size * (reduced() ? 0.75 : 1);
      const mesh = this._decal(hit, new THREE.Vector3(size, size, 0.25), mat);
      if (!mesh) return;
      st = this.stains[seat] = { mesh, mat, amount: 0, target: 0 };
    }
    st.target = clamp(amount, 0, 1);
  }

  /** Drips falling from the headliner seam onto the dash. amount 0..1 (0 stops; stains stay). */
  bleedRoof(amount = 1) {
    if (!this.roof) {
      // where the headliner meets the windshield header
      const sw = this.taxi.anchorLocal('rearviewMirror');
      const probe = this._hit(new THREE.Vector3(0, sw.y - 0.05, sw.z + 0.12), new THREE.Vector3(0, 1, 0), 0.5);
      const seamY = probe ? this.taxi.bodyInner.worldToLocal(probe.point.clone()).y : sw.y + 0.08;
      const seamZ = sw.z + 0.12;
      let seamMesh = null;
      if (probe) seamMesh = this._decal(probe, new THREE.Vector3(1.15, 0.34, 0.3), stainMaterial('seam'), 0);
      const emitters = [];
      const rng = makeRng(77);
      for (let k = 0; k < 7; k++) {
        const x = lerp(-0.5, 0.5, (k + rng.range(0.1, 0.9)) / 7);
        const from = new THREE.Vector3(x, seamY - 0.004, seamZ + rng.range(-0.03, 0.03));
        const h = this._hit(from.clone().add(new THREE.Vector3(0, -0.01, 0)), new THREE.Vector3(0, -1, 0), 1.3);
        // keep the landing spot in body space (the taxi moves on)
        const inv = new THREE.Matrix4().copy(this.taxi.bodyInner.matrixWorld).invert();
        const land = h ? { mesh: h.mesh, pLocal: h.point.clone().applyMatrix4(inv), nLocal: h.normal.clone().transformDirection(inv) } : null;
        emitters.push({ from, land, t: rng.range(0, 3), grow: 0, period: rng.range(2.2, 4.5) });
      }
      const dropMat = paintedMaterial({ color: reduced() ? 0x2a0c0c : 0x4a0308, roughness: 0.12, metalness: 0.08, brush: 0.05, name: 'blood_drop' });
      const dropGeo = new THREE.SphereGeometry(1, 12, 10);
      const hanging = new THREE.InstancedMesh(dropGeo, dropMat, emitters.length);
      const falling = new THREE.InstancedMesh(dropGeo, dropMat, 24);
      hanging.frustumCulled = falling.frustumCulled = false;
      falling.count = 0;
      this.group.add(hanging, falling);
      this.roof = { amount: 0, target: 0, emitters, hanging, falling, seamMesh, seamMat: seamMesh?.material || null, dropMat };
    }
    this.roof.target = clamp(amount, 0, 1);
  }

  update(dt) {
    // glass drips
    for (const id of this.taxi.glass.ids) updateGlassDrips(this.taxi.glass.panes[id], dt);
    // stains seep (alphaTest threshold falls as the blood spreads through the fabric)
    for (const st of Object.values(this.stains)) {
      if (Math.abs(st.amount - st.target) > 1e-3) {
        st.amount += clamp(st.target - st.amount, -dt * 0.3, dt * 0.06);
        st.mat.alphaTest = lerp(0.97, 0.05, smoothstep(0, 1, st.amount));
      }
    }
    const R = this.roof;
    if (!R) return;
    R.amount = lerp(R.amount, R.target, 1 - Math.exp(-dt * 0.8));
    if (R.seamMat) R.seamMat.alphaTest = lerp(0.97, 0.12, Math.min(1, R.amount * 1.2 + (R.everBled || 0)));
    if (R.amount > 0.05) R.everBled = Math.max(R.everBled || 0, R.amount * 0.6);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const red = reduced();
    R.emitters.forEach((e, k) => {
      // drops swell under the seam, then let go
      if (R.amount > 0.02) e.grow += (dt / e.period) * (0.4 + R.amount * 1.6) * (red ? 0.6 : 1);
      if (e.grow >= 1) {
        e.grow = 0;
        if (this.drops.length < 24) this.drops.push({ p: e.from.clone().add(new THREE.Vector3(0, -0.006, 0)), v: 0, land: e.land, r: 0.0035 + Math.random() * 0.0015 });
      }
      const r = 0.0012 + e.grow * 0.0032;
      m.compose(p.copy(e.from).add(s.set(0, -r * 0.9, 0)), q.identity(), s.set(r, r * (1 + e.grow * 0.8), r));
      R.hanging.setMatrixAt(k, m);
    });
    R.hanging.instanceMatrix.needsUpdate = true;
    let n = 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.v += 9.81 * dt;
      d.p.y -= d.v * dt;
      const landY = d.land ? d.land.pLocal.y : 0.3;
      if (d.p.y <= landY) {
        if (d.land) {
          const W = this.taxi.bodyInner.matrixWorld;
          this._splat({ mesh: d.land.mesh, point: d.land.pLocal.clone().applyMatrix4(W), normal: d.land.nLocal.clone().transformDirection(W) }, d.r);
        }
        this.drops.splice(i, 1);
        continue;
      }
    }
    for (const d of this.drops) {
      m.compose(d.p, q.identity(), s.set(d.r * 0.8, d.r * 1.6, d.r * 0.8));
      R.falling.setMatrixAt(n++, m);
    }
    R.falling.count = n;
    R.falling.instanceMatrix.needsUpdate = true;
  }

  _splat(hit, r) {
    // nearby splats grow into a pool instead of stacking new decals
    const pl = this.taxi.bodyInner.worldToLocal(hit.point.clone());
    const near = this.splats.find((s) => s.point.distanceTo(pl) < 0.02);
    if (near) {
      near.n++;
      near.mat.alphaTest = Math.max(0.08, near.mat.alphaTest - 0.06);
      return;
    }
    if (this.splats.length >= 40) return;
    const mat = stainMaterial('splat');
    mat.alphaTest = 0.55;
    const size = (0.03 + r * 6) * (reduced() ? 0.7 : 1);
    const mesh = this._decal(hit, new THREE.Vector3(size, size, 0.06), mat);
    if (mesh) this.splats.push({ mesh, mat, point: pl, n: 1 });
  }

  /** Remove every blood decal, drop and the glass blood. */
  clear() {
    for (const st of Object.values(this.stains)) {
      st.mesh.removeFromParent();
      st.mesh.geometry.dispose();
      st.mat.dispose();
    }
    this.stains = {};
    for (const s of this.splats) {
      s.mesh.removeFromParent();
      s.mesh.geometry.dispose();
      s.mat.dispose();
    }
    this.splats = [];
    this.drops = [];
    if (this.roof) {
      this.roof.hanging.removeFromParent();
      this.roof.falling.removeFromParent();
      this.roof.seamMesh?.removeFromParent();
      this.roof = null;
    }
    for (const id of this.taxi.glass.ids) this.taxi.glass.panes[id].clearBlood?.();
  }

  dispose() {
    this.clear();
    this.group.removeFromParent();
  }
}
