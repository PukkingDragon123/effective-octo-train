// Glazed ceramic zebra figurines (ม้าลาย offerings at shrines and dangerous curves): swept and
// sculpted body (torso, arched neck, long head, jointed legs, erect mane, tufted tail) on a small
// bevelled base plate; warped stripes, white belly, crazed / chipped / sun-faded glaze painted in
// the shader from the custom attribute aSt (stripe phase, black, white). Shared by the loading
// screen's zebra shrine (src/ui/ZebraShrine.js) and the props kit's zebras().
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
