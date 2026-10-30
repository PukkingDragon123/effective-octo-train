// The engine owns the renderer, the scene, the main first-person camera and the
// frame loop. Every system registers an update callback with an `order`:
//
//   -100 input            0 game logic / directors     10 vehicle physics
//     20 characters/anim  40 world streaming          50 camera rig
//     60 audio listener   80 particles                90 pre-render (mirrors)
//
// Rendering goes through `engine.renderPipeline` (installed by render/PostFX.js);
// the fallback is a plain renderer.render.
import * as THREE from 'three';
import { LAYERS } from './layers.js';
import { input } from './Input.js';
import { settings } from './Settings.js';
import { bus } from './Events.js';

class Engine {
  constructor() {
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.container = null;
    this.updates = [];
    this.preRender = [];
    this.time = 0; // seconds since start (scaled)
    this.realTime = 0; // unscaled
    this.dt = 0;
    this.frame = 0;
    this.timeScale = 1;
    this.paused = false; // gameplay paused (menus) - updates with `always:true` still run
    this.running = false;
    this.renderPipeline = null; // (renderer, scene, camera, dt) => void
    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;
    this.fpsSmoothed = 60;
    this._last = 0;
  }

  init(container) {
    this.container = container;
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      preserveDrawingBuffer: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // PostFX replaces this with its own grade
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = !!settings.get('shadows');
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.info.autoReset = false;
    container.appendChild(renderer.domElement);
    renderer.domElement.tabIndex = 0;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070a);

    this.camera = new THREE.PerspectiveCamera(settings.get('fov') || 72, 1, 0.03, 900);
    this.camera.layers.set(LAYERS.DEFAULT);
    this.camera.layers.enable(LAYERS.MAIN_ONLY);
    this.scene.add(this.camera); // so things can be parented to the camera (held items)

    input.attach(renderer.domElement);
    window.addEventListener('resize', () => this.resize());
    settings.onChange(({ key }) => {
      if (key === 'resolutionScale' || key === 'graphicsPreset' || key === '*') this.resize();
      if (key === 'fov' || key === '*') {
        this.camera.fov = settings.get('fov');
        this.camera.updateProjectionMatrix();
      }
      if (key === 'shadows' || key === 'graphicsPreset' || key === '*') {
        renderer.shadowMap.enabled = !!settings.get('shadows');
        this.scene.traverse((o) => {
          if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => (m.needsUpdate = true));
          }
        });
      }
    });
    document.addEventListener('visibilitychange', () => {
      this._last = performance.now();
    });
    this.resize();
    return this;
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const scale = settings.get('resolutionScale') ?? 1;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2) * scale;
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, true);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    bus.emit('engine:resize', { width: w, height: h, pixelRatio: this.pixelRatio });
  }

  /**
   * Register a per-frame update. fn(dt, time). Returns an unsubscribe function.
   * opts.always: keep running while engine.paused (menus, UI animation).
   */
  onUpdate(fn, order = 0, opts = {}) {
    const entry = { fn, order, always: !!opts.always };
    this.updates.push(entry);
    this.updates.sort((a, b) => a.order - b.order);
    return () => {
      const i = this.updates.indexOf(entry);
      if (i >= 0) this.updates.splice(i, 1);
    };
  }

  /** Callback run right before the main render (mirrors, reflection probes). fn(renderer, scene, camera, dt) */
  onPreRender(fn, order = 0) {
    const entry = { fn, order };
    this.preRender.push(entry);
    this.preRender.sort((a, b) => a.order - b.order);
    return () => {
      const i = this.preRender.indexOf(entry);
      if (i >= 0) this.preRender.splice(i, 1);
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      let rawDt = (now - this._last) / 1000;
      this._last = now;
      if (!(rawDt > 0)) rawDt = 1 / 60;
      rawDt = Math.min(rawDt, 0.1);
      this.step(rawDt);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
  }

  /** Advance one frame. Exposed so tests can step deterministically. */
  step(rawDt) {
    this.realTime += rawDt;
    const dt = this.paused ? 0 : rawDt * this.timeScale;
    this.dt = dt;
    this.time += dt;
    this.frame++;
    this.fpsSmoothed += (1 / Math.max(rawDt, 1e-4) - this.fpsSmoothed) * 0.05;
    input.update(rawDt);
    for (const u of this.updates) {
      if (this.paused && !u.always) continue;
      try {
        u.fn(u.always ? rawDt : dt, this.time);
      } catch (err) {
        console.error('[engine] update failed', err);
      }
    }
    this.render(dt);
  }

  render(dt) {
    const { renderer, scene, camera } = this;
    renderer.info.reset();
    for (const p of this.preRender) {
      try {
        p.fn(renderer, scene, camera, dt);
      } catch (err) {
        console.error('[engine] preRender failed', err);
      }
    }
    if (this.renderPipeline) this.renderPipeline(renderer, scene, camera, dt);
    else {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    }
  }
}

export const engine = new Engine();
