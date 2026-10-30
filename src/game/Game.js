// Game orchestrator: builds the persistent world/actors once, then hands control
// to the state machine (menu → intro → garage → tutorial → shift ⇄ death → ending).
//
// Debug / test entry points (URL params):
//   ?start=menu|intro|garage|tutorial|shift|death|ending
//   &ride=<0..8> &hour=<21..30> &free=1 (free drive before the ride's pickup)
//   &ending=dawn|endless|forgive|wrong_home  &death=<deathType>  &slot=<0..2>
//   &skipLoading=1
import * as THREE from 'three';
import { g } from './context.js';
import { StateMachine } from './StateMachine.js';
import { Dialogue } from './Dialogue.js';
import { cine } from './Cinematic.js';
import { Clock } from './Clock.js';
import * as WorldModule from '../world/World.js';
import * as VehicleModule from '../vehicle/index.js';
import * as PropsModule from '../props/index.js';
import * as TexturesModule from '../textures/index.js';
import * as CharactersModule from '../characters/index.js';

const { World } = WorldModule;
const { Taxi, Motorcycle } = VehicleModule;
const { PlayerBody, createHumanoid } = CharactersModule;
import { audio } from '../audio/index.js';
import { ui } from '../ui/index.js';
import { postfx, sky, lightPool, particles } from '../render/index.js';
import { installMobileControls } from '../ui/MobileControls.js';
import { installTestPanel } from '../ui/TestPanel.js';
import { MenuState } from './states/MenuState.js';
import { IntroState } from './states/IntroState.js';
import { GarageState } from './states/GarageState.js';
import { TutorialState } from './states/TutorialState.js';
import { ShiftState } from './states/ShiftState.js';
import { DeathState } from './states/DeathState.js';
import { EndingState } from './states/EndingState.js';

/** Narrative data modules (src/game/data/*.js) merged into g.data by file name. */
function loadData() {
  const mods = import.meta.glob('./data/*.js', { eager: true });
  const data = {};
  for (const [path, mod] of Object.entries(mods)) {
    const name = path.replace('./data/', '').replace('.js', '');
    data[name] = mod;
  }
  return data;
}

export async function startGame(ctx) {
  const { engine, params } = ctx;
  Object.assign(g, ctx, { postfx, sky, lightPool, particles, audio, ui });
  g.data = loadData();
  g.params = params;

  ui.init(document.getElementById('ui'));
  const skipLoading = params.get('skipLoading') === '1' || params.get('test') === '1';
  ui.showLoading(0.02, 'กำลังเตรียมป่า…', 'Preparing the forest…');

  // Audio needs a user gesture; init lazily on the first one.
  const unlock = () => audio.init();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  window.addEventListener('gamepadconnected', unlock);

  // --- assets (downloaded / modelled / photobashed), each optional --------------
  // Every loader falls back to procedural content when its files are missing.
  const step = async (label, th, en, frac, fn) => {
    ui.showLoading(frac, th, en);
    try {
      await fn?.();
    } catch (err) {
      console.warn(`[boot] ${label} failed, using procedural fallback`, err);
    }
  };
  await step('textures', 'กำลังวาดพื้นผิว…', 'Painting surfaces…', 0.05, () =>
    TexturesModule.preloadTextures?.(undefined, (d, t) => ui.showLoading(0.05 + 0.2 * (d / Math.max(1, t)), 'กำลังวาดพื้นผิว…', 'Painting surfaces…')));
  await step('characters', 'กำลังปลุกผู้โดยสาร…', 'Waking the passengers…', 0.27, () => CharactersModule.loadCharacterAssets?.());
  await step('vehicle', 'กำลังเข็นแท็กซี่ออกจากอู่…', 'Rolling the taxi out…', 0.32, () => VehicleModule.loadVehicleAssets?.());
  await step('props', 'กำลังจัดของในอู่…', 'Cluttering the garage…', 0.36, () => PropsModule.loadPropAssets?.());
  await step('world assets', 'กำลังหาหินและรากไม้…', 'Gathering roots and stones…', 0.4, () => WorldModule.loadWorldAssets?.());

  // --- world --------------------------------------------------------------------
  const world = new World();
  await world.build({
    quality: ctx.settings.get('graphicsPreset'),
    onProgress: (f, label) => ui.showLoading(0.42 + f * 0.44, label?.th || 'กำลังปลูกต้นไม้…', label?.en || label || 'Growing the forest…'),
  });
  engine.scene.add(world.group);
  g.world = world;
  engine.onUpdate((dt) => world.update(dt, engine.camera.position), 40);

  // --- persistent actors -----------------------------------------------------------
  ui.showLoading(0.88, 'กำลังเตรียมรถ…', 'Warming up the taxi…');
  g.taxi = new Taxi({ world });
  engine.scene.add(g.taxi.root);
  g.bike = new Motorcycle({ world });
  engine.scene.add(g.bike.root);

  const chars = g.data.characters?.CHARACTERS || {};
  g.player = new PlayerBody(chars.player?.appearance || {});
  engine.scene.add(g.player.root);
  g.player.setGroundFn?.((x, z) => world.getHeight(x, z));
  g.ahKong = createHumanoid({ id: 'ahKong', ...(chars.ahKong?.appearance || { sex: 'm', age: 78 }) });
  engine.scene.add(g.ahKong.root);
  g.taxi.onReach = (target, opts) => g.player.reach(target, opts);

  // --- systems -------------------------------------------------------------------------
  g.clock = new Clock();
  engine.onUpdate((dt) => g.clock.update(dt), -5);
  g.dialogue = new Dialogue();
  g.cine = cine;
  g.dialogue.setSpeaker('player', { nameTH: chars.player?.nameTH || 'ต้น', nameEN: chars.player?.nameEN || 'Ton', voice: chars.player?.voice || { gender: 'm', age: 27 }, humanoid: null, object: g.player.root });
  g.dialogue.setSpeaker('ahKong', { nameTH: chars.ahKong?.nameTH || 'อากง', nameEN: chars.ahKong?.nameEN || 'Ah Kong', voice: chars.ahKong?.voice || { gender: 'm', age: 78 }, humanoid: g.ahKong });
  g.dialogue.setSpeaker('voice', { nameTH: '', nameEN: '', voice: { gender: 'f', age: 30, ghost: 1, whisper: true } });

  g.fsm = new StateMachine(g);
  g.fsm.register(MenuState).register(IntroState).register(GarageState).register(TutorialState).register(ShiftState).register(DeathState).register(EndingState);

  installPause();
  installMobileControls(document.getElementById('ui'));
  if (ctx.settings.get('testPanel') !== false) installTestPanel(document.getElementById('ui'));
  ui.showLoading(1, 'พร้อมแล้ว', 'Ready');
  if (!skipLoading) {
    // the burnt-down stick waits for the player; a hand takes it (audio unlocks on this gesture)
    const play = (id, opts) => {
      try {
        audio.init();
        audio.play(id, opts);
      } catch (e) {
        /* audio optional */
      }
    };
    await ui.loading.waitForStart((n) => {
      if (n === 'start') play('ching', { volume: 0.55 });
      else if (n === 'reach') play('breath', { volume: 0.5 });
      else if (n === 'grab') play('sting_low', { volume: 0.7 });
      else if (n === 'pull') play('paper_rustle', { volume: 0.35, rate: 0.7 });
    });
  }
  ui.hideLoading();
  g.ready = true;
  window.__game.g = g;

  // --- start --------------------------------------------------------------------------
  const start = params.get('start') || 'menu';
  if (start !== 'menu') {
    const slot = Number(params.get('slot') ?? 0);
    if (!ctx.saves.load(slot)) ctx.saves.create(slot);
    g.save = ctx.saves.data;
  }
  const startParams = {
    ride: params.has('ride') ? Number(params.get('ride')) : undefined,
    hour: params.has('hour') ? Number(params.get('hour')) : undefined,
    free: params.get('free') === '1',
    ending: params.get('ending') || undefined,
    death: params.get('death') || undefined,
    debug: true,
  };
  g.fsm.go(start, start === 'menu' ? {} : startParams);
}

/** Esc / Start pauses gameplay (not during the main menu). */
function installPause() {
  let paused = false;
  const resume = () => {
    paused = false;
    g.ui.hidePause();
    g.engine.paused = false;
    g.input.setWantPointerLock(true);
    g.cine.blur(0, 0.3);
  };
  g.pause = () => {
    if (paused || g.fsm.is('menu') || g.fsm.is('ending')) return;
    paused = true;
    g.engine.paused = true;
    g.input.setWantPointerLock(false);
    g.cine.blur(1, 0.3);
    g.ui.showPause({
      onResume: resume,
      onSettings: () => g.ui.showSettings(),
      onQuitToMenu: () => {
        resume();
        g.persist();
        g.fsm.go('menu');
      },
    });
  };
  g.resume = resume;
  g.engine.onUpdate(
    () => {
      if (g.input.pressed('pause')) {
        if (paused) resume();
        else g.pause();
      }
    },
    -90,
    { always: true },
  );
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && g.ready && !paused) g.pause();
  });
  // Esc while the pointer is locked is swallowed by the browser (it just unlocks), so
  // losing the lock during gameplay is treated as a pause request.
  g.bus.on('input:pointerlock', (locked) => {
    if (!locked && g.ready && !paused && g.input.wantPointerLock && !g.fsm.is('menu')) g.pause();
  });
}

export { THREE };
