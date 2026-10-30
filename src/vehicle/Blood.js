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
import { paintedMaterial } from '../render/index.js';
import { settings } from '../core/Settings.js';
import { makeRng, clamp, lerp, smoothstep, noise } from '../core/math.js';
import { makeCanvas, toTexture } from './VehicleTextures.js';

const reduced = () => settings.get('gore') === 'reduced';
/** Blood palette: [core, body, edge, highlight] css colours for the current gore level. */
function palette() {
  return reduced()
    ? { core: [34, 10, 10], body: [52, 16, 15], edge: [66, 26, 22], hi: [96, 54, 48], alpha: 0.8, density: 0.45 }
    : { core: [58, 2, 6], body: [104, 6, 14], edge: [142, 16, 22], hi: [196, 86, 80], alpha: 1, density: 1 };
}
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// ---------------------------------------------------------------------------
// glass painting
// ---------------------------------------------------------------------------
/** Streaks inside the current path (fresh blood: thick, dragged, uneven). */
function streakFill(g, rng, P, x, y, s, angle, n = 40, len = 1) {
  g.save();
  g.clip();
  g.fillStyle = css(P.body, 0.92 * P.alpha);
  g.fillRect(x - s * 2, y - s * 2, s * 4, s * 4);
  g.translate(x, y);
  g.rotate(angle);
  for (let k = 0; k < n; k++) {
    const ox = rng.range(-s, s), w = rng.range(0.6, 2.6);
    g.strokeStyle = rng() < 0.5 ? css(P.core, rng.range(0.25, 0.7) * P.alpha) : css(P.edge, rng.range(0.1, 0.35) * P.alpha);
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(ox, -s * 1.2);
    g.bezierCurveTo(ox + rng.range(-3, 3), -s * 0.3, ox + rng.range(-3, 3), s * 0.4, ox + rng.range(-4, 4), s * 1.2 * len);
    g.stroke();
  }
  // glossy wet highlight streaks
  for (let k = 0; k < 6; k++) {
    g.strokeStyle = css(P.hi, rng.range(0.08, 0.2) * P.alpha);
    g.lineWidth = rng.range(0.8, 1.8);
    g.beginPath();
    const ox = rng.range(-s * 0.7, s * 0.7);
    g.moveTo(ox, -s * 0.6);
    g.lineTo(ox + rng.range(-2, 2), s * 0.2);
    g.stroke();
  }
  g.restore();
}

function blobPath(g, rng, x, y, r, rough = 0.35, n = 22) {
  g.beginPath();
  const ph = rng() * 10;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2;
    const rr = r * (1 + rough * (noise.noise2D(Math.cos(a) * 1.3 + ph, Math.sin(a) * 1.3) * 0.8 + (rng() - 0.5) * 0.4));
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (k === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

function handPath(g, x, y, s, rot) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.beginPath();
  g.ellipse(0, s * 0.25, s * 0.38, s * 0.45, 0, 0, Math.PI * 2);
  const f = [[-0.34, -0.35, 0.09, 0.42, -0.35], [-0.16, -0.58, 0.085, 0.5, -0.1], [0.04, -0.64, 0.085, 0.52, 0.02], [0.22, -0.56, 0.08, 0.46, 0.12], [0.45, 0.02, 0.085, 0.36, 0.9]];
  for (const [fx, fy, fw, fl, fa] of f) {
    const cx = fx * s + Math.sin(fa) * fl * s * 0.45, cy = fy * s - Math.cos(fa) * fl * s * 0.45;
    g.moveTo(cx + fw * s, cy);
    g.ellipse(cx, cy, fw * s, fl * s * 0.55, fa, 0, Math.PI * 2);
  }
  g.restore();
}

/** A running drip: state advanced by updateDrips(). */
function newDrip(x, y, rng, P, speed = 1) {
  return { x, y, w: rng.range(2.2, 4.6), v: rng.range(14, 30) * speed, left: rng.range(40, 180), life: 0, rng, P };
}

/**
 * Paint a blood mark on a pane. kind 'blood_handprint'|'blood_smear'|'blood_drip'|'blood_splatter'.
 * uv in pane mask space (0..1, v up). opts {size, angle, path:[{x,y}...] (smear, uv), drips, seed}
 */
export function paintGlassBlood(pane, kind, uv, opts = {}) {
  const B = pane.ensureBlood();
  const g = B.g, W = B.canvas.width, H = B.canvas.height;
  const P = palette();
  const rng = makeRng(opts.seed ?? ((Math.random() * 1e9) | 0));
  const x = (uv.x ?? uv[0]) * W, y = (1 - (uv.y ?? uv[1])) * H;
  const s = (opts.size ?? 1) * W * (pane.id === 'windshield' ? 0.07 : 0.12);
  const drip = (dx, dy, speed = 1) => B.drips.push(newDrip(dx, dy, rng, P, speed));
  if (kind === 'blood_handprint') {
    const rot = opts.angle ?? rng.range(-0.4, 0.4);
    handPath(g, x, y, s, rot);
    streakFill(g, rng, P, x, y, s, rot + (opts.drag ? 0 : 0.1), 46, opts.drag ? 1.8 : 1);
    // tide-line rim where it dries first
    handPath(g, x, y, s, rot);
    g.strokeStyle = css(P.core, 0.55 * P.alpha);
    g.lineWidth = 1.6;
    g.stroke();
    if (opts.drag) {
      // the hand slid down: smeared tracks below the prints
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      for (let k = 0; k < 5; k++) {
        const fx = (-0.34 + k * 0.2) * s;
        const grd = g.createLinearGradient(0, 0, 0, s * 2.2);
        grd.addColorStop(0, css(P.body, 0.8 * P.alpha));
        grd.addColorStop(1, css(P.body, 0));
        g.strokeStyle = grd;
        g.lineWidth = s * rng.range(0.1, 0.16);
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(fx, -s * 0.2);
        g.bezierCurveTo(fx + rng.range(-4, 4), s * 0.6, fx + rng.range(-6, 6), s * 1.4, fx + rng.range(-8, 8), s * 2.2);
        g.stroke();
      }
      g.restore();
    }
    const nd = Math.round((opts.drips ?? 3) * P.density);
    for (let k = 0; k < nd; k++) drip(x + rng.range(-s * 0.35, s * 0.35), y + s * 0.55, 0.7);
  } else if (kind === 'blood_smear') {
    // finger-dragged: several parallel finger tracks along a path, heavy where it starts
    const path = (opts.path || [{ x: uv.x ?? uv[0], y: uv.y ?? uv[1] }, { x: (uv.x ?? uv[0]) + 0.18 * Math.cos(opts.angle ?? -0.3), y: (uv.y ?? uv[1]) + 0.18 * Math.sin(opts.angle ?? -0.3) }]).map((p) => [p.x * W, (1 - p.y) * H]);
    const fingers = opts.fingers ?? 4;
    for (let f = 0; f < fingers; f++) {
      const off = (f - (fingers - 1) / 2) * s * 0.18;
      for (let pass = 0; pass < 3; pass++) {
        g.beginPath();
        for (let i = 0; i < path.length; i++) {
          const [px, py] = path[i];
          const nx = i < path.length - 1 ? path[i + 1][1] - py : py - path[i - 1][1];
          const ny = i < path.length - 1 ? -(path[i + 1][0] - px) : -(px - path[i - 1][0]);
          const nl = Math.hypot(nx, ny) || 1;
          const qx = px + (nx / nl) * off + rng.range(-1.5, 1.5), qy = py + (ny / nl) * off + rng.range(-1.5, 1.5);
          if (i === 0) g.moveTo(qx, qy);
          else g.lineTo(qx, qy);
        }
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.strokeStyle = pass === 0 ? css(P.body, 0.75 * P.alpha) : pass === 1 ? css(P.core, 0.4 * P.alpha) : css(P.hi, 0.12 * P.alpha);
        g.lineWidth = s * (pass === 0 ? 0.15 : pass === 1 ? 0.07 : 0.02);
        g.stroke();
      }
      // the heavy start of the stroke
      blobPath(g, rng, path[0][0] + rng.range(-2, 2), path[0][1], s * 0.12, 0.3, 14);
      g.fillStyle = css(P.core, 0.85 * P.alpha);
      g.fill();
    }
    // bristle gaps: thin partial wipes inside the tracks
    g.save();
    g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 18; k++) {
      const i = Math.floor(rng() * (path.length - 1));
      const t = rng();
      const px = lerp(path[i][0], path[i + 1][0], t), py = lerp(path[i][1], path[i + 1][1], t);
      g.strokeStyle = `rgba(0,0,0,${rng.range(0.2, 0.6)})`;
      g.lineWidth = rng.range(0.6, 1.4);
      g.beginPath();
      g.moveTo(px - 6, py + rng.range(-s * 0.3, s * 0.3));
      g.lineTo(px + 6, py + rng.range(-s * 0.3, s * 0.3));
      g.stroke();
    }
    g.restore();
    const nd = Math.round((opts.drips ?? 2) * P.density);
    for (let k = 0; k < nd; k++) drip(path[0][0] + rng.range(-s * 0.3, s * 0.3), path[0][1] + s * 0.1, 0.6);
  } else if (kind === 'blood_drip') {
    // trails that creep down from the top edge of the glass (or from uv)
    const n = Math.max(1, Math.round((opts.count ?? 3) * P.density));
    for (let k = 0; k < n; k++) {
      const dx = x + (k - (n - 1) / 2) * s * rng.range(0.25, 0.5);
      const dy = opts.fromTop === false ? y : 0;
      blobPath(g, rng, dx, dy + 2, rng.range(3, 6), 0.4, 12);
      g.fillStyle = css(P.body, 0.9 * P.alpha);
      g.fill();
      drip(dx, dy + 3, opts.speed ?? 0.5);
    }
  } else if (kind === 'blood_splatter') {
    const rot = opts.angle ?? rng() * Math.PI * 2;
    blobPath(g, rng, x, y, s * 0.42, 0.45, 26);
    streakFill(g, rng, P, x, y, s * 0.5, rot, 30, 0.8);
    // spikes thrown outward along the impact direction
    const nSp = Math.round(16 * P.density);
    for (let k = 0; k < nSp; k++) {
      const a = rot + rng.range(-1.6, 1.6) + (rng() < 0.3 ? Math.PI : 0);
      const L = s * rng.range(0.5, 1.4);
      g.fillStyle = css(rng() < 0.5 ? P.body : P.core, rng.range(0.6, 0.95) * P.alpha);
      g.beginPath();
      const w = s * rng.range(0.03, 0.08);
      g.moveTo(x + Math.cos(a + Math.PI / 2) * w, y + Math.sin(a + Math.PI / 2) * w);
      g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
      g.lineTo(x + Math.cos(a - Math.PI / 2) * w, y + Math.sin(a - Math.PI / 2) * w);
      g.fill();
      g.beginPath();
      g.arc(x + Math.cos(a) * L, y + Math.sin(a) * L, w * 0.9, 0, Math.PI * 2);
      g.fill();
    }
    // satellite droplets
    const nDr = Math.round(70 * P.density);
    for (let k = 0; k < nDr; k++) {
      const a = rot + rng.range(-1.9, 1.9);
      const d = s * (0.5 + Math.pow(rng(), 0.6) * 1.9);
      const r = Math.max(0.6, s * 0.06 * (1 - d / (s * 2.6)) * rng.range(0.3, 1.2));
      g.fillStyle = css(rng() < 0.6 ? P.body : P.edge, rng.range(0.6, 1) * P.alpha);
      g.beginPath();
      g.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 1.4, r, a, 0, Math.PI * 2);
      g.fill();
    }
    const nd = Math.round((opts.drips ?? 4) * P.density);
    for (let k = 0; k < nd; k++) drip(x + rng.range(-s * 0.4, s * 0.4), y + s * 0.3, 0.8);
  }
  B.tex.needsUpdate = true;
  pane.uniforms.uBloodOn.value = 1;
}

/** Advance running drips on a pane (thick fresh trail, bead at the tip, slows and stops). */
export function updateGlassDrips(pane, dt) {
  const B = pane.blood;
  if (!B || !B.drips.length) return;
  const g = B.g, H = B.canvas.height;
  for (let i = B.drips.length - 1; i >= 0; i--) {
    const d = B.drips[i];
    d.life += dt;
    // stick-slip creep: stalls, then runs
    const surge = 0.35 + 0.65 * Math.max(0, Math.sin(d.life * 1.7 + d.x));
    const dy = d.v * surge * dt;
    if (dy <= 0) continue;
    const P = d.P;
    g.lineCap = 'round';
    g.strokeStyle = css(P.body, 0.9 * P.alpha);
    g.lineWidth = d.w;
    g.beginPath();
    g.moveTo(d.x, d.y);
    d.x += d.rng.range(-0.25, 0.25) * dy * 0.3;
    d.y += dy;
    g.lineTo(d.x, d.y);
    g.stroke();
    g.strokeStyle = css(P.core, 0.35 * P.alpha);
    g.lineWidth = d.w * 0.45;
    g.stroke();
    d.left -= dy;
    d.v *= Math.exp(-dt * 0.08);
    d.w = Math.max(1.2, d.w - dy * 0.006);
    if (d.left <= 0 || d.y > H - 2) {
      // the bead that stopped
      g.fillStyle = css(P.core, 0.95 * P.alpha);
      g.beginPath();
      g.ellipse(d.x, d.y + 1, d.w * 0.95, d.w * 1.25, 0, 0, Math.PI * 2);
      g.fill();
      B.drips.splice(i, 1);
    }
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
  const rng = B.rng;
  for (let k = 0; k < 7; k++) {
    const r = lerp(r0, r1, rng());
    g.strokeStyle = css(rng() < 0.6 ? P.body : P.core, rng.range(0.08, 0.3) * P.alpha);
    g.lineWidth = rng.range(0.6, 2.2);
    g.beginPath();
    for (let j = 0; j <= 8; j++) {
      const [px, py] = toC(lerp(phi0, phi1, j / 8), r + rng.range(-0.002, 0.002));
      if (j === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
  }
  g.restore();
  B.tex.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// interior stains + roof bleed
// ---------------------------------------------------------------------------
const _stainCache = new Map();
/** RGBA stain: rgb blood colours, alpha = seep field (centre 1 -> edge 0) used with alphaTest. */
function stainTexture(kind) {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const rng = makeRng(kind === 'splat' ? 9 : kind === 'seam' ? 13 : 5);
  const P = palette();
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S - 0.5, v = y / S - 0.5;
      let f;
      if (kind === 'seam') {
        // a long soaked band with runs hanging down
        const run = Math.max(0, noise.noise2D(u * 9, 3.1) * 0.5 + 0.2) * smoothstep(-0.05, 0.5, v);
        f = 1 - Math.abs(v + 0.25) * 4.5 + run * 2.2 + noise.noise2D(u * 14, v * 14) * 0.18;
        f *= 1 - smoothstep(0.38, 0.5, Math.abs(u));
      } else {
        const r = Math.hypot(u, v) * 2;
        const warp = noise.noise2D(u * 4 + 1.3, v * 4) * 0.28 + noise.noise2D(u * 16, v * 16) * 0.08 + (kind === 'splat' ? 0 : noise.noise2D(u * 40, v * 3) * 0.06); // fabric wicking along the weave
        f = 1 - r + warp;
      }
      f = clamp(f, 0, 1);
      // colour: dark core, brighter fresh body, dark dried tide line at the edge
      const edge = smoothstep(0.0, 0.08, f) * (1 - smoothstep(0.08, 0.2, f));
      const core = smoothstep(0.4, 0.9, f);
      const i = (y * S + x) * 4;
      const t = rng() * 0.08;
      img.data[i] = lerp(lerp(P.body[0], P.core[0], core), P.core[0] * 0.6, edge) * (1 - t);
      img.data[i + 1] = lerp(lerp(P.body[1], P.core[1], core), P.core[1] * 0.6, edge) * (1 - t);
      img.data[i + 2] = lerp(lerp(P.body[2], P.core[2], core), P.core[2] * 0.6, edge) * (1 - t);
      img.data[i + 3] = f * 255;
    }
  }
  g.putImageData(img, 0, 0);
  return toTexture(c);
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
