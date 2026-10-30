// Rule 8: cold breath right behind the driver's head, the rear-right window fogging from inside,
// the hair on the neck rising (micro-shake). Hold the amulet and keep your eyes forward until it passes.
import { RULE_PARAMS } from '../../data/rules.js';
import { S } from '../helpers.js';

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  E.arm({ coneDeg: RULE_PARAMS.breathLookForwardConeDeg, failSeconds: RULE_PARAMS.breathFailSeconds, mustHoldAmulet: RULE_PARAMS.breathMustHoldAmulet });
  E.event('encounter:breathOnNeck');
  const behind = S.fromTaxi(0.37, 1.12, 0.52);
  const loop = E.track(S.sfxLoop('breath_neck', { object: t.bodyInner || t.root, offset3: [0.37, 1.12, 0.5], volume: 0.9, refDistance: 0.5 }));
  void loop;
  t.setFog?.('rr', 0.75);
  E.cleanup(() => t.setFog?.('rr', 0.2));
  let fail = 0, held = 0;
  const grace = 1.4;
  (async () => {
    while (E.alive && !E.outcomeKey) {
      await E.wait(1.6 + Math.random() * 1.2);
      if (E.alive && !E.outcomeKey) E.whisperRandom(behind);
      S.cameraRig.shake(0.03);
    }
  })();
  const ok = await E.until((dt, el) => {
    const amulet = !!E.director.amuletHeld;
    const fwd = S.lookingForward(RULE_PARAMS.breathLookForwardConeDeg);
    const good = (amulet || !RULE_PARAMS.breathMustHoldAmulet) && fwd;
    if (good) held += dt;
    if (el > grace && !good) fail += dt;
    else fail = Math.max(0, fail - dt * 0.5);
    if (fail > 0.8 && !E._warned) {
      E._warned = true;
      E.report('warn');
    }
    if (fail > RULE_PARAMS.breathFailSeconds) {
      E.outcome('failed');
      return true;
    }
    return false;
  }, E.duration);
  if (!E.alive) return;
  if (!ok && !E.outcomeKey) {
    E.outcome('held');
    E.event('breathPassed');
  }
  await E._outcomeP;
}
