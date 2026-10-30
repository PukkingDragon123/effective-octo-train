// Ride 9, rule 3 (the final test): at the mist gate he has stepped out, the door has closed, and
// his voice comes from the seat behind you. The finale lines belong to the ride; the director
// arms rule 3 for the back-seat event, warms the glass behind you (his hand on the rear-right
// window, the fog of a breath that is not there) and watches for the look back.
import { RULE_PARAMS } from '../../data/rules.js';
import { S, THREE, bus } from '../helpers.js';

export async function run(E) {
  const t = E.taxi;
  E.arm({ mode: 'ending', seat: 'rearRight', backSeatEvent: true, final: true, yawDeg: RULE_PARAMS.lookBackYawDeg });
  E.event('encounter:fatherCall');
  try {
    t?.setFog?.('rr', 0.55);
    t?.addGlassMark?.('rr', 'handprint', new THREE.Vector2(0.45, 0.55), { size: 1.2, intensity: 0.6 });
  } catch (e) { /* optional */ }
  if (E.managed) {
    await E.until(() => !!E.outcomeKey, E.duration);
    await E._outcomeP;
    return;
  }
  let stareT = 0;
  const looked = await E.until((dt) => {
    if (S.lookingBack()) return true;
    const seat = t?.seats?.rearRight;
    if (seat) {
      const p = seat.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.6, 0));
      if (S.isLooking(p, RULE_PARAMS.rearSeatStareConeDeg) && !S.lookingAtMirror()) stareT += dt;
      else stareT = Math.max(0, stareT - dt);
    }
    return stareT > RULE_PARAMS.rearSeatStareSeconds;
  }, E.duration);
  if (!E.alive) return;
  if (looked) {
    bus.emit('encounter:lookBack', { id: E.id });
    E.outcome('lookedBack');
  } else E.outcome('drove');
  await E._outcomeP;
}
