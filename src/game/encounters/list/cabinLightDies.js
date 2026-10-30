// Rule 9: the cabin light dies by itself (or, if it was off, the dash dims too). Scratching
// travels across the headliner. Switching the light back on = the ceiling crawl.
import { RULE_PARAMS } from '../../data/rules.js';
import { S, onControl, rand } from '../helpers.js';

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  const wasOn = !!t.state?.cabinLight;
  E.arm({ attackDelay: RULE_PARAMS.cabinLightAttackDelay, wasOn, noStaging: true });
  E.event('cabinLightDies');
  E.event('encounter:cabinLightDies');
  // flicker, then die
  if (wasOn) {
    S.sfx('fluorescent_flicker', { object: t.anchors?.cabinLight, volume: 0.5 });
    for (let i = 0; i < 6 && E.alive; i++) {
      t.setCabinOverride?.(i % 2 ? 0.05 : 0.8, 1);
      await E.wait(rand(0.05, 0.18));
    }
  }
  t.setCabinOverride?.(0, 0);
  S.sfx('switch_click', { object: t.anchors?.cabinLight, volume: 0.4 });
  E.cleanup(() => t.setCabinOverride?.(null));
  // switching it back on is the break
  onControl(E, 'cabinLight', (v) => {
    if (v && !E.outcomeKey && !E.managed) {
      E.wait(RULE_PARAMS.cabinLightAttackDelay).then(() => E.outcome('lightOn'));
    }
  });
  // scratching across the headliner, whispers
  (async () => {
    while (E.alive && !E.outcomeKey) {
      const z = rand(-0.3, 1.2);
      S.sfx('scratch_glass', { object: t.bodyInner || t.root, offset3: [rand(-0.5, 0.5), 1.4, z], volume: rand(0.25, 0.5), rate: rand(0.45, 0.7) });
      if (Math.random() < 0.35) E.whisperRandom(S.fromTaxi(0, 1.35, z));
      await E.wait(rand(1.2, 2.6));
    }
  })();
  await E.until(() => !!E.outcomeKey, E.duration);
  if (!E.outcomeKey && !E.managed) E.outcome('waited');
  await E.wait(0.2);
}
