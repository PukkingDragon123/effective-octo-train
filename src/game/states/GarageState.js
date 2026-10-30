// Garage scene: walk to Ah Kong, cinematic dialogue, keys + rules paper.
// PLACEHOLDER — implemented in the gameplay phase (see docs/GAMEPLAY.md).
import { g } from '../context.js';

export const GarageState = {
  name: 'garage',
  async enter() {
    g.clock.set(21);
    g.fsm.go('tutorial');
  },
};
