// PostFX — final image pipeline.
//
//  scene (layers minus GLASS) -> HalfFloat RT (MSAA 4x high/ultra, 2x medium; foliage
//     uses alpha-to-coverage) at the full drawing-buffer resolution
//  -> [glass present] copy colour (tSceneColor) + quarter-res blur (tSceneBlur)
//     -> GLASS layer rendered on top (depth tested) into the same RT
//  -> painterly (Kuwahara: small-radius anisotropic at FULL res on high, 8-sector/half-res
//     on medium, 4-quadrant/half-res on low). Subtle by design: it is only blended in on
//     flat tonal areas (edge / detail mask in the grade), so texture detail, foliage
//     edges, text and faces stay crisp.
//  -> bloom mip chain (13-tap down / tent up) -> light shafts at dawn (quarter res)
//  -> grade (exposure, WB, ACES, lift/gamma/gain, split tone, contrast, saturation,
//     vignette, CA at the lens edges, horror, amulet, blur, distortion, flash) -> sRGB
//  -> output: FXAA-lite (low preset only, no MSAA) + contrast-adaptive sharpening
//     (settings.sharpen, default 0.5) + canvas texture, fine film grain, fade,
//     letterbox, dither -> screen.
import * as THREE from 'three';
import { LAYERS } from '../core/layers.js';
import { settings } from '../core/Settings.js';
import { bus } from '../core/Events.js';
import { clamp } from '../core/math.js';
import { FS_VERT, TENSOR_FRAG, GAUSS_FRAG, KUWAHARA8_FRAG, KUWAHARA4_FRAG } from './Painterly.js';
import { COPY_FRAG, BLOOM_DOWN_FRAG, BLOOM_UP_FRAG, SHAFT_MASK_FRAG, SHAFT_BLUR_FRAG, FINAL_FRAG, OUTPUT_FRAG } from './PostShaders.js';
import { canvasTexture } from './noiseTex.js';
import { GORE_UNIFORM } from './Blood.js';

const GLASS_BIT = 1 << LAYERS.GLASS;
const BLOOM_LEVELS = 6;
const MSAA_BY_PRESET = { low: 0, medium: 2, high: 4, ultra: 4 };
/** settings.painterly (0..1, default 0.75) -> blend strength of the paint layer (kept subtle). */
const paintCurve = (v) => Math.pow(clamp(v, 0, 1), 1.25) * 0.6;

function makeRT(w, h, opts = {}) {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: !!opts.depth,
    stencilBuffer: false,
    samples: opts.samples || 0,
    generateMipmaps: false,
  });
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

class PostFX {
  constructor() {
    /**
     * Animatable by gameplay. Multipliers (1 = the player's settings / the hour's grade):
     *   exposure, painterly, bloom, grain, vignette, chroma, sharpen, saturation, contrast, tint (Color multiply).
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
    /** debug: 'shafts' | 'paint' | 'bloom' | 'tensor' | 'scene' shows that buffer raw */
    this.debugView = null;
    /** 'auto' (scan the scene for GLASS-layer meshes every 30 frames) | true | false */
    this.glass = 'auto';
    this.sky = null; // set by installRendering (grade targets, sun for shafts)
    this._hasGlass = false;
    this._frame = 0;
    this._flash = { color: new THREE.Color(), t: 0, dur: 1 };
    this._blood = { splash: 0, age: 99, seed: Math.random(), runT: 0, last: 0 };
    this._w = 0;
    this._h = 0;
    this._quality = null;
    this._samples = -1;
    this._built = false;
    this._settingsDirty = true;
    this.stats = { passes: 0 };
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

  _build() {
    this._built = true;
    const quadGeo = new THREE.BufferGeometry();
    quadGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    quadGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this._quad = new THREE.Mesh(quadGeo);
    this._quad.frustumCulled = false;
    this._cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.matCopy = passMaterial(COPY_FRAG, { tSrc: { value: null } });
    this.matGauss = passMaterial(GAUSS_FRAG, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.matTensor = passMaterial(TENSOR_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uEnc: { value: 1 } });
    const kU = () => ({
      tSrc: { value: null }, tTensor: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 4 },
      uHardness: { value: 8 }, uSharpness: { value: 8 }, uAlpha: { value: 1 }, uEnc: { value: 1 },
    });
    this.matKuwaAniso = passMaterial(KUWAHARA8_FRAG, kU(), { ANISO: '' });
    this.matKuwa8 = passMaterial(KUWAHARA8_FRAG, kU());
    this.matKuwa4 = passMaterial(KUWAHARA4_FRAG, kU());
    this.matDown = passMaterial(BLOOM_DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uKaris: { value: 0 }, uClampMax: { value: 400 } });
    this.matUp = passMaterial(BLOOM_UP_FRAG, { tLow: { value: null }, tHigh: { value: null }, uTexel: { value: new THREE.Vector2() }, uScatter: { value: 0.7 } });
    this.matShaftMask = passMaterial(SHAFT_MASK_FRAG, { tSrc: { value: null }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uThreshold: { value: 0.8 } });
    this.matShaftBlur = passMaterial(SHAFT_BLUR_FRAG, { tSrc: { value: null }, uSun: { value: new THREE.Vector2() }, uLength: { value: 0.6 }, uJitter: { value: 1 } });
    const fu = {
      tScene: { value: null }, tPaint: { value: null }, tBloom: { value: null }, tBlur: { value: null }, tShafts: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uPaint: { value: 0 },
      uExposure: { value: 1 }, uSaturation: { value: 1 }, uContrast: { value: 1 }, uTemperature: { value: 0 }, uTint: { value: 0 },
      uLift: { value: new THREE.Vector3() }, uGamma: { value: new THREE.Vector3(1, 1, 1) }, uGain: { value: new THREE.Vector3(1, 1, 1) },
      uShadowTint: { value: new THREE.Color(1, 1, 1) }, uHighTint: { value: new THREE.Color(1, 1, 1) }, uSplit: { value: 0 },
      uColorMul: { value: new THREE.Color(1, 1, 1) },
      uBloom: { value: 0.05 }, uShafts: { value: 0 }, uShaftCol: { value: new THREE.Color() },
      uVignette: { value: 0.6 }, uChroma: { value: 0.3 },
      uHorror: { value: 0 }, uAmulet: { value: 0 }, uBlur: { value: 0 }, uDistortion: { value: 0 },
      uFlash: { value: new THREE.Vector4() },
    };
    this.finalUniforms = fu;
    this.matFinal = passMaterial(FINAL_FRAG, fu, { PAINT: '' });
    this.matFinalNoPaint = passMaterial(FINAL_FRAG, fu);
    const ou = {
      tSrc: { value: null }, tPaint: { value: null }, tCanvas: { value: canvasTexture() },
      uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uSharp: { value: 0.5 }, uCanvas: { value: 0 }, uPaintDir: { value: 0 },
      uGrain: { value: 0.35 }, uFade: { value: 0 }, uFadeColor: { value: new THREE.Color() }, uLetterbox: { value: 0 },
      uBlood: { value: 0 }, uBloodSeed: { value: 0 }, uBloodRun: { value: 0 }, uGore: GORE_UNIFORM,
    };
    this.outputUniforms = ou;
    this.matOutput = passMaterial(OUTPUT_FRAG, ou);
    this.matOutputFxaa = passMaterial(OUTPUT_FRAG, ou, { FXAA: '' });
    this._black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this._black.needsUpdate = true;
  }

  _pass(renderer, material, target) {
    this._quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this._quad, this._cam);
    this.stats.passes++;
  }

  _readSettings() {
    this._settingsDirty = false;
    const q = settings.get('painterlyQuality') || 'medium';
    const preset = settings.get('graphicsPreset') || 'high';
    const samples = MSAA_BY_PRESET[preset] ?? 4;
    if (q !== this._quality || samples !== this._samples) {
      this._quality = q;
      this._samples = samples;
      this._sizeDirty = true;
    }
    this.cfg = {
      painterly: clamp(settings.get('painterly') ?? 0.75, 0, 1),
      bloom: clamp(settings.get('bloom') ?? 0.8, 0, 2),
      grain: clamp(settings.get('filmGrain') ?? 0.35, 0, 1),
      chroma: clamp(settings.get('chromaticAberration') ?? 0.3, 0, 1),
      vignette: clamp(settings.get('vignette') ?? 0.6, 0, 1),
      sharpen: clamp(settings.get('sharpen') ?? 0.5, 0, 1),
      brightness: clamp(settings.get('brightness') ?? 1, 0.3, 2),
      reduceFlashes: !!settings.get('reduceFlashes'),
    };
  }

  _resize(renderer) {
    renderer.getDrawingBufferSize(_size);
    const w = Math.max(1, Math.floor(_size.x)), h = Math.max(1, Math.floor(_size.y));
    if (!this._sizeDirty && w === this._w && h === this._h) return;
    this._sizeDirty = false;
    this._w = w;
    this._h = h;
    const dispose = (rt) => rt && rt.dispose();
    dispose(this.sceneRT);
    dispose(this.copyRT);
    dispose(this.glassBlurA);
    dispose(this.glassBlurB);
    dispose(this.tensorRT);
    dispose(this.tensorBlurRT);
    dispose(this.paintRT);
    dispose(this.gradeRT);
    dispose(this.shaftA);
    dispose(this.shaftB);
    (this.bloomDown || []).forEach(dispose);
    (this.bloomUp || []).forEach(dispose);
    const caps = renderer.capabilities;
    const samples = Math.min(this._samples, caps.maxSamples || 0);
    this.sceneRT = makeRT(w, h, { depth: true, samples, name: 'dlbScene' });
    this._msaa = samples;
    this.gradeRT = makeRT(w, h, { name: 'dlbGrade' });
    this.copyRT = null; // allocated on demand (glass)
    const q = this._quality;
    // high: full resolution (small-radius anisotropic filter); medium / low: half resolution
    const pdiv = q === 'high' ? 1 : 2;
    const pw = Math.ceil(w / pdiv), ph = Math.ceil(h / pdiv);
    this.paintRT = makeRT(pw, ph, { name: 'dlbPaint' });
    this.tensorRT = q === 'high' ? makeRT(Math.ceil(w / 2), Math.ceil(h / 2), { name: 'dlbTensor' }) : null;
    this.tensorBlurRT = q === 'high' ? makeRT(Math.ceil(w / 2), Math.ceil(h / 2), { name: 'dlbTensor2' }) : null;
    this.bloomDown = [];
    this.bloomUp = [];
    let bw = w, bh = h;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      bw = Math.max(1, Math.ceil(bw / 2));
      bh = Math.max(1, Math.ceil(bh / 2));
      this.bloomDown.push(makeRT(bw, bh, { name: 'dlbBloomD' + i }));
      this.bloomUp.push(i < BLOOM_LEVELS - 1 ? makeRT(bw, bh, { name: 'dlbBloomU' + i }) : null);
    }
    this.shaftA = makeRT(Math.ceil(w / 4), Math.ceil(h / 4), { name: 'dlbShaftA' });
    this.shaftB = makeRT(Math.ceil(w / 4), Math.ceil(h / 4), { name: 'dlbShaftB' });
    this.glassUniforms.uResolution.value.set(w, h);
    this.finalUniforms.uRes.value.set(w, h);
    this.outputUniforms.uRes.value.set(w, h);
  }

  _ensureGlassRTs() {
    if (this.copyRT && this.copyRT.width === this._w && this.copyRT.height === this._h) return;
    this.copyRT?.dispose();
    this.glassBlurA?.dispose();
    this.glassBlurB?.dispose();
    this.copyRT = makeRT(this._w, this._h, { name: 'dlbSceneCopy' });
    const qw = Math.ceil(this._w / 4), qh = Math.ceil(this._h / 4);
    this.glassBlurA = makeRT(qw, qh, { name: 'dlbGlassBlurA' });
    this.glassBlurB = makeRT(qw, qh, { name: 'dlbGlassBlurB' });
  }

  _scanGlass(scene) {
    let found = false;
    scene.traverseVisible((o) => {
      if (!found && (o.layers.mask & GLASS_BIT) && (o.isMesh || o.isSprite || o.isPoints)) found = true;
    });
    this._hasGlass = found;
  }

  render(renderer, scene, camera, dt = 1 / 60) {
    if (!this._built) this._build();
    if (this._settingsDirty) this._readSettings();
    this._resize(renderer);
    this.stats.passes = 0;
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
    renderer.setRenderTarget(this.sceneRT);
    renderer.render(scene, camera);
    if (sky) sky.uniforms.uSkyAlpha.value = 1;
    camera.layers.mask = mask;

    // ---- 2. glass ------------------------------------------------------------------
    if (this.glass === 'auto' && this._frame % 30 === 1) this._scanGlass(scene);
    const doGlass = this.glass === true || (this.glass === 'auto' && this._hasGlass);
    if (doGlass) {
      this._ensureGlassRTs();
      this.matCopy.uniforms.tSrc.value = this.sceneRT.texture;
      this._pass(renderer, this.matCopy, this.copyRT);
      // quarter-res blur for frosted / fogged glass
      this.matDown.uniforms.tSrc.value = this.copyRT.texture;
      this.matDown.uniforms.uTexel.value.set(1 / this._w, 1 / this._h).multiplyScalar(2);
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
      this.glassUniforms.tSceneColor.value = this.copyRT.texture;
      this.glassUniforms.tSceneBlur.value = this.glassBlurA.texture;
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

    const exposure = (grade?.exposure ?? 1.6) * P.exposure * Math.pow(cfg.brightness, 1.4);
    // ---- 3. painterly ------------------------------------------------------------------
    const paint = clamp(paintCurve(cfg.painterly) * P.painterly, 0, 1);
    const ou = this.outputUniforms;
    const fu = this.finalUniforms;
    const w = this._w, h = this._h;
    if (paint > 0.001) {
      const q = this._quality;
      const hs = h / 1080;
      let mat;
      if (q === 'high') {
        // structure tensor at half res, smoothed
        const t = this.matTensor.uniforms;
        t.tSrc.value = this.sceneRT.texture;
        t.uTexel.value.set(2 / w, 2 / h);
        t.uEnc.value = exposure;
        this._pass(renderer, this.matTensor, this.tensorRT);
        const g = this.matGauss.uniforms;
        g.tSrc.value = this.tensorRT.texture;
        g.uDir.value.set(1.2 / this.tensorRT.width, 0);
        this._pass(renderer, this.matGauss, this.tensorBlurRT);
        g.tSrc.value = this.tensorBlurRT.texture;
        g.uDir.value.set(0, 1.2 / this.tensorRT.height);
        this._pass(renderer, this.matGauss, this.tensorRT);
        mat = this.matKuwaAniso;
        mat.uniforms.tTensor.value = this.tensorRT.texture;
        // full-res, small radius: strokes follow contours without eating detail
        mat.uniforms.uRadius.value = clamp(3.5 * hs, 2.0, 4.5);
        mat.uniforms.uTexel.value.set(1 / this.paintRT.width, 1 / this.paintRT.height);
        ou.uPaintDir.value = 1;
      } else if (q === 'medium') {
        mat = this.matKuwa8;
        mat.uniforms.uRadius.value = clamp(2.5 * hs, 1.5, 3);
        mat.uniforms.uTexel.value.set(1 / this.paintRT.width, 1 / this.paintRT.height);
        ou.uPaintDir.value = 0;
      } else {
        mat = this.matKuwa4;
        mat.uniforms.uRadius.value = clamp(2.0 * hs, 1.0, 2);
        mat.uniforms.uTexel.value.set(1 / this.paintRT.width, 1 / this.paintRT.height);
        ou.uPaintDir.value = 0;
      }
      mat.uniforms.tSrc.value = this.sceneRT.texture;
      mat.uniforms.uEnc.value = exposure;
      mat.uniforms.uHardness.value = 9;
      mat.uniforms.uSharpness.value = 8;
      this._pass(renderer, mat, this.paintRT);
    }

    // ---- 4. bloom ------------------------------------------------------------------------
    const bloomAmt = cfg.bloom * P.bloom;
    const needBloomChain = bloomAmt > 0.001 || P.blur > 0.001;
    if (needBloomChain) {
      let src = this.sceneRT.texture, sw = w, sh = h;
      const d = this.matDown.uniforms;
      for (let i = 0; i < BLOOM_LEVELS; i++) {
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

    // ---- 5. light shafts (sun at dawn) ----------------------------------------------------
    let shafts = 0;
    if (sky && sky.sunVisibility > 0.01) {
      _v3.copy(sky.sunDir).multiplyScalar(1000).add(camera.position).project(camera);
      const facing = camera.getWorldDirection(_dir).dot(sky.sunDir);
      if (facing > 0.05) {
        const sx = _v3.x * 0.5 + 0.5, sy = _v3.y * 0.5 + 0.5;
        const onScreen = 1 - clamp((Math.max(Math.abs(sx - 0.5), Math.abs(sy - 0.5)) - 0.5) / 0.6, 0, 1);
        shafts = sky.sunVisibility * onScreen * clamp(facing * 2, 0, 1);
        if (shafts > 0.01) {
          const m = this.matShaftMask.uniforms;
          m.tSrc.value = this.sceneRT.texture;
          m.uSun.value.set(sx, sy);
          m.uAspect.value = w / h;
          m.uThreshold.value = 0.35 / Math.max(exposure, 0.2);
          this._pass(renderer, this.matShaftMask, this.shaftA);
          const b = this.matShaftBlur.uniforms;
          b.uSun.value.set(sx, sy);
          b.tSrc.value = this.shaftA.texture;
          b.uLength.value = 0.85;
          this._pass(renderer, this.matShaftBlur, this.shaftB);
          b.tSrc.value = this.shaftB.texture;
          b.uLength.value = 0.35;
          this._pass(renderer, this.matShaftBlur, this.shaftA);
        }
      }
    }

    // ---- 6. final ------------------------------------------------------------------------------
    fu.tScene.value = this.sceneRT.texture;
    fu.tPaint.value = this.paintRT.texture;
    fu.tBloom.value = needBloomChain ? this.bloomUp[0].texture : this._black;
    fu.tBlur.value = needBloomChain ? this.bloomUp[1].texture : this._black;
    fu.tShafts.value = shafts > 0.01 ? this.shaftA.texture : this._black;
    fu.uTime.value = (fu.uTime.value + dt) % 1000;
    fu.uPaint.value = paint;
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
    } else {
      fu.uLift.value.set(0, 0, 0);
      fu.uSplit.value = 0;
    }
    // brightness setting also lifts the deepest shadows a touch
    const lb = Math.max(0, cfg.brightness - 1) * 0.02;
    fu.uLift.value.addScalar(lb);
    fu.uColorMul.value.copy(P.tint);
    fu.uBloom.value = clamp(bloomAmt * 0.075, 0, 0.5);
    fu.uShafts.value = shafts * 1.6;
    if (sky) fu.uShaftCol.value.copy(sky.sunColor);
    fu.uVignette.value = cfg.vignette * P.vignette;
    fu.uChroma.value = cfg.chroma * P.chroma;
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
    this._pass(renderer, paint > 0.001 ? this.matFinal : this.matFinalNoPaint, this.gradeRT);

    // ---- 7. output: (FXAA-lite) + contrast-adaptive sharpening + canvas / grain / fade --------
    ou.tSrc.value = this.gradeRT.texture;
    ou.tPaint.value = this.paintRT.texture;
    ou.uTime.value = fu.uTime.value;
    ou.uSharp.value = clamp(cfg.sharpen * (P.sharpen ?? 1) * (1 - clamp(P.blur, 0, 1)), 0, 1);
    ou.uCanvas.value = paint > 0.001 ? 0.35 + paint * 0.9 : 0;
    ou.uGrain.value = cfg.grain * P.grain;
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
      const tex = { shafts: this.shaftA.texture, paint: this.paintRT.texture, bloom: this.bloomUp[0]?.texture, tensor: this.tensorRT?.texture, scene: this.sceneRT.texture, grade: this.gradeRT.texture }[this.debugView];
      if (tex) {
        this.matCopy.uniforms.tSrc.value = tex;
        this._pass(renderer, this.matCopy, null);
      }
    }
    renderer.autoClear = prevAutoClear;
  }
}

export const postfx = new PostFX();
