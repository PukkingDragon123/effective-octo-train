// The KM 9 garage (GAME_DESIGN §8 + the loop).
// First night: Ton walks (full body, first person) to Ah Kong; a cinematic conversation with
// Ton's replies (data.ahkong.INTRO_GARAGE); the keys and the folded rules paper -> TutorialState.
// Restart (params.restart): Ton wakes at 21:00 again. LoopStaging dresses the garage for the loop
// (dash tally, calendar, the radio already playing, the ash), then RESTART_LINES ->
// DEATH_HINTS -> TIME_SKIP -> RESTART_KEYS (refuse from loop 3 -> ride the motorbike out:
// ending ride_away) -> SEND_OFF; Ton walks to the taxi and gets in -> ShiftState {ride, hour}.
import { saveCheckpoint } from '../systems/Checkpoint.js';
import * as THREE from 'three';
import { g } from '../context.js';
import { wait } from '../util.js';
import { bus } from '../../core/Events.js';
import { interact } from '../../core/Interact.js';
import { LAYERS } from '../../core/layers.js';
import { clamp, easeInOut } from '../../core/math.js';
import { ensurePlayerActions } from '../systems/PlayerActions.js';
import { LoopStaging } from '../systems/LoopStaging.js';
import { setupGarage, ahKongFace, ahKongStand, ahKongSit, walkAroundTaxi, retireAhKong } from '../opening/garageSet.js';
import { createChips } from '../opening/chips.js';
import { Chores, nightStage } from '../opening/chores.js';
import * as CH from '../data/chores.js';
import { KONG_REACT, KONG_TAKEOVER, KONG_ASK, CHORES_ALREADY, OBJECTIVES } from '../data/kongTalk.js';
import { kongTurn, kongWalk, kongSit, kongSay, kongIdle, kongAsk, scold, Nag } from '../opening/kong.js';
import { setObjective, objectiveDone, clearObjective, setChecklist, tickObjective, setObjectiveTarget } from '../systems/Objectives.js';
import { ensureOffRoad } from '../systems/OffRoad.js';
import { teachRule, isRuleGiven } from '../systems/Fairness.js';
import { Stage, CineCam, guard, isAbort, lm, wpos, runLines, resolve, music, sfx, ground, yawTo, roadPoint, roadYaw, roadLen, releaseSky, hidePlayer, waitFor, logic, taxiPoint, quietDirector } from '../opening/common.js';

const _v = new THREE.Vector3();

export const GarageState = {
  name: 'garage',

  async enter(params = {}) {
    const A = ensurePlayerActions();
    const S = guard(this);
    quietDirector();
    if (g.cameraRig.inCinematic) g.cameraRig.release(0.01);
    g.cameraRig.setFocus(null);
    g.cameraRig.fovOffset = 0;
    this.params = params;
    this.stage = new Stage();
    this.cam = new CineCam();
    this.restart = !!params.restart;
    this.phase = 'setup';
    this.mode = null;
    this.timeSkip = null;
    this.idleT = 0;
    this.idleLines = 0;
    this.leaving = false;
    A?.setEnabled(true);
    A?.setAllowed({ paper: false, amulet: false, vehicle: false });
    g.input.setWantPointerLock(true);
    hidePlayer(false);
    const black = this.restart || !params.arrived;
    if (black) g.cine.fade(1, 0);
    const save = g.save;
    const loops = save?.loops || 0;
    // the same night, from nine o'clock
    releaseSky();
    if (this.restart) {
      try {
        logic().clearNightFlags?.(save.flags);
      } catch (e) {
        /* ignore */
      }
      save.stage = 'garage';
      save.hour = 21;
      g.persist();
      g.clock.set(21);
    } else {
      g.clock.set(20.9);
      g.clock.autoWeather = false;
      g.sky?.setWeather({ rain: 0, fog: 0.65, wind: 0.3 }, 1);
      if (save && save.stage === 'intro') {
        save.stage = 'garage';
        g.persist();
      }
    }
    g.sky?.setFogBoost?.(1.15, 2);
    g.sky?.setGroundMist?.(1.3, 2);
    g.cine.letterbox(false, 0.01);
    music('silence', 2);
    try {
      g.audio?.ambience?.set({ hour: 21, rain: 0, insideCar: false, windowsOpen: true, dread: 0.25 });
    } catch (e) {
      /* audio optional */
    }
    // stage
    LoopStaging.apply(this.restart ? loops : 0);
    const ak = LoopStaging.ahKongStaging || {};
    const where = this.restart ? ak.where || 'besideTaxi' : 'besideTaxi';
    // first night: Ah Kong is not back yet (Ton waits under the tube; see _waitForKong)
    this.kongAway = !this.restart && !params.skipTalk;
    ensureOffRoad();
    if (this.restart || !params.arrived) nightStage.clear(); // a new night: last night's offerings are gone
    if (!params.checkpoint) saveCheckpoint('garage', { restart: this.restart });
    this.chores = null;
    this.set = setupGarage(this.stage, { ahKong: this.kongAway ? 'none' : where === 'stool' ? 'stool' : where === 'dark' ? 'none' : 'besideTaxi', interactions: true });
    this.where = where;
    this._parkBike();
    this._talkItem();
    this.stage.update((dt) => this._tick(dt), 1);
    kongIdle(this.stage, () => ['chores', 'free'].includes(this.phase) && !this._kongBusy);
    try {
      if (this.restart) await this._restartFlow(S, loops);
      else await this._firstNight(S, params);
    } catch (e) {
      if (!isAbort(e)) {
        console.error('[garage]', e);
        // never strand the player: straight on to what comes next
        if (this.active) this._fallbackOut();
      }
    }
  },

  // ------------------------------------------------------------------ set pieces
  _parkBike() {
    const bike = g.bike;
    const G = lm('garage');
    const spot = G?.anchors?.bikeSpot;
    if (!spot) return;
    if (g.player.vehicle === bike) return;
    bike.autopilot(null);
    bike.setControlsEnabled(false);
    bike.physics.frozen = false;
    const p = wpos(spot, new THREE.Vector3());
    const yaw = (G.yaw ?? 0) + Math.PI * 0.8;
    if (bike.root.position.distanceTo(p) > 3) bike.setPose(p, yaw);
    bike.setEngine(false);
    bike.setHeadlight(false);
  },

  /** Look at Ah Kong and press to talk (or just walk up to him). */
  _talkItem() {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.75, 0.6), new THREE.MeshBasicMaterial());
    box.layers.set(LAYERS.INTERACT);
    box.position.set(0, 0.9, 0);
    g.ahKong.root.add(box);
    this.talkWanted = false;
    const item = interact.register({
      id: 'garage.ahKong', object: box, labelTH: 'คุยกับอากง', labelEN: 'Talk to Ah Kong', icon: 'talk', reach: 2.8,
      enabled: () => ['walkToKong', 'chores', 'free'].includes(this.phase) && g.ahKong.root.visible && !this._kongBusy && !g.dialogue.busy,
      onUse: () => (this.phase === 'walkToKong' ? (this.talkWanted = true) : this._askKong()),
    });
    this.stage.add(() => {
      interact.unregister(item);
      box.removeFromParent();
      box.geometry.dispose();
    });
  },

  /** Where Ton stands to start (debug / restart). */
  _standTon(where) {
    const G = lm('garage');
    const A = G?.anchors || {};
    let p;
    if (where === 'stool' && A.guestSeat) {
      p = wpos(A.guestSeat, new THREE.Vector3());
      p.add(_v.set(0, 0, 0.45).applyAxisAngle(new THREE.Vector3(0, 1, 0), G.yaw ?? 0));
    } else if (A.bikeSpot) {
      p = wpos(A.bikeSpot, new THREE.Vector3());
      p.add(_v.set(0.9, 0, -0.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), G.yaw ?? 0));
    } else p = roadPoint('main', (G?.roadRef?.s ?? 0) - 3, -4.5);
    p.y = ground(p.x, p.z);
    const yaw = yawTo(p, g.ahKong.root.position);
    if (g.player.mode !== 'foot') g.player.exitVehicle();
    g.actions.standAt(p, yaw);
    return { p, yaw };
  },

  // ------------------------------------------------------------------ first night
  async _firstNight(S, params) {
    if (!params.arrived) this._standTon('apron');
    g.player.setWalkEnabled(true);
    g.cine.fade(0, params.arrived ? 0.4 : 1.8);
    if (params.skipTalk) {
      await S.wait(1.2);
      g.fsm.go('tutorial', { fromGarage: true });
      return;
    }
    if (this.kongAway) await this._waitForKong(S);
    // walk to the old man
    this.phase = 'walkToKong';
    if (!this._nearKong(2.0)) setObjective('talkKong');
    this.walkT = 0;
    const ok = await S.step(waitFor(() => this.talkWanted || this._nearKong(2.0) || this.walkT > 80 || !this.active));
    void ok;
    if (this.walkT > 80 && !this._nearKong(2.4)) {
      // he comes over himself
      const p = g.player.root.position;
      const dir = _v.copy(g.ahKong.root.position).sub(p).setY(0).normalize();
      await S.step(Promise.race([g.ahKong.walkTo(p.clone().addScaledVector(dir, 1.3), { speed: 1.3 }), wait(8)]));
    }
    this.phase = 'talk';
    g.ui.hint(null);
    // the arrival talk up to the keys, then his chores "for safety", then the keys and the paper
    const intro = g.data?.ahkong?.INTRO_GARAGE || [];
    const ki = intro.findIndex((l) => l?.set?.hasKeys);
    const before = ki > 0 ? intro.slice(0, ki) : intro;
    const after = ki > 0 ? intro.slice(ki) : [];
    const alive = () => this.active;
    await this._converse(S, async () => {
      if (this._arrivalReact?.length) await runLines(resolve(this._arrivalReact), { alive });
      await runLines(resolve(before), { alive, onLine: (l) => this._onLine(l) });
    });
    if (after.length) {
      await this._choresPhase(S, CH.CHORES_INTRO, null);
      this.phase = 'talk';
      await this._converse(S, async () => {
        await runLines(resolve(CH.CHORES_KEYS), { alive });
        await runLines(resolve(after), { alive, onLine: (l) => this._onLine(l) });
        // the first rule, taught on its own (the rest come one by one, a ride at a time)
        if (!isRuleGiven('r3')) await teachRule('r3', { noWait: true });
      });
    }
    g.player.hold?.(null);
    if (g.save) {
      g.save.flags.hasKeys = true;
      g.save.flags.hasPaper = true;
      g.save.stage = 'tutorial';
      g.persist();
    }
    this.phase = 'done';
    S.chk();
    g.fsm.go('tutorial', { fromGarage: true });
  },

  // ------------------------------------------------------------------ chores "for safety"
  /** He tells Ton what to do, sits down to watch; the keys wait until the required ones are done. */
  async _choresPhase(S, lines, only) {
    const A = g.actions;
    let C = this.chores;
    if (!C || (only && !only.every((id) => C.has(id)))) {
      try {
        C = this.chores = new Chores(this.stage, { only });
      } catch (e) {
        console.warn('[garage] chores', e);
        return;
      }
    }
    C._kongOn = () => !!this._kongBusy;
    this.phase = 'talk';
    // what Ton has already done (early, out of order) is not asked for again
    const left = lines.filter((l) => !l.chore || !C.done(l.chore));
    const all = C.requiredDone();
    await this._converse(S, () => runLines(resolve(all ? CHORES_ALREADY : left), { alive: () => this.active }));
    if (C.requiredDone()) {
      this._choreObjective();
      return;
    }
    this.phase = 'chores';
    // slow, then slower, then he does the next one himself (per chore: the meter resets on progress)
    this.choreNag = new Nag('slow', [30, 60, 90]);
    C.onMark = () => {
      this.choreNag?.reset();
      this._choreObjective();
    };
    C.start();
    this._choreObjective();
    A?.setAllowed({ paper: false, amulet: false, vehicle: false });
    g.player.setWalkEnabled(true);
    kongSit().catch(() => {}); // back to his stool to watch (he walks there and sits down)
    await S.step(waitFor(() => !this.active || (C.requiredDone() && !this._kongBusy), CH.CHORE_SKIP_SECONDS + 240));
    if (!C.requiredDone()) {
      await runLines(resolve(CH.CHORES_GRUMBLE), { alive: () => this.active });
      S.chk();
      for (const id of CH.REQUIRED_CHORES) if (C.has(id) && !C.done(id)) await this._kongDoes(S, id);
    }
    this.choreNag = null;
    setObjectiveTarget(null);
    setObjective('keys');
    await S.wait(1.2);
  },

  /** The objective line follows the chores: the next one still to do. */
  _choreObjective() {
    const C = this.chores;
    if (!C) return;
    const ids = CH.REQUIRED_CHORES.filter((id) => C.has(id));
    if (ids.every((id) => C.done(id))) {
      for (const id of ids) tickObjective(id);
      setObjectiveTarget(null);
      return objectiveDone();
    }
    setChecklist(OBJECTIVES.chores, ids.map((id) => ({ id, th: OBJECTIVES[id].th, en: OBJECTIVES[id].en, done: C.done(id) })));
    for (const id of ids) if (C.done(id)) tickObjective(id);
    setObjectiveTarget(() => C.target(), { minDist: 1.6 });
  },

  /** Ton asks him: what next (the current task), why pray, where he was (first night). */
  _askKong() {
    const C = this.chores;
    let next = [];
    if (this.phase === 'chores' && C) {
      const id = [...CH.REQUIRED_CHORES, 'coins'].find((x) => C.has(x) && !C.done(x));
      next = id ? CH.CHORE_HINT[id] || [] : [];
    } else if (this.phase === 'free') next = KONG_ASK.getIn;
    kongTurn(g.player.root.position);
    kongAsk(next, { where: !this.restart });
  },

  /** Level 3: he gets up, walks over and does it himself (then back to the stool). */
  async _kongDoes(S, id) {
    const C = this.chores;
    if (!C || C.done(id) || this._kongBusy) return;
    this._kongBusy = true;
    const h = g.ahKong;
    try {
      C.takeFromPlayer();
      kongSay(KONG_TAKEOVER[id] || KONG_TAKEOVER.tutorial, { queue: true });
      const plan = C.kongPlan(id);
      for (let i = 0; i < plan.length; i++) {
        const P = plan[i];
        const at = P.at.clone();
        // stop short of the thing, on his side of it
        const away = _v.copy(h.root.position).sub(at).setY(0);
        if (away.lengthSq() > 1e-4) at.addScaledVector(away.normalize(), P.stop ?? 0.75);
        await kongWalk(at, { face: P.look });
        S.chk();
        if (i === 0) C.carry(id);
      }
      if (id === 'shrine') {
        sfx('lighter', { object: h.root, volume: 0.5 });
        h.play?.('wai')?.catch?.(() => {});
        await S.wait(2.4);
      } else {
        h.play?.('point', { target: plan[plan.length - 1]?.look })?.catch?.(() => {});
        await S.wait(1.1);
      }
      C.finish(id);
      await S.wait(0.8);
      kongSay(KONG_TAKEOVER.done.slice(0, 1), { queue: true });
      kongSit().catch(() => {});
    } catch (e) {
      if (!isAbort(e)) console.warn('[garage] kong does', id, e);
      try {
        C.finish(id);
      } catch (e2) {
        /* ignore */
      }
    } finally {
      this._kongBusy = false;
      this.choreNag?.reset();
    }
  },

  /** Talking to him while chores are left: what to do next. */
  _choreHint() {
    if (g.dialogue.busy) return;
    const C = this.chores;
    const next = C && [...CH.REQUIRED_CHORES, 'coins'].find((id) => C.has(id) && !C.done(id));
    if (next) runLines(resolve(CH.CHORE_HINT[next] || []));
  },
  _idleNudgeChores(dt) {
    const lv = this._kongBusy ? 0 : this.choreNag?.update(dt) || 0;
    if (lv === 1 || lv === 2) {
      scold('slow', lv);
      if (lv === 1) setTimeout(() => this.active && this.phase === 'chores' && this._choreHint(), 2600);
    } else if (lv === 3) {
      const C = this.chores;
      const id = CH.REQUIRED_CHORES.find((x) => C?.has(x) && !C.done(x));
      if (id) this._kongDoes(guard(this), id);
    }
  },

  // ------------------------------------------------------------------ first night: the wait
  /** Nobody here. The tube flickers, a bag of crisps on the table; after a while footsteps up the road. */
  async _waitForKong(S) {
    this.phase = 'wait';
    this.waitT = 0;
    setObjective('waitKong');
    const G = lm('garage');
    const A = G?.anchors || {};
    if (A.tableAnchor) {
      const tp = wpos(A.tableAnchor, new THREE.Vector3()).add(_v.set(0.3, 0, -0.17).applyAxisAngle(new THREE.Vector3(0, 1, 0), G.yaw ?? 0));
      this.chips = createChips(this.stage, { position: tp, yaw: G.yaw ?? 0, enabled: () => this.phase === 'wait' || this.phase === 'arrive' });
    }
    S.wait(3.5)
      .then(() => {
        if (this.phase === 'wait') g.ui.subtitle({ speakerTH: 'ต้น', speakerEN: 'Ton', th: 'อากงไม่อยู่แฮะ… รอแป๊บนึงก็ได้', en: "Ah Kong's not here… I'll wait a bit.", tone: 'thought', duration: 4.5 });
      })
      .catch(() => {});
    try {
      this.chores = new Chores(this.stage, {});
    } catch (e) {
      console.warn('[garage] chores', e);
    }
    const startAt = 30 + Math.random() * 14; // he walks in ~25 s later: 55-70 s in all
    const C = this.chips;
    await S.step(waitFor(() => !this.active || (this.waitT > startAt || (C && C.eaten >= 3 && g.engine.time - C.lastEatAt > 2.5)) || this.waitT > 200));
    this.phase = 'arrive';
    await this._kongArrives(S);
    const ate = (this.chips?.eaten || 0) > 0;
    this.chips?.putAway?.();
    objectiveDone();
    // he noticed: the crisps
    this._arrivalReact = ate ? KONG_REACT.chips : [];
  },

  /** Footsteps on the tarmac out of the fog, then he walks in. */
  async _kongArrives(S) {
    const h = g.ahKong;
    const G = lm('garage');
    const A = G?.anchors || {};
    const gS = G?.roadRef?.s ?? 0;
    const start = roadPoint('main', gS + 19, -3.75);
    ahKongStand(start, roadPoint('main', gS, -3.75));
    h.setOpacity?.(1);
    const prevStep = h.onFootstep;
    h.onFootstep = () => {
      const surf = g.world?.surfaceAt?.(h.root.position.x, h.root.position.z) || 'asphalt';
      sfx(`footstep_${['gravel', 'concrete', 'grass', 'wood', 'puddle'].includes(surf) ? surf : 'asphalt'}`, { object: h.root, volume: 0.5, rate: 0.92 });
    };
    this.stage.add(() => (h.onFootstep = prevStep));
    const near = () => waitFor(() => this._nearKong(2.3));
    const leg = (to, secs, speed = 1.3) => S.step(Promise.race([h.walkTo(to, { speed }), wait(secs), near()]));
    try {
      await leg(roadPoint('main', gS + 3.2, -3.85), 26);
      const front = A.playerArrive ? wpos(A.playerArrive, new THREE.Vector3()) : roadPoint('main', gS, -6.2);
      if (!this._nearKong(2.3)) await leg(front, 10);
      if (!this._nearKong(2.3)) {
        const p = g.player.root.position;
        const dir = _v.copy(h.root.position).sub(p).setY(0).normalize();
        h.lookAt(g.player.eye, { weight: 0.8, speed: 2 });
        await leg(p.clone().addScaledVector(dir, 1.3), 10);
      }
    } finally {
      h.stopWalking?.();
    }
    await kongTurn(g.player.root.position);
  },

  _nearKong(r) {
    const a = g.ahKong.root.position;
    const p = g.player.root.position;
    return Math.hypot(a.x - p.x, a.z - p.z) < r;
  },

  _onLine(l) {
    const set = l?.set || {};
    if (set.hasKeys) {
      g.player.hold?.('keys');
      sfx('coins', { object: g.player.root, volume: 0.35, rate: 1.6 });
    }
    if (set.hasPaper) {
      g.player.hold?.('paper');
      sfx('paper_unfold', { object: g.player.root, volume: 0.6 });
    }
  },

  /** Cinematic conversation framing around fn(). */
  async _converse(S, fn) {
    const A = g.actions;
    g.player.setWalkEnabled(false);
    A?.setAllowed({ paper: false, amulet: false, vehicle: false });
    const ak = g.ahKong;
    if (!ak._seated) kongTurn(g.player.root.position);
    ak.lookAt(g.player.eye, { weight: 1, speed: 3 });
    await S.step(g.cine.converse(ak, { zoom: -9, strength: 0.55 }));
    try {
      await fn();
    } finally {
      g.cine.endConverse();
      ak.lookAt(g.player.eye, { weight: 0.6, speed: 2 });
    }
    S.chk();
  },

  // ------------------------------------------------------------------ the loop restart
  async _restartFlow(S, loops) {
    const A = g.actions;
    const AK = g.data?.ahkong || {};
    const L = logic();
    const save = g.save;
    // Ton wakes on the stool: looking at his hands, the tube buzzing, the gecko
    this._standTon('stool');
    g.player.setWalkEnabled(false);
    const rig = g.cameraRig;
    rig.lookEnabled = false;
    rig.pitch = -0.78;
    g.cine.blur(1, 0.01);
    sfx('breath', { object: g.player.root, volume: 0.8 });
    sfx('heartbeat', { volume: 0.5 });
    g.cine.fade(0, 2.6);
    if (this.where === 'dark') {
      // the stool is empty: he steps out of the dark at the back of the garage
      const G = lm('garage');
      const back = G?.anchors?.tableAnchor ? wpos(G.anchors.tableAnchor, new THREE.Vector3()) : g.player.root.position.clone();
      back.add(_v.set(-1.6, 0, -2.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), G?.yaw ?? 0));
      ahKongStand(back, g.player.root.position);
      g.ahKong.root.visible = true;
    }
    await S.wait(1.2);
    g.cine.blur(0, 2.6);
    const p0 = rig.pitch;
    let tt = 0;
    await S.step(
      new Promise((res) => {
        const off = g.engine.onUpdate((dt) => {
          tt += dt;
          const k = easeInOut(clamp(tt / 2.6));
          rig.pitch = p0 + (-0.04 - p0) * k;
          if (tt >= 2.6) {
            off();
            res();
          }
        }, 46);
        this.stage.add(off);
      }),
    );
    rig.lookEnabled = true;
    if (this.where === 'dark') {
      const p = g.player.root.position;
      const dir = _v.copy(g.ahKong.root.position).sub(p).setY(0).normalize();
      await S.step(Promise.race([g.ahKong.walkTo(p.clone().addScaledVector(dir, 1.4), { speed: 1.3 }), wait(7)]));
    }
    // the talk
    let keys = null;
    this.phase = 'talk';
    await this._converse(S, async () => {
      const alive = () => this.active;
      // "again, huh?"
      const entry = L.byLoop ? L.byLoop(AK.RESTART_LINES || [], loops) : null;
      if (entry) {
        const heard = Array.isArray(save.flags['k.restartHeard']) ? save.flags['k.restartHeard'] : [];
        let lines = entry.lines;
        if (heard.includes(entry.minLoop) && entry.variants?.length) lines = entry.variants[Math.floor(Math.random() * entry.variants.length)];
        if (!heard.includes(entry.minLoop)) save.flags['k.restartHeard'] = [...heard, entry.minLoop];
        await runLines(resolve(lines), { alive });
      }
      S.chk();
      // one hint about the last death
      const deaths = save.deaths || [];
      const last = deaths[deaths.length - 1] || null;
      const P0 = this.params || {};
      const type = P0.lastDeath || save.lastDeath || last?.type || last?.cause || null;
      const hint = type && (AK.DEATH_HINTS?.[type] || AK.DEATH_HINTS?.[last?.cause]);
      if (hint) await runLines(resolve(hint), { alive });
      S.chk();
      // back to the hour you got lost in?
      const TS = AK.TIME_SKIP;
      const dh = P0.deathHour ?? save.deathHour ?? last?.hour ?? 21;
      if (TS && loops >= (TS.minDeaths ?? 2) && dh > 21.05) {
        const r = await runLines(resolve([TS.offer, TS.choice]), { alive });
        const accept = (r.choices.timeSkip ?? TS.choice?.choice?.defaultKey) === 'accept';
        await runLines(resolve(accept ? TS.accept : TS.decline), { alive });
        if (accept) this.timeSkip = this._skipTarget(last, dh);
      }
      S.chk();
    });
    // before the keys: the spirit house, every night
    await this._choresPhase(S, CH.CHORES_RESTART, ['shrine']);
    this.phase = 'talk';
    await this._converse(S, async () => {
      const alive = () => this.active;
      // the keys (and, from the fourth night, the way out)
      const r = await runLines(resolve(AK.RESTART_KEYS || []), { alive });
      keys = r.choices.restart_keys || 'take';
      S.chk();
      if (!save.flags.refusedShift) await runLines(resolve(AK.SEND_OFF || []), { alive });
    });
    g.persist();
    this.refused = !!save.flags.refusedShift;
    void keys;
    // free: walk to the taxi (or, if he refused, to the motorbike)
    this.phase = 'free';
    this.freeT = 0;
    this.freeNag = new Nag('slow', [35, 70, 105]);
    setObjective(this.refused ? 'getIn' : 'getIn');
    A.setAllowed({ paper: true, amulet: true, vehicle: true });
    g.player.setWalkEnabled(true);
    if (this.refused) this._bikeItem();
    this._waitForTaxi(S);
  },

  _skipTarget(last, deathHour) {
    const P = g.data?.passengers?.PASSENGERS || [];
    const given = this.params?.deathRide ?? g.save?.deathRide;
    let i = Number.isFinite(given) ? given : P.findIndex((p) => p.id === last?.rideId);
    if (i < 0) i = clamp(Math.floor(deathHour) - 21, 0, Math.max(0, P.length - 1));
    i = clamp(i, 0, Math.max(0, P.length - 1));
    const hour = P[i]?.hour ?? 21 + i;
    return { ride: i, hour };
  },

  /** Wait until Ton is in the driver's seat, then send him off. */
  async _waitForTaxi(S) {
    try {
      await S.step(new Promise((res) => {
        const off = bus.once('player:enterTaxi', () => {
          objectiveDone();
          if (g.dialogue.busy) g.dialogue.interrupt(); // Ton is in the car: the old man lets him go
          res();
        });
        this.stage.add(off);
        if (g.actions.inTaxi) res();
      }));
      await this._leave(S);
    } catch (e) {
      if (!isAbort(e)) console.error('[garage] wait taxi', e);
    }
  },

  async _leave(S) {
    if (this.leaving) return;
    this.leaving = true;
    this.phase = 'leaving';
    const save = g.save;
    const AK = g.data?.ahkong || {};
    LoopStaging.radioOff();
    const thought = LoopStaging.notify('enterTaxi');
    if (thought) await S.step(Promise.race([thought, wait(6)]));
    g.ui.hint(null);
    // he walks to the window
    if (!g.ahKong._seated) {
      const win = taxiPoint(1.55, 0, -0.35, new THREE.Vector3());
      kongWalk(win, { face: taxiPoint(0.4, 0, -0.3, new THREE.Vector3()) }).catch(() => {});
    }
    if (save?.flags?.refusedShift) {
      await S.wait(0.6); // (no more talk once he is in the car)
      save.flags.refusedShift = false;
      save.flags.hasKeys = true;
      S.chk();
    }
    const ts = this.timeSkip;
    save.stage = 'shift';
    save.rideIndex = ts ? ts.ride : 0;
    save.hour = ts ? ts.hour : 21;
    g.persist();
    if (ts) {
      // "close your eyes... count to three"
      await S.wait(0.8);
      await S.step(g.cine.fade(1, 1.6));
      sfx('heartbeat', { volume: 0.7 });
      await S.wait(1.4);
      g.fsm.go('shift', { ride: ts.ride, hour: ts.hour, timeSkip: true, fromGarage: true });
      return;
    }
    await S.wait(1.2);
    g.taxi.setInteractionsEnabled(true);
    g.fsm.go('shift', { ride: 0, hour: 21, fromGarage: true });
  },

  // ------------------------------------------------------------------ the way out (ride_away)
  _bikeItem() {
    const bike = g.bike;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 1.8), new THREE.MeshBasicMaterial());
    box.layers.set(LAYERS.INTERACT);
    box.position.set(0, 0.7, 0);
    bike.root.add(box);
    const item = interact.register({
      id: 'garage.bike', object: box, labelTH: 'ขี่รถเครื่อง', labelEN: 'Ride the motorbike', icon: 'hand', reach: 2.2,
      enabled: () => this.phase === 'free' && g.actions.onFoot && !g.actions.busy,
      onUse: () => this._mountBike(),
    });
    this.stage.add(() => {
      interact.unregister(item);
      box.removeFromParent();
      box.geometry.dispose();
    });
    // V near the bike works too
    this.stage.update(() => {
      if (this.phase !== 'free' || !g.actions.onFoot) return;
      if (g.input.pressed('vehicle') && bike.root.position.distanceTo(g.player.root.position) < 2.2 && !g.actions.canEnter()) this._mountBike();
    }, 3);
  },

  async _mountBike() {
    if (this.phase !== 'free') return;
    this.phase = 'riding';
    const bike = g.bike;
    g.ui.hint(null);
    g.player.setWalkEnabled(false);
    await g.cine.fade(1, 0.35);
    if (!this.active) return;
    g.player.enterVehicle(bike);
    g.actions.bikeCamera();
    bike.physics.frozen = false;
    bike.setEngine(true);
    bike.setHeadlight(true);
    bike.setControlsEnabled(true);
    this.stage.emit('headlightBugs', { object: bike.root, count: 60 });
    g.cine.fade(0, 0.6);
    sfx('engine_start', { object: bike.root, volume: 0.5 });
    // Ah Kong watches him go
    g.ahKong.lookAt(g.player.eye, { weight: 1, speed: 2 });
  },

  /** Riding out: spurStart ends the night; riding off along the main road brings him round. */
  _rideCheck() {
    const bike = g.bike;
    const pos = bike.root.position;
    const start = lm('spurStart');
    const pr = g.world.road.project(pos, bike.physics.roadRef?.id || 'spur');
    const atStart = (start && start.pos.distanceTo(pos) < 14) || (pr?.id === 'spur' && pr.s < 9);
    if (atStart) {
      this.phase = 'gone';
      const save = g.save;
      save.flags.rodeAway = true;
      g.persist();
      const L = logic();
      const e = L.resolveEnding ? L.resolveEnding('garage', { save, hour: 21 }) : null;
      g.fsm.go('ending', { ending: e?.id || 'ride_away' });
      return;
    }
    const G = lm('garage');
    if (pr?.id === 'main' && G && G.pos.distanceTo(pos) > 140 && !this._blink) {
      // the forest road leads only round in a circle: back to the junction, facing out
      this._blink = true;
      g.cine.fade(1, 0.5).then(() => {
        if (!this.active) return;
        const s = Math.max(0, roadLen('spur') - 18);
        bike.setPose(roadPoint('spur', s, 1.3), roadYaw('spur', s) + Math.PI);
        g.cine.fade(0, 0.8);
        this._blink = false;
      });
    }
  },

  // ------------------------------------------------------------------ per frame
  _tick(dt) {
    if (this.phase !== 'talk' && this.phase !== 'setup') LoopStaging.update(dt);
    if (this.phase === 'wait' || this.phase === 'arrive') {
      this.waitT = (this.waitT || 0) + dt;
    } else if (this.phase === 'chores') {
      this._idleNudgeChores(dt);
    } else if (this.phase === 'walkToKong') {
      this.walkT = (this.walkT || 0) + dt;
      if (this.walkT > 7 && !this._walkHint) {
        this._walkHint = true;
        g.ui.hint({ th: 'เดิน', en: 'Walk', keys: ['W', 'A', 'S', 'D'], duration: 7 });
      }
      this._idleNudge(dt, 24);
      g.ahKong.lookAt(g.player.eye, { weight: 0.7, speed: 2 });
    } else if (this.phase === 'free') {
      this.freeT += dt;
      if (this.freeT > 14 && !this._carHint && !this.refused) {
        this._carHint = true;
        g.ui.hint({ th: 'ขึ้นรถ', en: 'Get in', keys: ['V'], duration: 7 });
      }
      this._idleNudge(dt, 30);
      // never stranded: after a long while the night simply carries him to the wheel
      const lv = this.refused ? 0 : this.freeNag?.update(dt) || 0;
      if (lv === 1 || lv === 2) scold('slow', lv);
      if ((lv === 3 || this.freeT > 150) && !this.refused && !this._autoSeat && !g.actions.busy && !g.actions.inTaxi) {
        if (lv === 3) scold('slow', 3);
        this._autoSeat = true;
        g.cine.fade(1, 0.8).then(() => {
          if (!this.active || this.phase !== 'free') return;
          g.actions.seatInTaxi();
          g.cine.fade(0, 1.0);
          bus.emit('player:enterTaxi', {});
        });
      }
    } else if (this.phase === 'riding') {
      this._rideCheck();
    }
  },

  _idleNudge(dt, every) {
    this.idleT += dt;
    if (this.idleT < every || g.dialogue.busy) return;
    this.idleT = 0;
    const L = g.data?.ahkong?.GARAGE_IDLE || [];
    if (this.idleLines >= L.length) return;
    runLines(resolve([L[this.idleLines++]]));
  },

  _fallbackOut() {
    g.cine.fade(0, 0.5);
    g.cine.endConverse?.();
    if (this.restart) {
      if (!g.actions.inTaxi) g.actions.seatInTaxi();
      g.fsm.go('shift', { ride: this.timeSkip?.ride ?? 0, hour: this.timeSkip?.hour ?? 21, fromGarage: true });
    } else g.fsm.go('tutorial', { fromGarage: true });
  },

  exit(_g, next) {
    if (next === 'shift') retireAhKong();
    if (next !== 'tutorial') clearObjective();
    g.ui.hint(null);
    g.cameraRig.lookEnabled = true;
    g.cine.blur(0, 0.3);
    if (g.cine._conv) g.cine.endConverse();
    this.cam?.stop();
    this.stage?.clear();
    g.ahKong.lookAt(null);
    g.player.hold?.(null);
    g.clock.autoWeather = true;
    this.phase = 'done';
  },
};
