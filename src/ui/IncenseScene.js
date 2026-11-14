// Loading screen 3D: one joss stick (ธูป) planted in a brass urn of old ash at a roadside zebra
// shrine (ศาลม้าลาย: ceramic zebras, red soda, faded garlands; see ZebraShrine.js), burning down
// with the loading progress. Partway through, the ember goes out by itself: a last flare, a puff,
// then only the cold. When loading is done a woman's pale hand comes out of the dark, the ash
// breaks off under her grip and bounces into the urn, the stick bends as she pulls it from the
// ash, and the zebras her arm brushes rock or fall over. While it burns, a grey ash column grows
// over the glowing front, curls, breaks and drops; the smoke rises and turns turbulent.
//
// It has its own WebGL canvas, because the engine loop isn't running while the game boots. It is
// disposed when the loading screen leaves. If WebGL fails, Loading keeps its 2D stick.
import * as THREE from 'three';
import { makeRng } from '../core/math.js';
import { HandRig } from '../creatures/hand.js';
import { creatureMaterial } from '../creatures/skin.js';
import { buildZebraShrine } from './ZebraShrine.js';

const S = { base: -0.04, stem: 0.075, top: 0.3, rCore: 0.00105, rCoat: 0.00235 };
const SAND_Y = -0.004;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeInOut = (k) => k * k * (3 - 2 * k);
const easeOut = (k) => 1 - (1 - k) ** 3;

// periodic-in-angle lumps (sum of integer angular harmonics)
function lumps(y, a, s) {
  return (
    Math.sin(a * 2 + y * 210 + s) * 0.5 +
    Math.sin(a * 3 - y * 470 + s * 1.7) * 0.3 +
    Math.sin(a * 5 + y * 1130 + s * 2.3) * 0.2
  );
}

/** Tube geometry along +Y from a radius function r(y, angle). Normals from the seamless index. */
function tubeGeometry(y0, y1, rings, radial, rFn) {
  const pos = new Float32Array((rings + 1) * radial * 3);
  for (let i = 0; i <= rings; i++) {
    const y = y0 + ((y1 - y0) * i) / rings;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const r = rFn(y, a);
      const o = (i * radial + j) * 3;
      pos[o] = Math.cos(a) * r;
      pos[o + 1] = y;
      pos[o + 2] = Math.sin(a) * r;
    }
  }
  const idx = [];
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function stickGeometry() {
  return tubeGeometry(S.base, S.top, 560, 18, (y, a) => {
    if (y < S.stem - 0.0015) return S.rCore * (1 + 0.05 * Math.sin(a * 2 + y * 900) + (y < S.base + 0.002 ? -0.2 : 0));
    const coat = smooth(S.stem - 0.0015, S.stem + 0.0035, y);
    const taper = 1 - 0.13 * clamp((y - S.stem) / (S.top - S.stem), 0, 1);
    const lump = 1 + 0.075 * lumps(y, a, 0.4) + 0.025 * Math.sin(a * 7 + y * 3100);
    // the paste collar where the dipping stopped: a slightly thicker drip ring
    const collar = 1 + 0.18 * Math.exp(-(((y - S.stem - 0.004) / 0.002) ** 2));
    const tip = Math.sqrt(clamp((S.top - y) / 0.0045, 0.06, 1));
    return (S.rCore + (S.rCoat * taper * lump * collar - S.rCore) * coat) * tip;
  });
}

// GLSL value noise shared by the stick, sand and haze shaders
const NOISE_GLSL = /* glsl */ `
float dlbH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float dlbN(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(dlbH(i), dlbH(i + vec2(1.0, 0.0)), f.x), mix(dlbH(i + vec2(0.0, 1.0)), dlbH(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

function stickMaterial(u) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTip; uniform float uCurl; uniform float uCurlDir; uniform vec3 uBendBase; uniform vec3 uWhip; uniform float uGrip;\nvarying vec3 vSt;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vSt = position;
{
  float d = position.y - uTip;
  if (d > 0.0) {
    // ash: shrinks a little, cracks into rings, and curls away as it grows
    float k = clamp(d / 0.0022, 0.0, 1.0);
    transformed.xz *= mix(1.0, 0.85 + 0.06 * sin(position.y * 1900.0) + 0.03 * sin(position.y * 5200.0), k);
    float c = uCurl * d * d * 34.0;
    transformed.x += c * cos(uCurlDir);
    transformed.z += c * sin(uCurlDir);
  }
  // held at uGrip: below it the stem lags where the ash still holds it, above it the tip whips
  float gb = clamp((uGrip - position.y) / (uGrip - ${S.base.toFixed(4)}), 0.0, 1.0);
  float gt = clamp((position.y - uGrip) / (${S.top.toFixed(4)} - uGrip), 0.0, 1.0);
  transformed += uBendBase * gb * gb + uWhip * gt * gt;
}`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTip; uniform float uAsh; uniform float uTime; uniform float uStem; uniform float uHeat;\nvarying vec3 vSt;\n${NOISE_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float stA = atan(vSt.z, vSt.x);
float stD = vSt.y - uTip;
float stRag = dlbN(vec2(stA * 2.2 + 3.0, uAsh * 400.0));
if (stD > uAsh - stRag * 0.0016) discard;
vec2 stP = vec2(stA * 2.0, vSt.y * 900.0);
vec3 stCol;
if (vSt.y < uStem) {
  // red-dyed bamboo stem: fibres, dye worn thin in streaks
  float fib = dlbN(vec2(stA * 5.0, vSt.y * 160.0)) * 0.6 + dlbN(vec2(stA * 11.0, vSt.y * 40.0)) * 0.4;
  stCol = mix(vec3(0.30, 0.03, 0.022), vec3(0.58, 0.075, 0.04), fib);
  float worn = smoothstep(0.62, 0.92, dlbN(vec2(stA * 3.0, vSt.y * 420.0)));
  stCol = mix(stCol, vec3(0.46, 0.33, 0.19), worn * 0.4);
  stCol *= 0.8 + 0.2 * smoothstep(0.0, 0.02, vSt.y);
} else {
  // joss paste: sawdust, resin and makko, speckled
  float gr = dlbN(stP) * 0.6 + dlbN(stP * 3.1) * 0.4;
  stCol = mix(vec3(0.15, 0.088, 0.05), vec3(0.29, 0.18, 0.105), gr);
  stCol *= 0.82 + 0.4 * step(0.86, dlbH(floor(stP * vec2(5.0, 1.6))));
  stCol = mix(stCol, vec3(0.36, 0.07, 0.04), smoothstep(uStem + 0.003, uStem, vSt.y) * 0.5);
}
// scorched band under the burning front
stCol = mix(stCol, vec3(0.028, 0.022, 0.02), smoothstep(-0.0065, -0.0005, stD));
if (stD > 0.0) {
  float an = dlbN(vec2(stA * 4.0, vSt.y * 1700.0)) * 0.7 + dlbN(vec2(stA * 9.0, vSt.y * 5100.0)) * 0.3;
  stCol = mix(vec3(0.36, 0.345, 0.33), vec3(0.74, 0.72, 0.68), an);
  stCol *= 0.55 + 0.45 * smoothstep(0.0, 0.0035, stD);
}
if (!gl_FrontFacing) stCol *= 0.3;
diffuseColor.rgb = stCol;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  float band = smoothstep(-0.003, -0.0002, stD) * (1.0 - smoothstep(0.0002, 0.0024, stD));
  float hot = dlbN(vec2(stA * 3.0 + uTime * 0.6, vSt.y * 2600.0 - uTime * 1.4));
  float fl = 0.78 + 0.22 * sin(uTime * 6.1 + stA * 2.0) * sin(uTime * 2.3 + 1.0);
  float e = band * (0.35 + 1.1 * hot * hot) * fl * uHeat;
  if (!gl_FrontFacing) e = (1.0 - smoothstep(0.0, 0.0045, abs(stD))) * 1.5 * fl * uHeat;
  totalEmissiveRadiance += vec3(1.0, 0.26, 0.055) * e * 2.8 + vec3(1.0, 0.72, 0.38) * pow(e, 3.0) * 1.4;
}`,
      );
  };
  m.customProgramCacheKey = () => 'dlb-incense-stick';
  return m;
}

/** A burnt-out stub of an old stick (red stem, frayed charred top, a crumb of ash). */
function stubGeometry(h, rng) {
  const s = rng() * 10;
  const g = tubeGeometry(-0.03, h, Math.max(24, Math.round(h * 900)), 10, (y, a) => {
    const top = clamp((h - y) / 0.0018, 0, 1);
    const fray = y > h - 0.004 ? 1 + 0.25 * Math.sin(a * 5 + s) * Math.sin(y * 3000 + s) : 1;
    return S.rCore * (1 + 0.06 * Math.sin(a * 2 + y * 800 + s)) * fray * (0.35 + 0.65 * Math.sqrt(top));
  });
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const fib = 0.75 + 0.25 * Math.sin(y * 700 + i * 0.37);
    let c = [0.36 * fib, 0.045 * fib, 0.03 * fib];
    const char = smooth(h - 0.009, h - 0.002, y);
    c = c.map((v, k) => v + ([0.03, 0.026, 0.024][k] - v) * char);
    // faded by smoke and ash dust toward the bottom
    const dust = smooth(0.012, -0.002, y) * 0.5;
    c = c.map((v, k) => v + ([0.33, 0.31, 0.29][k] - v) * dust);
    col.set(c, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function ashChunkGeometry(len, rng) {
  const s = rng() * 10;
  const g = tubeGeometry(0, len, Math.max(8, Math.round(len * 1600)), 9, (y, a) => {
    const end = Math.min(clamp(y / 0.0008, 0, 1), clamp((len - y) / 0.0008, 0, 1));
    return S.rCoat * 0.86 * (1 + 0.08 * Math.sin(y * 1900 + s) + 0.1 * Math.sin(a * 3 + s)) * (0.4 + 0.6 * Math.sqrt(end));
  });
  g.translate(0, -len / 2, 0);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = 0.44 + 0.3 * (0.5 + 0.5 * Math.sin(pos.getY(i) * 2300 + i * 1.7)) * (0.6 + 0.4 * rng());
    col.set([v, v * 0.97, v * 0.93], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Brass incense urn (กระถางธูป), lathed from a traced profile: foot, belly, neck, rolled lip. */
function urn(rng) {
  const prof = [
    [0.0, -0.075], [0.036, -0.075], [0.04, -0.073], [0.041, -0.069], [0.035, -0.066], [0.038, -0.062],
    [0.05, -0.054], [0.062, -0.042], [0.069, -0.028], [0.0705, -0.016], [0.068, -0.006], [0.0635, 0.0015],
    [0.0625, 0.005], [0.0655, 0.009], [0.068, 0.0125], [0.0665, 0.0155], [0.0625, 0.0145], [0.0598, 0.011],
    [0.0592, 0.004], [0.0585, SAND_Y - 0.002],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(prof, 112);
  // soot, polish worn by hands on the lip, green verdigris in the hollows, dents
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const s = rng() * 100;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const dent = 1 - 0.012 * Math.max(0, Math.sin(a * 3 + s) * Math.sin(y * 90 + s)) - 0.006 * Math.sin(a * 11 + y * 300);
    pos.setX(i, x * dent);
    pos.setZ(i, z * dent);
    const n = 0.5 + 0.5 * Math.sin(a * 7 + y * 140 + s) * Math.sin(a * 3 - y * 260);
    let c = [0.42, 0.3, 0.13];
    const soot = smooth(-0.02, 0.014, y) * (0.55 + 0.4 * n);
    c = c.map((v, k) => v * (1 - soot * 0.75));
    const ver = smooth(0.55, 0.9, n) * smooth(-0.02, -0.06, y);
    c = c.map((v, k) => v + ([0.16, 0.27, 0.2][k] - v) * ver * 0.7);
    const rub = smooth(0.008, 0.0135, y) * (0.6 + 0.4 * n);
    c = c.map((v, k) => v + ([0.66, 0.5, 0.25][k] - v) * rub * 0.6);
    col.set(c, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.68 }));
}

/** Grey ash and sand in the urn: grains, a mound and crater around the stick, dark burnt crumbs. */
function ashBed(rng) {
  const g = new THREE.CircleGeometry(0.0595, 96, 0, Math.PI * 2);
  // densify: rebuild as a polar grid so the grains have vertices to live on
  const rings = 64, seg = 128;
  const pos = [], col = [], idx = [];
  const s = rng() * 100;
  for (let i = 0; i <= rings; i++) {
    const r = (i / rings) * 0.0596;
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const mound = 0.0025 * Math.exp(-((r / 0.012) ** 2)) - 0.0012 * Math.exp(-((r / 0.003) ** 2));
      const grain = 0.0004 * Math.sin(x * 1900 + s) * Math.sin(z * 2100 - s) + 0.00025 * Math.sin(x * 4100 + z * 3700);
      const rim = -0.0015 * smooth(0.05, 0.0596, r);
      pos.push(x, SAND_Y + mound + grain + rim, z);
      const n = 0.5 + 0.5 * Math.sin(x * 820 + s) * Math.sin(z * 760 - s * 0.7);
      let v = 0.32 + 0.18 * n + 0.08 * rng();
      let c = [v, v * 0.96, v * 0.9];
      if (rng() < 0.05) c = [0.07, 0.055, 0.045]; // charcoal crumbs
      else if (rng() < 0.015) c = [0.4, 0.06, 0.04]; // red dye flakes
      col.push(...c);
    }
  }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + ((j + 1) % seg), c = a + seg, d = b + seg;
      idx.push(a, b, c, b, d, c);
    }
  g.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
  mesh.receiveShadow = true;
  return mesh;
}

/** Drifting haze sheets between the objects (dim, slow, cool). */
function haze(z, w, h, seed, alpha) {
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uA: { value: alpha } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; uniform float uTime; uniform float uSeed; uniform float uA;
      ${NOISE_GLSL}
      float fbm(vec2 p){ float a = 0.0, m = 0.5; for (int i = 0; i < 5; i++){ a += dlbN(p) * m; p = p * 2.03 + 11.7; m *= 0.5; } return a; }
      void main(){
        vec2 p = vUv * vec2(3.0, 1.6) + vec2(uTime * 0.025 + uSeed, -uTime * 0.012);
        float n = fbm(p + fbm(p * 1.7 - uTime * 0.02) * 1.3);
        float edge = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x) * smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
        float a = smoothstep(0.42, 0.85, n) * edge * uA;
        gl_FragColor = vec4(vec3(0.42, 0.47, 0.55), a);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.position.set(0, h * 0.32, z);
  mesh.renderOrder = 2;
  return mesh;
}

/**
 * Smoke as a streakline: points are emitted at the ember and carried by a time-varying flow
 * (laminar at first, then breaking into curls). They are drawn as one camera-facing ribbon
 * that widens and thins as it rises.
 */
class Smoke {
  constructor({ max = 620, life = 6.5, seed = 0, width = 1, alpha = 0.5, rate = 95 } = {}) {
    Object.assign(this, { max, life, seed, width, alpha, rate });
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.age = new Float32Array(max);
    this.count = 0;
    this.acc = 0;
    this.stir = 0;
    this.wind = new THREE.Vector3();
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 2 * 3);
    this.attr = new Float32Array(max * 2 * 3); // side, age01, alpha
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aS', new THREE.BufferAttribute(this.attr, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = new Uint32Array((max - 1) * 6);
    for (let i = 0; i < max - 1; i++) idx.set([i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2], i * 6);
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uWarm: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 aS; varying vec3 vS;
        void main(){ vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec3 vS; uniform float uTime; uniform float uWarm;
        void main(){
          float e = 1.0 - abs(vS.x);
          float soft = smoothstep(0.0, 0.9, e);
          // twisted filaments inside the plume
          float f = 0.55 + 0.45 * sin(vS.x * 6.5 + vS.y * 40.0 - uTime * 0.6);
          float a = vS.z * soft * mix(1.0, f, smoothstep(0.03, 0.3, vS.y));
          vec3 cool = vec3(0.56, 0.62, 0.71);
          vec3 warm = vec3(1.0, 0.62, 0.38);
          vec3 c = mix(warm, cool, smoothstep(0.0, 0.08, vS.y) * (0.6 + 0.4 * uWarm) + (1.0 - uWarm) * 0.4);
          gl_FragColor = vec4(c, a);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.last = null;
  }

  update(dt, t, src, cam, emitting = true) {
    const { p, v, age, max } = this;
    // emit (interpolating along the ember's path so a fast pull leaves a continuous trail)
    if (emitting) {
      this.acc += dt * this.rate;
      const n = Math.floor(this.acc);
      this.acc -= n;
      const from = this.last || src;
      for (let k = 0; k < n; k++) {
        p.copyWithin(3, 0, (max - 1) * 3);
        v.copyWithin(3, 0, (max - 1) * 3);
        age.copyWithin(1, 0, max - 1);
        const f = n > 1 ? (k + 1) / n : 1;
        p[0] = from.x + (src.x - from.x) * f + (Math.random() - 0.5) * 0.0003;
        p[1] = from.y + (src.y - from.y) * f + 0.0012;
        p[2] = from.z + (src.z - from.z) * f + (Math.random() - 0.5) * 0.0003;
        v[0] = (Math.random() - 0.5) * 0.002;
        v[1] = 0.022;
        v[2] = (Math.random() - 0.5) * 0.002;
        age[0] = (n - 1 - k) * (dt / Math.max(1, n));
        this.count = Math.min(max, this.count + 1);
      }
      this.last = (this.last || new THREE.Vector3()).copy(src);
    }
    while (this.count > 0 && age[this.count - 1] > this.life) this.count--;

    const sd = this.seed;
    const draftX = 0.02 * Math.sin(t * 0.37 + sd) + 0.01 * Math.sin(t * 1.13 + sd * 2);
    const draftZ = 0.014 * Math.sin(t * 0.29 + 1 + sd);
    const damp = Math.exp(-1.1 * dt);
    for (let i = 0; i < this.count; i++) {
      const o = i * 3;
      const a = (age[i] += dt);
      const x = p[o], y = p[o + 1], z = p[o + 2];
      const turb = smooth(0.15, 1.3, a) * (0.2 + this.stir * 0.35);
      const fx = Math.sin(y * 52 + t * 0.8 + sd) * 0.6 + Math.sin(y * 131 - t * 1.9 + z * 90) * 0.4 + Math.sin(z * 66 + t * 1.3 + sd) * 0.3;
      const fz = Math.cos(y * 47 - t * 0.7 + sd * 1.7) * 0.6 + Math.sin(y * 119 + t * 2.3 + x * 85) * 0.4;
      v[o] = v[o] * damp + (fx * turb + draftX * smooth(0, 1.2, a) + this.wind.x) * dt;
      v[o + 2] = v[o + 2] * damp + (fz * turb + draftZ * smooth(0, 1.2, a) + this.wind.z) * dt;
      // buoyant at first, then the plume cools and slows
      v[o + 1] += (0.07 * Math.exp(-a * 0.45) + 0.012 - v[o + 1] * 0.6 + this.wind.y) * dt;
      p[o] = x + v[o] * dt;
      p[o + 1] = y + v[o + 1] * dt;
      p[o + 2] = z + v[o + 2] * dt;
    }

    // ribbon
    const pos = this.pos, at = this.attr;
    const tv = new THREE.Vector3(), vw = new THREE.Vector3(), sd3 = new THREE.Vector3();
    for (let i = 0; i < this.count; i++) {
      const a = Math.max(0, i - 1) * 3, b = Math.min(this.count - 1, i + 1) * 3, o = i * 3;
      tv.set(p[a] - p[b], p[a + 1] - p[b + 1], p[a + 2] - p[b + 2]);
      if (tv.lengthSq() < 1e-14) tv.set(0, 1, 0);
      vw.set(cam.x - p[o], cam.y - p[o + 1], cam.z - p[o + 2]);
      sd3.crossVectors(tv, vw).normalize();
      const ag = age[i];
      const w = (0.00032 + ag * 0.0011 + smooth(0.6, 4, ag) * 0.006) * this.width;
      const al = this.alpha * smooth(0, 0.12, ag) * (1 - smooth(this.life * 0.45, this.life, ag)) * Math.min(1, 0.0011 / w + 0.12);
      for (let s = 0; s < 2; s++) {
        const k = (i * 2 + s) * 3, sg = s ? 1 : -1;
        pos[k] = p[o] + sd3.x * w * sg;
        pos[k + 1] = p[o + 1] + sd3.y * w * sg;
        pos[k + 2] = p[o + 2] + sd3.z * w * sg;
        at[k] = sg;
        at[k + 1] = ag / this.life;
        at[k + 2] = al;
      }
    }
    const geo = this.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aS.needsUpdate = true;
    geo.setDrawRange(0, Math.max(0, this.count - 1) * 6);
    this.mat.uniforms.uTime.value = t;
  }
}

export class IncenseScene {
  /** @param {HTMLElement} host element to fill with the canvas */
  constructor(host, { manual = false } = {}) {
    this.host = host;
    this.progress = 0;
    this.t = 0;
    this.disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = false;
    renderer.setClearColor(0x000000, 1);
    this.renderer = renderer;
    renderer.domElement.className = 'dlb-loading__canvas';
    host.appendChild(renderer.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.fog = new THREE.FogExp2(0x020203, 1.25);
    this.camera = new THREE.PerspectiveCamera(22, 1, 0.004, 5);
    const rng = makeRng(1331);

    // ---- light: the ember, a cold sliver of moon; once the ember dies the cold creeps in
    this.emberLight = new THREE.PointLight(0xff6326, 0.03, 1.1, 2);
    scene.add(this.emberLight);
    const moon = new THREE.DirectionalLight(0x8a96a8, 0.08);
    moon.position.set(0.9, 0.6, -0.5);
    // a faint cold wash from the road side, just enough to read the white glaze of the zebras
    const road = new THREE.DirectionalLight(0x7d8aa0, 0.2);
    road.position.set(-0.7, 0.45, -0.9); // a faint cold rim from behind
    scene.add(moon, road);
    scene.add(new THREE.HemisphereLight(0x15171b, 0x080504, 0.06));
    this.cold = new THREE.PointLight(0x8796b4, 0, 1.6, 2);
    this.cold.position.set(0.34, 0.22, 0.06);
    scene.add(this.cold);

    // ---- the shrine
    this.urn = urn(rng);
    scene.add(this.urn, ashBed(rng));
    const stubMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    for (let i = 0; i < 17; i++) {
      const a = rng() * Math.PI * 2, r = 0.012 + rng() * 0.042;
      const st = new THREE.Mesh(stubGeometry(0.008 + rng() * rng() * 0.07, rng), stubMat);
      st.position.set(Math.cos(a) * r, SAND_Y, Math.sin(a) * r);
      st.rotation.set((rng() - 0.5) * 0.35, rng() * 6.28, (rng() - 0.5) * 0.35);
      scene.add(st);
    }
    this.ashMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    this.ashGeos = [0.006, 0.009, 0.012, 0.015].map((l) => ashChunkGeometry(l, rng));
    for (let i = 0; i < 22; i++) {
      const m = new THREE.Mesh(this.ashGeos[i % 4], this.ashMat);
      const a = rng() * 6.28, r = 0.006 + rng() * 0.05;
      m.position.set(Math.cos(a) * r, SAND_Y + 0.0018, Math.sin(a) * r);
      m.rotation.set(Math.PI / 2 + (rng() - 0.5) * 0.3, 0, rng() * 6.28);
      m.rotation.order = 'ZXY';
      scene.add(m);
    }
    // the ledge and its crowd of zebras; the spirit house on its post stands at the back of it
    this.shrine = buildZebraShrine(scene, rng, -0.0752, { avoid: [{ x: 0.0, z: -0.4, r: 0.32 }, { x: 0.05, z: -0.95, r: 0.34 }, { x: 0.12, z: -0.2, r: 0.16 }, { x: -0.1, z: -0.2, r: 0.14 }] });
    this.ready = Promise.resolve(); // the spirit house is not built here: it slowed loading and the macro never shows it
    scene.add(haze(-0.12, 0.9, 0.5, 1.3, 0.025), haze(-0.42, 1.6, 0.9, 7.1, 0.03));

    // ---- the stick
    this.u = {
      uTip: { value: S.top - 0.0015 }, uAsh: { value: 0.0016 }, uCurl: { value: 0.0 }, uCurlDir: { value: 0.6 },
      uTime: { value: 0 }, uStem: { value: S.stem }, uHeat: { value: 1 },
      uBendBase: { value: new THREE.Vector3() }, uWhip: { value: new THREE.Vector3() }, uGrip: { value: S.stem - 0.016 },
    };
    this.stickPivot = new THREE.Group();
    this.stickPivot.rotation.set(0.035, 0, -0.06);
    scene.add(this.stickPivot);
    this.stick = new THREE.Mesh(stickGeometry(), stickMaterial(this.u));
    this.stick.frustumCulled = false;
    this.stickPivot.add(this.stick);
    this.tip = S.top - 0.0015;
    this.ashLen = 0.0016;
    this.ashMax = 0.011;
    this.falling = [];

    // ember halo: a small sharp glow card
    const hc = document.createElement('canvas');
    hc.width = hc.height = 64;
    const hx = hc.getContext('2d');
    const gr = hx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,190,120,0.9)');
    gr.addColorStop(0.18, 'rgba(255,110,40,0.45)');
    gr.addColorStop(0.5, 'rgba(200,50,15,0.1)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    hx.fillStyle = gr;
    hx.fillRect(0, 0, 64, 64);
    const ht = new THREE.CanvasTexture(hc);
    ht.colorSpace = THREE.SRGBColorSpace;
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: ht, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.halo.scale.setScalar(0.026);
    this.halo.renderOrder = 4;
    scene.add(this.halo);

    // sparks that pop off the ember now and then
    this.sparks = [];
    const sg = new THREE.BufferGeometry();
    this.sparkPos = new Float32Array(24 * 3);
    sg.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparkPts = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffa860, size: 2.2, sizeAttenuation: false, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    this.sparkPts.frustumCulled = false;
    scene.add(this.sparkPts);

    this.smoke = [new Smoke({ seed: 0.0, width: 1, alpha: 0.5 }), new Smoke({ seed: 2.7, width: 2.2, alpha: 0.16, rate: 60, life: 7.5 })];
    for (const s of this.smoke) {
      s.baseRate = s.rate;
      scene.add(s.mesh);
    }

    // the ember goes out on its own a few seconds in (or when the hand comes, if loading is quick)
    this.emberOutAt = 6.8;
    this.out = null;
    this.camTarget = new THREE.Vector3(0, S.top - 0.01, 0);
    this.camDist = 0.22;
    this.grab = null;
    this.hand = null;
    this.fade = 0;
    this._ember = new THREE.Vector3();
    this._smokeAt = new THREE.Vector3();
    this._v = new THREE.Vector3();

    this._resize = () => this.resize();
    window.addEventListener('resize', this._resize);
    this.resize();
    this._last = performance.now();
    this._loop = () => {
      if (this.disposed) return;
      this._raf = requestAnimationFrame(this._loop);
      const now = performance.now();
      // the hand runs on real time (up to 0.1 s a frame) so a slow frame rate never stretches it;
      // the smoke and ash keep the smaller, stable step
      const raw = Math.min(0.1, (now - this._last) / 1000);
      this._last = now;
      this._rawDt = raw;
      this.update(Math.min(0.05, raw));
    };
    if (!manual) this._raf = requestAnimationFrame(this._loop);
    // sculpt the hand while the rest loads (it takes a moment)
    this._handTimer = setTimeout(() => this._buildHand(), 1200);
  }

  resize() {
    const w = this.host.clientWidth || window.innerWidth, h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  setProgress(p) {
    this.progress = clamp(p, 0, 1);
  }

  _buildHand() {
    if (this.hand || this.disposed) return;
    try {
      const material = creatureMaterial({
        detail: 'ghostSkin', detailScale: 3.6, detailAmount: 0.45, bump: 0.8, color: 0xffffff, roughness: 0.55,
        skin: true, sss: 0.8, pale: 0.38, wet: 0.2, brush: 0.2, emissive: 0x000000, rim: 0.3, puddles: 0,
      });
      // a woman's hand: slender long fingers, a narrow wrist, long nails
      const hand = new HandRig({
        shape: { fingerScale: 1.2, thickness: 0.72, bony: 0.3, nails: 0.2, forearm: 2.4, wrist: 0.76, color: [0.66, 0.61, 0.56] },
        material,
        twitch: 0.12,
      });
      const root = new THREE.Group();
      root.add(hand.mesh);
      root.scale.setScalar(0.082);
      root.visible = false;
      this.scene.add(root);
      this.hand = hand;
      this.handRoot = root;
      // an old gold bangle, loose on the wrist (a D-section swept round, worn smooth)
      const R = 0.27, w = 0.085, th = 0.042;
      const prof = [];
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const c = Math.cos(a);
        prof.push(new THREE.Vector2(R + th * 0.5 + c * th * (c > 0 ? 0.5 : 0.3), Math.sin(a) * w * 0.5));
      }
      const bangle = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), new THREE.MeshStandardMaterial({ color: 0xa8843c, metalness: 1, roughness: 0.34 }));
      root.updateMatrixWorld(true);
      const bone = hand.b.arm || hand.b.wrist;
      const wp = hand.mesh.localToWorld(new THREE.Vector3(0.03, -0.46, -0.02));
      bone.worldToLocal(wp);
      bangle.position.copy(wp);
      const qb = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
      bangle.quaternion.copy(qb.multiply(hand.mesh.getWorldQuaternion(new THREE.Quaternion()))).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.18, 0, 0.12)));
      const ws = bone.getWorldScale(new THREE.Vector3()).x / root.scale.x;
      bangle.scale.setScalar(1 / Math.max(1e-6, ws));
      bone.add(bangle);
      // compile now so the reach doesn't hitch
      root.visible = true;
      root.position.set(0, -10, 0);
      this.renderer.compile(this.scene, this.camera);
      root.visible = false;
    } catch (e) {
      console.warn('[loading] hand failed', e);
      this.hand = null;
    }
  }

  /** The ศาลพระภูมิ from the props module (with its own offerings: incense pot, candles, soda,
   *  dancers, carved elephants, garlands), once its CC0 models are in. Its materials are shared with
   *  the game, so dispose() leaves it alone. */
  async _buildHouse() {
    try {
      const P = await import('../props/index.js');
      await Promise.race([P.loadPropAssets?.(), new Promise((r) => setTimeout(r, 1500))]);
      // never build (and compile) it once the hand has started: that hitch would eat the intro
      if (this.disposed || this.grab) return;
      const sh = P.createSpiritHouse({ style: 'thai', size: 0.62, seed: 21, age: 0.85, offerings: true });
      sh.object.position.set(0.05, -0.0752, -0.95);
      sh.object.userData.noDispose = true;
      this.scene.add(sh.object);
    } catch (e) {
      console.warn('[loading] spirit house unavailable', e);
    }
  }

  /** The stick's ember (top of the burning front) in world space. */
  emberWorld(out) {
    return this.stick.localToWorld(out.set(0, this.tip + 0.0004, 0));
  }

  /** Where the smoke leaves the stick: the top of the (curled) ash column. */
  smokeSource(out) {
    const a = this.ashLen, c = this.u.uCurl.value * a * a * 34, d = this.u.uCurlDir.value;
    return this.stick.localToWorld(out.set(c * Math.cos(d), this.tip + a - 0.0006, c * Math.sin(d)));
  }

  /** The ember dies: one last flare, a puff of smoke, a few sparks, then dark. */
  _snuff() {
    this.out = { t: this.t };
    for (const s of this.smoke) {
      s.rate = s.baseRate * 3.5;
      s.stir = 1;
    }
    const e = this.emberWorld(new THREE.Vector3());
    for (let k = 0; k < 6; k++) this.sparks.push({ p: e.clone(), v: new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.05 + Math.random() * 0.09, (Math.random() - 0.5) * 0.1), life: 0.3 + Math.random() * 0.4 });
  }

  update(dt) {
    this.t += dt;
    const t = this.t, u = this.u;
    u.uTime.value = t;
    if (!this.out && (t > this.emberOutAt || this.grab)) this._snuff();
    const since = this.out ? t - this.out.t : -1;

    // burn: the front creeps toward the progress target while lit, never jumps
    if (!this.grab && !this.out) {
      const target = S.top - 0.0015 - this.progress * (S.top - S.stem) * 0.7;
      const speed = 0.006 + Math.max(0, this.tip - target) * 0.8;
      const prev = this.tip;
      this.tip = Math.max(target, this.tip - speed * dt);
      this.tip -= dt * 0.00012;
      this.ashLen += (prev - this.tip) * 0.9;
      if (this.ashLen > this.ashMax) this._breakAsh();
    }
    u.uTip.value = this.tip;
    u.uAsh.value = this.ashLen;
    u.uCurl.value = 0.45 + 0.25 * Math.sin(this.ashMax * 900);
    const breath = 0.86 + 0.14 * Math.sin(t * 1.3) * Math.sin(t * 0.71 + 1.0) + 0.05 * Math.sin(t * 9.0);
    let heat = breath;
    if (this.out) heat *= since < 0.12 ? 1 + since * 7 : Math.max(0, 1 - (since - 0.12) / 0.32) ** 2;
    u.uHeat.value = heat;
    // after the puff the smoke thins to a smoulder, then stops
    if (this.out) for (const s of this.smoke) s.rate = since < 0.35 ? s.baseRate * 3.5 : s.baseRate * 0.3;
    const emitting = !this.out || since < 1.5;

    this.scene.updateMatrixWorld(true);
    const ember = this.emberWorld(this._ember);
    const smokeAt = this.smokeSource(this._smokeAt);
    this.emberLight.position.copy(ember).add(this._v.set(0.0012, 0.004, 0.003));
    this.emberLight.intensity = 0.03 * heat * (1 - this.fade);
    this.halo.position.copy(ember);
    this.halo.material.opacity = (0.55 + 0.35 * heat) * Math.min(1, heat);
    this.halo.visible = heat > 0.01;
    this.cold.intensity = this.out ? 0.07 * smooth(0.3, 2.6, since) * (1 - this.fade) : 0;
    this.scene.traverse((o) => {
      if (o.material?.uniforms?.uSeed) o.material.uniforms.uTime.value = t;
    });

    this._updateFalling(dt);
    this._updateSparks(dt, ember, heat);
    if (this.grab) this._updateGrab(dt);
    if (this.hand) this.hand.update(this.grab ? this._rawDt ?? dt : dt);
    this.shrine.update(dt);

    for (const s of this.smoke) s.update(dt, t, smokeAt, this.camera.position, emitting);

    // camera: the whole little shrine, the stick in the middle; drifting like a held breath
    const portrait = this.camera.aspect < 1;
    // macro on the burning tip: the stick and its ember fill the frame, the zebras are only shapes
    // in the dark behind; while the hand comes the lens backs off to hold the hand and the stick
    const want = this.grab ? this.grab.camTarget : this.stick.localToWorld(this._v.set(0, this.tip - 0.008, 0));
    this.camTarget.lerp(want, 1 - Math.exp(-dt * (this.grab ? 1.6 : 3)));
    const dist = this.grab ? this.grab.camDist : 0.22 + (portrait ? 0.08 : 0) - (this.out ? 0.02 * smooth(0, 4, since) : 0);
    this.camDist += (dist - this.camDist) * (1 - Math.exp(-dt * (this.grab ? 1.4 : 3)));
    const sx = Math.sin(t * 0.31) * 0.0016 + Math.sin(t * 0.83) * 0.0006, sy = Math.sin(t * 0.27 + 1) * 0.0012;
    const shake = this.grab?.shake || 0;
    const g0 = this.grab ? 1 : 0;
    this.camera.position.set(
      this.camTarget.x + 0.022 + 0.04 * g0 + sx + (Math.random() - 0.5) * shake,
      this.camTarget.y + 0.012 + 0.05 * g0 + sy + (Math.random() - 0.5) * shake,
      this.camTarget.z + this.camDist,
    );
    this.camera.lookAt(this.camTarget.x + sx * 0.3, this.camTarget.y, this.camTarget.z);
    this.renderer.domElement.style.opacity = String(1 - this.fade);
    if (!this.noRender) this.renderer.render(this.scene, this.camera);
  }

  /** The curled ash column snaps off and falls (kick: extra velocity, e.g. the jolt of a grip). */
  _breakAsh(kick = null) {
    const len = Math.min(this.ashLen - 0.0012, 0.016);
    if (len < 0.002) return;
    const L = [0.006, 0.009, 0.012, 0.015];
    const geo = L.reduce((b, l, i) => (Math.abs(l - len) < Math.abs(L[b] - len) ? i : b), 0);
    const m = new THREE.Mesh(this.ashGeos[geo], this.ashMat);
    m.position.copy(this.stick.localToWorld(new THREE.Vector3(0, this.tip + len / 2 + 0.001, 0)));
    m.quaternion.copy(this.stick.getWorldQuaternion(new THREE.Quaternion()));
    this.scene.add(m);
    const v = new THREE.Vector3((Math.random() - 0.5) * 0.03, 0, (Math.random() - 0.5) * 0.03);
    if (kick) v.add(kick);
    this.falling.push({ m, v, w: new THREE.Vector3(Math.random() * 10 - 5, 0, Math.random() * 12 - 6), done: false });
    if (this.falling.length > 10) this.falling.shift().m.removeFromParent();
    this.ashLen = 0.0014;
    this.ashMax = 0.007 + Math.random() * 0.009;
    this.u.uCurlDir.value = Math.random() * Math.PI * 2;
  }

  // ash under gravity: it lands on the ash bed, the urn's lip or the shelf, bounces, settles
  _updateFalling(dt) {
    for (const f of this.falling) {
      if (f.done) continue;
      const p = f.m.position;
      f.v.y -= 9.8 * dt;
      p.addScaledVector(f.v, dt);
      f.m.rotation.x += f.w.x * dt;
      f.m.rotation.z += f.w.z * dt;
      const r = Math.hypot(p.x, p.z);
      const floor = r < 0.058 ? SAND_Y + 0.0016 : r < 0.07 ? 0.0158 : -0.0736;
      if (r >= 0.058 && r < 0.07) {
        f.v.x += (p.x / r) * 0.6 * dt; // rolls off the rounded lip
        f.v.z += (p.z / r) * 0.6 * dt;
      }
      if (p.y < floor) {
        p.y = floor;
        if (f.v.y < -0.12) {
          f.v.y = -f.v.y * 0.3;
          f.v.x *= 0.5;
          f.v.z *= 0.5;
          f.w.multiplyScalar(0.45);
        } else if (r < 0.058 || r >= 0.07) {
          f.m.rotation.set(Math.PI / 2, 0, f.m.rotation.y + Math.random(), 'ZXY');
          f.done = true;
        }
      }
      if (p.y < -0.2) f.done = true;
    }
  }

  _updateSparks(dt, ember, heat) {
    const pop = this.grab ? this.grab.sparks : 0.25;
    if (heat > 0.3 && Math.random() < pop * dt) {
      for (let k = 0; k < (this.grab ? 3 : 1); k++)
        if (this.sparks.length < 24) this.sparks.push({ p: ember.clone(), v: new THREE.Vector3((Math.random() - 0.5) * 0.08, 0.04 + Math.random() * 0.08, (Math.random() - 0.5) * 0.08), life: 0.35 + Math.random() * 0.5 });
    }
    const pos = this.sparkPos;
    let n = 0;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.v.y -= 0.25 * dt;
      s.p.addScaledVector(s.v, dt);
    }
    for (const s of this.sparks.slice(0, 24)) pos.set([s.p.x, s.p.y, s.p.z], n++ * 3);
    this.sparkPts.geometry.setDrawRange(0, n);
    this.sparkPts.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * The start sequence: a woman's pale hand comes out of the dark, closes around the red stem and
   * pulls the stick out of the urn. Resolves when the screen has gone dark.
   */
  playGrab(cue = () => {}) {
    if (this.grab) return this.grab.promise;
    this._cue = cue;
    this._buildHand();
    clearTimeout(this._handTimer);
    const g = { time: 0, heat: 1, sparks: 0, shake: 0, camTarget: this.camTarget.clone(), camDist: this.camDist, attached: false, whip: 0, whipV: 0 };
    g.promise = new Promise((r) => (g.resolve = r));
    this.grab = g;
    if (!this.hand) {
      g.noHand = true;
      return g.promise;
    }
    this.scene.updateMatrixWorld(true);
    const grip = this.stick.localToWorld(new THREE.Vector3(0, S.stem - 0.016, 0));
    // fingers toward the stick, palm away from camera, thumb down; forearm in from the right
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1));
    const q = new THREE.Quaternion().setFromRotationMatrix(basis);
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.55));
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.06));
    this.handRoot.quaternion.copy(q);
    const s = this.handRoot.scale.x;
    const gripLocal = new THREE.Vector3(0, 0.98, 0.27).multiplyScalar(s).applyQuaternion(q);
    g.wristAt = grip.clone().sub(gripLocal);
    const forearm = new THREE.Vector3(0, -1, 0).applyQuaternion(q);
    g.from = g.wristAt.clone().addScaledVector(forearm, 0.3).add(new THREE.Vector3(0.0, 0.07, 0.05));
    g.near = g.wristAt.clone().addScaledVector(forearm, 0.012).add(new THREE.Vector3(0, 0.004, 0.012));
    g.away = g.wristAt.clone().addScaledVector(forearm, 0.42).add(new THREE.Vector3(0, 0.12, 0.09));
    g.forearm = forearm;
    g.grip = grip;
    // the zebras in the arm's way: one is brushed and rocks, one is knocked over on the way out
    const mid = g.wristAt.clone().addScaledVector(forearm, 0.12);
    mid.y = -0.075;
    g.knock = this.shrine.nearest(mid, 2);
    this.handRoot.position.copy(g.from);
    this.handRoot.visible = true;
    // start already in the reaching pose (no visible settling the moment she appears)
    const pose = { i: -0.15, m: -0.12, r: -0.1, p: -0.08, t: -0.05 };
    this.hand.setCurl(pose, 6);
    Object.assign(this.hand.curl, pose);
    this.hand.spreadT = 1;
    this.hand.spread = 1;
    this.hand.wristBend = 0.3;
    this.hand.update(0);
    g.camTarget.set(grip.x + 0.015, grip.y + 0.03, grip.z);
    g.camDist = 0.5;
    return g.promise;
  }

  _knock(f, strength) {
    if (!f) return;
    const d = f.base0.clone().sub(this.handRoot.getWorldPosition(new THREE.Vector3()));
    d.y = 0;
    if (d.lengthSq() < 1e-8) d.set(-1, 0, 0);
    f.push(d.normalize(), strength);
  }

  _updateGrab(dt) {
    const g = this.grab;
    if (this._rawDt !== undefined) {
      g.t0 ??= performance.now();
      g.time = (performance.now() - g.t0) / 1000; // wall clock: never slowed by frame rate
    } else g.time += dt; // manual stepping (sandbox)
    const T = g.time;
    const u = this.u;
    if (g.noHand) {
      this.fade = clamp((T - 0.6) / 0.8, 0, 1);
      if (T > 1.5 && !g.done) {
        g.done = true;
        g.resolve();
      }
      return;
    }
    const hr = this.handRoot;
    const H = this.hand;
    // timeline (s): reach 0.2-1.9 with a hesitation at 1.0-1.3, close 1.9-2.45, pull 2.45-3.4
    if (T < 1.9) {
      // slowly out of the dark; two thirds of the way she hesitates, eases back a touch, goes on.
      // The wrist leads, the relaxed fingers trail.
      let k;
      if (T < 1.0) k = 0.66 * easeOut(clamp((T - 0.2) / 0.8, 0, 1));
      else if (T < 1.3) k = 0.66 - 0.03 * Math.sin((Math.PI * (T - 1.0)) / 0.3) ** 2;
      else k = 0.66 + 0.34 * easeInOut(clamp((T - 1.3) / 0.6, 0, 1));
      hr.position.lerpVectors(g.from, g.near, k);
      hr.position.y += Math.sin(k * Math.PI) * 0.01;
      g.wrist = 0.3 * (1 - k);
      if (T > 0.3 && !g.breathed) {
        g.breathed = true;
        this._cue('reach');
      }
      if (T > 0.9 && !g.brushed) {
        g.brushed = true;
        this._knock(g.knock[0], 0.62);
      }
      if (T > 1.4 && !g.opened) {
        g.opened = true;
        H.setCurl({ i: 0.08, m: 0.06, r: 0.1, p: 0.14, t: 0.12 }, 3.5); // relaxed, slightly open
        H.spreadT = 0.6;
      }
      for (const s of this.smoke) {
        s.stir = Math.min(1, s.stir + dt * 0.6);
        s.wind.set(-0.016 * k, 0.0, -0.008 * k);
      }
    } else if (T < 2.45) {
      // settle onto the stem; the fingers close one by one, the thumb last; the jolt snaps the ash
      const k = easeInOut(clamp((T - 1.9) / 0.24, 0, 1));
      hr.position.lerpVectors(g.near, g.wristAt, k);
      g.wrist = -0.05 * k;
      const close = [['i', 1.95, 0.84], ['m', 2.02, 0.82], ['r', 2.09, 0.8], ['p', 2.16, 0.78], ['t', 2.24, 0.62]];
      g.fing ||= {};
      for (const [f, at, c] of close) if (T > at && !g.fing[f]) {
        g.fing[f] = true;
        H.setCurl({ [f]: c }, 7);
        if (f === 'i') {
          this._cue('grab');
          H.spreadT = 0.15;
          g.shake = 0.0009;
          g.whipV += 0.04;
        }
      }
      if (T > 2.12 && !g.snapped) {
        g.snapped = true;
        this._breakAsh(new THREE.Vector3(-0.05, 0.03, 0.02));
      }
      if (T > 2.2 && !g.attached) {
        g.attached = true;
        hr.updateMatrixWorld(true);
        hr.attach(this.stickPivot);
      }
      g.shake *= Math.exp(-dt * 6);
      u.uBendBase.value.set(Math.sin(T * 61) * 0.0004 * k, 0, 0);
    } else {
      // the pull: eased in and out, the wrist leading, into the dark
      const k = easeInOut(clamp((T - 2.45) / 0.95, 0, 1));
      if (!g.pulled) {
        g.pulled = true;
        this._cue('pull');
      }
      hr.position.lerpVectors(g.wristAt, g.away, k);
      hr.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), dt * k * 0.7);
      g.wrist = -0.05 - 0.2 * Math.sin(Math.PI * k);
      // the ash holds the foot of the stick for a moment: it bows, then springs free and whips
      const hold = clamp((T - 2.45) / 0.24, 0, 1);
      const bow = T < 2.69 ? Math.sin(Math.PI * hold) : 0;
      u.uBendBase.value.set(-0.006 * bow, -0.002 * bow, 0.003 * bow);
      if (T >= 2.69 && !g.freed) {
        g.freed = true;
        g.whipV += 0.16;
      }
      if (T > 2.6 && !g.toppled) {
        g.toppled = true;
        this._knock(g.knock[1], 1.6);
      }
      g.shake = 0.0005 * k;
      g.camTarget.y += dt * 0.025 * k;
      for (const s of this.smoke) {
        s.stir = 1;
        s.wind.set(0.03 * k, 0.01 * k, 0.015 * k);
      }
      this.fade = clamp((T - 3.0) / 0.7, 0, 1);
      if (T > 3.75 && !g.done) {
        g.done = true;
        g.resolve();
      }
    }
    const rdt = this._rawDt ?? dt;
    H.wristBend += ((g.wrist ?? 0.3) - H.wristBend) * (1 - Math.exp(-rdt * 10));
    // a slight tremble all through: faint while reaching, strongest on the grip, fading in the pull
    // (its amplitude eases between the phases, so it never steps)
    const trT = T < 1.9 ? 0.00016 : T < 2.45 ? 0.00034 : 0.00034 * Math.max(0, 1 - (T - 2.45) / 0.6);
    g.tr = (g.tr ?? trT) + (trT - (g.tr ?? trT)) * (1 - Math.exp(-rdt * 8));
    const tr = g.tr;
    hr.position.x += (Math.sin(T * 61) * 0.6 + Math.sin(T * 37 + 1) * 0.4) * tr;
    hr.position.y += (Math.sin(T * 47 + 2) * 0.6 + Math.sin(T * 29) * 0.4) * tr;
    // the free end of the stick: a damped spring
    g.whipV += (-220 * g.whip - 7 * g.whipV) * dt;
    g.whip += g.whipV * dt;
    u.uWhip.value.set(g.whip, 0, g.whip * 0.4);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this._raf);
    clearTimeout(this._handTimer);
    window.removeEventListener('resize', this._resize);
    const free = (o) => {
      if (o.userData?.noDispose) return;
      if (o.geometry) o.geometry.dispose();
      if (o.material && !Array.isArray(o.material)) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
      for (const c of o.children) free(c);
    };
    free(this.scene);
    this.hand?.dispose?.();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
  }
}
