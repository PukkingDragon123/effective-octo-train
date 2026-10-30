// The night shift: rides, free driving, encounters, the fork.
// PLACEHOLDER — implemented in the gameplay phase (see docs/GAMEPLAY.md).
import { g } from '../context.js';

export const ShiftState = {
  name: 'shift',
  async enter(params = {}) {
    const ride = params.ride ?? g.save?.rideIndex ?? 0;
    g.clock.set(params.hour ?? 21 + ride);
    g.cameraRig.release(0.01);
    g.cameraRig.attach(g.taxi.anchors.driverEye, g.taxi.root);
    g.taxi.setControlsEnabled(true);
    g.taxi.setInteractionsEnabled(true);
    g.input.setWantPointerLock(true);
  },
  exit() {
    g.taxi.setControlsEnabled(false);
  },
};
