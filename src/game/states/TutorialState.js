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
import { LAYERS } from '../../core/layers.js';
import { ensurePlayerActions } from '../systems/PlayerActions.js';
import { LoopStaging } from '../systems/LoopStaging.js';
import { setupGarage, retireAhKong } from '../opening/garageSet.js';
import { garageTaxiPose, parkTaxi } from '../opening/common.js';
import { kongWalk, kongSay, kongAsk, kongTurn, scold, Nag } from '../opening/kong.js';
import { KONG_REACT, KONG_TAKEOVER } from '../data/kongTalk.js';
import { objectiveDone, clearObjective, setChecklist, tickObjective, setObjectiveTarget } from '../systems/Objectives.js';
import { Stage, guard, isAbort, runLines, resolve, music, taxiPoint, ground, yawTo, waitFor, releaseSky, hidePlayer, quietDirector } from '../opening/common.js';

const _v = new THREE.Vector3();

/** {auto, manual} variants follow settings.transmission. */
function pick(x) {
  if (!x || Array.isArray(x)) return x;
  if (x.auto || x.manual) return g.settings.get('transmission') === 'manual' ? x.manual || x.auto : x.auto || x.manual;
  return x;
}

/** What Ah Kong points at for a step (a taxi anchor), or null. */
const DEMO = {
  key: 'keySlot', ignition: 'keySlot', headlights: 'headlightStalk', handbrake: 'handbrake', gear: 'gearKnob', indicator: 'headlightStalk',
  wipers: 'wiperStalk', cabinLight: 'cabinLight', radio: 'radioKnob', radioTune: 'radioKnob', meter: 'meter', window: 'windowCrankFR', horn: 'hornPad',
};
function demoTarget(wf, step) {
  const A = g.taxi?.anchors || {};
  if (!wf) return null;
  if (wf.type === 'control') return A[DEMO[wf.control]] || null;
  if (wf.type === 'interact' && /door/.test(wf.id || '')) return A.doorFR || null;
  if (wf.type === 'gaze' || /mirror/i.test(step?.id || '')) return A[{ mirrorRear: 'rearviewMirror', mirrorLeft: 'mirrorLeft', mirrorRight: 'mirrorRight' }[step.id]] || null;
  if (/amulet/.test(step?.id || '')) return A.amuletHang || null;
  if (/accelerate/.test(step?.id || '')) return A.pedalThrottle || null;
  if (/brake/.test(step?.id || '')) return A.pedalBrake || null;
  if (/steer/.test(step?.id || '')) return A.steeringWheel || null;
  return null;
}

/** Tutorial steps in small groups (a checklist each, any order inside a group). */
const GROUPS = [
  { th: 'อ่านกฎ', en: 'Read the rules', ids: ['readPaper'] },
  { th: 'ขึ้นรถ', en: 'Get in', ids: ['openDoor', 'sit'] },
  { th: 'เตรียมรถ', en: 'Ready the car', ids: ['insertKey', 'startEngine', 'headlights', 'handbrake', 'gear'] },
  { th: 'ลองขับ', en: 'Try driving', ids: ['accelerate', 'brake', 'steer'] },
  { th: 'ของในรถ', en: 'In the cab', ids: ['indicator', 'wipers', 'cabinLight', 'radio', 'meterOn', 'meterOff', 'window'] },
  { th: 'กระจกกับพระ', en: 'Mirrors and the amulet', ids: ['mirrorRear', 'mirrorLeft', 'mirrorRight', 'amulet'] },
];
/** Steps that only make sense after another one. */
const STEP_DEP = { meterOff: 'meterOn', sit: 'openDoor', startEngine: 'insertKey', brake: 'accelerate' };
const STEP_LABEL = { readPaper: 'อ่านกระดาษกฎ', openDoor: 'เปิดประตูคนขับ', sit: 'ขึ้นนั่ง', insertKey: 'เสียบกุญแจ', startEngine: 'บิดกุญแจ', mirrorRear: 'ดูกระจกหลัง', mirrorLeft: 'ดูกระจกซ้าย', mirrorRight: 'ดูกระจกขวา', amulet: 'กำพระ' };
function groupSteps(steps) {
  const out = GROUPS.map((G) => ({ th: G.th, en: G.en, steps: [] }));
  let last = 0;
  for (const st of steps) {
    let gi = GROUPS.findIndex((G) => G.ids.includes(st.id));
    if (gi < 0) gi = last;
    last = gi;
    out[gi].steps.push(st);
  }
  return out.filter((G) => G.steps.length);
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
    this._bumps = 0;
    this._stalls = 0;
    this._drivenOff = false;
    this._ending = false;
    this._shifted = false;
    this._p0 = null;
    this._cur = null;
    this._parking = false;
    let bumpT = 0, engWas = !!g.taxi.state.engineOn;
    this.stage.add(
      bus.on('taxi:collision', (e) => {
        if (!this.active || (e?.impulse ?? 0) < 450 || g.engine.time - bumpT < 2.5 || this._parking) return;
        bumpT = g.engine.time;
        this._bumps++;
        if (this._bumps === 1) kongSay(KONG_REACT.bump, { queue: true });
        else scold('badDrive', Math.min(3, this._bumps));
        if (this._bumps >= 3) this._kongParks(guard(this));
      }),
    );
    this.stage.update(() => {
      const s = g.taxi.state;
      const on = !!s.engineOn;
      if (engWas && !on && s.ignition !== 'off' && s.keyInserted && g.actions?.inTaxi) {
        this._stalls++;
        if (this._stalls === 1) kongSay(KONG_REACT.stall, { queue: true });
        else scold('stall', Math.min(3, this._stalls));
        if (this._stalls >= 3) {
          this._stalls = 0;
          autoDo({ type: 'control', control: 'ignition', value: 'start' });
        }
      }
      engWas = on;
      // drove off: the lesson is over
      const t = g.taxi;
      if (g.actions?.inTaxi && s.engineOn && !this._parking) {
        if (!this._p0) this._p0 = t.root.position.clone();
        else if (t.root.position.distanceTo(this._p0) > 40) this._driveOff();
      }
    }, 33);
    // ask him (through the window too): what next, why pray
    {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.75, 0.6), new THREE.MeshBasicMaterial());
      box.layers.set(LAYERS.INTERACT);
      box.position.set(0, 0.9, 0);
      g.ahKong.root.add(box);
      const item = interact.register({
        id: 'tutorial.ahKong', object: box, labelTH: 'คุยกับอากง', labelEN: 'Talk to Ah Kong', icon: 'talk', reach: 2.8,
        enabled: () => this.active && !this._drivenOff && !g.dialogue.busy && !this._parking && g.ahKong.root.visible,
        onUse: () => {
          kongTurn(g.player.root.position);
          kongAsk((pick(this._cur?.step?.lines) || []).slice(0, 1));
        },
      });
      this.stage.add(() => {
        interact.unregister(item);
        box.removeFromParent();
        box.geometry.dispose();
      });
    }
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
      if (this._drivenOff) return;
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
    if (this._shifted) return;
    this._shifted = true;
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
    if (!h) return;
    const target = where === 'door' ? taxiPoint(2.15, 0, 0.75, new THREE.Vector3()) : taxiPoint(1.5, 0, -0.2, new THREE.Vector3());
    target.y = ground(target.x, target.z);
    const face = where === 'door' ? g.player.root.position.clone() : taxiPoint(0.37, 0, -0.1, new THREE.Vector3());
    // he gets up if he is sitting, walks round the cab, turns to it (never a snap)
    await S.step(kongWalk(target, { face }));
    h.lookAt(g.player.eye, { weight: 1, speed: 3 });
  },

  /** Level 3: "out of the way", he walks over and does the step himself. */
  async _kongDoesStep(S, wf, demo, outside) {
    try {
      scold('slow', 3);
      await this._kongTo(outside ? 'door' : 'window', S);
      kongSay(KONG_TAKEOVER.tutorial, { queue: true });
      if (demo) g.ahKong.play?.('point', { target: demo, side: 'R' })?.catch?.(() => {});
      await S.wait(0.9);
      await autoDo(wf);
      kongSay(KONG_TAKEOVER.done.slice(1), { queue: true });
    } catch (e) {
      if (!isAbort(e)) console.warn('[tutorial] kong does', e);
      await autoDo(wf);
    }
  },

  /** Driving like that: he stops it and parks it back in front of the garage himself. */
  async _kongParks(S) {
    if (this._parking) return;
    this._parking = true;
    const t = g.taxi;
    try {
      scold('badDrive', 3);
      t.setControlsEnabled(false);
      t.setControl('handbrake', true);
      await this._kongTo('window', S);
      await S.step(g.cine.fade(1, 0.5));
      const tp = garageTaxiPose();
      parkTaxi(tp.pos, tp.yaw, { cold: false, headlights: t.state.headlights });
      await S.wait(0.6);
      g.cine.fade(0, 0.9);
      kongSay(KONG_TAKEOVER.park, { queue: true });
      await this._kongTo('window', S);
      if (g.actions.inTaxi) t.setControlsEnabled(true);
    } catch (e) {
      if (!isAbort(e)) console.warn('[tutorial] park', e);
    } finally {
      this._parking = false;
      this._bumps = 0;
    }
  },

  async _steps(S) {
    const A = g.actions;
    const alive = () => this.active && !this._drivenOff;
    for (const G of groupSteps(g.data?.ahkong?.TUTORIAL_STEPS || [])) {
      S.chk();
      const items = G.steps.map((step) => {
        const wf = pick(step.waitFor);
        return { step, wf, waiter: makeWaiter(wf), done: false, hint: pick(step.hint), dep: STEP_DEP[step.id] || null };
      });
      const byId = (id) => items.find((x) => x.step.id === id);
      const depOk = (it) => !it.dep || !byId(it.dep) || byId(it.dep).done;
      setChecklist(G, items.map((it) => ({ id: it.step.id, th: it.hint?.th || STEP_LABEL[it.step.id] || it.step.id, en: it.hint?.en })));
      let cur = null;
      let talking = false;
      let auto = false;
      let flipHint = false;
      const after = [];
      const nag = new Nag('slow', [14, 28, 42]);
      await S.step(
        waitFor((dt) => {
          if (!alive()) return true;
          // every step of the group is live: done early, or out of order, it counts
          for (const it of items) {
            if (it.done || !depOk(it)) continue;
            it.waiter.update(dt);
            if (!it.waiter.w.done) continue;
            it.done = true;
            tickObjective(it.step.id);
            nag.reset();
            auto = false;
            if (it.wf?.type === 'enterVehicle') {
              g.taxi.setControlsEnabled(true);
              g.player.setWalkEnabled(false);
            }
            // he only finishes the thought he started (no lecture about things already done)
            if (it === cur) {
              const al = [...(pick(it.step.lines) || []).slice(1), ...(it.step.after || [])];
              if (al.length) after.push(al);
              cur = null;
              g.ui.hint(null);
            }
            if (it.step.memory) this._memory(it.step.memory);
          }
          if (talking) return false;
          if (after.length && !g.dialogue.busy) {
            talking = true;
            runLines(resolve(after.shift()), { alive }).then(() => (talking = false));
            return false;
          }
          // the next thing he explains: the first one not done yet
          if (!cur) {
            cur = items.find((it) => !it.done && depOk(it)) || null;
            this._cur = cur;
            if (cur) {
              talking = true;
              nag.reset();
              this._explain(S, cur).then(() => (talking = false));
            }
          }
          if (cur && !cur.done) {
            // hotkey alternatives the cab itself has no key for
            const wf = cur.wf;
            if (input.pressed('interact') && !interact.current && !A.paper.up) {
              if (wf?.type === 'control' && wf.control === 'key' && A.inTaxi) g.taxi.setControl('key', true, { source: 'hotkey' });
              else if (wf?.type === 'control' && wf.control === 'ignition' && A.inTaxi) g.taxi.setControl('ignition', 'start', { source: 'hotkey' });
              else if (wf?.type === 'interact' && wf.id === 'taxi.door.fr.out' && A.canEnter()) g.taxi.setControl('door', { door: 'fr', open: 1 }, { source: 'hotkey' });
            }
            if (wf?.type === 'paper' && A.paper.up && A.paper.seconds > 2.4 && !A.paper.flipped && !flipHint) {
              flipHint = true;
              g.ui.hint({ th: 'พลิกดู', en: 'Turn it over', keys: ['F'], duration: 7, tutorial: true });
            }
            // slow: a grumble, a proper scolding, then he does it himself
            if (!auto && !this._parking) {
              const lv = nag.update(dt);
              if (lv === 1 || lv === 2) scold('slow', lv);
              else if (lv === 3) {
                auto = true;
                const it = cur;
                const outside = ['paper', 'interact', 'enterVehicle'].includes(it.wf?.type) && !A.inTaxi;
                this._kongDoesStep(S, it.wf, demoTarget(it.wf, it.step), outside).then(() => (it.waiter.w.done = true));
              }
            }
          }
          return items.every((it) => it.done) && !after.length;
        }),
      );
      for (const it of items) it.waiter.dispose();
      g.ui.hint(null);
      setObjectiveTarget(null);
      objectiveDone();
      await S.wait(0.4);
    }
  },

  /** One step: walk to the door or window, point at it, one short line, then the key hint. */
  async _explain(S, it) {
    try {
      const outside = ['paper', 'interact', 'enterVehicle'].includes(it.wf?.type) && !g.actions.inTaxi;
      this._kongTo(outside ? 'door' : 'window', S).catch(() => {});
      const demo = demoTarget(it.wf, it.step);
      if (demo) this._demo(demo);
      setObjectiveTarget(outside ? g.taxi.anchors.doorFR : null, { minDist: 2.5 });
      await runLines(resolve((pick(it.step.lines) || []).slice(0, 1)), { alive: () => this.active && !this._drivenOff });
      if (!it.done && it.hint) g.ui.hint({ th: it.hint.th, en: it.hint.en, keys: it.hint.keys, duration: 0, tutorial: true });
    } catch (e) {
      if (!isAbort(e)) console.warn('[tutorial] explain', e);
    }
  },

  /** Driving off ends the lesson there and then: no more talk, the night starts. */
  _driveOff() {
    if (this._ending || !this.active) return;
    this._ending = true;
    this._drivenOff = true;
    if (g.dialogue.busy) g.dialogue.interrupt();
    g.ui.hint(null);
    clearObjective();
    this._toShift();
  },

  /** Ah Kong shows where first: he points at it, it catches the light, the view eases toward it. */
  _demo(target) {
    try {
      const h = g.ahKong;
      h?.lookAt?.(target, { weight: 1, speed: 4 });
      h?.play?.('point', { target, side: 'R' })?.catch?.(() => {});
      const p = target.getWorldPosition(new THREE.Vector3());
      const glint = g.lightPool?.add?.({ object: target, color: 0xffe2a8, intensity: 0.5, distance: 0.5, glow: { size: 0.035, opacity: 0.9 }, priority: 8, name: 'tutorialGlint' });
      const rig = g.cameraRig;
      if (g.actions?.inTaxi && !rig.inCinematic) rig.setFocus(p, 0.3);
      setTimeout(() => {
        glint?.remove?.();
        if (rig.focusTarget === p) rig.setFocus(null);
        h?.lookAt?.(g.player?.eye, { weight: 0.7, speed: 2 });
      }, 1800);
    } catch (e) {
      /* the demonstration is cosmetic */
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
    clearObjective();
    g.ui.hint(null);
    this.stage?.clear();
    g.ahKong.lookAt(null);
    g.clock.autoWeather = true;
    if (next === 'shift') retireAhKong();
  },
};
