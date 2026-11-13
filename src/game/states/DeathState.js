// Death → the loop (engineer B). g.kill(type) plays the cinematic, then comes here:
// a hard cut to black, the Thai death card (one short line), the motorbike in the dark,
// then 21:00 again at the garage (A's GarageState({ restart:true })).
// Bookkeeping: saves.loops++, deaths[], deathHour/deathRide (A's time-skip offer), endingsSeen for
// wrong_home, logic.clearNightFlags (k.* / memories / notes / rules learned are kept).
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { wait } from '../util.js';
import { installGameplayB } from '../ride/install.js';
import { deathCardFor, cardType, clearDying } from '../death/index.js';
import { clearNightFlags } from '../data/logic.js';
import { resetNightWorld } from '../death/reset.js';
import { crashReport, stageWreck, captureCrashShot, clearCrashScene } from '../death/offRoad.js';
import { NEWS_REPORTS } from '../data/worldtext.js';
import { restoreCheckpoint, restoreFallback } from '../systems/Checkpoint.js';

/** Real-time timeout (the news runs in real time; the game may be paused). */
const within = (p, ms) => Promise.race([Promise.resolve(p).catch((e) => console.warn('[death] news step', e)), new Promise((r) => setTimeout(r, ms))]);

export { resetNightWorld };

export const DeathState = {
  name: 'death',
  async enter(params = {}) {
    installGameplayB();
    const type = params.type || params.death || 'crash';
    const card = deathCardFor(type);
    const hour = params.hour ?? g.clock?.hour ?? 21;
    if (card.respawn) return this._newsSafe(type, card, params);
    // ---- hard cut to black: the night stops mid-breath ----------------------------------------
    const p = g.postfx.params;
    p.fadeColor.setRGB(0, 0, 0);
    p.fade = 1;
    g.dialogue?.interrupt();
    g.ui.clearSubtitle?.();
    g.ui.setCrosshair?.(false);
    g.audio?.music?.setMood?.('silence', { fade: 0.1 });
    const t = g.taxi;
    if (t) {
      t.autopilot(null);
      t.setControlsEnabled(false);
      if (t.state.engineOn) {
        t.state.engineOn = false;
        t.state.ignition = 'off';
        bus.emit('taxi:engine', { on: false });
      }
      t.physicsSim.v = 0;
    }
    g.audio?.duck?.(0.85);
    // the loop catches: somewhere in the dark an old motorbike is already on its way to the garage
    g.audio?.play?.('motorbike_pass', { volume: 0.35, delay: 0.4, mustPlay: true });
    // ---- the loop's bookkeeping (before the card: a reload mid-card still counts the night) ----
    const save = g.save;
    if (save) {
      save.loops = (save.loops || 0) + 1;
      save.deaths ||= [];
      save.deaths.push({ rideId: params.rideId ?? null, cause: params.cause || type, type: cardType(type) || type, hour: Math.round(hour * 100) / 100, loop: save.loops });
      save.deathHour = Math.floor(hour);
      save.deathRide = params.rideIndex ?? save.rideIndex ?? 0;
      save.lastDeath = cardType(type) || type;
      if (params.ending) {
        save.endingsSeen ||= [];
        if (!save.endingsSeen.includes(params.ending)) save.endingsSeen.push(params.ending);
      }
      if (card.rule) g.knowledge?.learnRule(card.rule);
      clearNightFlags((save.flags ||= {}));
      save.rideIndex = 0;
      save.hour = 21;
      save.stage = 'shift';
      g.persist();
    }
    bus.emit('death:card', { type, card });
    resetNightWorld();
    await wait(0.6);
    if (!this.active) return clearDying();
    // ---- the card (Thai, one line; DEATH_FOOTER underneath: สามทุ่ม… อีกครั้ง) -------------------
    const both = (g.settings.get('language') ?? 'th') === 'both';
    await g.ui.deathCard({ th: card.th, en: both ? card.en : '', hold: 3 });
    if (!this.active) return clearDying();
    // in the dark: an old motorbike coming up the spur road, again
    g.audio?.duck?.(0);
    g.audio?.play?.('motorbike_pass', { volume: 0.75 });
    g.clock?.set(21);
    clearDying();
    bus.emit('death:done', { type, loops: save?.loops });
    // the garage takes over under the black (A's GarageState({restart}) fades the scene in)
    g.fsm.go('garage', {
      restart: true,
      lastDeath: save?.lastDeath || type,
      deathRide: save?.deathRide ?? 0,
      deathHour: save?.deathHour ?? 21,
      loops: save?.loops ?? 1,
    });
  },
  /** The off-road news, guarded: any failure goes straight back to the last checkpoint. */
  async _newsSafe(type, card, params) {
    try {
      await this._news(type, card, params);
    } catch (e) {
      // never leave the player on a black screen: straight back to the last checkpoint
      console.error('[death] news / respawn failed', e);
      if (this.active) this._respawn(type);
    }
  },

  /** Back in the night: the checkpoint (or the ride start / the garage), the black lifted, a watchdog. */
  _respawn(type) {
    try {
      clearCrashScene();
    } catch (e) {
      console.warn('[death] clear crash', e);
    }
    clearDying();
    bus.emit('death:done', { type, respawn: true });
    g.postfx.params.fade = 1;
    let ok = false;
    try {
      ok = restoreCheckpoint();
    } catch (e) {
      console.error('[death] checkpoint restore', e);
    }
    if (!ok) restoreFallback();
    try {
      g.ui.fade?.(false, 1.2); // releases the news screen held black; the state fades the scene in
    } catch (e) {
      /* ignore */
    }
    // a watchdog: whatever went wrong above, Ton is back within a few seconds
    setTimeout(() => {
      if (g.fsm.is('death')) {
        console.warn('[death] still on the death state after the news: falling back');
        restoreFallback();
      }
    }, 4000);
    setTimeout(() => {
      try {
        if (g.fsm.is('death')) restoreFallback();
        if (g.postfx.params.fade > 0.9) g.cine.fade(0, 1.2);
        g.ui.fade?.(false, 0.6);
        g.actions?.setEnabled?.(!['menu', 'intro', 'ending', 'death'].includes(g.fsm.currentName));
        g.ui.setCrosshair?.(true);
        g.input?.setWantPointerLock?.(true);
        if (g.cameraRig?.inCinematic && !g.cine?._conv) g.cameraRig.release(0.4);
      } catch (e) {
        console.warn('[death] watchdog', e);
      }
    }, 7500);
  },
  /**
   * Off the road: the late-night TV news over the wreck, then Ton is back at the last checkpoint
   * (systems/Checkpoint.js) under a fade. Not a loop death: the loop count stays as it is.
   */
  async _news(type, card, params) {
    const p = g.postfx.params;
    p.fadeColor.setRGB(0, 0, 0);
    p.fade = 1;
    g.dialogue?.interrupt();
    g.ui.clearSubtitle?.();
    g.ui.setCrosshair?.(false);
    g.ui.hint?.(null);
    g.audio?.music?.setMood?.('silence', { fade: 0.1 });
    g.audio?.bikeSound?.setOn?.(false);
    const t = g.taxi;
    if (t) {
      t.autopilot(null);
      t.setControlsEnabled(false);
      t.physicsSim.v = 0;
    }
    g.bike?.setControlsEnabled(false);
    // not a loop death: nothing of the night is lost, only counted
    const save = g.save;
    if (save) {
      save.flags ||= {};
      save.flags['k.newsDeaths'] = (save.flags['k.newsDeaths'] || 0) + 1;
      g.persist();
    }
    bus.emit('death:card', { type, card, respawn: true });
    // the photograph of the wreck (staged now when the death came from a test hook / URL)
    let image = crashReport.image;
    const kind = crashReport.kind || 'bike';
    if (!image) {
      try {
        image = await within(captureCrashShot(stageWreck(kind)), 6000);
      } catch (e) {
        console.warn('[death] news photo', e);
      }
    }
    if (!this.active) return clearDying();
    try {
      resetNightWorld();
    } catch (e) {
      console.warn('[death] reset', e);
    }
    p.fade = 1;
    const N = crashReport.news || NEWS_REPORTS[kind] || NEWS_REPORTS.bike;
    const both = (g.settings.get('language') ?? 'th') === 'both';
    g.ui.fade?.(false, 0.01); // the news screen draws its own black
    // the news (a rejected or hung news screen never strands the player: 40 s at most)
    try {
      const show = typeof g.ui.newsReport === 'function'
        ? g.ui.newsReport({ th: N.th, sub: both ? `${N.sub} · ${N.subEN}` : N.sub, image, hold: 8, place: N.place, keepBlack: true })
        : g.ui.deathCard({ th: N.th, en: both ? N.en : '', sub: N.sub, hold: 5, keepBlack: true });
      await within(show, 40000);
    } catch (e) {
      console.error('[death] news report', e);
    }
    if (!this.active) return clearDying();
    this._respawn(type);
  },

  exit() {
    clearDying();
  },
};
