// Playable motorcycle intro along the spur road to the KM 9 garage.
// PLACEHOLDER — implemented in the gameplay phase (see docs/GAMEPLAY.md).
import { g } from '../context.js';

export const IntroState = {
  name: 'intro',
  async enter() {
    g.clock.set(20.9);
    const sp = g.world.road.sample('spur', 5);
    g.bike.setPose(sp.pos.clone().addScaledVector(sp.right, -1.5), Math.atan2(-sp.tangent.x, -sp.tangent.z));
    g.cameraRig.release(0.01);
    g.cameraRig.attach(g.bike.anchors.eye, g.bike.root);
    g.bike.setControlsEnabled(true);
    g.input.setWantPointerLock(true);
  },
  update() {
    const lm = g.world.landmarks.garage;
    if (g.bike.root.position.distanceTo(lm.pos) < 14) g.fsm.go('garage');
  },
  exit() {
    g.bike.setControlsEnabled(false);
  },
};
