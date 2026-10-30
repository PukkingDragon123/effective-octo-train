// Main menu: live cinematic at the fork (taxi, wrong passenger, giant hand) behind the menu UI.
// PLACEHOLDER — implemented in the gameplay phase (see docs/GAMEPLAY.md).
import * as THREE from 'three';
import { g } from '../context.js';

export const MenuState = {
  name: 'menu',
  async enter() {
    g.input.setWantPointerLock(false);
    g.clock.set(22.5);
    const f = g.world.fork;
    const cam = new THREE.Vector3().copy(f.pos).add(new THREE.Vector3(0, 3, 0));
    g.cameraRig.cinematic({ position: cam.clone().add(new THREE.Vector3(20, 2, 20)), lookAt: f.pos, cut: true });
    g.ui.showMainMenu({
      canResume: g.saves.lastUsed() != null,
      onNew: async () => {
        const slot = await g.ui.pickSlot('new');
        if (slot == null) return;
        g.saves.create(slot);
        g.save = g.saves.data;
        g.ui.hideMainMenu();
        g.fsm.go('intro');
      },
      onResume: () => {
        const slot = g.saves.lastUsed();
        if (slot == null) return;
        g.saves.load(slot);
        g.save = g.saves.data;
        g.ui.hideMainMenu();
        g.fsm.go(g.save.stage === 'shift' ? 'shift' : 'intro', {});
      },
      onSettings: () => g.ui.showSettings(),
      onCredits: () => g.ui.showCredits(),
    });
  },
  exit() {
    g.ui.hideMainMenu();
  },
};
