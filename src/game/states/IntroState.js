// Playable motorbike intro (GAME_DESIGN §8): 20:50, the spur road through the forest, first-person
// hands on the bars of an old rusty step-through. Insects in the headlight, dogs barking far off,
// a spirit house slides past, fog. Up to the KM 9 garage: a flickering fluorescent tube and an old
// man smoking beside a green-and-yellow taxi. Park, get off -> GarageState.
// The ride never strands anyone: after a while the bike rides itself the rest of the way.
import * as THREE from 'three';
import { g } from '../context.js';
import { wait } from '../util.js';
import { clamp, easeInOut, smoothstep } from '../../core/math.js';
import { input } from '../../core/Input.js';
import { ensurePlayerActions } from '../systems/PlayerActions.js';
import { LoopStaging } from '../systems/LoopStaging.js';
import { setupGarage } from '../opening/garageSet.js';
import { Stage, CineCam, guard, isAbort, lm, wpos, roadPoint, roadYaw, roadLen, music, fogColor, sfx, runLines, resolve, hidePlayer, releaseSky, ground, yawTo, quietDirector } from '../opening/common.js';

const _v = new THREE.Vector3();

export const IntroState = {
  name: 'intro',

  async enter(params = {}) {
    ensurePlayerActions();
    g.actions?.setEnabled(false);
    const S = guard(this);
    quietDirector();
    this.stage = new Stage();
    this.cam = new CineCam();
    this.t = 0;
    this.fired = new Set();
    this.phase = 'ride';
    this.idle = 0;
    this.stuck = 0;
    this.hinted = {};
    this.assist = false;
    if (g.save) {
      g.save.stage = 'intro';
      g.persist();
    }
    if (!params.fromMenu) g.cine.fade(1, 0);
    // 20:50, dry for now, the fog low
    releaseSky();
    g.clock.set(20.84);
    g.clock.autoWeather = false;
    g.sky?.setWeather({ rain: 0, fog: 0.7, wind: 0.3 }, params.fromMenu ? 3 : 0);
    g.sky?.setGroundMist?.(1.5, params.fromMenu ? 4 : 0.1);
    g.sky?.setFogBoost?.(params.fromMenu ? 4.5 : 1.25, 0.01);
    if (params.fromMenu) g.sky?.setFogBoost?.(1.25, 4.5);
    music('silence', 3);
    try {
      g.audio?.ambience?.set({ hour: 20.85, rain: 0, insideCar: false, windowsOpen: true, dread: 0.2 });
      g.audio?.setEnvironment?.('forest');
    } catch (e) {
      /* audio optional */
    }
    // the garage is waiting up ahead (first night: nothing has changed yet)
    LoopStaging.apply(0);
    this.garage = setupGarage(this.stage, { ahKong: 'besideTaxi' });
    // the bike, on the spur, engine running
    const s0 = 6;
    this.spurLen = roadLen('spur');
    const bike = g.bike;
    bike.autopilot(null);
    bike.physics.frozen = false;
    bike.setPose(roadPoint('spur', s0, -1.25), roadYaw('spur', s0));
    bike.setEngine(true);
    bike.setHeadlight(true);
    hidePlayer(false);
    if (g.player.mode !== 'foot') g.player.exitVehicle();
    g.player.enterVehicle(bike);
    g.actions?.bikeCamera({ pitch: -0.16 });
    g.cameraRig.release(params.fromMenu ? 1.2 : 0.01);
    bike.setControlsEnabled(true);
    g.input.setWantPointerLock(true);
    // insects in the headlight, mist over the road, moths at the garage tube
    this.stage.emit('headlightBugs', { object: bike.root, count: 70 });
    this.stage.emit('mist', { intensity: 1.1 });
    this.stage.emit('leaves', { intensity: 0.5 });
    // the spirit house: a candle and a thread of incense
    const sh = lm('spurShrine');
    if (sh) {
      const c = sh.anchors?.candleAnchor || sh.anchors?.incenseAnchor;
      if (c) this.stage.light({ kind: 'candle', object: c, intensity: 5, distance: 4.5, glow: { size: 0.35, opacity: 0.5 } });
      if (sh.anchors?.incenseAnchor) this.stage.emit('incense', { object: sh.anchors.incenseAnchor, count: 36, intensity: 0.8 });
    }
    // out of the fog (from the menu dive) or out of black
    if (params.fromMenu) g.cine.fade(0, 3.4, fogColor());
    else g.cine.fade(0, 2.2);
    // the text that started it all, on a cracked phone screen
    try {
      await S.wait(2.2);
      const P = g.data?.worldtext?.PHONE_MESSAGE;
      if (P) {
        sfx('switch_click', { volume: 0.25, pan: 0.4 });
        g.ui.subtitle({ speakerTH: `${P.fromTH} · ${P.time}`, speakerEN: `${P.fromEN} · ${P.time}`, th: P.th, en: P.en, tone: 'thought', duration: 6.5 });
      }
      this._dogs();
    } catch (e) {
      if (!isAbort(e)) console.error('[intro]', e);
    }
  },

  /** Dogs barking far off in the forest, then closer, then one howl. */
  async _dogs() {
    const S = guard(this);
    try {
      const plan = [
        [4, 0.3, 'dog_bark', 3],
        [16, 0.55, 'dog_bark', 5],
        [27, 0.75, 'dog_howl', 1],
        [40, 0.9, 'dog_bark', 2],
      ];
      let tPrev = 0;
      for (const [at, u, id, n] of plan) {
        await S.wait(at - tPrev);
        tPrev = at;
        if (this.phase !== 'ride') return;
        const s = clamp(u * this.spurLen + 25, 0, this.spurLen);
        const p = roadPoint('spur', s, (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 40));
        p.y += 2;
        sfx(id, { position: p, count: n, interval: 0.55 + Math.random() * 0.3, volume: 0.9 });
      }
    } catch (e) {
      if (!isAbort(e)) console.error('[intro] dogs', e);
    }
  },

  update(dt) {
    if (this.phase !== 'ride') return;
    this.t += dt;
    const bike = g.bike;
    const road = g.world.road;
    const pr = road.project(bike.root.position, bike.physics.roadRef?.id === 'main' ? 'main' : 'spur');
    const onSpur = pr && pr.id === 'spur';
    const u = onSpur ? clamp(pr.s / this.spurLen) : 1;
    // Ton's thoughts along the way
    for (const b of g.data?.ahkong?.INTRO_BIKE || []) {
      if (!this.fired.has(b.id) && u >= b.at) {
        this.fired.add(b.id);
        runLines(resolve(b.lines));
      }
    }
    // a word of help only if nothing happens
    const speed = bike.speedKmh;
    if (speed < 2) this.idle += dt;
    else this.idle = 0;
    if (this.idle > 6 && !this.hinted.throttle && this.t > 3) {
      this.hinted.throttle = true;
      g.ui.hint({ th: 'ขี่', en: 'Ride', keys: ['W', 'A', 'D'], duration: 6 });
    }
    // ridden back the wrong way, or not moving at all: the bike carries on by itself
    if (onSpur && pr.s < 2.5 && speed > 3) this.stuck += dt * 2;
    if (this.idle > 35) this.stuck += dt;
    if (!this.assist && (this.stuck > 3 || this.t > 170)) this._assist();
    // the garage
    const G = lm('garage');
    if (G) {
      const d = G.pos.distanceTo(bike.root.position);
      if ((d < 46 && (!onSpur || u > 0.92)) || (onSpur && u > 0.985) || (!onSpur && d > 60)) this._arrive();
    }
  },

  _assist() {
    this.assist = true;
    const bike = g.bike;
    const pr = g.world.road.project(bike.root.position, 'spur');
    const s = pr?.id === 'spur' ? pr.s : 6;
    const yaw = roadYaw('spur', s);
    // if facing back toward the outside world, quietly turn round behind a blink
    const fw = bike.forward;
    const tangent = g.world.road.sample('spur', s).tangent;
    const wrongWay = fw.x * tangent.x + fw.z * tangent.z < 0;
    const go = () => {
      bike.setControlsEnabled(false);
      bike.autopilot({ splineId: 'spur', s, speedKmh: 34 });
    };
    if (wrongWay) {
      g.cine.fade(1, 0.5).then(() => {
        if (!this.active) return;
        bike.setPose(roadPoint('spur', Math.max(6, s), -1.25), yaw);
        go();
        g.cine.fade(0, 0.8);
      });
    } else go();
  },

  /** Up to the garage: the bike rolls in under the tube and stops; Ton gets off. */
  async _arrive() {
    if (this.phase !== 'ride') return;
    this.phase = 'arrive';
    const S = guard(this);
    const bike = g.bike;
    try {
      g.ui.hint(null);
      bike.setControlsEnabled(false);
      const G = lm('garage');
      const L = roadLen('main');
      const gS = G.roadRef?.s ?? L * 0.08;
      const pr = g.world.road.project(bike.root.position, 'main');
      let s = pr?.id === 'main' ? pr.s : gS - 30;
      // came round the wrong way (or overshot): set up the approach behind a blink
      const tangent = g.world.road.sample('main', s).tangent;
      const fw = bike.forward;
      const behind = s < gS - 4;
      if (!behind || fw.x * tangent.x + fw.z * tangent.z < 0.2) {
        await S.step(g.cine.fade(1, 0.45));
        s = gS - 26;
        bike.setPose(roadPoint('main', s, -1.6), roadYaw('main', s));
        g.cine.fade(0, 0.9);
      }
      sfx('engine_rev', { object: bike.root, volume: 0.25 });
      await S.step(Promise.race([bike.autopilot({ splineId: 'main', s, speedKmh: 16, stopAt: gS - 5.5, lane: -1.7 }), wait(18)]));
      bike.autopilot(null);
      // roll off the road onto the apron, under the tube
      const A = G.anchors || {};
      const spot = A.bikeSpot ? wpos(A.bikeSpot, new THREE.Vector3()) : roadPoint('main', gS - 2, -5.2);
      const from = bike.root.position.clone();
      const yaw0 = bike.yaw;
      const yaw1 = yawTo(from, spot);
      const mid = from.clone().lerp(spot, 0.5).add(new THREE.Vector3(Math.sin(yaw0) * -1.2, 0, Math.cos(yaw0) * -1.2));
      const D = 3.4;
      let tt = 0;
      await S.step(
        new Promise((res) => {
          const off = g.engine.onUpdate((dt) => {
            tt += dt;
            const k = easeInOut(clamp(tt / D));
            // quadratic curve from the lane to the parking spot
            const a = 1 - k;
            _v.set(a * a * from.x + 2 * a * k * mid.x + k * k * spot.x, 0, a * a * from.z + 2 * a * k * mid.z + k * k * spot.z);
            _v.y = ground(_v.x, _v.z);
            let dy = yaw1 - yaw0;
            while (dy > Math.PI) dy -= Math.PI * 2;
            while (dy < -Math.PI) dy += Math.PI * 2;
            bike.setPose(_v, yaw0 + dy * smoothstep(0, 0.8, k));
            bike.wheelRot += (1 - k) * dt * 9;
            if (tt >= D) {
              off();
              res();
            }
          }, 9);
        }),
      );
      // engine off, the headlight dies, the tube buzzes
      bike.setEngine(false);
      bike.setHeadlight(false);
      sfx('engine_off', { object: bike.root, volume: 0.6 });
      await S.wait(0.9);
      // get off: the view rises and steps to the side
      const eye0 = g.engine.camera.position.clone();
      const look0 = eye0.clone().add(new THREE.Vector3(0, 0, -1).applyQuaternion(g.engine.camera.quaternion));
      const standAt = bike.root.position.clone().add(new THREE.Vector3(Math.cos(bike.yaw) * -0.85, 0, -Math.sin(bike.yaw) * -0.85));
      standAt.y = ground(standAt.x, standAt.z);
      const ak = g.ahKong.root.position;
      const yawStand = yawTo(standAt, ak);
      const eye1 = standAt.clone();
      eye1.y += 1.6;
      const look1 = eye1.clone().add(new THREE.Vector3(-Math.sin(yawStand), -0.05, -Math.cos(yawStand)));
      await S.step(
        this.cam.play((t, k) => {
          const e = easeInOut(k);
          this.cam.pos.lerpVectors(eye0, eye1, e);
          this.cam.pos.y += Math.sin(e * Math.PI) * 0.12;
          this.cam.look.lerpVectors(look0, look1, smoothstep(0.2, 1, k));
          this.cam.shot.fov = g.cameraRig.fovBase;
        }, 1.3, { shake: 0.0015 }),
      );
      g.player.exitVehicle();
      g.actions?.standAt(standAt, yawStand);
      this.cam.stop();
      g.cameraRig.release(0.25);
      this.phase = 'done';
      g.fsm.go('garage', { arrived: true });
    } catch (e) {
      if (!isAbort(e)) {
        console.error('[intro] arrive', e);
        if (this.active) g.fsm.go('garage', { arrived: false });
      }
    }
  },

  exit() {
    g.ui.hint(null);
    g.bike.setControlsEnabled(false);
    g.bike.autopilot(null);
    this.cam?.stop();
    this.stage?.clear();
    this.phase = 'done';
    g.clock.autoWeather = true;
    void input;
  },
};
