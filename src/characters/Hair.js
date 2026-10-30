// Hair: an SDF-sculpted cap (short / gray / messy / pompadour / bun / bob
// volumes, clipped at the hairline, strand-flow UVs) plus alpha strand cards
// (long hair, ponytail, bob ends, messy tufts) driven by a verlet simulation
// with shape matching (keeps the style), gravity, inertia and head/torso
// collisions. One mesh, one material, parented to the head bone.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, makeRng, noise } from '../core/math.js';
import { paintedMaterial } from '../render/index.js';
import { ellipsoid, sphere, custom, smin, sdEllipsoid, primsBounds } from './SDF.js';
import { meshPart } from './BodyBuilder.js';
import { hairRGB } from './Face.js';
import { BONE_INDEX as BI } from './Rig.js';

/** Hairline height (head-local y) at azimuth th (0 = front, +-PI = back). Shared with Face.js. */
export function hairlineY(th, F, P, style) {
  const a = Math.abs(th);
  const hs = F.hs;
  const male = !P.fem;
  const reced = male && P.age > 45 ? 0.01 * hs : 0;
  if (a < 0.6) return F.browY + (0.05 - (P.fem ? 0.004 : 0)) * hs + reced * (a < 0.35 ? 1 : 0.4);
  if (a < 1.25) return lerp(F.browY + 0.048 * hs + reced * 0.4, 0.068 * hs, (a - 0.6) / 0.65);
  if (a < 1.75) return lerp(0.072 * hs, 0.08 * hs, (a - 1.25) / 0.5); // above the ears
  return lerp(0.068 * hs, -0.03 * hs, (a - 1.75) / (Math.PI - 1.75)); // nape
}

let _tex = null;
/** Shared strand texture: left half opaque strands (caps), right half alpha strands (cards). Greyscale; tinted by colour. */
function strandTexture() {
  if (_tex) return _tex;
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rng = makeRng(77);
  // cap half: base + many strands along v
  g.fillStyle = 'rgb(120,120,120)';
  g.fillRect(0, 0, W / 2, H);
  for (let i = 0; i < 2600; i++) {
    const x = rng() * (W / 2), y = rng() * H;
    const v = 60 + rng() * 140;
    g.strokeStyle = `rgba(${v},${v},${v},${0.35 + rng() * 0.4})`;
    g.lineWidth = 0.6 + rng() * 1.6;
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + (rng() - 0.5) * 6, y + 20, x + (rng() - 0.5) * 8, y + 45, x + (rng() - 0.5) * 6, y + 60 + rng() * 60);
    g.stroke();
  }
  // card half: transparent background, clumped strands with alpha
  for (let cl = 0; cl < 22; cl++) {
    const cx = W / 2 + 8 + rng() * (W / 2 - 16);
    const n = 30 + Math.floor(rng() * 40);
    for (let i = 0; i < n; i++) {
      const x0 = cx + (rng() - 0.5) * 34;
      const v = 70 + rng() * 150;
      g.strokeStyle = `rgba(${v},${v},${v},${0.55 + rng() * 0.45})`;
      g.lineWidth = 0.7 + rng() * 1.8;
      g.beginPath();
      g.moveTo(x0, 0);
      const drift = (rng() - 0.5) * 30;
      const end = H * (0.75 + rng() * 0.25);
      g.bezierCurveTo(x0 + drift * 0.3, end * 0.3, x0 + drift, end * 0.7, cx + drift * 0.6 + (rng() - 0.5) * 8, end);
      g.stroke();
    }
  }
  // keep the card edge columns clean
  g.clearRect(W / 2 - 2, 0, 4, H);
  _tex = new THREE.CanvasTexture(c);
  _tex.colorSpace = THREE.SRGBColorSpace;
  _tex.anisotropy = 4;
  _tex.wrapS = THREE.ClampToEdgeWrapping;
  _tex.wrapT = THREE.ClampToEdgeWrapping;
  return _tex;
}

const STYLE = {
  short: { top: 0.009, side: 0.005, back: 0.006, cards: 0, tufts: 0 },
  'gray-short': { top: 0.006, side: 0.0035, back: 0.004, cards: 0, tufts: 0, thin: 0.5 },
  messy: { top: 0.013, side: 0.006, back: 0.008, cards: 0, tufts: 26, noise: 0.006 },
  pompadour: { top: 0.012, side: 0.004, back: 0.006, front: 0.03, cards: 0, tufts: 0, gloss: 1 },
  bun: { top: 0.0045, side: 0.004, back: 0.0045, cards: 0, tufts: 0, bun: 1 },
  ponytail: { top: 0.005, side: 0.004, back: 0.005, cards: 10, kind: 'pony', tufts: 0 },
  bob: { top: 0.012, side: 0.012, back: 0.014, cards: 26, kind: 'bob', bob: 1, tufts: 0 },
  long: { top: 0.007, side: 0.007, back: 0.008, cards: 44, kind: 'long', tufts: 0 },
};

/**
 * Build hair for a humanoid. Returns { mesh, update(dt), dispose(), cloneFor(double) } or null.
 */
export function buildHair(h, spec) {
  const style = spec.hair?.style || (spec.age > 70 ? 'gray-short' : 'short');
  if (style === 'bald' || style === 'shaved') return null;
  const S = STYLE[style] || STYLE.short;
  const P = h.P, F = h.face;
  const hs = F.hs;
  const rng = makeRng((F.seed * 31 + 7) >>> 0);
  const color = hairRGB(spec);
  const wet = spec.hair?.wet ?? spec.ghost?.wet ?? 0;
  const old = P.age > 60;
  // ---- cap (head-local around the head pivot)
  const cY = F.crownY;
  const scalp = [
    ellipsoid([0, cY - 0.09 * hs, 0.014 * hs], [0.0765 * hs, 0.09 * hs, 0.093 * hs], { k: 0.02 * hs }),
    ellipsoid([0, 0.06 * hs, 0.05 * hs], [0.062 * hs, 0.06 * hs, 0.055 * hs], { k: 0.03 * hs }),
    ellipsoid([0, F.eyeY + (0.108 - 0.06) * F.fs, -0.04 * F.hs], [0.066 * hs, 0.056 * hs, 0.052 * hs], { k: 0.03 * hs }),
  ];
  const scalpD = (x, y, z) => {
    let d = scalp[0].eval(x, y, z);
    d = smin(d, scalp[1].eval(x, y, z), 0.03 * hs);
    d = smin(d, scalp[2].eval(x, y, z), 0.03 * hs);
    return d;
  };
  const thick = (x, y, z) => {
    const th = Math.atan2(x, -z);
    const a = Math.abs(th);
    const up = smoothstep(0.05 * hs, 0.15 * hs, y);
    let t = lerp(a > 1.9 ? S.back : S.side, S.top, up);
    if (S.front) t += S.front * smoothstep(0.9, 0.0, a) * smoothstep(0.09 * hs, 0.13 * hs, y);
    if (S.noise) t += noise.noise3D(x * 40, y * 40, z * 40) * S.noise + noise.noise3D(x * 90, y * 90, z * 90) * S.noise * 0.4;
    // wavy groove texture
    t += Math.sin(Math.atan2(y - cY, z) * 60 + x * 200) * 0.0008;
    if (S.thin && old) t *= 1 - smoothstep(0.13 * hs, 0.17 * hs, y) * S.thin * smoothstep(1.3, 0.3, a);
    // taper to nothing at the hairline
    const hl = hairlineY(th, F, P, style);
    t *= smoothstep(hl - 0.002, hl + 0.014 * hs, y);
    return t * hs;
  };
  const capPrims = [];
  capPrims.push(custom((x, y, z) => {
    const sd = scalpD(x, y, z);
    let d = sd - thick(x, y, z) - 0.0012;
    const th = Math.atan2(x, -z);
    d = Math.max(d, hairlineY(th, F, P, style) - y);
    // shell: drop the deep interior so the mesh is just the outer surface
    d = Math.max(d, -(sd + 0.006 * hs));
    return d;
  }, [-0.11 * hs, -0.06 * hs, -0.12 * hs, 0.11 * hs, cY + 0.06 * hs, 0.13 * hs], { k: 0.0, mat: 'hair' }));
  if (S.bun) {
    capPrims.push(ellipsoid([0, 0.09 * hs, 0.11 * hs], [0.034 * hs, 0.03 * hs, 0.028 * hs], { k: 0.012 * hs, mat: 'hair' }));
    capPrims.push(ellipsoid([0, 0.09 * hs, 0.128 * hs], [0.026 * hs, 0.022 * hs, 0.018 * hs], { k: 0.01 * hs, mat: 'hair' }));
  }
  if (S.bob) {
    // bell of hair down to the jaw, open for the face
    capPrims.push(custom((x, y, z) => {
      const d0 = sdEllipsoid(x, y - 0.06 * hs, z - 0.012 * hs, 0.088 * hs, 0.13 * hs, 0.104 * hs);
      let d = Math.max(d0, -(scalpD(x, y, z) + 0.004));
      d = Math.max(d, -0.005 * hs - y); // bottom cut at the jaw
      const face = Math.max(-0.035 * hs - z, F.browY + 0.008 * hs - y, Math.abs(x) - 0.06 * hs);
      d = Math.max(d, -face);
      return d;
    }, [-0.11 * hs, -0.02 * hs, -0.12 * hs, 0.11 * hs, cY + 0.04 * hs, 0.13 * hs], { k: 0.01 * hs, mat: 'hair' }));
  }
  const md = meshPart({
    prims: capPrims, h: 0.0042 * hs, margin: 0.008, relax: 2, targetTris: 2400,
    bounds: primsBounds(capPrims, 0.01),
    clip: (x, y, z) => scalpD(x, y, z) > 0.0015 * hs || y < -0.0,
  });
  const cap = md.mesh;
  // ---- assemble geometry
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const tint = (k) => [color[0] * k, color[1] * k, color[2] * k];
  for (let v = 0; v < cap.count; v++) {
    const x = cap.positions[v * 3], y = cap.positions[v * 3 + 1], z = cap.positions[v * 3 + 2];
    pos.push(x, y, z);
    nor.push(cap.normals[v * 3], cap.normals[v * 3 + 1], cap.normals[v * 3 + 2]);
    // strand flow: radiate from the crown (whorl slightly back of centre)
    const dx = x, dy = y - (cY - 0.005 * hs), dz = z - 0.03 * hs;
    const az = Math.atan2(dx, -dz);
    const pol = Math.acos(clamp(dy / (Math.hypot(dx, dy, dz) || 1), -1, 1));
    uv.push(((az / (Math.PI * 2)) + 0.5) * 0.48 + 0.01, 1 - pol / Math.PI * 1.6);
    const n = noise.noise3D(x * 30, y * 30, z * 30);
    const k = (0.75 + 0.25 * md.ao[v]) * (1 + n * 0.12);
    const c = tint(k);
    col.push(c[0], c[1], c[2]);
  }
  for (let i = 0; i < cap.indices.length; i++) idx.push(cap.indices[i]);
  // ---- cards
  const cards = [];
  const addCard = (root, dirs, len, width, segs, stiff) => {
    // root (head-local), path built from rest directions; returns card record
    const rest = [new THREE.Vector3(...root)];
    let p = new THREE.Vector3(...root);
    const seg = len / segs;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const d = dirs(t, i);
      p = p.clone().addScaledVector(d.normalize(), seg);
      rest.push(p);
    }
    const base = pos.length / 3;
    const u0 = 0.52 + rng() * 0.3, u1 = Math.min(0.995, u0 + 0.12 + rng() * 0.06);
    for (let i = 0; i <= segs; i++) {
      for (let s = 0; s < 2; s++) {
        pos.push(rest[i].x, rest[i].y, rest[i].z);
        nor.push(0, 0, 1);
        uv.push(s ? u1 : u0, 1 - i / segs);
        const k = 0.82 + 0.2 * (1 - i / segs);
        const c = tint(k);
        col.push(c[0], c[1], c[2]);
      }
    }
    for (let i = 0; i < segs; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const card = { base, segs, rest, width, stiff, seg, p: rest.map((v) => v.clone()), prev: rest.map((v) => v.clone()), init: false };
    cards.push(card);
    return card;
  };
  const scalpPoint = (th, y) => {
    // point on the scalp surface (head-local) at azimuth th and height y
    const dir = new THREE.Vector3(Math.sin(th), 0, -Math.cos(th));
    let r = 0.06 * hs;
    for (let i = 0; i < 20; i++) {
      const d = scalpD(dir.x * r, y, dir.z * r + 0.014 * hs);
      r -= d;
    }
    return [dir.x * r, y, dir.z * r + 0.014 * hs];
  };
  if (S.kind === 'long') {
    const n = S.cards;
    for (let i = 0; i < n; i++) {
      const front = i < 8; // strands falling in front of the shoulders
      const sgn = i % 2 ? 1 : -1;
      const th = front ? sgn * (1.05 + (i >> 1) * 0.12) : lerp(-2.2, 2.2, (i - 8) / (n - 9)) + Math.PI;
      const y = front ? 0.07 * hs : lerp(0.14, 0.04, Math.abs(Math.sin(th)) * 0.6) * hs + rng() * 0.02 * hs;
      const root = scalpPoint(th, y);
      const out = new THREE.Vector3(root[0], 0, root[2] - 0.014 * hs).normalize();
      const len = (front ? 0.42 : 0.5 + rng() * 0.12) * (P.H / 1.6);
      addCard(root, (t) => new THREE.Vector3(out.x * (0.9 - t) * 0.6 + (front ? 0 : 0), -1 + (1 - t) * 0.1, out.z * (0.9 - t) * 0.6 + (front ? -0.05 : 0.18 * t)), len, 0.034 * hs + rng() * 0.012, 10, 0.25);
    }
  } else if (S.kind === 'bob') {
    for (let i = 0; i < S.cards; i++) {
      const th = lerp(-2.3, 2.3, i / (S.cards - 1)) + Math.PI;
      const root = scalpPoint(th, 0.05 * hs);
      const out = new THREE.Vector3(root[0], 0, root[2] - 0.014 * hs).normalize();
      addCard([root[0] + out.x * 0.01, root[1], root[2] + out.z * 0.01], (t) => new THREE.Vector3(out.x * 0.35, -1, out.z * 0.35), 0.075 * hs, 0.04 * hs, 4, 0.7);
    }
  } else if (S.kind === 'pony') {
    const tie = [0, 0.1 * hs, 0.105 * hs];
    for (let i = 0; i < S.cards; i++) {
      const a = (i / S.cards) * Math.PI * 2;
      addCard([tie[0] + Math.cos(a) * 0.008, tie[1] + Math.sin(a) * 0.008, tie[2]], (t) => new THREE.Vector3(Math.cos(a) * 0.15, -1 + (1 - t) * 0.5, 0.6 * (1 - t)), 0.3 * hs, 0.03 * hs, 8, 0.35);
    }
  }
  if (S.tufts) {
    // short messy tufts sticking out of the cap
    for (let i = 0; i < S.tufts; i++) {
      const th = (rng() - 0.5) * Math.PI * 1.9;
      const y = lerp(0.09, 0.17, rng()) * hs;
      const root = scalpPoint(th, y);
      const nrm = new THREE.Vector3(root[0], root[1] - 0.06 * hs, root[2] - 0.014 * hs).normalize();
      const flow = new THREE.Vector3(Math.sin(th) * 0.3, -0.2, -Math.cos(th) * 0.6 - 0.4).normalize();
      addCard(root, (t) => nrm.clone().multiplyScalar(0.8 - t * 0.6).add(flow.clone().multiplyScalar(0.4 + t)), 0.035 * hs + rng() * 0.025, 0.018 * hs, 2, 1.0);
    }
  }
  const geo = new THREE.BufferGeometry();
  const posArr = new Float32Array(pos);
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col.map((c) => Math.pow(c, 2.2))), 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  geo.boundingSphere.radius += 0.6;
  const gloss = (S.gloss ? 0.3 : 0) + wet * 0.35;
  const mat = paintedMaterial({ map: strandTexture(), vertexColors: true, roughness: 0.62 - gloss, alphaTest: 0.42, side: THREE.DoubleSide, brush: 0.25, wet: wet * 0.6, name: 'hair' });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'hair';
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  // parent to the head bone: geometry is head-local relative to the pivot -> bone space
  const headBone = h.bones.head;
  headBone.add(mesh);
  // head bone rest orientation is identity in rig space, so head-local == bone-local
  // ---- simulation
  const posAttr = geo.attributes.position;
  const nrmAttr = geo.attributes.normal;
  const _hm = new THREE.Matrix4(), _hi = new THREE.Matrix4();
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
  const colliders = [];
  const gravity = new THREE.Vector3(0, -9.8, 0);
  const sim = cards.length > 0 && cards.some((c) => c.stiff < 0.9);
  const update = (dt) => {
    if (!cards.length) return;
    // head world matrix from the rig (exact for this frame)
    const rig = h.rig;
    _hm.compose(rig.rp[BI.head], rig.rq[BI.head], _a.set(1, 1, 1)).premultiply(h._rootMat);
    _hi.copy(_hm).invert();
    // colliders (world): head sphere + shoulders/back from the chest
    colliders.length = 0;
    _b.set(0, 0.07 * hs, 0.01 * hs).applyMatrix4(_hm);
    colliders.push([_b.x, _b.y, _b.z, 0.098 * hs]);
    for (const [bn, off, r] of [['chest', [0, 0.06, 0.03], 0.15], ['chest', [0.1, 0.08, 0.02], 0.09], ['chest', [-0.1, 0.08, 0.02], 0.09], ['spine', [0, 0.0, 0.03], 0.15], ['neck', [0, 0.03, 0.0], 0.06]]) {
      const i = BI[bn];
      _c.set(off[0] * (P.H / 1.7), off[1] * (P.H / 1.7), off[2]).applyQuaternion(rig.rq[i]).add(rig.rp[i]).applyMatrix4(h._rootMat);
      colliders.push([_c.x, _c.y, _c.z, r * (P.H / 1.7) * (P.fat > 1.1 ? 1.15 : 1)]);
    }
    const steps = dt > 0.02 ? 2 : 1;
    const h2 = Math.min(dt, 0.05) / steps;
    for (const card of cards) {
      const p = card.p, pr = card.prev, rest = card.rest;
      if (!card.init || dt === 0 || !sim) {
        for (let i = 0; i < p.length; i++) { p[i].copy(rest[i]).applyMatrix4(_hm); pr[i].copy(p[i]); }
        card.init = true;
        if (dt === 0 || !sim) continue;
      }
      for (let st = 0; st < steps; st++) {
        p[0].copy(rest[0]).applyMatrix4(_hm);
        for (let i = 1; i < p.length; i++) {
          const t = i / card.segs;
          _a.copy(p[i]).sub(pr[i]).multiplyScalar(0.94);
          pr[i].copy(p[i]);
          p[i].add(_a).addScaledVector(gravity, h2 * h2 * (1 - card.stiff));
          // shape matching toward the styled rest pose
          _b.copy(rest[i]).applyMatrix4(_hm);
          const k = card.stiff * 0.25 + (1 - t) * 0.12 + (wet ? 0.04 : 0);
          p[i].lerp(_b, Math.min(1, k));
        }
        // length constraints + collisions
        for (let it = 0; it < 2; it++) {
          for (let i = 1; i < p.length; i++) {
            _a.copy(p[i]).sub(p[i - 1]);
            const l = _a.length() || 1e-6;
            p[i].copy(p[i - 1]).addScaledVector(_a, card.seg / l);
            for (const c of colliders) {
              _d.set(p[i].x - c[0], p[i].y - c[1], p[i].z - c[2]);
              const dl = _d.length();
              const rr = c[3] + 0.006;
              if (dl < rr && dl > 1e-5) p[i].addScaledVector(_d, (rr - dl) / dl);
            }
          }
        }
      }
    }
    // write vertices (head-local)
    for (const card of cards) {
      const p = card.p;
      const L = card.local || (card.local = p.map(() => new THREE.Vector3()));
      for (let i = 0; i < p.length; i++) L[i].copy(p[i]).applyMatrix4(_hi);
      for (let i = 0; i < p.length; i++) {
        const j = Math.min(i + 1, p.length - 1), k0 = Math.max(i - 1, 0);
        _b.copy(L[j]).sub(L[k0]);
        _c.set(L[i].x, 0, L[i].z - 0.014 * hs).normalize();
        _d.crossVectors(_b, _c).normalize().multiplyScalar(card.width * (1 - (i / card.segs) * 0.35) * 0.5);
        const o = card.base + i * 2;
        posAttr.setXYZ(o, L[i].x - _d.x, L[i].y - _d.y, L[i].z - _d.z);
        posAttr.setXYZ(o + 1, L[i].x + _d.x, L[i].y + _d.y, L[i].z + _d.z);
        nrmAttr.setXYZ(o, _c.x, 0.25, _c.z);
        nrmAttr.setXYZ(o + 1, _c.x, 0.25, _c.z);
      }
    }
    posAttr.needsUpdate = true;
    nrmAttr.needsUpdate = true;
  };
  return {
    mesh, update, cards,
    dispose() { mesh.removeFromParent(); geo.dispose(); mat.dispose(); },
    cloneFor() { return null; }, // the double's cloned head bone already carries a shared-geometry copy
  };
}
