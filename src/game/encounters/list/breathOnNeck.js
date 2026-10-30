// Rule 8: cold breath right behind the driver's head, the rear-right window fogging from inside,
// the hair on the neck rising (micro-shake). Hold the amulet and keep your eyes forward until it passes.
import { RULE_PARAMS } from '../../data/rules.js';
import { LAYERS } from '../../../core/layers.js';
import { createCreatureHumanoid, CREATURE_SPECS } from '../../../creatures/index.js';
import { S } from '../helpers.js';

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  E.arm({ coneDeg: RULE_PARAMS.breathLookForwardConeDeg, failSeconds: RULE_PARAMS.breathFailSeconds, mustHoldAmulet: RULE_PARAMS.breathMustHoldAmulet });
  E.event('encounter:breathOnNeck');
  const behind = S.fromTaxi(0.37, 1.12, 0.52);
  // in the rear-view mirror only: a pale face leaning in right behind the driver's head
  const face = E.track(createCreatureHumanoid(CREATURE_SPECS.windowWoman, { layer: LAYERS.REFLECTION_ONLY }));
  (t.bodyInner || t.root).add(face.root);
  face.setLayer(LAYERS.REFLECTION_ONLY);
  face.root.position.set(0.3, 0.12, 0.95);
  face.root.rotation.set(0, Math.PI * 0.94, 0);
  face.setMode('crouch');
  face.setGhost({ stare: 1, noBlink: 1, backbend: -0.5, headPitch: 0.3, mouthStretch: 0.2 }, 100);
  face.lookAt(S.engine.camera, { speed: 2, unlimited: true });
  if (!E.managed) {
    // (B's rule monitor plays the breath and fogs the glass itself)
    E.track(S.sfxLoop('breath_neck', { object: t.bodyInner || t.root, offset3: [0.37, 1.12, 0.5], volume: 0.9, refDistance: 0.5 }));
    t.setFog?.('rr', 0.75);
    E.cleanup(() => t.setFog?.('rr', 0.2));
  }
  let fail = 0, held = 0;
  const grace = 1.4;
  (async () => {
    while (E.alive && !E.outcomeKey) {
      await E.wait(1.6 + Math.random() * 1.2);
      if (E.alive && !E.outcomeKey) E.whisperRandom(behind);
      S.cameraRig.shake(0.03);
    }
  })();
  if (E.managed) {
    // B's rule (a hold-your-breath QTE) decides; it can outlast the nominal duration
    await E.until(() => !!E.outcomeKey, E.duration + 14);
    await E._outcomeP;
    return;
  }
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
