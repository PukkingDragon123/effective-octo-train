// Hidden pond: dark rippling water (animated normal map + cheap env reflection), muddy
// banks with stones, lotus pads and flowers, reed clumps.
import * as THREE from 'three';
import { Kit, bevelBox, bbox, lathe, cyl, tube, sphere, quad, smoothPath, blob, makeRng, noise } from './lib/kit.js';
import { mat, nightEnvTex } from './lib/materials.js';
import { paintedMaterial, GLOBAL_UNIFORMS } from '../render/index.js';
import { tex } from '../textures/index.js';
import { G } from './lib/small.js';
import { flowerHead } from './lib/flowers.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function waterMaterial(seed) {
  let nm = null;
  try {
    nm = tex('water_ripple', { repeat: [3, 3] });
  } catch (e) {
    nm = null;
  }
  const m = paintedMaterial({
    color: 0x0c1a1a, roughness: 0.06, metalness: 0.35, normalMap: nm, brush: 0.15, wet: 1, name: 'props_pondWater',
  });
  if (m.normalScale) m.normalScale.set(0.35, 0.35);
  m.envMap = nightEnvTex();
  m.envMapIntensity = 1.2;
  m.userData.perInstance = true;
  return m;
}

/**
 * opts {seed, radius=6, lotus=34, reeds=true} -> { object, colliders, waterLevel, waterMesh }
 * Water surface sits at y = 0.035 above flat ground, inside a low muddy rim (no terrain cut needed;
 * the world should flatten the terrain within radius*1.35).
 */
export function createPond(opts = {}) {
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed * 61 + 5);
  const R = opts.radius ?? 6;
  const WL = 0.035; // water sits on flat ground (the world should flatten terrain under radius*1.3)
  const group = new THREE.Group();
  group.name = 'pond';
  // outline (irregular)
  const N = 48;
  const outline = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = R * (1 + 0.22 * noise.noise2D(Math.cos(a) * 1.2 + seed, Math.sin(a) * 1.2) + 0.08 * Math.sin(a * 3 + seed));
    outline.push([Math.cos(a) * r, Math.sin(a) * r * 0.8]);
  }
  // water surface
  const wpos = [0, WL, 0], widx = [];
  for (let i = 0; i < N; i++) wpos.push(outline[i][0] * 1.02, WL, outline[i][1] * 1.02);
  for (let i = 0; i < N; i++) widx.push(0, 1 + ((i + 1) % N), 1 + i);
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
  const wuv = [];
  for (let i = 0; i < wpos.length; i += 3) wuv.push(wpos[i] * 0.15, wpos[i + 2] * 0.15);
  wg.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
  wg.setIndex(widx);
  wg.computeVertexNormals();
  const wm = waterMaterial(seed);
  const water = new THREE.Mesh(wg, wm);
  water.name = 'pondWater';
  water.receiveShadow = true;
  let lastT = -1;
  water.onBeforeRender = () => {
    const t = GLOBAL_UNIFORMS.uTime.value;
    if (t === lastT || !wm.normalMap) return;
    lastT = t;
    wm.normalMap.offset.set(t * 0.006, t * 0.004);
  };
  group.add(water);

  const k = new Kit(seed, { grime: 0, mossLow: 0.6, mossH: 0.3, moss: 0.5, vary: 0.25, ground: WL });
  // muddy bank ring: from the water line out and up to ground level
  const rings = 4;
  const bpos = [], bidx = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    for (let i = 0; i < N; i++) {
      const [x, z] = outline[i];
      const sc = 0.95 + t * 0.4;
      // rim: dips just under the water at the inner edge, rises to a low bank, falls back to the ground
      const y = t < 0.15 ? WL - 0.03 : t < 0.6 ? WL + 0.02 + Math.sin(((t - 0.15) / 0.45) * Math.PI * 0.5) * 0.08 : 0.11 * (1 - (t - 0.6) / 0.4) - 0.01;
      bpos.push(x * sc, y + (t > 0.05 && t < 0.95 ? noise.noise2D(x * 1.3, z * 1.3) * 0.025 : 0), z * sc);
    }
  }
  for (let r = 0; r < rings; r++) for (let i = 0; i < N; i++) {
    const a = r * N + i, b = r * N + ((i + 1) % N), c = (r + 1) * N + i, d = (r + 1) * N + ((i + 1) % N);
    bidx.push(a, c, b, b, c, d);
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bpos, 3));
  bg.setIndex(bidx);
  bg.computeVertexNormals();
  k.add(mat('soil'), bg, { color: 0x3e3226, w: { mossLow: 0.0, moss: 0.6, ground: WL }, colorFn: (p, n, c) => { if (p.y < WL + 0.03) c.multiplyScalar(0.5); } });
  // stones along the bank
  for (let i = 0; i < 22; i++) {
    const o = outline[Math.floor(rng() * N)];
    const sc = 1.0 + rng() * 0.25;
    const s = 0.15 + rng() * 0.35;
    k.add(mat('stone'), G('pstone' + (i % 5), () => bevelBox(1, 0.6, 0.8, 0.2, 0.3, 2)), { p: [o[0] * sc, WL + 0.05, o[1] * sc], r: [rng(), rng() * 6, rng() * 0.5], s: [s, s * 0.7, s * 0.9], color: 0x6a665c, jitter: 0.12, jitterFreq: 3, w: { moss: 0.9, mossLow: 0.6, mossH: 0.15 } });
  }
  // lotus pads (notched discs with slightly raised rims), clustered
  const nPads = opts.lotus ?? 34;
  const clusterC = [[R * 0.35, R * 0.1], [-R * 0.3, -R * 0.25], [R * 0.05, R * 0.45]];
  for (let i = 0; i < nPads; i++) {
    const c = clusterC[i % 3];
    const x = c[0] + (rng() - 0.5) * R * 0.6, z = c[1] + (rng() - 0.5) * R * 0.5;
    const r = 0.16 + rng() * 0.22;
    k.add(mat('flower'), G('lotuspad', () => {
      const g = new THREE.CircleGeometry(1, 18, 0.25, Math.PI * 2 - 0.5);
      g.rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const rr = Math.hypot(p.getX(v), p.getZ(v));
        p.setY(v, rr > 0.85 ? (rr - 0.85) * 0.25 : 0);
      }
      g.computeVertexNormals();
      return g;
    }), { p: [x, WL + 0.012, z], r: rng() * 6, s: r, color: rng() < 0.2 ? 0x6a6a2a : 0x2e5a26, w: { vary: 0.35, moss: 0 }, colorFn: (p, n, cc, lp) => { const rr = Math.hypot(lp.x, lp.z); if (rr > 0.9) cc.multiplyScalar(0.7); if (Math.abs(Math.sin(Math.atan2(lp.z, lp.x) * 9)) < 0.08) cc.multiplyScalar(0.8); } });
  }
  // lotus flowers (photobashed open blooms and buds, cross-carded) + seed pods on curved stalks
  for (let i = 0; i < 9; i++) {
    const c = clusterC[i % 3];
    const x = c[0] + (rng() - 0.5) * R * 0.5, z = c[1] + (rng() - 0.5) * R * 0.4;
    const h = 0.15 + rng() * 0.35;
    const lean = [(rng() - 0.5) * 0.08, 0, (rng() - 0.5) * 0.08];
    const top = V(x + lean[0] * h * 2, WL + h, z + lean[2] * h * 2);
    k.add(mat('flower'), tube([V(x, WL, z), V(x + lean[0] * h, WL + h * 0.6, z + lean[2] * h), top], 0.007, 4), { color: 0x3a5a2a, w: false });
    if (i % 3 === 2) {
      k.add(mat('flower'), G('seedpod', () => cyl(0.045, 0.025, 0.05, 10, 0.005)), { p: [top.x, top.y, top.z], color: 0x5a6a3a, w: false });
      continue;
    }
    const bud = i % 4 === 1;
    const wilted = i === 7;
    flowerHead(k, bud ? 'lotus_bud' : 'lotus', {
      p: [top.x, top.y + (bud ? 0.05 : 0.04), top.z], dir: [lean[0] * 2, 1, lean[2] * 2], size: bud ? 0.14 : 0.2,
      wilted, sides: 2, spin: rng() * 6, shade: 0.9 + rng() * 0.2,
    });
  }
  // a few fallen petals floating on the water
  for (let i = 0; i < 6; i++) {
    const c = clusterC[i % 3];
    flowerHead(k, 'petals', { p: [c[0] + (rng() - 0.5) * R * 0.6, WL + 0.006, c[1] + (rng() - 0.5) * R * 0.5], dir: [0, 1, 0], size: 0.18, sides: 0, spin: rng() * 6 });
  }
  // reed clumps along the bank
  if (opts.reeds !== false) {
    for (let c = 0; c < 9; c++) {
      const o = outline[Math.floor(rng() * N)];
      const cx = o[0] * 0.93, cz = o[1] * 0.93;
      for (let i = 0; i < 16; i++) {
        const h = 0.6 + rng() * 1.1;
        const bx = cx + (rng() - 0.5) * 0.5, bz = cz + (rng() - 0.5) * 0.5;
        const lean = [(rng() - 0.5) * 0.4, rng() * 6, (rng() - 0.5) * 0.3];
        k.add(mat('flower'), G('reed:' + Math.round(h * 10), () => {
          const hh = Math.round(h * 10) / 10;
          const g = new THREE.PlaneGeometry(0.03, hh, 1, 4);
          g.translate(0, hh / 2, 0);
          const p = g.attributes.position;
          for (let v = 0; v < p.count; v++) { const y = p.getY(v) / hh; p.setX(v, p.getX(v) * (1 - y * 0.9)); p.setZ(v, y * y * 0.15); }
          g.computeVertexNormals();
          return g;
        }), { p: [bx, WL - 0.02, bz], r: lean, color: rng() < 0.3 ? 0x8a8a4a : 0x4a6a2a, uv: 'keep', w: { vary: 0.3, moss: 0 } });
        if (rng() < 0.12) k.add(mat('flower'), G('cattail', () => cyl(0.018, 0.018, 0.12, 6, 0.008)), { p: [bx, WL - 0.02 + h * 0.85, bz], r: lean, color: 0x4a3020, w: false });
      }
    }
  }
  group.add(k.build({ name: 'pond', detailDistance: 50 }));
  return { object: group, waterMesh: water, waterLevel: WL, colliders: [{ x: 0, z: 0, r: R * 0.85 }] };
}
