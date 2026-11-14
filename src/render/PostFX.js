// PostFX — final image pipeline (lean: every pass here is on screen in the final image).
//
//  internal size = drawing buffer x dynamic render scale (1.0 .. 0.7, only while the
//  frame time is over budget; see Perf.js). Per frame:
//
//  scene (layers minus GLASS) -> sceneRT: HalfFloat, MSAA by preset (low 0 + FXAA-lite,
//     medium 2x, high / ultra 4x; foliage uses alpha-to-coverage), no depth resolve
//  -> [glass on screen] quarter-res blur of the opaque frame (tSceneBlur: 1 down + 4 gauss).
//     With MSAA the resolved sceneRT texture IS tSceneColor (the glass draws into the
//     multisampled renderbuffer, so there is no feedback loop and no full-res copy);
//     without MSAA one copy pass. -> GLASS layer rendered on top (depth tested).
//  -> bloom from QUARTER resolution: 5 x 13-tap down (1/4 .. 1/64) + 4 x tent up
//  -> light shafts (sun at dawn, moon through the canopy; quarter res, only when visible)
//  -> grade (exposure, WB, ACES, lift/gamma/gain, split tone, contrast, saturation,
//     horror, amulet, menu blur, distortion, flash; no vignette) -> sRGB + dither -> 8-bit RT
//  -> output to the canvas: (FXAA-lite on low) + contrast-adaptive sharpening, which is
//     also the upscaler when the internal size is below the canvas, + blood, fade, letterbox.
//
//  Removed on the owner's order (no GPU cost left): painterly Kuwahara + structure tensor,
//  paper / canvas overlay, lens chromatic aberration, vignette. `params.painterly`,
//  `params.chroma` and `params.vignette` are still accepted (no-ops). A fine, sharp,
//  luminance-only film grain (FILM_GRAIN, x params.grain) is added in the output pass.
//  Half-res AO (Shadows/AO_FRAG) is kept but off unless settings.ambientOcclusion === true.
import * as THREE from 'three';
import { LAYERS } from '../core/layers.js';
import { settings } from '../core/Settings.js';
import { bus } from '../core/Events.js';
import { clamp } from '../core/math.js';
import { FS_VERT, GAUSS_FRAG } from './Painterly.js';
import { COPY_FRAG, BLOOM_DOWN_FRAG, BLOOM_UP_FRAG, SHAFT_MASK_FRAG, SHAFT_BLUR_FRAG, FINAL_FRAG, OUTPUT_FRAG, AO_FRAG, AO_BLUR_FRAG, MOTION_BLUR_FRAG } from './PostShaders.js';
import { lensDirtTexture } from './noiseTex.js';
import { GORE_UNIFORM } from './Blood.js';
import { GLOBAL_UNIFORMS } from './uniforms.js';
import { FrameClock, DynamicResolution, AutoQuality } from './Perf.js';
import { cameraRig } from '../core/CameraRig.js';

const GLASS_BIT = 1 << LAYERS.GLASS;
/** bloom mips: 1/4, 1/8, 1/16, 1/32, 1/64 of the internal size */
const BLOOM_LEVELS = 5;
const MSAA_BY_PRESET = { low: 0, medium: 2, high: 4, ultra: 4 };
/** Fine luminance-only film grain (horror texture); `params.grain` multiplies it. */
const FILM_GRAIN = 0.12;

function makeRT(w, h, opts = {}) {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: opts.ldr ? THREE.UnsignedByteType : THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: !!opts.depth,
    stencilBuffer: false,
    samples: opts.samples || 0,
    generateMipmaps: false,
    // nothing samples the scene depth: never blit the multisampled depth buffer
    resolveDepthBuffer: false,
  });
  rt.resolveDepthBuffer = false;
  rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
  rt.texture.name = opts.name || 'dlbRT';
  return rt;
}

function passMaterial(frag, uniforms, defines = {}) {
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: FS_VERT, fragmentShader: frag, defines,
    depthTest: false, depthWrite: false, fog: false, toneMapped: false,
  });
}

const _v3 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _size = new THREE.Vector2();
const _mat4 = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _sphere = new THREE.Sphere();
const _vp = new THREE.Matrix4();
const _vpI = new THREE.Matrix4();
const _iMat = new THREE.Matrix4();
const _iPos = new THREE.Vector3();
const _iQuat = new THREE.Quaternion();
const _e = new THREE.Euler();
const _one = new THREE.Vector3(1, 1, 1);
const _q = new THREE.Quaternion();

class PostFX {
  constructor() {
    /**
     * Animatable by gameplay. Multipliers (1 = the player's settings / the hour's grade):
     *   exposure, bloom, grain, sharpen, saturation, contrast, tint (Color multiply).
     *   (painterly, chroma, vignette: accepted, no effect — those filters are removed.)
     * Absolute: temperature (added), letterbox 0..1, fade 0..1 + fadeColor, horror 0..1, amulet 0..1,
     *   blur 0..1, distortion 0..1, blood 0..1 (blood splatter + runs on the lens; see bloodSplash()).
     */
    this.params = {
      exposure: 1, painterly: 1, bloom: 1, grain: 1, vignette: 1, chroma: 1, sharpen: 1,
      saturation: 1, contrast: 1, temperature: 0, tint: new THREE.Color(1, 1, 1),
      letterbox: 0, fade: 0, fadeColor: new THREE.Color(0, 0, 0), horror: 0, amulet: 0, blur: 0, distortion: 0,
      blood: 0,
    };
    /** Glass materials sample these (screen-space refraction of the opaque scene). */
    this.glassUniforms = {
      tSceneColor: { value: null },
      tSceneBlur: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
    };
    this.enabled = true;
    /** debug: 'shafts' | 'bloom' | 'scene' | 'grade' shows that buffer raw */
    this.debugView = null;
    /** 'auto' (glass pass only while a GLASS-layer mesh is in the view frustum) | true | false */
    this.glass = 'auto';
    this.sky = null; // set by installRendering (grade targets, sun for shafts)
    /** 0..1 moonlight shafts through the canopy at night (screen-space, when the moon is in view). */
    this.moonShafts = 1;
    /** multiplier on sun / moon shafts */
    this.shaftStrength = 1;
    /** frame clock + dynamic resolution (Perf.js); `dynamic.enabled = false` pins full resolution */
    this.clock = new FrameClock();
    this.dynamic = new DynamicResolution();
    this.autoQuality = new AutoQuality(this.dynamic);
    /** current internal render scale (1 = drawing-buffer size) and size */
    this.renderScale = 1;
    this.renderWidth = 1;
    this.renderHeight = 1;
    this._glassList = [];
    this._glassHold = 0;
    this._glassUsed = false;
    this._frame = 0;
    this._flash = { color: new THREE.Color(), t: 0, dur: 1 };
    this._blood = { splash: 0, age: 99, seed: Math.random(), runT: 0, last: 0 };
    this._w = 0;
    this._h = 0;
    this._ow = 0;
    this._oh = 0;
    this._samples = -1;
    this._built = false;
    this._settingsDirty = true;
    this._sizeDirty = true;
    this.stats = { passes: 0, renderScale: 1, frameMs: 0, width: 0, height: 0, glass: false, shafts: false };
    settings.onChange(() => (this._settingsDirty = true));
    bus.on('engine:resize', () => (this._sizeDirty = true));
  }

  /** Brief full-screen flash. */
  flash(color = 0xffffff, duration = 0.25) {
    this._flash.color.set(color);
    this._flash.t = duration;
    this._flash.dur = Math.max(0.01, duration);
  }

  /**
   * One-shot blood splatter on the lens (attack / death): jumps to `amount` (0..1) with a
   * new pattern, holds ~1.5 s, then fades over ~5 s while the runs keep sliding down.
   * Combined with params.blood (max of both). Reduced by settings.gore = 'reduced'.
   */
  bloodSplash(amount = 0.7) {
    const b = this._blood;
    b.splash = clamp(amount, 0, 1);
    b.age = 0;
    b.seed = Math.random();
    b.runT = 0;
  }

  _build(renderer) {
    this._built = true;
    const quadGeo = new THREE.BufferGeometry();
    quadGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    quadGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this._quad = new THREE.Mesh(quadGeo);
    this._quad.frustumCulled = false;
    this._cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // mobile render-to-texture MSAA attaches the texture itself: then glass needs a copy
    this._rtt = !!renderer?.extensions?.has?.('WEBGL_multisampled_render_to_texture');

    this.matCopy = passMaterial(COPY_FRAG, { tSrc: { value: null } });
    this.matGauss = passMaterial(GAUSS_FRAG, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.matDown = passMaterial(BLOOM_DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uKaris: { value: 0 }, uClampMax: { value: 400 } });
    this.matUp = passMaterial(BLOOM_UP_FRAG, { tLow: { value: null }, tHigh: { value: null }, uTexel: { value: new THREE.Vector2() }, uScatter: { value: 0.7 } });
    this.matShaftMask = passMaterial(SHAFT_MASK_FRAG, { tSrc: { value: null }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uThreshold: { value: 0.8 } });
    this.matAO = passMaterial(AO_FRAG, {
      tDepth: { value: null }, uTexel: { value: new THREE.Vector2() }, uProjInv: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.1 }, uFar: { value: 1000 }, uRadius: { value: 0.55 }, uIntensity: { value: 1.0 }, uPxPerM: { value: 500 },
    });
    this.matAOBlur = passMaterial(AO_BLUR_FRAG, { tAO: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.matMB = passMaterial(MOTION_BLUR_FRAG, {
      tColor: { value: null }, tDepth: { value: null }, uInvViewProj: { value: new THREE.Matrix4() }, uCurViewProj: { value: new THREE.Matrix4() }, uPrevViewProj: { value: new THREE.Matrix4() },
      uTexel: { value: new THREE.Vector2() }, uScale: { value: 0.35 }, uMaxPx: { value: 24 }, uNear: { value: 0.1 }, uFar: { value: 1000 },
    });
    this._prevVP = new THREE.Matrix4();
    this._prevPos = new THREE.Vector3();
    this._prevQuat = new THREE.Quaternion();
    this._mbHasPrev = false;
    this.matShaftBlur = passMaterial(SHAFT_BLUR_FRAG, { tSrc: { value: null }, uSun: { value: new THREE.Vector2() }, uLength: { value: 0.6 }, uJitter: { value: 1 } });
    const fu = {
      tScene: { value: null }, tBloom: { value: null }, tBlur: { value: null }, tShafts: { value: null },
      tAO: { value: null }, tDirt: { value: lensDirtTexture() }, uAO: { value: 0 }, uDirt: { value: 0 }, uFilmic: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
      uExposure: { value: 1 }, uSaturation: { value: 1 }, uContrast: { value: 1 }, uTemperature: { value: 0 }, uTint: { value: 0 },
      uLift: { value: new THREE.Vector3() }, uGamma: { value: new THREE.Vector3(1, 1, 1) }, uGain: { value: new THREE.Vector3(1, 1, 1) },
      uShadowTint: { value: new THREE.Color(1, 1, 1) }, uHighTint: { value: new THREE.Color(1, 1, 1) }, uSplit: { value: 0 },
      uHiSat: { value: 0 },
      uColorMul: { value: new THREE.Color(1, 1, 1) },
      uBloom: { value: 0.05 }, uShafts: { value: 0 }, uShaftCol: { value: new THREE.Color() },
      uHorror: { value: 0 }, uAmulet: { value: 0 }, uBlur: { value: 0 }, uDistortion: { value: 0 },
      uFlash: { value: new THREE.Vector4() },
    };
    this.finalUniforms = fu;
    this.matFinal = passMaterial(FINAL_FRAG, fu);
    const ou = {
      tSrc: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTexel: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 }, uSharp: { value: 0.5 }, uGrain: { value: 0 },
      uFade: { value: 0 }, uFadeColor: { value: new THREE.Color() }, uLetterbox: { value: 0 },
      uBlood: { value: 0 }, uBloodSeed: { value: 0 }, uBloodRun: { value: 0 }, uGore: GORE_UNIFORM,
    };
    this.outputUniforms = ou;
    this.matOutput = passMaterial(OUTPUT_FRAG, ou);
    this.matOutputFxaa = passMaterial(OUTPUT_FRAG, ou, { FXAA: '' });
    this._black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this._black.needsUpdate = true;
    this._white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this._white.needsUpdate = true;
  }

  _pass(renderer, material, target) {
    this._quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this._quad, this._cam);
    this.stats.passes++;
  }

  _readSettings() {
    this._settingsDirty = false;
    const preset = settings.get('graphicsPreset') || 'medium';
    const samples = MSAA_BY_PRESET[preset] ?? 2;
    // AO stays in the code but is OFF unless explicitly enabled (owner: no dark contact halos)
    const ao = settings.get('ambientOcclusion') === true;
    // camera motion blur: on unless the low preset / the player turns it off
    const mb = settings.get('motionBlur') === true; // opt-in only (owner: no random blur)
    if (samples !== this._samples || ao !== this._ao || mb !== this._mb) {
      this._samples = samples;
      this._ao = ao;
      this._mb = mb;
      this._sizeDirty = true;
    }
    this.cfg = {
      bloom: clamp(settings.get('bloom') ?? 0.8, 0, 2),
      sharpen: clamp(settings.get('sharpen') ?? 0.5, 0, 1),
      brightness: clamp(settings.get('brightness') ?? 1, 0.3, 2),
      reduceFlashes: !!settings.get('reduceFlashes'),
    };
  }

  _disposeTargets() {
    const dispose = (rt) => rt && rt.dispose();
    dispose(this.sceneRT);
    dispose(this.gradeRT);
    (this.bloomDown || []).forEach(dispose);
    (this.bloomUp || []).forEach(dispose);
    dispose(this.shaftA);
    dispose(this.shaftB);
    dispose(this.copyRT);
    dispose(this.glassBlurA);
    dispose(this.glassBlurB);
    dispose(this.aoRT);
    dispose(this.aoBlurRT);
    dispose(this.mbRT);
    this.mbRT = null;
    this.shaftA = this.shaftB = this.copyRT = this.glassBlurA = this.glassBlurB = this.aoRT = this.aoBlurRT = null;
  }

  _resize(renderer) {
    renderer.getDrawingBufferSize(_size);
    const ow = Math.max(1, Math.floor(_size.x)), oh = Math.max(1, Math.floor(_size.y));
    const s = this.renderScale;
    const w = Math.max(1, Math.round(ow * s)), h = Math.max(1, Math.round(oh * s));
    if (!this._sizeDirty && w === this._w && h === this._h && ow === this._ow && oh === this._oh) return;
    this._sizeDirty = false;
    this._w = w;
    this._h = h;
    this._ow = ow;
    this._oh = oh;
    this.renderWidth = w;
    this.renderHeight = h;
    this._disposeTargets();
    const samples = Math.min(this._samples, renderer.capabilities.maxSamples || 0);
    this._msaa = samples;
    this.sceneRT = makeRT(w, h, { depth: true, samples, name: 'dlbScene' });
    if (this._ao || this._mb) {
      // depth as a texture (resolved from the MSAA buffer after the opaque pass, only on
      // frames that use it) for AO / motion blur
      this.sceneRT.depthTexture = new THREE.DepthTexture(w, h);
    }
    if (this._ao) {
      const hw = Math.max(1, Math.ceil(w / 2)), hh = Math.max(1, Math.ceil(h / 2));
      this.aoRT = makeRT(hw, hh, { name: 'dlbAO' });
      this.aoBlurRT = makeRT(hw, hh, { name: 'dlbAOBlur' });
    }
    // display-referred, dithered sRGB: 8 bits are enough (half the bandwidth of HalfFloat)
    this.gradeRT = makeRT(w, h, { ldr: true, name: 'dlbGrade' });
    this.bloomDown = [];
    this.bloomUp = [];
    let bw = Math.max(1, Math.ceil(w / 4)), bh = Math.max(1, Math.ceil(h / 4));
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      this.bloomDown.push(makeRT(bw, bh, { name: 'dlbBloomD' + i }));
      this.bloomUp.push(i < BLOOM_LEVELS - 1 ? makeRT(bw, bh, { name: 'dlbBloomU' + i }) : null);
      bw = Math.max(1, Math.ceil(bw / 2));
      bh = Math.max(1, Math.ceil(bh / 2));
    }
    // shafts / glass targets are allocated on first use
    this.glassUniforms.uResolution.value.set(w, h);
    this.finalUniforms.uRes.value.set(w, h);
    this.outputUniforms.uRes.value.set(ow, oh);
    this.outputUniforms.uTexel.value.set(1 / w, 1 / h);
    if (this._glassUsed) this._ensureGlassRTs();
    this.stats.width = w;
    this.stats.height = h;
  }

  _ensureShaftRTs() {
    if (this.shaftA) return;
    const qw = Math.max(1, Math.ceil(this._w / 4)), qh = Math.max(1, Math.ceil(this._h / 4));
    this.shaftA = makeRT(qw, qh, { name: 'dlbShaftA' });
    this.shaftB = makeRT(qw, qh, { name: 'dlbShaftB' });
  }

  _ensureGlassRTs() {
    this._glassUsed = true;
    const needCopy = !(this._msaa > 0 && !this._rtt);
    if (needCopy && !this.copyRT) this.copyRT = makeRT(this._w, this._h, { name: 'dlbSceneCopy' });
    if (!this.glassBlurA) {
      const qw = Math.max(1, Math.ceil(this._w / 4)), qh = Math.max(1, Math.ceil(this._h / 4));
      this.glassBlurA = makeRT(qw, qh, { name: 'dlbGlassBlurA' });
      this.glassBlurB = makeRT(qw, qh, { name: 'dlbGlassBlurB' });
    }
    // keep the glass uniforms pointing at live textures (Glass.js keys its mode on tSceneColor)
    this.glassUniforms.tSceneColor.value = needCopy ? this.copyRT.texture : this.sceneRT.texture;
    this.glassUniforms.tSceneBlur.value = this.glassBlurA.texture;
  }

  _scanGlass(scene) {
    const list = this._glassList;
    list.length = 0;
    scene.traverseVisible((o) => {
      if ((o.layers.mask & GLASS_BIT) && (o.isMesh || o.isSprite || o.isPoints)) list.push(o);
    });
  }

  /** Any GLASS-layer mesh (from the last scan) inside the view frustum? */
  _glassInView(camera) {
    const list = this._glassList;
    if (!list.length) return false;
    camera.updateMatrixWorld();
    _mat4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_mat4);
    for (const o of list) {
      if (!o.visible || !(o.layers.mask & GLASS_BIT)) continue;
      const g = o.geometry;
      if (!g) return true;
      if (!g.boundingSphere) g.computeBoundingSphere();
      if (!g.boundingSphere) return true;
      _sphere.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
      _sphere.radius += 1.0; // a frame of motion margin
      if (_frustum.intersectsSphere(_sphere)) return true;
    }
    return false;
  }

  /**
   * Shutter fraction for this frame's camera motion blur (0 = no pass, no depth resolve).
   * Driven ONLY by intentional motion: the eye's travel with the vehicle / walking and the
   * player's look (cameraRig yaw / pitch on the vehicle base). Camera shake, head bob,
   * breathing and engine tremor (camfx), jumpscare jolts and lean are excluded; cinematic
   * shots, paused frames and cuts / teleports (> 1 m or > 30 deg in a frame) give none.
   * A dead zone with hysteresis and smoothing keeps stills and slow motion sharp. Fills
   * _vp (real camera) and _vpI (intentional camera) for the pass.
   */
  _motionBlurAmount(camera, dt) {
    if (!camera.isPerspectiveCamera) return 0;
    camera.updateMatrixWorld();
    _vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    // intentional camera: eye position (no lean / camfx offsets) + look on the vehicle base
    const rig = cameraRig;
    if (rig?.eye) {
      rig.eye.getWorldPosition(_iPos);
      if (rig.base) rig.base.getWorldQuaternion(_iQuat);
      else _iQuat.identity();
      _e.set(rig.pitch || 0, rig.yaw || 0, 0, 'YXZ');
      _iQuat.multiply(_q.setFromEuler(_e));
    } else {
      _iPos.setFromMatrixPosition(camera.matrixWorld);
      _iQuat.setFromRotationMatrix(camera.matrixWorld);
    }
    _iMat.compose(_iPos, _iQuat, _one).invert();
    _vpI.multiplyMatrices(camera.projectionMatrix, _iMat);
    const had = this._mbHasPrev;
    const move = had ? _iPos.distanceTo(this._prevPos) : 0;
    const ang = had ? this._prevQuat.angleTo(_iQuat) : 0;
    const cine = (rig?.cineBlend ?? 0) > 0.001;
    const cut = move > 1 || ang > Math.PI / 6;
    if (!this._mb || !had || cut || cine || !this.sceneRT.depthTexture || !(dt > 0) || !this.clock.valid) {
      if (cut || cine || !(dt > 0)) {
        this._mbSmooth = 0;
        this._mbOn = false;
      }
      return 0;
    }
    const fovY = THREE.MathUtils.degToRad(camera.fov || 60);
    // largest on-screen motion this frame, in 1080p pixels: look rotation, or travel seen at ~6 m
    const px = Math.max(ang / fovY, move / (6 * 2 * Math.tan(fovY / 2))) * 1080;
    // smoothing (no single-frame spikes) + hysteresis around the dead zone
    this._mbSmooth = (this._mbSmooth || 0) + (Math.min(px, 160) - (this._mbSmooth || 0)) * 0.35;
    const sm = this._mbSmooth;
    if (!this._mbOn && sm > 14) this._mbOn = true;
    else if (this._mbOn && sm < 9) this._mbOn = false;
    if (!this._mbOn) return 0;
    // shutter: ~1/70 s of exposure (0.85 of a 60 fps frame, ~2.5x the old blur), whatever the frame rate
    const shutter = clamp(0.014 / Math.max(this.clock.ms / 1000, 1e-3), 0, 1);
    return shutter * THREE.MathUtils.smoothstep(sm, 9, 26);
  }

  render(renderer, scene, camera, dt = 1 / 60) {
    if (!this._built) this._build(renderer);
    if (this._settingsDirty) this._readSettings();
    // ---- frame timing -> dynamic resolution / first-run auto quality --------------------
    const valid = this.clock.tick();
    const ms = this.clock.ms;
    this.autoQuality.frame(ms, valid);
    const scale = this.dynamic.update(ms, valid);
    if (scale !== this.renderScale) {
      this.renderScale = scale;
      this._sizeDirty = true;
    }
    this._resize(renderer);
    this.stats.passes = 0;
    this.stats.renderScale = this.renderScale;
    this.stats.frameMs = ms;
    this._frame++;
    const P = this.params;
    const cfg = this.cfg;
    const sky = this.sky;
    const grade = sky?.grade;

    if (!this.enabled) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }
    const prevAutoClear = renderer.autoClear;
    // ---- 1. opaque scene -----------------------------------------------------------
    const mask = camera.layers.mask;
    camera.layers.mask = mask & ~GLASS_BIT;
    renderer.autoClear = true;
    if (sky) sky.uniforms.uSkyAlpha.value = 0;
    const mbK = this._motionBlurAmount(camera, dt);
    this.sceneRT.resolveDepthBuffer = !!this.sceneRT.depthTexture && (!!this.aoRT || mbK > 0);
    renderer.setRenderTarget(this.sceneRT);
    renderer.render(scene, camera);
    this.sceneRT.resolveDepthBuffer = false; // the glass pass never re-resolves depth
    if (sky) sky.uniforms.uSkyAlpha.value = 1;
    camera.layers.mask = mask;

    // ---- 1b. half-res ambient occlusion from the opaque depth (before glass) -------------
    const doAO = !!(this.aoRT && camera.isPerspectiveCamera);
    if (doAO) {
      const a = this.matAO.uniforms;
      const pm = camera.projectionMatrix.elements;
      a.tDepth.value = this.sceneRT.depthTexture;
      a.uTexel.value.set(1 / this._w, 1 / this._h);
      a.uProjInv.value.set(1 / pm[0], 1 / pm[5]);
      a.uNear.value = camera.near;
      a.uFar.value = camera.far;
      a.uPxPerM.value = pm[5] * 0.5 * this._h;
      this._pass(renderer, this.matAO, this.aoRT);
      this.matAOBlur.uniforms.tAO.value = this.aoRT.texture;
      this.matAOBlur.uniforms.uTexel.value.set(1 / this.aoRT.width, 1 / this.aoRT.height);
      this._pass(renderer, this.matAOBlur, this.aoBlurRT);
    }

    // ---- 2. glass (only while a glass pane is in view) --------------------------------
    let doGlass = this.glass === true;
    if (this.glass === 'auto') {
      if (this._frame % 30 === 1) this._scanGlass(scene);
      if (this._glassInView(camera)) this._glassHold = 10;
      else this._glassHold = Math.max(0, this._glassHold - 1);
      doGlass = this._glassHold > 0;
    }
    this.stats.glass = doGlass;
    const w = this._w, h = this._h;
    if (doGlass) {
      this._ensureGlassRTs();
      let src = this.sceneRT.texture;
      if (this.copyRT) {
        this.matCopy.uniforms.tSrc.value = src;
        this._pass(renderer, this.matCopy, this.copyRT);
        src = this.copyRT.texture;
      }
      // quarter-res blur for frosted / fogged glass
      this.matDown.uniforms.tSrc.value = src;
      this.matDown.uniforms.uTexel.value.set(2 / w, 2 / h);
      this.matDown.uniforms.uKaris.value = 1;
      this.matDown.uniforms.uClampMax.value = 30;
      this._pass(renderer, this.matDown, this.glassBlurA);
      const g = this.matGauss.uniforms;
      for (let it = 0; it < 2; it++) {
        g.tSrc.value = this.glassBlurA.texture;
        g.uDir.value.set((1.2 + it) / this.glassBlurA.width, 0);
        this._pass(renderer, this.matGauss, this.glassBlurB);
        g.tSrc.value = this.glassBlurB.texture;
        g.uDir.value.set(0, (1.2 + it) / this.glassBlurA.height);
        this._pass(renderer, this.matGauss, this.glassBlurA);
      }
      const bg = scene.background;
      const smAuto = renderer.shadowMap.autoUpdate;
      scene.background = null;
      renderer.shadowMap.autoUpdate = false;
      renderer.autoClear = false;
      camera.layers.set(LAYERS.GLASS);
      renderer.setRenderTarget(this.sceneRT);
      renderer.render(scene, camera);
      camera.layers.mask = mask;
      renderer.autoClear = true;
      renderer.shadowMap.autoUpdate = smAuto;
      scene.background = bg;
    }
    renderer.autoClear = true;

    // ---- 2b. camera motion blur (fast motion only; stills and slow motion stay sharp) ---------
    let sceneTex = this.sceneRT.texture;
    if (mbK > 0) {
      if (!this.mbRT) this.mbRT = makeRT(w, h, { name: 'dlbMotion' });
      const m = this.matMB.uniforms;
      m.tColor.value = this.sceneRT.texture;
      m.tDepth.value = this.sceneRT.depthTexture;
      m.uInvViewProj.value.copy(_vp).invert();
      m.uCurViewProj.value.copy(_vpI);
      m.uPrevViewProj.value.copy(this._prevVP);
      m.uTexel.value.set(1 / w, 1 / h);
      m.uScale.value = mbK;
      m.uMaxPx.value = 60 * (h / 1080); // per-frame clamp
      m.uNear.value = camera.near;
      m.uFar.value = camera.far;
      this._pass(renderer, this.matMB, this.mbRT);
      sceneTex = this.mbRT.texture;
    }
    this.stats.motionBlur = mbK > 0;
    if (camera.isPerspectiveCamera) {
      this._prevVP.copy(_vpI);
      this._prevPos.copy(_iPos);
      this._prevQuat.copy(_iQuat);
      this._mbHasPrev = true;
    }

    const exposure = (grade?.exposure ?? 1.6) * P.exposure * Math.pow(cfg.brightness, 1.4);
    const ou = this.outputUniforms;
    const fu = this.finalUniforms;

    // ---- 3. bloom (from quarter resolution) ---------------------------------------------
    const bloomAmt = cfg.bloom * P.bloom;
    const needBloomChain = bloomAmt > 0.001 || P.blur > 0.001;
    if (needBloomChain) {
      let src = sceneTex, sw = w, sh = h;
      const d = this.matDown.uniforms;
      for (let i = 0; i < BLOOM_LEVELS; i++) {
        // level 0 reads the full-size frame into 1/4: the 13 taps at source-texel spacing
        // cover the whole 4x4 footprint (+ a 1 px ring), so small lights never alias
        d.tSrc.value = src;
        d.uTexel.value.set(1 / sw, 1 / sh);
        d.uKaris.value = i === 0 ? 1 : 0;
        d.uClampMax.value = 300;
        this._pass(renderer, this.matDown, this.bloomDown[i]);
        src = this.bloomDown[i].texture;
        sw = this.bloomDown[i].width;
        sh = this.bloomDown[i].height;
      }
      const u = this.matUp.uniforms;
      u.uScatter.value = 0.72;
      let low = this.bloomDown[BLOOM_LEVELS - 1];
      for (let i = BLOOM_LEVELS - 2; i >= 0; i--) {
        u.tLow.value = low.texture;
        u.tHigh.value = this.bloomDown[i].texture;
        u.uTexel.value.set(1 / low.width, 1 / low.height);
        this._pass(renderer, this.matUp, this.bloomUp[i]);
        low = this.bloomUp[i];
      }
    }

    // ---- 4. light shafts: god rays from the sun at dawn, moonlight shafts at night --------------
    //      (screen-space, occluded by everything that is not sky -> rays through the canopy)
    let shafts = 0;
    const useSun = sky && sky.sunVisibility > 0.01;
    const useMoon = sky && !useSun && this.moonShafts > 0 && sky.moonVisibility > 0.02;
    if (useSun || useMoon) {
      const ldir = useSun ? sky.sunDir : sky.moonDir;
      _v3.copy(ldir).multiplyScalar(1000).add(camera.position).project(camera);
      const facing = camera.getWorldDirection(_dir).dot(ldir);
      if (facing > 0.05) {
        const sx = _v3.x * 0.5 + 0.5, sy = _v3.y * 0.5 + 0.5;
        const onScreen = 1 - clamp((Math.max(Math.abs(sx - 0.5), Math.abs(sy - 0.5)) - 0.5) / 0.6, 0, 1);
        const fogK = 0.65 + clamp(GLOBAL_UNIFORMS.uFogDensity.value * 16, 0, 0.8);
        // subtle; no moon shafts over the cabin (glass in view = sitting in the taxi)
        const moonK = doGlass ? 0 : 0.14;
        shafts = (useSun ? sky.sunVisibility * 0.7 : sky.moonVisibility * moonK * this.moonShafts) * onScreen * clamp(facing * 2, 0, 1) * fogK * this.shaftStrength;
        if (shafts > 0.01) {
          this._ensureShaftRTs();
          const m = this.matShaftMask.uniforms;
          m.tSrc.value = this.sceneRT.texture;
          m.uSun.value.set(sx, sy);
          m.uAspect.value = w / h;
          m.uThreshold.value = (useSun ? 0.35 : 0.08) / Math.max(exposure, 0.2);
          this._pass(renderer, this.matShaftMask, this.shaftA);
          const b = this.matShaftBlur.uniforms;
          b.uSun.value.set(sx, sy);
          b.tSrc.value = this.shaftA.texture;
          b.uLength.value = 0.85;
          b.uJitter.value = 1;
          this._pass(renderer, this.matShaftBlur, this.shaftB);
          // second pass smooths the first one's jitter instead of adding its own pattern
          // (the quarter-res dither otherwise shows as fine diagonal hatching in the haze)
          b.tSrc.value = this.shaftB.texture;
          b.uLength.value = 0.35;
          b.uJitter.value = 0;
          this._pass(renderer, this.matShaftBlur, this.shaftA);
        }
      }
    }
    this.stats.shafts = shafts > 0.01;

    // ---- 5. grade -> 8-bit ---------------------------------------------------------------------
    fu.tScene.value = sceneTex;
    fu.tBloom.value = needBloomChain ? this.bloomUp[0].texture : this._black;
    fu.tBlur.value = needBloomChain ? this.bloomUp[0].texture : this._black;
    fu.tShafts.value = shafts > 0.01 ? this.shaftA.texture : this._black;
    fu.tAO.value = doAO ? this.aoBlurRT.texture : this._white;
    fu.uAO.value = doAO ? 0.85 : 0;
    fu.uDirt.value = 0; // owner: no lens-dirt specks on screen
    fu.uTime.value = (fu.uTime.value + dt) % 1000;
    fu.uExposure.value = exposure;
    fu.uSaturation.value = (grade?.saturation ?? 1) * P.saturation;
    fu.uContrast.value = (grade?.contrast ?? 1) * P.contrast;
    fu.uTemperature.value = (grade?.temperature ?? 0) + P.temperature;
    fu.uTint.value = grade?.tint ?? 0;
    if (grade) {
      fu.uLift.value.copy(grade.lift);
      fu.uGain.value.copy(grade.gain);
      fu.uShadowTint.value.copy(grade.shadowTint);
      fu.uHighTint.value.copy(grade.highlightTint);
      fu.uSplit.value = grade.split;
      // practical-light colour at night (fades out through dawn)
      fu.uHiSat.value = 0.22 * (1 - clamp((sky.hour - 28.4) / 1.0, 0, 1));
    } else {
      fu.uLift.value.set(0, 0, 0);
      fu.uSplit.value = 0;
      fu.uHiSat.value = 0;
    }
    // brightness setting also lifts the deepest shadows a touch
    const lb = Math.max(0, cfg.brightness - 1) * 0.02;
    fu.uLift.value.addScalar(lb);
    fu.uColorMul.value.copy(P.tint);
    fu.uBloom.value = clamp(bloomAmt * 0.04, 0, 0.3); // a touch of glow, no halos smearing the lamps
    fu.uShafts.value = shafts * 1.6;
    if (sky) fu.uShaftCol.value.copy(useSun ? sky.sunColor : sky.moonColor);
    fu.uHorror.value = P.horror;
    fu.uAmulet.value = P.amulet;
    fu.uBlur.value = P.blur;
    fu.uDistortion.value = P.distortion;
    const fl = this._flash;
    if (fl.t > 0) {
      fl.t = Math.max(0, fl.t - dt);
      const k = fl.t / fl.dur;
      fu.uFlash.value.set(fl.color.r, fl.color.g, fl.color.b, k * k * (cfg.reduceFlashes ? 0.25 : 1) * 2.0 / Math.max(exposure, 0.3));
    } else fu.uFlash.value.w = 0;
    this._pass(renderer, this.matFinal, this.gradeRT);

    // ---- 6. output: (FXAA-lite) + contrast-adaptive sharpening / upscale + blood / fade --------
    ou.tSrc.value = this.gradeRT.texture;
    ou.uTime.value = fu.uTime.value;
    // below full resolution the sharpening also restores the upscaled detail
    const upSharp = (1 - this.renderScale) * 0.8;
    ou.uSharp.value = clamp((cfg.sharpen * (P.sharpen ?? 1) + upSharp) * (1 - clamp(P.blur, 0, 1)), 0, 1);
    ou.uGrain.value = FILM_GRAIN * (P.grain ?? 1);
    ou.uFade.value = P.fade;
    ou.uFadeColor.value.copy(P.fadeColor).convertLinearToSRGB();
    ou.uLetterbox.value = P.letterbox;
    {
      const b = this._blood;
      b.age += dt;
      const env = b.age < 1.5 ? 1 : Math.max(0, 1 - (b.age - 1.5) / 5);
      let amt = Math.max(clamp(P.blood ?? 0, 0, 1), b.splash * env);
      if (amt <= 0.001) b.splash = 0;
      // runs keep sliding while blood is on screen; a fresh splatter restarts them
      b.runT = amt > 0.001 ? b.runT + dt : 0;
      amt *= GORE_UNIFORM.value > 0.5 ? 0.7 : 1;
      ou.uBlood.value = amt;
      ou.uBloodSeed.value = b.seed * 97.0;
      ou.uBloodRun.value = 1 - Math.exp(-b.runT * 0.35);
    }
    this._pass(renderer, this._msaa > 0 ? this.matOutput : this.matOutputFxaa, null);
    if (this.debugView) {
      const tex = { shafts: this.shaftA?.texture, bloom: this.bloomUp[0]?.texture, scene: this.sceneRT.texture, grade: this.gradeRT.texture }[this.debugView];
      if (tex) {
        this.matCopy.uniforms.tSrc.value = tex;
        this._pass(renderer, this.matCopy, null);
      }
    }
    renderer.autoClear = prevAutoClear;
  }
}

export const postfx = new PostFX();
