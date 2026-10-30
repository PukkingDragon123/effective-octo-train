// Endings: dawn, endless, forgive, wrong_home.
// PLACEHOLDER — implemented in the gameplay phase (see docs/GAMEPLAY.md).
import { g } from '../context.js';

export const EndingState = {
  name: 'ending',
  async enter(params = {}) {
    await g.ui.ending({ id: params.ending || 'dawn', titleTH: 'รุ่งสาง', titleEN: 'Dawn' });
    g.fsm.go('menu');
  },
};
