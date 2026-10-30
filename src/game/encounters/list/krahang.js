// กระหัง (01–03): a man on winnowing-basket wings, a pestle for a tail, crosses the canopy against
// the red moon; the wing-beats sound like rice baskets being shaken.
import { createKrahang } from '../../../creatures/index.js';
import { S, THREE, rand } from '../helpers.js';

export async function run(E) {
  const side = Math.random() < 0.5 ? -1 : 1;
  const d = rand(45, 70);
  const pts = [
    S.roadAhead(d + 25, side * 45).pos.add(new THREE.Vector3(0, 19, 0)),
    S.roadAhead(d + 8, side * 18).pos.add(new THREE.Vector3(0, 15, 0)),
    S.roadAhead(d, 0).pos.add(new THREE.Vector3(0, 13.5, 0)),
    S.roadAhead(d - 6, -side * 20).pos.add(new THREE.Vector3(0, 15.5, 0)),
    S.roadAhead(d - 12, -side * 48).pos.add(new THREE.Vector3(0, 20, 0)),
  ];
  const k = E.track(createKrahang());
  S.engine.scene.add(k.root);
  const fly = k.flyPath(pts, rand(8, 10.5));
  let seen = false;
  E.frame(() => {
    if (!seen && S.onScreen(k.frame.getWorldPosition(new THREE.Vector3()))) {
      seen = true;
      E.event('encounter:krahang');
    }
  });
  await Promise.race([fly, E.wait(E.duration + 8)]);
  if (E.alive) await k.vanish(1);
}
