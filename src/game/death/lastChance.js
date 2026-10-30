// Last chances: a few deaths open with a QTE instead of the cut to black. kill(type) runs the
// registered stage first (rules suspended, the ride still alive); if the player wins it, the death
// is averted and the night goes on. Otherwise the normal death cinematic plays (opts.fromQte).
//   windowArm   the long grey arm comes through the open window and takes Ton by the collar:
//               MASH (F / LMB / A / tap) to tear free. Free: the arm slips back out, the window
//               winds itself up. Not free: it drags him out (the windowArm cinematic).
import * as THREE from 'three';
import { g } from '../context.js';
import { wait, during } from '../util.js';
import { clamp } from '../../core/math.js';
import { registerLastChance } from './index.js';
import { createWindowGhost, CREATURE_SPECS, bodyOf, toBody } from '../../creatures/index.js';

const _v = new THREE.Vector3();
const ease = (k) => k * k * (3 - 2 * k);

registerLastChance('windowArm', async (ctx) => {
  const t = g.taxi;
  if (!t || !g.qte || !t.isCameraInside?.()) return false;
  // the window that is open (the driver's by default)
  const wins = t.state?.windows || {};
  const pane = ctx.opts?.pane || ['fr', 'fl', 'rr', 'rl'].reduce((a, b) => ((wins[b] ?? 0) > (wins[a] ?? 0) + 0.05 ? b : a), 'fr');
  let w = null;
  let arm = null;
  try {
    w = createWindowGhost({ spec: CREATURE_SPECS.tallMan });
    w.humanoid.setVisible(false);
    arm = w.armThroughWindow(t, pane);
  } catch (e) {
    console.warn('[lastChance] window arm', e);
    w?.dispose?.();
    return false;
  }
  const { hand, inward, center } = arm;
  const body = bodyOf(t);
  // the car coasts: Ton's feet come off the pedals
  const ctrl = t.controlsEnabled;
  t.setControlsEnabled(false);
  const coast = g.engine.onUpdate(() => {
    t.physicsSim.input.throttle = 0;
    t.physicsSim.input.brake = 0.35;
  }, 11);
  const done = (ok) => {
    coast();
    if (ok && ctrl) t.setControlsEnabled(true);
    g.camfx && g.camfx.tug.set(0, 0, 0);
    if (g.camfx) g.camfx.tugYaw = 0;
  };
  // 1. it comes in, fast, and closes on the collar
  g.audio?.play?.('sting_high', { volume: 1 });
  g.audio?.play?.('scratch_glass', { object: t.anchors?.windowCrankFR || t.root, volume: 0.8 });
  g.camfx?.flinch(1);
  const eyeL = toBody(t, g.engine.camera.getWorldPosition(new THREE.Vector3()), new THREE.Vector3());
  const start = hand.mesh.position.clone();
  const collar = eyeL.clone().addScaledVector(inward, -0.16).add(_v.set(0, -0.2, 0.04));
  hand.setCurl(-0.25, 20);
  hand.spreadT = 1;
  await during(0.42, (dt, tt, k) => {
    hand.mesh.position.lerpVectors(start, collar, ease(k));
  });
  hand.setCurl(1, 14);
  hand.spreadT = 0;
  g.audio?.play?.('bone_crack', { volume: 0.55, rate: 1.3 });
  g.cameraRig.shake(0.5);
  // the side it pulls toward, in the camera's base frame (+x = right)
  const side = pane === 'fl' || pane === 'rl' ? -1 : 1;
  // 2. the struggle: it yanks toward the window; every press pulls back
  let yank = 0;
  const res = await g.qte.run({
    kind: 'mash',
    action: 'interact',
    count: 9,
    decay: 0.3,
    time: 3.4,
    slowmo: 0.6,
    dread: 1,
    onPress: () => {
      g.audio?.play?.('seat_creak', { volume: 0.7, rate: 0.8 + Math.random() * 0.4 });
      g.cameraRig.shake(0.08);
    },
    onTick: (st, dt) => {
      yank += dt;
      const pull = (1 - st.progress) * (0.5 + 0.5 * Math.max(0, Math.sin(yank * 7)));
      if (g.camfx) {
        g.camfx.tug.set(side * 0.09 * pull, -0.015 * pull, 0);
        g.camfx.tugYaw = -side * 0.12 * pull;
      }
      const p = collar.clone().addScaledVector(inward, -0.12 * pull);
      hand.mesh.position.lerp(p, 1 - Math.exp(-14 * dt));
    },
  });
  if (!res.ok || !g.fsm.is('shift')) {
    done(false);
    w.dispose();
    return false;
  }
  // 3. free: the fingers open, the arm slides back out, the window winds itself up
  hand.setCurl(-0.3, 12);
  hand.spreadT = 1;
  g.audio?.play?.('scratch_glass', { object: t.anchors?.windowCrankFR || t.root, volume: 0.5, rate: 0.7 });
  const from = hand.mesh.position.clone();
  const out = center.clone().addScaledVector(inward, -1.6);
  done(true);
  await during(0.55, (dt, tt, k) => hand.mesh.position.lerpVectors(from, out, ease(k)));
  try {
    t.setControl('window', { window: pane, amount: 0 }, { speed: 1.4 });
    g.audio?.play?.('window_crank', { object: t.anchors?.windowCrankFR || t.root, volume: 0.6, rate: 1.4 });
    t.addGlassMark?.(pane, 'blood_handprint', new THREE.Vector2(0.5, 0.45), { size: 1.1 });
  } catch (e) {
    /* cosmetic */
  }
  w.dispose();
  // whatever was at the window is gone (its rule window closes as survived)
  try {
    g.director?.byRule?.('r14')?.stop?.();
  } catch (e) {
    /* ignore */
  }
  void body;
  void clamp;
  await wait(0.2);
  return true;
});
