// The night shift (engineer B): free driving, the nine rides in order, the fork, the loop.
//   enter({ ride, hour, free, debug, restart, timeSkip })
//     ride: index into PASSENGERS (default saves.data.rideIndex) · hour: clock (default: that ride's hour)
//     free: start a long way before the pickup (free drive) · debug: URL start (always places the taxi)
//   Each ride: Ride.pickup() → Ride.ride() → resolveFork() → chapter card (Thai hour only) → autosave.
//   Ride 9 ends in the finale (Finale.js) and A's EndingState({ id }).
//   Every frame: the ride, C's encounter director (g.director.update unless director.selfUpdate),
//   the ambience bed and the phase music.
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { clamp } from '../../core/math.js';
import { wait } from '../util.js';
import { installGameplayB } from '../ride/install.js';
import { Ride } from '../ride/Ride.js';
import { taxiRoad, placeTaxi, mainS } from '../ride/fx.js';
import { resolveFork } from '../fork/Fork.js';
import { weatherFor } from '../Clock.js';
import { PASSENGERS } from '../data/passengers.js';
import { CHAPTERS, CHAPTER_TITLE_MAX_LOOP } from '../data/worldtext.js';

function phaseMood(hour, aboard) {
  if (hour < 23) return aboard ? 'silence' : 'dread';
  if (hour < 26) return 'surreal';
  if (hour < 27) return 'calm';
  if (hour < 28) return 'nostalgic';
  return 'dawn';
}

function ensureRunning(t) {
  const s = t.state;
  if (!s.engineOn) {
    s.keyInserted = true;
    s.ignition = 'on';
    s.engineOn = true;
    t.physicsSim.rpm = 900;
    bus.emit('taxi:engine', { on: true });
  }
  s.handbrake = false;
  if (g.settings.get('transmission') === 'manual') {
    if (!['1', '2', '3', '4', '5', 'N', 'R'].includes(s.gear)) s.gear = 'N';
  } else if (s.gear !== 'D') s.gear = 'D';
  if (s.headlights === 'off') s.headlights = 'low';
  for (const d of ['fl', 'fr', 'rl', 'rr', 'trunk']) if (s.doors[d] > 0.01) t.openDoor(d, 0, 0.01);
}

export const ShiftState = {
  name: 'shift',
  ride: null,
  rideIndex: 0,
  _runToken: 0,
  _retired: [],

  async enter(params = {}) {
    installGameplayB();
    const save = g.save;
    if (!save) {
      console.warn('[shift] no save loaded');
      return;
    }
    save.flags ||= {};
    save.deaths ||= [];
    const idx = clamp(Math.floor(params.ride ?? save.rideIndex ?? 0), 0, PASSENGERS.length - 1);
    const data = PASSENGERS[idx];
    this.rideIndex = idx;
    save.stage = 'shift';
    save.rideIndex = idx;
    const t = g.taxi;
    // ---- the clock -------------------------------------------------------------------------------
    const cur = g.clock.hour;
    const hour = params.hour ?? (cur >= data.hour && cur < data.hour + 0.95 ? cur : data.hour);
    g.clock.frozen = false;
    g.clock.autoWeather = true;
    if (Math.abs(g.clock.hour - hour) > 0.05) g.clock.set(hour);
    save.hour = Math.floor(hour);
    // ---- the taxi: keep it if it is already on the way to this pickup, else place it --------------
    const stopS = mainS(g.world.landmarks[data.pickup].stopPos);
    const r = taxiRoad();
    const keep = !params.debug && !params.free && r && r.id === 'main' && stopS - r.s > 20 && stopS - r.s < 900;
    if (!keep) {
      const back = params.free ? 520 : 170;
      const black = !params.debug;
      if (black) g.postfx.params.fade = 1;
      placeTaxi('main', Math.max(30, stopS - back), params.debug ? 30 : 0);
      ensureRunning(t);
      if (black) g.cine.fade(0, 1.6);
    }
    g.cameraRig.release(0.01);
    const onTaxi = () => {
      for (let o = g.cameraRig.base; o; o = o.parent) if (o === t.root) return true;
      return false;
    };
    const A = g.actions;
    if (A?.seatInTaxi) {
      // Ton's body in the driver's seat (hands on the wheel), the view in the cab
      if (!A.inTaxi) A.seatInTaxi();
      else if (!onTaxi()) A.seatCamera?.();
      A.setEnabled?.(true);
      A.setAllowed?.({ paper: true, amulet: true, vehicle: true, inspect: true });
    } else if (!onTaxi()) g.cameraRig.attach(t.anchors.driverEye, t.root);
    g.cameraRig.setFocus(null);
    t.setControlsEnabled(true);
    t.setInteractionsEnabled(true);
    g.input.setWantPointerLock(true);
    g.ui.setCrosshair?.(true);
    // ---- systems ------------------------------------------------------------------------------------
    g.rules.reset();
    g.exploration?.build();
    if (idx === 0) g.exploration?.resetNight();
    g.director?.setActive?.(true);
    // the amulet warms with a ghost aboard (softer with the father)
    g.actions?.setAmuletWarmth?.(() => {
      const p = g.ride?.passenger;
      return p && p.aboard ? p.amuletWarmth : 0;
    });
    this._mood = null;
    this._ambT = 0;
    g.persist();
    bus.emit('shift:start', { ride: idx, hour });
    // the hour card when the night (re)starts here (time-skip, resume, after the tutorial)
    if (!params.debug) setTimeout(() => this.active && this._chapter(data.hour), keep ? 400 : 1700);
    this.run(idx);
  },

  async run(startIdx) {
    const token = ++this._runToken;
    const alive = () => this.active && token === this._runToken;
    for (let i = startIdx; i < PASSENGERS.length; i++) {
      if (!alive()) return;
      const data = PASSENGERS[i];
      this.rideIndex = i;
      g.save.rideIndex = i;
      let ride;
      try {
        ride = new Ride(i, data);
      } catch (e) {
        console.error('[shift] could not start ride', i, e);
        return;
      }
      this.ride = ride;
      g.ride = ride;
      bus.emit('ride:start', { index: i, id: data.id });
      // ghost stains stay until the next pickup comes into view
      const stainOff = g.engine.onUpdate(() => {
        const rr = taxiRoad();
        if (rr?.id === 'main' && ride.stopS - rr.s < 140) {
          g.taxi.clearBlood();
          stainOff();
        }
      }, 0);
      let ok = false;
      try {
        ok = await ride.pickup();
      } finally {
        stainOff();
      }
      if (!ok || !alive()) return;
      bus.emit('ride:boarded', { index: i, id: data.id });
      const side = await ride.ride();
      if (!side || !alive()) return;
      bus.emit('ride:fork', { index: i, id: data.id, side });
      const res = await resolveFork(ride, side);
      if (res !== 'next' || !alive()) return;
      bus.emit('ride:delivered', { index: i, id: data.id, side });
      this._retire(ride);
      // the next hour: chapter card, autosave
      const next = PASSENGERS[i + 1];
      if (!next) return;
      g.save.rideIndex = i + 1;
      g.save.hour = next.hour;
      g.persist();
      g.clock.advanceTo(next.hour);
      this._chapter(next.hour);
      await wait(1);
    }
  },

  _chapter(hour) {
    const c = CHAPTERS.find((x) => x.hour === hour);
    if (!c) return;
    const loops = g.save?.loops || 0;
    const both = (g.settings.get('language') ?? 'th') === 'both';
    const card = { time: c.time, word: c.word };
    if (loops <= CHAPTER_TITLE_MAX_LOOP) {
      card.th = c.th;
      if (both) card.en = c.en;
    }
    g.audio?.play?.('chapter_chime', { bus: 'ui', volume: 0.6 });
    g.ui.chapter(card);
    bus.emit('shift:chapter', { hour });
  },

  /** A delivered ride: stop its listeners now, let the passenger walk away, dispose later. */
  _retire(ride) {
    if (g.ride === ride) g.ride = null;
    if (this.ride === ride) this.ride = null;
    ride.retire();
    this._retired.push(ride);
    setTimeout(() => {
      const i = this._retired.indexOf(ride);
      if (i >= 0) {
        this._retired.splice(i, 1);
        ride.dispose();
      }
    }, 22000);
  },

  update(dt) {
    const ride = this.ride;
    if (ride?.alive) ride.update(dt);
    const d = g.director;
    if (d && d.selfUpdate !== true && typeof d.update === 'function') {
      try {
        d.update(dt);
      } catch (e) {
        if (!this._dirErr) console.error('[shift] director.update failed', e);
        this._dirErr = true;
      }
    }
    // ambience + phase music (twice a second)
    this._ambT -= dt;
    if (this._ambT > 0) return;
    this._ambT = 0.5;
    const t = g.taxi;
    const hour = g.clock.hour;
    const w = weatherFor(hour);
    const win = t.state.windows;
    const phase = g.clock.phase;
    g.audio?.ambience?.set?.({
      hour,
      rain: w.rain,
      wind: w.wind,
      insideCar: t.isCameraInside(),
      windowsOpen: Math.max(win.fl, win.fr, win.rl, win.rr),
      dread: clamp((phase === 'dread' ? 0.85 : phase === 'surreal' ? 0.6 : phase === 'calm' ? 0.2 : 0.05) + (g.rules?.threat || 0) * 0.5, 0, 1),
    });
    const special = ride && ['forkApproach', 'resolving', 'gate', 'lastFork'].includes(ride.phase);
    if (!special) {
      const mood = phaseMood(hour, !!ride?.passenger?.aboard);
      if (mood !== this._mood) {
        this._mood = mood;
        g.audio?.music?.setMood?.(mood, { fade: 6 });
      }
    } else this._mood = null;
  },

  exit(gg, next) {
    this._runToken++;
    const ride = this.ride;
    this.ride = null;
    if (g.ride === ride) g.ride = null;
    try {
      ride?.dispose();
    } catch (e) {
      console.error(e);
    }
    for (const r of this._retired.splice(0)) {
      try {
        r.dispose();
      } catch (e) {
        console.error(e);
      }
    }
    g.director?.setActive?.(false);
    g.actions?.setAmuletWarmth?.(null);
    g.taxi.autopilot(null);
    if (next !== 'ending') g.taxi.setControlsEnabled(false);
    g.ui.hint?.(null);
  },
};
