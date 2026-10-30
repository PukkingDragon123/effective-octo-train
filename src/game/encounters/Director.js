// The encounter director (g.director): stages every scare, folklore sighting, rule event and
// beautiful moment in data.encounters (+ local extras such as the face rat).
//
//   g.director.start(id, ctx) -> handle { id, done: Promise<{id, outcome, result, violated}>, outcome(key), stop() }
//   g.director.isRunning(id) · update(dt) · stop(id) · stopAll() · byRule(ruleId) · outcome(id, key)
//   g.director.list() (every startable id) · defs · running · ambient (bool) · enabled · resetNight()
//   g.director.playDeath(type, ctx) (local death cinematics; B registers them through registerDeath too)
//
// Ambient scheduling (free drive): every ~6 s (jittered) it checks each encounter's hours, where,
// cooldown, requires, chance and the night's phase arc (brutal 21–23, surreal 23–02, calm and
// sometimes funny 02–04, beautiful 04–06), keeps a breathing gap between scares (longer after a
// ride scare), never runs two scares at once, and lets the modules handle gaze (spawn out of view,
// reveal when looked at, mirror-only, side-window-only). Ride encounters are started by B at their
// progress points with g.director.start(id, { ride, passenger }).
//
// Install: `import { installDirector } from './encounters/Director.js'; installDirector();` (idempotent;
// also happens on import). It self-updates at engine order 0.
import { g } from '../context.js';
import { engine } from '../../core/Engine.js';
import { bus } from '../../core/Events.js';
import { ENCOUNTERS } from '../data/encounters.js';
import { RULE_BREAKS } from '../data/rules.js';
import { phaseOf } from '../Clock.js';
import { Encounter } from './Encounter.js';
import { LOCAL_DEFS } from './defs.js';
import { DEATHS, registerCreatureDeaths, playDeath } from './deaths.js';
import * as S from './stage.js';
import { prewarmCreatures } from '../../creatures/index.js';

const MODULES = import.meta.glob('./list/*.js', { eager: true });
const RUNNERS = {};
for (const [path, mod] of Object.entries(MODULES)) {
  const id = path.replace('./list/', '').replace('.js', '');
  if (typeof mod.run === 'function') RUNNERS[id] = mod;
}

// scare pacing per phase: minimum seconds between ambient scares, chance multiplier
const PACE = {
  dread: { gap: 32, mult: 1.25 },
  surreal: { gap: 45, mult: 1.0 },
  calm: { gap: 75, mult: 0.55 },
  dawn: { gap: 120, mult: 0.25 },
};
const SCARY = new Set(['scare', 'folklore', 'rule']);

function inHours(hours, h) {
  if (!hours) return true;
  const list = Array.isArray(hours[0]) ? hours : [hours];
  return list.some(([a, b]) => h >= a && h < b);
}

export class EncounterDirector {
  constructor() {
    this.defs = { ...ENCOUNTERS, ...LOCAL_DEFS };
    this.running = new Map(); // id -> Encounter
    this.lastEnd = new Map(); // id -> engine.time
    this.onceNight = new Set();
    this.enabled = true;
    this.ambient = true;
    this.forceAmbient = false; // sandbox: schedule outside the shift state
    this._t = 3;
    this._lastScareEnd = -1e9;
    this._lastRideScare = -1e9;
    this.amuletHeld = false;
    this._frame = -1;
    this._offs = [];
    this._installed = false;
    this.selfUpdate = true; // runs itself at engine order 0 (ShiftState need not call update)
    this.active = false; // B: setActive(true) while the shift runs
  }

  /** B's ShiftState: on while the night shift runs (ambient scheduling), off stops everything. */
  setActive(on) {
    this.active = !!on;
    if (!on) this.stopAll();
  }

  install() {
    if (this._installed) return this;
    this._installed = true;
    this._offs.push(engine.onUpdate((dt) => this._auto(dt), 0));
    this._offs.push(bus.on('amulet:hold', (e) => (this.amuletHeld = !!e?.active)));
    this._offs.push(
      bus.on('game:state', (e) => {
        const s = e?.state;
        if (s === 'death' || s === 'menu' || s === 'ending' || s === 'intro') this.stopAll();
        if (s === 'garage') {
          this.stopAll();
          if (e?.params?.restart || e?.from === 'death') this.resetNight();
        }
      }),
    );
    // a rule break spoken in a ride beat (flags.ruleBreak): apply RULE_BREAKS[r].outcome once the branch ends
    this._offs.push(
      bus.on('dialogue:line', (e) => {
        const r = e?.line?.set?.ruleBreak;
        if (!r || !RULE_BREAKS[r] || g.rules) return; // B's rule monitor applies RULE_BREAKS when present
        const enc = this.byRule(r);
        if (!enc) return;
        const key = RULE_BREAKS[r].outcome;
        const t0 = engine.time;
        const off = engine.onUpdate(() => {
          if (!enc.alive || enc.outcomeKey) return off();
          if (!g.dialogue?.busy || engine.time - t0 > 6) {
            off();
            enc.outcome(key, 'external');
          }
        }, 2);
      }),
    );
    // B's rule monitor reports a violation of a rule we staged: stop staging (the death takes over)
    this._offs.push(
      bus.on('rule:event', (e) => {
        if (!e || e.source === 'director' || e.phase !== 'violated') return;
        for (const enc of this.running.values()) if (enc.def.ruleId === e.ruleId && !enc._violated) enc._violated = true;
      }),
    );
    registerCreatureDeaths();
    // sculpt the animals / hand / face rat in idle time, well after boot
    setTimeout(() => prewarmCreatures().catch(() => {}), 12000);
    return this;
  }

  /** Every startable encounter id (data + local extras). */
  list() {
    return Object.keys(this.defs);
  }
  isRunning(id) {
    return this.running.has(id);
  }
  byRule(ruleId) {
    for (const e of this.running.values()) if (e.def.ruleId === ruleId && e.alive) return e;
    return null;
  }
  outcome(id, key) {
    return this.running.get(id)?.outcome(key, 'external');
  }

  /**
   * Start an encounter now. ctx { ride, passenger, scheduled (default true when called from outside),
   * duration, ...module options }. Returns a handle.
   */
  start(id, ctx = {}) {
    const def = this.defs[id];
    if (!def) {
      console.warn('[director] unknown encounter', id);
      return this._nullHandle(id);
    }
    const existing = this.running.get(id);
    if (existing?.alive) return existing.handle || this._handle(existing);
    const mod = RUNNERS[id];
    const enc = new Encounter(this, def, { scheduled: ctx.scheduled ?? true, ...ctx });
    enc.handle = this._handle(enc);
    this.running.set(id, enc);
    if (SCARY.has(def.kind) && enc.scheduled && ctx.ride !== undefined) this._lastRideScare = engine.time;
    bus.emit('encounter:start', { id, scheduled: enc.scheduled, handle: enc.handle });
    (async () => {
      try {
        if (mod) await mod.run(enc);
        else await this._generic(enc);
      } catch (e) {
        console.error(`[director] encounter ${id} failed`, e);
      } finally {
        enc._finish();
        if (this.running.get(id) === enc) this.running.delete(id);
        this.lastEnd.set(id, engine.time);
        if (SCARY.has(def.kind)) this._lastScareEnd = engine.time;
        try {
          enc.ride?.emit?.('encounterEnd:' + id);
        } catch (e) { /* optional */ }
        bus.emit('encounter:end', { id, outcome: enc.outcomeKey, result: enc.result });
      }
    })();
    return enc.handle;
  }
  _handle(enc) {
    return { id: enc.id, done: enc.done, outcome: (k) => enc.outcome(k, 'external'), stop: () => enc.stop(), encounter: enc };
  }
  _nullHandle(id) {
    return { id, done: Promise.resolve({ id, outcome: null, result: 'none' }), outcome() {}, stop() {}, encounter: null };
  }
  async _generic(enc) {
    // data-only encounter without a module: lines, event, wait out the duration
    enc.event('encounter:' + enc.id);
    if (enc.def.lines?.length) await enc.say(enc.def.lines);
    await enc.wait(enc.duration);
  }
  stop(id) {
    this.running.get(id)?.stop();
  }
  stopAll() {
    for (const e of [...this.running.values()]) e.stop();
  }
  resetNight() {
    this.lastEnd.clear();
    this.onceNight.clear();
    this._lastScareEnd = -1e9;
  }

  /** Local death cinematics (sandbox / fallback when B's death module is missing). */
  playDeath(type, ctx = {}) {
    return playDeath(type, ctx);
  }
  get deaths() {
    return Object.keys(DEATHS);
  }

  // ---------------------------------------------------------------- scheduling
  update(dt) {
    if (this._frame === engine.frame) return; // already ran this frame (self-update)
    this._frame = engine.frame;
    if (!this.enabled || !this.ambient) return;
    const inShift = this.forceAmbient || this.active || !!g.fsm?.is?.('shift');
    if (!inShift || !g.taxi || g.engine?.paused) return;
    this._t -= dt;
    if (this._t > 0) return;
    this._t = 4.5 + Math.random() * 3;
    this._schedule();
  }
  _auto(dt) {
    this.update(dt);
  }

  _where(def) {
    const w = Array.isArray(def.where) ? def.where : [def.where || 'any'];
    const ride = g.ride;
    const riding = !!ride && ride.phase !== 'approach' && ride.phase !== 'done';
    for (const x of w) {
      if (x === 'any') return true;
      if (x === 'freeDrive' && !riding) return true;
      if (x === 'ride:anyGhost' && riding && ride.data?.identity === 'ghost') return true;
      if (x.startsWith('nearLandmark:')) {
        const p = S.landmarkPos(x.slice(13));
        if (p && S.distTo(p) < 150 && S.aheadOf(p) > -20) return true;
      }
    }
    return false;
  }

  _eligible(def, now, h) {
    if (this.running.has(def.id)) return false;
    if (def.once && this.onceNight.has(def.id)) return false;
    const last = this.lastEnd.get(def.id);
    if (last !== undefined && !def.cooldownSec) return false; // no cooldown = once a night when ambient
    if (last !== undefined && now - last < def.cooldownSec) return false;
    if (!inHours(def.hours, h)) return false;
    if (!this._where(def)) return false;
    const t = g.taxi;
    if (def.requires?.radioOn && !t?.state?.radioOn) return false;
    if (def.requires?.passengerAboard !== undefined && !!g.ride !== def.requires.passengerAboard) return false;
    if (def.needsReflection && g.ride?.data?.clues?.reflection === 'none') return false;
    // most ambient things need the car moving with the player in it
    const mods = RUNNERS[def.id];
    if (mods?.canStart && !mods.canStart({ def })) return false;
    if (!(def.stationary || mods?.stationary) && (S.speedKmh() < 12 || !S.cameraInside())) return false;
    return true;
  }

  _schedule() {
    const now = engine.time;
    const h = S.hour();
    const phase = phaseOf(h);
    const pace = PACE[phase] || PACE.surreal;
    const scareRunning = [...this.running.values()].some((e) => SCARY.has(e.def.kind));
    const beautifulRunning = [...this.running.values()].filter((e) => !SCARY.has(e.def.kind)).length;
    const sinceScare = now - Math.max(this._lastScareEnd, this._lastRideScare + 20);
    const cands = [];
    for (const def of Object.values(this.defs)) {
      if (!def.chance || def.chance <= 0) continue;
      const scary = SCARY.has(def.kind);
      if (scary && (scareRunning || sinceScare < pace.gap * (0.75 + Math.random() * 0.6))) continue;
      if (!scary && beautifulRunning >= 2) continue;
      // ride-only encounters are B's (scheduled at progress points)
      const w = Array.isArray(def.where) ? def.where : [def.where];
      if (w.every((x) => typeof x === 'string' && x.startsWith('ride:') && x !== 'ride:anyGhost')) continue;
      if (!this._eligible(def, now, h)) continue;
      cands.push(def);
    }
    // shuffle: unpredictable order
    for (let i = cands.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [cands[i], cands[j]] = [cands[j], cands[i]];
    }
    for (const def of cands) {
      const scary = SCARY.has(def.kind);
      const p = def.chance * (scary ? pace.mult : 1);
      if (Math.random() < p) {
        if (def.once) this.onceNight.add(def.id);
        this.start(def.id, { scheduled: false, ambient: true });
        if (scary) break;
      }
    }
  }

  dispose() {
    this.stopAll();
    for (const o of this._offs.splice(0)) o?.();
    this._installed = false;
  }
}

export const director = new EncounterDirector();

/** Create / return g.director (idempotent). */
export function installDirector() {
  director.install();
  g.director = director;
  return director;
}
installDirector();

export { RUNNERS, DEATHS };
