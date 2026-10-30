// Rule 16 (mirror only): a small girl in an older-pattern school uniform sits in the back seat in
// the rear-view mirror. Direct view: nobody. She never moves, never blinks, and smiles a little
// wider each time you check. Asking, greeting or stopping = she answers, and then she is in front.
import { RULE_PARAMS } from '../../data/rules.js';
import { LAYERS } from '../../../core/layers.js';
import { createCreatureHumanoid } from '../../../creatures/index.js';
import { S } from '../helpers.js';

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  const taken = S.passengerSeat(E.ctx);
  const seatId = ['rearRight', 'rearCenter', 'rearLeft'].find((s) => s !== taken) || 'rearCenter';
  const appearance = S.CHARACTERS.extraChild?.appearance || { sex: 'f', age: 8 };
  const h = E.track(createCreatureHumanoid({ ...appearance, id: 'extraChild' }, { layer: LAYERS.REFLECTION_ONLY }));
  if (t.seats?.[seatId]) h.sitAt(t.seats[seatId], { pose: 'sitCar' });
  else S.engine.scene.add(h.root);
  h.setLayer(LAYERS.REFLECTION_ONLY);
  h.setGhost({ still: 1, stare: 1, noBlink: 1 }, 100);
  h.lookAt(S.engine.camera, { speed: 0.6, weight: 0.8 });
  let smile = 0.15;
  h.setExpression({ smile, creepy: 0.3 });
  E.arm({ stopSpeedKmh: RULE_PARAMS.extraPassengerStopSpeedKmh });
  // first sight in the mirror
  await E.until(() => S.lookingAtMirror('mirror_rear'), E.scheduled ? 10 : 6);
  if (!E.alive) return;
  E.event('encounter:extraPassenger');
  S.sfx('sting_low', { volume: 0.5 });
  let wasLooking = true, still = 0;
  E.frame((dt) => {
    const now = S.lookingAtMirror('mirror_rear');
    if (now && !wasLooking) {
      smile = Math.min(1, smile + 0.22);
      h.setExpression({ smile, creepy: 0.3 + smile * 0.6 });
    }
    wasLooking = now;
    if (E.managed) return;
    if (t.speedKmh < RULE_PARAMS.extraPassengerStopSpeedKmh) still += dt;
    else still = 0;
    if (still > 2 && !E.outcomeKey) E.outcome('stopped');
  });
  if (!E.outcomeKey) {
    const key = await E.ask();
    if (key && !E.outcomeKey) E.outcome(key);
  }
  await E.until(() => !!E.outcomeKey, Math.max(2, E.duration - E.elapsed));
  if (!E.outcomeKey && !E.managed) E.outcome('silent');
  await E._outcomeP;
}
