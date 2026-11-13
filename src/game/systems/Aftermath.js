// After the off-road death and the respawn, the night is wronger: the radio whispers to Ton, the
// lights flicker, and someone pale stands at the roadside where he died (gone when he gets close).
import * as THREE from 'three';
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { getGhost } from './Ghost.js';
import { RESPAWN_WHISPER } from '../data/driveTalk.js';

let deathAt = null;
let watch = null;

bus.on('death:start', ({ type } = {}) => {
  if (type !== 'offRoad') return;
  const v = g.player?.vehicle?.root || g.player?.root;
  deathAt = v ? v.position.clone() : null;
});

bus.on('checkpoint:restored', () => {
  setTimeout(() => {
    try {
      wrongness();
    } catch (e) {
      console.warn('[aftermath]', e);
    }
  }, 2600);
});

function wrongness() {
  const t = g.taxi;
  // the radio comes on by itself and whispers
  if (g.actions?.inTaxi && t) {
    try {
      if (!t.state.radioOn) t.setControl('radio', true, { source: 'auto' });
      g.audio?.radio?.setStatic?.(0.7);
    } catch (e) {
      /* radio optional */
    }
    g.dialogue?.play?.(RESPAWN_WHISPER).finally?.(() => g.audio?.radio?.setStatic?.(0));
  }
  // the lights stutter
  if (t) {
    const keep = t.state.headlights;
    let n = 0;
    const iv = setInterval(() => {
      t.state.headlights = n % 2 ? keep : 'off';
      if (++n > 9) {
        clearInterval(iv);
        t.state.headlights = keep;
      }
    }, 110 + Math.random() * 90);
    g.audio?.play?.('electric_buzz', { object: t.root, volume: 0.5 });
  }
  // someone stands where he died
  if (deathAt) standAt(deathAt);
}

function standAt(pos) {
  const h = getGhost();
  if (!h) return;
  const p = pos.clone();
  const pr = g.world?.road?.project(p);
  if (pr) p.copy(pr.pos).addScaledVector(pr.right, Math.sign(pr.lateral || -1) * (pr.width / 2 + 0.9));
  p.y = g.world?.getHeight?.(p.x, p.z) ?? p.y;
  h.root.position.copy(p);
  if (pr) h.root.rotation.set(0, Math.atan2(-pr.right.x * Math.sign(pr.lateral || -1), -pr.right.z * Math.sign(pr.lateral || -1)) + Math.PI, 0);
  h.root.visible = true;
  watch?.();
  watch = g.engine.onUpdate(() => {
    const cam = g.engine.camera.position;
    const d = cam.distanceTo(h.root.position);
    // close enough to see the face: a blink of the lights and she is not there
    if (d < 14 || g.fsm?.is('garage') || g.fsm?.is('menu')) {
      if (d < 14) g.audio?.play?.('whisper', { position: h.root.position.clone().add(new THREE.Vector3(0, 1.5, 0)), volume: 0.6 });
      h.root.visible = false;
      watch?.();
      watch = null;
    }
  }, 31);
}
