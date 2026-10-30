// Rule 12: someone stands dead centre of the lane 80 m ahead, arms at its sides, NOT hailing,
// lit only by the headlights. Don't brake, don't swerve: drive through it. Then a cold white flash,
// the glass fogs from outside, and it is standing in the road behind you, in the mirror only.
import { RULE_PARAMS } from '../../data/rules.js';
import { createWindowGhost, CREATURE_SPECS } from '../../../creatures/index.js';
import { LAYERS } from '../../../core/layers.js';
import { S, THREE } from '../helpers.js';

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  const ahead = E.ctx.distance ?? 80;
  const r = S.roadAhead(ahead, -1.55);
  const w = E.track(createWindowGhost({ spec: CREATURE_SPECS.roadFigure }));
  const h = w.humanoid;
  w.perform('standInRoad', { pos: r.pos, facing: r.yaw + Math.PI, duration: 120 });
  E.arm({ position: r.pos.clone(), noBrakeMinKmh: RULE_PARAMS.roadFigureNoBrakeMinKmh, dangerM: RULE_PARAMS.roadFigureDangerM, maxSwerveM: RULE_PARAMS.roadFigureMaxSwerveLateralM });
  let revealed = false, warned = false;
  const res = await E.until(() => {
    const d = S.aheadOf(r.pos);
    if (!revealed && d < 70 && S.onScreen(h.headPosition)) {
      revealed = true;
      E.event('encounter:roadFigure');
      S.sfx('sting_low', { position: r.pos, volume: 0.6 });
    }
    if (E.managed && E.outcomeKey && E.outcomeKey !== 'passed') return 'decided';
    if (d < RULE_PARAMS.roadFigureDangerM && d > 0 && !E.managed) {
      if (t.speedKmh < RULE_PARAMS.roadFigureNoBrakeMinKmh) return 'braked';
      const lat = S.taxiPos().sub(r.pos).dot(r.right);
      if (Math.abs(lat) > RULE_PARAMS.roadFigureMaxSwerveLateralM || t.physics?.onRoad === false) return 'swerved';
      if (!warned && d < 12) {
        warned = true;
        E.whisperRandom(r.pos.clone().add(new THREE.Vector3(0, 1.6, 0)));
      }
    }
    return d < -0.5 ? 'passed' : false;
  }, Math.max(40, E.duration + 30));
  if (!E.alive) return;
  // the until() helper gives true/false; recompute which
  const d = S.aheadOf(r.pos);
  if (E.managed && E.outcomeKey && E.outcomeKey !== 'passed') {
    await E._outcomeP;
    return;
  }
  if (d >= -0.5 && !E.managed) {
    const lat = S.taxiPos().sub(r.pos).dot(r.right);
    const key = Math.abs(lat) > RULE_PARAMS.roadFigureMaxSwerveLateralM ? 'swerved' : res ? 'braked' : 'passed';
    if (key !== 'passed') {
      E.outcome(key);
      await E._outcomeP;
      return;
    }
  }
  // through it: cold flash, the glass fogs, and it stands behind you in the mirror
  E.g.postfx?.flash?.(0xe8f0ff, 0.22);
  S.sfx('sting_reveal', { volume: 0.8 });
  S.sfx('whisper', { volume: 0.6 });
  t.setFog?.('windshield', 0.85);
  t.glass?.fillFog?.('windshield', 0.7);
  S.cameraRig.shake(0.2);
  if (!E.managed) E.outcome('passed');
  const back = S.roadAhead(-14, -1.55);
  h.root.position.copy(back.pos);
  h.root.rotation.y = back.yaw;
  h.setLayer(LAYERS.REFLECTION_ONLY);
  await E.wait(3.5);
  w.stop();
  h.setLayer(LAYERS.DEFAULT);
  t.setFog?.('windshield', 0.2);
}
