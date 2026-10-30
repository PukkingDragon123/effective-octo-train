// Cinematic helpers on top of postfx params + cameraRig.
import * as THREE from 'three';
import { g } from './context.js';
import { tween, wait } from './util.js';
import { easeInOut } from '../core/math.js';

export const cine = {
  /** Fade to black (to=1) or back in (to=0). */
  fade(to = 1, duration = 1, color = null) {
    const p = g.postfx.params;
    if (color) p.fadeColor.set(color);
    else if (to > 0) p.fadeColor.setRGB(0, 0, 0);
    return tween(p, 'fade', to, duration, easeInOut, { real: true });
  },
  letterbox(on = true, duration = 0.8) {
    return tween(g.postfx.params, 'letterbox', on ? 1 : 0, duration, easeInOut, { real: true });
  },
  horror(amount = 1, duration = 0.6) {
    return tween(g.postfx.params, 'horror', amount, duration);
  },
  amulet(amount = 1, duration = 0.5) {
    return tween(g.postfx.params, 'amulet', amount, duration);
  },
  blur(amount = 1, duration = 0.6) {
    return tween(g.postfx.params, 'blur', amount, duration, easeInOut, { real: true });
  },
  /** Camera shot (see cameraRig.cinematic). Returns after the blend-in. */
  async shot(spec) {
    g.cameraRig.cinematic(spec);
    await wait(spec.blend ?? 0.8);
  },
  async release(blend = 0.8) {
    g.cameraRig.release(blend);
    await wait(blend);
  },
  /** Conversation framing: letterbox, slight zoom, soft focus on the speaker's head. */
  async converse(targetObject, { zoom = -10, strength = 0.6 } = {}) {
    const target = new THREE.Vector3();
    const getTarget = () => {
      if (targetObject?.headPosition) return targetObject.headPosition;
      if (targetObject?.isObject3D) return targetObject.getWorldPosition(target);
      return targetObject;
    };
    g.cameraRig.setFocus(getTarget(), strength);
    const off = g.engine.onUpdate(() => g.cameraRig.focusTarget && g.cameraRig.focusTarget.copy?.(getTarget()), 49);
    this._conv = off;
    tween(g.cameraRig, 'fovOffset', zoom, 1.2);
    await this.letterbox(true, 0.8);
  },
  async endConverse() {
    this._conv?.();
    this._conv = null;
    g.cameraRig.setFocus(null);
    tween(g.cameraRig, 'fovOffset', 0, 1.0);
    await this.letterbox(false, 0.8);
  },
};
