// Temple dogs chase the taxi (02–03): three to five scruffy dogs burst out of the verge barking,
// chase the car for a hundred metres, give up, bark a last time and trot back proudly.
import { createAnimal, DOG_COATS } from '../../../creatures/index.js';
import { S, THREE, rand } from '../helpers.js';

export async function run(E) {
  const t = E.taxi;
  const n = 3 + ((Math.random() * 3) | 0);
  const side = Math.random() < 0.5 ? -1 : 1;
  const base = S.roadAhead(rand(22, 32), side * 5.2);
  const dogs = [];
  for (let i = 0; i < n; i++) {
    const d = E.track(createAnimal('dog', { tint: DOG_COATS[(Math.random() * DOG_COATS.length) | 0], scale: rand(0.85, 1.12), groundFn: (x, z) => S.ground(x, z, base.pos.y) }));
    S.engine.scene.add(d.root);
    const p = base.pos.clone().addScaledVector(base.tangent, rand(-4, 4)).addScaledVector(base.right, side * rand(0, 2.5));
    d.place(p, Math.atan2(side * base.right.x, side * base.right.z)); // facing the road
    d.home = p.clone();
    d.lookAt(t?.root || null);
    d.mood = 1;
    dogs.push(d);
  }
  E.event('encounter:strayDogs');
  // wait for the car
  await E.until(() => S.distTo(base.pos) < 16 || S.aheadOf(base.pos) < 4, 25);
  if (!E.alive) return;
  const startPos = S.taxiPos();
  dogs.forEach((d, i) => {
    setTimeout(() => d.bark(2 + ((Math.random() * 2) | 0)), i * 180);
    const off = new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2);
    d.chase(t.root, { speed: rand(7, 8.8), offset: off.add(S.roadAhead(0).right.clone().multiplyScalar(side * rand(1.6, 2.6))), until: () => S.taxiPos().distanceTo(startPos) > rand(90, 115) || S.taxiPos().distanceTo(d.root.position) > 22 });
  });
  const barkLoop = (async () => {
    while (E.alive && dogs.some((d) => d.move?.chase)) {
      await E.wait(rand(0.5, 1.1));
      const d = dogs[(Math.random() * dogs.length) | 0];
      if (d.move?.chase) d.bark(1);
    }
  })();
  await E.until(() => dogs.every((d) => !d.move), E.duration + 6);
  void barkLoop;
  if (!E.alive) return;
  // proud trot home, one last bark
  dogs.forEach((d) => {
    d.lookAt(null);
    d.bark(1);
    d.walkTo(d.home, { speed: rand(1.8, 2.6) });
  });
  await E.wait(6);
}
