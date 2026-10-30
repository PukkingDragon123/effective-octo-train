// RuleMonitor (g.rules, engineer B): watches all 16 rules of the paper (data: rules.js RULES /
// RULE_PARAMS / RULE_BREAKS). Only B decides a death (g.kill). Warnings first (whispers, cold
// glass, fog, horror tint, heartbeat), then the kill.
//
// ---- contract for encounters (C) ----------------------------------------------------------------
//   g.rules.arm(ruleId, { encounter, until, params }) -> record
//     encounter: the director handle ({id, done, outcome(key), stop()}) or an encounter id.
//     until: seconds the dangerous window lasts (default: per rule, or until encounter.done).
//     params (optional): r3 {mode:'death'|'ending', death, seat}  r12 {position: Vector3 of the figure}
//                        r13 {exception:true} (betel)  r15 {exception:true} (father's dedication)
//     r5: arm right AFTER the third knock (the danger window is RULE_PARAMS.knockDangerSeconds).
//     r11: B stages the rule side of 444 itself (the meter shows 444.00, the stop, the counting voice
//          once stopped, the reply, the windowKnock chain after midnight, the monk exception);
//          C's meter444 encounter only adds visuals/presence (no countLines, no choice).
//   g.rules.disarm(ruleId, outcomeKey?) · g.rules.isArmed(ruleId) · g.rules.violate(ruleId, outcomeKey)
//   On every resolution B calls handle.outcome(key) with the ENCOUNTERS[id].outcomes key it decided
//   (e.g. 'kept' / 'stopped', 'off' / 'ignored', 'passed' / 'braked' / 'swerved'); C plays its lines.
//   C reports a reply it played itself (an encounter's own choice) with
//   bus.emit('rule:event', { ruleId, phase:'violated', encounterId, outcome:'answer' }) or g.rules.violate().
//   B emits bus 'rule:event' { ruleId, phase:'start'|'warn'|'resolved'|'violated', encounterId, outcome, source:'rules' }.
//   Dialogue events for the ride go through g.ride.emit(name) (C may call it too: knock1, knock3...).
//   g.rules.respect (0..respectMax) = r10 honks this night (encounters with respectSoftens read it).
//
// ---- replies ---------------------------------------------------------------------------------------
//   'dialogue:line' with line.set.ruleBreak: the rest of the branch plays, then RULE_BREAKS[id]
//   applies (outcome on the rule's running encounter, death or escalation), flags.ruleBreak cleared.
//   line.set.lure ('r3'|'r4'): the camera drifts toward the forbidden look (RULE_PARAMS.lure*);
//   any deliberate look input cancels it.
import * as THREE from 'three';
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { input } from '../../core/Input.js';
import { DEG, clamp, damp, lerp, wrapAngle } from '../../core/math.js';
import { RULE_PARAMS as RP, RULE_BREAKS } from '../data/rules.js';
import { ENCOUNTERS } from '../data/encounters.js';
import { resolveLines, checkCond } from '../data/logic.js';
import { wait } from '../util.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const rand = (r) => (Array.isArray(r) ? r[0] + Math.random() * (r[1] - r[0]) : r);
const V = (th, en, x = {}) => ({ who: 'voice', th, en, tone: 'whisper', ...x });

/** Default dangerous-window lengths (seconds) when the arming encounter gives none. */
const DEFAULT_UNTIL = {
  r3: 10, r5: RP.knockDangerSeconds, r6: RP.radioGraceSeconds + RP.radioEscalateSeconds + 2, r7: 12, r8: () => rand(RP.breathDurationSeconds),
  r9: () => rand(RP.cabinLightEventSeconds), r11: 45, r12: 22, r13: 14, r14: 16, r15: RP.radioNameTuneSeconds + 1, r16: () => rand(RP.extraPassengerSeconds),
};
/** Outcome key used when a rule's window simply runs out (survived). */
const SAFE_OUTCOME = { r3: 'drove', r5: 'kept', r6: 'off', r7: 'silent', r8: 'held', r9: 'waited', r11: 'silent', r12: 'passed', r13: 'letRun', r14: 'silent', r15: 'retuned', r16: 'silent' };

const SHRINE_KINDS = new Set(['spirit_cluster', 'sacred_tree', 'spirit_house', 'shrine_approach', 'shrine_maruay', 'forest_temple']);

export class RuleMonitor {
  constructor() {
    this.armed = new Map();
    this.suspended = false;
    this.threat = 0;
    this._horror = 0;
    this._offs = [];
    this.look = { t: 0, stare: 0, cool: 0, warnCool: 0, fired: false };
    this.face = { t: 0, warned: false, cool: 0, humanCool: 0 };
    this.lure = null;
    this.pendingBreak = null;
    this.escalation = null;
    this.honk = { last: -10, done: new Set() };
    this._whisperCool = 0;
    this._heart = null;
    this._time = 0;
    this._shrines = null;
    this._install();
  }

  // =================================================================== public
  get respect() {
    return g.save?.flags?.respect || 0;
  }
  set respect(v) {
    if (g.save) g.save.flags.respect = clamp(v, 0, RP.respectMax);
  }
  isArmed(id) {
    return this.armed.has(id);
  }
  get(id) {
    return this.armed.get(id) || null;
  }
  /** Pause all checks (death cinematics, cutscenes). */
  suspend(on = true) {
    this.suspended = !!on;
    if (on) {
      this.lure = null;
      this.escalation = null;
    }
  }
  /** New night / new shift: forget everything armed. */
  reset() {
    for (const rec of this.armed.values()) this._cleanup(rec);
    this.armed.clear();
    this.suspended = false;
    this.lure = null;
    this.pendingBreak = null;
    this.escalation = null;
    this.honk.done.clear();
    this.look = { t: 0, stare: 0, cool: 0, warnCool: 0, fired: false };
    this.face = { t: 0, warned: false, cool: 0, humanCool: 0 };
    this.threat = 0;
    this._sadDone = false;
    this.amuletHeld = false;
    this._setHorror(0, true);
    this._heart?.stop?.(0.3);
    this._heart = null;
  }

  arm(ruleId, opts = {}) {
    if (this.suspended && !opts.force) return null;
    const enc = opts.encounter;
    const handle = enc && typeof enc === 'object' ? enc : null;
    const encId = handle?.id || (typeof enc === 'string' ? enc : null) || opts.encounterId || null;
    let rec = this.armed.get(ruleId);
    if (rec) {
      if (handle && !rec.handle) rec.handle = handle;
      if (encId && !rec.encId) rec.encId = encId;
      Object.assign(rec.params, opts.params || {});
      if (opts.until != null) rec.until = Math.max(rec.until, rec.t + opts.until);
      return rec;
    }
    const du = DEFAULT_UNTIL[ruleId];
    rec = {
      ruleId, handle, encId, params: { ...(opts.params || {}) }, t: 0, st: {},
      until: opts.until ?? (typeof du === 'function' ? du() : du ?? 15),
      exception: !!(opts.params?.exception || (encId && ENCOUNTERS[encId]?.exception)),
    };
    this.armed.set(ruleId, rec);
    if (handle?.done?.then) {
      handle.done.then(() => {
        // the encounter ended on its own: the window closes as survived (unless a handler holds it)
        if (this.armed.get(ruleId) === rec && !rec.st.hold) this._resolve(rec, SAFE_OUTCOME[ruleId]);
      }, () => {});
    }
    this._emit(rec, 'start');
    try {
      H[ruleId]?.start?.call(this, rec);
    } catch (e) {
      console.error('[rules] start', ruleId, e);
    }
    return rec;
  }

  disarm(ruleId, outcome) {
    const rec = this.armed.get(ruleId);
    if (!rec) return;
    this._resolve(rec, outcome || SAFE_OUTCOME[ruleId]);
  }

  /** External (encounter-played) violation, e.g. C's own choice got 'answer'. */
  violate(ruleId, outcome, opts = {}) {
    const rec = this.armed.get(ruleId) || { ruleId, handle: opts.handle || null, encId: opts.encounterId || null, params: {}, t: 0, st: {}, external: true };
    this._violate(rec, outcome, opts.death);
  }

  // =================================================================== install
  _install() {
    const on = (n, f) => this._offs.push(bus.on(n, f));
    on('dialogue:line', ({ line } = {}) => {
      const set = line?.set;
      if (!set) return;
      if (set.ruleBreak) this.pendingBreak = { rule: set.ruleBreak, t: 0 };
      if (set.lure) this._startLure(set.lure);
    });
    on('rule:event', (e) => {
      if (!e || e.source === 'rules' || e.phase !== 'violated' || !e.ruleId) return;
      this.violate(e.ruleId, e.outcome, { encounterId: e.encounterId, death: e.death });
    });
    on('taxi:control', (d) => this._onControl(d || {}));
    on('game:state', () => {
      this.lure = null;
    });
    on('amulet:hold', (d) => {
      this.amuletHeld = !!d?.active;
    });
    this._offUpdate = g.engine.onUpdate((dt) => this.update(dt), 2);
  }

  _onControl({ control, value }) {
    if (this.suspended) return;
    if (control === 'horn' && value === true) this._onHorn();
    for (const rec of this.armed.values()) H[rec.ruleId]?.control?.call(this, rec, control, value);
    if (this.escalation?.control) this.escalation.control(control, value);
  }

  // =================================================================== helpers
  _emit(rec, phase, outcome) {
    bus.emit('rule:event', { ruleId: rec.ruleId, phase, encounterId: rec.encId || null, outcome: outcome || null, source: 'rules' });
  }
  _rideEmit(ev) {
    g.ride?.emit?.(ev);
  }
  get taxi() {
    return g.taxi;
  }
  /** In the driver's seat, view attached to the taxi. */
  _inCab() {
    const t = g.taxi;
    if (!t || g.cameraRig.inCinematic || !t.isCameraInside()) return false;
    // the view's forward frame must be the taxi (its root or anything mounted in it)
    for (let o = g.cameraRig.base; o; o = o.parent) if (o === t.root) return true;
    return false;
  }
  _speed() {
    return g.taxi?.speedKmh || 0;
  }
  _gaze() {
    return this._inCab() ? g.taxi.getGazeTarget() : null;
  }
  _isGlass(gz) {
    return !!gz && gz !== 'interior';
  }
  /** Direction (yaw, pitch in the taxi frame) from the driver's eye to a world point. */
  _yawPitchTo(world) {
    const t = g.taxi;
    const eye = t.anchors.driverEye.getWorldPosition(_v2);
    _v.copy(world).sub(eye);
    t.root.getWorldQuaternion(_q).invert();
    _v.applyQuaternion(_q);
    return { yaw: Math.atan2(-_v.x, -_v.z), pitch: Math.atan2(_v.y, Math.hypot(_v.x, _v.z)) };
  }
  _raise(v) {
    this.threat = Math.max(this.threat, v);
  }
  _whisper(lines, opts = {}) {
    if (this._whisperCool > 0 && !opts.force) return;
    this._whisperCool = opts.cool ?? 3;
    const t = g.taxi;
    const obj = opts.object || t?.anchors?.[Math.random() < 0.5 ? 'rearRightSeat' : 'rearLeftSeat'] || null;
    g.audio?.play?.('whisper', { object: obj, volume: opts.volume ?? 0.55 });
    if (lines?.length) {
      const l = lines[(Math.random() * lines.length) | 0];
      if (g.dialogue.idle) g.dialogue.play(resolveLines([l], { save: g.save }));
    }
  }
  _chill(amount = 0.45) {
    g.taxi?.setFog('all', amount);
  }
  _setHorror(v, force = false) {
    const p = g.postfx?.params;
    if (!p) return;
    if (force || v > 0.004 || this._horror > 0.004) {
      p.horror = clamp(v, 0, 1);
      this._horror = v;
    }
  }

  _resolve(rec, outcome) {
    if (this.armed.get(rec.ruleId) === rec) this.armed.delete(rec.ruleId);
    if (rec.done) return;
    rec.done = true;
    try {
      H[rec.ruleId]?.end?.call(this, rec, 'resolved', outcome);
    } catch (e) {
      console.error(e);
    }
    this._cleanup(rec);
    try {
      if (outcome) rec.handle?.outcome?.(outcome);
    } catch (e) {
      console.warn('[rules] outcome failed', e);
    }
    this._emit(rec, 'resolved', outcome);
    g.knowledge?.learnRule(rec.ruleId);
  }

  /**
   * Break: play the encounter outcome (its lines), then the death / escalation it leads to.
   * deathType overrides; otherwise ENCOUNTERS[encId].outcomes[outcome].result decides.
   */
  async _violate(rec, outcome, deathType) {
    if (rec.done) return;
    rec.done = true;
    if (this.armed.get(rec.ruleId) === rec) this.armed.delete(rec.ruleId);
    try {
      H[rec.ruleId]?.end?.call(this, rec, 'violated', outcome);
    } catch (e) {
      console.error(e);
    }
    this._cleanup(rec);
    this._emit(rec, 'violated', outcome);
    g.knowledge?.learnRule(rec.ruleId);
    let result = deathType ? `death:${deathType}` : null;
    const def = rec.encId ? ENCOUNTERS[rec.encId] : null;
    if (!result && def?.outcomes?.[outcome]) result = def.outcomes[outcome].result;
    if (!result) result = rec.st.death ? `death:${rec.st.death}` : null;
    if (rec.exception && result?.startsWith('death:')) result = 'safe'; // designed exceptions never kill
    try {
      rec.handle?.outcome?.(outcome);
    } catch (e) {
      console.warn('[rules] outcome failed', e);
    }
    if (!result || result === 'safe') return;
    // let the thing answer (C's outcome lines) before the end
    if (rec.handle?.done) await Promise.race([rec.handle.done, wait(2.4)]);
    else if (def?.outcomes?.[outcome]?.lines?.length && !rec.handle) {
      await Promise.race([g.dialogue.play(resolveLines(def.outcomes[outcome].lines, { save: g.save })), wait(3)]);
    } else await wait(0.6);
    if (result.startsWith('death:')) g.kill?.(result.slice(6), { cause: rec.ruleId });
    else if (result.startsWith('escalate:')) this.escalate(result.slice(9));
    else if (result.startsWith('ending:')) bus.emit('rules:ending', { id: result.slice(7), ruleId: rec.ruleId });
  }

  _cleanup(rec) {
    try {
      H[rec.ruleId]?.cleanup?.call(this, rec);
    } catch (e) {
      console.error(e);
    }
  }

  // =================================================================== frame
  update(dt) {
    this._time += dt;
    this._whisperCool -= dt;
    this.threat = 0;
    const active = g.fsm?.is('shift') || g.fsm?.is('tutorial') || g.fsm?.is('garage');
    if (!this.suspended && active && !g.engine.paused) {
      for (const rec of [...this.armed.values()]) {
        rec.t += dt;
        try {
          const h = H[rec.ruleId];
          if (h?.update) h.update.call(this, rec, dt);
          if (this.armed.get(rec.ruleId) === rec && !rec.st.hold && rec.t >= rec.until) {
            if (h?.expire) h.expire.call(this, rec);
            else this._resolve(rec, SAFE_OUTCOME[rec.ruleId]);
          }
        } catch (e) {
          console.error('[rules] update', rec.ruleId, e);
        }
      }
      if (g.fsm.is('shift')) {
        this._lookBack(dt);
        this._faceGaze(dt);
      }
      this._updateLure(dt);
      this._updateBreak(dt);
      this.escalation?.update?.(dt);
    }
    // warnings presentation (never while a death cinematic owns the screen)
    if (this.suspended) {
      this._horror = 0;
      this._heart?.stop?.(0.3);
      this._heart = null;
      return;
    }
    const k = this.threat;
    this._setHorror(damp(this._horror, k * 0.75, k > this._horror ? 3 : 1.2, dt));
    if (k > 0.35 && !this._heart && g.audio?.loop) this._heart = g.audio.loop('heartbeat', { volume: 0 });
    if (this._heart) {
      this._heart.setVolume?.(clamp((k - 0.2) * 1.2, 0, 0.9), 0.3);
      this._heart.setRate?.(1 + k * 0.6);
      if (k < 0.05) {
        this._heartOff = (this._heartOff || 0) + dt;
        if (this._heartOff > 3) {
          this._heart.stop?.(0.5);
          this._heart = null;
          this._heartOff = 0;
        }
      } else this._heartOff = 0;
    }
  }

  // =================================================================== r3 never look back
  _r3Policy() {
    const rec = this.armed.get('r3');
    if (rec) return { kind: rec.params.mode || 'death', death: rec.params.death || 'lookBack', rec, ending: rec.params.ending, setOnLookBack: rec.params.setOnLookBack };
    const ride = g.ride;
    if (!ride?.passenger?.aboard) return null;
    const rules = (ride.data.specialRules || []).filter((r) => r.rule === 'r3');
    if (!rules.length) return { kind: 'warn' };
    const phase = ride.r3Phase || 'early';
    const r = rules.find((x) => x.phase === phase) || rules.find((x) => !x.phase) || rules[0];
    if (r.phase && r.phase !== phase) return null;
    const lb = r.lookBack || 'warn';
    if (lb.startsWith('ending:')) return { kind: 'ending', ending: lb.slice(7), setOnLookBack: r.setOnLookBack };
    return { kind: lb, setOnLookBack: r.setOnLookBack, death: 'lookBack' };
  }

  _lookBack(dt) {
    const L = this.look;
    L.cool -= dt;
    L.warnCool -= dt;
    if (!this._inCab()) {
      L.t = 0;
      L.stare = 0;
      return;
    }
    const pol = this._r3Policy();
    const yawDeg = Math.abs(g.cameraRig.yaw) / DEG;
    const back = yawDeg > RP.lookBackYawDeg;
    L.t = back ? L.t + dt : 0;
    // staring at the rear seat during a back-seat event
    let stare = false;
    if (pol?.rec) {
      const seat = g.taxi.anchors[pol.rec.params.seat === 'rearLeft' ? 'rearLeftSeat' : 'rearRightSeat'].getWorldPosition(_v);
      _v.y += 0.45;
      stare = g.cameraRig.isLookingAt(_v, RP.rearSeatStareConeDeg) && this._gaze() === 'interior';
    }
    L.stare = stare ? L.stare + dt : Math.max(0, L.stare - dt * 2);
    if (!pol) return;
    const dangerous = pol.kind === 'death' || pol.kind === 'ending';
    // warning gradient as the head turns toward the back seat
    if (dangerous && yawDeg > 70) {
      const k = clamp((yawDeg - 70) / (RP.lookBackYawDeg - 70), 0, 1);
      this._raise(0.25 + k * 0.6);
      if (k > 0.45 && L.warnCool <= 0) {
        L.warnCool = 4;
        this._whisper([V('หันมาสิ...', 'Turn around...'), V('อีกนิด...', 'A little more...')], { force: true, cool: 2 });
      }
    }
    const fired = L.t > 0.15 || L.stare > RP.rearSeatStareSeconds;
    if (!fired) {
      if (!back) L.fired = false;
      return;
    }
    if (L.fired) return;
    L.fired = true;
    if (pol.setOnLookBack && g.save) Object.assign(g.save.flags, pol.setOnLookBack);
    switch (pol.kind) {
      case 'warn':
        if (L.cool <= 0) {
          L.cool = 22;
          this._rideEmit('lookBack');
          g.ride?.playBlock?.('onLookBack', { interrupt: true });
        }
        break;
      case 'sad':
        if (!this._sadDone) {
          this._sadDone = true;
          this._rideEmit('lookBack');
          g.ride?.playBlock?.('onLookBack', { interrupt: true });
        }
        break;
      case 'ending':
        this._rideEmit('lookBack');
        bus.emit('rules:lookBack', { ending: pol.ending, ruleId: 'r3' });
        if (pol.rec) this._resolve(pol.rec, 'lookedBack');
        break;
      case 'death':
      default: {
        this._rideEmit('lookBack');
        const rec = pol.rec || { ruleId: 'r3', handle: null, encId: null, params: {}, t: 0, st: {} };
        this._violate(rec, 'lookedBack', pol.death || 'lookBack');
        break;
      }
    }
  }

  // =================================================================== r4 no reflection: no face
  _faceGaze(dt) {
    const F = this.face;
    F.cool -= dt;
    F.humanCool -= dt;
    const p = g.ride?.passenger;
    if (!p || !p.seated || p.disposed || !this._inCab()) {
      F.t = Math.max(0, F.t - dt * RP.faceGazeDecayPerSec);
      return;
    }
    const gz = this._gaze();
    // a direct look (not through a mirror) at the face
    const looking = !(gz && gz.startsWith('mirror')) && g.cameraRig.isLookingAt(p.headPosition, RP.faceGazeConeDeg, 3);
    if (p.reflection === 'only') return; // nothing to see directly (boy M: the exception)
    const ruled = p.reflection === 'none' || this.armed.has('r4');
    F.t = looking ? F.t + dt : Math.max(0, F.t - dt * RP.faceGazeDecayPerSec);
    if (!ruled) {
      // people just ask why you stare
      if (F.t > RP.faceGazeSeconds && F.humanCool <= 0) {
        F.humanCool = 30;
        F.t = 0;
        this._rideEmit('faceGaze');
        g.ride?.playBlock?.('onFaceGaze');
      }
      return;
    }
    if (F.t > 0.05) this._raise(clamp(F.t / RP.faceGazeSeconds, 0, 1) * 0.9);
    if (F.t >= RP.faceGazeWarnSeconds && !F.warned) {
      F.warned = true;
      this._rideEmit('faceGazeWarn');
      g.audio?.play?.('sting_low', { volume: 0.4 });
      this._chill(0.55);
      p.leanIn(6);
      g.ride?.playBlock?.('onFaceGazeWarn', { interrupt: true });
    }
    if (F.t < 0.05) F.warned = false;
    if (F.t >= RP.faceGazeSeconds) {
      F.t = 0;
      this._rideEmit('faceGaze');
      const rec = this.armed.get('r4') || { ruleId: 'r4', handle: null, encId: null, params: {}, t: 0, st: {} };
      if (this.armed.get('r4') === rec) this.armed.delete('r4');
      rec.done = true;
      this._emit(rec, 'violated', 'faceGaze');
      g.knowledge?.learnRule('r4');
      g.kill?.('trueForm', { cause: 'faceGaze', block: 'onFaceGaze' });
    }
  }

  // =================================================================== lure (camera drift)
  _startLure(rule) {
    if (g.save?.flags) delete g.save.flags.lure;
    if (!this._inCab()) return;
    this.lure = { rule, t: 0, total: RP.lureSeconds };
    if (rule === 'r4') g.ride?.passenger?.leanIn(RP.lureSeconds + 5);
  }
  _updateLure(dt) {
    const L = this.lure;
    if (!L) return;
    L.t += dt;
    const mv = Math.abs(input.look.dx) + Math.abs(input.look.dy);
    if (L.t > L.total || mv > 0.0025 || !this._inCab()) {
      this.lure = null;
      return;
    }
    let target;
    if (L.rule === 'r4' && g.ride?.passenger?.seated) target = g.ride.passenger.headPosition;
    else {
      const seat = g.ride?.passenger?.seatId === 'rearLeft' ? 'rearLeftSeat' : 'rearRightSeat';
      target = g.taxi.anchors[seat].getWorldPosition(_v).add(_v2.set(0, 0.55, 0));
    }
    const { yaw, pitch } = this._yawPitchTo(target);
    const step = RP.lureYawDegPerSec * DEG * dt;
    const rig = g.cameraRig;
    const dy = wrapAngle(yaw - rig.yaw);
    rig.yaw += clamp(dy, -step, step);
    rig.pitch += clamp(pitch - rig.pitch, -step * 0.5, step * 0.5);
    this._raise(0.35);
  }

  // =================================================================== replies that break rules
  _updateBreak(dt) {
    const B = this.pendingBreak;
    if (!B) return;
    B.t += dt;
    if (!(g.dialogue.idle || B.t > 12)) return;
    this.pendingBreak = null;
    if (g.save?.flags) delete g.save.flags.ruleBreak;
    const rb = RULE_BREAKS[B.rule];
    if (!rb) return;
    const rec = this.armed.get(B.rule) || { ruleId: B.rule, handle: null, encId: null, params: {}, t: 0, st: {} };
    if (rb.escalate) {
      if (!rec.done) {
        if (this.armed.get(B.rule) === rec) this.armed.delete(B.rule);
        rec.done = true;
        try {
          H[B.rule]?.end?.call(this, rec, 'violated', rb.outcome);
        } catch (e) {
          console.error(e);
        }
        this._cleanup(rec);
        try {
          rec.handle?.outcome?.(rb.outcome);
        } catch (e) {
          /* ignore */
        }
        this._emit(rec, 'violated', rb.outcome);
      }
      g.knowledge?.learnRule(B.rule);
      this.escalate(rb.escalate, rb.death);
    } else this._violate(rec, rb.outcome, rb.death);
  }

  // =================================================================== escalations
  escalate(kind, death) {
    if (this.suspended) return;
    if (kind === 'windowCreep') this._windowCreep(death || 'windowArm');
    else if (kind === 'backSeatVoice') this._backSeatVoice(death || 'lookBack');
  }

  /** r14 invite: the driver's window winds itself down; crank it up in time or the arm comes in. */
  _windowCreep(death) {
    const t = g.taxi;
    const id = 'fr';
    t.setControl('window', { window: id, amount: 1 }, { speed: RP.windowCreepPerSec });
    g.audio?.play?.('window_crank', { object: t.anchors.windowCrankFR, volume: 0.7, rate: 0.7 });
    const esc = {
      t: 0,
      saved: false,
      control: (control, value) => {
        // any crank on the driver's window (key, or the handle) counts as winding it back up
        if (esc.saved) return;
        if (control === 'window' && (value?.window ?? 'fr') === id && esc.t > 0.1) {
          esc.saved = true;
          t.setControl('window', { window: id, amount: 0 }, { speed: 0.7 });
        }
      },
      update: (dt) => {
        esc.t += dt;
        if (input.pressed('window') && esc.t > 0.1 && !esc.saved) esc.control('window', { window: id });
        this._raise(esc.saved ? 0.2 : 0.4 + esc.t * 0.15);
        if (!esc.saved && (esc.t > RP.windowCreepCrankSeconds || t.state.windows[id] > RP.windowOpenFailAmount)) {
          this.escalation = null;
          g.kill?.(death, { cause: 'r14' });
        } else if (esc.saved && t.state.windows[id] < 0.02) {
          this.escalation = null;
          g.audio?.play?.('scratch_glass', { object: t.anchors.windowCrankFR, volume: 0.6 });
        }
      },
    };
    this.escalation = esc;
  }

  /** r15: the radio voice moves to the back seat ("ต้น… หันมาสิ"): a rule-3 test. */
  async _backSeatVoice(death) {
    const t = g.taxi;
    await wait(1.8); // the radio's answer first
    if (this.suspended) return;
    g.dialogue.setSpeaker('backSeat', { nameTH: '', nameEN: '', voice: { gender: 'f', age: 35, ghost: 0.85, whisper: true, pitch: 0.9 }, humanoid: null, object: t.anchors.rearRightSeat });
    g.audio?.play?.('breath_neck', { object: t.anchors.rearRightSeat, volume: 0.6 });
    this.arm('r3', { until: 10, params: { mode: 'death', death, seat: 'rearRight' }, force: true });
    const lines = [
      { who: 'backSeat', th: 'ต้น...', en: 'Ton...', tone: 'whisper', pause: 1.2 },
      { who: 'backSeat', th: 'ต้น... หันมาสิ', en: 'Ton... turn around.', tone: 'whisper', pause: 1.6 },
      { who: 'backSeat', th: 'พี่อยู่ข้างหลังนี่เอง', en: "I'm right behind you.", tone: 'whisper', pause: 1.4 },
    ];
    g.dialogue.interrupt();
    g.dialogue.play(lines);
  }

  // =================================================================== r10 honk twice at shrines
  _shrineList() {
    if (this._shrines) return this._shrines;
    const out = [];
    const w = g.world;
    for (const lm of Object.values(w?.landmarks || {})) {
      if (!SHRINE_KINDS.has(lm.kind)) continue;
      out.push({ id: lm.key, pos: (lm.centre || lm.pos).clone(), main: lm.kind === 'shrine_maruay' || lm.kind === 'shrine_approach' });
    }
    for (const it of w?.placement?.items || []) {
      if (it.type !== 'spirit') continue;
      try {
        out.push({ id: `spirit:${it.id}:${Math.round(it.s)}`, pos: w.road.get(it.id).pointAt(it.s, it.lat), main: false });
      } catch (e) {
        /* ignore */
      }
    }
    this._shrines = out;
    return out;
  }
  _onHorn() {
    const now = this._time;
    const second = now - this.honk.last < RP.honkWindowSeconds;
    this.honk.last = second ? -10 : now;
    if (!second || !g.taxi) return;
    const p = g.taxi.root.position;
    let best = null, bd = RP.honkShrineRadiusM;
    for (const s of this._shrineList()) {
      const d = Math.hypot(s.pos.x - p.x, s.pos.z - p.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    // the shrine at the fork counts from the whole approach
    const fork = g.world?.fork;
    if (!best && fork && g.ride?.phase === 'forkApproach') best = { id: 'shrineMaRuay', main: true };
    if (!best) return;
    if (!this.honk.done.has(best.id)) {
      this.honk.done.add(best.id);
      this.respect = this.respect + RP.respectPerHonk;
      g.knowledge?.learnRule('r10');
      bus.emit('rule:event', { ruleId: 'r10', phase: 'resolved', outcome: 'honked', shrine: best.id, respect: this.respect, source: 'rules' });
      // the spirits answer: a soft bell
      g.audio?.play?.('wind_chime', { position: best.pos || p, volume: 0.4 });
    }
    this._rideEmit('honkShrine');
  }
}

// ===================================================================== per-rule handlers
// this = RuleMonitor; rec = { ruleId, handle, encId, params, t, until, st, exception }
const H = {
  // ---- r5 three knocks: do not stop -----------------------------------------------------------
  r5: {
    start(rec) {
      rec.until = Math.max(rec.until, RP.knockDangerSeconds);
      rec.st.slow = 0;
      this._rideEmit('knock3');
    },
    update(rec, dt) {
      const v = this._speed();
      if (v < 12) {
        this._raise(0.3 + clamp((12 - v) / 12, 0, 1) * 0.5);
        if (!rec.st.warned) {
          rec.st.warned = true;
          g.audio?.play?.('knock_trunk', { object: g.taxi.anchors.trunk, volume: 1, count: 3, interval: 0.32 });
          this._whisper(ENCOUNTERS.trunkKnocks?.whispers, { force: true });
        }
      } else rec.st.warned = false;
      rec.st.slow = v < RP.knockStopSpeedKmh ? rec.st.slow + dt : 0;
      if (rec.st.slow > RP.knockStopSeconds) this._violate(rec, 'stopped', rec.exception ? null : 'trunk');
    },
  },

  // ---- r6 radio off when asked ------------------------------------------------------------------
  r6: {
    start(rec) {
      rec.st.phase = 'grace';
    },
    control(rec, control, value) {
      if (control === 'radio' && value === false) this._resolve(rec, 'off');
    },
    update(rec, dt) {
      const t = g.taxi;
      if (!t.state.radioOn) return this._resolve(rec, 'off');
      if (rec.st.phase === 'grace' && rec.t > RP.radioGraceSeconds) {
        rec.st.phase = 'escalate';
        rec.st.t2 = 0;
        this._rideEmit('radioIgnored');
        bus.emit('rule:event', { ruleId: 'r6', phase: 'warn', encounterId: rec.encId, source: 'rules' });
      }
      if (rec.st.phase === 'escalate') {
        rec.st.t2 += dt;
        const k = clamp(rec.st.t2 / RP.radioEscalateSeconds, 0, 1);
        g.audio?.radio?.setStatic?.(0.5 + k * 0.5);
        this._raise(0.35 + k * 0.6);
        if (k >= 1) this._violate(rec, 'ignored', 'radio');
      } else this._raise(0.15);
      rec.until = rec.t + 1; // stays until off or the escalation ends
    },
    cleanup() {
      g.audio?.radio?.setStatic?.(0);
    },
  },

  // ---- r7 a voice calls your name -------------------------------------------------------------
  r7: {
    update(rec, dt) {
      const t = g.taxi;
      const w = t.state.windows;
      const open = Math.max(w.fl, w.fr, w.rl, w.rr);
      this._raise(0.3);
      if (this._speed() < RP.nameCallStopSpeedKmh && open > RP.windowOpenFailAmount) this._violate(rec, 'windowOpened', 'nameCall');
    },
    end(rec, how) {
      if (how === 'resolved') this._rideEmit('nameCallIgnored');
      else this._rideEmit('nameCallAnswered');
    },
  },

  // ---- r8 breath on the neck: amulet + eyes front ----------------------------------------------
  // A QTE (g.qte 'still'): hold the amulet (G / RMB / pad X / touch) = hold your breath, and do not
  // move the view. The breath passes when the ring is full; let go or look round and it sees you.
  r8: {
    start(rec) {
      rec.st.fail = 0;
      const t = g.taxi;
      rec.st.snd = g.audio?.loop?.('breath_neck', { object: t.anchors.driverEye, volume: 0.7, offset3: [0.05, 0, 0.22] });
      t.addBreathFog('rr', t.anchors.rearRightSeat.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.6, 0)), 0.8);
      this.arm('r3', { until: rec.until, params: { mode: 'death', death: 'breath', seat: 'rearRight' }, force: true });
      if (g.qte && !g.qte.active && this._inCab()) {
        rec.st.hold = true; // the QTE decides when it is over
        rec.st.qte = true;
        const fwd = () => Math.abs(g.cameraRig.yaw) / DEG < RP.breathLookForwardConeDeg && Math.abs(g.cameraRig.pitch) / DEG < RP.breathLookForwardConeDeg;
        const holdS = clamp(rec.until * 0.7, 3, 7);
        g.qte
          .run({
            kind: 'still',
            action: 'amulet',
            hold: holdS,
            time: holdS + 6,
            grace: 1.6,
            failTime: RP.breathFailSeconds,
            tolerance: 0.5,
            slowmo: 0.75,
            dread: 0.8,
            ok: () => fwd() && this._inCab(),
          })
          .then((r) => {
            if (rec.done || this.armed.get('r8') !== rec) return;
            if (r.ok) this._resolve(rec, 'held');
            else if (r.reason !== 'cancelled') this._violate(rec, 'failed', 'breath');
            else rec.st.qte = false; // cancelled (a cutscene): fall back to the plain rule
          });
      }
    },
    update(rec, dt) {
      if (rec.st.qte) {
        g.cameraRig.shake(0.008);
        this._raise(0.35 + (g.qte?.state?.fail || 0) * 0.5);
        return;
      }
      if (rec.st.hold && !rec.st.qte && rec.t >= rec.until) {
        this._resolve(rec, 'held');
        return;
      }
      const holding = input.down('amulet') || this.amuletHeld || !!g.actions?.amulet?.held;
      const fwd = Math.abs(g.cameraRig.yaw) / DEG < RP.breathLookForwardConeDeg && Math.abs(g.cameraRig.pitch) / DEG < RP.breathLookForwardConeDeg;
      const ok = holding && fwd && this._inCab();
      rec.st.fail = ok ? Math.max(0, rec.st.fail - dt * 0.5) : rec.st.fail + dt;
      g.cameraRig.shake(0.012);
      this._raise(0.35 + clamp(rec.st.fail / RP.breathFailSeconds, 0, 1) * 0.6);
      if (rec.st.fail > RP.breathFailSeconds) this._violate(rec, 'failed', 'breath');
    },
    end(rec, how) {
      if (how === 'resolved') {
        this._rideEmit('breathPassed');
        this.disarm('r3', 'drove');
      }
    },
    cleanup(rec) {
      rec.st.snd?.stop?.(0.6);
    },
  },

  // ---- r9 the cabin light dies by itself: leave it -------------------------------------------
  r9: {
    start(rec) {
      const t = g.taxi;
      if (!rec.params.noStaging) t.setCabinOverride(0, 0.6);
      if (t.state.cabinLight) t.setControl('cabinLight', false);
      g.audio?.play?.('fluorescent_flicker', { object: t.anchors.cabinLight, volume: 0.5 });
      this._rideEmit('cabinLightDies');
    },
    control(rec, control, value) {
      if (control === 'cabinLight' && value === true && !rec.st.on) {
        rec.st.on = true;
        rec.st.hold = true;
        g.audio?.play?.('thump_roof', { object: g.taxi.anchors.cabinLight, volume: 0.9 });
        setTimeout(() => {
          if (!rec.done) this._violate(rec, 'lightOn', 'ceilingCrawl');
        }, RP.cabinLightAttackDelay * 1000);
      }
    },
    update(rec) {
      this._raise(rec.st.on ? 0.9 : 0.25);
      if (!rec.st.on && Math.random() < 0.01) g.audio?.play?.('scratch_glass', { object: g.taxi.anchors.cabinLight, volume: 0.35, rate: 0.6 });
    },
    cleanup(rec) {
      if (!rec.params.noStaging) g.taxi.setCabinOverride(null);
    },
  },

  // ---- r11 meter 444: stop, head down, count, no glass --------------------------------------
  r11: {
    start(rec) {
      const t = g.taxi;
      rec.st.hold = true; // the handler ends it
      rec.st.phase = 'stop';
      rec.st.prevFare = t.fare;
      rec.st.prevMeterOn = t.state.meterOn;
      if (!t.state.meterOn) {
        t.state.meterOn = true;
        t.state.vacantLamp = false;
      }
      t.controls.fare = 444;
      t.setMeterGlitch({ mode: 'hold444' });
      g.audio?.play?.('meter_beep', { object: t.anchors.meter, volume: 0.6, count: 3, interval: 0.18, rate: 0.8 });
      const monk = g.ride?.data?.id === 'monk' || rec.params.monk;
      rec.st.monk = !!monk;
      if (monk) {
        rec.exception = true;
        rec.st.phase = 'monk';
      }
      this._rideEmit('meter444');
    },
    update(rec, dt) {
      const S = rec.st;
      const t = g.taxi;
      t.controls.fare = 444;
      if (S.phase === 'monk') {
        // the number is just a number: it rolls on after a while
        if (rec.t > 9) {
          rec.st.hold = false;
          this._resolve(rec, 'monkAboard');
        }
        return;
      }
      if (S.phase === 'stop') {
        this._raise(0.35 + clamp(rec.t / RP.meter444StopWithinSeconds, 0, 1) * 0.4);
        if (rec.t > RP.meter444StopWithinSeconds * 0.5 && !S.warned) {
          S.warned = true;
          this._whisper([V('จอด...', 'Stop...')], { force: true });
        }
        if (this._speed() < RP.meter444StopSpeedKmh) {
          S.phase = 'count';
          S.c = 0;
          S.glass = 0;
          this._count(rec);
        } else if (rec.t > RP.meter444StopWithinSeconds) {
          S.hold = false;
          this._violate(rec, 'didntStop', 'count444');
        }
        return;
      }
      if (S.phase === 'count') {
        S.c += dt;
        this._raise(0.45);
        // eyes off every mirror and window; looking down is always safe
        const down = g.cameraRig.pitch / DEG < RP.meter444LookDownPitchDeg;
        const gz = this._gaze();
        // a moment to bow the head once the car has stopped, then any glass in view counts
        const onGlass = !down && this._isGlass(gz);
        if (S.c > 1.8) S.glass = onGlass ? S.glass + dt : Math.max(0, S.glass - dt * 0.5);
        if (onGlass) {
          this._raise(0.6 + clamp(S.glass, 0, 1) * 0.35);
          if (!S.glassWarned && (S.c > 0.6 || S.glass > 0)) {
            S.glassWarned = true;
            this._whisper([V('ก้มหน้าลง...', 'Head down...')], { force: true, object: g.taxi.anchors.mirrorLeft });
          }
        }
        if (S.glass > 0.8) {
          S.hold = false;
          return this._violate(rec, 'lookedAtGlass', 'count444');
        }
        // the chain: after midnight something knocks while you must not look
        if (!S.chained && S.c > (ENCOUNTERS.meter444?.chains?.[0]?.atSecond ?? 6)) {
          S.chained = true;
          for (const ch of ENCOUNTERS.meter444?.chains || []) {
            if (ch.if && !checkCond(ch.if, { save: g.save, hour: g.clock?.hour })) continue;
            let handle = null;
            try {
              handle = g.director?.start?.(ch.id, { ride: g.ride, passenger: g.ride?.passenger, chainedFrom: 'meter444' });
            } catch (e) {
              console.warn('[rules] chain failed', e);
            }
            if (ch.id === 'windowKnock') this.arm('r14', { encounter: handle || 'windowKnock' });
            g.ride?.emit?.('encounter:' + ch.id);
          }
        }
        if ((S.c > RP.meter444CountSeconds && S.counted) || S.c > 45) {
          S.hold = false;
          this._resolve(rec, 'silent');
        }
      }
    },
    cleanup(rec) {
      const t = g.taxi;
      t.setMeterGlitch(null);
      t.controls.fare = Math.max(35, rec.st.prevFare || 35);
      if (!rec.st.prevMeterOn && rec.st.monk) {
        t.state.meterOn = rec.st.prevMeterOn;
        t.state.vacantLamp = !rec.st.prevMeterOn;
      }
    },
  },

  // ---- r12 someone stands in the road: drive through -----------------------------------------
  r12: {
    start(rec) {
      const t = g.taxi;
      const ref = t.physicsSim.roadRef;
      rec.st.s = null;
      if (rec.params.position) {
        const pr = g.world.road.project(rec.params.position);
        rec.st.s = pr.s;
        rec.st.id = pr.id;
      } else if (ref) {
        rec.st.s = ref.s + 80;
        rec.st.id = ref.id;
      }
    },
    update(rec) {
      const t = g.taxi;
      const ref = t.physicsSim.roadRef;
      if (!ref || rec.st.s == null || ref.id !== rec.st.id) return;
      const d = rec.st.s - ref.s;
      if (d < 0) {
        // through it: a cold flash, glass fogs from outside, it now stands behind you
        g.postfx?.flash?.(new THREE.Color(0.75, 0.85, 1), 0.5);
        this._chill(0.6);
        g.audio?.play?.('sting_high', { volume: 0.5 });
        return this._resolve(rec, 'passed');
      }
      if (d < RP.roadFigureDangerM + 40) this._raise(0.3 + clamp(1 - d / (RP.roadFigureDangerM + 40), 0, 1) * 0.5);
      if (d < RP.roadFigureDangerM) {
        if (this._speed() < RP.roadFigureNoBrakeMinKmh) return this._violate(rec, 'braked', 'roadFigure');
        if (t.physicsSim.offRoad > 0.5 || Math.abs(t.physicsSim.lateral ?? 0) > RP.roadFigureMaxSwerveLateralM + 1.2) return this._violate(rec, 'swerved', 'roadFigure');
      }
      rec.until = rec.t + 2; // until passed
    },
  },

  // ---- r13 blood on the windshield: no wipers ------------------------------------------------
  r13: {
    start(rec) {
      const t = g.taxi;
      if (g.save) g.save.flags.bloodOnGlass = true;
      rec.st.wipe = 0;
      if (!rec.params.noStaging) {
        const kind = rec.exception ? 'blood_splatter' : 'blood_drip';
        for (let i = 0; i < 4; i++) t.addGlassMark?.('windshield', kind, new THREE.Vector2(0.25 + Math.random() * 0.5, 0.85 + Math.random() * 0.1), { size: 0.7 + Math.random() * 0.5, intensity: rec.exception ? 0.7 : 1 });
        if (!rec.exception) g.audio?.play?.('thump_roof', { object: t.anchors.roofTop, volume: 0.5 });
      }
    },
    update(rec, dt) {
      const t = g.taxi;
      const wiping = t.state.wipers > 0 && rec.t > RP.bloodWiperGraceSeconds;
      if (rec.exception) return; // betel juice: only betel
      this._raise(0.25 + (wiping ? 0.5 : 0));
      if (wiping) {
        rec.st.wipe += dt;
        if (!rec.st.smeared) {
          rec.st.smeared = true;
          t.addGlassMark?.('windshield', 'blood_smear', new THREE.Vector2(0.5, 0.7), { size: 1.4 });
          this._whisper(ENCOUNTERS.bloodDrip?.whispers, { force: true });
        }
        if (rec.st.wipe > RP.bloodWipeFailSeconds) this._violate(rec, 'wiped', 'roofHanger');
      }
    },
    control(rec, control, value) {
      if (control === 'wipers' && value > 0 && rec.exception) rec.st.wipedBetel = true;
    },
    expire(rec) {
      this._resolve(rec, rec.exception && rec.st.wipedBetel ? 'wiped' : 'letRun');
    },
    cleanup() {
      if (g.save?.flags) g.save.flags.bloodOnGlass = false;
    },
  },

  // ---- r14 after midnight no window down -------------------------------------------------------
  r14: {
    update(rec) {
      const hour = g.clock?.hour ?? 24;
      if (hour < RP.windowRuleFromHour && !rec.params.force) return;
      const w = g.taxi.state.windows;
      const open = Math.max(w.fl, w.fr, w.rl, w.rr);
      this._raise(0.3 + open);
      if (open > RP.windowOpenFailAmount) this._violate(rec, 'windowOpened', 'windowArm');
    },
  },

  // ---- r15 the radio says your name: retune, never off ----------------------------------------
  r15: {
    start(rec) {
      rec.st.station = g.taxi.state.radioStation;
      rec.st.hold = true;
    },
    control(rec, control, value) {
      if (rec.done) return;
      if (control === 'radioTune' && value !== rec.st.station) {
        rec.st.hold = false;
        this._resolve(rec, 'retuned');
      } else if (control === 'radio' && value === false) {
        rec.st.hold = false;
        if (rec.exception) this._resolve(rec, 'retuned');
        else this._violate(rec, 'switchedOff');
      }
    },
    update(rec) {
      if (rec.exception) {
        // the father's dedication: listening to the end is the point
        if (rec.t > rec.until) {
          rec.st.hold = false;
          this._resolve(rec, 'listened');
        }
        return;
      }
      this._raise(0.3 + clamp(rec.t / RP.radioNameTuneSeconds, 0, 1) * 0.4);
      if (rec.t > RP.radioNameTuneSeconds) {
        rec.st.hold = false;
        this._violate(rec, 'ignored');
      }
    },
  },

  // ---- r16 one too many in the mirror: say nothing, don't stop --------------------------------
  r16: {
    update(rec, dt) {
      const v = this._speed();
      rec.st.slow = v < RP.extraPassengerStopSpeedKmh ? (rec.st.slow || 0) + dt : 0;
      this._raise(v < 12 ? 0.55 : 0.25);
      if (v < 12 && !rec.st.warned) {
        rec.st.warned = true;
        g.audio?.play?.('child_laugh_far', { object: g.taxi.anchors.rearLeftSeat, volume: 0.3 });
      }
      if (rec.st.slow > 1.5) this._violate(rec, 'stopped', 'extraPassenger');
    },
  },

  // ---- r3 armed back-seat event (looking handled in _lookBack) ------------------------------
  r3: {
    update() {
      this._raise(0.2);
      if (Math.random() < 0.006) this._whisper(null, { cool: 3 });
    },
  },

  // ---- r4 armed explicitly (encounters): the face-gaze timer handles it ----------------------
  r4: {},
};

/** r11 counting voice: one number per second around the car, only after the stop. */
RuleMonitor.prototype._count = async function (rec) {
  const enc = ENCOUNTERS.meter444 || {};
  const t = g.taxi;
  const spots = ['mirrorLeft', 'doorRL', 'trunk', 'doorRR', 'mirrorRight'];
  g.dialogue.setSpeaker('counter', { nameTH: '', nameEN: '', voice: { gender: 'f', age: 50, ghost: 0.9, whisper: true, pitch: 0.85, rate: 0.7 }, humanoid: null, object: t.anchors.mirrorLeft });
  g.dialogue.interrupt();
  const lines = resolveLines(enc.countLines || [], { save: g.save });
  for (let i = 0; i < lines.length; i++) {
    if (rec.done) return;
    g.dialogue.setSpeaker('counter', { object: t.anchors[spots[i % spots.length]] });
    g.audio?.play?.('knock', { object: t.anchors[spots[i % spots.length]], volume: 0.35, rate: 0.7 });
    await g.dialogue.play([{ ...lines[i], who: 'counter', pause: 0.2 }]);
    if (rec.done) return;
  }
  // the reply: the encounter's own question, unless the ride's 'meter444' beat already owns a reply
  const ownsReply = g.ride?.beatOwnsReply?.('meter444') || false;
  if (!rec.done && enc.choice && !ownsReply) {
    const c = enc.choice;
    const prompt = c.prompt ? [{ ...c.prompt, who: 'counter' }] : [];
    const r = await g.dialogue.play([...prompt, { who: 'player', th: '', en: '', tone: 'thought', choice: { id: c.id, options: c.options, defaultKey: c.defaultKey, timeout: c.timeout } }]);
    if (rec.done) return;
    const key = r.choices[c.id] ?? c.defaultKey;
    if (key === 'answer') {
      rec.st.hold = false;
      return this._violate(rec, 'answer', 'count444');
    }
    const silent = enc.outcomes?.silent?.lines;
    if (silent?.length) await g.dialogue.play(resolveLines(silent, { save: g.save }).map((l) => ({ ...l, who: 'counter' })));
  }
  rec.st.counted = true;
};

void lerp;
