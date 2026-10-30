// Endings (data.endings): wrong_home, endless, join_father, forgive, successor, dawn, ride_away.
// Each is a short cinematic in the real world (src/game/endings/scenes.js), then the title,
// the save-filtered epilogue cards and the credits roll (ui.ending, Made by Pukking Dragon, with
// the CC BY sound attributions). The ending is recorded in save.endingsSeen.
// params { ending: id, loop?: bool }  — wrong_home counts as a death: the night loops
// (loops+1, death 'home', garage restart) unless params.loop === false.
import { g } from '../context.js';
import { ensurePlayerActions } from '../systems/PlayerActions.js';
import { guard, isAbort, quietDirector } from '../opening/common.js';
import { playEnding } from '../endings/index.js';

export const EndingState = {
  name: 'ending',

  async enter(params = {}) {
    ensurePlayerActions();
    const S = guard(this);
    quietDirector();
    const ids = g.data?.endings?.ENDING_IDS || [];
    const id = ids.includes(params.ending) ? params.ending : ids.includes(params.id) ? params.id : 'dawn';
    try {
      const E = await playEnding(id, this, S);
      if (!this.active) return;
      if (E?.countsAsDeath && params.loop !== false) {
        const save = g.save;
        if (save) {
          save.loops = (save.loops || 0) + 1;
          save.deaths = save.deaths || [];
          save.deaths.push({ rideId: 'somchai', cause: 'home', hour: 29.6 });
          save.deathHour = 29;
          save.deathRide = Math.max(0, (g.data?.passengers?.PASSENGERS || []).findIndex((p) => p.id === 'somchai'));
          save.lastDeath = 'home';
          save.rideIndex = 0;
          g.persist();
        }
        g.fsm.go('garage', { restart: true });
      } else g.fsm.go('menu');
    } catch (e) {
      if (isAbort(e)) return;
      console.error('[ending]', e);
      // never strand the player: the card, then the menu
      try {
        await g.ui.ending({ id, keepBlack: true });
      } catch (err) {
        /* ignore */
      }
      if (this.active) g.fsm.go('menu');
    }
  },

  exit() {
    this.cam?.stop();
    this.sceneStage?.clear();
    try {
      this._restoreLook?.();
    } catch (e) {
      /* ignore */
    }
    this._restoreLook = null;
    g.dialogue.interrupt?.();
    g.taxi.autopilot(null);
    g.bike.autopilot(null);
    g.cine.letterbox(false, 0.3);
    // the black card the ui kept up fades out over the next state's opening
    g.ui.fade(false, 1.8);
  },
};
