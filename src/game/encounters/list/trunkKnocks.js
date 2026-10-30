// Rule 5: three knocks from inside the trunk; the lid rattles in the mirror. After the third, do
// not stop (under 2 km/h for 1.5 s) while the rule stays armed.
import { RULE_PARAMS } from '../../data/rules.js';
import { S, rand } from '../helpers.js';

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  E.event('encounter:trunkKnocks');
  const [a, b] = RULE_PARAMS.knockIntervalSeconds;
  for (let i = 1; i <= RULE_PARAMS.knockCount && E.alive; i++) {
    S.sfx('knock_trunk', { object: t.anchors?.trunk || t.root, volume: 0.8 + i * 0.06, rate: rand(0.92, 1.05) });
    t.openDoor?.('trunk', 0.035, 0.06).then(() => t.openDoor?.('trunk', 0, 0.08));
    if (i === 1) E.event('knock1');
    if (i === RULE_PARAMS.knockCount) E.event('knock3');
    if (i < RULE_PARAMS.knockCount) await E.wait(rand(a, b));
  }
  if (!E.alive) return;
  E.arm({ stopSpeedKmh: RULE_PARAMS.knockStopSpeedKmh, stopSeconds: RULE_PARAMS.knockStopSeconds, armedSeconds: RULE_PARAMS.knockDangerSeconds });
  let still = 0;
  (async () => {
    await E.wait(4);
    if (E.alive && !E.outcomeKey) E.whisperRandom(S.fromTaxi(0, 0.9, 2.0));
  })();
  const stopped = await E.until((dt) => {
    if (t.speedKmh < RULE_PARAMS.knockStopSpeedKmh) still += dt;
    else still = 0;
    if (still > 0.6 && !E._warned) {
      E._warned = true;
      E.report('warn');
      S.sfx('knock_trunk', { object: t.anchors?.trunk || t.root, volume: 1, rate: 0.8 });
    }
    return still > RULE_PARAMS.knockStopSeconds;
  }, Math.max(E.duration, RULE_PARAMS.knockDangerSeconds));
  if (!E.alive) return;
  if (stopped) {
    t.openDoor?.('trunk', 0.12, 0.3);
    E.outcome('stopped');
  } else E.outcome('kept');
  await E._outcomeP;
}
