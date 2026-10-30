// The KM 9 garage (GAME_DESIGN §8 + the loop).
// First night: Ton walks (full body, first person) to Ah Kong; a cinematic conversation with
// Ton's replies (data.ahkong.INTRO_GARAGE); the keys and the folded rules paper -> TutorialState.
// Restart (params.restart): Ton wakes at 21:00 again. LoopStaging dresses the garage for the loop
// (dash tally, calendar, the radio already playing, the ash), then RESTART_LINES ->
// DEATH_HINTS -> TIME_SKIP -> RESTART_KEYS (refuse from loop 3 -> ride the motorbike out:
// ending ride_away) -> SEND_OFF; Ton walks to the taxi and gets in -> ShiftState {ride, hour}.
import * as THREE from 'three';
import { g } from '../context.js';
import { wait } from '../util.js';
import { bus } from '../../core/Events.js';
import { interact } from '../../core/Interact.js';
import { LAYERS } from '../../core/layers.js';
import { clamp, easeInOut } from '../../core/math.js';
import { ensurePlayerActions } from '../systems/PlayerActions.js';
import { LoopStaging } from '../systems/LoopStaging.js';
import { setupGarage, ahKongFace, ahKongStand, walkAroundTaxi, retireAhKong } from '../opening/garageSet.js';
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
    this.set = setupGarage(this.stage, { ahKong: where === 'stool' ? 'stool' : where === 'dark' ? 'none' : 'besideTaxi', interactions: true });
    this.where = where;
    this._parkBike();
    this._talkItem();
    this.stage.update((dt) => this._tick(dt), 1);
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
      enabled: () => this.phase === 'walkToKong' && g.ahKong.root.visible,
      onUse: () => (this.talkWanted = true),
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
    // walk to the old man
    this.phase = 'walkToKong';
    this.walkT = 0;
    const ok = await S.step(waitFor(() => this.talkWanted || this._nearKong(2.0) || this.walkT > 80 || !this.active));
    void ok;
    if (this.walkT > 80 && !this._nearKong(2.4)) {
      // he comes over himself
      const p = g.player.root.position;
      const dir = _v.copy(g.ahKong.root.position).sub(p).setY(0).normalize();
      await S.step(Promise.race([g.ahKong.walkTo(p.clone().addScaledVector(dir, 1.3)), wait(8)]));
    }
    this.phase = 'talk';
    g.ui.hint(null);
    await this._converse(S, async () => {
      const lines = resolve(g.data?.ahkong?.INTRO_GARAGE || []);
      await runLines(lines, { alive: () => this.active, onLine: (l) => this._onLine(l) });
    });
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
    if (!ak._seated) ahKongFace(g.player.root.position);
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
      await S.step(Promise.race([g.ahKong.walkTo(p.clone().addScaledVector(dir, 1.4)), wait(7)]));
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
        const off = bus.once('player:enterTaxi', () => res());
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
      walkAroundTaxi(g.ahKong, win).then(() => {
        if (this.active) ahKongFace(taxiPoint(0.4, 0, -0.3, _v));
      });
    }
    if (save?.flags?.refusedShift) {
      await S.wait(1.4);
      await runLines(resolve(AK.REFUSE_RETURN || []), { alive: () => this.active });
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
    if (this.phase === 'walkToKong') {
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
      if (this.freeT > 150 && !this.refused && !this._autoSeat && !g.actions.busy && !g.actions.inTaxi) {
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
