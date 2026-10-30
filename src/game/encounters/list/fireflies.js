// Fireflies (02–05): clouds of them pulsing in slow sync over the ditch and the banana leaves.
import { S, THREE, rand } from '../helpers.js';

export const stationary = true;

export async function run(E) {
  const n = 2 + ((Math.random() * 2) | 0);
  const hs = [];
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    const r = S.roadAhead(rand(15, 55), side * rand(5, 9));
    try {
      const h = E.g.particles?.emit?.('fireflies', { position: r.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), radius: rand(8, 13), height: rand(2, 3.5), intensity: 0 });
      if (h) hs.push(E.track(h));
    } catch (e) { /* optional */ }
  }
  E.event('encounter:fireflies');
  E.frame((dt, el) => {
    const k = Math.min(1, el / 3) * Math.min(1, Math.max(0, (E.duration - el) / 3));
    for (const h of hs) h.setIntensity(k);
  });
  await E.wait(E.duration);
}
