// Hanging cabin decorations, built in JS so they work on both the procedural and the GLB
// taxi: the jasmine garland (พวงมาลัย) on the rearview mirror, the amulets on their chains,
// Grandma Bua's garland on the dashboard (taxi.addDashGarland) and the ignition key.
//
// Garland = verlet strands (gravity in the tilted body frame + the car's inertia + bump
// kicks) carrying a dense jacket of modelled (lathe) jasmine buds and hand-painted 2D cards
// (open blossoms, crown flowers, rose, marigold, leaves) that face outward/toward the viewer,
// satin ribbon tails, falling petals, and wilting (GARLAND_UNIFORMS.uWilt: buds and petals
// brown, ribbons don't).
import * as THREE from 'three';
import { paintedMaterial } from '../render/index.js';
import { signTex, tex, hasPhotoTexture, flowerCell } from '../textures/index.js';
import { engine } from '../core/Engine.js';
import { makeRng, clamp, lerp, smoothstep } from '../core/math.js';
import { hiCanvas, toTexture, maxAnisotropy } from './VehicleTextures.js';

/** Shared: uWilt 0 fresh .. 1 brown and drooping (ghost-heavy rides). */
export const GARLAND_UNIFORMS = { uWilt: { value: 0 } };

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _t = new THREE.Vector3(), _r = new THREE.Vector3(), _n = new THREE.Vector3(), _u = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const UPY = new THREE.Vector3(0, 1, 0);
const FRESH = new THREE.Color(1, 1, 1), BROWN = new THREE.Color(0.58, 0.42, 0.26), DRY = new THREE.Color(0.42, 0.3, 0.2);

// ---------------------------------------------------------------------------
// hand-painted flower card atlas (4 x 2 cells of 256 px, alpha-cut)
// ---------------------------------------------------------------------------
export const CARD = { blossom: 0, crown: 1, rose: 2, marigold: 3, leaf: 4, ribbon: 5, petal: 6, budPair: 7 };
let _atlas = null;
function flowerAtlas() {
  if (_atlas) return _atlas;
  const C = 256, W = C * 4, H = C * 2;
  const [c, g] = hiCanvas(W, H, 1);
  g.clearRect(0, 0, W, H);
  const rng = makeRng(2024);
  const cell = (i, fn) => {
    g.save();
    g.translate((i % 4) * C + C / 2, Math.floor(i / 4) * C + C / 2);
    fn();
    g.restore();
  };
  const petal = (len, wid, rot, fill, edge, vein = true) => {
    g.save();
    g.rotate(rot);
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(wid, -len * 0.25, wid * 0.9, -len * 0.85, 0, -len);
    g.bezierCurveTo(-wid * 0.9, -len * 0.85, -wid, -len * 0.25, 0, 0);
    const gr = g.createLinearGradient(0, 0, 0, -len);
    gr.addColorStop(0, edge);
    gr.addColorStop(0.35, fill);
    gr.addColorStop(1, fill);
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = 'rgba(120,110,80,0.35)';
    g.lineWidth = 1.2;
    g.stroke();
    if (vein) {
      g.strokeStyle = 'rgba(150,140,100,0.28)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, -len * 0.1);
      g.quadraticCurveTo(wid * 0.15, -len * 0.5, 0, -len * 0.9);
      g.stroke();
    }
    g.restore();
  };
  // 0 open jasmine blossom (มะลิบาน): 7 waxy petals, cream centre
  cell(0, () => {
    for (let k = 0; k < 7; k++) petal(100 + rng() * 14, 30, (k / 7) * Math.PI * 2 + rng() * 0.15, '#fbf8ee', '#e7e4cf');
    for (let k = 0; k < 7; k++) {
      g.save();
      g.rotate((k / 7) * Math.PI * 2 + 0.2);
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-6, -30);
      g.quadraticCurveTo(-4, -70, 0, -92);
      g.stroke();
      g.restore();
    }
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 22);
    gr.addColorStop(0, '#d8c060');
    gr.addColorStop(0.6, '#e9dfa0');
    gr.addColorStop(1, 'rgba(240,235,200,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, 22, 0, Math.PI * 2);
    g.fill();
  });
  // 1 crown flower (ดอกรัก): five pale lilac petals curled back + white crown
  cell(1, () => {
    for (let k = 0; k < 5; k++) petal(104, 40, (k / 5) * Math.PI * 2, '#e9e0f0', '#c8b8d8');
    g.fillStyle = '#f7f4fa';
    for (let k = 0; k < 5; k++) {
      g.save();
      g.rotate((k / 5) * Math.PI * 2 + Math.PI / 5);
      g.beginPath();
      g.ellipse(0, -30, 13, 24, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(140,120,160,0.5)';
      g.lineWidth = 2;
      g.stroke();
      g.restore();
    }
    g.fillStyle = '#e8e0ee';
    g.beginPath();
    g.arc(0, 0, 18, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(120,100,140,0.6)';
    g.stroke();
  });
  // 2 rose: spiralling layered petals, deep red
  cell(2, () => {
    for (let ring = 0; ring < 4; ring++) {
      const R = 108 - ring * 24;
      const n = 6 - Math.min(ring, 2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + ring * 0.6;
        g.save();
        g.rotate(a);
        g.beginPath();
        g.ellipse(0, -R * 0.45, R * 0.48, R * 0.5, 0, 0, Math.PI * 2);
        const gr = g.createRadialGradient(0, -R * 0.2, 2, 0, -R * 0.45, R * 0.6);
        gr.addColorStop(0, ring < 2 ? '#8a0a14' : '#5c0610');
        gr.addColorStop(0.7, ring < 2 ? '#b8162a' : '#86101c');
        gr.addColorStop(1, '#d23a48');
        g.fillStyle = gr;
        g.fill();
        g.strokeStyle = 'rgba(40,0,6,0.55)';
        g.lineWidth = 2;
        g.stroke();
        g.restore();
      }
    }
    g.strokeStyle = 'rgba(40,0,6,0.8)';
    g.lineWidth = 3;
    g.beginPath();
    for (let a = 0; a < 12; a += 0.2) g.lineTo(Math.cos(a) * a * 1.6, Math.sin(a) * a * 1.6);
    g.stroke();
  });
  // 3 marigold (ดาวเรือง): ruffled rings of orange florets
  cell(3, () => {
    for (let ring = 0; ring < 6; ring++) {
      const R = 110 - ring * 17;
      const n = 22 - ring * 2;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + ring * 0.37;
        g.save();
        g.rotate(a);
        g.beginPath();
        g.moveTo(-9, -R + 26);
        g.quadraticCurveTo(-12, -R + 4, -5, -R);
        g.lineTo(0, -R + 6);
        g.lineTo(5, -R);
        g.quadraticCurveTo(12, -R + 4, 9, -R + 26);
        g.closePath();
        const sh = 0.75 + 0.25 * rng();
        g.fillStyle = `rgb(${(238 * sh) | 0},${((128 + ring * 10) * sh) | 0},${(20 * sh) | 0})`;
        g.fill();
        g.strokeStyle = 'rgba(120,50,0,0.45)';
        g.lineWidth = 1.5;
        g.stroke();
        g.restore();
      }
    }
  });
  // 4 leaf (ใบเล็บครุฑ-like glossy green) with midrib
  cell(4, () => {
    g.beginPath();
    g.moveTo(0, 110);
    g.bezierCurveTo(70, 40, 60, -60, 0, -115);
    g.bezierCurveTo(-60, -60, -70, 40, 0, 110);
    const gr = g.createLinearGradient(-60, 0, 60, 0);
    gr.addColorStop(0, '#2c5a26');
    gr.addColorStop(0.5, '#4f8a3a');
    gr.addColorStop(1, '#244a20');
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = '#1a3416';
    g.lineWidth = 2;
    g.stroke();
    g.strokeStyle = 'rgba(200,230,160,0.6)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 105);
    g.lineTo(0, -105);
    g.stroke();
    for (let k = -4; k <= 4; k++) {
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, k * 22);
      g.quadraticCurveTo(26, k * 22 - 18, 44, k * 22 - 34);
      g.moveTo(0, k * 22);
      g.quadraticCurveTo(-26, k * 22 - 18, -44, k * 22 - 34);
      g.stroke();
    }
  });
  // 5 ribbon (satin, red with a sheen, used along the tail strips: u across, v along)
  cell(5, () => {
    const gr = g.createLinearGradient(-128, 0, 128, 0);
    gr.addColorStop(0, '#6a0814');
    gr.addColorStop(0.2, '#c0182c');
    gr.addColorStop(0.42, '#f0627a');
    gr.addColorStop(0.55, '#c8162c');
    gr.addColorStop(0.85, '#90101e');
    gr.addColorStop(1, '#5a0610');
    g.fillStyle = gr;
    g.fillRect(-128, -128, 256, 256);
    g.strokeStyle = 'rgba(255,220,120,0.85)';
    g.lineWidth = 6;
    for (const x of [-110, 110]) {
      g.beginPath();
      g.moveTo(x, -128);
      g.lineTo(x, 128);
      g.stroke();
    }
  });
  // 6 single jasmine petal (falling)
  cell(6, () => petal(150, 50, 0, '#fbf8ee', '#ebe6d0'));
  // 7 two jasmine buds side by side (for the tassel ends)
  cell(7, () => {
    for (const sx of [-1, 1]) {
      g.save();
      g.translate(sx * 30, 10);
      g.rotate(sx * 0.15);
      g.beginPath();
      g.moveTo(0, 100);
      g.bezierCurveTo(34, 60, 30, -50, 0, -110);
      g.bezierCurveTo(-30, -50, -34, 60, 0, 100);
      const gr = g.createLinearGradient(-30, 0, 30, 0);
      gr.addColorStop(0, '#dcd8c0');
      gr.addColorStop(0.45, '#fffdf2');
      gr.addColorStop(1, '#cfcab0');
      g.fillStyle = gr;
      g.fill();
      g.fillStyle = '#7a9a4a';
      g.beginPath();
      g.moveTo(-14, 92);
      g.lineTo(0, 70);
      g.lineTo(14, 92);
      g.lineTo(0, 110);
      g.fill();
      g.restore();
    }
  });
  const tex = toTexture(c, { anisotropy: maxAnisotropy() });
  tex.generateMipmaps = true;
  _atlas = tex;
  return tex;
}

// Photobashed flower atlas (tex('flower_atlas'), FLOWER_ATLAS cells) used for the cards when it is
// loaded; the hand-painted canvas atlas above stays as the fallback (and for the falling petals).
const PHOTO_CELLS = {
  [CARD.blossom]: ['jasmine', 'front'], [CARD.crown]: ['crown_purple', 'front'], [CARD.rose]: ['rose_red', 'front'],
  [CARD.marigold]: ['marigold', 'front'], [CARD.leaf]: ['leaves', 'front'], [CARD.budPair]: ['jasmine_bud', 'side'],
};
let _photoCards = null;
function photoCards() {
  if (_photoCards === null) _photoCards = hasPhotoTexture('flower_atlas');
  return _photoCards;
}

function cardGeometry(cellIdx, w, h, pivotY = 0, canvasAtlas = false) {
  const g = new THREE.PlaneGeometry(w, h);
  g.translate(0, -pivotY * h, 0);
  let u0 = (cellIdx % 4) / 4, v0 = 1 - Math.floor(cellIdx / 4) / 2 - 0.5, du = 0.25, dv = 0.5;
  const pc = !canvasAtlas && photoCards() && PHOTO_CELLS[cellIdx] && flowerCell(...PHOTO_CELLS[cellIdx]);
  if (pc) [u0, v0, du, dv] = [pc.uv[0], pc.uv[1], pc.uv[2] - pc.uv[0], pc.uv[3] - pc.uv[1]];
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
  return g;
}

// ---------------------------------------------------------------------------
// modelled pieces
// ---------------------------------------------------------------------------
let _budGeo = null, _budTex = null;
/** Jasmine bud (มะลิตูม): pointed, swollen, narrow base with a calyx (lathe). Axis +Y, base at 0. */
function budGeometry() {
  if (_budGeo) return _budGeo;
  const prof = [[0.0, 0], [0.0016, 0.0004], [0.0022, 0.0018], [0.0018, 0.0028], [0.0026, 0.004], [0.0033, 0.0062], [0.0034, 0.0082], [0.003, 0.0102], [0.0021, 0.0122], [0.0011, 0.0136], [0.0, 0.0145]];
  _budGeo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 9);
  // a quarter twist along the bud (petals wrap in a spiral)
  const p = _budGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), a = (y / 0.0145) * 0.8;
    const x = p.getX(i), z = p.getZ(i);
    p.setXYZ(i, x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a));
  }
  _budGeo.computeVertexNormals();
  return _budGeo;
}
function budTexture() {
  if (_budTex) return _budTex;
  const [c, g] = hiCanvas(64, 128, 2);
  // v=0 at the base (bottom of the canvas): green calyx -> ivory -> slightly blushed tip
  const gr = g.createLinearGradient(0, 128, 0, 0);
  gr.addColorStop(0, '#6f8f40');
  gr.addColorStop(0.2, '#9cae6c');
  gr.addColorStop(0.3, '#ecebd6');
  gr.addColorStop(0.75, '#fffdf3');
  gr.addColorStop(1, '#f4eadc');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 128);
  // spiral petal seams
  g.strokeStyle = 'rgba(170,165,130,0.55)';
  g.lineWidth = 1.2;
  for (let k = 0; k < 5; k++) {
    g.beginPath();
    for (let y = 95; y >= 0; y -= 4) g.lineTo(((k * 64) / 5 + (95 - y) * 0.25) % 64, y);
    g.stroke();
  }
  _budTex = toTexture(c, { wrap: THREE.RepeatWrapping });
  return _budTex;
}

let _mats = null;
function garlandMaterials() {
  if (_mats) return _mats;
  const atlas = flowerAtlas();
  const photo = photoCards();
  const pAtlas = photo ? tex('flower_atlas') : atlas;
  const pNormal = photo ? tex('flower_atlas_normal') : null;
  _mats = {
    bud: paintedMaterial({ map: budTexture(), color: 0xffffff, roughness: 0.55, brush: 0.12, translucency: 0.55, name: 'garland_bud' }),
    card: paintedMaterial({ map: pAtlas, normalMap: pNormal, color: 0xffffff, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.62, brush: 0.1, translucency: 0.55, name: 'garland_card' }),
    petal: paintedMaterial({ map: atlas, color: 0xffffff, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7, brush: 0.1, translucency: 0.5, name: 'garland_petal' }),
    ribbon: paintedMaterial({ map: pAtlas, color: 0xffffff, side: THREE.DoubleSide, roughness: 0.35, metalness: 0.05, brush: 0.1, name: 'garland_ribbon' }),
    thread: paintedMaterial({ color: 0xd8cfb8, roughness: 0.8, brush: 0.05, name: 'garland_thread' }),
    gold: paintedMaterial({ color: 0xd2a64e, metalness: 0.85, roughness: 0.3, brush: 0.15, name: 'amulet_gold' }),
    silver: paintedMaterial({ color: 0xc8c6c0, metalness: 0.85, roughness: 0.32, brush: 0.15, name: 'amulet_silver' }),
    brass: paintedMaterial({ color: 0xb08a40, metalness: 0.8, roughness: 0.4, brush: 0.2, name: 'amulet_brass' }),
    glass: paintedMaterial({ color: 0xdfe8e4, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.22, depthWrite: false, brush: 0.0, name: 'amulet_glass' }),
  };
  return _mats;
}

// ---------------------------------------------------------------------------
// verlet strands
// ---------------------------------------------------------------------------
class Strands {
  constructor() {
    this.p = [];
    this.o = [];
    this.pin = [];
    this.c = [];
    this.floorY = null;
  }
  node(v, pinned = false) {
    this.p.push(v.clone());
    this.o.push(v.clone());
    this.pin.push(pinned ? v.clone() : null);
    return this.p.length - 1;
  }
  link(i, j, len = null) {
    this.c.push([i, j, len ?? this.p[i].distanceTo(this.p[j])]);
  }
  /** a: pseudo acceleration (gravity - inertia) in local space; kick: random impulse scale */
  step(dt, a, kick = 0, damping = 0.988, iters = 8) {
    const h = 1 / 120;
    const n = Math.min(8, Math.max(1, Math.round(dt / h)));
    const hh = (dt / n) * (dt / n);
    for (let s = 0; s < n; s++) {
      for (let i = 0; i < this.p.length; i++) {
        const p = this.p[i], o = this.o[i];
        if (this.pin[i]) {
          p.copy(this.pin[i]);
          o.copy(p);
          continue;
        }
        _v.subVectors(p, o).multiplyScalar(damping);
        if (kick > 0) _v.add(_w.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.4, Math.random() - 0.5).multiplyScalar(kick * 0.0009));
        o.copy(p);
        p.add(_v).addScaledVector(a, hh);
      }
      for (let k = 0; k < iters; k++) {
        for (const [i, j, L] of this.c) {
          const pi = this.p[i], pj = this.p[j];
          _v.subVectors(pj, pi);
          const d = _v.length() || 1e-6;
          const wi = this.pin[i] ? 0 : 1, wj = this.pin[j] ? 0 : 1;
          const w = wi + wj;
          if (!w) continue;
          _v.multiplyScalar((d - L) / d / w);
          if (wi) pi.addScaledVector(_v, wi);
          if (wj) pj.addScaledVector(_v, -wj);
        }
        if (this.floorY !== null) {
          for (let i = 0; i < this.p.length; i++) {
            const p = this.p[i];
            if (p.y < this.floorY) {
              p.y = this.floorY;
              // friction on the dash
              this.o[i].x = lerp(this.o[i].x, p.x, 0.6);
              this.o[i].z = lerp(this.o[i].z, p.z, 0.6);
            }
          }
        }
      }
    }
  }
}

/** Orthonormal frame along a strand at parameter t of edge (i, j). */
function frameAt(S, i, j, t, outPos, outT, outR, phi) {
  outPos.lerpVectors(S.p[i], S.p[j], t);
  outT.subVectors(S.p[j], S.p[i]).normalize();
  // reference perpendicular: stable for hanging strands (body X), fall back to Z
  _u.set(1, 0, 0);
  if (Math.abs(outT.dot(_u)) > 0.9) _u.set(0, 0, 1);
  outR.crossVectors(outT, _u).normalize();
  outR.applyAxisAngle(outT, phi);
}

// ---------------------------------------------------------------------------
// Garland
// ---------------------------------------------------------------------------
/**
 * opts { mode:'hang'|'dash', at: Vector3 (body-local hang point / dash centre), scale=1, seed,
 *   floorY (dash mode), yaw (dash mode), loopH=0.1, loopW=0.05, tassels=3 }
 */
export class Garland {
  constructor(taxi, parent, opts = {}) {
    this.taxi = taxi;
    this.mode = opts.mode || 'hang';
    this.scale = opts.scale ?? 1;
    const sc = this.scale;
    this.group = new THREE.Group();
    this.group.name = 'garland';
    parent.add(this.group);
    const rng = makeRng(opts.seed ?? 7);
    this.rng = rng;
    const M = garlandMaterials();
    const S = (this.S = new Strands());
    const at = opts.at.clone();
    // ---- topology ----
    const loopN = 16;
    const loopH = (opts.loopH ?? 0.1) * sc, loopW = (opts.loopW ?? 0.05) * sc;
    let top, loop = [];
    if (this.mode === 'hang') {
      top = S.node(at, true);
      const t1 = S.node(at.clone().add(new THREE.Vector3(0, -0.018 * sc, 0)));
      S.link(top, t1);
      const lt = S.node(at.clone().add(new THREE.Vector3(0, -0.034 * sc, 0)));
      S.link(t1, lt);
      loop.push(lt);
      for (let k = 1; k < loopN; k++) {
        const a = (k / loopN) * Math.PI * 2;
        loop.push(S.node(at.clone().add(new THREE.Vector3(Math.sin(a) * loopW * 0.5, -0.034 * sc - (1 - Math.cos(a)) * 0.5 * loopH, Math.sin(a * 2) * 0.004))));
      }
    } else {
      const yaw = opts.yaw ?? 0.2;
      for (let k = 0; k < loopN; k++) {
        const a = (k / loopN) * Math.PI * 2;
        const lx = Math.cos(a) * loopW * 1.6, lz = Math.sin(a) * loopH * 0.55;
        loop.push(S.node(at.clone().add(new THREE.Vector3(lx * Math.cos(yaw) - lz * Math.sin(yaw), 0.004, lx * Math.sin(yaw) + lz * Math.cos(yaw)))));
      }
      S.floorY = opts.floorY ?? at.y;
      top = loop[0];
    }
    for (let k = 0; k < loopN; k++) S.link(loop[k], loop[(k + 1) % loopN]);
    // keep the loop round: a few cross braces (soft)
    for (let k = 0; k < loopN / 2; k++) this.S.c.push([loop[k], loop[k + loopN / 2], S.p[loop[k]].distanceTo(S.p[loop[k + loopN / 2]]) * 0.98]);
    this._braces = loopN / 2;
    const bottom = this.mode === 'hang' ? loop[loopN / 2] : loop[Math.round(loopN * 0.75)];
    this.bottom = bottom;
    // tassels (อุบะ): short strands of buds ending in a rose / marigold
    const tassels = [];
    const nT = opts.tassels ?? 3;
    for (let k = 0; k < nT; k++) {
      const chain = [bottom];
      const dx = (k - (nT - 1) / 2) * 0.008 * sc;
      for (let s = 1; s <= 5; s++) {
        const p = S.p[bottom].clone().add(new THREE.Vector3(dx * (1 + s * 0.2), this.mode === 'hang' ? -s * 0.012 * sc : 0, this.mode === 'hang' ? 0 : s * 0.012 * sc));
        const id = S.node(p);
        S.link(chain[chain.length - 1], id);
        chain.push(id);
      }
      tassels.push(chain);
    }
    // ribbon tails
    const ribbons = [];
    for (const sx of [-1, 1]) {
      const chain = [bottom];
      for (let s = 1; s <= 7; s++) {
        const p = S.p[bottom].clone().add(new THREE.Vector3(sx * 0.006 * sc + sx * s * 0.0015, this.mode === 'hang' ? -s * 0.016 * sc : 0.001, this.mode === 'hang' ? 0.003 : s * 0.016 * sc));
        const id = S.node(p);
        S.link(chain[chain.length - 1], id);
        chain.push(id);
      }
      ribbons.push(chain);
    }
    this.tassels = tassels;
    this.ribbonChains = ribbons;
    // ---- strands carrying buds: edges along the loop and the tassels ----
    const edges = [];
    for (let k = 0; k < loopN; k++) edges.push([loop[k], loop[(k + 1) % loopN], 4]);
    for (const ch of tassels) for (let s = 0; s < ch.length - 1; s++) edges.push([ch[s], ch[s + 1], 3]);
    this.edges = edges;
    // ---- buds (instanced lathe) ----
    const buds = [];
    const ringStep = 0.0042 * sc;
    for (const [i, j, perRing] of edges) {
      const L = S.p[i].distanceTo(S.p[j]);
      const rings = Math.max(1, Math.round(L / ringStep));
      for (let r = 0; r < rings; r++) {
        for (let b = 0; b < perRing; b++) {
          buds.push({ i, j, t: (r + 0.5) / rings, phi: (b / perRing) * Math.PI * 2 + r * 2.4 + rng() * 0.4, tilt: rng.range(0.15, 0.45), spin: rng() * 6, s: sc * rng.range(0.85, 1.12), th: rng() });
        }
      }
    }
    this.buds = buds;
    this.budMesh = new THREE.InstancedMesh(budGeometry(), M.bud, buds.length);
    this.budMesh.name = 'garlandBuds';
    this.budMesh.frustumCulled = false;
    this.group.add(this.budMesh);
    // ---- cards ----
    const cards = [];
    const add = (cellIdx, list) => cards.push({ cell: cellIdx, ...list });
    // open blossoms sprinkled on the loop
    for (const [i, j] of edges.slice(0, loopN)) {
      if (rng() < 0.75) add(CARD.blossom, { i, j, t: rng(), phi: rng() * 6.28, size: sc * rng.range(0.016, 0.021), face: 0.45, off: 0.0055 * sc, th: rng(), wilts: 1 });
    }
    // the ornament at the bottom: rose framed by crown flowers, marigolds and leaves
    const bi = bottom, bj = this.mode === 'hang' ? loop[loopN / 2 + 1] : loop[(Math.round(loopN * 0.75) + 1) % loopN];
    for (let k = 0; k < 5; k++) add(CARD.leaf, { i: bi, j: bj, t: 0, phi: (k / 5) * 6.28, size: sc * 0.026, face: 0.55, off: 0.009 * sc, th: rng(), wilts: 0.6, back: 0.002 });
    for (let k = 0; k < 5; k++) add(CARD.crown, { i: bi, j: bj, t: 0, phi: (k / 5) * 6.28 + 0.6, size: sc * 0.017, face: 0.6, off: 0.011 * sc, th: rng(), wilts: 1 });
    add(CARD.marigold, { i: bi, j: bj, t: 0, phi: 2.2, size: sc * 0.022, face: 0.7, off: 0.008 * sc, th: rng(), wilts: 0.8 });
    add(CARD.marigold, { i: bi, j: bj, t: 0, phi: 4.0, size: sc * 0.02, face: 0.7, off: 0.008 * sc, th: rng(), wilts: 0.8 });
    add(CARD.rose, { i: bi, j: bj, t: 0, phi: 0, size: sc * 0.03, face: 0.85, off: 0.013 * sc, th: rng(), wilts: 0.7, front: 0.004 });
    // tassel ends
    tassels.forEach((ch, k) => {
      const e = ch.length - 1;
      add(k === 1 ? CARD.rose : CARD.marigold, { i: ch[e - 1], j: ch[e], t: 1, phi: k * 2, size: sc * (k === 1 ? 0.017 : 0.015), face: 0.8, off: 0.004 * sc, th: rng(), wilts: 0.8 });
      add(CARD.budPair, { i: ch[e - 1], j: ch[e], t: 1, phi: k * 2 + 3, size: sc * 0.014, face: 0.5, off: 0.006 * sc, th: rng(), wilts: 1, along: true });
    });
    this.cards = cards;
    // one InstancedMesh per cell (the atlas uv lives in the geometry)
    this.cardMeshes = {};
    const byCell = {};
    cards.forEach((c, k) => (byCell[c.cell] = byCell[c.cell] || []).push(k));
    for (const [cellIdx, list] of Object.entries(byCell)) {
      const mesh = new THREE.InstancedMesh(cardGeometry(Number(cellIdx), 1, 1), M.card, list.length);
      mesh.frustumCulled = false;
      mesh.name = 'garlandCards' + cellIdx;
      mesh.userData.list = list;
      this.group.add(mesh);
      this.cardMeshes[cellIdx] = mesh;
    }
    // ---- ribbon strips (dynamic) ----
    this.ribbonMeshes = ribbons.map((ch) => {
      const n = ch.length;
      const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), idx = [];
      for (let s = 0; s < n; s++) {
        uv.set([0.25 + 0.02, 1 - 0.5 - (s / (n - 1)) * 0.0, 0.5 - 0.02, 1 - 0.5], s * 4);
        uv[s * 4 + 1] = 0.5 + 0.48 * (1 - s / (n - 1));
        uv[s * 4 + 3] = 0.5 + 0.48 * (1 - s / (n - 1));
        if (s < n - 1) idx.push(s * 2, s * 2 + 1, s * 2 + 2, s * 2 + 1, s * 2 + 3, s * 2 + 2);
      }
      // ribbon cell is index 5: u 0.25..0.5, v 0.0..0.5 (canvas atlas), or the photobashed satin
      // ribbon_red cell: the central band of the tail, from the knot (top) to above the swallowtail cut
      const rc = photoCards() && flowerCell('ribbon_red', 'front');
      for (let s = 0; s < n; s++) {
        if (rc) {
          const [ru0, rv0, ru1, rv1] = rc.uv;
          uv[s * 4] = ru0 + (ru1 - ru0) * 0.38;
          uv[s * 4 + 2] = ru0 + (ru1 - ru0) * 0.62;
          uv[s * 4 + 1] = uv[s * 4 + 3] = rv1 - (rv1 - rv0) * (0.03 + 0.8 * (s / (n - 1)));
        } else {
          uv[s * 4] = 0.255;
          uv[s * 4 + 2] = 0.495;
          uv[s * 4 + 1] = 0.02 + 0.46 * (s / (n - 1));
          uv[s * 4 + 3] = 0.02 + 0.46 * (s / (n - 1));
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
      g.setIndex(idx);
      const m = new THREE.Mesh(g, M.ribbon);
      m.frustumCulled = false;
      m.name = 'garlandRibbon';
      this.group.add(m);
      return { mesh: m, chain: ch };
    });
    // ---- thread through the loop (visible between buds when it swings) ----
    this.threadEdges = [];
    if (this.mode === 'hang') this.threadEdges.push([0, 1], [1, 2]);
    const tg = new THREE.CylinderGeometry(0.0006, 0.0006, 1, 5, 1, true);
    tg.translate(0, 0.5, 0);
    this.threadMesh = new THREE.InstancedMesh(tg, M.thread, Math.max(1, this.threadEdges.length));
    this.threadMesh.frustumCulled = false;
    this.threadMesh.count = this.threadEdges.length;
    this.group.add(this.threadMesh);
    // ---- falling petals ----
    this.petals = [];
    const pg = cardGeometry(CARD.petal, 1, 1, 0, true);
    this.petalMesh = new THREE.InstancedMesh(pg, M.petal, 14);
    this.petalMesh.frustumCulled = false;
    this.petalMesh.count = 0;
    this.group.add(this.petalMesh);
    this._petalT = 3 + rng() * 10;
    this._wiltApplied = -1;
    this._colors();
    this._layout(true);
  }

  /** per-instance colours from the wilt level (each bud / card browns at its own threshold) */
  _colors() {
    const w = GARLAND_UNIFORMS.uWilt.value;
    this._wiltApplied = w;
    const col = new THREE.Color();
    const tint = (th, wilts) => {
      const k = smoothstep(th * 0.7, th * 0.7 + 0.35, w * wilts);
      col.copy(FRESH).lerp(BROWN, k);
      if (k > 0.8) col.lerp(DRY, (k - 0.8) * 2.5);
      return col;
    };
    this.buds.forEach((b, k) => this.budMesh.setColorAt(k, tint(b.th, 1)));
    this.budMesh.instanceColor.needsUpdate = true;
    for (const mesh of Object.values(this.cardMeshes)) {
      mesh.userData.list.forEach((ci, k) => mesh.setColorAt(k, tint(this.cards[ci].th, this.cards[ci].wilts)));
      mesh.instanceColor.needsUpdate = true;
    }
  }

  /** Taxi.update hook: dt, car-local acceleration, bump kick. */
  step(dt, accX, accZ, kick = 0) {
    const body = this.group.parent;
    // gravity in the (pitching / rolling) body frame, minus the car's acceleration
    body.getWorldQuaternion(_q).invert();
    const a = _v.set(0, -9.81, 0).applyQuaternion(_q);
    const wilt = GARLAND_UNIFORMS.uWilt.value;
    a.x -= accX;
    a.z -= accZ;
    const av = this._a || (this._a = new THREE.Vector3());
    av.copy(a);
    this.S.step(Math.min(dt, 1 / 20), av, kick + (this.mode === 'dash' ? 0 : 0.05), this.mode === 'dash' ? 0.95 : 0.988 - wilt * 0.004);
    if (Math.abs(wilt - this._wiltApplied) > 0.01) this._colors();
    this._petals(dt, kick, av);
    this._layout(false);
  }

  _layout() {
    const S = this.S;
    const body = this.group.parent;
    const cam = this._cam || (this._cam = new THREE.Vector3());
    cam.copy(engine.camera.position);
    body.worldToLocal(cam);
    const droop = GARLAND_UNIFORMS.uWilt.value * 0.6;
    // buds
    this.buds.forEach((b, k) => {
      frameAt(S, b.i, b.j, b.t, _w, _t, _r, b.phi);
      _n.copy(_r).multiplyScalar(1 - b.tilt - droop * 0.3).addScaledVector(_t, b.tilt + droop * 0.3).normalize();
      _q.setFromUnitVectors(UPY, _n);
      _q2.setFromAxisAngle(UPY, b.spin);
      _q.multiply(_q2);
      _w.addScaledVector(_r, 0.0012 * this.scale);
      _s.setScalar(b.s);
      _m.compose(_w, _q, _s);
      this.budMesh.setMatrixAt(k, _m);
    });
    this.budMesh.instanceMatrix.needsUpdate = true;
    // cards: outward + toward the viewer, anchored on the strand
    for (const mesh of Object.values(this.cardMeshes)) {
      mesh.userData.list.forEach((ci, k) => {
        const c = this.cards[ci];
        frameAt(S, c.i, c.j, c.t, _w, _t, _r, c.phi);
        const toCam = _u.subVectors(cam, _w).normalize();
        _n.copy(_r).multiplyScalar(1 - c.face).addScaledVector(toCam, c.face).normalize();
        if (c.back) _n.addScaledVector(toCam, -0.3).normalize();
        _w.addScaledVector(_r, c.off).addScaledVector(toCam, c.front || 0);
        // card up: along the strand (or toward the viewer's up for faces)
        const up = c.along ? _t.clone().negate() : _v.copy(_t).negate().lerp(UPY, 0.5).normalize();
        const x = new THREE.Vector3().crossVectors(up, _n).normalize();
        const y = new THREE.Vector3().crossVectors(_n, x);
        _m.makeBasis(x, y, _n);
        _m.scale(_s.set(c.size, c.size, c.size));
        _m.setPosition(_w);
        mesh.setMatrixAt(k, _m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    // ribbons follow their chains, facing the viewer around the strand
    for (const rb of this.ribbonMeshes) {
      const g = rb.mesh.geometry, pos = g.attributes.position, nrm = g.attributes.normal;
      const ch = rb.chain, n = ch.length;
      const half = 0.0045 * this.scale;
      for (let s = 0; s < n; s++) {
        const p = S.p[ch[s]];
        _t.subVectors(S.p[ch[Math.min(n - 1, s + 1)]], S.p[ch[Math.max(0, s - 1)]]).normalize();
        const toCam = _u.subVectors(cam, p).normalize();
        _r.crossVectors(_t, toCam).normalize();
        const tw = Math.sin(s * 0.9 + this.rng.range(0, 0.01)) * 0.35;
        _r.applyAxisAngle(_t, tw);
        _n.crossVectors(_r, _t).normalize();
        pos.setXYZ(s * 2, p.x - _r.x * half, p.y - _r.y * half, p.z - _r.z * half);
        pos.setXYZ(s * 2 + 1, p.x + _r.x * half, p.y + _r.y * half, p.z + _r.z * half);
        nrm.setXYZ(s * 2, _n.x, _n.y, _n.z);
        nrm.setXYZ(s * 2 + 1, _n.x, _n.y, _n.z);
      }
      pos.needsUpdate = true;
      nrm.needsUpdate = true;
    }
    // thread
    this.threadEdges.forEach(([i, j], k) => {
      _t.subVectors(S.p[j], S.p[i]);
      const L = _t.length();
      _q.setFromUnitVectors(UPY, _t.normalize());
      _m.compose(S.p[i], _q, _s.set(1, L, 1));
      this.threadMesh.setMatrixAt(k, _m);
    });
    this.threadMesh.instanceMatrix.needsUpdate = true;
  }

  _petals(dt, kick, a) {
    const wilt = GARLAND_UNIFORMS.uWilt.value;
    this._petalT -= dt * (1 + wilt * 6 + kick * 2);
    if (this._petalT <= 0 && this.petals.length < this.petalMesh.instanceMatrix.count) {
      this._petalT = 18 + Math.random() * 30;
      const c = this.cards[(Math.random() * this.cards.length) | 0];
      const p = new THREE.Vector3().lerpVectors(this.S.p[c.i], this.S.p[c.j], c.t);
      this.petals.push({ p, v: new THREE.Vector3((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.05), rot: Math.random() * 6, spin: (Math.random() - 0.5) * 6, life: 0, landed: false, floor: this._floorBelow(p), brown: wilt > 0.3 });
    }
    const body = this.group.parent;
    body.getWorldQuaternion(_q).invert();
    let k = 0;
    for (let i = this.petals.length - 1; i >= 0; i--) {
      const P = this.petals[i];
      P.life += dt;
      if (!P.landed) {
        // flutter: terminal velocity ~0.5 m/s with side-slip
        P.v.addScaledVector(a, dt * 0.25);
        P.v.multiplyScalar(Math.exp(-dt * 3.2));
        P.v.x += Math.sin(P.life * 7 + P.rot) * dt * 0.25;
        P.p.addScaledVector(P.v, dt);
        P.rot += P.spin * dt;
        if (P.p.y <= P.floor) {
          P.p.y = P.floor + 0.001;
          P.landed = true;
        }
      }
      if (P.life > 50) {
        this.petals.splice(i, 1);
        continue;
      }
    }
    for (const P of this.petals) {
      const fade = 1 - smoothstep(42, 50, P.life);
      if (P.landed) _q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, P.rot));
      else _q.setFromEuler(new THREE.Euler(Math.sin(P.life * 5) * 0.8 - 0.6, P.rot, Math.cos(P.life * 4) * 0.6));
      _m.compose(P.p, _q, _s.setScalar(0.009 * this.scale * fade));
      this.petalMesh.setMatrixAt(k, _m);
      this.petalMesh.setColorAt(k, P.brown ? BROWN : FRESH);
      k++;
    }
    this.petalMesh.count = k;
    this.petalMesh.instanceMatrix.needsUpdate = true;
    if (this.petalMesh.instanceColor) this.petalMesh.instanceColor.needsUpdate = true;
  }

  /** Landing height below a point: one raycast against the cabin (cached per spawn). */
  _floorBelow(p) {
    if (this.S.floorY !== null) return this.S.floorY + 0.001;
    const t = this.taxi;
    const ray = Garland._ray || (Garland._ray = new THREE.Raycaster());
    const body = this.group.parent;
    const o = body.localToWorld(p.clone());
    ray.set(o, new THREE.Vector3(0, -1, 0).applyQuaternion(body.getWorldQuaternion(new THREE.Quaternion())));
    ray.far = 1.2;
    const targets = t.cabinSurfaces?.() || [];
    const hit = ray.intersectObjects(targets, false).find((h) => h.distance > 0.02);
    if (!hit) return p.y - 0.6;
    return body.worldToLocal(hit.point.clone()).y;
  }

  dispose() {
    this.group.removeFromParent();
    for (const m of [this.budMesh, this.threadMesh, this.petalMesh, ...Object.values(this.cardMeshes)]) m.dispose?.();
    for (const r of this.ribbonMeshes) r.mesh.geometry.dispose();
  }
}

// ---------------------------------------------------------------------------
// Amulets (พระเครื่อง) on chains
// ---------------------------------------------------------------------------
function archShape(w, h, kind) {
  const s = new THREE.Shape();
  if (kind === 'coin') {
    s.absarc(0, 0, w / 2, 0, Math.PI * 2, false);
    return s;
  }
  if (kind === 'rect') {
    const r = w * 0.18;
    s.moveTo(-w / 2 + r, -h / 2);
    s.lineTo(w / 2 - r, -h / 2);
    s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    s.lineTo(w / 2, h / 2 - r);
    s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    s.lineTo(-w / 2 + r, h / 2);
    s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    s.lineTo(-w / 2, -h / 2 + r);
    s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    return s;
  }
  // 'arch': ซุ้มกอ / pointed-arch niche shape
  s.moveTo(-w / 2, -h / 2);
  s.lineTo(w / 2, -h / 2);
  s.lineTo(w / 2, h * 0.12);
  s.bezierCurveTo(w / 2, h * 0.36, w * 0.18, h * 0.4, 0, h / 2);
  s.bezierCurveTo(-w * 0.18, h * 0.4, -w / 2, h * 0.36, -w / 2, h * 0.12);
  s.closePath();
  return s;
}

/**
 * A framed amulet: bevelled metal frame (extruded with a window), the clay / metal tablet
 * with its painted face behind a glass front, and a bail (ห่วง) at the top. Origin = the
 * top of the bail, hanging along -Y.
 */
export function buildAmulet(opts = {}) {
  const M = garlandMaterials();
  const kind = opts.kind || 'arch';
  const w = opts.w ?? 0.024, h = kind === 'coin' ? w : opts.h ?? 0.034, d = opts.d ?? 0.0055;
  const metal = M[opts.metal || 'gold'];
  const g = new THREE.Group();
  g.name = 'amulet';
  const body = new THREE.Group();
  body.position.y = -0.006 - h / 2 - 0.0015;
  g.add(body);
  // frame: outer shape with the window cut out, bevelled
  const outer = archShape(w, h, kind);
  const inner = archShape(w - 0.004, h - 0.004, kind);
  outer.holes.push(new THREE.Path(inner.getPoints(24).reverse()));
  const frame = new THREE.ExtrudeGeometry(outer, { depth: d, bevelEnabled: true, bevelThickness: 0.0009, bevelSize: 0.0007, bevelSegments: 2, curveSegments: 20 });
  frame.translate(0, 0, -d / 2);
  body.add(new THREE.Mesh(frame, metal));
  // back plate
  const back = new THREE.ExtrudeGeometry(archShape(w - 0.002, h - 0.002, kind), { depth: 0.0008, bevelEnabled: false, curveSegments: 20 });
  back.translate(0, 0, -d / 2);
  body.add(new THREE.Mesh(back, metal));
  // the tablet (painted face) recessed in the window, both sides
  const faceTex = (() => {
    try {
      return signTex('amulet_face', {});
    } catch (e) {
      return null;
    }
  })();
  const faceMat = paintedMaterial({ map: faceTex, normalMap: faceTex?.userData?.normalMap || null, color: faceTex ? (opts.tint ?? 0xffffff) : 0x8a6a3a, roughness: 0.6, brush: 0.15, name: 'amulet_face' });
  const faceShape = archShape(w - 0.0045, h - 0.0045, kind);
  const faceGeo = new THREE.ShapeGeometry(faceShape, 20);
  // uv 0..1 over the face
  const uv = faceGeo.attributes.uv, pa = faceGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pa.getX(i) / (w - 0.0045) + 0.5, pa.getY(i) / (h - 0.0045) + 0.5);
  for (const sz of [1, -1]) {
    const f = new THREE.Mesh(faceGeo, faceMat);
    f.position.z = sz * (d / 2 - 0.0012);
    if (sz < 0) f.rotation.y = Math.PI;
    body.add(f);
    const gl = new THREE.Mesh(faceGeo, M.glass);
    gl.position.z = sz * (d / 2 + 0.0002);
    if (sz < 0) gl.rotation.y = Math.PI;
    gl.renderOrder = 3;
    body.add(gl);
  }
  // bail: a ring through the top of the frame + a collar
  const bail = new THREE.TorusGeometry(0.0034, 0.0009, 8, 20);
  const bm = new THREE.Mesh(bail, metal);
  bm.position.y = -0.0035;
  bm.rotation.y = Math.PI / 2;
  g.add(bm);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0022, 0.003, 10), metal);
  collar.position.y = body.position.y + h / 2 + 0.0008;
  g.add(collar);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  g.userData.length = -body.position.y + h / 2;
  return g;
}

let _linkGeo = null;
/** One oval chain link (a stretched torus), long axis +Y. */
function linkGeometry() {
  if (_linkGeo) return _linkGeo;
  _linkGeo = new THREE.TorusGeometry(0.0016, 0.00042, 6, 14);
  _linkGeo.scale(1, 1.55, 1);
  return _linkGeo;
}

/** Amulets hanging from one point on fine chains (verlet), each link modelled. */
export class AmuletCluster {
  constructor(taxi, parent, at, specs) {
    this.taxi = taxi;
    this.group = new THREE.Group();
    this.group.name = 'amulets';
    parent.add(this.group);
    const S = (this.S = new Strands());
    this.items = [];
    const linkLen = 0.0042;
    let totalLinks = 0;
    for (const sp of specs) {
      const top = S.node(at.clone().add(new THREE.Vector3(sp.dx ?? 0, 0, sp.dz ?? 0)), true);
      const chain = [top];
      const n = Math.max(2, Math.round(sp.len / linkLen));
      for (let k = 1; k <= n; k++) {
        const id = S.node(S.p[top].clone().add(new THREE.Vector3(0, -k * linkLen, 0)));
        S.link(chain[chain.length - 1], id);
        chain.push(id);
      }
      const am = buildAmulet(sp);
      this.group.add(am);
      totalLinks += n;
      this.items.push({ chain, mesh: am, twist: sp.twist ?? 0 });
    }
    const M = garlandMaterials();
    this.links = new THREE.InstancedMesh(linkGeometry(), M[specs[0]?.chainMetal || 'brass'], totalLinks);
    this.links.frustumCulled = false;
    this.group.add(this.links);
  }
  step(dt, accX, accZ, kick = 0) {
    const body = this.group.parent;
    body.getWorldQuaternion(_q).invert();
    const a = (this._a || (this._a = new THREE.Vector3())).set(0, -9.81, 0).applyQuaternion(_q);
    a.x -= accX;
    a.z -= accZ;
    this.S.step(Math.min(dt, 1 / 20), a, kick + 0.03, 0.992);
    const S = this.S;
    let k = 0;
    for (const it of this.items) {
      const ch = it.chain;
      for (let s = 1; s < ch.length; s++) {
        _t.subVectors(S.p[ch[s]], S.p[ch[s - 1]]);
        _q.setFromUnitVectors(UPY, _t.clone().normalize());
        // alternate links turn 90 degrees about the chain
        if (s % 2) _q.multiply(_q2.setFromAxisAngle(UPY, Math.PI / 2));
        _w.lerpVectors(S.p[ch[s]], S.p[ch[s - 1]], 0.5);
        _m.compose(_w, _q, _s.set(1, 1, 1));
        this.links.setMatrixAt(k++, _m);
      }
      // the amulet hangs from the last link, along the last segment
      const e = ch.length - 1;
      _t.subVectors(S.p[ch[e - 1]], S.p[ch[e]]).normalize(); // up along the chain
      _q.setFromUnitVectors(UPY, _t);
      _q.multiply(_q2.setFromAxisAngle(UPY, it.twist + Math.sin(performance.now() * 0.0004 + it.twist) * 0.25));
      it.mesh.position.copy(S.p[ch[e]]);
      it.mesh.quaternion.copy(_q);
    }
    this.links.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    this.group.removeFromParent();
    this.links.dispose();
  }
}

// ---------------------------------------------------------------------------
// Ignition key (modelled): extruded blade with cut bitting, rubber-covered bow with a ring
// hole, split ring and a small amulet tag. +Z points out of the lock.
// ---------------------------------------------------------------------------
export function buildKeyModel(swings) {
  const M = garlandMaterials();
  const key = new THREE.Group();
  key.name = 'key';
  // blade profile in (z, y): shoulder at z = 0.004, tip at z = -0.022 (inside the lock)
  const blade = new THREE.Shape();
  const cuts = [0.0, -0.0015, 0.0005, -0.002, -0.0005, -0.0018, 0.0];
  blade.moveTo(0.004, -0.0042);
  blade.lineTo(-0.019, -0.0042);
  blade.lineTo(-0.023, -0.0012);
  blade.lineTo(-0.023, 0.0016);
  for (let k = 0; k < cuts.length; k++) {
    const z = -0.021 + k * 0.0034;
    blade.lineTo(z, 0.003 + cuts[k]);
    blade.lineTo(z + 0.0017, 0.0042 + cuts[k] * 0.5);
  }
  blade.lineTo(0.004, 0.0042);
  blade.closePath();
  const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.0018, bevelEnabled: true, bevelThickness: 0.0002, bevelSize: 0.0002, bevelSegments: 1 });
  // shape space (x->z, y->y), extrude along x
  bg.rotateY(-Math.PI / 2);
  bg.translate(0.0009, 0, 0);
  // groove along the blade
  const bladeMesh = new THREE.Mesh(bg, M.silver);
  key.add(bladeMesh);
  // bow: rounded trapezoid, black rubber, ring hole
  const bow = new THREE.Shape();
  bow.moveTo(-0.009, 0.004);
  bow.bezierCurveTo(-0.012, 0.014, -0.012, 0.026, 0, 0.03);
  bow.bezierCurveTo(0.012, 0.026, 0.012, 0.014, 0.009, 0.004);
  bow.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0.0235, 0.0026, 0, Math.PI * 2, true);
  bow.holes.push(hole);
  const bowG = new THREE.ExtrudeGeometry(bow, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0012, bevelSegments: 3, curveSegments: 16 });
  // shape (x, y) -> key (y, z): bow stands out of the lock along +Z
  bowG.translate(0, 0, -0.003);
  bowG.rotateX(Math.PI / 2); // shape y -> +Z (out of the lock)
  bowG.rotateZ(Math.PI / 2); // flat in the blade's plane (thin along X)
  const bowMat = paintedMaterial({ color: 0x141312, roughness: 0.55, brush: 0.15, name: 'key_bow' });
  key.add(new THREE.Mesh(bowG, bowMat));
  // split ring through the hole + a small brass amulet tag on two links
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0085, 0.0007, 6, 28), M.silver);
  ring.position.set(0, -0.0075, 0.0235); // threaded through the hole, hanging below the bow
  key.add(ring);
  const kp = new THREE.Group();
  kp.position.set(0, -0.0145, 0.0235);
  const tag = buildAmulet({ kind: 'coin', w: 0.014, d: 0.003, metal: 'brass', variant: 2 });
  kp.add(tag);
  key.add(kp);
  if (swings) swings.push(new PendulumSwing(kp, 0.02, 3));
  key.visible = false;
  return key;
}

/** Small pendulum (key fob): same step() signature as the garland. */
export class PendulumSwing {
  constructor(pivot, length, damping = 1.6) {
    this.pivot = pivot;
    this.len = length;
    this.ax = this.az = this.vx = this.vz = 0;
    this.damping = damping;
  }
  step(dt, accX, accZ, kick = 0) {
    const g = 9.81, L = this.len;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.vx += (-(g / L) * Math.sin(this.ax) + (accZ / L) * Math.cos(this.ax) - this.damping * this.vx) * h + kick * (Math.random() - 0.5) * 0.4;
      this.vz += (-(g / L) * Math.sin(this.az) - (accX / L) * Math.cos(this.az) - this.damping * this.vz) * h + kick * (Math.random() - 0.5) * 0.4;
      this.ax += this.vx * h;
      this.az += this.vz * h;
    }
    this.ax = clamp(this.ax, -1.2, 1.2);
    this.az = clamp(this.az, -1.2, 1.2);
    this.pivot.rotation.x = this.ax;
    this.pivot.rotation.z = this.az;
  }
}
