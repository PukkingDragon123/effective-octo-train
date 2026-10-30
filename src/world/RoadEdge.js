// Near-field road-edge detail: the crumbling asphalt lip, gravel, pebbles, fallen leaves and
// dead twigs collecting where the tarmac meets the shoulder. Built like the forest species
// (variants of real, sculpted geometry; drawn by the forest's pools with the rock / bark /
// ground-leaf materials, so no extra draw calls) and only shown within ~40 m of the camera.
import * as THREE from 'three';
import { SimplexNoise } from '../core/math.js';
import { GeoBuilder, addTube } from './TreeFactory.js';
import { SLOT, slotRect } from './foliageAtlas.js';

const TAU = Math.PI * 2;
let _nz = null;
const nz = () => _nz || (_nz = new SimplexNoise(8086));

/** One small sculpted stone (icosphere displaced by noise, flattened, cut flat underneath). */
function stone(B, rng, cx, cz, r, flat, tint, o = {}) {
  const g = new THREE.IcosahedronGeometry(1, o.detail ?? 1);
  const p = g.attributes.position;
  const seed = rng() * 100;
  const sx = r * (0.8 + rng() * 0.5), sz = r * (0.8 + rng() * 0.5), sy = r * flat;
  const yaw = rng() * TAU;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const v = new THREE.Vector3();
  const pts = [];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = 1 + nz().noise3D(v.x * 1.7 + seed, v.y * 1.7, v.z * 1.7) * 0.28 + nz().noise3D(v.x * 4.3, v.y * 4.3 + seed, v.z * 4.3) * 0.08;
    let x = v.x * d * sx, y = v.y * d * sy, z = v.z * d * sz;
    if (y < -0.25 * sy) y = -0.25 * sy + (y + 0.25 * sy) * 0.2; // bedded in the soil
    pts.push([cx + x * c - z * s, y + sy * 0.3 + (o.lift ?? 0), cz + x * s + z * c]);
  }
  const base = B.count;
  // flat-shaded facets read as chipped stone at this size: per-face normals
  const idx = g.index ? g.index.array : null;
  const triCount = idx ? idx.length / 3 : p.count / 3;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
    a.fromArray(pts[i0]);
    b.fromArray(pts[i1]);
    cc.fromArray(pts[i2]);
    n.subVectors(b, a).cross(cc.clone().sub(a)).normalize();
    // blend toward the smooth (radial) normal so the stones stay soft and painterly
    const mx = (a.x + b.x + cc.x) / 3 - cx, my = (a.y + b.y + cc.y) / 3 - sy * 0.3, mz = (a.z + b.z + cc.z) / 3 - cz;
    const ml = Math.hypot(mx, my / Math.max(flat, 0.2), mz) || 1;
    n.multiplyScalar(0.55).add(new THREE.Vector3(mx / ml, my / Math.max(flat, 0.2) / ml, mz / ml).multiplyScalar(0.45)).normalize();
    for (const P of [a, b, cc]) {
      const top = Math.max(0, n.y);
      const k = (0.82 + 0.3 * nz().noise3D(P.x * 9 + seed, P.y * 9, P.z * 9)) * (0.7 + 0.3 * top);
      const moss = o.moss ? Math.max(0, Math.min(1, (n.y - 0.4) * 2 + nz().noise3D(P.x * 5, P.y * 5, P.z * 5 + seed) * 0.6)) * o.moss : 0;
      B.v(P.x, P.y, P.z, n.x, n.y, n.z, 0, 0, (tint[0] * (1 - moss) + 0.26 * moss) * k, (tint[1] * (1 - moss) + 0.33 * moss) * k, (tint[2] * (1 - moss) + 0.12 * moss) * k);
    }
    B.t(base + t * 3, base + t * 3 + 1, base + t * 3 + 2);
  }
  g.dispose();
}

/** A chip of broken asphalt: irregular slab (jittered polygon), bevelled top edge, aggregate speckle. */
function asphaltChip(B, rng, cx, cz, r, h, tilt) {
  const n = 7 + Math.floor(rng() * 4);
  const ring = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (rng() - 0.5) * 0.5;
    const rr = r * (0.6 + rng() * 0.55);
    ring.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  const yaw = rng() * TAU, cy = Math.cos(yaw), sy = Math.sin(yaw);
  const tx = (rng() - 0.5) * tilt, tz = (rng() - 0.5) * tilt;
  const P = (x, y, z) => {
    const X = x * cy - z * sy, Z = x * sy + z * cy;
    return [cx + X, y + X * tx + Z * tz, cz + Z];
  };
  const seed = rng() * 50;
  const col = (x, z, top) => {
    const k = 0.17 + 0.05 * nz().noise2D(x * 40 + seed, z * 40) + (nz().noise2D(x * 90, z * 90 + seed) > 0.55 ? 0.12 : 0) + (top ? 0.02 : -0.03);
    return [k * 1.02, k, k * 0.96];
  };
  const bev = 0.25; // bevel inset fraction of the height
  const base = B.count;
  // top cap (fan) at full height, inset ring for the bevel
  const top = P(0, h, 0);
  B.v(top[0], top[1], top[2], 0, 1, 0, 0, 0, ...col(cx, cz, true));
  for (let i = 0; i < n; i++) {
    const [x, z] = ring[i];
    const q = P(x * (1 - bev * 0.35), h, z * (1 - bev * 0.35));
    B.v(q[0], q[1], q[2], 0, 1, 0, 0, 0, ...col(q[0], q[2], true));
  }
  for (let i = 0; i < n; i++) B.t(base, base + 1 + ((i + 1) % n), base + 1 + i);
  // bevel + walls: rings at (inset, h), (outer, h*(1-bev)), (outer*1.03, -0.01)
  const rings = [
    [1 - bev * 0.35, h],
    [1, h * (1 - bev)],
    [1.04, -0.012],
  ];
  const r0 = B.count;
  for (const [f, y] of rings) {
    for (let i = 0; i < n; i++) {
      const [x, z] = ring[i];
      const q = P(x * f, y, z * f);
      const l = Math.hypot(x, z) || 1;
      const ny = y > h * 0.9 ? 0.75 : 0.15;
      B.v(q[0], q[1], q[2], (x / l) * (1 - ny), ny, (z / l) * (1 - ny), 0, 0, ...col(q[0], q[2], false));
    }
  }
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < n; i++) {
      const a = r0 + k * n + i, b = r0 + k * n + ((i + 1) % n), c = a + n, d = b + n;
      B.t(a, b, c);
      B.t(b, d, c);
    }
  }
}

/** A drift of fallen leaves: a few gently curled cards lying on the ground (atlas leaf clusters). */
function leafLitter(B, rng, cx, cz, size, slot, tint) {
  const R = slotRect(slot);
  const nCards = 2 + Math.floor(rng() * 3);
  for (let k = 0; k < nCards; k++) {
    const a = rng() * TAU, d = rng() * size * 0.5;
    const px = cx + Math.cos(a) * d, pz = cz + Math.sin(a) * d;
    const w = size * (0.55 + rng() * 0.5), l = w * (0.8 + rng() * 0.4);
    const yaw = rng() * TAU, c = Math.cos(yaw), s = Math.sin(yaw);
    const curl = 0.04 + rng() * 0.05;
    const N = 3;
    const base = B.count;
    const shade = 0.75 + rng() * 0.35;
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const u = i / N - 0.5, v = j / N - 0.5;
        const x = u * w, z = v * l;
        const y = 0.012 + k * 0.004 + curl * (u * u * 4) * w + (rng() - 0.5) * 0.006;
        const X = px + x * c - z * s, Z = pz + x * s + z * c;
        const nx = -u * curl * 6, ny = 1;
        const nl = Math.hypot(nx, ny);
        B.v(X, y, Z, (nx * c) / nl, ny / nl, (nx * s) / nl, R.u0 + (R.u1 - R.u0) * (i / N), R.v0 + (R.v1 - R.v0) * (j / N), tint[0] * shade, tint[1] * shade, tint[2] * shade);
      }
    }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a0 = base + j * (N + 1) + i, b0 = a0 + 1, c0 = a0 + N + 1, d0 = c0 + 1;
        B.t(a0, c0, b0);
        B.t(b0, c0, d0);
      }
    }
  }
}

/** Dead twigs: thin forked sticks lying in the grass. */
function twigs(B, rng, cx, cz, len) {
  const n = 2 + Math.floor(rng() * 3);
  for (let k = 0; k < n; k++) {
    const a = rng() * TAU;
    let x = cx + (rng() - 0.5) * 0.3, z = cz + (rng() - 0.5) * 0.3, ang = a;
    const L = len * (0.5 + rng() * 0.7);
    const r = 0.006 + rng() * 0.008;
    const pts = [];
    const segs = 5;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      pts.push({ x, y: r * 0.8 + Math.sin(t * 3 + k) * 0.01, z, r: r * (1 - t * 0.6) });
      ang += (rng() - 0.5) * 0.5;
      x += Math.cos(ang) * (L / segs);
      z += Math.sin(ang) * (L / segs);
    }
    const tint = [0.42 + rng() * 0.1, 0.36 + rng() * 0.06, 0.28];
    addTube(B, pts, { radial: 4, color: () => tint, uMeters: 0.2, vMeters: 0.4 });
    if (rng() < 0.6) {
      const q = pts[2];
      const b = [];
      let bx = q.x, bz = q.z, ba = ang + (rng() < 0.5 ? 1 : -1) * (0.6 + rng() * 0.5);
      for (let i = 0; i <= 3; i++) {
        b.push({ x: bx, y: q.y, z: bz, r: q.r * 0.7 * (1 - i * 0.2) });
        bx += Math.cos(ba) * L * 0.12;
        bz += Math.sin(ba) * L * 0.12;
      }
      addTube(B, b, { radial: 3, color: () => tint, uMeters: 0.2, vMeters: 0.4 });
    }
  }
}

/**
 * Road-edge species for the forest: name -> { variants, build(rng, v) -> {lods:[{part: geo}]} }.
 * Parts: 'rock' (rock material), 'leaves' (ground foliage), 'bark' (twigs).
 */
export const EDGE_SPECIES = {
  edgeGravel: {
    variants: 4,
    build(rng) {
      const B = new GeoBuilder();
      const n = 6 + Math.floor(rng() * 6);
      for (let i = 0; i < n; i++) {
        const big = i < 2;
        const r = big ? 0.05 + rng() * 0.05 : 0.015 + rng() * 0.025;
        const g = 0.42 + rng() * 0.16;
        stone(B, rng, (rng() - 0.5) * 0.7, (rng() - 0.5) * 0.45, r, 0.5 + rng() * 0.3, [g * 1.03, g, g * 0.92], { detail: big ? 2 : 1, moss: big ? 0.6 : 0 });
      }
      return { lods: [{ rock: B.build() }] };
    },
  },
  edgeChips: {
    variants: 4,
    build(rng) {
      const B = new GeoBuilder();
      const n = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) asphaltChip(B, rng, (rng() - 0.5) * 0.6, (rng() - 0.5) * 0.35, 0.05 + rng() * 0.09, 0.02 + rng() * 0.025, 0.4);
      for (let i = 0; i < 5; i++) {
        const g = 0.3 + rng() * 0.12;
        stone(B, rng, (rng() - 0.5) * 0.7, (rng() - 0.5) * 0.4, 0.012 + rng() * 0.018, 0.6, [g, g * 0.98, g * 0.94]);
      }
      return { lods: [{ rock: B.build() }] };
    },
  },
  edgeLitter: {
    variants: 4,
    build(rng, v) {
      const B = new GeoBuilder();
      const slot = [SLOT.smallDark, SLOT.broadB, SLOT.small, SLOT.deadTwigs][v % 4];
      const tint = v % 2 ? [0.55, 0.42, 0.24] : [0.44, 0.4, 0.22];
      leafLitter(B, rng, 0, 0, 0.55 + rng() * 0.35, slot, tint);
      return { lods: [{ leaves: B.build() }] };
    },
  },
  edgeTwigs: {
    variants: 3,
    build(rng) {
      const B = new GeoBuilder();
      twigs(B, rng, 0, 0, 0.45 + rng() * 0.3);
      return { lods: [{ bark: B.build() }] };
    },
  },
};
