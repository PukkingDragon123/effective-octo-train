// Woman running beside the car (21–23): first only in the left side mirror, keeping pace at any
// speed; then real, through the side window, her neck slowly turning toward the driver while her
// body keeps running. The amulet makes her fall back into the dark.
import { createWindowGhost, CREATURE_SPECS } from '../../../creatures/index.js';
import { S, onBus } from '../helpers.js';

export async function run(E) {
  const w = E.track(createWindowGhost({ spec: CREATURE_SPECS.windowWoman }));
  w.humanoid.setGore({ bleedEyes: 0.3, speed: 1 });
  let repelled = false;
  onBus(E, 'amulet:hold', (e) => {
    if (e?.active && !repelled) {
      repelled = true;
      S.sfx('amulet_hum', { volume: 0.6 });
      w.stop();
    }
  });
  E.event('encounter:womanRunning');
  const run = w.perform('runBeside', { taxi: E.taxi, side: 'L', duration: E.duration, mirrorFirst: 3.5, along: 1.6 });
  // whispers from her side while she keeps pace
  (async () => {
    await E.wait(4.5);
    if (E.alive && !repelled) E.whisperRandom(S.fromTaxi(-1.8, 1.4, 1.2));
    await E.wait(3);
    if (E.alive && !repelled) E.whisperRandom(S.fromTaxi(-1.8, 1.4, 0.8));
  })();
  await run;
}
