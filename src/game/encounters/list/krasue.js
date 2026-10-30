// กระสือ (00–02): a floating woman's head trailing glowing entrails drifts through the banana
// trees, green-gold light on the leaves. It notices the car, holds your eye, then loses interest
// and swoops away into the grove.
import { createKrasue } from '../../../creatures/index.js';
import { S, THREE, rand } from '../helpers.js';

export async function run(E) {
  const grove = S.landmarkPos('bananaGrove');
  const useGrove = grove && S.distTo(grove) < 120 && S.aheadOf(grove) > 10;
  const side = useGrove ? Math.sign(grove.clone().sub(S.taxiPos()).dot(S.roadAhead(0).right)) || -1 : Math.random() < 0.6 ? -1 : 1;
  const d = useGrove ? Math.max(25, S.aheadOf(grove)) : rand(35, 50);
  const start = S.roadAhead(d, side * rand(9, 13)).pos.add(new THREE.Vector3(0, rand(1.7, 2.3), 0));
  const k = E.track(createKrasue());
  S.engine.scene.add(k.root);
  k.placeHead(start);
  k.setGlow(1);
  // drift along the treeline toward the road
  const mid = S.roadAhead(d - 8, side * rand(6, 7.5)).pos.add(new THREE.Vector3(0, rand(1.8, 2.4), 0));
  k.floatTo(mid, 1.1);
  await E.until(() => S.onScreen(k.headPos) || S.distTo(start) < 18, E.duration + 10);
  if (!E.alive) return;
  E.event('encounter:krasue');
  await E.wait(rand(1.2, 2));
  k.notice(S.engine.camera);
  S.sfx('sting_low', { position: k.headPos, volume: 0.45 });
  await E.wait(Math.max(1.5, E.duration * 0.4));
  if (!E.alive) return;
  // loses interest
  const away = S.roadAhead(0, 0).right.clone().multiplyScalar(side).add(new THREE.Vector3(0, 0.25, 0));
  await k.flee(away, 2.4);
}
