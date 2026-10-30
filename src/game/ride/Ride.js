// A ride (g.ride): one passenger from the hail to the fork. Engineer B.
//
//   new Ride(index, data)    data = PASSENGERS[index]
//   fields: index, data, passenger (Passenger), seat, phase ('approach'|'pickup'|'riding'|
//           'forkApproach'|'resolving'|'gate'|'lastFork'|'done'), progress 0..1, alive, r3Phase
//   emit(event)              DIALOGUE_EVENTS + 'encounter:<id>' / 'encounterEnd:<id>' (C may call it)
//   playBlock(key, {interrupt, clearQueue}) -> Promise   a resolved ride block (onLookBack, arriveCorrect...)
//   encounterBeat(encId) -> Promise<{played, ownsReply}>   C: call it after the encounter's own lines;
//                            when ownsReply is true, skip the encounter's own choice
//   beatOwnsReply(encIdOrEvent) -> bool
//   async pickup() -> bool   hail, r1 (driving past folds the road back), stop, board
//   async ride({resume}) -> 'left'|'right'|null   greet → beats/encounters/pacing → fork commit
//                            (resume: back on the road after the fork folded back; no greeting)
//   halt() (death) · dispose()
//
// Progress = min(distance since pickup / route, seconds seated / pacing.minSeconds). When the taxi
// would reach the fork before minSeconds or before every essential beat has played, the road folds
// back in the fog (stretch 'fog') / glowing mist ('mist'). Beats: progress/time beats queue, event
// beats interrupt idle lines only; an interrupted beat resumes where it stopped.
import * as THREE from 'three';
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { input } from '../../core/Input.js';
import { wait, until } from '../util.js';
import { clamp } from '../../core/math.js';
import { Passenger } from './Passenger.js';
import { taxiRoad, foldBack, mainS } from './fx.js';
import { CHARACTERS } from '../data/characters.js';
import { ENCOUNTERS } from '../data/encounters.js';
import { DIALOGUE_EVENT_PARAMS as DEP } from '../data/passengers.js';
import { RULE_PARAMS as RP } from '../data/rules.js';
import { dialogueBlock, resolveLines, checkCond } from '../data/logic.js';

const lineSeconds = (l) => Math.max(1.8, 1.1 + (l.th || '').length * 0.065) + (l.pause ?? 0.35);
const hasReply = (lines) => (lines || []).some((l) => l.choice);

export class Ride {
  constructor(index, data) {
    this.index = index;
    this.data = data;
    this.id = data.id;
    this.seat = data.seat;
    this.phase = 'approach';
    this.r3Phase = 'early';
    this.alive = true;
    this.progress = 0;
    this.dist = 0;
    this.tSeated = 0;
    this.time = 0;
    this.queue = [];
    this.playing = null;
    this.beats = (data.dialogue?.beats || []).map((b) => ({ def: b, fired: false, done: false, doneAt: -1 }));
    this.encs = (data.encounters || []).map((e) => ({ ...e, fired: false }));
    this.encHandles = {};
    this._encBeat = {};
    this._idleIdx = 0;
    this._idleT = this._idleGap();
    this._silence = 0;
    this._events = new Set();
    this._stopT = 0;
    this._offs = [];
    this.passenger = new Passenger(this, data);
    this.pickupLm = g.world.landmarks[data.pickup];
    this.stopS = mainS(this.pickupLm.stopPos);
    this.forkS = g.world.fork.decisionS;
    this.route = Math.max(60, this.forkS - this.stopS);
    this._registerSpeaker();
    this._listen();
  }

  // ------------------------------------------------------------------ setup
  _registerSpeaker() {
    const ch = CHARACTERS[this.data.characterId] || {};
    const h = this.passenger.humanoid;
    g.dialogue.setSpeaker('passenger', { nameTH: ch.nameTH || '', nameEN: ch.nameEN || '', voice: ch.voice || {}, humanoid: h, object: h.root });
    g.dialogue.alias(this.data.characterId, 'passenger');
  }
  _ctx() {
    return { save: g.save, taxi: g.taxi.state, hour: g.clock?.hour, passengerId: this.data.id };
  }
  _listen() {
    const on = (n, f) => this._offs.push(bus.on(n, f));
    on('taxi:control', ({ control, value } = {}) => {
      if (!this.passenger.aboard) return;
      switch (control) {
        case 'radio':
          this.emit(value ? 'radioOn' : 'radioOff');
          break;
        case 'radioTune':
          this.emit('radioTune');
          if (g.taxi.state.radioOn) this.emit('radioOn'); // a beat waiting for music hears the new station
          break;
        case 'cabinLight':
          this.emit(value ? 'cabinLightOn' : 'cabinLightOff');
          break;
        case 'wipers':
          if (value > 0) this.emit('wipersOn');
          break;
        case 'meter':
          if (value) this.emit('meterOn');
          break;
        case 'window':
          if ((value?.amount ?? 0) > 0.05) this.emit('windowOpen');
          else this.emit('windowClose');
          break;
        default:
      }
    });
    on('taxi:collision', () => this.passenger.aboard && this.emit('collision'));
    on('amulet:hold', (d) => {
      if (!d?.active || !this.passenger.aboard) return;
      this.emit('amulet'); // the warmth / hum itself is A's PlayerActions (setAmuletWarmth, see ShiftState)
    });
    // encounters the director starts on its own while we ride
    on('encounter:start', (d) => d?.id && this._encStarted(d.id, d.handle || null));
    on('encounter:end', (d) => d?.id && this._encEnded(d.id));
    on('ride:event', (d) => d?.event && this.emit(d.event));
    // Auntie Sri's jasmine: a small garland on the dash (the woman in white notices it)
    on('dialogue:choice', (d) => {
      if (d?.id === 'sri_garland' && d.key === 'buy' && !this._jasmine) this._jasmine = g.taxi.addDashGarland({ scale: 0.8, seed: 23, at: new THREE.Vector3(0.12, 1.0, -0.78) });
    });
    // passengers with no reflection lean in when they whisper (r4: the face is right there)
    on('dialogue:line', ({ line } = {}) => {
      if (!line || line.who !== 'passenger' || this.passenger.reflection !== 'none') return;
      if (line.tone === 'whisper' || line.emotion === 'creepy') this.passenger.leanIn(lineSeconds(line) + 3);
    });
  }

  // ------------------------------------------------------------------ events & beats
  /** Fire a dialogue event (DIALOGUE_EVENTS, 'encounter:<id>', 'encounterEnd:<id>'). */
  emit(event) {
    if (!this.alive || !event) return;
    bus.emit('ride:eventFired', { event, ride: this.id });
    if (!this.passenger.aboard && !event.startsWith('encounter')) return;
    for (const b of this.beats) {
      const tr = b.def.trigger;
      if (tr?.type !== 'event' || tr.event !== event) continue;
      if (b.fired && b.def.once !== false) continue;
      this._fire(b, { event: true });
    }
  }

  _fire(b, opts = {}) {
    b.fired = true;
    const ctx = this._ctx();
    if (b.def.if && !checkCond(b.def.if, ctx)) {
      b.done = true;
      b.doneAt = this.time;
      return false;
    }
    if (b.def.set && g.save) Object.assign(g.save.flags, b.def.set);
    for (const fx of b.def.effects || []) this._effect(fx);
    const lines = resolveLines(b.def.lines || [], ctx);
    if (!lines.length) {
      b.done = true;
      b.doneAt = this.time;
      return false;
    }
    const item = { kind: 'beat', beat: b, lines, startAt: 0, tries: 0, event: !!opts.event };
    if (opts.event) {
      // event beats go first and cut idle chatter
      this.queue.unshift(item);
      if (this.playing?.kind === 'idle') g.dialogue.interrupt();
    } else this.queue.push(item);
    return item;
  }

  _effect(fx) {
    try {
      switch (fx.type) {
        case 'rule':
          if (fx.arm) {
            const encId = Object.keys(this.encHandles).find((id) => ENCOUNTERS[id]?.ruleId === fx.id);
            g.rules?.arm(fx.id, { encounter: (encId && this.encHandles[encId]) || encId || null });
          } else g.rules?.disarm(fx.id);
          break;
        case 'taxi':
          g.taxi.setControl(fx.control, fx.value);
          break;
        case 'item':
          if (fx.id === 'garland') this._garland = g.taxi.addDashGarland({ seed: 41 });
          break;
        case 'encounter':
          this.startEncounter(fx.id);
          break;
        case 'sfx':
          g.audio?.play?.(fx.id, { object: this.passenger.humanoid.root });
          break;
        case 'flag':
          if (g.save) g.save.flags[fx.name] = fx.value;
          break;
        default:
      }
    } catch (e) {
      console.warn('[ride] effect failed', fx, e);
    }
  }

  /** Play a ride dialogue block (resolved for this loop). */
  playBlock(key, opts = {}) {
    const lines = dialogueBlock(this.data, key, this._ctx());
    return this.playLines(lines, opts);
  }
  /** Queue already-resolved lines at the front (opts.interrupt cuts whatever plays). */
  playLines(lines, opts = {}) {
    if (!this.alive || !lines?.length) return Promise.resolve({ completed: true, choices: {} });
    return new Promise((resolve) => {
      if (opts.clearQueue) this.queue.length = 0;
      const item = { kind: 'block', lines, startAt: 0, tries: 0, resolve };
      if (opts.interrupt || opts.front) this.queue.unshift(item);
      else this.queue.push(item);
      if (opts.interrupt && this.playing && this.playing.kind !== 'block') g.dialogue.interrupt();
      else if (opts.interrupt && !this.playing && !g.dialogue.idle) g.dialogue.interrupt();
    });
  }

  _pump() {
    if (this.playing || !this.queue.length || !g.dialogue.idle) return;
    const item = this.queue.shift();
    this.playing = item;
    this._silence = 0;
    g.dialogue
      .play(item.lines, { startAt: item.startAt })
      .then((r) => {
        if (this.playing === item) this.playing = null;
        if (!r.completed && this.alive && item.kind !== 'idle' && item.tries < 3) {
          // resume where it was cut (skip the branch of a reply already answered)
          let at = Math.max(0, r.stoppedAt);
          const l = item.lines[at];
          if (l?.choice && l.choice.id && r.choices[l.choice.id] !== undefined) at++;
          if (at < item.lines.length) {
            this.queue.unshift({ ...item, startAt: at, tries: item.tries + 1 });
            return;
          }
        }
        if (item.beat) {
          item.beat.done = true;
          item.beat.doneAt = this.time;
        }
        this._silence = 0;
        item.resolve?.(r);
      })
      .catch((e) => {
        console.error('[ride] dialogue failed', e);
        if (this.playing === item) this.playing = null;
        if (item.beat) item.beat.done = true;
        item.resolve?.({ completed: false, choices: {} });
      });
  }

  _idleGap() {
    const [a, b] = DEP.idleGapSeconds || [28, 55];
    return a + Math.random() * (b - a);
  }

  _beatsUpdate(dt) {
    const ctx = this._ctx();
    void ctx;
    for (const b of this.beats) {
      if (b.fired) continue;
      const tr = b.def.trigger || {};
      if (tr.type === 'progress' && this.progress >= tr.at) this._fire(b);
      else if (tr.type === 'time' && this.tSeated >= tr.seconds) this._fire(b);
      else if (tr.type === 'after') {
        const ref = this.beats.find((x) => x.def.id === tr.beat);
        if (ref?.done && ref.doneAt >= 0 && this.time - ref.doneAt >= (tr.seconds || 0)) this._fire(b);
      }
    }
    // idle lines fill long silences
    if (!this.playing && !this.queue.length && g.dialogue.idle) {
      this._silence += dt;
      if (this._silence > this._idleT) {
        this._silence = 0;
        this._idleT = this._idleGap();
        const idle = dialogueBlock(this.data, 'idle', ctx);
        if (idle.length) {
          const l = idle[this._idleIdx++ % idle.length];
          this.queue.push({ kind: 'idle', lines: [l], startAt: 0, tries: 3 });
        }
      }
    }
  }

  /** Essential beats (progress/time/after) whose condition holds have all finished. */
  essentialsDone() {
    const ctx = this._ctx();
    for (const b of this.beats) {
      if (!b.def.essential || b.done) continue;
      const type = b.def.trigger?.type;
      if (type === 'event') continue;
      if (b.def.if && !checkCond(b.def.if, ctx)) continue;
      return false;
    }
    return !(this.playing?.beat?.def?.essential);
  }

  // ------------------------------------------------------------------ encounters (C's director)
  startEncounter(id, opts = {}) {
    if (!this.alive) return null;
    let handle = null;
    try {
      handle = g.director?.start?.(id, { ride: this, passenger: this.passenger, rideId: this.id, ...opts }) || null;
    } catch (e) {
      console.warn('[ride] director.start failed', id, e);
    }
    this._encStarted(id, handle);
    return handle;
  }
  _encStarted(id, handle) {
    if (!this.alive) return;
    if (handle) this.encHandles[id] = handle;
    if (this._encBeat[id]?.started) return;
    const st = (this._encBeat[id] = { started: true, played: false });
    handle?.done?.then?.(() => this._encEnded(id), () => this._encEnded(id));
    // C plays the encounter's own lines first, then calls encounterBeat(id); if it does not,
    // the ride beat follows after the lines' estimated length.
    const lines = ENCOUNTERS[id]?.lines || [];
    const delay = lines.length ? lines.reduce((a, l) => a + lineSeconds(l), 0) + 1.2 : 0;
    const fire = () => {
      if (!st.played && this.alive) {
        st.played = true;
        this.emit('encounter:' + id);
      }
    };
    if (delay > 0) setTimeout(fire, delay * 1000);
    else fire();
  }
  _encEnded(id) {
    const st = this._encBeat[id];
    if (!st || st.ended) return;
    st.ended = true;
    delete this.encHandles[id];
    this.emit('encounterEnd:' + id);
  }
  beatOwnsReply(idOrEvent) {
    const ev = idOrEvent.includes(':') || idOrEvent === 'meter444' ? idOrEvent : 'encounter:' + idOrEvent;
    const ctx = this._ctx();
    return this.beats.some((b) => b.def.trigger?.type === 'event' && b.def.trigger.event === ev && (!b.def.if || checkCond(b.def.if, ctx)) && hasReply(resolveLines(b.def.lines, ctx)));
  }
  /** C: call after the encounter's own lines; resolves when the ride's beat has played. */
  async encounterBeat(id) {
    const ownsReply = this.beatOwnsReply(id);
    const st = (this._encBeat[id] ||= { started: true, played: false });
    if (st.played) return { played: false, ownsReply };
    st.played = true;
    const before = this.beats.filter((b) => b.def.trigger?.type === 'event' && b.def.trigger.event === 'encounter:' + id && !b.fired);
    this.emit('encounter:' + id);
    const items = before.filter((b) => b.fired && !b.done);
    if (!items.length) return { played: false, ownsReply };
    await until(() => !this.alive || items.every((b) => b.done), 40);
    return { played: true, ownsReply };
  }

  _encountersUpdate() {
    for (const e of this.encs) {
      if (e.fired || this.progress < e.at) continue;
      e.fired = true;
      if (e.id === 'fatherCall') continue; // ride 9's gate is staged by the finale
      if (e.optional && Math.random() < 0.35) continue;
      if (e.id === 'meter444') {
        // the rule side of 444 is B's (meter, stop, count, reply, chain, monk exception)
        const handle = this.startEncounter('meter444');
        g.rules?.arm('r11', { encounter: handle || 'meter444', params: { monk: this.data.id === 'monk' } });
        continue;
      }
      this.startEncounter(e.id);
    }
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    if (!this.alive) return;
    this.time += dt;
    this.passenger.update(dt);
    if (this.passenger.aboard && this.phase !== 'gate') {
      this.tSeated += dt;
      this._track(dt);
      this._beatsUpdate(dt);
      this._encountersUpdate();
      this._genericEvents(dt);
      this._speedCap();
    }
    this._pump();
  }

  _track(dt) {
    const r = taxiRoad();
    if (r && r.id === 'main') {
      if (this._lastS !== undefined) {
        const ds = r.s - this._lastS;
        if (ds > 0 && ds < 6) this.dist += ds;
      }
      this._lastS = r.s;
    } else this._lastS = undefined;
    const minS = this.data.pacing?.minSeconds || 120;
    const p = Math.min(this.dist / this.route, this.tSeated / minS);
    this.progress = clamp(Math.max(this.progress, p), 0, 1);
    // the clock eases through the hour while the ride lasts
    const h = this.data.hour;
    const span = this.data.id === 'somchai' ? 0.67 : 0.85;
    g.clock?.advanceTo(h + 0.08 + span * this.progress);
  }

  _genericEvents(dt) {
    const t = g.taxi;
    const v = t.speedKmh;
    if (v > DEP.speedingKmh) {
      if (!this._speeding) this.emit('speeding');
      this._speeding = true;
    } else if (v < DEP.speedingKmh - 10) this._speeding = false;
    this._stopT = v < 2 ? this._stopT + dt : 0;
    if (this._stopT > DEP.stoppedSeconds && !this._stoppedFired) {
      this._stoppedFired = true;
      this.emit('stopped');
    }
    if (v > 10) this._stoppedFired = false;
    if (!t.state.meterOn && this.tSeated > DEP.meterOffTooLongSeconds && !this._meterNag) {
      this._meterNag = true;
      this.emit('meterOffTooLong');
    }
  }

  _speedCap() {
    let cap = this.data.pacing?.speedCapKmh;
    if (this.phase === 'forkApproach') cap = Math.min(cap ?? 999, 42);
    if (!cap || !g.taxi.controlsEnabled) return;
    const over = g.taxi.speedKmh - cap;
    if (over > 0) input.axis.throttle *= clamp(1 - over / 8, 0, 1);
  }

  // ------------------------------------------------------------------ pickup
  async pickup() {
    const p = this.passenger;
    const t = g.taxi;
    this.phase = 'approach';
    let hailed = false;
    let passes = 0;
    while (this.alive) {
      await wait(0);
      if (!this.alive) return false;
      const r = taxiRoad();
      const onFoot = g.actions ? !!g.actions.onFoot : !t.isCameraInside();
      if (!r || r.id !== 'main' || onFoot) continue;
      const ahead = this.stopS - r.s;
      if (ahead < 95 && ahead > -20) {
        this.phase = 'pickup';
        p.hail(true);
        if (!hailed && ahead < 60) {
          hailed = true;
          this.playBlock('hail');
        }
      }
      // stopped for them?
      const d = t.root.position.distanceTo(this.pickupLm.stopPos);
      const dp = t.root.position.distanceTo(p.humanoid.root.position);
      if (t.speedKmh < RP.hailStopSpeedKmh && (d < RP.hailStopRadiusM || dp < RP.hailStopRadiusM + 3)) break;
      // r1: drove past someone who hailed: the road folds back to them
      if (-ahead > RP.passByFoldMeters && hailed) {
        passes++;
        g.knowledge?.learnRule('r1');
        bus.emit('rule:event', { ruleId: 'r1', phase: passes >= 3 ? 'violated' : 'warn', source: 'rules' });
        if (passes >= 3) {
          g.kill?.('roadFold', { cause: 'r1' });
          return false;
        }
        await foldBack(-ahead + 150, { tint: '#9aa7a0' });
        hailed = false;
        g.audio?.play?.('sting_low', { volume: 0.4 + passes * 0.2 });
        if (passes === 2) g.ui?.hint?.({ th: 'รับเขา', en: 'Pick them up', duration: 3 });
      }
    }
    if (!this.alive) return false;
    // board: the car holds still while they get in
    this.phase = 'boarding';
    const hold = g.engine.onUpdate(() => {
      t.physicsSim.input.brake = 1;
      t.physicsSim.input.throttle = 0;
    }, 11);
    t.setControlsEnabled(false);
    try {
      await p.board();
    } finally {
      hold();
    }
    if (!this.alive) return false;
    t.setControlsEnabled(true);
    // Boy M: the meter starts by itself
    if (this.data.id === 'boyM' && !t.state.meterOn) setTimeout(() => this.alive && t.setControl('meter', true), 1800);
    this.phase = 'riding';
    this._lastS = undefined;
    return true;
  }

  // ------------------------------------------------------------------ the ride to the fork
  /** Riding until the fork is taken. Resolves 'left' | 'right' (or null if halted). */
  async ride(opts = {}) {
    const t = g.taxi;
    this.phase = 'riding';
    if (!opts.resume) {
      this.playBlock('greet');
      this.playBlock('destination');
    }
    let folding = false;
    let approachFired = false;
    while (this.alive) {
      await wait(0);
      if (!this.alive) return null;
      const r = taxiRoad();
      if (!r) continue;
      if (r.id === 'ghost' || r.id === 'human') {
        if (r.s > 4) return r.id === 'ghost' ? 'left' : 'right';
        continue;
      }
      if (r.id !== 'main') continue;
      const remaining = this.forkS - r.s;
      const minS = this.data.pacing?.minSeconds || 120;
      const ready = this.tSeated >= minS * 0.9 && this.essentialsDone();
      // the fork is too near while the story still needs time: the road lengthens in the fog
      if (!ready && remaining < 110 && !folding && r.s > this.stopS) {
        folding = true;
        const back = Math.min(320, Math.max(80, r.s - (this.stopS + 40)));
        const mist = this.data.pacing?.stretch === 'mist';
        await foldBack(back, { tint: mist ? '#f2e6d0' : '#7d8a86', after: mist ? 1.6 : 1.3 });
        folding = false;
        continue;
      }
      if (!approachFired && (ready || this.progress >= DEP.forkApproachProgress) && remaining < 170 && remaining > -5) {
        approachFired = true;
        this.phase = 'forkApproach';
        this.emit('forkApproach');
        bus.emit('ride:forkApproach', { ride: this.id });
        this._approachFx();
      }
      // passing the decision point by the lateral offset (projection still on main)
      if (r.s >= this.forkS && Math.abs(r.lateral) > RP.forkDecisionLateralM + 1.5) return r.lateral < 0 ? 'left' : 'right';
      void t;
    }
    return null;
  }

  /** Shrine approach: fog thickens, the music tightens, lanterns breathe. */
  _approachFx() {
    g.sky?.setFogBoost?.(2.1, 4);
    g.sky?.setGroundMist?.(1.8, 4);
    g.audio?.music?.setMood?.(g.clock.hour >= 28 ? 'dawn' : 'tension', { fade: 4 });
    g.audio?.play?.('bell_temple', { position: g.world.fork.pos, volume: 0.5 });
  }

  // ------------------------------------------------------------------ teardown
  _flush() {
    for (const it of this.queue.splice(0)) it.resolve?.({ completed: false, choices: {} });
    this.playing?.resolve?.({ completed: false, choices: {} });
    this.playing = null;
  }
  /** Delivered: listeners off, nothing more to say; the passenger keeps walking until dispose(). */
  retire() {
    this.alive = false;
    this.phase = 'done';
    for (const off of this._offs.splice(0)) off();
    this._flush();
    if (g.ride === this || !g.ride) g.dialogue.alias(this.data.characterId, null);
  }
  halt() {
    this.alive = false;
    this.passenger.frozen = true;
    this._flush();
  }
  dispose() {
    this.alive = false;
    for (const off of this._offs.splice(0)) off();
    this._flush();
    for (const h of Object.values(this.encHandles)) {
      try {
        h?.stop?.();
      } catch (e) {
        /* ignore */
      }
    }
    this.encHandles = {};
    const h = this.passenger.humanoid;
    this.passenger.dispose();
    if (g.dialogue.aliases.get(this.data.characterId) === 'passenger' && g.ride === this) g.dialogue.alias(this.data.characterId, null);
    // only drop the speaker if a newer ride has not replaced it
    if (g.dialogue.speakers.get('passenger')?.humanoid === h) g.dialogue.removeSpeaker('passenger');
  }
}

void THREE;
