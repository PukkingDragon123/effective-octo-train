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

export { resetNightWorld };

export const DeathState = {
  name: 'death',
  async enter(params = {}) {
    installGameplayB();
    const type = params.type || params.death || 'crash';
    const card = deathCardFor(type);
    const hour = params.hour ?? g.clock?.hour ?? 21;
    if (card.gameOver) return this._gameOver(type, params, hour);
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
  /**
   * GAME OVER (off the road): the late-night TV news, then the run is cleared (what Ton has learnt,
   * the endings seen and the settings stay) and the game returns to the main menu. No loop.
   */
  async _gameOver(type, params, hour) {
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
    // the run is over; knowledge (k.* flags, notes, rules learnt, memories, endings) is kept
    const save = g.save;
    if (save) {
      const keep = { knowledge: save.knowledge, rulesLearned: save.rulesLearned, memories: save.memories, endingsSeen: save.endingsSeen, playTime: save.playTime, createdAt: save.createdAt };
      const flags = clearNightFlags(save.flags || {});
      flags['k.newsDeaths'] = (flags['k.newsDeaths'] || 0) + 1;
      Object.assign(save, { stage: 'intro', rideIndex: 0, hour: 21, loops: 0, deathHour: null, deathRide: 0, deaths: [], delivered: {}, lastDeath: null, flags }, keep);
      g.persist();
    }
    bus.emit('death:card', { type, card, gameOver: true });
    // the photograph of the wreck (staged now when the death came from a test hook / URL)
    let image = crashReport.image;
    const kind = crashReport.kind || 'bike';
    if (!image) {
      try {
        image = await captureCrashShot(stageWreck(kind));
      } catch (e) {
        console.warn('[death] news photo', e);
      }
    }
    if (!this.active) return clearDying();
    resetNightWorld();
    p.fade = 1;
    const N = crashReport.news || NEWS_REPORTS[kind] || NEWS_REPORTS.bike;
    const both = (g.settings.get('language') ?? 'th') === 'both';
    g.ui.fade?.(false, 0.01); // the news screen draws its own black
    try {
      if (typeof g.ui.newsReport === 'function') {
        await g.ui.newsReport({ th: N.th, sub: both ? `${N.sub} · ${N.subEN}` : N.sub, image, hold: 8, place: N.place, keepBlack: true });
      } else {
        await g.ui.deathCard({ th: N.th, en: both ? N.en : '', sub: N.sub, hold: 5, keepBlack: true });
      }
    } catch (e) {
      console.error('[death] news report', e);
    }
    if (!this.active) return clearDying();
    clearCrashScene();
    clearDying();
    bus.emit('death:done', { type, gameOver: true });
    g.fsm.go('menu', { gameOver: true });
    g.ui.fade?.(false, 1.2);
  },

  exit() {
    clearDying();
  },
};
