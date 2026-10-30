// Main menu over a LIVE driving scene (GAME_DESIGN §8): the old taxi drives itself through the
// night forest, nobody at the wheel, a passenger in the back. Slow cinematic cameras cut between
// the cabin (over the empty driver's seat, the garland swinging), chase and fly-by shots with
// the headlights cutting the fog, and the rear-view mirror. Then it reaches ศาลเจ้ามารวย: the
// passenger gets out, walks down the LEFT road, and the gigantic hand rises from the fog.
// New game -> slot picker -> the camera dives into the fog and comes out on the motorbike.
// Debug: ?start=menu&menuShot=cabin|chase|flyby|mirror|wheel|crane|incident
import * as THREE from 'three';
import { g } from '../context.js';
import { wait } from '../util.js';
import { clamp, damp, easeInOut, smoothstep } from '../../core/math.js';
import { ensurePlayerActions } from '../systems/PlayerActions.js';
import { LoopStaging } from '../systems/LoopStaging.js';
import { makeGiantHand } from '../opening/GiantHand.js';
import { attachToLatestRoll } from '../endings/credits.js';
import { CineCam, Stage, roadPoint, roadYaw, roadLen, taxiPoint, wpos, yawTo, music, fogColor, sfx, warmTaxi, isAbort, ABORT, hidePlayer, releaseSky, quietDirector } from '../opening/common.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

const SHOTS = ['cabin', 'chase', 'mirror', 'flyby', 'wheel', 'cabin2', 'crane'];

export const MenuState = {
  name: 'menu',

  async enter(params = {}) {
    ensurePlayerActions();
    g.actions?.setEnabled(false);
    g.input.setWantPointerLock(false);
    quietDirector();
    g.ui.setCrosshair?.(false);
    this.stage = new Stage();
    this.loopStage = new Stage();
    this.cam = new CineCam();
    this.diving = false;
    this.cycle = 0;
    releaseSky();
    g.clock.set(22.6);
    g.clock.frozen = true;
    g.clock.autoWeather = false;
    g.sky?.setWeather({ rain: 0.32, fog: 0.85, wind: 0.45 }, 0);
    g.sky?.setFogBoost?.(1.25, 0.1);
    g.sky?.setGroundMist?.(1.4, 0.1);
    g.cine.fade(1, 0);
    g.postfx.params.letterbox = 0;
    music('menu', 4);
    try {
      g.audio?.ambience?.set({ hour: 22.6, rain: 0.32, insideCar: false, windowsOpen: true, dread: 0.4 });
    } catch (e) {
      /* audio optional */
    }
    // nobody drives: the player body leaves the cab, the garage dressing goes away
    LoopStaging.clearGarage();
    if (g.player.mode !== 'foot') g.player.exitVehicle();
    g.player.setWalkEnabled(false);
    hidePlayer(true);
    g.ahKong.root.visible = false;
    g.bike.setEngine(false);
    g.bike.setHeadlight(false);
    g.taxi.setControlsEnabled(false);
    g.taxi.setInteractionsEnabled(false);
    g.taxi.physics.frozen = false;

    this._showMenu();
    // the live scene runs until the state is left
    this.run(params).catch((e) => {
      if (!isAbort(e)) console.error('[menu] scene', e);
    });
    await wait(0.4);
    if (this.active) g.cine.fade(0, 2.5);
  },

  _showMenu() {
    g.ui.showMainMenu({
      canResume: () => g.saves.lastUsed() != null,
      onNew: () => this._onNew(),
      onResume: () => this._onResume(),
      onSettings: () => g.ui.showSettings(),
      onCredits: () => {
        g.ui.showCredits();
        attachToLatestRoll('.dlb-credits .dlb-roll');
      },
    });
  },

  async _onNew() {
    if (this.diving) return;
    const slot = await g.ui.pickSlot('new');
    if (slot == null || !this.active) return;
    g.saves.create(slot);
    g.save = g.saves.data;
    g.save.stage = 'intro';
    g.persist();
    this.diving = true;
    g.ui.hideMainMenu();
    await this._dive();
    if (!this.active) return;
    g.fsm.go('intro', { fromMenu: true });
  },

  async _onResume() {
    if (this.diving) return;
    const slot = g.saves.lastUsed();
    if (slot == null) return;
    if (!g.saves.load(slot)) return;
    g.save = g.saves.data;
    this.diving = true;
    g.ui.hideMainMenu();
    await g.cine.fade(1, 1.4);
    if (!this.active) return;
    const s = g.save;
    const loops = s.loops || 0;
    switch (s.stage) {
      case 'intro':
        g.fsm.go('intro', { resume: true });
        break;
      case 'garage':
      case 'restart':
        g.fsm.go('garage', { restart: loops > 0, resume: true });
        break;
      case 'tutorial':
        g.fsm.go('garage', { resume: true, skipTalk: true });
        break;
      case 'shift': {
        const ride = clamp(s.rideIndex ?? 0, 0, 8);
        g.fsm.go('shift', { ride, hour: s.hour ?? 21 + ride, resume: true });
        break;
      }
      case 'ending':
      default:
        g.fsm.go('garage', { restart: loops > 0, newNight: true, resume: true });
    }
  },

  /** The camera pushes into the fog bank and the frame turns to fog; the intro comes out of it. */
  async _dive() {
    const cam = g.engine.camera;
    const from = cam.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    dir.y = Math.min(dir.y, 0.02);
    dir.normalize();
    const look0 = from.clone().addScaledVector(dir, 10);
    this.diveStop = true; // the director stops cutting
    const fc = fogColor();
    g.sky?.setFogBoost?.(4.5, 2.2);
    g.sky?.setGroundMist?.(3, 2.2);
    sfx('whisper', { volume: 0.25, pan: 0 });
    g.cine.fade(1, 2.4, fc);
    await this.cam.play((t, k) => {
      const e = easeInOut(k);
      this.cam.pos.copy(from).addScaledVector(dir, e * 26);
      this.cam.pos.y += Math.sin(k * Math.PI) * -0.4;
      this.cam.look.copy(look0).addScaledVector(dir, e * 26);
      this.cam.shot.fov = 50 + e * 18;
    }, 2.5, { shake: 0.002 });
  },

  // ------------------------------------------------------------------ the live scene
  async run(params) {
    const S = this;
    const chk = () => {
      if (!S.active) throw ABORT;
    };
    // the passenger (a market woman with her jasmine basket): a human, going the wrong way
    const C = g.data?.characters?.CHARACTERS || {};
    let pax = null;
    try {
      pax = this.stage.actor('sri', { id: 'menuPassenger' });
      g.dialogue.setSpeaker('menuPax', { nameTH: '', nameEN: '', voice: C.sri?.voice, humanoid: pax });
    } catch (e) {
      console.warn('[menu] passenger', e);
    }
    this.pax = pax;
    const only = g.params?.get?.('menuShot') || null;
    while (this.active) {
      try {
        await this._driveCycle(only);
        chk();
        if (this.diveStop) return;
        await this._incident();
        chk();
      } catch (e) {
        if (isAbort(e)) throw e;
        // a broken take: cut to black and roll the next one
        console.error('[menu] take', e);
        await wait(1.5);
        chk();
        if (this.hand) {
          try {
            if (this.pax) g.engine.scene.attach(this.pax.root);
          } catch (err) {
            /* ignore */
          }
          this.hand.dispose();
          this.hand = null;
        }
        if (!this.diveStop) g.cine.fade(0, 1.5);
      }
      if (this.diveStop) return;
      this.cycle++;
    }
  },

  _seatPassenger() {
    const p = this.pax;
    if (!p) return;
    try {
      p.root.visible = true;
      p.setOpacity?.(1);
      p.stopWalking?.();
      p.lookAt(null);
      p.sitAt(g.taxi.seats.rearLeft, { pose: 'sitCar', blend: 0.01 });
      g.taxi.setSeatWeight?.('rearLeft', 70);
    } catch (e) {
      console.warn('[menu] seat', e);
    }
  },

  async _driveCycle(only) {
    const chk = () => {
      if (!this.active) throw ABORT;
    };
    const t = g.taxi;
    const L = roadLen('main');
    const stopS = Math.min(g.world.fork?.decisionS ?? L - 2, L) - 7.5;
    const startS = only === 'incident' ? stopS - 60 : L - 470 + ((this.cycle * 37) % 60);
    t.autopilot(null);
    t.setPose(roadPoint('main', startS, -1.55), roadYaw('main', startS));
    warmTaxi({ headlights: 'low' });
    t.state.meterOn = true;
    t.state.vacantLamp = false;
    t.state.radioOn = false;
    this._seatPassenger();
    const arrive = t.autopilot({ splineId: 'main', s: startS, speedKmh: 33, stopAt: stopS });
    let arrived = false;
    arrive.then((ok) => (arrived = ok !== false));
    const sOf = () => t.physicsSim.roadRef?.s ?? startS;
    let i = this.cycle * 2;
    while (!arrived && this.active && !this.diveStop) {
      const remain = stopS - sOf();
      if (remain < 75) break;
      const name = only && only !== 'incident' ? only : SHOTS[i++ % SHOTS.length];
      const dur = Math.min(name === 'flyby' ? 7.5 : 8.5, Math.max(3.5, remain / 9.5 - 6.5));
      await this._shot(name, dur);
      chk();
    }
    if (this.diveStop) return;
    // the shrine: lanterns in the fog, the taxi rolls in and stops at the fork
    if (!arrived) {
      await Promise.race([this._shot('shrine', 14), arrive]);
      chk();
      await Promise.race([arrive, wait(12)]);
      chk();
    }
    t.autopilot(null);
    t.state.handbrake = true;
  },

  /** One camera shot over the self-driving taxi. */
  _shot(name, dur) {
    const cam = this.cam;
    const t = g.taxi;
    const sm = new THREE.Vector3();
    const smL = new THREE.Vector3();
    let init = false;
    const local = (x, y, z, out) => taxiPoint(x, y, z, out);
    switch (name) {
      case 'cabin':
      case 'cabin2': {
        // over the empty driver's seat: the wheel turns by itself, the garland swings
        const a = name === 'cabin' ? [0.08, 1.24, 0.95] : [-0.32, 1.2, 0.85];
        const l = name === 'cabin' ? [0.42, 0.98, -2.6] : [0.3, 1.02, -2.2];
        return cam.play((tt, k) => {
          local(a[0] + k * 0.05, a[1] - k * 0.02, a[2] - k * 0.12, cam.pos);
          local(l[0], l[1], l[2], cam.look);
          cam.shot.fov = name === 'cabin' ? 54 : 46;
        }, dur, { shake: 0.003 });
      }
      case 'mirror': {
        // the rear-view mirror: her eyes in the glass
        return cam.play((tt, k) => {
          local(0.2 - k * 0.03, 1.19, -0.16, cam.pos);
          local(-0.012, 1.226, -0.455, cam.look);
          cam.shot.fov = 30 - k * 4;
        }, dur, { shake: 0.0015 });
      }
      case 'chase': {
        return cam.play((tt, k, dt) => {
          local(-1.35, 1.0 + k * 0.25, 7.8 - k * 1.2, _a);
          local(0.2, 0.85, -9, _b);
          if (!init) {
            sm.copy(_a);
            smL.copy(_b);
            init = true;
          }
          cam.pos.copy(followV(sm, _a, 3.2, dt));
          cam.look.copy(followV(smL, _b, 6, dt));
          cam.shot.fov = 48;
        }, dur, { shake: 0.004 });
      }
      case 'wheel': {
        return cam.play((tt, k, dt) => {
          local(1.55, 0.32, -3.3 + k * 1.2, _a);
          local(0.55, 0.55, 0.6, _b);
          if (!init) {
            sm.copy(_a);
            smL.copy(_b);
            init = true;
          }
          cam.pos.copy(followV(sm, _a, 5, dt));
          cam.look.copy(followV(smL, _b, 8, dt));
          cam.shot.fov = 40;
        }, dur, { shake: 0.003 });
      }
      case 'flyby': {
        // a static roadside camera the taxi passes: the beams sweep the fog and the trunks
        const s0 = (t.physicsSim.roadRef?.s ?? 0) + Math.min(70, dur * 9.2 * 0.62);
        const p = roadPoint('main', s0, 4.0);
        p.y += 1.15;
        return cam.play((tt, k) => {
          cam.pos.copy(p);
          local(0, 0.7, -1.2, _a);
          if (!init) {
            smL.copy(_a);
            init = true;
          }
          smL.lerp(_a, 0.2);
          cam.look.copy(smL);
          cam.shot.fov = 44;
        }, dur, { shake: 0.002 });
      }
      case 'crane': {
        return cam.play((tt, k, dt) => {
          local(3.5 - k * 2, 7.5 - k * 2.5, -9 + k * 6, _a);
          local(0, 0.6, -2, _b);
          if (!init) {
            sm.copy(_a);
            smL.copy(_b);
            init = true;
          }
          cam.pos.copy(followV(sm, _a, 2.4, dt));
          cam.look.copy(followV(smL, _b, 6, dt));
          cam.shot.fov = 52;
        }, dur, { shake: 0.002 });
      }
      case 'shrine':
      default: {
        // from the shrine's forecourt, low among the lanterns, back down the road
        const F = g.world.fork;
        const shrine = g.world.landmarks.shrineMaRuay;
        const fc = wpos(shrine?.anchors?.forecourtAnchor || F?.pos, new THREE.Vector3());
        const L = roadLen('main');
        const road = roadPoint('main', L - 6, 0);
        const side = new THREE.Vector3().subVectors(fc, road).normalize();
        const p = road.clone().addScaledVector(side, 5.5);
        p.y += 1.1;
        return cam.play((tt, k) => {
          cam.pos.copy(p).addScaledVector(side, k * 1.2);
          local(0, 0.8, -1, _a);
          cam.look.lerp(_a, tt < 0.05 ? 1 : 0.08);
          cam.shot.fov = 42;
        }, dur, { shake: 0.002 });
      }
    }
  },

  /** The incident at the fork: out, down the LEFT road, and the hand. */
  async _incident() {
    const chk = () => {
      if (!this.active || this.diveStop) throw ABORT;
    };
    const t = g.taxi;
    const pax = this.pax;
    const cam = this.cam;
    const F = g.world.fork;
    const ghostLen = roadLen('ghost');
    const walkS = Math.max(8, Math.min(ghostLen * 0.4, (F?.setback ?? 20) + 14) - 7);
    const handS = walkS + 3.2;
    const handPos = roadPoint('ghost', handS, 0.6);
    const walkTo = roadPoint('ghost', walkS, 0.2);
    const midWalk = roadPoint('ghost', Math.max(3, walkS * 0.35), -0.6);
    // 1. the door
    t.openDoor('rl', 1, 1.1);
    const doorShot = cam.play((tt, k) => {
      taxiPoint(-4.6, 1.35, 3.6, cam.pos);
      taxiPoint(-0.6, 0.9, 0.2, cam.look);
      cam.shot.fov = 40;
    }, 3.2, { shake: 0.002 });
    await wait(1.4);
    chk();
    if (pax) {
      try {
        pax.detach(g.engine.scene);
        const out = taxiPoint(-1.45, 0, 0.75, new THREE.Vector3());
        out.y = g.world.getHeight(out.x, out.z);
        pax.root.position.copy(out);
        pax.root.rotation.set(0, yawTo(out, midWalk), 0);
        pax.setMode('stand');
        g.taxi.setSeatWeight?.('rearLeft', 0);
      } catch (e) {
        console.warn('[menu] exit', e);
      }
    }
    await doorShot;
    chk();
    t.openDoor('rl', 0, 0.7);
    // 2. she walks down the left road into the fog
    const walking = pax ? pax.walkTo(midWalk).then(() => this.active && pax.walkTo(walkTo)) : wait(9);
    const behind = taxiPoint(0.9, 2.9, 5.5, new THREE.Vector3());
    await cam.play((tt, k) => {
      cam.pos.copy(behind);
      cam.pos.y += k * 0.4;
      if (pax) wpos(pax.root, _a);
      else _a.copy(walkTo);
      _a.y += 1.1;
      cam.look.lerp(_a, tt < 0.05 ? 1 : 0.06);
      cam.shot.fov = 38 - k * 6;
    }, 6.5, { shake: 0.002 });
    chk();
    // low on the left road, ahead of her: she comes out of the lantern light toward us
    const low = roadPoint('ghost', handS + 3.5, -2.4);
    low.y += 0.55;
    await Promise.race([
      cam.play((tt, k) => {
        cam.pos.copy(low);
        if (pax) wpos(pax.root, _a);
        else _a.copy(walkTo);
        _a.y += 1.0;
        cam.look.lerp(_a, tt < 0.05 ? 1 : 0.1);
        cam.shot.fov = 34;
      }, 9, { shake: 0.002 }),
      walking,
    ]);
    chk();
    // 3. the hand rises out of the mist
    const hand = makeGiantHand(handPos, yawTo(handPos, walkTo));
    this.hand = hand;
    let rumble = null;
    try {
      rumble = g.audio?.loop('giant_hand_rumble', { position: handPos, volume: 1 });
    } catch (e) {
      rumble = null;
    }
    const mist = this.loopStage.emit('mist', { position: handPos.clone(), radius: 7, intensity: 1.4 });
    sfx('sting_low', { volume: 0.9 });
    if (pax) {
      pax.stopWalking();
      pax.lookAt(new THREE.Vector3(handPos.x, handPos.y + 6, handPos.z), { weight: 1, speed: 2 });
      pax.setExpression?.({ fear: 1 });
    }
    const looking = wpos(pax?.root || walkTo, new THREE.Vector3()).add(new THREE.Vector3(0, 1.4, 0));
    const behindHer = looking.clone().addScaledVector(new THREE.Vector3().subVectors(looking, handPos).setY(0).normalize(), 3.2);
    behindHer.y = looking.y - 0.6;
    const risen = hand.rise(4.2);
    await cam.play((tt, k) => {
      cam.pos.copy(behindHer);
      _a.copy(handPos);
      _a.y += 1 + k * 5;
      cam.look.copy(looking).lerp(_a, 0.72);
      cam.shot.fov = 46 + k * 6;
    }, 4.6, { shake: 0.006 });
    await risen;
    chk();
    // 4. it closes around her: a wide from the shrine side, the taxi small in the fog
    const wide = roadPoint('main', roadLen('main') - 2, -6.5);
    wide.y += 2.4;
    sfx('scare_hit', { volume: 0.6 });
    const grabbing = hand.grab(pax?.root || null, { height: 1.55, humanoid: pax, lift: true, sink: false });
    wait(1.2).then(() => {
      sfx('bone_crack', { position: handPos, volume: 0.7 });
      sfx('scream_far', { position: handPos, volume: 0.8 });
      g.cameraRig.shake?.(0.25);
    });
    await cam.play((tt, k) => {
      cam.pos.copy(wide);
      _a.copy(handPos);
      _a.y += 3.5;
      cam.look.lerp(_a, tt < 0.05 ? 1 : 0.05);
      cam.shot.fov = 40 - k * 4;
    }, 5.2, { shake: 0.004 });
    await grabbing;
    chk();
    const sinking = hand.sink(3.8);
    // 5. the empty taxi drives on, RIGHT, its tail-lights fading into the fog
    t.state.handbrake = false;
    t.autopilot({ splineId: 'human', s: 0, speedKmh: 22 });
    const fork = roadPoint('main', roadLen('main') - 16, 2.8);
    fork.y += 1.5;
    await cam.play((tt, k) => {
      cam.pos.copy(fork);
      taxiPoint(0, 0.8, 0, _a);
      cam.look.lerp(_a, tt < 0.05 ? 1 : 0.04);
      cam.shot.fov = 40;
    }, 4.5, { shake: 0.002 });
    await sinking;
    rumble?.stop?.(2.5);
    g.cine.fade(1, 1.6);
    await wait(1.8);
    mist.dispose?.();
    this.loopStage.clear();
    if (pax) {
      try {
        g.engine.scene.attach(pax.root);
        pax.lookAt(null);
        pax.setExpression?.({ fear: 0 });
        pax.setGhost?.({ limbBreak: 0, headRoll: 0, jitter: 0 }, 50);
        pax.setGore?.({ bleedMouth: 0, bleedEyes: 0, amount: 0, speed: 50 });
      } catch (e) {
        /* ignore */
      }
    }
    hand.dispose();
    this.hand = null;
    t.autopilot(null);
    chk();
    wait(0.6).then(() => this.active && !this.diveStop && g.cine.fade(0, 2.2));
  },

  exit(_g, next) {
    this.cam?.stop();
    if (g.cameraRig.inCinematic && next !== 'intro') g.cameraRig.release(0.01);
    if (this.hand) {
      try {
        if (this.pax) g.engine.scene.attach(this.pax.root);
      } catch (e) {
        /* ignore */
      }
      this.hand.dispose();
      this.hand = null;
    }
    this.loopStage?.clear();
    this.stage?.clear();
    this.pax = null;
    g.dialogue.removeSpeaker?.('menuPax');
    g.taxi.autopilot(null);
    g.taxi.setSeatWeight?.('rearLeft', 0);
    g.ui.hideMainMenu();
    hidePlayer(false);
    g.ahKong.root.visible = true;
    g.clock.frozen = false;
    g.clock.autoWeather = true;
    if (next !== 'intro') {
      g.sky?.setFogBoost?.(1, 0.5);
      g.sky?.setGroundMist?.(1, 0.5);
    }
    g.ui.setCrosshair?.(true);
  },
};

function followV(cur, target, lambda, dt) {
  cur.x = damp(cur.x, target.x, lambda, dt);
  cur.y = damp(cur.y, target.y, lambda, dt);
  cur.z = damp(cur.z, target.z, lambda, dt);
  return cur;
}
void smoothstep;
