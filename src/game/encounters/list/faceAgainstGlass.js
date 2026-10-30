// Rides 2 and 7 (side windows): a face presses against the side glass from outside and smears
// the condensation. In ride 7 it is Uncle Saman's own face, grinning, while he sits inside too.
// Staged on a window you are NOT looking at; it is there when you turn.
import { createWindowGhost, CREATURE_SPECS } from '../../../creatures/index.js';
import { S, passengerSpec } from '../helpers.js';

export async function run(E) {
  const pid = E.passengerId;
  const spec = passengerSpec(E, CREATURE_SPECS.windowWoman);
  const saman = pid === 'saman';
  const w = E.track(createWindowGhost({ spec: saman ? spec : { ...spec, ghost: { ...(spec.ghost || {}), pale: 0.95, eyes: 'black', wet: 1, bloodStains: 0.4 } } }));
  // a side window out of view
  const cands = ['rr', 'fl', 'rl'].filter((p) => S.gazeTarget() !== p);
  const pane = E.ctx.pane || cands[(Math.random() * cands.length) | 0] || 'rr';
  let reported = false;
  await w.perform('faceAgainstGlass', {
    taxi: E.taxi, pane, duration: E.duration, grin: true, blood: !saman,
    onPress: () => {
      if (!reported) {
        reported = true;
        E.event('encounter:faceAgainstGlass');
      }
      if (saman) S.sfx('giggle', { volume: 0.6, rate: 0.8 });
      else S.sfx('breath', { volume: 0.6 });
    },
  });
}
