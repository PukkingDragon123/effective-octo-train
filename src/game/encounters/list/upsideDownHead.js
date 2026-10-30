// Ride 2: her head, wet hair hanging, lowers upside down into the top of the windshield from the
// roof, while she is still sitting in the back. The wipers sweep through the hair.
import { createWindowGhost, CREATURE_SPECS } from '../../../creatures/index.js';
import { S, passengerSpec } from '../helpers.js';

export async function run(E) {
  const spec = passengerSpec(E, CREATURE_SPECS.windowWoman);
  const w = E.track(createWindowGhost({ spec: { ...spec, ghost: { ...(spec.ghost || {}), pale: 0.9, eyes: 'black', wet: 1 } } }));
  await w.perform('upsideDownHead', {
    taxi: E.taxi, duration: E.duration, side: 0.18,
    onReveal: () => {
      E.event('encounter:upsideDownHead');
      S.sfx('splash', { volume: 0.15, rate: 1.7 });
    },
  });
}
