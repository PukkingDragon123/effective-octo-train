// Death cinematic → death card → restart the night at 21:00 (knowledge kept).
// PLACEHOLDER — implemented in the gameplay phase (see docs/GAMEPLAY.md).
import { g } from '../context.js';

export const DeathState = {
  name: 'death',
  async enter(params = {}) {
    await g.cine.fade(1, 1.2);
    await g.ui.deathCard({ th: 'อีกครั้ง…', en: 'Again…' });
    g.save.loops++;
    g.persist();
    await g.cine.fade(0, 0.1);
    g.fsm.go('garage', { restart: true });
  },
};
