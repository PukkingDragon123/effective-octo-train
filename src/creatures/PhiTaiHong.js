// ผีตายโหง (Phi Tai Hong): the violent-death ghost at the accident curve. Crushed and soaked in
// blood, limbs bent the wrong way, head lolling on a broken neck, crouched by the wreaths and the
// old wrecked motorbike, twitching. As the headlights pass it stands up the wrong way (knees
// first, the head last), turns its ruined face to the car, takes a few broken steps and is gone.
//   const p = createPhiTaiHong({ sex:'m' }); scene.add(p.root); p.crouch(); await p.rise(); p.walkBroken(to)
import * as THREE from 'three';
import { audio } from '../audio/index.js';
import { particles } from '../render/index.js';
import { engine } from '../core/Engine.js';
import { SPECS, human } from './humans.js';
import { Entity, animate, sleep, Twitch, noise, worldPos, easeInOut, rand } from './util.js';

export class PhiTaiHong extends Entity {
  constructor(opts = {}) {
    super('phiTaiHong');
    const spec = opts.sex === 'f' ? SPECS.phiTaiHongF : SPECS.phiTaiHongM;
    this.h = human(spec, opts);
    this.humanoid = this.h;
    this.root.add(this.h.root);
    this.h.setGore({ bleedMouth: 1, bleedEyes: 0.6, wound: 'head', amount: 1, crush: 1, speed: 100 });
    this.h.setGhost({ limbBreak: 0.85, headRoll: 0.9, headPitch: 0.25, jitter: 0.35, stare: 1, noBlink: 1, unlimited: 1 }, 100);
    this.tw = new Twitch(1.6, 1);
    this.state = 'idle';
    this.drip = null;
    try {
      const a = new THREE.Object3D();
      a.position.set(0, 1.45, 0.1);
      this.root.add(a);
      this.drip = particles.emit('blood', { object: a, radius: 0.12, height: 1.6 });
      this._dripAnchor = a;
    } catch (e) {
      this.drip = null;
    }
    this._snapT = 1;
  }
  step(dt) {
    // sudden broken twitches: shoulder hitch, head snapping on the ruined neck
    const j = this.tw.update(dt);
    this._snapT -= dt;
    if (this._snapT <= 0 && this.state !== 'gone') {
      this._snapT = rand(0.6, 2.8);
      if (Math.random() < 0.5) audio.play('bone_crack', { object: this.h.root, volume: 0.25, rate: rand(0.8, 1.3) });
      this.h.setGhost({ headRoll: 0.9 + (Math.random() - 0.5) * 0.7, headPitch: 0.25 + Math.random() * 0.3 }, 30);
    }
    this.h.root.rotation.z = j * 0.05;
    if (this._dripAnchor) this._dripAnchor.position.y = this.state === 'crouch' ? 0.85 : 1.45;
  }
  crouch() {
    this.state = 'crouch';
    this.h.setMode('crouch');
    this.h.setGhost({ jitter: 0.55, backbend: -0.35 }, 4);
  }
  /** Stand up wrong: hips first, the head hanging, then snapping upright toward `target`. */
  async rise(target = engine.camera) {
    this.state = 'rising';
    this.h.setMode('stand');
    this.h.setGhost({ backbend: 0.5, headPitch: 1.1, jitter: 0.25 }, 1.2);
    audio.play('bone_crack', { object: this.h.root, volume: 0.6 });
    await sleep(1.1);
    this.h.lookAt(target, { speed: 2, unlimited: true });
    this.h.setGhost({ backbend: 0, headPitch: 0.15, headRoll: 1.1, jitter: 0.4 }, 6);
    audio.play('neck_snap', { object: this.h.root, volume: 0.7 });
    this.state = 'standing';
  }
  /** A few dragging, broken steps toward `to` (world Vector3). */
  async walkBroken(to, speed = 0.55) {
    this.state = 'walking';
    this.h.play('stagger', { duration: 6 });
    await this.h.walkTo(to, { speed });
  }
  async vanish(d = 0.9) {
    this.state = 'gone';
    await animate(d, (k) => this.h.setOpacity(1 - k), easeInOut);
    this.drip?.setActive(false);
  }
  dispose() {
    this.drip?.dispose();
    this.h.dispose();
    super.dispose();
  }
}

export { worldPos, noise };
