// Rendering module public API (contract: docs/ARCHITECTURE.md "render").
// STUB IMPLEMENTATION — the render agent replaces internals; signatures must stay.
import * as THREE from 'three';

/** Shared uniforms referenced by every patched material / custom shader. Update via updateGlobalUniforms(). */
export const GLOBAL_UNIFORMS = {
  uTime: { value: 0 },
  uHour: { value: 21 },
  uWetness: { value: 0.6 }, // 0 dry .. 1 soaked (road puddles, darkened albedo)
  uRain: { value: 0 }, // current rain intensity 0..1
  uWindDir: { value: new THREE.Vector2(1, 0.3).normalize() },
  uWindStrength: { value: 0.35 },
  uFogColor: { value: new THREE.Color(0x0b1016) },
  uFogDensity: { value: 0.035 },
  uFogHeight: { value: 0.0 }, // world Y where height fog is densest
  uFogHeightFalloff: { value: 0.12 },
  uCameraPos: { value: new THREE.Vector3() },
  uHeadlightPos: { value: new THREE.Vector3() }, // world-space headlight origin (taxi / bike)
  uHeadlightDir: { value: new THREE.Vector3(0, 0, -1) },
  uHeadlightOn: { value: 0 }, // 0..1
  uSurreal: { value: 0 }, // 0..1 surreal phase tint
  uDawn: { value: 0 }, // 0..1 dawn progress
};

/**
 * Painterly PBR material factory. Returns a THREE.MeshStandardMaterial patched with
 * brush-stroke albedo/roughness variation, global wetness, height fog and wind sway.
 * opts: { color, map, normalMap, roughness, metalness, emissive, emissiveIntensity, emissiveMap,
 *   vertexColors, side, transparent, opacity, alphaTest, alphaMap, depthWrite,
 *   brush=0.6, triplanar=null (texture key), triplanarScale=0.5, wet=0.5, moss=0, dirt=0,
 *   wind='none'|'trunk'|'branch'|'leaf'|'grass'|'vine'|'cloth', windStrength=1, translucency=0,
 *   instanced=false, flatShading=false, name }
 */
export function paintedMaterial(opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: opts.color ?? 0xffffff,
    map: opts.map ?? null,
    normalMap: opts.normalMap ?? null,
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    emissiveMap: opts.emissiveMap ?? null,
    vertexColors: !!opts.vertexColors,
    side: opts.side ?? THREE.FrontSide,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    alphaTest: opts.alphaTest ?? 0,
    alphaMap: opts.alphaMap ?? null,
    flatShading: !!opts.flatShading,
  });
  if (opts.depthWrite !== undefined) m.depthWrite = opts.depthWrite;
  if (opts.name) m.name = opts.name;
  m.userData.painted = { ...opts };
  return m;
}

/** Alpha-tested, double-sided, translucent, wind-swayed foliage (leaf cards, grass, ferns). */
export function foliageMaterial(opts = {}) {
  return paintedMaterial({ alphaTest: 0.5, side: THREE.DoubleSide, wind: 'leaf', translucency: 0.5, roughness: 0.8, ...opts });
}

/** Skin with soft wrap lighting / fake subsurface; opts as paintedMaterial plus { pale=0 (ghost pallor), wetness }. */
export function skinMaterial(opts = {}) {
  return paintedMaterial({ roughness: 0.6, brush: 0.35, ...opts });
}

/** Unlit additive glow sprite material (lamp halos, fireflies). */
export function glowMaterial(color = 0xffcc88, opacity = 1) {
  return new THREE.SpriteMaterial({
    color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
    map: glowTexture(),
  });
}

let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

// ---------------------------------------------------------------------------
// PostFX — final image pipeline (stub: plain render).
// ---------------------------------------------------------------------------
class PostFXStub {
  constructor() {
    this.params = {
      exposure: 1, painterly: 0.75, bloom: 0.8, grain: 0.35, vignette: 0.6, chroma: 0.3,
      saturation: 1, contrast: 1, temperature: 0, tint: new THREE.Color(1, 1, 1),
      letterbox: 0, fade: 0, fadeColor: new THREE.Color(0, 0, 0), horror: 0, amulet: 0, blur: 0, distortion: 0,
    };
    /** Glass materials sample these (screen-space refraction of the opaque scene). */
    this.glassUniforms = {
      tSceneColor: { value: null },
      tSceneBlur: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
    };
  }
  /** Brief full-screen flash. */
  flash(color = 0xffffff, duration = 0.25) {}
  render(renderer, scene, camera) {
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }
}
export const postfx = new PostFXStub();

// ---------------------------------------------------------------------------
// Sky / time of day (stub).
// ---------------------------------------------------------------------------
class SkyStub {
  constructor() {
    this.hour = 21;
    this.weather = { rain: 0, fog: 0, wind: 0.3 };
    this.surreal = 0;
    this.group = new THREE.Group();
    this.ambient = new THREE.AmbientLight(0x334455, 0.6);
    this.hemi = new THREE.HemisphereLight(0x406080, 0x101010, 0.4);
    this.moon = new THREE.DirectionalLight(0x8899cc, 0.4);
    this.moon.position.set(30, 60, 20);
    this.sun = new THREE.DirectionalLight(0xffd6a0, 0);
    this.group.add(this.ambient, this.hemi, this.moon, this.sun);
  }
  /** Hour 21..30 (30 = 06:00). Continuous. */
  setHour(h) {
    this.hour = h;
    GLOBAL_UNIFORMS.uHour.value = h;
  }
  /** Blend weather over `seconds`. */
  setWeather(w, seconds = 4) {
    Object.assign(this.weather, w);
  }
  /** Keep shadow camera centred on a point (taxi / player). */
  setShadowFocus(v) {}
  update(dt) {}
}
export const sky = new SkyStub();

// ---------------------------------------------------------------------------
// Light pool (stub): every light is a real PointLight.
// ---------------------------------------------------------------------------
class LightPoolStub {
  constructor() {
    this.group = new THREE.Group();
    this.handles = new Set();
  }
  /**
   * Register a light source. spec = { position?: Vector3 (world), object?: Object3D (follow, local `offset`),
   *   offset?: Vector3, color, intensity, distance, decay=2, flicker='none'|'fluorescent'|'sodium'|'dying'|'candle'|'neon',
   *   glow?: { size, color, opacity } | false, pool?: boolean (fake light pool on ground), castShadow?: false, priority?: 0 }
   * Returns handle { on, setOn(bool), setIntensity(v), setColor(c), setFlicker(kind), remove(), light? }
   */
  add(spec) {
    const l = new THREE.PointLight(spec.color ?? 0xffaa66, spec.intensity ?? 3, spec.distance ?? 18, spec.decay ?? 2);
    if (spec.object) {
      if (spec.offset) l.position.copy(spec.offset);
      spec.object.add(l);
    } else if (spec.position) {
      l.position.copy(spec.position);
      this.group.add(l);
    }
    const h = {
      on: true, light: l,
      setOn(b) { this.on = b; l.visible = b; },
      setIntensity(v) { l.intensity = v; },
      setColor(c) { l.color.set(c); },
      setFlicker() {},
      remove: () => { l.parent?.remove(l); this.handles.delete(h); },
    };
    this.handles.add(h);
    return h;
  }
  update(dt, camera) {}
}
export const lightPool = new LightPoolStub();

// ---------------------------------------------------------------------------
// Particles (stub).
// ---------------------------------------------------------------------------
class ParticlesStub {
  constructor() {
    this.group = new THREE.Group();
  }
  /**
   * Spawn an emitter. type: 'fireflies'|'moths'|'mosquitoes'|'rain'|'dust'|'pollen'|'leaves'|'incense'|'smoke'|
   *   'sparks'|'mist'|'headlightBugs'|'ash'|'drips'|'splash'|'embers'
   * opts: { position?: Vector3, object?: Object3D, offset?: Vector3, radius?, count?, color?, follow?: Object3D, burst?: bool, intensity? }
   * Returns handle { object, setActive(bool), setIntensity(v), setPosition(v), dispose() }
   */
  emit(type, opts = {}) {
    const object = new THREE.Group();
    return { object, type, setActive() {}, setIntensity() {}, setPosition() {}, dispose() {} };
  }
  update(dt, camera) {}
}
export const particles = new ParticlesStub();

/** Push per-frame values into GLOBAL_UNIFORMS (called by installRendering's update hook). */
export function updateGlobalUniforms(engine) {
  GLOBAL_UNIFORMS.uTime.value = engine.time;
  GLOBAL_UNIFORMS.uCameraPos.value.copy(engine.camera.position);
}

/**
 * Install the rendering stack: shader chunk overrides, post pipeline, sky, light pool,
 * particles. Called once at boot by main.js. Returns { postfx, sky, lightPool, particles }.
 */
export function installRendering(engine) {
  engine.scene.add(sky.group, lightPool.group, particles.group);
  engine.onUpdate((dt) => {
    updateGlobalUniforms(engine);
    sky.update(dt);
    lightPool.update(dt, engine.camera);
    particles.update(dt, engine.camera);
  }, 80);
  engine.renderPipeline = (renderer, scene, camera, dt) => postfx.render(renderer, scene, camera, dt);
  return { postfx, sky, lightPool, particles };
}
