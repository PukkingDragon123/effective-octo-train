// Ride 7, rule 13's exception: Uncle Saman spits betel juice "out of the window" straight through
// the closed glass and the wind spatters it red across the windshield. It looks exactly like the
// blood of rule 13, but it is only betel: wiping is safe. Not wiping is safe too.
import { S, THREE, rand } from '../helpers.js';

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  E.report('start', { exception: true });
  S.sfx('splash', { object: t.anchors?.rearLeftSeat || t.root, volume: 0.35, rate: 1.4 });
  await E.wait(0.35);
  for (let i = 0; i < 5; i++) {
    try {
      t.addGlassMark('windshield', i < 2 ? 'blood_splatter' : 'blood_drip', new THREE.Vector2(rand(0.15, 0.55), rand(0.45, 0.85)), { size: rand(0.8, 1.3), tint: 'betel' });
    } catch (e) { /* optional */ }
  }
  E.event('encounter:betelSpit');
  const wiped = await E.until(() => (t.state?.wipers ?? 0) > 0, E.duration);
  if (!E.alive) return;
  E.outcome(wiped ? 'wiped' : 'letRun');
}
