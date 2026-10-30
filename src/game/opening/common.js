// Shared helpers for engineer A's states (menu, intro, garage, tutorial, endings):
// condition-aware dialogue with Ton's spoken replies, an authored cinematic camera,
// staging bookkeeping (actors, particles, lights, sounds) and small world utilities.
import * as THREE from 'three';
import { g } from '../context.js';
import { wait } from '../util.js';
import { bus } from '../../core/Events.js';
import { clamp, damp, easeInOut, noise } from '../../core/math.js';
import { createHumanoid } from '../../characters/index.js';
import { GLOBAL_UNIFORMS } from '../../render/index.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

/** Thrown to unwind a long async enter() when the state was left. */
export const ABORT = Object.freeze({ abort: true });
export const isAbort = (e) => e === ABORT;

/** A guard bound to a state: `await S.step(promise)` throws ABORT once the state is inactive. */
export function guard(state) {
  const chk = () => {
    if (!state.active) throw ABORT;
  };
  return {
    chk,
    async step(p) {
      chk();
      const r = await p;
      chk();
      return r;
    },
    async wait(s) {
      chk();
      await wait(s);
      chk();
    },
  };
}

// ---------------------------------------------------------------------------------- data
export const logic = () => g.data?.logic || {};
export function ctx() {
  return { save: g.save || { flags: {}, memories: [], deaths: [], loops: 0 }, hour: g.clock?.hour ?? 21, taxi: g.taxi?.state };
}
/** Filter a block for this moment (conditions, conditional options). */
export function resolve(lines) {
  const L = logic();
  try {
    return L.resolveLines ? L.resolveLines(lines || [], ctx()) : (lines || []).slice();
  } catch (e) {
    console.warn('[game-a] resolveLines failed', e);
    return (lines || []).filter((l) => !l.if);
  }
}
export function chars() {
  return g.data?.characters?.CHARACTERS || {};
}

// ---------------------------------------------------------------------------------- dialogue
let _tmpSpeaker = 0;
const PLAYER_VOICE = () => chars().player?.voice || { gender: 'm', age: 27 };

/** Ton says a picked reply aloud (no subtitle). Never blocks for long. */
export async function speakTon(opt) {
  if (!opt || !opt.th || /^[.…\s]*$/.test(opt.th)) return;
  if ((g.settings?.get?.('voice') ?? 'on') === 'off' || !g.audio?.voice) {
    await wait(0.4);
    return;
  }
  const t0 = g.engine.realTime;
  try {
    await Promise.race([g.audio.voice.speak({ th: opt.th, en: opt.en, voice: PLAYER_VOICE(), object: g.player?.root || null }), wait(4 + opt.th.length * 0.08)]);
  } catch (e) {
    /* voice must never block */
  }
  if (g.engine.realTime - t0 < 0.5) await wait(0.6);
}

/**
 * Play already-resolved lines. Plain lines go through g.dialogue.play (subtitles, TTS, lip
 * sync); reply moments are run here so Ton's pick is voiced and the branch follows.
 * opts { alive(): bool, onLine(line), onChoice(id, key) } -> { completed, choices }
 */
export async function runLines(lines, opts = {}) {
  const choices = {};
  const alive = opts.alive || (() => true);
  let seg = [];
  const flush = async () => {
    if (!seg.length) return true;
    const block = seg.map(prepLine);
    seg = [];
    const r = await g.dialogue.play(block, { onLine: (l, i) => opts.onLine?.(l, i) });
    Object.assign(choices, r?.choices || {});
    return r?.completed !== false && alive();
  };
  for (const line of lines || []) {
    if (!alive()) return { completed: false, choices };
    if (!line.choice) {
      seg.push(line);
      continue;
    }
    if (!(await flush())) return { completed: false, choices };
    if (line.set && g.save) Object.assign(g.save.flags, line.set);
    bus.emit('dialogue:line', { line, index: -1 });
    const sp = g.dialogue.speakers?.get?.(line.who) || {};
    if (line.th || line.en) g.ui.subtitle({ speakerTH: sp.nameTH || '', speakerEN: sp.nameEN || '', th: line.th, en: line.en, tone: line.tone || 'normal', duration: 30 });
    let key = null;
    try {
      key = await g.ui.choice(line.choice);
    } catch (e) {
      key = line.choice.defaultKey;
    }
    if (key == null) key = line.choice.defaultKey;
    if (line.th || line.en) g.ui.clearSubtitle();
    if (!alive()) return { completed: false, choices };
    choices[line.choice.id || '?'] = key;
    bus.emit('dialogue:choice', { id: line.choice.id, key });
    opts.onChoice?.(line.choice.id, key);
    const opt = (line.choice.options || []).find((o) => o.key === key);
    await speakTon(opt);
    const br = line.choice.branches?.[key];
    if (br && br.length) {
      const r = await runLines(br, opts);
      Object.assign(choices, r.choices);
      if (!r.completed) return { completed: false, choices };
    }
  }
  const ok = await flush();
  return { completed: ok, choices };
}

/** Speaker label overrides (speakerTH/EN) need a temporary speaker id for the stock runner. */
function prepLine(line) {
  if (!line.speakerTH && !line.speakerEN) return line;
  const base = g.dialogue.speakers?.get?.(line.who) || {};
  const id = `__a_sp${++_tmpSpeaker % 64}`;
  g.dialogue.setSpeaker(id, { ...base, nameTH: line.speakerTH ?? base.nameTH ?? '', nameEN: line.speakerEN ?? base.nameEN ?? '', voice: base.voice || voiceFor(line.who) });
  return { ...line, who: id };
}

export function voiceFor(who) {
  const c = chars()[who];
  return c?.voice || { gender: 'm', age: 50 };
}

/** Resolve + play. */
export function say(lines, opts) {
  return runLines(resolve(lines), opts);
}

/** Register (or refresh) a speaker from CHARACTERS, optionally bound to a humanoid. */
export function speaker(who, humanoid = null, extra = {}) {
  const c = chars()[who] || {};
  g.dialogue.setSpeaker(who, { nameTH: c.nameTH || '', nameEN: c.nameEN || '', voice: c.voice || { gender: 'm', age: 50 }, humanoid, object: humanoid?.root || null, ...extra });
}

// ---------------------------------------------------------------------------------- world utils
export function wpos(obj, out = new THREE.Vector3()) {
  if (!obj) return out.set(0, 0, 0);
  if (obj.isVector3) return out.copy(obj);
  obj.updateWorldMatrix?.(true, false);
  return obj.getWorldPosition(out);
}
export function wyaw(obj) {
  if (!obj) return 0;
  obj.updateWorldMatrix?.(true, false);
  obj.getWorldQuaternion(_q);
  _e.setFromQuaternion(_q, 'YXZ');
  return _e.y;
}
/** Yaw (rotation.y) that makes a -Z-forward object face from `from` toward `to`. */
export function yawTo(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}
export function ground(x, z) {
  try {
    const y = g.world?.getHeight?.(x, z);
    return Number.isFinite(y) ? y : 0;
  } catch (e) {
    return 0;
  }
}
/** Point on a road spline: lateral + = right of travel. */
export function roadPoint(id, s, lateral = 0, out = new THREE.Vector3()) {
  const smp = g.world.road.sample(id, s);
  out.copy(smp.pos).addScaledVector(smp.right, lateral);
  out.y = ground(out.x, out.z);
  return out;
}
export function roadYaw(id, s) {
  const t = g.world.road.sample(id, s).tangent;
  return Math.atan2(-t.x, -t.z);
}
export function roadLen(id) {
  return g.world.road.length(id);
}
/** Taxi-local point (x right, y up, -z forward) to world. */
export function taxiPoint(x, y, z, out = new THREE.Vector3()) {
  g.taxi.root.updateWorldMatrix(true, false);
  return out.set(x, y, z).applyMatrix4(g.taxi.root.matrixWorld);
}
/** Local point of any object to world. */
export function localPoint(obj, x, y, z, out = new THREE.Vector3()) {
  obj.updateWorldMatrix(true, false);
  return out.set(x, y, z).applyMatrix4(obj.matrixWorld);
}
export const lm = (key) => g.world?.landmarks?.[key] || null;
export function anchorOf(key, name) {
  const l = lm(key);
  return l?.anchors?.[name] || l?.prop?.[name] || null;
}

// ---------------------------------------------------------------------------------- taxi staging
/** Where the taxi waits at the KM 9 garage: on the road in front of the open shop front. */
export function garageTaxiPose() {
  const L = lm('garage');
  if (!L) return { pos: new THREE.Vector3(), yaw: 0 };
  const s = L.roadRef?.s ?? 0;
  const pos = roadPoint('main', s + 1.5, -1.75);
  return { pos, yaw: roadYaw('main', s + 1.5), s: s + 1.5 };
}

/** Park the taxi (engine off, key out, handbrake on, every door shut) at a pose. */
export function parkTaxi(pos, yaw, opts = {}) {
  const t = g.taxi;
  t.autopilot(null);
  t.setControlsEnabled(false);
  t.physics.frozen = false;
  t.setPose(pos, yaw);
  const s = t.state;
  if (opts.cold !== false) {
    if (s.engineOn) bus.emit('taxi:engine', { on: false });
    s.engineOn = false;
    s.ignition = 'off';
    s.keyInserted = false;
    s.handbrake = true;
    s.gear = g.settings?.get?.('transmission') === 'manual' ? 'N' : 'P';
    s.headlights = opts.headlights || 'off';
    s.indicator = 'off';
    s.wipers = 0;
    s.cabinLight = false;
    s.meterOn = false;
    s.vacantLamp = true;
    if (s.radioOn) t.setControl('radio', false);
  }
  for (const d of ['fl', 'fr', 'rl', 'rr', 'trunk']) {
    if (s.doors[d] > 0.01) {
      s.doors[d] = 0;
      delete t.controls?.doorTweens?.[d];
    }
  }
  for (const w of ['fl', 'fr', 'rl', 'rr']) s.windows[w] = 0;
}

/** Get the taxi running (no reach, no sounds beyond the engine). */
export function warmTaxi(opts = {}) {
  const t = g.taxi;
  const s = t.state;
  s.keyInserted = true;
  s.ignition = 'on';
  if (!s.engineOn) {
    s.engineOn = true;
    t.physicsSim.rpm = 950;
    bus.emit('taxi:engine', { on: true });
  }
  s.headlights = opts.headlights || 'low';
}

// ---------------------------------------------------------------------------------- actors
/** Cutscene humanoid from a CHARACTERS id (or a spec), grounded, added to the scene. */
export function actor(idOrSpec, extra = {}) {
  const base = typeof idOrSpec === 'string' ? chars()[idOrSpec]?.appearance || { id: idOrSpec, sex: 'm', age: 40 } : idOrSpec;
  const spec = { ...base, ...extra, id: (extra.id || base.id || 'actor') + '_a' + Math.floor(Math.random() * 1e6) };
  const h = createHumanoid(spec);
  g.engine.scene.add(h.root);
  try {
    h.setGroundFn?.((x, z) => ground(x, z));
  } catch (e) {
    /* ignore */
  }
  return h;
}

/** Bookkeeping for one staged moment: everything added is torn down by clear(). */
export class Stage {
  constructor() {
    this.items = [];
  }
  add(fn) {
    if (typeof fn === 'function') this.items.push(fn);
    return fn;
  }
  actor(id, extra) {
    const h = actor(id, extra);
    this.add(() => {
      try {
        h.dispose();
      } catch (e) {
        h.root?.removeFromParent();
      }
    });
    return h;
  }
  mesh(obj, parent = g.engine.scene) {
    parent.add(obj);
    this.add(() => {
      obj.removeFromParent();
      obj.traverse?.((o) => {
        if (o.isMesh) {
          o.geometry?.dispose?.();
          if (o.material && o.material.userData?.ownedByStage) o.material.dispose?.();
        }
      });
    });
    return obj;
  }
  emit(type, opts) {
    try {
      const h = g.particles.emit(type, opts);
      this.add(() => h.dispose());
      return h;
    } catch (e) {
      return { setActive() {}, setIntensity() {}, setPosition() {}, dispose() {}, burst() {} };
    }
  }
  light(spec) {
    try {
      const h = g.lightPool.add(spec);
      this.add(() => h.remove?.());
      return h;
    } catch (e) {
      return { setOn() {}, setIntensity() {}, remove() {}, setPosition() {} };
    }
  }
  loop(id, opts) {
    const h = g.audio.loop(id, opts);
    this.add(() => h?.stop?.(1.2));
    return h;
  }
  update(fn, order = 30) {
    const off = g.engine.onUpdate(fn, order);
    this.add(off);
    return off;
  }
  clear() {
    for (const f of this.items.splice(0).reverse()) {
      try {
        f();
      } catch (e) {
        console.warn('[game-a] stage cleanup', e);
      }
    }
  }
}

// ---------------------------------------------------------------------------------- camera
/**
 * Authored cinematic camera. A single shot object is handed to cameraRig.cinematic(); the
 * position/look are driven here every frame (order 45, before the rig at 50), so moves are
 * smooth and cuts are hard.
 */
export class CineCam {
  constructor() {
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3(0, 0, -1);
    this.shot = { position: () => this.pos, lookAt: () => this.look, fov: 50, roll: 0, blend: 0.01 };
    this.fn = null;
    this.t = 0;
    this.dur = 0;
    this.shake = 0;
    this._done = null;
    this._off = null;
  }
  /** Take the camera. opts {cut=true, blend, fov} */
  begin(opts = {}) {
    if (opts.fov) this.shot.fov = opts.fov;
    this.shot.blend = opts.blend ?? 0.01;
    this.shot.cut = opts.cut !== false;
    if (!this._off) {
      this._off = g.engine.onUpdate((dt) => this._tick(dt), 45, { always: true });
    }
    g.cameraRig.cinematic(this.shot);
    return this;
  }
  /** Run a shot: fn(t, k, dt, cam) sets cam.pos / cam.look / cam.shot.fov each frame. -> Promise after `dur`. */
  play(fn, dur = 5, opts = {}) {
    this._done?.(false);
    this._done = null;
    this.fn = fn;
    this.t = 0;
    this.dur = dur;
    this.shake = opts.shake ?? 0.004;
    if (opts.fov) this.shot.fov = opts.fov;
    this.shot.roll = opts.roll ?? 0;
    if (!this._off) this._off = g.engine.onUpdate((d) => this._tick(d), 45, { always: true });
    this._tick(0);
    // cut (default) or a soft blend from whatever the camera shows now
    this.shot.cut = opts.cut !== false;
    this.shot.blend = opts.blend ?? (this.shot.cut ? 0.01 : 1.2);
    if (this.shot.cut || g.cameraRig.shot !== this.shot) g.cameraRig.cinematic(this.shot);
    return new Promise((r) => (this._done = r));
  }
  _tick(dt) {
    if (g.engine.paused) return;
    if (!this.fn) return;
    this.t += dt;
    const k = this.dur > 0 ? clamp(this.t / this.dur) : 1;
    try {
      this.fn(this.t, k, dt, this);
    } catch (e) {
      console.warn('[game-a] shot', e);
      this.fn = null;
    }
    if (this.shake > 0) {
      const tt = g.engine.time * 0.35;
      this.look.x += noise.noise2D(tt, 3.1) * this.shake * 6;
      this.look.y += noise.noise2D(tt, 8.7) * this.shake * 4;
    }
    if (this.t >= this.dur && this._done) {
      const d = this._done;
      this._done = null;
      d(true);
    }
  }
  /** Give the camera back to the player view. */
  end(blend = 0.6) {
    this._done?.(false);
    this._done = null;
    this.fn = null;
    this._off?.();
    this._off = null;
    g.cameraRig.release(blend);
  }
  stop() {
    this._done?.(false);
    this._done = null;
    this.fn = null;
    this._off?.();
    this._off = null;
  }
}

/** Ease helper for shots. */
export const ez = easeInOut;
export function lerpV(a, b, k, out = new THREE.Vector3()) {
  return out.copy(a).lerp(b, k);
}
/** Frame-rate independent follow of a vector toward a target. */
export function follow(cur, target, lambda, dt) {
  cur.x = damp(cur.x, target.x, lambda, dt);
  cur.y = damp(cur.y, target.y, lambda, dt);
  cur.z = damp(cur.z, target.z, lambda, dt);
  return cur;
}

// ---------------------------------------------------------------------------------- look & mood
/** Hold the sky at an hour (clock frozen, weather manual). */
export function holdSky(hour, weather = null, secs = 0) {
  const c = g.clock;
  c.frozen = true;
  c.autoWeather = false;
  c.hour = c.target = hour;
  g.sky?.setHour(hour);
  if (weather) g.sky?.setWeather(weather, secs);
}
export function releaseSky() {
  const c = g.clock;
  c.frozen = false;
  c.autoWeather = true;
}
export function music(mood, fade = 3) {
  try {
    g.audio?.music?.setMood(mood, { fade });
  } catch (e) {
    /* audio optional */
  }
}
/** The current fog colour (fade "into the fog" instead of to black). */
export function fogColor() {
  const c = GLOBAL_UNIFORMS?.uFogColor?.value;
  return c ? new THREE.Color().copy(c).multiplyScalar(1.15) : new THREE.Color(0x1a2224);
}

/** Fade to/from a colour without touching anything else. */
export function fadeTo(to, secs, color) {
  return g.cine.fade(to, secs, color || null);
}

/** Show/hide the player's own head in the main camera (third-person cutscenes). */
export function showPlayerHead(on) {
  const L = 3; // LAYERS.PLAYER_HEAD
  if (on) g.engine.camera.layers.enable(L);
  else g.engine.camera.layers.disable(L);
}

/** Keep the player's body out of a shot. */
export function hidePlayer(hide) {
  if (g.player?.root) g.player.root.visible = !hide;
}

/** No ambient encounters outside the shift (menu, intro, garage, tutorial, endings). */
export function quietDirector() {
  try {
    g.director?.setActive?.(false);
  } catch (e) {
    /* optional */
  }
}

/** Cheap one-shot sound helper (never throws). */
export function sfx(id, opts = {}) {
  try {
    return g.audio?.play(id, opts);
  } catch (e) {
    return null;
  }
}

/** Wait until pred() or timeout (game time). */
export function waitFor(pred, timeout = Infinity) {
  return new Promise((resolve) => {
    let t = 0;
    const off = g.engine.onUpdate((dt) => {
      t += dt;
      let ok = false;
      try {
        ok = !!pred(dt);
      } catch (e) {
        ok = true;
      }
      if (ok || t >= timeout) {
        off();
        resolve(ok);
      }
    }, -40);
  });
}

export { _v as tmpV };
