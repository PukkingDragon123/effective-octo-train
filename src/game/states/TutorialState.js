// Interactive taxi tutorial taught by Ah Kong.
// PLACEHOLDER — implemented in the gameplay phase (see docs/GAMEPLAY.md).
import { g } from '../context.js';

export const TutorialState = {
  name: 'tutorial',
  async enter() {
    const lm = g.world.landmarks.garage;
    g.taxi.setPose(lm.stopPos, lm.yaw);
    g.cameraRig.release(0.01);
    g.cameraRig.attach(g.taxi.anchors.driverEye, g.taxi.root);
    g.taxi.setControlsEnabled(true);
    g.taxi.setInteractionsEnabled(true);
    g.save.stage = 'shift';
    g.persist();
    g.fsm.go('shift', { ride: 0 });
  },
};
