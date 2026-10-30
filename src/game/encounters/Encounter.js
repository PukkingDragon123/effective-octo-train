// One running encounter: lifecycle, outcome resolution, rule arming / reporting, speech, cleanup.
// Encounter modules (./list/<id>.js) export `run(E)` (async) and receive this object:
//
//   E.id E.def E.ctx E.duration E.alive E.elapsed E.taxi E.ride E.passenger E.scheduled
//   await E.wait(s)            game-time wait; resolves early when the encounter stops
//   await E.until(pred, t)     true when pred() holds, false on timeout / stop
//   E.frame(fn)                per-frame callback (auto-removed)
//   E.track(entityOrObj)       dispose / remove on cleanup;  E.cleanup(fn)
//   E.arm(params) / E.report(phase, extra)   rule plumbing (g.rules + bus 'rule:event')
//   E.event(name)              ride dialogue event + bus 'encounter:event'
//   await E.say(lines)         resolved through data.logic, played by g.dialogue (interrupts small talk)
//   E.whisper(line, pos)       non-blocking spatial whisper
//   await E.ask()              the def's choice (skipped if the ride's beat owns the reply) -> key | null
//   E.outcome(key)             resolve an outcome (idempotent): its lines, then safe / death / ending / ...
//   await E.outcomeSet         resolves with the key once any outcome is chosen (by the module or by B)
//   E.violate(deathType, key)  report 'violated' (B decides the death; fallback g.kill / local cinematic)
import * as THREE from 'three';
import { g } from '../context.js';
import { engine } from '../../core/Engine.js';
import { bus } from '../../core/Events.js';
import { RULE_PARAMS, RULE_BREAKS } from '../data/rules.js';
import * as S from './stage.js';

let _uid = 0;

export class Encounter {
  constructor(director, def, ctx = {}) {
    this.uid = ++_uid;
    this.director = director;
    this.def = def;
    this.id = def.id;
    this.ctx = ctx;
    this.scheduled = !!ctx.scheduled;
    this.alive = true;
    this.outcomeKey = null;
    this.result = null;
    this.t0 = engine.time;
    const [a, b] = def.durationSec || [6, 10];
    let dur = a + Math.random() * Math.max(0, b - a);
    if (def.respectSoftens) dur *= Math.max(0.4, 1 - S.respect() * RULE_PARAMS.respectEncounterSoften);
    this.duration = ctx.duration ?? dur;
    this._cleanups = [];
    this._tracked = [];
    this.done = new Promise((res) => (this._resolveDone = res));
    this.outcomeSet = new Promise((res) => (this._resolveOutcome = res));
    this.armed = false;
    this.deathCtx = null; // extra context for the death cinematic (e.g. { pane })
  }

  // ---------------------------------------------------------------- context
  get taxi() {
    return g.taxi || null;
  }
  get ride() {
    return this.ctx.ride || g.ride || null;
  }
  get passenger() {
    return S.passengerHumanoid(this.ctx);
  }
  get passengerId() {
    return S.passengerId(this.ctx);
  }
  get elapsed() {
    return engine.time - this.t0;
  }
  get g() {
    return g;
  }
  /** True when B's rule monitor (g.rules) watches the rules: detection and kills are B's; we stage. */
  get managed() {
    return !!g.rules;
  }

  // ---------------------------------------------------------------- timing
  wait(s) {
    return new Promise((res) => {
      let t = 0;
      const off = engine.onUpdate((dt) => {
        t += dt;
        if (t >= s || !this.alive) {
          off();
          res(this.alive);
        }
      }, -50);
    });
  }
  until(pred, timeout = Infinity) {
    return new Promise((res) => {
      let t = 0;
      const off = engine.onUpdate((dt) => {
        t += dt;
        let ok = false;
        try {
          ok = !!pred(dt, t);
        } catch (e) {
          console.error(`[encounter ${this.id}]`, e);
        }
        if (ok || t >= timeout || !this.alive) {
          off();
          res(ok && this.alive);
        }
      }, -40);
    });
  }
  frame(fn, order = 1) {
    const off = engine.onUpdate((dt) => {
      if (!this.alive) return;
      try {
        fn(dt, this.elapsed);
      } catch (e) {
        console.error(`[encounter ${this.id}]`, e);
      }
    }, order);
    this._cleanups.push(off);
    return off;
  }
  cleanup(fn) {
    this._cleanups.push(fn);
  }
  /** Track an entity / Object3D / light handle / particle handle / audio handle for cleanup. */
  track(x) {
    if (x) this._tracked.push(x);
    return x;
  }

  // ---------------------------------------------------------------- rules
  arm(params = {}) {
    const r = this.def.ruleId;
    if (!r) return;
    this.armed = true;
    try {
      g.rules?.arm?.(r, { encounter: this.handle || this.id, params });
    } catch (e) {
      console.warn('[director] rules.arm failed', e);
    }
    this.report('start', { params });
  }
  report(phase, extra = {}) {
    const r = extra.ruleId || this.def.ruleId;
    if (!r) return;
    bus.emit('rule:event', { ruleId: r, phase, encounterId: this.id, source: 'director', exception: !!this.def.exception, ...extra });
  }
  /** A dialogue event for the ride (DIALOGUE_EVENTS) + bus 'encounter:event'. 'encounter:<own id>' = reveal(). */
  event(name) {
    if (name === 'encounter:' + this.id) return this.reveal();
    try {
      this.ride?.emit?.(name);
    } catch (e) {
      console.warn('[director] ride.emit failed', e);
    }
    bus.emit('encounter:event', { event: name, id: this.id });
  }
  /** The moment the encounter is actually seen / heard: the ride's beat on 'encounter:<id>' plays now. */
  reveal() {
    if (this._revealed) return this._beatP;
    this._revealed = true;
    bus.emit('encounter:event', { event: 'encounter:' + this.id, id: this.id });
    try {
      const r = this.ride;
      if (r?.encounterBeat) this._beatP = r.encounterBeat(this.id).catch(() => null);
      else r?.emit?.('encounter:' + this.id);
    } catch (e) {
      console.warn('[director] encounter beat failed', e);
    }
    return this._beatP;
  }

  // ---------------------------------------------------------------- speech
  resolve(lines) {
    if (!lines?.length) return [];
    try {
      return g.data?.logic?.resolveLines ? g.data.logic.resolveLines(lines, { save: g.save, hour: S.hour() }) : lines;
    } catch (e) {
      return lines;
    }
  }
  async say(lines, opts = {}) {
    const ls = this.resolve(lines);
    if (!ls.length || !g.dialogue) return { completed: true, choices: {} };
    for (const l of ls) {
      if (opts.object && !this._spoke?.has(l.who)) (this._spoke ||= new Map()).set(l.who, g.dialogue?.speakers?.get?.(l.who)?.object ?? null);
      S.ensureSpeaker(l.who, opts.object || null);
    }
    try {
      return await g.dialogue.play(ls);
    } catch (e) {
      console.warn('[director] dialogue failed', e);
      return { completed: false, choices: {} };
    }
  }
  whisper(line, pos = null) {
    return S.whisper(line, pos);
  }
  /** Random ambient whisper from def.whispers (spatial at pos). */
  whisperRandom(pos = null) {
    const w = this.def.whispers;
    if (!w?.length) return Promise.resolve();
    return this.whisper(w[(Math.random() * w.length) | 0], pos);
  }
  /** True when the current ride has a beat on 'encounter:<id>' that contains a reply moment. */
  rideOwnsReply() {
    try {
      if (typeof this.ride?.beatOwnsReply === 'function') return this.ride.beatOwnsReply(this.id);
    } catch (e) { /* fall back to the data */ }
    const beats = this.ride?.data?.dialogue?.beats;
    if (!beats) return false;
    const has = (lines) => (lines || []).some((l) => l.choice || Object.values(l.choice?.branches || {}).some(has));
    return beats.some((b) => b.trigger?.type === 'event' && b.trigger.event === 'encounter:' + this.id && has(b.lines));
  }
  /** Play the def's choice (prompt line first). Returns the key, or null when the ride owns the reply. */
  async ask(choice = this.def.choice) {
    if (!choice || this.rideOwnsReply() || !this.alive) return null;
    if (this._beatP) await Promise.race([this._beatP, this.wait(20)]); // the ride's beat speaks first
    if (!this.alive || this.outcomeKey) return null;
    if (choice.prompt) await this.say([choice.prompt]);
    if (!this.alive || this.outcomeKey) return null;
    const line = { who: 'player', th: '', en: '', tone: 'thought', choice: { id: choice.id, options: choice.options, defaultKey: choice.defaultKey, timeout: choice.timeout } };
    const r = await this.say([line]);
    return r.choices?.[choice.id] ?? choice.defaultKey ?? null;
  }

  // ---------------------------------------------------------------- outcomes
  /**
   * Resolve an outcome by key (first call wins). src 'local' = decided by this encounter (reported to
   * B: deaths as 'violated', escalations through g.rules.escalate); 'external' = B decided it via the
   * handle (we only play the lines). Returns a Promise of the result string.
   */
  outcome(key, src = 'local') {
    if (this.outcomeKey) return this._outcomeP || Promise.resolve(this.result);
    if (!this.alive) return Promise.resolve(null);
    this.outcomeKey = key;
    const o = this.def.outcomes?.[key];
    this.result = o?.result || 'safe';
    this._resolveOutcome(key);
    bus.emit('encounter:outcome', { id: this.id, outcome: key, result: this.result });
    this._outcomeP = (async () => {
      if (o?.lines?.length && this.alive) await this.say(o.lines);
      const [kind, arg] = this.result.split(':');
      if (kind === 'death') {
        if (src === 'local') this.violate(arg, key);
        else {
          this._violated = true;
          this.violated = arg;
        }
      } else if (kind === 'escalate') {
        if (src === 'local' && g.rules) {
          try {
            g.rules.disarm?.(this.def.ruleId, key);
            g.rules.escalate?.(arg, RULE_BREAKS[this.def.ruleId]?.death);
          } catch (e) {
            console.warn('[director] escalate failed', e);
          }
        }
        this.escalated = arg;
        bus.emit('encounter:result', { id: this.id, kind, arg, outcome: key });
      }
      else if (kind === 'ending') {
        this.report('violated', { outcome: key, ending: arg });
        bus.emit('encounter:ending', { id: this.id, ending: arg, outcome: key });
      } else if (kind === 'safe') this.report('resolved', { outcome: key });
      else bus.emit('encounter:result', { id: this.id, kind, arg, outcome: key });
      return this.result;
    })();
    return this._outcomeP;
  }
  /** Report a violation. B's rule monitor decides the death; without it we call g.kill (or play locally). */
  violate(deathType, outcomeKey = null) {
    if (this._violated) return;
    this._violated = true;
    const extra = { ...(this.deathCtx || {}), passengerId: this.passengerId };
    this.report('violated', { death: deathType, outcome: outcomeKey, ...extra });
    bus.emit('encounter:death', { id: this.id, death: deathType, ruleId: this.def.ruleId, outcome: outcomeKey, ...extra });
    // B kills on our 'violated' report; deaths outside the rules (Yai Speed) go to g.kill directly
    if (!g.rules || !this.def.ruleId) {
      if (g.kill) g.kill(deathType, { encounterId: this.id, ruleId: this.def.ruleId, outcome: outcomeKey, ...extra });
      else this.director.playDeath?.(deathType, { encounter: this, ruleId: this.def.ruleId, ...extra });
    }
    this.violated = deathType;
  }

  // ---------------------------------------------------------------- lifecycle
  stop() {
    if (!this.alive) return;
    this.alive = false;
    this._teardown();
    this._resolveDone({ id: this.id, outcome: this.outcomeKey, result: this.result || 'stopped', violated: this.violated || null, stopped: true });
  }
  _teardown() {
    for (const f of this._cleanups.splice(0)) {
      try {
        f();
      } catch (e) {
        console.error(e);
      }
    }
    for (const x of this._tracked.splice(0)) {
      try {
        if (x.stop && x.setVolume) x.stop(0.6); // audio handle
        else if (x.remove && !x.isObject3D) x.remove(); // light handle
        else if (x.dispose) x.dispose(); // entity / particles
        else if (x.isObject3D) x.removeFromParent();
      } catch (e) {
        console.error(e);
      }
    }
    // spatial speakers we pinned to staging objects go back to their defaults
    for (const [who, prev] of this._spoke || []) {
      try {
        const sp = g.dialogue?.speakers?.get?.(who);
        if (sp) sp.object = prev;
      } catch (e) { /* optional */ }
    }
    // (B's rule monitor closes an armed rule itself when this encounter's handle.done resolves)
  }
  _finish() {
    const wasAlive = this.alive;
    this.alive = false;
    this._teardown();
    if (!this.outcomeKey && wasAlive && this.def.ruleId && !this._violated) this.report('resolved', { outcome: null });
    this._resolveDone({ id: this.id, outcome: this.outcomeKey, result: this.result || 'safe', violated: this.violated || null });
  }
}

export { THREE, S };
