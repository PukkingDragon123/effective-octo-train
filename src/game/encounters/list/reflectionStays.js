// Ride 4, wrong fork: the boy has gone, but his reflection is still sitting there, and slowly
// turns its head to look at you in the mirror ("พี่ครับ... ผมยังอยู่นี่"). Then the road folds.
import { LAYERS } from '../../../core/layers.js';
import { createCreatureHumanoid } from '../../../creatures/index.js';
import { S, passengerSpec } from '../helpers.js';

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  const seat = S.passengerSeat(E.ctx) || 'rearLeft';
  const spec = passengerSpec(E, { ...(S.CHARACTERS.boyM?.appearance || {}), id: 'boyM_refl' });
  const h = E.track(createCreatureHumanoid(spec, { layer: LAYERS.REFLECTION_ONLY }));
  if (t.seats?.[seat]) h.sitAt(t.seats[seat], { pose: 'sitCar' });
  h.setLayer(LAYERS.REFLECTION_ONLY);
  h.setGhost({ still: 1, stare: 1, noBlink: 1 }, 100);
  h.setGore?.({ bleedMouth: 0.6, bleedEyes: 0.3, speed: 0.3 });
  E.event('encounter:reflectionStays');
  await E.until(() => S.lookingAtMirror('mirror_rear'), 4);
  await E.wait(0.8);
  h.lookAt(S.engine.camera, { speed: 0.5, unlimited: true });
  await E.say(E.def.lines, { object: h.root });
  await E.wait(Math.max(1, E.duration - E.elapsed));
}
