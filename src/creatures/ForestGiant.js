// Something enormous: a gaunt, stooped figure thirteen metres tall walking slowly between the
// trunks deep in the forest, long arms hanging to its knees, its hair like hanging roots, moss
// and vines trailing from its shoulders and wrists. Mostly a silhouette in the fog; for a moment a
// sodium lamp (or the moon) catches it. Each step thuds in the ground; the amulet warms.
//   const g = createForestGiant(); scene.add(g.root); await g.walkPast(from, to, 7);
import * as THREE from 'three';
import { audio } from '../audio/index.js';
import { lightPool, paintedMaterial } from '../render/index.js';
import { cameraRig } from '../core/CameraRig.js';
import { engine } from '../core/Engine.js';
import { SPECS, human } from './humans.js';
import { Entity, Rope, DynamicTube, animate, sleep, noise, worldPos, clamp, easeInOut, lerp } from './util.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export class ForestGiant extends Entity {
  constructor(opts = {}) {
    super('forestGiant');
    const height = opts.height ?? 13;
    this.h = human({ ...SPECS.forestGiant, height }, opts);
    this.humanoid = this.h;
    this.root.add(this.h.root);
    this.height = height;
    this.h.setGhost({ stretch: 0.55, backbend: -0.25, headPitch: 0.35, armTwist: 0.2, noBlink: 1 }, 100);
    this.h.setMode('stand');
    // trailing moss / vine strands from the shoulders, elbows and wrists
    this.vineMat = paintedMaterial({ color: 0x1c2414, roughness: 0.9, brush: 0.7, wet: 0.5, puddles: 0, side: THREE.DoubleSide });
    this.strands = [];
    const S = height / 1.7;
    const spots = [['clavicle_l', 7], ['clavicle_r', 7], ['lowerarm_l', 5], ['lowerarm_r', 5], ['hand_l', 6], ['hand_r', 6], ['spine_03', 9], ['Head', 8], ['Head', 10]];
    for (const [b, n] of spots) {
      const bone = this.h.bones[b];
      if (!bone) continue;
      const len = (0.08 + Math.random() * 0.1) * S;
      const rope = new Rope(n, len / n, worldPos(bone, new THREE.Vector3()));
      rope.gravity = -9;
      rope.damping = 0.96;
      const r = 0.012 * S * (0.6 + Math.random() * 0.6);
      const tube = new DynamicTube(n, 5, (t) => r * (1 - t * 0.7), this.vineMat);
      engine.scene.add(tube.mesh);
      tube.mesh.castShadow = true;
      this.strands.push({ bone, rope, tube, off: new THREE.Vector3((Math.random() - 0.5) * 0.1, 0, (Math.random() - 0.5) * 0.1).multiplyScalar(S), init: false });
    }
    // the lamp that catches it for a moment (a stray sodium light deep in the trees)
    this.lampAnchor = new THREE.Object3D();
    this.root.add(this.lampAnchor);
    this.lamp = opts.light === false ? null : lightPool.add({ object: this.lampAnchor, kind: 'sodium', color: 0xffa04a, intensity: 0, distance: 30, decay: 1.6, flicker: 'dying', glow: { size: 0.7, color: 0xffa050, opacity: 0.0 }, priority: 4 });
    this.h.onFootstep = () => this._step();
    this.walking = null;
    this.vis = 1;
  }

  _step() {
    if (!this.walking) return;
    const p = worldPos(this.h.root, _v);
    const d = p.distanceTo(engine.camera.position);
    const k = clamp(1 - d / 140, 0, 1);
    audio.play('rumble_sub', { position: p, volume: 0.5 + k * 0.5, rate: 0.7 });
    audio.play('branch_crack', { position: p, volume: 0.4 * k, rate: 0.6 });
    if (k > 0) cameraRig.shake(0.05 * k);
  }

  /**
   * Walk from `from` to `to` (world, on the ground) over `duration` s. The root moves smoothly
   * every frame (the humanoid's distance throttling never makes it step-jump).
   */
  walkPast(from, to, duration = 8) {
    const parent = this.root.parent || engine.scene;
    parent.updateWorldMatrix(true, false);
    const a = parent.worldToLocal(from.clone()), b = parent.worldToLocal(to.clone());
    this.root.position.set(0, 0, 0);
    this.h.root.position.copy(a);
    this.h.root.rotation.y = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    this.h.setMode('walk', { formal: true });
    this.walking = { a, b, t: 0, d: duration };
    return new Promise((res) => (this.walking.resolve = res));
  }

  /** Flash the lamp on it for a moment (seconds). */
  async catchLight(seconds = 1.6, at = null) {
    if (!this.lamp) return;
    const p = at || worldPos(this.h.root, new THREE.Vector3()).add(new THREE.Vector3(0, this.height * 0.5, 0));
    this.lampAnchor.parent.updateWorldMatrix(true, false);
    this.lampAnchor.position.copy(this.lampAnchor.parent.worldToLocal(p.clone()));
    await animate(0.25, (k) => this.lamp.setIntensity(60 * k));
    audio.play('electric_buzz', { position: p, volume: 0.5 });
    await sleep(seconds);
    await animate(0.4, (k) => this.lamp.setIntensity(60 * (1 - k)));
  }

  step(dt) {
    const W = this.walking;
    if (W) {
      W.t += dt;
      const k = clamp(W.t / W.d, 0, 1);
      this.h.root.position.lerpVectors(W.a, W.b, k);
      const g = this.h.groundFn;
      if (g) {
        this.h.root.updateWorldMatrix(true, false);
        _v.setFromMatrixPosition(this.h.root.matrixWorld);
        const y = g(_v.x, _v.z);
        if (Number.isFinite(y)) this.h.root.position.y += y - _v.y;
      }
      if (k >= 1) {
        this.walking = null;
        this.h.setMode('stand');
        W.resolve?.(true);
      }
    }
    // slow, heavy sway of the stooped torso
    this.h.root.rotation.z = noise.noise2D(this.time * 0.2, 1.1) * 0.03;
    // strands
    for (const s of this.strands) {
      s.bone.updateWorldMatrix(true, false);
      _v.setFromMatrixPosition(s.bone.matrixWorld).add(s.off);
      if (!s.init) {
        for (let i = 0; i < s.rope.n; i++) { s.rope.p[i].copy(_v).y -= i * s.rope.seg; s.rope.q[i].copy(s.rope.p[i]); }
        s.init = true;
      }
      s.rope.pin(_v);
      s.rope.wind.set(Math.sin(this.time * 0.3) * 2, 0, Math.cos(this.time * 0.23) * 2);
      s.rope.step(dt);
      s.tube.set(s.rope.p);
      s.tube.mesh.visible = this.h.root.visible;
    }
  }

  async vanish(d = 2) {
    await animate(d, (k) => this.h.setOpacity(1 - k), easeInOut);
    for (const s of this.strands) s.tube.mesh.visible = false;
  }

  dispose() {
    this.lamp?.remove();
    for (const s of this.strands) { s.tube.mesh.removeFromParent(); s.tube.geometry.dispose(); }
    this.vineMat.dispose();
    this.h.dispose();
    super.dispose();
  }
}

export { lerp };
