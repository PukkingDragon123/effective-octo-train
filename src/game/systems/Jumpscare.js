// Jumpscares that land: they wait for a lull (no talk for a moment), then a sudden sting, a fast
// camera jolt and FOV punch, a white flash, and a pale face right in front of the eyes (held there
// every frame, hands on Ton's head: encounters/scare.js grab). Most then demand a hard QTE (a tight
// press window or a fast mash) while it holds him; fail = it screams into his face, then eats him
// (early game: it screams and lets go).
//   jumpscare({ qte, death, lull, maxWait }) -> Promise<bool survived>
// The ambient 'scare' encounters (data/encounters.js kind 'scare') are wired here: on their reveal.
import * as THREE from 'three';
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { getGhost, prewarmGhost } from './Ghost.js';
import { protectedPhase } from './Fairness.js';
import { grab, scream, eat, release, earlyGame } from '../encounters/scare.js';
import { shriekBuffer, playVoice } from '../../creatures/voices.js';
import { DEATHS } from '../encounters/deaths.js';

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

/**
 * The face, close: held in front of the eyes EVERY frame (it rides the cab with the camera; the old
 * one-shot world placement was left behind by a moving taxi before the first frame rendered), on the
 * camera's layer, opaque, its hands on Ton's head. Returns the grab controller (stop() hides it).
 */
function face(seconds = 0.38, keep = false) {
  const h = getGhost();
  if (!h) return null;
  h._scareN = (h._scareN || 0) + 1;
  const n = h._scareN;
  h.setGhost?.({ stare: 1, mouthStretch: 1, jitter: 0.9, noBlink: 1, unlimited: 1 }, 30);
  h.setGhostMotion?.('nightmare', { instant: true });
  const c = grab(h, { from: 0.75, dist: 0.36, lunge: 0.08, hands: true, pull: 0.8 });
  const hide = () => {
    c.stop();
    if (h._scareN === n) h.root.visible = false;
  };
  c.hide = hide;
  if (!keep) setTimeout(hide, seconds * 1000);
  return c;
}

export async function jumpscare(o = {}) {
  if (busy || g.isDying?.() || g.qte?.active) return true;
  // a prayer just said holds it off a while
  if ((g.prayCalm || 0) > g.engine.time && !o.force) {
    await new Promise((r) => setTimeout(r, Math.max(0, (g.prayCalm - g.engine.time) * 1000)));
    if (g.isDying?.()) return true;
  }
  busy = true;
  try {
    // the lull: a moment of nothing first (it is the silence that sets it up)
    const t0 = performance.now();
    while (performance.now() - t0 < (o.maxWait ?? 7000) && !(quiet > (o.lull ?? 2.5) && !g.dialogue?.busy)) await new Promise((r) => setTimeout(r, 100));
    last = g.engine.time;
    play('sting_reveal', { volume: 1 });
    play('scare_hit', { volume: 1 });
    playVoice(shriekBuffer(), { volume: 0.75, delay: 0.03 });
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
    if (!o.qte || protectedPhase()) {
      face(0.42); // early on, scares are atmosphere only
      return true;
    }
    // it has your head: held through the QTE (a tight window or a fast mash); miss it and it feeds
    const c = face(0, true);
    const spec = Math.random() < 0.5
      ? { kind: 'mash', action: 'interact', count: 16, time: 2.1, decay: 5.5, dread: 1, slowmo: 0.65 }
      : { kind: 'press', action: 'interact', time: 1.0, open: 0.55, dread: 1, slowmo: 0.5 };
    let r = null;
    try {
      r = await g.qte.run(spec);
    } catch (e) {
      r = { ok: true };
    }
    const h = getGhost();
    if (r?.ok) {
      await release(h, c);
      c?.hide?.();
      g.camfx?.relief?.();
      return true;
    }
    // failed: it screams into your face...
    await scream(h, 0.9);
    const death = o.death || 'windowAttack';
    if (earlyGame(death, 'jumpscare')) {
      // ...and, this early, lets go (the fairness gate: no deaths from scares in the first nights)
      await release(h, c);
      c?.hide?.();
      return true;
    }
    // ...and eats you
    await eat(h, c);
    c?.hide?.();
    // the death card for what took him; its own cinematic is skipped (it already ate him, on black)
    g.kill?.(DEATHS[death] ? death : 'windowAttack', { cause: 'jumpscare', fromQte: true, eaten: true });
    return false;
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
