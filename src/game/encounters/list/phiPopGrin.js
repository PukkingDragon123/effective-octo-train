// ผีปอบ in the side mirror (rule 8): only in the right-hand mirror, an old village woman crouches
// beside the car, grinning, red-eyed, licking her lips; every time you check the mirror she is
// nearer and her mouth is wider. Then her breath is on your neck. Rule 8: hold the amulet and keep
// your eyes forward until it passes (QTE: hold still) — or she feeds (death 'breath').
import * as THREE from 'three';
import { LAYERS } from '../../../core/layers.js';
import { createCreatureHumanoid, CREATURE_SPECS, bodyOf } from '../../../creatures/index.js';
import { RULE_PARAMS } from '../../data/rules.js';
import { S, qte, rand } from '../helpers.js';

export function canStart() {
  return S.cameraInside();
}

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  const body = bodyOf(t);
  const h = E.track(createCreatureHumanoid(CREATURE_SPECS.phiPop, { layer: LAYERS.REFLECTION_ONLY }));
  body.add(h.root);
  h.setLayer(LAYERS.REFLECTION_ONLY);
  // crouched beside the rear door, visible in the right mirror
  const spots = [new THREE.Vector3(1.45, 0.1, 1.6), new THREE.Vector3(1.32, 0.1, 0.9), new THREE.Vector3(1.22, 0.15, 0.25)];
  let step = 0;
  h.root.position.copy(spots[0]);
  h.root.rotation.y = Math.PI * 0.62; // turned toward the mirror / driver
  h.setMode('crouch');
  h.setGhost({ stare: 1, noBlink: 1, mouthStretch: 0.25, headRoll: 0.15, jitter: 0.15 }, 100);
  h.setExpression({ smile: 1, creepy: 1 });
  h.setGhostMotion?.('wrongLimbs');
  h.lookAt(t.anchors?.mirrorRight || S.engine.camera, { speed: 3, unlimited: true });
  h.setGore?.({ bleedMouth: 0.6, speed: 0.4 });
  // nearer every time you look
  let was = false, looks = 0;
  E.frame(() => {
    const now = S.lookingAtMirror('mirror_right');
    if (!now && was && step < spots.length - 1) {
      step++;
      h.root.position.copy(spots[step]);
      h.setGhost({ mouthStretch: 0.25 + step * 0.3 }, 100);
    }
    if (now && !was) {
      looks++;
      if (looks === 1) E.event('encounter:phiPopGrin');
      S.sfx('giggle', { object: h.root, volume: 0.35, rate: 0.55 });
    }
    was = now;
  });
  await E.until(() => looks >= 2 && !S.lookingAtMirror('mirror_right'), 14);
  if (!E.alive) return;
  // her breath on your neck; in the mirror her jaw unhinges
  h.setGhostMotion?.('gape');
  E.whisper(E.def.lines[0], S.fromTaxi(0.4, 1.12, 0.45));
  const breath = E.track(S.sfxLoop('breath_neck', { object: t.anchors?.driverEye || t.root, offset3: [0.05, 0, 0.22], volume: 0.9 }));
  void breath;
  t.setFog?.('fr', 0.6);
  E.cleanup(() => t.setFog?.('fr', 0.15));
  const res = await qte(E, {
    kind: 'still', action: 'amulet', hold: 3.6, time: 9, grace: 1.3, failTime: RULE_PARAMS.breathFailSeconds * 0.6, tolerance: 0.6, dread: 0.9,
    ok: () => S.lookingForward(RULE_PARAMS.breathLookForwardConeDeg),
  });
  if (!E.alive) return;
  if (!res.ok) {
    E.violate('breath', 'failed');
    await E.wait(10);
    return;
  }
  // repelled: a hiss behind the glass, and the mirror is empty
  S.sfx('whisper', { object: h.root, volume: 0.6, rate: 0.6 });
  S.sfx('amulet_hum', { volume: 0.6 });
  E.report('resolved', { outcome: 'held' });
  h.setGhost({ mouthStretch: 1, jitter: 0.9 }, 10);
  await E.wait(0.35);
  h.setVisible(false);
  await E.wait(rand(1, 2));
}
