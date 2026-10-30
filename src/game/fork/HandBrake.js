// The gigantic hand at the fork, as a QTE: HOLD THE BRAKE. A living passenger taken down the LEFT
// road: a few seconds in, the hand rises out of the fog across the lane ahead. Hold the brake (S / ↓ /
// LT / any touch) and the taxi skids to a stop a car's length short; the fingers hang over the bonnet,
// then the hand sinks back into the mist and the road folds back to before the fork: one warning per
// ride. Miss it and the hand takes the car (death 'giantHand', which reuses this very hand).
//   giantHandBrake(ride) -> Promise<{ survived: bool, hand }>
import * as THREE from 'three';
import { g } from '../context.js';
import { wait } from '../util.js';
import { clamp } from '../../core/math.js';
import { createGiantHand } from '../../creatures/index.js';
import { roadAhead } from '../encounters/stage.js';
import { fogFade, placeTaxi } from '../ride/fx.js';

const _v = new THREE.Vector3();

export async function giantHandBrake(ride) {
  const t = g.taxi;
  const sim = t.physicsSim;
  const alive = () => ride.alive && g.fsm.is('shift');
  // across the lane ahead, far enough to stop if you react at once
  const v0 = Math.max(4, Math.abs(sim.v || 0));
  const dist = clamp(9 + v0 * 1.5, 15, 32);
  const ahead = roadAhead(dist, -0.7);
  let hand = null;
  try {
    hand = createGiantHand({ scale: 4.6 });
    g.engine.scene.add(hand.root);
    hand.root.position.copy(ahead.pos);
    hand.root.rotation.y = ahead.yaw + Math.PI;
  } catch (e) {
    console.warn('[fork] giant hand', e);
    hand = null;
  }
  const at = hand ? hand.root.position : ahead.pos;
  let rumble = null;
  try {
    rumble = g.audio?.loop?.('giant_hand_rumble', { position: at.clone(), volume: 1 });
  } catch (e) {
    rumble = null;
  }
  g.audio?.play?.('sting_reveal', { volume: 1 });
  g.camfx?.flinch(1);
  g.cameraRig.shake(0.35);
  g.sky?.setFogBoost?.(2.4, 1.2);
  hand?.rise(1.2)?.catch?.(() => {});
  // the eyes go to it (the player can still look away)
  g.cameraRig.setFocus(at.clone().add(_v.set(0, 3.2, 0)), 0.45);
  await wait(0.3);
  // hold the brake: the car is helped to stop short of the hand (the QTE is the reaction, not physics)
  let held = false;
  let stopped = false;
  const assist = g.engine.onUpdate((dt) => {
    if (!held && !stopped) return;
    sim.input.brake = 1;
    sim.input.throttle = 0;
    const d = Math.max(0.5, t.root.position.distanceTo(at) - 6.5);
    const need = (sim.v * sim.v) / (2 * d);
    sim.v = Math.max(0, sim.v - Math.max(need * 1.15, stopped ? 14 : 7) * dt);
  }, 11);
  const res = await g.qte.run({
    kind: 'hold',
    action: 'brake',
    hold: 0.85,
    time: 2.6,
    drain: 0.5,
    slowmo: 0.42,
    dread: 1,
    onTick: () => {
      held = g.qte.state?.engaged && (g.input.axis.brake > 0.5 || g.input.down('back') || g.input.down('handbrake') || g.qte._touch.down);
    },
    fail: () => t.root.position.distanceTo(at) < 5.2,
  });
  g.cameraRig.setFocus(null);
  if (!alive()) {
    assist();
    rumble?.stop?.(0.5);
    hand?.dispose?.();
    return { survived: false, hand: null };
  }
  if (!res.ok) {
    assist();
    rumble?.stop?.(1.5);
    return { survived: false, hand };
  }
  // ---- it stops a car's length short: the fingers hang over the bonnet, then it lets go
  stopped = true;
  t.setControlsEnabled(false);
  g.audio?.play?.('tyres_gravel_roll', { object: t.root, volume: 0.8 });
  g.cameraRig.shake(0.25);
  await wait(0.9);
  assist();
  t.state.handbrake = true;
  try {
    hand?.hand?.setCurl?.({ i: 0.1, m: 0.05, r: 0.15, p: 0.3, t: 0.1 }, 2);
  } catch (e) {
    /* cosmetic */
  }
  g.audio?.play?.('breath', { volume: 0.8, rate: 0.8 });
  await wait(1.4);
  if (!alive()) return { survived: false, hand: null };
  rumble?.stop?.(2.5);
  try {
    await Promise.race([hand?.sink?.(2.4), wait(2.8)]);
  } catch (e) {
    /* ignore */
  }
  if (!alive()) return { survived: false, hand: null };
  // the road folds back to the fork: choose again
  const forkS = g.world.fork?.decisionS ?? g.world.road.length('main') - 30;
  await fogFade(
    () => {
      try {
        hand?.dispose?.();
      } catch (e) {
        /* ignore */
      }
      hand = null;
      placeTaxi('main', Math.max(30, forkS - 150), 0);
      t.state.handbrake = false;
      t.state.gear = g.settings.get('transmission') === 'manual' ? 'N' : 'D';
    },
    { tint: '#f2e6d0', hold: 0.8 },
  );
  t.setControlsEnabled(true);
  g.sky?.setFogBoost?.(1.4, 4);
  return { survived: true, hand: null };
}
