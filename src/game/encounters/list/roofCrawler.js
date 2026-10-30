// Roof crawler (22–02): dents and thumps on the roof, something crawls to the front, slaps the
// windshield once, its upside-down face over the top edge; then it leaps into the trees.
// Holding the amulet throws it off early.
import { createWindowGhost, CREATURE_SPECS } from '../../../creatures/index.js';
import { S, onBus } from '../helpers.js';

export async function run(E) {
  const w = E.track(createWindowGhost({ spec: CREATURE_SPECS.roofCrawler }));
  onBus(E, 'amulet:hold', (e) => {
    if (e?.active) {
      S.sfx('amulet_hum', { volume: 0.6 });
      w.stop();
    }
  });
  await w.perform('roofCrawler', {
    taxi: E.taxi, duration: E.duration,
    onSlap: () => E.event('encounter:roofCrawler'),
  });
}
