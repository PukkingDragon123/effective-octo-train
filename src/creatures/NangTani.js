// นางตานี (Nang Tani): the spirit of the wild banana tree, a beautiful young woman in a green
// sabai and dark sarong, long loose hair, standing under the banana leaves at night. Her feet do
// not touch the ground (a hand's width of air under her bare soles), she sways like the leaves,
// never blinks, and when she notices you she smiles, tilts her head and beckons.
//   const n = createNangTani(); scene.add(n.root); n.root.position.copy(p); n.appear(); n.beckon(camera)
import * as THREE from 'three';
import { audio } from '../audio/index.js';
import { lightPool } from '../render/index.js';
import { SPECS, human } from './humans.js';
import { Entity, animate, sleep, noise, worldPos, easeInOut } from './util.js';

export class NangTani extends Entity {
  constructor(opts = {}) {
    super('nangTani');
    this.h = opts.humanoid || human(SPECS.nangTani, opts);
    this.humanoid = this.h;
    this.root.add(this.h.root);
    this.hover = opts.hover ?? 0.16;
    this.h.setMode('stand');
    this.h.setGhost({ levitate: this.hover, noBlink: 1, stare: 0.4 }, 100);
    this.h.setExpression({ smile: 0.3, sad: 0.15 });
    this.glow = 0;
    // a faint green-white light that lives in her (only visible on leaves near her)
    this.anchor = new THREE.Object3D();
    this.anchor.position.set(0, 1.3, 0.25);
    this.root.add(this.anchor);
    this.light = opts.light === false ? null : lightPool.add({ object: this.anchor, color: 0xbfe8c0, intensity: 0, distance: 5, decay: 2, flicker: 'none', glow: false, priority: 1 });
    this.h.setOpacity(opts.visible === false ? 0 : 1);
  }
  step(dt) {
    const t = this.time;
    // sway like a banana leaf in the night wind, drifting a little in the air
    this.h.root.rotation.z = noise.noise2D(t * 0.25, 3.1) * 0.035;
    this.h.root.rotation.x = noise.noise2D(t * 0.21, 8.4) * 0.025;
    this.h.root.position.y = Math.sin(t * 0.7) * 0.025;
    this.light?.setIntensity(0.6 + this.glow * 6);
    if (this.h.materials?.body?.emissive) this.h.materials.body.emissive.setRGB(0.55, 0.42, 0.16).multiplyScalar(this.glow * 0.35);
  }
  /** Fade in among the leaves. */
  async appear(d = 2.5) {
    this.h.setVisible(true);
    await animate(d, (k) => this.h.setOpacity(k), easeInOut);
  }
  async vanish(d = 1.8) {
    await animate(d, (k) => this.h.setOpacity(1 - k), easeInOut);
  }
  /** Look at a target (Object3D/Vector3). */
  gaze(target) {
    this.h.lookAt(target || null, { speed: 1.5, weight: 0.9 });
  }
  /** Smile, tilt the head, and slowly beckon (Thai style: palm down). */
  async beckon(target) {
    this.gaze(target);
    this.h.setExpression({ smile: 0.7, creepy: 0.15 });
    this.h.setGhost({ headRoll: 0.22 }, 1);
    audio.play('wind_chime', { object: this.anchor, volume: 0.25, rate: 0.8 });
    await this.h.play('hail', { side: 'R', duration: 3.5, lookAt: target });
    this.h.setGhost({ headRoll: 0 }, 1);
  }
  /** Golden glow (monk's blessing). */
  setGlow(v) {
    this.glow = v;
  }
  dispose() {
    this.light?.remove();
    this.h.dispose();
    super.dispose();
  }
}

export { sleep, worldPos };
