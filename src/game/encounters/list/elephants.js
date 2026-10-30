// Elephant family crossing (04:00, ride 8 / the elephant crossing): mother, aunt and a calf cross
// in the blue-hour mist. The calf stops in the lane to look at the headlights, then hurries after
// its mother. Honk and they answer softly. (Rule 12's exception: an animal in the road — stop and wait.)
import { createAnimal } from '../../../creatures/index.js';
import { S, THREE, onControl, rand } from '../helpers.js';

export const stationary = true;

export async function run(E) {
  const lm = S.landmark('elephantCrossing');
  let from, to;
  const tr = lm?.trail;
  const v = (p) => (p?.isVector3 ? p.clone() : p ? new THREE.Vector3(p.x, p.y ?? 0, p.z) : null);
  if (tr?.from && tr?.to && lm.pos && S.aheadOf(v(lm.pos)) > 25 && S.distTo(v(lm.pos)) < 150) {
    from = v(tr.from);
    to = v(tr.to);
  } else {
    const d = E.ctx.distance ?? rand(42, 55);
    from = S.roadAhead(d, -15).pos;
    to = S.roadAhead(d + 4, 15).pos;
  }
  const gf = (x, z) => S.ground(x, z, from.y);
  const dir = to.clone().sub(from).setY(0).normalize();
  const yaw = Math.atan2(-dir.x, -dir.z);
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const mother = E.track(createAnimal('elephant', { groundFn: gf }));
  const aunt = E.track(createAnimal('elephant', { groundFn: gf, scale: 0.94, tint: 0xe8e2dc }));
  const calf = E.track(createAnimal('elephantCalf', { groundFn: gf }));
  for (const a of [mother, aunt, calf]) S.engine.scene.add(a.root);
  mother.place(from.clone(), yaw);
  aunt.place(from.clone().addScaledVector(dir, -5.5).addScaledVector(side, 1.2), yaw);
  calf.place(from.clone().addScaledVector(dir, -2.4).addScaledVector(side, -1.4), yaw);
  E.event('elephants');
  E.event('encounter:elephants');
  mother.rumble();
  const end = to.clone().addScaledVector(dir, 8);
  const pm = mother.followPath([from.clone().addScaledVector(dir, 6), end], { speed: 0.95 });
  aunt.follow(mother, new THREE.Vector3(-1.2, 0, 5.5), { speed: 1.4 });
  calf.follow(mother, new THREE.Vector3(1.0, 0, 2.6), { speed: 2.2 });
  // the calf stops in the lane to look at the headlights
  let calfStopped = false;
  E.frame(() => {
    if (calfStopped) return;
    const r = S.roadAhead(0);
    const lat = calf.root.position.clone().sub(S.taxiPos()).dot(r.right);
    if (Math.abs(lat + 1.55) < 1.6) {
      calfStopped = true;
      calf.stopMoving();
      calf.lookAt(E.taxi?.anchors?.headlightL || E.taxi?.root);
      calf.mood = 0.6;
      (async () => {
        await E.wait(rand(2.5, 3.5));
        if (!E.alive) return;
        calf.lookAt(mother.root);
        calf.trumpet();
        calf.follow(mother, new THREE.Vector3(1.0, 0, 2.6), { speed: 2.6 });
      })();
    }
  });
  onControl(E, 'horn', (on) => {
    if (!on) return;
    mother.trumpet();
    setTimeout(() => aunt.trumpet(), 500);
  });
  mother.lookAt(E.taxi?.root || null);
  setTimeout(() => mother.lookAt(null), 4000);
  await Promise.race([pm, E.wait(E.duration + 25)]);
  await E.wait(6);
}
