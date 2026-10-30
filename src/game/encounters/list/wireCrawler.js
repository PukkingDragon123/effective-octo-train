// The wire crawler (22–01): a long-limbed grey thing crawls along the sagging electrical wires
// overhead, belly up, its head twisted round to watch the road; a dying lamp lights it in pulses.
import { createWireCrawler } from '../../../creatures/index.js';
import { S, THREE, findWire, catenary, rand } from '../helpers.js';

export function canStart() {
  return !!findWire({ minAhead: 30, maxAhead: 120 });
}

export async function run(E) {
  let pts = E.ctx.wire || findWire({ minAhead: 30, maxAhead: 120 });
  if (!pts) {
    if (E.scheduled) {
      // no poles here: string the crawl along a cable over the road (sandbox / odd stretches)
      const a = S.roadAhead(40, -4.6).pos.add(new THREE.Vector3(0, 7.6, 0));
      const b = S.roadAhead(85, -4.6).pos.add(new THREE.Vector3(0, 7.6, 0));
      pts = catenary(a, b, 1.1);
    } else return;
  }
  const w = E.track(createWireCrawler());
  S.engine.scene.add(w.root);
  // crawl toward the car
  const head = pts[0], tail = pts[pts.length - 1];
  const toward = S.aheadOf(head) > S.aheadOf(tail);
  const crawl = w.crawlAlong(pts, rand(1.1, 1.6), toward ? { from: 0.05, to: 0.95 } : { from: 0.95, to: 0.05 });
  // a dying lamp under the wire, pulsing
  const mid = pts[(pts.length / 2) | 0].clone();
  const lamp = E.track(S.tempLight({ position: mid.clone().add(new THREE.Vector3(0, -1.2, 0)), kind: 'fluorescent', color: 0xdfffe8, intensity: 0, distance: 16, decay: 1.7, flicker: 'dying', glow: { size: 0.5, opacity: 0.8 }, priority: 5 }));
  const buzz = E.track(S.sfxLoop('electric_buzz', { position: mid, volume: 0.5 }));
  void buzz;
  let seen = false;
  E.frame((dt, t) => {
    const pulse = Math.max(0, Math.sin(t * 7.3) * Math.sin(t * 2.1 + 1)) > 0.25 ? 1 : 0.08;
    lamp?.setIntensity(60 * pulse);
    if (!seen && S.onScreen(w.humanoid.headPosition)) {
      seen = true;
      E.event('encounter:wireCrawler');
      S.sfx('sting_low', { position: mid, volume: 0.6 });
    }
  });
  await Promise.race([crawl, E.wait(E.duration + 6)]);
  if (E.alive) await w.vanish(1.0);
}
