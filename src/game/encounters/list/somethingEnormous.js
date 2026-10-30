// Something enormous (23–01): a vast stooped silhouette walks between the trunks 40–80 m away;
// for a moment a sodium lamp deep in the trees catches it. Each step thuds; the amulet warms.
import { createForestGiant } from '../../../creatures/index.js';
import { S, THREE, rand, bus } from '../helpers.js';

export async function run(E) {
  const side = Math.random() < 0.5 ? -1 : 1;
  const d0 = rand(55, 75), lat = side * rand(38, 55);
  const a = S.roadAhead(d0, lat).pos, b = S.roadAhead(d0 + rand(18, 30), lat + side * rand(-12, 8)).pos;
  const giant = E.track(createForestGiant({ height: rand(11, 15) }));
  S.engine.scene.add(giant.root);
  giant.humanoid.setGroundFn?.((x, z) => S.ground(x, z, a.y));
  const walk = giant.walkPast(a, b, E.duration + 3);
  bus.emit('amulet:warm', { amount: 0.6, source: 'somethingEnormous' });
  E.event('encounter:somethingEnormous');
  await E.wait(E.duration * 0.35);
  if (E.alive) giant.catchLight(1.4, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 9, 0)));
  S.sfx('rumble_sub', { position: a, volume: 0.9, rate: 0.6 });
  await Promise.race([walk, E.wait(E.duration + 4)]);
  if (E.alive) await giant.vanish(1.5);
}
