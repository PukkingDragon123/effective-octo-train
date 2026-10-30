// The interactive tutorial (GAME_DESIGN §8): Ah Kong talks Ton through the cab from outside the
// window, one step at a time (data.ahkong.TUTORIAL_STEPS). Every step is physical (look + click,
// the hand reaches) with a hotkey alternative; hints are 1–3 Thai words + keys, shown only when
// the old man's voice is not enough. Then SEND_OFF and the shift starts at 21:00, ride 0.
// Nothing can stall it: an undone step is done for you after a while.
import * as THREE from 'three';
import { g } from '../context.js';
import { wait } from '../util.js';
import { bus } from '../../core/Events.js';
import { input } from '../../core/Input.js';
import { interact } from '../../core/Interact.js';
import { ensurePlayerActions } from '../systems/PlayerActions.js';
import { LoopStaging } from '../systems/LoopStaging.js';
import { setupGarage, ahKongFace, walkAroundTaxi, retireAhKong } from '../opening/garageSet.js';
import { Stage, guard, isAbort, runLines, resolve, music, taxiPoint, ground, yawTo, waitFor, releaseSky, hidePlayer, quietDirector } from '../opening/common.js';

const _v = new THREE.Vector3();

/** {auto, manual} variants follow settings.transmission. */
function pick(x) {
  if (!x || Array.isArray(x)) return x;
  if (x.auto || x.manual) return g.settings.get('transmission') === 'manual' ? x.manual || x.auto : x.auto || x.manual;
  return x;
}

/** The live check for one step's waitFor (see ahkong.js header). */
function makeWaiter(wf) {
  const t = g.taxi;
  const w = { done: false, acc: 0, moved: false, steerL: false, steerR: false, offs: [] };
  if (!wf) {
    w.done = true;
    return { w, update() {}, dispose() {} };
  }
  const matchControl = (value) => {
    let v = value;
    if (wf.path && v && typeof v === 'object') v = v[wf.path];
    if (wf.min !== undefined) return Number(v) >= wf.min;
    if (wf.valueNot !== undefined) return v !== wf.valueNot && v !== undefined;
    if (wf.value === '*') return true;
    return v === wf.value;
  };
  // the current state already satisfying a control step counts (e.g. the radio is already on)
  const stateValue = () => {
    const s = t.state;
    switch (wf.control) {
      case 'key':
        return s.keyInserted;
      case 'ignition':
        return s.engineOn ? 'start' : s.ignition;
      case 'headlights':
        return s.headlights;
      case 'handbrake':
        return s.handbrake;
      case 'gear':
        return s.gear;
      case 'indicator':
        return s.indicator;
      case 'wipers':
        return s.wipers;
      case 'cabinLight':
        return s.cabinLight;
      case 'radio':
        return s.radioOn;
      case 'meter':
        return s.meterOn;
      case 'window':
        return { window: 'fr', amount: s.windows.fr };
      default:
        return undefined;
    }
  };
  if (wf.type === 'interact') {
    const h = (e) => {
      if (e?.id === wf.id) w.done = true;
    };
    bus.on('interact:use', h);
    w.offs.push(() => bus.off('interact:use', h));
  }
  if (wf.type === 'control') {
    const h = (e) => {
      if (e?.control === wf.control && matchControl(e.value)) w.done = true;
    };
    bus.on('taxi:control', h);
    w.offs.push(() => bus.off('taxi:control', h));
  }
  if (wf.type === 'stop' && Math.abs(t.speedKmh) > 3) w.moved = true;
  return {
    w,
    update(dt) {
      if (w.done) return;
      const s = t.state;
      const kmh = Math.abs(t.speedKmh || 0);
      switch (wf.type) {
        case 'interact':
          if (wf.id === 'taxi.door.fr.out' && s.doors.fr > 0.5) w.done = true;
          break;
        case 'enterVehicle':
          if (g.actions?.inTaxi && !g.actions.busy) w.done = true;
          break;
        case 'control': {
          // the cab already in the asked state counts (done before he asked, or by hand)
          const sv = stateValue();
          if (sv !== undefined && matchControl(sv)) w.done = true;
          break;
        }
        case 'drive':
          w.acc += (kmh / 3.6) * dt;
          if (w.acc >= (wf.meters || 10)) w.done = true;
          break;
        case 'speedKmh':
          if ((wf.min === undefined || kmh >= wf.min) && (wf.max === undefined || kmh <= wf.max)) w.done = true;
          break;
        case 'stop':
          if (kmh > 3) w.moved = true;
          if (w.moved && kmh < 1) w.done = true;
          break;
        case 'steer': {
          const st = t.physics.steer || 0;
          if (st <= -(wf.amount || 0.5)) w.steerL = true;
          if (st >= (wf.amount || 0.5)) w.steerR = true;
          if (w.steerL && w.steerR) w.done = true;
          break;
        }
        case 'look':
          if (t.getGazeTarget() === wf.target) w.acc += dt;
          else w.acc = Math.max(0, w.acc - dt * 2);
          if (w.acc >= (wf.seconds ?? 0.8)) w.done = true;
          break;
        case 'hold':
          if (g.actions?.amulet?.held) w.acc += dt;
          else w.acc = 0;
          if (w.acc >= (wf.seconds ?? 1.5)) w.done = true;
          break;
        case 'paper':
          if (g.actions?.paper?.up) w.acc += dt;
          if (w.acc >= (wf.seconds ?? 3)) w.done = true;
          break;
        default:
          w.done = true;
      }
    },
    dispose() {
      for (const f of w.offs.splice(0)) f();
    },
  };
}

/** Do an undone step for the player (never strand anyone). */
async function autoDo(wf) {
  const t = g.taxi;
  if (!wf) return;
  try {
    switch (wf.type) {
      case 'interact':
        if (wf.id?.startsWith('taxi.door.')) t.setControl('door', { door: 'fr', open: 1 });
        break;
      case 'enterVehicle':
        if (!g.actions.inTaxi) await g.actions.enterTaxi({ force: true, controls: true });
        break;
      case 'control': {
        let v = wf.value;
        if (wf.control === 'window') v = { window: 'fr', amount: 0.6 };
        else if (wf.valueNot !== undefined) v = wf.control === 'headlights' ? 'low' : true;
        else if (wf.min !== undefined) v = wf.min;
        if (wf.control === 'ignition') {
          if (!t.state.keyInserted) await t.setControl('key', true, { source: 'hotkey' });
          v = 'start';
        }
        await t.setControl(wf.control, v, { source: 'hotkey' });
        break;
      }
      case 'hold':
        g.actions.holdAmulet(true, 'api');
        await wait((wf.seconds ?? 1.5) + 0.3);
        g.actions.holdAmulet(false);
        break;
      default:
        break;
    }
  } catch (e) {
    console.warn('[tutorial] auto', e);
  }
}

export const TutorialState = {
  name: 'tutorial',

  async enter(params = {}) {
    const A = ensurePlayerActions();
    const S = guard(this);
    quietDirector();
    if (g.cameraRig.inCinematic) g.cameraRig.release(0.01);
    g.cameraRig.setFocus(null);
    g.cameraRig.fovOffset = 0;
    this.stage = new Stage();
    A.setEnabled(true);
    A.setAllowed({ paper: true, amulet: true, vehicle: true, inspect: true });
    g.input.setWantPointerLock(true);
    hidePlayer(false);
    const save = g.save;
    if (save) {
      save.stage = 'tutorial';
      save.flags.hasKeys = true;
      save.flags.hasPaper = true;
      g.persist();
    }
    if (!params.fromGarage) g.cine.fade(1, 0);
    releaseSky();
    g.clock.set(20.95);
    g.clock.autoWeather = false;
    g.sky?.setWeather({ rain: 0.05, fog: 0.65, wind: 0.35 }, 4);
    music('silence', 2);
    // the stage: the cab in front of the garage, the old man beside it
    if (!params.fromGarage) LoopStaging.apply(0);
    setupGarage(this.stage, { ahKong: params.fromGarage ? 'keep' : 'besideTaxi', interactions: true, parkTaxi: !params.fromGarage || !g.actions.inTaxi });
    g.taxi.setInteractionsEnabled(true);
    g.taxi.setControlsEnabled(false);
    if (!params.fromGarage) {
      // stand Ton a few steps from the driver's door
      const p = taxiPoint(3.0, 0, 1.6, new THREE.Vector3());
      p.y = ground(p.x, p.z);
      if (g.player.mode !== 'foot') g.player.exitVehicle();
      A.standAt(p, yawTo(p, taxiPoint(1.0, 0, -0.2, _v)));
      g.cine.fade(0, 1.6);
    }
    g.player.setWalkEnabled(!A.inTaxi);
    this.stage.update(() => {
      LoopStaging.update(0);
      if (A.inTaxi && !g.taxi.controlsEnabled && !A.busy) g.taxi.setControlsEnabled(true);
    }, 3);
    try {
      await this._steps(S);
      // let a memory moment (Knowledge) finish before the old man speaks again
      await S.wait(1.2);
      await S.step(waitFor(() => !g.dialogue.busy, 14));
      // "off you go, young man... don't forget the rules"
      await this._kongTo('window', S);
      await runLines(resolve(g.data?.ahkong?.SEND_OFF || []), { alive: () => this.active });
      S.chk();
      this._toShift();
    } catch (e) {
      if (!isAbort(e)) {
        console.error('[tutorial]', e);
        if (this.active) this._toShift();
      }
    }
  },

  _toShift() {
    const save = g.save;
    if (save) {
      save.stage = 'shift';
      save.rideIndex = 0;
      save.hour = 21;
      g.persist();
    }
    g.ui.hint(null);
    if (!g.actions.inTaxi) g.actions.seatInTaxi();
    g.taxi.setControlsEnabled(true);
    g.fsm.go('shift', { ride: 0, hour: 21, fromTutorial: true });
  },

  /** Ah Kong walks to where he teaches from: by the driver's door, or at the window. */
  async _kongTo(where, S) {
    const h = g.ahKong;
    if (!h || h._seated) return;
    const target = where === 'door' ? taxiPoint(2.15, 0, 0.75, new THREE.Vector3()) : taxiPoint(1.5, 0, -0.2, new THREE.Vector3());
    target.y = ground(target.x, target.z);
    const d = Math.hypot(target.x - h.root.position.x, target.z - h.root.position.z);
    if (d > 0.5) await S.step(Promise.race([walkAroundTaxi(h, target, 14), wait(Math.min(16, d / 0.6 + 3))]));
    ahKongFace(where === 'door' ? g.player.root.position : taxiPoint(0.37, 0, -0.1, _v));
    h.lookAt(g.player.eye, { weight: 1, speed: 3 });
  },

  async _steps(S) {
    const A = g.actions;
    const steps = g.data?.ahkong?.TUTORIAL_STEPS || [];
    for (const step of steps) {
      S.chk();
      const wf = pick(step.waitFor);
      const lines = pick(step.lines) || [];
      const hint = pick(step.hint);
      const outside = ['paper', 'interact', 'enterVehicle'].includes(wf?.type) && !A.inTaxi;
      const kongGo = this._kongTo(outside ? 'door' : 'window', S).catch(() => {});
      const waiter = makeWaiter(wf);
      let talkDone = false;
      runLines(resolve(lines), { alive: () => this.active }).then(() => (talkDone = true));
      let t = 0;
      let hinted = false;
      let nudged = false;
      let auto = false;
      let flipHint = false;
      const firstLine = resolve(lines).find((l) => !l.choice);
      const ok = await S.step(
        waitFor((dt) => {
          if (!this.active) return true;
          t += dt;
          waiter.update(dt);
          // hotkey alternatives the cab itself has no key for
          if (!waiter.w.done && input.pressed('interact') && !interact.current && !A.paper.up) {
            if (wf?.type === 'control' && wf.control === 'key' && A.inTaxi) g.taxi.setControl('key', true, { source: 'hotkey' });
            else if (wf?.type === 'control' && wf.control === 'ignition' && A.inTaxi) g.taxi.setControl('ignition', 'start', { source: 'hotkey' });
            else if (wf?.type === 'interact' && wf.id === 'taxi.door.fr.out' && A.canEnter()) g.taxi.setControl('door', { door: 'fr', open: 1 }, { source: 'hotkey' });
          }
          // the hint, once his voice has had its say
          if (talkDone && !hinted && hint && t > 1.0 && !waiter.w.done) {
            hinted = true;
            g.ui.hint({ th: hint.th, en: hint.en, keys: hint.keys, duration: 0 });
          }
          // read the front... then turn it over
          if (wf?.type === 'paper' && A.paper.up && A.paper.seconds > 2.4 && !A.paper.flipped && !flipHint) {
            flipHint = true;
            g.ui.hint({ th: 'พลิกดู', en: 'Turn it over', keys: ['F'], duration: 7 });
          }
          // a nudge, then he does it for you
          if (talkDone && !nudged && t > 24 && !waiter.w.done && firstLine) {
            nudged = true;
            runLines([firstLine]);
          }
          if (!auto && t > 55 && !waiter.w.done) {
            auto = true;
            autoDo(wf).then(() => (waiter.w.done = true));
          }
          return waiter.w.done && talkDone;
        }),
      );
      void ok;
      waiter.dispose();
      if (!flipHint || A.paper.flipped) g.ui.hint(null);
      await kongGo;
      S.chk();
      if (wf?.type === 'enterVehicle') {
        g.taxi.setControlsEnabled(true);
        g.player.setWalkEnabled(false);
      }
      if (step.after) await runLines(resolve(step.after), { alive: () => this.active });
      S.chk();
      if (step.memory) await this._memory(step.memory);
      await S.wait(0.35);
    }
  },

  /** The tutorial's memory (Mum's amulet): Knowledge awards it; this only covers a missing system. */
  async _memory(id) {
    await wait(1.5);
    const save = g.save;
    if (!save || g.knowledge || save.memories.includes(id)) return;
    save.memories.push(id);
    g.persist();
    bus.emit('memory:found', { id });
    const M = (g.data?.memories?.MEMORIES || []).find((m) => m.id === id);
    if (M?.text) await runLines(M.text.map((x) => ({ who: 'player', tone: 'thought', th: x.th, en: x.en })));
  },

  exit(_g, next) {
    g.ui.hint(null);
    this.stage?.clear();
    g.ahKong.lookAt(null);
    g.clock.autoWeather = true;
    if (next === 'shift') retireAhKong();
  },
};
