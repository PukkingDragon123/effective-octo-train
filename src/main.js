// Boot. `?sandbox=<name>` loads src/sandbox/<name>.js (module test scenes used by
// tools/shot.mjs); otherwise the full game (src/game/Game.js) starts.
import * as THREE from 'three';
import { engine } from './core/Engine.js';
import { cameraRig } from './core/CameraRig.js';
import { interact } from './core/Interact.js';
import { input } from './core/Input.js';
import { bus } from './core/Events.js';
import { settings } from './core/Settings.js';
import { saves } from './core/Save.js';
import { colliders } from './core/Colliders.js';
import { installRendering } from './render/index.js';
import { loadFonts } from './ui/fonts.js';
import { installArtifactShim } from './core/artifactShim.js';

installArtifactShim();

const params = new URLSearchParams(location.search);

async function boot() {
  engine.init(document.getElementById('app'));
  cameraRig.install();
  interact.install();
  const rendering = installRendering(engine);

  const ctx = { THREE, engine, cameraRig, interact, input, bus, settings, saves, colliders, rendering, params };
  window.__game = {
    ...ctx,
    ready: false,
    errors: [],
    /** Deterministic stepping for automated screenshots. */
    step(n = 1, dt = 1 / 60) {
      for (let i = 0; i < n; i++) engine.step(dt);
    },
  };
  window.addEventListener('error', (e) => window.__game.errors.push(String(e.message || e)));
  window.addEventListener('unhandledrejection', (e) => window.__game.errors.push(String(e.reason?.stack || e.reason)));

  await loadFonts();

  const sandbox = params.get('sandbox');
  if (sandbox) {
    const mods = import.meta.glob('./sandbox/*.js');
    const key = `./sandbox/${sandbox}.js`;
    if (!mods[key]) throw new Error(`Unknown sandbox "${sandbox}". Available: ${Object.keys(mods).join(', ')}`);
    const mod = await mods[key]();
    await mod.default(ctx);
  } else {
    const { startGame } = await import('./game/Game.js');
    await startGame(ctx);
  }
  if (params.get('manual') !== '1') engine.start();
  window.__game.ready = true;
  window.__ready = true;
}

boot().catch((err) => {
  console.error(err);
  window.__bootError = String(err?.stack || err);
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;inset:0;margin:0;padding:24px;color:#e9d9c0;background:#0b0b0c;font:13px/1.5 monospace;white-space:pre-wrap;z-index:99';
  el.textContent = 'Failed to start\n\n' + (err?.stack || err);
  document.body.appendChild(el);
});
