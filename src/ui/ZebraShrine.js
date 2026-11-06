// The loading screen's set: a worn roadside zebra shrine (ศาลม้าลาย). Glazed ceramic zebra
// figurines (swept and sculpted: torso, arched neck, long head, jointed legs, erect mane, tufted
// tail; warped stripes painted in the shader, a white belly, crazed and chipped glaze), red soda
// bottles with straws (lathed), and faded marigold garlands. Every zebra is a little rigid body
// that can rock on its hooves and topple (zebra.push(dir, strength)).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

/**
 * Sweep an elliptical section along a smooth curve. r(t) -> [rUp, rSide]; coat(t, c, s, p) ->
 * [stripePhase, black, white] (c, s: cos / sin of the section angle; c = 1 is the upper side).
 */
function sweep(pts, { rings = 40, radial = 16, r, coat }) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const pos = [], st = [], idx = [];
  const side = new THREE.Vector3(), nrm = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const P = curve.getPointAt(t), T = curve.getTangentAt(t);
    side.crossVectors(T, UP);
    if (side.lengthSq() < 1e-6) side.set(0, 0, 1);
    side.normalize();
    nrm.crossVectors(side, T).normalize();
    const [ra, rb] = r(t);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      p.copy(P).addScaledVector(nrm, c * ra).addScaledVector(side, s * rb);
      pos.push(p.x, p.y, p.z);
      st.push(...coat(t, c, s, p));
    }
  }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSt', new THREE.Float32BufferAttribute(st, 3));
  g.setIndex(idx);
  return g;
}

const ends = (t, e0, e1 = e0) => Math.sqrt(clamp(t / e0, 0.02, 1)) * Math.sqrt(clamp((1 - t) / e1, 0.02, 1));

/**
 * One zebra figurine (units: shoulder height 1, nose to tail ~1.6, facing +X), standing on a small
 * bevelled base plate (its underside at y = 0). Slim barrel, four straight distinct legs with
 * knees and black hooves, a long arched neck with an upright striped mane, a defined head (brow,
 * cheek, muzzle, black nose), upright ears, a tufted tail. pose.headDown 0..1, pose.stride.
 */
export function zebraGeometry(rng, pose = {}) {
  const hd = pose.headDown ?? 0;
  const sw = pose.stride ?? 0;
  const bulk = 0.96 + rng() * 0.08;
  const P = 0.05; // base plate thickness: everything stands on it
  const parts = [];
  // torso: a slim barrel, deepest at the girth, croup sloping to the tail
  parts.push(sweep([V(-0.52, 0.8 + P), V(-0.36, 0.83 + P), V(-0.02, 0.79 + P), V(0.3, 0.82 + P), V(0.5, 0.88 + P)], {
    rings: 64, radial: 26,
    r: (t) => {
      const girth = 0.15 + 0.035 * Math.sin(Math.PI * clamp(t * 1.08, 0, 1)) + 0.015 * sstep(0.62, 0.82, t);
      return [girth * bulk * ends(t, 0.14, 0.12), girth * 0.72 * bulk * ends(t, 0.14, 0.12)];
    },
    coat: (t, c, s, p) => {
      // vertical stripes over the barrel bending into chevrons over the haunch, white belly
      const hip = Math.hypot(p.x + 0.4, p.y - 0.64 - P);
      const k = sstep(-0.1, -0.3, p.x);
      return [p.x * 7.0 * (1 - k) + (2.6 - hip * 8.0) * k, 0, sstep(-0.5, -0.85, c) * sstep(-0.3, 0.25, p.x)];
    },
  }));
  // neck: long, deep and narrow, arched up and forward
  const nTop = V(0.8, 1.46 + P - hd * 0.62);
  parts.push(sweep([V(0.36, 0.88 + P), V(0.52, 1.08 + P - hd * 0.18), V(0.68, 1.3 + P - hd * 0.42), nTop], {
    rings: 40, radial: 18,
    r: (t) => {
      const rr = 0.13 - 0.06 * t;
      return [rr * bulk * ends(t, 0.04, 0.1), rr * 0.58 * bulk * ends(t, 0.04, 0.1)];
    },
    coat: (t) => [t * 5.0 + 0.3, 0, 0],
  }));
  // mane: an upright striped crest from withers to poll
  parts.push(sweep([V(0.4, 1.02 + P), V(0.54, 1.22 + P - hd * 0.18), V(0.68, 1.42 + P - hd * 0.42), V(0.77, 1.56 + P - hd * 0.62)], {
    rings: 36, radial: 10,
    r: (t) => [0.075 * ends(t, 0.12, 0.12), 0.018 * ends(t, 0.08, 0.08)],
    coat: (t, c) => [t * 5.0 + 0.3, sstep(0.6, 0.92, c) * 0.9, 0],
  }));
  // head: brow, wide cheek, narrowing face, a slightly swollen muzzle with a black nose
  const hDir = V(0.55, -0.83 - hd * 0.25).normalize();
  const h0 = nTop.clone().add(V(-0.01, 0.05));
  const h1 = h0.clone().addScaledVector(hDir, 0.22);
  const h2 = h0.clone().addScaledVector(hDir, 0.46);
  parts.push(sweep([h0, h1, h2], {
    rings: 40, radial: 18,
    r: (t) => {
      const cheek = 0.085 * Math.exp(-(((t - 0.22) / 0.2) ** 2));
      const rr = 0.05 + cheek * 0.6 - 0.012 * t + 0.016 * sstep(0.72, 0.9, t);
      return [rr * 1.05 * ends(t, 0.1, 0.06), rr * 0.78 * ends(t, 0.1, 0.06)];
    },
    coat: (t, c, s) => {
      const eye = t > 0.18 && t < 0.3 && Math.abs(s) > 0.7 && c > 0.0 ? 1 : 0;
      return [t * 6.0, Math.max(sstep(0.8, 0.86, t), eye), 0];
    },
  }));
  // ears: upright tapered leaves at the poll, black-tipped
  for (const z of [-1, 1]) {
    const e0 = h0.clone().add(V(-0.02, 0.02, z * 0.04));
    parts.push(sweep([e0, e0.clone().add(V(-0.015, 0.08, z * 0.02)), e0.clone().add(V(-0.03, 0.16, z * 0.035))], {
      rings: 12, radial: 10,
      r: (t) => {
        const w = Math.sin(Math.PI * clamp(t * 0.95 + 0.05, 0, 1)) * 0.03;
        return [w * 0.45, w];
      },
      coat: (t) => [t * 2.5, sstep(0.72, 0.9, t), 0],
    }));
  }
  // legs: straight, well apart, a knee (front) or hock (hind), slim cannon, fetlock, black hoof
  const leg = (x, z, hind, phase) => {
    const f = Math.sin(phase) * sw * 0.05;
    const pts = hind
      ? [V(x, 0.74 + P, z), V(x + 0.04, 0.46 + P, z), V(x - 0.03 + f, 0.27 + P, z), V(x - 0.02 + f, 0.07 + P, z), V(x - 0.02 + f, P, z)]
      : [V(x, 0.74 + P, z), V(x, 0.46 + P, z), V(x + 0.005 + f, 0.27 + P, z), V(x + 0.01 + f, 0.07 + P, z), V(x + 0.01 + f, P, z)];
    parts.push(sweep(pts, {
      rings: 36, radial: 14,
      r: (t) => {
        const rr = 0.068 - 0.04 * sstep(0.0, 0.5, t) + 0.01 * Math.exp(-(((t - 0.5) / 0.05) ** 2)) + 0.011 * sstep(0.84, 0.93, t);
        return [rr * ends(t, 0.05, 0.003), rr * 0.9 * ends(t, 0.05, 0.003)];
      },
      coat: (t, c, s, p) => [p.y * 11.0, sstep(0.9, 0.93, t), 0],
    }));
  };
  leg(0.36, 0.085, false, 0);
  leg(0.36, -0.085, false, Math.PI);
  leg(-0.38, 0.085, true, Math.PI);
  leg(-0.38, -0.085, true, 0);
  // tail: thin, hanging, a black tuft
  parts.push(sweep([V(-0.56, 0.86 + P), V(-0.64, 0.74 + P, 0.01), V(-0.66, 0.56 + P, 0.02), V(-0.65, 0.42 + P, 0.02)], {
    rings: 24, radial: 10,
    r: (t) => {
      const rr = 0.018 - 0.008 * t + 0.02 * sstep(0.65, 0.85, t) * (1 - sstep(0.95, 1, t));
      return [rr, rr];
    },
    coat: (t) => [t * 4, sstep(0.66, 0.74, t), 0],
  }));
  // base plate: a rounded slab under the hooves, plain glaze
  const plate = new THREE.Shape();
  const bw = 1.3, bd = 0.36, br = 0.08;
  plate.moveTo(-bw / 2 + br, -bd / 2);
  plate.lineTo(bw / 2 - br, -bd / 2);
  plate.quadraticCurveTo(bw / 2, -bd / 2, bw / 2, -bd / 2 + br);
  plate.lineTo(bw / 2, bd / 2 - br);
  plate.quadraticCurveTo(bw / 2, bd / 2, bw / 2 - br, bd / 2);
  plate.lineTo(-bw / 2 + br, bd / 2);
  plate.quadraticCurveTo(-bw / 2, bd / 2, -bw / 2, bd / 2 - br);
  plate.lineTo(-bw / 2, -bd / 2 + br);
  plate.quadraticCurveTo(-bw / 2, -bd / 2, -bw / 2 + br, -bd / 2);
  const pg = new THREE.ExtrudeGeometry(plate, { depth: P - 0.016, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.012, bevelSegments: 2, curveSegments: 6 });
  pg.rotateX(-Math.PI / 2);
  pg.translate(0, 0.008, 0);
  pg.deleteAttribute('uv');
  const pst = new Float32Array(pg.attributes.position.count * 3);
  for (let i = 0; i < pg.attributes.position.count; i++) pst.set([0, 0, 1], i * 3);
  pg.setAttribute('aSt', new THREE.BufferAttribute(pst, 3));
  parts.push(pg);
  // smooth normals per part (seamless sections), then one non-indexed buffer
  const flat = parts.map((q) => {
    if (q.index) q.computeVertexNormals();
    else if (!q.attributes.normal) q.computeVertexNormals();
    return q.index ? q.toNonIndexed() : q;
  });
  const g = mergeGeometries(flat);
  for (const q of parts) q.dispose();
  g.computeBoundingBox();
  return g;
}

const COAT_GLSL = /* glsl */ `
float zH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float zN(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(zH(i), zH(i + vec2(1.0, 0.0)), f.x), mix(zH(i + vec2(0.0, 1.0)), zH(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

/**
 * Glazed ceramic with painted stripes, yellowed glaze, crazing, grime and chips. Variants share one
 * program: fade (sun-bleached: stripes go grey, the glaze yellows), chip (more of the grey body
 * showing), seed (moves the grime and chips so no two figurines match).
 */
export function zebraMaterial({ fade = 0, chip = 0, seed = 0 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0 });
  const U = { uFade: { value: fade }, uChip: { value: chip }, uSeed: { value: seed } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aSt; varying vec3 vZst; varying vec3 vZp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZst = aSt; vZp = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uFade; uniform float uChip; uniform float uSeed;\nvarying vec3 vZst; varying vec3 vZp;\n${COAT_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 q = vZp + vec3(uSeed * 3.17, 0.0, uSeed * 1.91);
  float warp = (zN(q.xz * 9.0 + q.y * 3.0) - 0.5) * 1.9 + (zN(q.xy * 23.0) - 0.5) * 0.6;
  float s = sin(vZst.x * 6.2832 + warp);
  float thr = 0.05 + (zN(q.yz * 6.0 + 3.1) - 0.5) * 0.55;
  float aa = fwidth(s) * 0.7 + 0.01;
  float stripe = smoothstep(thr - aa, thr + aa, s) * (1.0 - vZst.z);
  float black = max(stripe, vZst.y);
  vec3 glaze = mix(vec3(0.86, 0.84, 0.78), vec3(0.8, 0.74, 0.6), uFade) * (0.92 + 0.08 * zN(q.xy * 14.0));
  vec3 ink = mix(vec3(0.025, 0.024, 0.023), vec3(0.3, 0.29, 0.27), uFade * (0.6 + 0.4 * zN(q.xy * 5.0)));
  vec3 col = mix(glaze, ink, black);
  float craze = smoothstep(0.035, 0.0, abs(zN(q.xy * 70.0) - zN(q.zy * 70.0 + 9.0)));
  col *= 1.0 - craze * (0.14 + 0.2 * uFade) * (1.0 - black);
  float grime = smoothstep(0.55, 0.0, vZp.y) * 0.5 + smoothstep(0.62, 0.9, zN(q.xz * 4.0 + 1.7)) * 0.25;
  col = mix(col, vec3(0.18, 0.15, 0.11), grime * 0.55);
  float chip = step(0.88 - uChip * 0.12, zN(q.xy * 31.0 + q.z * 17.0));
  col = mix(col, vec3(0.5, 0.47, 0.42), chip * 0.9);
  diffuseColor.rgb = col;
}`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.22, 0.8, clamp(smoothstep(0.55, 0.0, vZp.y) * 0.6 + uFade * 0.4, 0.0, 1.0));');
  };
  m.customProgramCacheKey = () => 'dlb-zebra-ceramic';
  return m;
}

/** A candle stub left burnt down: lathed, the rim melted in, wax runs down the side. */
function candleStub(rng, h, color) {
  const r = 0.011 + rng() * 0.004;
  const prof = [[0, 0], [r * 1.25, 0], [r * 1.2, 0.002], [r, 0.006], [r, h * 0.82], [r * 1.05, h * 0.92], [r * 0.95, h], [r * 0.6, h - 0.004], [0.0007, h - 0.006], [0.0007, h + 0.004], [0, h + 0.005]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(prof, 28);
  const p = g.attributes.position;
  const s = rng() * 6;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    const a = Math.atan2(z, x);
    const drip = 1 + 0.12 * Math.max(0, Math.sin(a * 3 + s)) ** 6 * sstep(h, h * 0.3, y);
    p.setX(i, x * drip);
    p.setZ(i, z * drip);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));
}

/** The ledge at the shrine's foot: a chamfered concrete block, small square tiles on top, grime. */
function ledge(W, D, H, topY) {
  const tex = (() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 832;
    const x = c.getContext('2d');
    let seed = 77;
    const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    x.fillStyle = '#5a554c';
    x.fillRect(0, 0, c.width, c.height);
    const T = 52;
    for (let ty = 0; ty < c.height; ty += T)
      for (let tx = 0; tx < c.width; tx += T) {
        const v = 168 + r() * 26;
        const terr = r() < 0.08;
        x.fillStyle = terr ? `rgb(${v * 0.62},${v * 0.36},${v * 0.28})` : `rgb(${v},${v * 0.97},${v * 0.9})`;
        x.fillRect(tx + 2, ty + 2, T - 4, T - 4);
        if (r() < 0.12) {
          x.strokeStyle = 'rgba(40,36,30,0.6)';
          x.lineWidth = 1;
          x.beginPath();
          x.moveTo(tx + r() * T, ty);
          x.lineTo(tx + r() * T, ty + T);
          x.stroke();
        }
      }
    for (let i = 0; i < 90; i++) {
      x.fillStyle = `rgba(${40 + r() * 30},${36 + r() * 30},${26 + r() * 14},${0.15 + r() * 0.35})`;
      x.beginPath();
      x.ellipse(r() * c.width, r() * c.height, 6 + r() * 60, 4 + r() * 30, r() * 3, 0, Math.PI * 2);
      x.fill();
    }
    for (let i = 0; i < 10; i++) {
      x.fillStyle = `rgba(120,18,16,${0.15 + r() * 0.2})`;
      x.beginPath();
      x.ellipse(r() * c.width, r() * c.height, 8 + r() * 26, 5 + r() * 14, r() * 3, 0, Math.PI * 2);
      x.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  })();
  const sh = new THREE.Shape();
  const c = 0.012;
  sh.moveTo(-W / 2 + c, -D / 2);
  sh.lineTo(W / 2 - c, -D / 2);
  sh.lineTo(W / 2, -D / 2 + c);
  sh.lineTo(W / 2, D / 2 - c);
  sh.lineTo(W / 2 - c, D / 2);
  sh.lineTo(-W / 2 + c, D / 2);
  sh.lineTo(-W / 2, D / 2 - c);
  sh.lineTo(-W / 2, -D / 2 + c);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: H - 0.016, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 });
  g.rotateX(-Math.PI / 2);
  // top UVs from the plan (the extrude's own UVs are in metres)
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + W / 2) / W, (p.getZ(i) + D / 2) / D + p.getY(i) * 0.6);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  m.position.y = topY - H + 0.008;
  return m;
}

/** A small glass soda bottle (lathed), red soda inside, a straw. */
function sodaBottle(rng) {
  const prof = [
    [0.0, 0.0], [0.022, 0.0], [0.027, 0.002], [0.0292, 0.01], [0.0288, 0.05], [0.0262, 0.074], [0.0284, 0.098],
    [0.029, 0.114], [0.0262, 0.134], [0.0178, 0.154], [0.0118, 0.17], [0.0106, 0.181], [0.0126, 0.183], [0.0129, 0.188], [0.0104, 0.19],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(prof, 40);
  const fill = 0.06 + rng() * 0.08;
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const red = y < fill ? 1 : 0;
    const c = red ? [0.5, 0.03, 0.035] : [0.2, 0.17, 0.15];
    const dust = sstep(0.1, 0.0, y) * 0.3;
    col.set(c.map((v) => v * (1 - dust) + 0.25 * dust), i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const bottle = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  const lean = (rng() - 0.5) * 0.02;
  const straw = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0.002, 0.03), V(0.004, 0.17), V(0.008 + lean, 0.215, 0.002), V(0.03, 0.235, 0.006)]), 24, 0.0028, 8),
    new THREE.MeshStandardMaterial({ color: rng() < 0.5 ? 0xc8708a : 0xe2ddd0, roughness: 0.4 }),
  );
  const grp = new THREE.Group();
  grp.add(bottle, straw);
  return grp;
}

/** A ruffled marigold head (sculpted from a sphere: petal ridges and a flattened crown). */
function marigoldGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const az = Math.atan2(z, x), pol = Math.acos(clamp(y, -1, 1));
    const ruff = 1 + 0.13 * Math.abs(Math.sin(az * 9 + pol * 6)) + 0.07 * Math.sin(az * 23 - pol * 11);
    p.setXYZ(i, x * ruff, y * ruff * 0.78, z * ruff);
  }
  g.computeVertexNormals();
  return g;
}

/** A faded garland lying in a loose loop. */
function garland(rng, center, rx, rz, n = 44) {
  const mesh = new THREE.InstancedMesh(marigoldGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.92 }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const tw = rng() * 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wob = 1 + 0.12 * Math.sin(a * 3 + tw);
    p.set(center.x + Math.cos(a) * rx * wob, center.y + 0.008, center.z + Math.sin(a) * rz * wob);
    e.set(rng() * 6, rng() * 6, rng() * 6);
    q.setFromEuler(e);
    const sc = 0.0085 + rng() * 0.003;
    s.setScalar(sc);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    const dry = rng();
    // faded orange marigolds, some dried to brown, the odd withered jasmine
    if (rng() < 0.12) c.setRGB(0.55, 0.5, 0.38);
    else c.setRGB(0.62 - dry * 0.3, 0.3 - dry * 0.16, 0.05 + dry * 0.03);
    mesh.setColorAt(i, c);
  }
  return mesh;
}

/** A figurine as a rigid body that rocks on its hooves and topples. */
class Figurine {
  constructor(mesh, base, height, halfLong, halfLat) {
    this.mesh = mesh;
    this.base0 = base.clone();
    this.q0 = mesh.quaternion.clone();
    this.hc = height * 0.55; // centre of mass above the hooves
    this.halfLong = halfLong;
    this.halfLat = halfLat;
    this.theta = 0;
    this.omega = 0;
    this.state = 'rest';
    this.axis = new THREE.Vector3();
    this.pivot = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
  }

  /** Critical tip-over speed (rad/s) about an edge b from the centre. */
  _crit(b) {
    const R2 = b * b + this.hc * this.hc;
    return Math.sqrt((2 * 9.8 * (Math.sqrt(R2) - this.hc)) / (1.35 * R2));
  }

  /** Push horizontally along dir; strength 1 = just tips over, < 1 rocks back. */
  push(dir, strength) {
    if (this.state === 'down') return;
    const d = this._v.set(dir.x, 0, dir.z).normalize();
    if (this.state === 'rest') {
      const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(this.q0);
      const along = Math.abs(d.dot(fwd));
      this.b = this.halfLong * along + this.halfLat * (1 - along);
      this.axis.crossVectors(UP, d).normalize();
      this.pivot.copy(this.base0).addScaledVector(d, this.b);
      this.state = 'rock';
    }
    this.omega += this._crit(this.b) * strength * 1.02;
  }

  update(dt) {
    if (this.state !== 'rock') return;
    const n = 4, h = dt / n, b = this.b, hc = this.hc, I = 1.35 * (b * b + hc * hc);
    for (let k = 0; k < n; k++) {
      this.omega += (-9.8 * (b * Math.cos(this.theta) - hc * Math.sin(this.theta)) / I) * h;
      this.theta += this.omega * h;
      if (this.theta < 0) {
        // back on all four hooves: a ceramic clack, a smaller rock, then still
        this.theta = 0;
        this.omega = this.omega < -0.4 ? -this.omega * 0.32 : 0;
        if (this.omega === 0) this.state = 'rest';
      }
      if (this.theta > 1.42) {
        this.theta = 1.42;
        this.omega = -this.omega * 0.22;
        if (Math.abs(this.omega) < 0.6) {
          this.omega = 0;
          this.state = 'down';
        }
      }
    }
    this._q.setFromAxisAngle(this.axis, this.theta);
    this.mesh.quaternion.copy(this._q).multiply(this.q0);
    this.mesh.position.copy(this.base0).sub(this.pivot).applyQuaternion(this._q).add(this.pivot);
  }
}

/**
 * Dress the ledge around the urn (urn at the origin, ledge top at shelfY): a crowd of zebras in
 * three sizes facing the road (+Z), bottles, candle stubs, a garland. avoid: [{x, z, r}] areas left
 * free (the spirit house and its own offerings). Returns { figurines, update(dt), nearest(point, n) }.
 */
export function buildZebraShrine(scene, rng, shelfY, { W = 1.6, D = 1.3, H = 0.22, zc = -0.5, avoid = [] } = {}) {
  const L = ledge(W, D, H, shelfY);
  L.position.z = zc;
  scene.add(L);
  const mats = [zebraMaterial({ seed: 0.3 }), zebraMaterial({ fade: 0.55, chip: 0.4, seed: 1.7 }), zebraMaterial({ fade: 0.2, chip: 0.9, seed: 3.1 }), zebraMaterial({ fade: 0.85, chip: 0.6, seed: 5.3 })];
  const geos = [zebraGeometry(rng, { headDown: 0, stride: 0.2 }), zebraGeometry(rng, { headDown: 0.12, stride: 0.45 }), zebraGeometry(rng, { headDown: 0.04, stride: 0.05 })];
  const figurines = [];
  const placed = [{ x: 0, z: 0, r: 0.1 }, ...avoid];
  const free = (x, z, r) => placed.every((q) => Math.hypot(q.x - x, q.z - z) > q.r + r);
  // neat rows facing the road, smaller in front (shoulder 10-15 cm, 15-22 cm to the ears)
  const rows = [[0.1, 0.045, 0.16, 0.098], [0.12, -0.23, 0.2, 0.112], [0.14, -0.55, 0.38, 0.13], [0.15, -0.86, 0.42, 0.14]];
  let n = 0;
  for (const [h, z, xMin, step] of rows)
    for (let x = xMin; x <= W / 2 - 0.06; x += step)
      for (const sx of [-1, 1]) {
        const px = sx * x + (rng() - 0.5) * 0.012;
        const hh = h * (0.95 + rng() * 0.1);
        if (!free(px, z, 0.035) || rng() < 0.08) continue;
        placed.push({ x: px, z, r: 0.035 });
        const m = new THREE.Mesh(geos[n % 3], mats[(n * 7 + Math.floor(rng() * 3)) % 4]);
        m.scale.setScalar(hh);
        m.position.set(px, shelfY, z);
        m.rotation.y = -Math.PI / 2 + (rng() - 0.5) * 0.14; // facing the road
        scene.add(m);
        figurines.push(new Figurine(m, m.position, hh * 1.05, 0.62 * hh, 0.17 * hh));
        n++;
      }
  // a few big ones on the ground at the ledge's ends
  for (const [x, z, h] of [[-W / 2 - 0.16, zc + 0.2, 0.3], [W / 2 + 0.18, zc + 0.05, 0.34], [W / 2 + 0.12, zc + 0.45, 0.22]]) {
    const m = new THREE.Mesh(geos[n++ % 3], mats[n % 4]);
    m.scale.setScalar(h);
    m.position.set(x, shelfY - H, z);
    m.rotation.y = -Math.PI / 2 + (rng() - 0.5) * 0.4;
    scene.add(m);
    figurines.push(new Figurine(m, m.position, h, 0.42 * h, 0.11 * h));
  }
  // red soda bottles with straws, candle stubs, a faded garland on the ledge and one round the urn
  for (const [x, z] of [[-0.2, -0.06], [0.22, -0.02], [-0.55, 0.05], [0.6, -0.1], [0.42, 0.08]]) {
    if (!free(x, z, 0.035)) continue;
    placed.push({ x, z, r: 0.035 });
    const b = sodaBottle(rng);
    b.position.set(x, shelfY, z);
    b.rotation.y = rng() * 6;
    scene.add(b);
  }
  for (const [x, z, col] of [[-0.13, 0.08, 0xe6e0d0], [0.14, 0.09, 0xa8261c], [-0.36, 0.1, 0xe6e0d0], [0.33, -0.12, 0xa8261c]]) {
    if (!free(x, z, 0.02)) continue;
    const c = candleStub(rng, 0.03 + rng() * 0.05, col);
    c.position.set(x, shelfY, z);
    scene.add(c);
  }
  scene.add(garland(rng, V(-0.02, shelfY, 0.16), 0.1, 0.035), garland(rng, V(0.0, 0.004, 0.0), 0.066, 0.066, 40));
  // the ground beyond the ledge: dark packed earth and gravel
  const gc = document.createElement('canvas');
  gc.width = gc.height = 512;
  const gx = gc.getContext('2d');
  gx.fillStyle = '#1d1a16';
  gx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5000; i++) {
    const v = 20 + rng() * 50;
    gx.fillStyle = `rgba(${v},${v * 0.92},${v * 0.8},${0.4 + rng() * 0.5})`;
    gx.fillRect(rng() * 512, rng() * 512, 1 + rng() * 3, 1 + rng() * 2);
  }
  const gt = new THREE.CanvasTexture(gc);
  gt.colorSpace = THREE.SRGBColorSpace;
  gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
  gt.repeat.set(6, 6);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = shelfY - H;
  scene.add(ground);
  return {
    figurines,
    update(dt) {
      for (const f of figurines) f.update(dt);
    },
    /** The n figurines closest to a point (by their base). */
    nearest(point, k = 2) {
      return [...figurines].sort((a, b) => a.base0.distanceToSquared(point) - b.base0.distanceToSquared(point)).slice(0, k);
    },
  };
}
