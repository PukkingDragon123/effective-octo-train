// Shadows behind the sala (21–24): two or three dark figures slip between the pillars of the
// roadside pavilion as the taxi passes. Never in full view: looked at directly they thin to nothing.
import { createCreatureHumanoid, CREATURE_SPECS } from '../../../creatures/index.js';
import { S, THREE, rand, engine } from '../helpers.js';

export async function run(E) {
  const key = ['sala1', 'sala2'].map((k) => [k, S.landmarkPos(k)]).filter(([, p]) => p).sort((a, b) => S.distTo(a[1]) - S.distTo(b[1]))[0];
  let centre, spots = [];
  const lm = key ? S.landmark(key[0]) : null;
  if (lm) {
    centre = key[1];
    const sp = lm.prop?.shadowSpots || lm.anchors?.shadowSpots || null;
    if (Array.isArray(sp)) spots = sp.map((o) => (o.isObject3D ? o.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(o.x, o.y ?? 0, o.z)));
  } else {
    const a = S.roadAhead(45, -9);
    centre = a.pos;
  }
  if (!spots.length) {
    const r = S.roadAhead(0, 0);
    for (let i = 0; i < 3; i++) spots.push(centre.clone().addScaledVector(r.tangent, (i - 1) * 2.2).addScaledVector(r.right, -(3 + i * 0.4)));
  }
  const n = 2 + (Math.random() < 0.5 ? 1 : 0);
  const figs = [];
  for (let i = 0; i < n; i++) {
    const h = E.track(createCreatureHumanoid(CREATURE_SPECS.shadowFigure));
    engine.scene.add(h.root);
    const p = spots[i % spots.length].clone();
    p.y = S.ground(p.x, p.z, p.y);
    h.root.position.copy(p);
    h.setOpacity(0);
    h.setGhost({ stare: 1, still: 0.5 }, 100);
    figs.push({ h, p, next: spots[(i + 1) % spots.length].clone(), t: rand(0, 1.5) });
  }
  E.event('encounter:salaShadows');
  await E.until((dt) => {
    for (const f of figs) {
      const head = f.h.root.position.clone().add(new THREE.Vector3(0, 1.6, 0));
      const near = S.distTo(head) < 45 && S.aheadOf(head) > -12;
      const direct = S.isLooking(head, 9);
      const want = near && !direct ? 0.85 : 0;
      f.h.setOpacity(want > f.h.opacity ? Math.min(want, f.h.opacity + dt * 0.8) : Math.max(0, f.h.opacity - dt * (direct ? 4 : 1)));
      f.t -= dt;
      if (f.t <= 0 && !f.walking) {
        f.walking = true;
        f.h.walkTo(f.next, { speed: rand(0.9, 1.6) }).then(() => (f.walking = false));
        f.t = rand(1.5, 3);
      }
    }
    return S.aheadOf(centre) < -15;
  }, E.duration + 25);
}
