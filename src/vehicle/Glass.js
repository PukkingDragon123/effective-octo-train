// Taxi glass: windshield, rear window, four door windows (which roll down) and two
// quarter lights, all on LAYERS.GLASS with a custom shader that samples the opaque scene
// (postfx.glassUniforms.tSceneColor / tSceneBlur) for screen-space refraction.
//
// Per pane a small CPU mask texture holds:
//   R = rain coverage (wiper-cleared on the windshield, re-accumulates)
//   G = condensation (relaxes toward a target set by setFog; hand-wiped; breath adds)
//   B = smear left by wiping (streaky blur, decays slowly)
// plus an optional marks canvas (handprints, face press, scratches, finger writing).
// Raindrops (static beads + running drops with trails) are procedural in the shader.
// Interior reflections: one pane at a time (the gazed one) gets a portal-camera render.
import * as THREE from 'three';
import { postfx, GLOBAL_UNIFORMS } from '../render/index.js';
import { LAYERS } from '../core/layers.js';
import { settings } from '../core/Settings.js';
import { clamp, lerp } from '../core/math.js';
import { glassDirtTex, makeCanvas, toTexture } from './VehicleTextures.js';
import { setupPortalCamera } from './Mirrors.js';
import { FONTS } from '../ui/fonts.js';

const GLASS_VERT = /* glsl */ `
varying vec2 vUv;
varying vec2 vM;
varying vec3 vWP;
varying vec3 vN;
void main() {
  vUv = uv;
  vM = uv1;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const GLASS_FRAG = /* glsl */ `
uniform sampler2D tSceneColor;
uniform sampler2D tSceneBlur;
uniform sampler2D tMask;
uniform sampler2D tMarks;
uniform sampler2D tDirt;
uniform sampler2D tReflect;
uniform vec2 uResolution;
uniform float uHasScene;
uniform float uRain;
uniform float uTime;
uniform vec2 uFlow;
uniform float uFlowSpeed;
uniform float uDirt;
uniform float uReflect;
uniform mat4 uReflectMatrix;
uniform vec3 uCabin;
uniform vec3 uTint;
uniform float uSeed;
uniform vec3 uFogCol;
uniform float uFogDen;
varying vec2 vUv;
varying vec2 vM;
varying vec3 vWP;
varying vec3 vN;

float h21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec2 h22(vec2 p) { float n = h21(p); return vec2(n, h21(p + n + 17.17)); }

// static beads: returns (offset.xy, coverage, dome)
vec4 beads(vec2 uv, float scale, float density, float seed, float t) {
  vec2 g = uv * scale;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float n = h21(id + seed);
  // slow life cycle: beads land, sit, evaporate/merge
  float life = fract(t * (0.012 + 0.02 * h21(id + seed * 2.3)) + n * 7.0);
  float alive = step(n, density) * smoothstep(0.0, 0.04, life) * (1.0 - smoothstep(0.8, 1.0, life));
  if (alive <= 0.0) return vec4(0.0);
  vec2 c = (h22(id + seed * 1.7) - 0.5) * 0.55;
  float r = mix(0.12, 0.36, h21(id + seed * 3.1)) * (0.6 + 0.4 * alive);
  vec2 d = f - c;
  d.y *= 0.92;
  float dist = length(d);
  float m = 1.0 - smoothstep(r * 0.78, r, dist);
  float dome = sqrt(max(0.0, 1.0 - (dist / r) * (dist / r)));
  return vec4(-d / r * dome, m * alive, dome);
}

// running drops in flow space (travel toward -y), with wet trails and trail beads
vec4 runners(vec2 uv, float t, float amount, float seed) {
  float colW = 0.05;
  float cx = floor(uv.x / colW);
  float rnd = h21(vec2(cx, seed));
  if (rnd > amount) return vec4(0.0);
  float spd = mix(0.05, 0.19, h21(vec2(cx, seed + 1.3)));
  float L = mix(0.2, 0.42, h21(vec2(cx, seed + 2.7)));
  float travel = t * spd + 0.035 * sin(t * (0.9 + rnd * 1.7) + rnd * 20.0);
  float y = uv.y + travel;
  float cell = floor(y / L);
  float ly = fract(y / L) * L;
  float cr = h21(vec2(cx, cell + seed * 5.0));
  if (cr > 0.75) return vec4(0.0);
  float meander = sin(uv.y * 22.0 + cr * 10.0) * 0.004 + sin(uv.y * 57.0 + cx) * 0.0015;
  float lx = uv.x - (cx + 0.5) * colW - (cr - 0.5) * colW * 0.45 - meander;
  float r = mix(0.0045, 0.008, cr);
  float headY = L * 0.22;
  vec2 d = vec2(lx, (ly - headY) * 0.78);
  float dist = length(d);
  float m = 1.0 - smoothstep(r * 0.78, r, dist);
  float dome = sqrt(max(0.0, 1.0 - (dist / r) * (dist / r)));
  vec2 off = -d / r * dome * m;
  float above = ly - headY;
  float tl = L * 0.7;
  float trail = step(0.0, above) * (1.0 - smoothstep(0.0, tl, above));
  float tw = r * 0.5 * (1.0 - above / tl);
  float streak = (1.0 - smoothstep(tw * 0.4, tw, abs(lx))) * trail;
  float bid = floor(above / 0.011);
  float by = fract(above / 0.011) - 0.5;
  float bsz = 0.28 * h21(vec2(cx * 3.1 + bid, cell));
  float bead = (1.0 - smoothstep(bsz * 0.6, bsz, length(vec2(lx / max(tw * 2.0, 1e-4), by)))) * trail * step(0.55, h21(vec2(cx, bid + cell * 31.0)));
  float cov = max(m, max(streak * 0.45, bead * 0.8));
  off += vec2(-lx / max(tw, 1e-4) * 0.25, 0.0) * streak;
  return vec4(off, cov, max(dome * m, bead * 0.6));
}

void main() {
  vec4 mask = texture2D(tMask, vM);
  float rainCov = clamp(uRain * mask.r, 0.0, 1.0);
  // flow-aligned frame: drops travel along uFlow
  vec2 fdir = normalize(uFlow + vec2(0.0, -1e-4));
  vec2 ax = vec2(-fdir.y, fdir.x);
  vec2 fuv = vec2(dot(vUv, ax), dot(vUv, -fdir));
  vec4 b1 = beads(vUv + uSeed * 0.13, 60.0, rainCov * 0.6, uSeed, uTime);
  vec4 b2 = beads(vUv * 1.07 + 0.37, 150.0, rainCov * 0.75, uSeed + 11.0, uTime * 1.3);
  vec4 rd = runners(fuv, uTime * uFlowSpeed, rainCov * 0.85, uSeed + 3.0);
  float dropM = max(max(b1.z, b2.z * 0.85), rd.z);
  float dome = max(max(b1.w * b1.z, b2.w * b2.z), rd.w);
  vec2 off = b1.xy * b1.z + b2.xy * b2.z * 0.5 + rd.xy;

  float marks = texture2D(tMarks, vM).r;
  float fog = mask.g;
  // prints show as clearer marks in the condensation
  fog = clamp(fog * (1.0 - marks * 0.85), 0.0, 1.0);
  float fogN = h21(floor(vUv * 700.0));
  float fogTex = 0.82 + 0.36 * fogN;
  fog *= fogTex;
  // drops sitting in condensation clear little holes
  fog *= 1.0 - dropM * 0.6;
  float smear = mask.b;

  vec3 V = normalize(cameraPosition - vWP);
  vec3 N = normalize(vN);
  float ndv = dot(N, V);
  if (ndv < 0.0) { N = -N; ndv = -ndv; }
  float fres = 0.04 + 0.96 * pow(1.0 - clamp(ndv, 0.0, 1.0), 5.0);
  float dirt = texture2D(tDirt, vUv * 0.55).r * uDirt;
  float smearStreak = smear * (0.6 + 0.4 * sin(vUv.x * 160.0 + vUv.y * 40.0));

  vec3 col;
  float alpha = 1.0;
  if (uHasScene > 0.5) {
    vec2 suv = gl_FragCoord.xy / uResolution;
    vec2 ruv = clamp(suv + off * 0.03, vec2(0.001), vec2(0.999));
    vec3 sharp = texture2D(tSceneColor, ruv).rgb;
    vec3 blur = texture2D(tSceneBlur, ruv).rgb;
    float blurK = max(smoothstep(0.04, 0.45, fog), smearStreak * 0.55) + dropM * 0.2 + dirt * 0.15;
    col = mix(sharp, blur, clamp(blurK, 0.0, 1.0));
    // drop rims refract the dark surroundings; centres gather light
    col *= 1.0 - 0.32 * dropM * (1.0 - dome);
    col += blur * dropM * dome * 0.25;
    // condensation: a milky veil that scatters (blurs and dims) what is behind it, lit from
    // inside by the cabin; bright lights outside still bloom through as soft halos
    float bl = dot(blur, vec3(0.299, 0.587, 0.114));
    vec3 milk = blur * (0.42 + 0.4 * smoothstep(0.25, 1.2, bl)) + uCabin * 0.45 + vec3(0.006, 0.007, 0.008);
    col = mix(col, milk, fog * 0.85);
    // dirt glare (light sources bloom through the grime)
    col = col * (1.0 - dirt * 0.22) + blur * dirt * 0.6;
    col *= uTint;
  } else {
    // fallback (no scene copy available): transparent overlay
    vec3 milk = uCabin * 0.3 + vec3(0.03, 0.035, 0.04);
    col = milk;
    alpha = clamp(fog * 0.7 + dropM * (0.25 + 0.35 * (1.0 - dome)) + dirt * 0.25 + fres * 0.18 + 0.05 + smearStreak * 0.1, 0.0, 1.0);
    col += vec3(0.25) * dropM * dome * dome;
  }
  // interior reflection (gaze-gated portal render)
  if (uReflect > 0.001) {
    vec4 rp = uReflectMatrix * vec4(vWP, 1.0);
    vec2 rr = rp.xy / rp.w;
    if (rr.x > 0.0 && rr.x < 1.0 && rr.y > 0.0 && rr.y < 1.0) {
      vec3 refl = texture2D(tReflect, rr + off * 0.008).rgb;
      float k = (fres * 1.5 + 0.035) * uReflect * (1.0 - fog * 0.75);
      col += refl * k;
      alpha = max(alpha, clamp(k * 3.0, 0.0, 1.0));
    }
  }
  // a little fog on the glass itself when seen from far away (exterior shots)
  float dcam = length(cameraPosition - vWP);
  float tf = exp(-uFogDen * max(dcam - 2.0, 0.0));
  col = mix(uFogCol, col, tf);
  gl_FragColor = vec4(col, alpha);
}
`;

const BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
BLACK.needsUpdate = true;

/** Fit an affine map local position -> (uv1) for a pane geometry (near-planar). */
function fitPlane(geo) {
  const p = geo.attributes.position, uv = geo.attributes.uv1;
  const n = p.count;
  const c = new THREE.Vector3();
  for (let i = 0; i < n; i++) c.add(new THREE.Vector3().fromBufferAttribute(p, i));
  c.multiplyScalar(1 / n);
  // normal: average of normals
  const nrm = new THREE.Vector3();
  const na = geo.attributes.normal;
  for (let i = 0; i < n; i++) nrm.add(new THREE.Vector3().fromBufferAttribute(na, i));
  nrm.normalize();
  // basis
  const up = Math.abs(nrm.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const e1 = new THREE.Vector3().crossVectors(up, nrm).normalize();
  const e2 = new THREE.Vector3().crossVectors(nrm, e1).normalize();
  // least squares uv = a + b*s + c*t
  let S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const ru = [0, 0, 0], rv = [0, 0, 0];
  let smin = Infinity, smax = -Infinity, tmin = Infinity, tmax = -Infinity;
  const q = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    q.fromBufferAttribute(p, i).sub(c);
    const s = q.dot(e1), t = q.dot(e2);
    smin = Math.min(smin, s);
    smax = Math.max(smax, s);
    tmin = Math.min(tmin, t);
    tmax = Math.max(tmax, t);
    const row = [1, s, t];
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) S[a][b] += row[a] * row[b];
      ru[a] += row[a] * uv.getX(i);
      rv[a] += row[a] * uv.getY(i);
    }
  }
  const M = new THREE.Matrix3().set(S[0][0], S[0][1], S[0][2], S[1][0], S[1][1], S[1][2], S[2][0], S[2][1], S[2][2]).invert();
  const solve = (r) => new THREE.Vector3(...r).applyMatrix3(M);
  return { c, nrm, e1, e2, cu: solve(ru), cv: solve(rv), size: [smax - smin, tmax - tmin], mid: [(smin + smax) / 2, (tmin + tmax) / 2] };
}

class Pane {
  constructor(id, spec, system) {
    this.id = id;
    this.system = system;
    this.parent = spec.parent;
    this.slide = spec.slide || null;
    this.travel = spec.travel || 0;
    this.open = 0;
    const isWS = id === 'windshield';
    const W = isWS ? 160 : 72, H = isWS ? 96 : 56;
    this.mw = W;
    this.mh = H;
    this.data = new Uint8Array(W * H * 4);
    this.fogF = new Float32Array(W * H);
    this.rainF = new Float32Array(W * H).fill(1);
    this.smearF = new Float32Array(W * H);
    this.fogTarget = 0;
    this.edge = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = x / (W - 1), v = y / (H - 1);
        const e = Math.min(u, 1 - u, v, 1 - v);
        this.edge[y * W + x] = clamp(1 - e * 4.5, 0, 1); // 1 at the edges
      }
    }
    this.tex = new THREE.DataTexture(this.data, W, H, THREE.RGBAFormat);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;
    this.dirty = true;
    this.marks = null; // {canvas, g, tex}
    const pu = postfx.glassUniforms;
    this.uniforms = {
      tSceneColor: pu.tSceneColor,
      tSceneBlur: pu.tSceneBlur,
      uResolution: pu.uResolution,
      tMask: { value: this.tex },
      tMarks: { value: BLACK },
      tDirt: system.uniforms.tDirt,
      tReflect: system.uniforms.tReflect,
      uHasScene: system.uniforms.uHasScene,
      uRain: GLOBAL_UNIFORMS.uRain,
      uTime: GLOBAL_UNIFORMS.uTime,
      uFlow: { value: new THREE.Vector2(0, -1) },
      uFlowSpeed: { value: 1 },
      uDirt: { value: isWS ? 0.55 : 0.75 },
      uReflect: { value: 0 },
      uReflectMatrix: { value: new THREE.Matrix4() },
      uCabin: system.uniforms.uCabin,
      uTint: { value: new THREE.Color(0.9, 0.96, 0.93) },
      uSeed: { value: (id.charCodeAt(0) * 7 + id.length * 13) % 97 },
      uFogCol: GLOBAL_UNIFORMS.uFogColor,
      uFogDen: GLOBAL_UNIFORMS.uFogDensity,
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: GLASS_VERT,
      fragmentShader: GLASS_FRAG,
      defines: { USE_UV1: '' },
      side: THREE.DoubleSide,
      transparent: false,
      depthWrite: true,
      name: 'taxi_glass_' + id,
    });
    this.mesh = new THREE.Mesh(spec.geometry, this.material);
    this.mesh.name = 'glass_' + id;
    this.mesh.layers.set(LAYERS.GLASS);
    this.mesh.userData.glassId = id;
    this.mesh.renderOrder = 5;
    this.parent.add(this.mesh);
    this.fit = fitPlane(spec.geometry);
    this.uvRange = spec.geometry.userData.uvRange || null;
    this.wipeTimer = 0;
  }
  setOpen(a) {
    this.open = clamp(a, 0, 1);
    if (this.slide) this.mesh.position.copy(this.slide).multiplyScalar(this.travel * this.open);
  }
  /** world point -> mask uv (affine fit in pane-local space), plus distance from the plane. */
  uvAt(world, out = new THREE.Vector2()) {
    const l = this.mesh.worldToLocal(world.clone());
    const q = l.sub(this.fit.c);
    const s = q.dot(this.fit.e1), t = q.dot(this.fit.e2);
    out.set(this.fit.cu.x + this.fit.cu.y * s + this.fit.cu.z * t, this.fit.cv.x + this.fit.cv.y * s + this.fit.cv.z * t);
    out.dist = Math.abs(q.dot(this.fit.nrm));
    return out;
  }
  /** World-space rectangle (centre, normal, up, size) for reflection / gaze. */
  rect(C, N, U, R) {
    this.mesh.updateWorldMatrix(true, false);
    const mw = this.mesh.matrixWorld;
    C.copy(this.fit.c).addScaledVector(this.fit.e1, this.fit.mid[0]).addScaledVector(this.fit.e2, this.fit.mid[1]).applyMatrix4(mw);
    N.copy(this.fit.nrm).transformDirection(mw);
    U.copy(this.fit.e2).transformDirection(mw);
    if (R) R.copy(this.fit.e1).transformDirection(mw);
    return this.fit.size;
  }
  stamp(u, v, radius, fn) {
    const W = this.mw, H = this.mh;
    const cx = u * (W - 1), cy = v * (H - 1);
    const ru = radius * (W - 1), rv = radius * (H - 1) * (this.aspect || 1);
    const x0 = Math.max(0, Math.floor(cx - ru)), x1 = Math.min(W - 1, Math.ceil(cx + ru));
    const y0 = Math.max(0, Math.floor(cy - rv)), y1 = Math.min(H - 1, Math.ceil(cy + rv));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / Math.max(ru, 1e-3), dy = (y - cy) / Math.max(rv, 1e-3);
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        fn(y * W + x, 1 - d2);
      }
    }
    this.dirty = true;
  }
  ensureMarks() {
    if (this.marks) return this.marks;
    const c = makeCanvas(256, this.id === 'windshield' ? 160 : 192);
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    const tex = toTexture(c, { srgb: false });
    tex.flipY = true;
    this.marks = { canvas: c, g, tex };
    this.uniforms.tMarks.value = tex;
    return this.marks;
  }
  update(dt, fogRate) {
    // relax condensation toward its target (edges fog first), decay smear
    const W = this.mw, H = this.mh;
    const tgt = this.fogTarget;
    const fog = this.fogF, sm = this.smearF;
    let changed = this.dirty;
    if (tgt > 0.001 || this._fogAny) {
      let any = false;
      for (let i = 0; i < W * H; i++) {
        const t = clamp(tgt * (0.75 + 0.5 * this.edge[i]) - (1 - tgt) * 0.15 * (1 - this.edge[i]), 0, 1);
        const f = fog[i];
        if (f > t) fog[i] = Math.max(t, f - dt * 0.22);
        else fog[i] = Math.min(t, f + dt * fogRate * (0.4 + this.edge[i]));
        if (fog[i] > 0.002) any = true;
      }
      this._fogAny = any;
      changed = true;
    }
    if (this._smearAny) {
      let any = false;
      for (let i = 0; i < W * H; i++) {
        if (sm[i] > 0) {
          sm[i] = Math.max(0, sm[i] - dt * 0.03);
          any = true;
        }
      }
      this._smearAny = any;
      changed = true;
    }
    if (changed) this.upload();
  }
  upload() {
    const W = this.mw, H = this.mh, d = this.data;
    for (let i = 0; i < W * H; i++) {
      d[i * 4] = this.rainF[i] * 255;
      d[i * 4 + 1] = this.fogF[i] * 255;
      d[i * 4 + 2] = this.smearF[i] * 255;
      d[i * 4 + 3] = 255;
    }
    this.tex.needsUpdate = true;
    this.dirty = false;
  }
}

export class GlassSystem {
  constructor(taxi, panes) {
    this.taxi = taxi;
    this.uniforms = {
      tDirt: { value: glassDirtTex() },
      tReflect: { value: BLACK },
      uHasScene: { value: 0 },
      uCabin: { value: new THREE.Color(0, 0, 0) },
    };
    this.panes = {};
    for (const [id, spec] of Object.entries(panes)) this.panes[id] = new Pane(id, spec, this);
    this.ids = Object.keys(this.panes);
    this.fogRate = 0.05;
    this.wipers = []; // [{pivotUV:[u,v], r0, r1, prev, angle}]
    this._layerMode = null;
    this.reflectCam = new THREE.PerspectiveCamera();
    this.reflectCam.layers.set(LAYERS.DEFAULT);
    this.reflectCam.layers.enable(LAYERS.REFLECTION_ONLY);
    this.reflectCam.layers.enable(LAYERS.PLAYER_HEAD);
    this.reflectRT = null;
    this.reflectPane = null;
    this._C = new THREE.Vector3();
    this._N = new THREE.Vector3();
    this._U = new THREE.Vector3();
    this._t = 0;
    // windshield aspect for round stamps (mask uv is normalised: width ~1.5 m, height ~0.8 m)
    const ws = this.panes.windshield;
    if (ws && ws.uvRange) ws.aspect = (ws.uvRange[1] - ws.uvRange[0]) / (ws.uvRange[3] - ws.uvRange[2]);
    for (const id of this.ids) {
      const p = this.panes[id];
      if (!p.aspect) p.aspect = p.fit.size[0] / Math.max(0.05, p.fit.size[1]);
    }
  }
  get(id) {
    return this.panes[id];
  }
  meshes() {
    return this.ids.map((id) => this.panes[id].mesh);
  }
  /** Condensation target 0..1 for a pane id or 'all'. */
  setFog(id, amount) {
    const list = id === 'all' ? this.ids : [id];
    for (const k of list) if (this.panes[k]) {
      this.panes[k].fogTarget = clamp(amount, 0, 1);
      this.panes[k]._fogAny = true;
    }
  }
  /** Instantly set the condensation level everywhere on a pane (no relaxation). */
  fillFog(id, amount) {
    const list = id === 'all' ? this.ids : [id];
    for (const k of list) {
      const p = this.panes[k];
      if (!p) continue;
      for (let i = 0; i < p.fogF.length; i++) p.fogF[i] = clamp(amount * (0.75 + 0.5 * p.edge[i]), 0, 1);
      p._fogAny = true;
      p.dirty = true;
    }
  }
  /** Find the pane nearest to a world point (within tolerance). */
  paneAt(world, tol = 0.08) {
    let best = null, bd = tol;
    const uv = new THREE.Vector2();
    for (const id of this.ids) {
      const p = this.panes[id];
      p.uvAt(world, uv);
      if (uv.x < -0.05 || uv.x > 1.05 || uv.y < -0.05 || uv.y > 1.05) continue;
      if (uv.dist < bd) {
        bd = uv.dist;
        best = { pane: p, u: uv.x, v: uv.y };
      }
    }
    return best;
  }
  /** Wipe condensation at a world point (hand). radius metres. Returns pane id or null. */
  wipeAt(world, radius = 0.07, strength = 1) {
    const hit = this.paneAt(world);
    if (!hit) return null;
    const p = hit.pane;
    const r = radius / Math.max(0.2, p.fit.size[0]);
    p.stamp(hit.u, hit.v, r, (i, w) => {
      const k = Math.min(1, w * 2.2) * strength;
      p.fogF[i] = Math.max(0, p.fogF[i] - k);
      p.smearF[i] = Math.max(p.smearF[i], 0.55 * k);
    });
    p._smearAny = true;
    return p.id;
  }
  /** A breath fog spot (fades quickly). */
  breathAt(id, world, strength = 0.8, radius = 0.12) {
    const p = id ? this.panes[id] : this.paneAt(world, 0.3)?.pane;
    if (!p) return;
    const uv = p.uvAt(world);
    const r = radius / Math.max(0.2, p.fit.size[0]);
    p.stamp(clamp(uv.x, 0, 1), clamp(uv.y, 0, 1), r, (i, w) => {
      p.fogF[i] = Math.min(1, p.fogF[i] + w * strength);
    });
    p._fogAny = true;
  }
  /** Horror marks: kind 'handprint'|'face'|'scratch'|'text'|'clear'. uv in mask space (0..1). opts {size, angle, text, intensity} */
  addMark(id, kind, uv, opts = {}) {
    const p = this.panes[id];
    if (!p) return;
    const mk = p.ensureMarks();
    const g = mk.g, W = mk.canvas.width, H = mk.canvas.height;
    const x = (uv.x ?? uv[0]) * W, y = (1 - (uv.y ?? uv[1])) * H;
    const s = (opts.size ?? 1) * W * 0.12 * (p.id === 'windshield' ? 0.6 : 1);
    const a = opts.intensity ?? 0.9;
    g.save();
    g.translate(x, y);
    g.rotate(opts.angle ?? 0);
    g.fillStyle = `rgba(255,255,255,${a})`;
    g.strokeStyle = `rgba(255,255,255,${a})`;
    if (kind === 'clear') {
      g.restore();
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
    } else if (kind === 'handprint') {
      // palm + five fingers
      g.beginPath();
      g.ellipse(0, s * 0.25, s * 0.38, s * 0.45, 0, 0, Math.PI * 2);
      g.fill();
      const fingers = [[-0.34, -0.35, 0.09, 0.42, -0.35], [-0.16, -0.58, 0.085, 0.5, -0.1], [0.04, -0.64, 0.085, 0.52, 0.02], [0.22, -0.56, 0.08, 0.46, 0.12], [0.45, 0.02, 0.085, 0.36, 0.9]];
      for (const [fx, fy, fw, fl, fa] of fingers) {
        g.save();
        g.translate(fx * s, fy * s);
        g.rotate(fa);
        g.beginPath();
        g.ellipse(0, -fl * s * 0.45, fw * s, fl * s * 0.55, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      // drag smear downward
      if (opts.drag) {
        const grd = g.createLinearGradient(0, 0, 0, s * 1.6);
        grd.addColorStop(0, `rgba(255,255,255,${a * 0.6})`);
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(-s * 0.4, 0, s * 0.8, s * 1.6);
      }
      g.restore();
    } else if (kind === 'face') {
      g.beginPath();
      g.ellipse(0, 0, s * 0.42, s * 0.6, 0, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = `rgba(0,0,0,${a * 0.7})`;
      for (const ex of [-0.16, 0.16]) {
        g.beginPath();
        g.ellipse(ex * s, -0.12 * s, s * 0.09, s * 0.06, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.beginPath();
      g.ellipse(0, 0.28 * s, s * 0.12, s * 0.05, 0, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'source-over';
      g.restore();
    } else if (kind === 'scratch') {
      g.lineWidth = Math.max(1.5, s * 0.03);
      g.lineCap = 'round';
      for (let k = 0; k < (opts.count ?? 4); k++) {
        g.beginPath();
        g.moveTo((k - 1.5) * s * 0.12, -s * 0.5);
        g.bezierCurveTo((k - 1.5) * s * 0.14, -s * 0.1, (k - 1.5) * s * 0.1, s * 0.2, (k - 1.5) * s * 0.16, s * 0.6);
        g.stroke();
      }
      g.restore();
    } else if (kind === 'text') {
      g.font = `400 ${Math.round(s * 0.55)}px ${FONTS.hand}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (opts.mirror) g.scale(-1, 1);
      g.fillText(opts.text || 'ช่วยด้วย', 0, 0);
      g.restore();
    } else {
      g.restore();
    }
    mk.tex.needsUpdate = true;
  }
  clearMarks(id) {
    const list = id === 'all' || !id ? this.ids : [id];
    for (const k of list) {
      const p = this.panes[k];
      if (p?.marks) {
        p.marks.g.fillStyle = '#000';
        p.marks.g.fillRect(0, 0, p.marks.canvas.width, p.marks.canvas.height);
        p.marks.tex.needsUpdate = true;
      }
    }
  }
  setWindow(id, amount) {
    this.panes[id]?.setOpen(amount);
  }
  /** Register windshield wiper geometry in mask space. */
  addWiper(pivotUV, r0, r1) {
    this.wipers.push({ pivot: pivotUV, r0, r1, prev: 0, angle: 0 });
  }
  setWiperAngle(i, a) {
    const w = this.wipers[i];
    if (w) w.angle = a;
  }
  _sweepWipers(dt) {
    const p = this.panes.windshield;
    if (!p || !this.wipers.length) return;
    const W = p.mw, H = p.mh;
    const rate = (0.18 + 0.5 * GLOBAL_UNIFORMS.uRain.value) * dt; // re-accumulation
    const R = p.rainF;
    for (let i = 0; i < W * H; i++) if (R[i] < 1) R[i] = Math.min(1, R[i] + rate);
    const asp = p.aspect || 1;
    for (const w of this.wipers) {
      const a0 = Math.min(w.prev, w.angle) - 0.03, a1 = Math.max(w.prev, w.angle) + 0.03;
      if (a1 - a0 > 0.065) {
        for (let y = 0; y < H; y++) {
          const dv = (y / (H - 1) - w.pivot[1]) / asp;
          for (let x = 0; x < W; x++) {
            const du = x / (W - 1) - w.pivot[0];
            const r = Math.hypot(du, dv);
            if (r < w.r0 || r > w.r1) continue;
            const phi = Math.atan2(dv, -du);
            if (phi >= a0 && phi <= a1) {
              R[y * W + x] = 0;
              // wipers also push water outward: smear trace
            }
          }
        }
        p.dirty = true;
      }
      w.prev = w.angle;
    }
  }
  /** Car-local flows: speed (m/s, +forward). */
  setFlow(speed) {
    const s = Math.max(0, speed);
    for (const id of this.ids) {
      const u = this.panes[id].uniforms;
      if (id === 'windshield') {
        // gravity down the glass, airflow pushes up and out at speed
        u.uFlow.value.set(0, -1 + Math.min(2.2, s * 0.09));
        u.uFlowSpeed.value = 0.6 + Math.min(3, s * 0.08);
      } else if (id === 'rear') {
        u.uFlow.value.set(0, -1);
        u.uFlowSpeed.value = 0.6;
      } else {
        // side glass uv.x = z (rearward): drops stream backward at speed
        u.uFlow.value.set(Math.min(3, s * 0.12), -1);
        u.uFlowSpeed.value = 0.6 + Math.min(3, s * 0.1);
      }
    }
  }
  update(dt) {
    const has = !!postfx.glassUniforms.tSceneColor.value;
    if (this._layerMode !== has) {
      this._layerMode = has;
      this.uniforms.uHasScene.value = has ? 1 : 0;
      for (const id of this.ids) {
        const p = this.panes[id];
        if (has) p.mesh.layers.set(LAYERS.GLASS);
        else {
          p.mesh.layers.set(LAYERS.GLASS);
          p.mesh.layers.enable(LAYERS.DEFAULT);
        }
        p.material.transparent = !has;
        p.material.depthWrite = has;
        p.material.needsUpdate = true;
      }
    }
    this._sweepWipers(dt);
    this._t += dt;
    // mask relaxation at ~15 Hz (cheap), wiper changes upload immediately
    const step = this._t >= 1 / 15;
    for (const id of this.ids) {
      const p = this.panes[id];
      if (step) p.update(this._t, this.fogRate);
      else if (p.dirty) p.upload();
    }
    if (step) this._t = 0;
  }
  /**
   * Render the interior reflection for one pane (gaze-gated). Called from onPreRender.
   * strength 0..1 = how much the lit cabin outshines the night outside (0 = skip the render).
   */
  renderReflection(renderer, scene, camera, paneId, strength, dt) {
    const enabled = settings.get('glassReflections') !== false;
    strength = clamp(strength ?? 1, 0, 1);
    for (const id of this.ids) {
      const u = this.panes[id].uniforms.uReflect;
      const target = enabled && id === paneId ? strength : 0;
      u.value = lerp(u.value, target, 1 - Math.exp(-6 * dt));
      if (u.value < 0.004 && target === 0) u.value = 0;
    }
    if (!enabled || !paneId || !this.panes[paneId]) return;
    const p = this.panes[paneId];
    if (p.uniforms.uReflect.value < 0.01 && strength < 0.01) return;
    if (!this.reflectRT) {
      this.reflectRT = new THREE.WebGLRenderTarget(320, 192, { type: THREE.HalfFloatType });
      this.reflectRT.texture.generateMipmaps = false;
      this.uniforms.tReflect.value = this.reflectRT.texture;
    }
    const size = p.rect(this._C, this._N, this._U);
    // make the normal face the eye
    if (this._N.dot(camera.position.clone().sub(this._C)) < 0) this._N.negate();
    const ok = setupPortalCamera(this.reflectCam, this._C, this._N, this._U, size[0] * 1.08, size[1] * 1.08, camera.position, 3.2, p.uniforms.uReflectMatrix.value, 1);
    if (!ok) {
      p.uniforms.uReflect.value = 0;
      return;
    }
    const prevRT = renderer.getRenderTarget();
    const prevAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    for (const id of this.ids) this.panes[id].mesh.visible = false;
    renderer.setRenderTarget(this.reflectRT);
    renderer.clear();
    renderer.render(scene, this.reflectCam);
    renderer.setRenderTarget(prevRT);
    for (const id of this.ids) this.panes[id].mesh.visible = true;
    renderer.shadowMap.autoUpdate = prevAuto;
  }
  dispose() {
    for (const id of this.ids) {
      const p = this.panes[id];
      p.mesh.removeFromParent();
      p.material.dispose();
      p.tex.dispose();
      p.marks?.tex.dispose();
    }
    this.reflectRT?.dispose();
  }
}
