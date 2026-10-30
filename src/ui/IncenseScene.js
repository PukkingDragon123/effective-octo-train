// Loading screen 3D: one joss stick (ธูป) planted in a brass urn of old ash on Ah Kong's altar,
// burning down with the loading progress. The burning front glows and breathes; a grey ash
// column grows over it, curls, breaks and drops into the urn. A thin smoke line rises and goes
// turbulent the way real incense smoke does. Old red stubs stand in the ash, and a red altar
// candle burns behind. When the player starts, a pale hand reaches out of the dark, closes
// around the stick and pulls it away.
//
// It has its own WebGL canvas, because the engine loop isn't running while the game boots. It is
// disposed when the loading screen leaves. If WebGL fails, Loading keeps its 2D stick.
import * as THREE from 'three';
import { makeRng } from '../core/math.js';
import { HandRig } from '../creatures/hand.js';
import { creatureMaterial } from '../creatures/skin.js';

const S = { base: -0.04, stem: 0.075, top: 0.3, rCore: 0.00105, rCoat: 0.00235 };
const SAND_Y = -0.004;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeInOut = (k) => k * k * (3 - 2 * k);
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeIn = (k) => k * k * k;

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
      .replace('#include <common>', '#include <common>\nuniform float uTip; uniform float uCurl; uniform float uCurlDir;\nvarying vec3 vSt;')
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
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.82, roughness: 0.48 }));
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

/** Red altar candle with a melted cup and wax runs, and a sharp flickering flame. */
function candle(rng) {
  const s = rng() * 10;
  const H = 0.25, R = 0.016;
  const g = tubeGeometry(-0.075, -0.075 + H, 120, 40, (y, a) => {
    const t = (y + 0.075) / H;
    const drip = Math.max(0, Math.sin(a * 3 + s)) ** 6 * 0.0018 * smooth(1, 0.35, t) + Math.max(0, Math.sin(a * 5 - s)) ** 8 * 0.0012 * smooth(1, 0.6, t);
    const lip = t > 0.97 ? 1 - 0.12 * (t - 0.97) / 0.03 : 1;
    return (R + drip) * lip;
  });
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x7a1410, roughness: 0.42, metalness: 0, emissive: 0x2a0402 }));
  const flameMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; uniform float uTime;
      void main(){
        vec2 p = vUv * 2.0 - 1.0;
        float sway = sin(uTime * 3.1) * 0.06 + sin(uTime * 7.7) * 0.03;
        p.x -= sway * (p.y + 1.0) * 0.5;
        // teardrop: round at the bottom, drawn to a point at the top
        float w = mix(0.62, 0.0, smoothstep(-0.6, 1.0, p.y)) * (1.0 - smoothstep(0.55, 1.0, -p.y));
        float d = abs(p.x) / max(w, 1e-3);
        float shape = 1.0 - smoothstep(0.86, 1.0, d);
        float core = 1.0 - smoothstep(0.0, 0.7, d);
        vec3 c = mix(vec3(1.0, 0.36, 0.06), vec3(1.0, 0.86, 0.6), core * smoothstep(-0.7, 0.2, p.y));
        c = mix(vec3(0.25, 0.35, 1.0), c, smoothstep(-0.85, -0.45, p.y));
        gl_FragColor = vec4(c * shape * 1.6, 1.0);
      }`,
  });
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(0.009, 0.024), flameMat);
  flame.position.y = -0.075 + H + 0.012;
  const wick = new THREE.Mesh(tubeGeometry(-0.075 + H - 0.002, -0.075 + H + 0.005, 6, 6, () => 0.0005), new THREE.MeshStandardMaterial({ color: 0x0c0806 }));
  const grp = new THREE.Group();
  grp.add(mesh, flame, wick);
  grp.userData.flame = flame;
  grp.userData.flameMat = flameMat;
  return grp;
}

/** Lacquered altar top (dark red, worn to the wood, wax spots, spilt ash). */
function altarTop() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  const rng = makeRng(77);
  x.fillStyle = '#2a0b07';
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) {
    x.strokeStyle = `rgba(${60 + rng() * 40},${18 + rng() * 14},${10 + rng() * 8},${0.12 + rng() * 0.2})`;
    x.lineWidth = 0.6 + rng() * 2.2;
    const y = rng() * 512;
    x.beginPath();
    x.moveTo(0, y);
    for (let k = 0; k <= 8; k++) x.lineTo(k * 64, y + Math.sin(k * 0.9 + y) * 4 + (rng() - 0.5) * 3);
    x.stroke();
  }
  for (let i = 0; i < 70; i++) {
    x.fillStyle = `rgba(${150 + rng() * 60},${140 + rng() * 50},${130 + rng() * 40},${0.05 + rng() * 0.12})`;
    x.beginPath();
    x.ellipse(rng() * 512, rng() * 512, 1 + rng() * 9, 1 + rng() * 5, rng() * 3, 0, Math.PI * 2);
    x.fill();
  }
  for (let i = 0; i < 14; i++) {
    x.fillStyle = `rgba(${170 + rng() * 40},${30 + rng() * 20},${24},${0.3 + rng() * 0.3})`;
    x.beginPath();
    x.ellipse(rng() * 512, rng() * 512, 2 + rng() * 7, 2 + rng() * 6, rng() * 3, 0, Math.PI * 2);
    x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.38, metalness: 0 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, -0.0752, -0.18);
  m.receiveShadow = true;
  return m;
}

/**
 * The shrine wall behind the altar, mostly lost in the dark: red lacquer boards with faded gold
 * cloud scrolls, a sun-bleached yellow talisman sheet with red brush strokes, smoke stains.
 */
function shrineWall() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const x = c.getContext('2d');
  const rng = makeRng(4242);
  x.fillStyle = '#300c08';
  x.fillRect(0, 0, 1024, 512);
  // boards
  for (let b = 0; b < 9; b++) {
    const bx = b * 118 + rng() * 8;
    x.fillStyle = `rgba(${70 + rng() * 30},${16 + rng() * 10},${10},0.35)`;
    x.fillRect(bx, 0, 112, 512);
    x.fillStyle = 'rgba(0,0,0,0.45)';
    x.fillRect(bx + 112, 0, 4, 512);
    for (let i = 0; i < 30; i++) {
      x.strokeStyle = `rgba(20,4,2,${0.1 + rng() * 0.15})`;
      x.lineWidth = 0.5 + rng() * 1.5;
      x.beginPath();
      const gx = bx + rng() * 112;
      x.moveTo(gx, 0);
      x.bezierCurveTo(gx + (rng() - 0.5) * 10, 170, gx + (rng() - 0.5) * 10, 340, gx + (rng() - 0.5) * 8, 512);
      x.stroke();
    }
  }
  // faded gold cloud scrolls
  x.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const cx = rng() * 1024, cy = 60 + rng() * 380, r = 10 + rng() * 26;
    x.strokeStyle = `rgba(${170 + rng() * 40},${120 + rng() * 30},${50},${0.18 + rng() * 0.2})`;
    x.lineWidth = 2 + rng() * 3;
    x.beginPath();
    for (let k = 0; k < 40; k++) {
      const a = k * 0.32, rr = r * (1 - k / 46);
      const px = cx + Math.cos(a) * rr + k * 1.2, py = cy + Math.sin(a) * rr * 0.7;
      if (k === 0) x.moveTo(px, py);
      else x.lineTo(px, py);
    }
    x.stroke();
  }
  // a yellow talisman sheet with red brush strokes, pinned crooked
  x.save();
  x.translate(610, 150);
  x.rotate(0.05);
  x.fillStyle = 'rgba(186,150,62,0.85)';
  x.fillRect(-34, -90, 68, 190);
  x.strokeStyle = 'rgba(120,20,12,0.85)';
  x.lineWidth = 3;
  for (let k = 0; k < 9; k++) {
    x.beginPath();
    const y = -74 + k * 19;
    x.moveTo(-20 + rng() * 6, y);
    x.quadraticCurveTo(rng() * 20 - 10, y + 10 * (rng() - 0.5), 18 - rng() * 6, y + 4 * (rng() - 0.5));
    x.stroke();
  }
  x.restore();
  // soot rising off the altar
  const gr = x.createLinearGradient(0, 512, 0, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0.0)');
  gr.addColorStop(0.6, 'rgba(0,0,0,0.25)');
  gr.addColorStop(1, 'rgba(0,0,0,0.75)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 1024, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0 }));
  m.position.set(0.05, 0.3, -0.62);
  return m;
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
    renderer.toneMappingExposure = 0.72;
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x000000, 1);
    this.renderer = renderer;
    renderer.domElement.className = 'dlb-loading__canvas';
    host.appendChild(renderer.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.fog = new THREE.FogExp2(0x020203, 2.4);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.005, 5);
    const rng = makeRng(1331);

    // ---- light: the ember, the altar candle, a cold sliver of moon through the shutters
    this.emberLight = new THREE.PointLight(0xff6326, 0.012, 0.6, 2);
    this.emberLight.castShadow = true;
    this.emberLight.shadow.mapSize.set(512, 512);
    this.emberLight.shadow.camera.near = 0.003;
    this.emberLight.shadow.camera.far = 0.6;
    this.emberLight.shadow.bias = -0.0004;
    scene.add(this.emberLight);
    this.candleLight = new THREE.PointLight(0xff9a48, 0.22, 1.6, 2);
    scene.add(this.candleLight);
    const moon = new THREE.DirectionalLight(0x8a96a8, 0.55);
    moon.position.set(0.9, 0.5, -0.7);
    scene.add(moon);
    scene.add(new THREE.HemisphereLight(0x15171b, 0x080504, 0.25));
    const fill = new THREE.DirectionalLight(0xffb070, 0.0);
    fill.position.set(-0.8, 0.3, 0.6);
    scene.add(fill);

    // ---- set
    this.urn = urn(rng);
    this.urn.receiveShadow = true;
    scene.add(this.urn, ashBed(rng), altarTop());
    this.candle = candle(rng);
    this.candle.position.set(-0.16, 0, -0.24);
    this.candleLight.position.set(-0.16, 0.2, -0.22);
    scene.add(this.candle);
    const c2 = candle(rng);
    c2.position.set(0.24, 0, -0.42);
    c2.scale.setScalar(1.1);
    c2.visible = false;
    scene.add(c2);
    this.candle2 = c2;
    const stubMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    for (let i = 0; i < 17; i++) {
      const a = rng() * Math.PI * 2, r = 0.012 + rng() * 0.042;
      const st = new THREE.Mesh(stubGeometry(0.008 + rng() * rng() * 0.07, rng), stubMat);
      st.position.set(Math.cos(a) * r, SAND_Y, Math.sin(a) * r);
      st.rotation.set((rng() - 0.5) * 0.35, rng() * 6.28, (rng() - 0.5) * 0.35);
      scene.add(st);
    }
    // old ash curls lying on the bed
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
    scene.add(haze(-0.12, 0.9, 0.5, 1.3, 0.05), haze(-0.42, 1.6, 0.9, 7.1, 0.06));

    // ---- the stick
    this.u = {
      uTip: { value: S.top - 0.0015 }, uAsh: { value: 0.0016 }, uCurl: { value: 0.0 }, uCurlDir: { value: 0.6 },
      uTime: { value: 0 }, uStem: { value: S.stem }, uHeat: { value: 1 },
    };
    this.stickPivot = new THREE.Group();
    this.stickPivot.rotation.set(0.035, 0, -0.06);
    scene.add(this.stickPivot);
    this.stick = new THREE.Mesh(stickGeometry(), stickMaterial(this.u));
    this.stick.receiveShadow = true;
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
    for (const s of this.smoke) scene.add(s.mesh);

    // camera follows the burning front down, with a breath of hand-held drift
    this.camTarget = new THREE.Vector3(0, this.tip - 0.02, 0);
    this.camDist = 0.34;
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
      const dt = Math.min(0.05, (now - this._last) / 1000);
      this._last = now;
      this.update(dt);
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
        detail: 'ghostSkin', detailScale: 3.6, detailAmount: 0.6, bump: 1.0, color: 0xffffff, roughness: 0.58,
        skin: true, sss: 0.75, pale: 0.3, wet: 0.3, brush: 0.25, emissive: 0x000000, rim: 0.25, puddles: 0,
      });
      const hand = new HandRig({
        shape: { fingerScale: 1.12, thickness: 0.95, bony: 0.55, nails: 0.035, forearm: 2.4, color: [0.6, 0.55, 0.49] },
        material,
        twitch: 0.18,
      });
      const root = new THREE.Group();
      root.add(hand.mesh);
      root.scale.setScalar(0.088);
      root.visible = false;
      hand.mesh.traverse((o) => {
        o.castShadow = true;
        o.receiveShadow = true;
      });
      this.scene.add(root);
      this.hand = hand;
      this.handRoot = root;
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

  /** The stick's ember (top of the burning front) in world space. */
  emberWorld(out) {
    return this.stick.localToWorld(out.set(0, this.tip + 0.0004, 0));
  }

  /** Where the smoke leaves the stick: the top of the (curled) ash column. */
  smokeSource(out) {
    const a = this.ashLen, c = this.u.uCurl.value * a * a * 34, d = this.u.uCurlDir.value;
    return this.stick.localToWorld(out.set(c * Math.cos(d), this.tip + a - 0.0006, c * Math.sin(d)));
  }

  update(dt) {
    this.t += dt;
    const t = this.t, u = this.u;
    u.uTime.value = t;

    // burn: the front creeps toward the progress target, never jumps
    if (!this.grab) {
      const target = S.top - 0.0015 - this.progress * (S.top - S.stem) * 0.7;
      const speed = 0.006 + Math.max(0, this.tip - target) * 0.8;
      const prev = this.tip;
      this.tip = Math.max(target, this.tip - speed * dt);
      this.tip -= dt * 0.00012; // it is always burning, a little
      this.ashLen += (prev - this.tip) * 0.9;
      if (this.ashLen > this.ashMax) this._breakAsh();
    }
    u.uTip.value = this.tip;
    u.uAsh.value = this.ashLen;
    u.uCurl.value = 0.45 + 0.25 * Math.sin(this.ashMax * 900);
    const breath = 0.86 + 0.14 * Math.sin(t * 1.3) * Math.sin(t * 0.71 + 1.0) + 0.05 * Math.sin(t * 9.0);
    const heat = breath * (this.grab ? this.grab.heat : 1);
    u.uHeat.value = heat;

    this.scene.updateMatrixWorld(true);
    const ember = this.emberWorld(this._ember);
    const smokeAt = this.smokeSource(this._smokeAt);
    this.emberLight.position.copy(ember).add(this._v.set(0.0012, 0.004, 0.003));
    this.emberLight.intensity = 0.012 * heat * (this.fade > 0 ? 1 - this.fade : 1);
    this.halo.position.copy(ember);
    this.halo.material.opacity = 0.55 + 0.35 * heat;
    const fl = 0.85 + 0.1 * Math.sin(t * 13.1) + 0.05 * Math.sin(t * 29.3);
    this.candleLight.intensity = 0.05 * fl;
    this.candle.userData.flameMat.uniforms.uTime.value = t;
    this.candle2.userData.flameMat.uniforms.uTime.value = t + 3.3;
    for (const c of [this.candle, this.candle2]) c.userData.flame.quaternion.copy(this.camera.quaternion);
    this.scene.traverse((o) => {
      if (o.material?.uniforms?.uSeed) o.material.uniforms.uTime.value = t;
    });

    this._updateFalling(dt);
    this._updateSparks(dt, ember);
    if (this.grab) this._updateGrab(dt);
    if (this.hand) this.hand.update(dt);

    for (const s of this.smoke) s.update(dt, t, smokeAt, this.camera.position, true);

    // camera
    const want = this.grab ? this.grab.camTarget : this._v.set(-0.03 * clamp((this.camera.aspect - 0.8) / 1.0, 0, 1), Math.max(0.07, this.tip - 0.025), 0);
    this.camTarget.lerp(want, 1 - Math.exp(-dt * 1.6));
    const dist = this.grab ? this.grab.camDist : this.camDist + (this.camera.aspect < 1 ? 0.12 : 0);
    this.camDist += (dist - this.camDist) * (1 - Math.exp(-dt * 1.4));
    const sx = Math.sin(t * 0.31) * 0.004 + Math.sin(t * 0.83) * 0.0015, sy = Math.sin(t * 0.27 + 1) * 0.003;
    const shake = this.grab?.shake || 0;
    this.camera.position.set(
      this.camTarget.x + 0.05 + sx + (Math.random() - 0.5) * shake,
      this.camTarget.y + 0.015 + sy + (Math.random() - 0.5) * shake,
      this.camTarget.z + this.camDist,
    );
    this.camera.lookAt(this.camTarget.x + sx * 0.3, this.camTarget.y, this.camTarget.z);
    this.renderer.domElement.style.opacity = String(1 - this.fade);
    this.renderer.render(this.scene, this.camera);
  }

  _breakAsh() {
    // the curled column drops off into the urn
    const len = Math.min(this.ashLen - 0.0012, 0.016);
    const geo = this.ashGeos.reduce((b, g, i) => (Math.abs([0.006, 0.009, 0.012, 0.015][i] - len) < Math.abs([0.006, 0.009, 0.012, 0.015][b] - len) ? i : b), 0);
    const m = new THREE.Mesh(this.ashGeos[geo], this.ashMat);
    const p = this.stick.localToWorld(new THREE.Vector3(0, this.tip + len / 2 + 0.001, 0));
    m.position.copy(p);
    m.quaternion.copy(this.stick.getWorldQuaternion(new THREE.Quaternion()));
    m.castShadow = true;
    this.scene.add(m);
    this.falling.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.02), w: new THREE.Vector3(Math.random() * 6 - 3, 0, Math.random() * 8 - 4), done: false });
    if (this.falling.length > 10) {
      const old = this.falling.shift();
      old.m.removeFromParent();
    }
    this.ashLen = 0.0014;
    this.ashMax = 0.007 + Math.random() * 0.009;
    this.u.uCurlDir.value = Math.random() * Math.PI * 2;
  }

  _updateFalling(dt) {
    for (const f of this.falling) {
      if (f.done) continue;
      f.v.y -= 9.8 * dt * 0.6;
      f.m.position.addScaledVector(f.v, dt);
      f.m.rotation.x += f.w.x * dt;
      f.m.rotation.z += f.w.z * dt;
      if (f.m.position.y < SAND_Y + 0.0035 && Math.hypot(f.m.position.x, f.m.position.z) < 0.055) {
        f.m.position.y = SAND_Y + 0.0018;
        f.m.rotation.set(Math.PI / 2, 0, Math.random() * 6.28, 'ZXY');
        f.done = true;
      }
      if (f.m.position.y < -0.1) f.done = true;
    }
  }

  _updateSparks(dt, ember) {
    const pop = this.grab ? this.grab.sparks : 0.25;
    if (Math.random() < pop * dt) {
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
    for (const s of this.sparks) pos.set([s.p.x, s.p.y, s.p.z], n++ * 3);
    this.sparkPts.geometry.setDrawRange(0, n);
    this.sparkPts.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * The start sequence: a pale hand comes out of the dark, closes around the red stem and
   * pulls the stick out of the urn. Resolves when the screen has gone dark.
   */
  playGrab(cue = () => {}) {
    if (this.grab) return this.grab.promise;
    this._cue = cue;
    this._buildHand();
    clearTimeout(this._handTimer);
    const g = { time: 0, heat: 1, sparks: 0.25, shake: 0, camTarget: this.camTarget.clone(), camDist: this.camDist, attached: false };
    g.promise = new Promise((r) => (g.resolve = r));
    this.grab = g;
    if (!this.hand) {
      // no hand (sculpt failed): just snuff the ember and fade
      g.noHand = true;
      return g.promise;
    }
    // where the fist closes: the red stem just under the paste
    this.scene.updateMatrixWorld(true);
    const grip = this.stick.localToWorld(new THREE.Vector3(0, S.stem - 0.016, 0));
    // hand basis: fingers point -X (toward the stick), palm faces away from camera, thumb down,
    // then yawed so the forearm comes in from the right and a little toward the viewer
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
    this.handRoot.position.copy(g.from);
    this.handRoot.visible = true;
    this.hand.setCurl({ i: -0.15, m: -0.12, r: -0.1, p: -0.08, t: -0.05 }, 6);
    this.hand.spreadT = 1;
    g.camTarget.set(grip.x + 0.005, (grip.y + this.tip) / 2 - 0.004, 0);
    g.camDist = 0.47;
    return g.promise;
  }

  _updateGrab(dt) {
    const g = this.grab;
    g.time += dt;
    const T = g.time;
    if (g.noHand) {
      g.heat = Math.max(0, 1 - T / 0.8);
      this.fade = clamp((T - 0.5) / 0.8, 0, 1);
      if (T > 1.4 && !g.done) {
        g.done = true;
        g.resolve();
      }
      return;
    }
    const hr = this.handRoot;
    // 0.0–0.3  the ember brightens, as if someone breathed on it
    g.heat = 1 + 0.6 * smooth(0.0, 0.35, T) - 0.3 * smooth(0.6, 1.2, T);
    // 0.25–1.45 reach in out of the dark (decelerating), fingers opening
    if (T < 1.45) {
      const k = easeOut(clamp((T - 0.25) / 1.2, 0, 1));
      hr.position.lerpVectors(g.from, g.near, k);
      hr.position.y += Math.sin(k * Math.PI) * 0.012;
      if (T > 0.3 && !g.breathed) {
        g.breathed = true;
        this._cue('reach');
      }
      if (T > 1.05 && !g.opened) {
        g.opened = true;
        this.hand.setCurl({ i: 0.12, m: 0.1, r: 0.12, p: 0.16, t: 0.15 }, 7);
      }
      // the hand pushes air: the smoke leans away from it
      for (const s of this.smoke) {
        s.stir = Math.min(1, s.stir + dt * 0.8);
        s.wind.set(-0.02 * k, 0.0, -0.01 * k);
      }
    } else if (T < 2.1) {
      // close: settle onto the stem and clench, fingers first, thumb last
      const k = easeInOut(clamp((T - 1.45) / 0.22, 0, 1));
      hr.position.lerpVectors(g.near, g.wristAt, k);
      if (!g.closed) {
        g.closed = true;
        this._cue('grab');
        this.hand.setCurl({ i: 0.8, m: 0.78, r: 0.76, p: 0.74, t: 0.5 }, 11);
        this.hand.spreadT = 0.15;
        g.sparks = 18;
        g.shake = 0.0012;
      }
      if (T > 1.62 && !g.attached) {
        g.attached = true;
        hr.updateMatrixWorld(true);
        hr.attach(this.stickPivot);
        this.hand.setCurl({ i: 0.86, m: 0.84, r: 0.82, p: 0.8, t: 0.62 }, 6);
      }
      g.shake *= Math.exp(-dt * 6);
      g.sparks = Math.max(0.5, g.sparks * Math.exp(-dt * 5));
      // a tremble before the pull
      hr.position.x += Math.sin(T * 61) * 0.00035;
      hr.position.y += Math.sin(T * 47) * 0.00025;
    } else {
      // pull it out of the ash and away, into the dark
      const k = easeIn(clamp((T - 2.1) / 0.85, 0, 1));
      if (!g.pulled) {
        g.pulled = true;
        this._cue('pull');
      }
      hr.position.lerpVectors(g.wristAt, g.away, k);
      hr.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), dt * k * 0.9);
      g.shake = 0.0006 * k;
      g.camTarget.y += dt * 0.03 * k;
      for (const s of this.smoke) {
        s.stir = 1;
        s.wind.set(0.03 * k, 0.01 * k, 0.015 * k);
      }
      g.heat = 0.9 + 0.8 * k;
      this.fade = clamp((T - 2.55) / 0.75, 0, 1);
      if (T > 3.35 && !g.done) {
        g.done = true;
        g.resolve();
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this._raf);
    clearTimeout(this._handTimer);
    window.removeEventListener('resize', this._resize);
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    this.hand?.dispose?.();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
  }
}
