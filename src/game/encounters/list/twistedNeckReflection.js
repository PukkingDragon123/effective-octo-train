// Ride 4 (mirror only): the passenger's reflection turns its head 90° and stares while the
// direct view stays normal. Boy M exists only in the mirror, so his own (reflection-only) body
// twists; a passenger with a normal reflection gets a reflection double that does it instead.
// It snaps back the moment you look away from the mirror.
import { LAYERS } from '../../../core/layers.js';
import { S } from '../helpers.js';

export async function run(E) {
  const h = E.passenger;
  if (!h) return;
  const reflOnly = h._layer === LAYERS.REFLECTION_ONLY;
  let target = h, dbl = null;
  if (!reflOnly && h.createReflectionDouble) {
    const prev = h._layer ?? LAYERS.DEFAULT;
    dbl = h.createReflectionDouble({});
    h.root.parent?.add(dbl.root);
    h.setLayer(LAYERS.MAIN_ONLY);
    target = dbl;
    E.cleanup(() => {
      h.setLayer(prev);
      dbl.dispose();
    });
  }
  const set = (v) => (target.setOverrides ? target.setOverrides({ neckTwist: v, stare: 1 }, 7) : target.setGhost({ neckTwist: v, stare: v ? 1 : 0 }, 7));
  E.event('encounter:twistedNeckReflection');
  // wait for a look into the rear-view mirror, then twist; it holds only while you keep looking
  await E.until(() => S.lookingAtMirror('mirror_rear'), E.scheduled ? 12 : 4);
  if (!E.alive) return;
  set(1.6);
  S.sfx('neck_snap', { volume: 0.4 });
  S.sfx('sting_low', { volume: 0.5 });
  await E.until(() => !S.lookingAtMirror('mirror_rear'), E.duration);
  set(0);
  await E.wait(0.3);
  if (reflOnly) h.setGhost({ neckTwist: 0, stare: 0 }, 6);
}
