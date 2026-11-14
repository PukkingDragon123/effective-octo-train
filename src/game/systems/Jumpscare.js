// Jumpscares that land: they wait for a lull (no talk for a moment), then a sudden sting, a fast
// camera jolt and FOV punch, a white flash, and a pale face right in front of the eyes for a third of
// a second. Most then demand a hard QTE (a tight press window or a fast mash); fail = death.
//   jumpscare({ qte, death, lull, maxWait }) -> Promise<bool survived>
// The ambient 'scare' encounters (data/encounters.js kind 'scare') are wired here: on their reveal.
import * as THREE from 'three';
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { getGhost, prewarmGhost } from './Ghost.js';
import { protectedPhase } from './Fairness.js';

const DEATH_FOR = { treeWatcher: 'roadFigure', womanRunning: 'windowAttack', salaShadows: 'dragBack', fingersDoorFrame: 'windowArm', upsideDownHead: 'roofHanger', faceAgainstGlass: 'windowAttack', twistedNeckReflection: 'trueForm', roofCrawler: 'roofHanger', reflectionStays: 'trueForm' };
const play = (id, o = {}) => {
  try {
    return g.audio?.play?.(id, { bus: 'sfx', mustPlay: true, ...o });
  } catch (e) {
    return null;
  }
};
let quiet = 0;
let last = -1e9;
let busy = false;

/** The face, close: 0.42 m in front of the eyes, staring, then gone. */
function face(seconds = 0.38) {
  const h = getGhost();
  if (!h) return;
  const cam = g.engine.camera;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).setY(0).normalize();
  const at = cam.position.clone().addScaledVector(fwd, 0.42);
  h.root.position.set(at.x, at.y - 1.5, at.z);
  h.root.rotation.set(0, Math.atan2(fwd.x, fwd.z), 0); // humanoids face −Z: this turns her to the eyes
  h.setGhost?.({ stare: 1, mouthStretch: 1, jitter: 0.9, noBlink: 1, unlimited: 1 }, 30);
  h.lookAt?.(cam, { weight: 1, speed: 20 });
  h.root.visible = true;
  h._scareUntil = g.engine.time + seconds;
  setTimeout(() => {
    if (h._scareUntil <= g.engine.time + 0.01) h.root.visible = false;
  }, seconds * 1000);
}

export async function jumpscare(o = {}) {
  if (busy || g.isDying?.() || g.qte?.active) return true;
  busy = true;
  try {
    // the lull: a moment of nothing first (it is the silence that sets it up)
    const t0 = performance.now();
    while (performance.now() - t0 < (o.maxWait ?? 7000) && !(quiet > (o.lull ?? 2.5) && !g.dialogue?.busy)) await new Promise((r) => setTimeout(r, 100));
    last = g.engine.time;
    play('sting_reveal', { volume: 1 });
    play('scare_hit', { volume: 1 });
    play('scream_close', { volume: 0.55, delay: 0.04 });
    g.cameraRig?.shake?.(1);
    g.camfx?.flinch?.(1);
    try {
      g.postfx?.flash?.(new THREE.Color(0.85, 0.82, 0.78), 0.12);
    } catch (e) {
      /* optional */
    }
    const rig = g.cameraRig;
    const f0 = rig.fovOffset;
    rig.fovOffset = f0 - 15;
    setTimeout(() => (rig.fovOffset = f0 - 6), 180);
    setTimeout(() => (rig.fovOffset = f0), 520);
    face(0.38);
    if (!o.qte || protectedPhase()) return true; // early on, scares are atmosphere only
    // the hard part: a tight window or a fast mash; miss it and it has you
    const spec = Math.random() < 0.5
      ? { kind: 'mash', action: 'interact', count: 16, time: 2.1, decay: 5.5, dread: 1, slowmo: 0.65 }
      : { kind: 'press', action: 'interact', time: 1.0, open: 0.55, dread: 1, slowmo: 0.5 };
    const r = await g.qte.run(spec);
    if (!r?.ok) {
      g.kill?.(o.death || 'windowAttack', { cause: 'jumpscare', fromQte: true });
      return false;
    }
    g.camfx?.relief?.();
    return true;
  } catch (e) {
    console.warn('[scare]', e);
    return true;
  } finally {
    busy = false;
  }
}

let installed = false;
function install() {
  if (installed || !g.engine) return;
  installed = true;
  g.engine.onUpdate((dt) => (quiet = g.dialogue?.busy ? 0 : quiet + dt), 30, { always: true });
  bus.on('encounter:event', (e) => {
    const id = e?.id;
    if (!id || e.event !== 'encounter:' + id || !g.fsm?.is('shift')) return;
    const kind = g.director?.defs?.[id]?.kind;
    if (kind !== 'scare' || g.engine.time - last < 25) return;
    jumpscare({ qte: Math.random() < 0.75, death: DEATH_FOR[id] || 'windowAttack' });
  });
}
bus.on('game:state', ({ state } = {}) => {
  install();
  if (state === 'shift') prewarmGhost(5000);
});
