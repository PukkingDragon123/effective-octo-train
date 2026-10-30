// Monks on the alms round (05–06): a line of barefoot monks in saffron walks single file along
// the misty roadside toward the car; villagers kneel with rice; the small novice at the end waves.
import { createCreatureHumanoid, CREATURE_SPECS } from '../../../creatures/index.js';
import { S, THREE, rand } from '../helpers.js';

export const stationary = true;

export async function run(E) {
  const d = E.ctx.distance ?? rand(40, 55);
  const r = S.roadAhead(d, -4.4);
  const monks = [];
  for (let i = 0; i < 5; i++) {
    const h = E.track(createCreatureHumanoid(CREATURE_SPECS.alms(i)));
    S.engine.scene.add(h.root);
    const p = r.pos.clone().addScaledVector(r.tangent, i * 1.7);
    p.y = S.ground(p.x, p.z, p.y);
    h.root.position.copy(p);
    h.root.rotation.y = r.yaw + Math.PI; // walking toward the car
    h.setGroundFn?.((x, z) => S.ground(x, z, p.y));
    monks.push(h);
  }
  // villagers kneeling at the verge with rice
  const kneel = [];
  for (let i = 0; i < 2; i++) {
    const h = E.track(createCreatureHumanoid(CREATURE_SPECS.villager(i)));
    S.engine.scene.add(h.root);
    const p = r.pos.clone().addScaledVector(r.tangent, -6 - i * 1.4).addScaledVector(r.right, -1.6);
    p.y = S.ground(p.x, p.z, p.y);
    h.root.position.copy(p);
    h.root.rotation.y = Math.atan2(-r.right.x, -r.right.z); // facing the road
    h.setMode('crouch');
    kneel.push(h);
  }
  E.event('encounter:monksAlms');
  S.sfx('bell_temple', { position: r.pos, volume: 0.5 });
  const walkTo = r.pos.clone().addScaledVector(r.tangent, -14);
  monks.forEach((h, i) => h.walkTo(walkTo.clone().addScaledVector(r.tangent, i * 1.7), { speed: 0.75 }));
  let waved = false, bowed = false;
  E.frame(() => {
    const novice = monks[3];
    if (!waved && S.distTo(novice.root.position) < 18) {
      waved = true;
      novice.lookAt(S.engine.camera, { speed: 2 });
      novice.play('wave', { side: 'R' });
    }
    if (!bowed && S.distTo(kneel[0].root.position) < 22) {
      bowed = true;
      kneel.forEach((h, i) => setTimeout(() => h.play('wai', { level: 'face' }), i * 400));
      S.sfx('alms_bowl', { position: kneel[0].root.position, volume: 0.5 });
    }
  });
  await E.wait(E.duration);
}
