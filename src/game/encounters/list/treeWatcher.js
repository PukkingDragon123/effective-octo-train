// Tree watcher (21–23, side windows only): a pale figure stands among the trunks 8–15 m off the
// road. It is only there while you see it through a side window; look straight at it (> 0.4 s) and
// it is gone, then it waits again 60–90 m further on, same side, a little closer.
import { createWindowGhost, CREATURE_SPECS } from '../../../creatures/index.js';
import { S, THREE, stare, rand } from '../helpers.js';

export async function run(E) {
  const side = Math.random() < 0.55 ? -1 : 1;
  const g = E.track(createWindowGhost({ spec: Math.random() < 0.7 ? CREATURE_SPECS.windowWoman : CREATURE_SPECS.tallMan }));
  const h = g.humanoid;
  let shown = false;
  for (let round = 0; round < 2 && E.alive; round++) {
    const spot = S.roadAhead(round === 0 ? rand(35, 50) : rand(60, 90), side * (round === 0 ? rand(10, 15) : rand(8, 11)));
    const perf = g.perform('treeWatch', { pos: spot.pos, duration: 60 });
    h.setOpacity(0);
    const seen = stare(spot.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 7, 0.4);
    let visibleT = 0;
    const gone = await E.until((dt) => {
      const head = spot.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
      const rel = head.clone().sub(S.taxiPos());
      const fwd = S.taxiForward();
      const ang = Math.acos(Math.max(-1, Math.min(1, rel.setY(0).normalize().dot(fwd))));
      // present only when it would be seen through a side window (not the windshield)
      const inSide = ang > 0.95 && ang < 2.2 && S.distTo(spot.pos) < 40;
      h.setOpacity(inSide ? Math.min(1, h.opacity + dt * 1.5) : Math.max(0, h.opacity - dt * 3));
      if (inSide && h.opacity > 0.5) {
        visibleT += dt;
        if (!shown) {
          shown = true;
          E.event('encounter:treeWatcher');
        }
      }
      return seen(dt) && h.opacity > 0.3;
    }, E.duration + 12);
    g.stop();
    await perf;
    if (gone) {
      h.setOpacity(0);
      S.sfx('sting_low', { position: spot.pos, volume: 0.5 });
      E.whisperRandom(spot.pos);
    } else break;
    if (visibleT < 0.1 && round === 0) continue;
  }
}
