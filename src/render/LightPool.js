// Light pool: many lamps, few real lights.
//  * The nearest N lamps (N by graphics preset: low 2, medium 3, high 4, ultra 6) get a
//    real PointLight (crossfaded on reassignment; the light count never changes, so
//    shaders never recompile while driving).
//  * Every lamp draws a glow billboard (one instanced draw for all lamps), an optional
//    additive ground light pool (one instanced draw), and an optional soft volumetric cone.
//  * Flicker presets: fluorescent, sodium, dying, candle, neon (+ onFlicker callback).
//  * The 4 nearest lamps feed the fog in-scattering uniforms (glowing haze around lamps).
import * as THREE from 'three';
import { GLOBAL_UNIFORMS, injectGlobals } from './uniforms.js';
import { LAYERS } from '../core/layers.js';
import { settings } from '../core/Settings.js';
import { createVolumetricBeam } from './Beams.js';

const REAL_BY_PRESET = { low: 2, medium: 3, high: 4, ultra: 6 };
const byDist = (a, b) => a.dist2 - b.dist2;
const _v = new THREE.Vector3();
const _c = new THREE.Color();

// ---------------------------------------------------------------------------
// Instanced glow + pool shaders
// ---------------------------------------------------------------------------
const GLOW_VERT = /* glsl */ `
#include <dlb_common>
#include <dlb_globals>
#include <dlb_fog_common>
attribute vec4 aPosSize;
attribute vec4 aColor;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  vec3 wp = aPosSize.xyz;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  float dist = max(-mv.z, 0.01);
  // fog: glows swell and soften in thick fog
  float T = dlbFogTransmittance(wp);
  float size = aPosSize.w * (1.0 + (1.0 - T) * 0.8);
  // keep a minimum on-screen size so distant lamps read as points of light
  float pxPerM = projectionMatrix[1][1] * 0.5 * 1080.0 / dist;
  float minS = 5.0 / pxPerM;
  float k = 1.0;
  if (size < minS) { k = (size / minS) * (size / minS); size = minS; }
  // pull the sprite toward the camera so it does not clip into the lamp housing
  mv.xyz += normalize(-mv.xyz) * min(aPosSize.w * 0.6, dist * 0.5);
  mv.xy += position.xy * size;
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  vCol = aColor.rgb * aColor.a * k * (0.25 + 0.75 * T);
}
`;
const GLOW_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 28.0) * 2.4;
  float mid = exp(-r2 * 7.0) * 0.55;
  float halo = pow(1.0 - sqrt(r2), 2.0) * 0.18;
  gl_FragColor = vec4(vCol * (core + mid + halo), 1.0);
}
`;
const POOL_VERT = /* glsl */ `
#include <dlb_common>
#include <dlb_globals>
#include <dlb_fog_common>
attribute vec4 aPosSize; // xyz ground centre, w radius
attribute vec4 aColor;
varying vec2 vUv;
varying vec3 vCol;
varying vec3 vWP;
void main() {
  vec3 wp = aPosSize.xyz + vec3(position.x, 0.0, -position.y) * aPosSize.w;
  vWP = wp;
  vUv = uv;
  vCol = aColor.rgb * aColor.a * dlbFogTransmittance(wp);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;
const POOL_FRAG = /* glsl */ `
#include <dlb_common>
varying vec2 vUv;
varying vec3 vCol;
varying vec3 vWP;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float n = 0.82 + 0.36 * dlbNoise2(vWP.xz * 1.7);
  float f = pow(1.0 - r, 2.2) * n;
  gl_FragColor = vec4(vCol * f, 1.0);
}
`;

function makeInstanced(vert, frag, capacity, opts = {}) {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.getAttribute('position'));
  g.setAttribute('uv', base.getAttribute('uv'));
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  const aCol = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  aPos.setUsage(THREE.DynamicDrawUsage);
  aCol.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aPosSize', aPos);
  g.setAttribute('aColor', aCol);
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: injectGlobals({}), vertexShader: vert, fragmentShader: frag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    ...opts,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------------------
// Flicker presets
// ---------------------------------------------------------------------------
function rnd(a, b) {
  return a + Math.random() * (b - a);
}
function emit(l, type) {
  if (l.onFlicker) {
    try {
      l.onFlicker({ type, handle: l.handle, position: l.pos });
    } catch (e) {
      console.error('[lightPool] onFlicker failed', e);
    }
  }
}
const FLICKER = {
  none(l) {
    return 1;
  },
  fluorescent(l, dt, t) {
    const f = l.fs;
    f.timer -= dt;
    switch (f.state) {
      case 'on':
        if (f.timer <= 0) {
          const r = Math.random();
          if (r < 0.55) { f.state = 'stutter'; f.timer = rnd(0.15, 0.9); emit(l, 'stutter'); }
          else if (r < 0.75) { f.state = 'off'; f.timer = rnd(0.5, 2.6); emit(l, 'off'); }
          else f.timer = rnd(3, 11);
        }
        // 100 Hz buzz shimmer + tiny drift
        return 0.93 + 0.05 * Math.sin(t * 628.3) * Math.random() + 0.02 * Math.sin(t * 1.7 + l.seed);
      case 'stutter': {
        if (f.timer <= 0) { f.state = 'on'; f.timer = rnd(2, 9); emit(l, 'on'); }
        f.sub -= dt;
        if (f.sub <= 0) { f.sub = rnd(0.02, 0.09); f.val = Math.random() < 0.45 ? rnd(0.0, 0.15) : rnd(0.6, 1.0); }
        return f.val;
      }
      case 'off':
        if (f.timer <= 0) { f.state = 'restrike'; f.timer = rnd(0.35, 1.1); f.sub = 0; emit(l, 'restrike'); }
        return 0.02;
      case 'restrike': {
        if (f.timer <= 0) { f.state = 'on'; f.timer = rnd(3, 12); emit(l, 'on'); }
        f.sub -= dt;
        if (f.sub <= 0) { f.sub = rnd(0.03, 0.12); f.val = Math.random() < 0.5 ? rnd(0.0, 0.1) : rnd(0.5, 1.05); }
        return f.val;
      }
    }
    return 1;
  },
  sodium(l, dt, t) {
    const s = l.seed;
    // slow warm wobble (+ an occasional sag)
    const f = l.fs;
    f.timer -= dt;
    if (f.state === 'on' && f.timer <= 0) {
      if (Math.random() < 0.25) { f.state = 'sag'; f.timer = rnd(1.5, 4); }
      else f.timer = rnd(6, 20);
    } else if (f.state === 'sag' && f.timer <= 0) { f.state = 'on'; f.timer = rnd(6, 20); }
    const sag = f.state === 'sag' ? 0.7 + 0.2 * Math.sin(t * 2.1 + s) : 1;
    return sag * (0.92 + 0.05 * Math.sin(t * 0.6 + s) + 0.03 * Math.sin(t * 2.7 + s * 3.1));
  },
  dying(l, dt, t) {
    const f = l.fs;
    f.timer -= dt;
    if (f.state === 'on' || f.state === 'stutter') {
      if (f.timer <= 0) {
        if (f.state === 'on') { f.state = 'stutter'; f.timer = rnd(0.2, 0.7); emit(l, 'stutter'); }
        else {
          f.state = 'off';
          f.timer = rnd(2, 8);
          emit(l, 'off');
          if (Math.random() < 0.6) emit(l, 'spark');
        }
      }
      if (f.state === 'stutter') {
        f.sub -= dt;
        if (f.sub <= 0) { f.sub = rnd(0.02, 0.08); f.val = Math.random() < 0.55 ? 0.02 : rnd(0.4, 1.0); }
        return f.val;
      }
      return 0.55 + 0.25 * Math.sin(t * 9.0 + l.seed) * Math.sin(t * 3.3);
    }
    // off
    if (f.timer <= 0) {
      f.state = 'on';
      f.timer = rnd(0.6, 3.5);
      emit(l, 'on');
      if (Math.random() < 0.5) emit(l, 'spark');
    }
    return 0.0;
  },
  candle(l, dt, t) {
    const s = l.seed;
    return 0.82 + 0.1 * Math.sin(t * 7.3 + s) * Math.sin(t * 3.1 + s * 2.0) + 0.08 * Math.sin(t * 17.0 + s * 5.0) * Math.random();
  },
  neon(l, dt, t) {
    const f = l.fs;
    f.timer -= dt;
    if (f.state === 'on') {
      if (f.timer <= 0) { f.state = 'buzz'; f.timer = rnd(0.15, 0.6); emit(l, 'stutter'); }
      return 0.97 + 0.03 * Math.sin(t * 314.0);
    }
    if (f.timer <= 0) { f.state = 'on'; f.timer = rnd(3, 12); emit(l, 'on'); }
    f.sub -= dt;
    if (f.sub <= 0) { f.sub = rnd(0.03, 0.1); f.val = rnd(0.25, 1.0); }
    return f.val;
  },
};

// ---------------------------------------------------------------------------
class LightPool {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'lightPool';
    this.handles = new Set();
    this.lamps = [];
    this.slots = [];
    this._cap = 64;
    this.glows = makeInstanced(GLOW_VERT, GLOW_FRAG, this._cap);
    this.glows.renderOrder = 20;
    this.glows.name = 'lampGlows';
    this.pools = makeInstanced(POOL_VERT, POOL_FRAG, this._cap, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.pools.renderOrder = 5;
    this.pools.name = 'lampPools';
    this.group.add(this.glows, this.pools);
    this.scatter = 1; // global multiplier for fog in-scattering around lamps
    this.maxDistance = 220;
    this._setRealCount(REAL_BY_PRESET[settings.get('graphicsPreset')] ?? 4);
    settings.onChange(({ key }) => {
      if (key === 'graphicsPreset' || key === '*') this._setRealCount(REAL_BY_PRESET[settings.get('graphicsPreset')] ?? 4);
    });
  }

  _setRealCount(n) {
    if (this.slots.length === n) return;
    for (const s of this.slots) {
      this.group.remove(s.light);
      s.light.dispose?.();
      if (s.lamp) s.lamp.slot = null;
    }
    this.slots = [];
    for (let i = 0; i < n; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 18, 2);
      light.name = 'poolLight' + i;
      light.layers.enable(LAYERS.GLASS);
      light.position.set(0, -1000, 0);
      this.group.add(light);
      this.slots.push({ light, lamp: null, fade: 0 });
    }
  }

  _grow() {
    const cap = this._cap * 2;
    for (const mesh of [this.glows, this.pools]) {
      const g = mesh.geometry;
      for (const name of ['aPosSize', 'aColor']) {
        const old = g.getAttribute(name);
        const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
        a.array.set(old.array);
        a.setUsage(THREE.DynamicDrawUsage);
        g.setAttribute(name, a);
      }
    }
    this._cap = cap;
  }

  /**
   * Register a light source. spec = { position?: Vector3 (world), object?: Object3D (follow, local `offset`),
   *   offset?: Vector3, color, intensity, distance, decay=2, flicker='none'|'fluorescent'|'sodium'|'dying'|'candle'|'neon',
   *   glow?: { size, color, opacity } | false, pool?: boolean (fake light pool on ground), castShadow?: false, priority?: 0 }
   * Extra spec: groundY (pool height; default lamp y - 5 or object world y), poolRadius, poolIntensity,
   *   beam?: true | { length, angle, intensity, color, direction: Vector3 (world, default down) },
   *   onFlicker?: ({type:'on'|'off'|'stutter'|'restrike'|'spark', handle, position}) => void,
   *   scatter?: fog in-scatter strength (default 1), name.
   * Returns handle { on, setOn(bool), setIntensity(v), setColor(c), setFlicker(kind), remove(), light? }
   *   plus { position (world Vector3, live), level (current flicker multiplier), setPosition(v), beam, spec }.
   */
  add(spec = {}) {
    const lamp = {
      spec,
      object: spec.object || null,
      offset: spec.offset ? spec.offset.clone() : new THREE.Vector3(),
      pos: new THREE.Vector3(),
      color: new THREE.Color(spec.color ?? 0xffaa66),
      intensity: spec.intensity ?? 3,
      distance: spec.distance ?? 18,
      decay: spec.decay ?? 2,
      flicker: spec.flicker || 'none',
      glow: spec.glow === false ? null : { size: 0.35, opacity: 1, ...(spec.glow || {}) },
      glowColor: new THREE.Color(),
      pool: !!spec.pool,
      groundY: spec.groundY,
      poolRadius: spec.poolRadius,
      poolIntensity: spec.poolIntensity ?? 1,
      priority: spec.priority ?? 0,
      scatter: spec.scatter ?? 1,
      on: spec.on !== false,
      level: 1,
      smooth: 1,
      seed: Math.random() * 100,
      fs: { state: 'on', timer: 2 + Math.random() * 6, sub: 0, val: 1 },
      onFlicker: spec.onFlicker || null,
      slot: null,
      visible: true,
      dist2: 0,
      beam: null,
      handle: null,
    };
    if (spec.position) lamp.pos.copy(spec.position);
    if (lamp.glow) lamp.glowColor.set(lamp.glow.color ?? lamp.color);
    if (spec.beam) {
      const b = spec.beam === true ? {} : spec.beam;
      lamp.beam = createVolumetricBeam({
        color: b.color ?? lamp.color, length: b.length ?? 6.5, angle: b.angle ?? 0.6, intensity: b.intensity ?? 0.5, noise: b.noise ?? 0.8,
      });
      lamp.beamDir = (b.direction ? b.direction.clone() : new THREE.Vector3(0, -1, 0)).normalize();
      lamp.beamBase = lamp.beam.userData.uniforms.uIntensity.value;
      this.group.add(lamp.beam);
    }
    const pool = this;
    const h = {
      get on() {
        return lamp.on;
      },
      set on(v) {
        lamp.on = !!v;
      },
      get light() {
        return lamp.slot ? lamp.slot.light : null;
      },
      get level() {
        return lamp.on ? lamp.level : 0;
      },
      get position() {
        return lamp.pos;
      },
      get beam() {
        return lamp.beam;
      },
      spec,
      setOn(b) {
        lamp.on = !!b;
      },
      setIntensity(v) {
        lamp.intensity = v;
      },
      setColor(c) {
        lamp.color.set(c);
        if (lamp.glow) lamp.glowColor.set(lamp.glow.color ?? c);
        if (lamp.beam) lamp.beam.userData.uniforms.uColor.value.set(c);
      },
      setFlicker(kind) {
        lamp.flicker = FLICKER[kind] ? kind : 'none';
        lamp.fs.state = 'on';
        lamp.fs.timer = 1 + Math.random() * 4;
      },
      setPosition(v) {
        if (lamp.object) lamp.offset.copy(v);
        else lamp.pos.copy(v);
      },
      remove: () => pool._remove(lamp),
    };
    lamp.handle = h;
    this.lamps.push(lamp);
    this.handles.add(h);
    if (this.lamps.length > this._cap) this._grow();
    this._updateLampPos(lamp);
    return h;
  }

  _remove(lamp) {
    const i = this.lamps.indexOf(lamp);
    if (i < 0) return;
    this.lamps.splice(i, 1);
    this.handles.delete(lamp.handle);
    if (lamp.slot) {
      lamp.slot.lamp = null;
      lamp.slot.fade = 0;
      lamp.slot.light.intensity = 0;
      lamp.slot = null;
    }
    if (lamp.beam) {
      this.group.remove(lamp.beam);
      lamp.beam.material.dispose();
    }
  }

  _updateLampPos(lamp) {
    if (!lamp.object) {
      lamp.visible = true;
      return;
    }
    // visible only while the followed object is in a scene and all ancestors are visible
    let o = lamp.object;
    let vis = true;
    let root = o;
    while (o) {
      if (!o.visible) vis = false;
      root = o;
      o = o.parent;
    }
    lamp.visible = vis && !!root.isScene;
    if (lamp.visible) lamp.pos.copy(lamp.offset).applyMatrix4(lamp.object.matrixWorld);
  }

  update(dt, camera) {
    const t = GLOBAL_UNIFORMS.uTime.value;
    const cam = camera.position;
    const lamps = this.lamps;
    const n = lamps.length;
    const realN = this.slots.length;
    // --- positions, flicker, distances ---------------------------------------------
    const near = this._near || (this._near = []);
    near.length = 0;
    const maxD2 = this.maxDistance * this.maxDistance;
    for (let i = 0; i < n; i++) {
      const l = lamps[i];
      this._updateLampPos(l);
      const fn = FLICKER[l.flicker] || FLICKER.none;
      const lvl = l.on ? fn(l, dt, t) : 0;
      // electrical lamps snap, candles/sodium are smooth
      const k = l.flicker === 'sodium' || l.flicker === 'candle' ? 1 - Math.exp(-dt * 12) : 1;
      l.level += (lvl - l.level) * k;
      l.dist2 = l.pos.distanceToSquared(cam) / (1 + l.priority);
      if (l.on && l.visible && l.dist2 < maxD2) near.push(l);
    }
    near.sort(byDist);
    // --- real light slots (crossfade) ------------------------------------------------
    for (const s of this.slots) {
      const want = s.lamp && near.indexOf(s.lamp) >= 0 && near.indexOf(s.lamp) < realN;
      if (!want && s.lamp) {
        s.fade = Math.max(0, s.fade - dt * 5);
        if (s.fade === 0) {
          s.lamp.slot = null;
          s.lamp = null;
        }
      } else if (s.lamp) s.fade = Math.min(1, s.fade + dt * 4);
    }
    for (let i = 0; i < Math.min(realN, near.length); i++) {
      const l = near[i];
      if (l.slot) continue;
      let free = null;
      for (const s of this.slots) if (!s.lamp) { free = s; break; }
      if (!free) break;
      free.lamp = l;
      free.fade = this._started ? 0 : 1;
      l.slot = free;
    }
    this._started = true;
    for (const s of this.slots) {
      const L = s.light;
      if (!s.lamp) {
        L.intensity = 0;
        continue;
      }
      const l = s.lamp;
      L.position.copy(l.pos);
      L.color.copy(l.color);
      L.distance = l.distance;
      L.decay = l.decay;
      L.intensity = l.intensity * l.level * s.fade;
    }
    // --- instanced glows + pools ---------------------------------------------------------
    const gPos = this.glows.geometry.getAttribute('aPosSize');
    const gCol = this.glows.geometry.getAttribute('aColor');
    const pPos = this.pools.geometry.getAttribute('aPosSize');
    const pCol = this.pools.geometry.getAttribute('aColor');
    let gi = 0, pi = 0;
    for (let i = 0; i < near.length; i++) {
      const l = near[i];
      const lvl = l.level;
      if (lvl <= 0.003) continue;
      if (l.glow) {
        const o = gi * 4;
        gPos.array[o] = l.pos.x; gPos.array[o + 1] = l.pos.y; gPos.array[o + 2] = l.pos.z; gPos.array[o + 3] = l.glow.size;
        const gk = (l.glow.opacity ?? 1) * lvl * (0.6 + Math.sqrt(l.intensity) * 0.35);
        gCol.array[o] = l.glowColor.r; gCol.array[o + 1] = l.glowColor.g; gCol.array[o + 2] = l.glowColor.b; gCol.array[o + 3] = gk;
        gi++;
      }
      if (l.pool) {
        const o = pi * 4;
        const gy = l.groundY ?? (l.object ? l.pos.y - (l.spec.height ?? 5) : l.pos.y - 5);
        const height = Math.max(0.5, l.pos.y - gy);
        const rad = l.poolRadius ?? Math.min(l.distance * 0.6, height * 1.9 + 2.0);
        pPos.array[o] = l.pos.x; pPos.array[o + 1] = gy + 0.02; pPos.array[o + 2] = l.pos.z; pPos.array[o + 3] = rad;
        const realK = l.slot ? 1 - 0.75 * l.slot.fade : 1;
        const pk = lvl * l.poolIntensity * Math.sqrt(l.intensity) * 0.012 * realK / (1 + height * 0.15);
        pCol.array[o] = l.color.r; pCol.array[o + 1] = l.color.g; pCol.array[o + 2] = l.color.b; pCol.array[o + 3] = pk;
        pi++;
      }
    }
    this.glows.geometry.instanceCount = gi;
    this.pools.geometry.instanceCount = pi;
    this.glows.visible = gi > 0;
    this.pools.visible = pi > 0;
    if (gi) { gPos.needsUpdate = true; gCol.needsUpdate = true; gPos.addUpdateRange(0, gi * 4); gCol.addUpdateRange(0, gi * 4); }
    if (pi) { pPos.needsUpdate = true; pCol.needsUpdate = true; pPos.addUpdateRange(0, pi * 4); pCol.addUpdateRange(0, pi * 4); }
    // --- beams ------------------------------------------------------------------------------
    const vol = settings.get('volumetrics') !== false;
    for (let i = 0; i < n; i++) {
      const l = lamps[i];
      if (!l.beam) continue;
      const show = vol && l.on && l.visible && l.level > 0.01 && l.dist2 < 90 * 90;
      l.beam.visible = show;
      if (show) {
        l.beam.position.copy(l.pos);
        _v.copy(l.pos).add(l.beamDir);
        l.beam.lookAt(_v); // lookAt points +Z at target for non-cameras -> flip below
        l.beam.rotateY(Math.PI);
        l.beam.userData.uniforms.uIntensity.value = l.beamBase * l.level * Math.min(1, l.intensity / 8);
        l.beam.userData.uniforms.uGroundY.value = l.groundY ?? l.pos.y - (l.spec.height ?? 5);
      }
    }
    // --- fog in-scatter uniforms (4 nearest lamps) -----------------------------------------------
    const LP = GLOBAL_UNIFORMS.uLampPos.value;
    const LC = GLOBAL_UNIFORMS.uLampCol.value;
    let k = 0;
    for (let i = 0; i < near.length && k < 4; i++) {
      const l = near[i];
      if (l.level <= 0.003 || l.scatter <= 0) continue;
      LP[k].set(l.pos.x, l.pos.y, l.pos.z, l.distance);
      _c.copy(l.color).multiplyScalar(l.intensity * l.level * l.scatter * this.scatter);
      LC[k].set(_c.r, _c.g, _c.b, 0);
      k++;
    }
    for (; k < 4; k++) {
      LP[k].set(0, -10000, 0, 1);
      LC[k].set(0, 0, 0, 0);
    }
  }
}

export const lightPool = new LightPool();
