// Ride 6: while the monk chants a blessing over the car, every ghost along the road glows faintly
// gold for a moment and raises its hands in a wai as the taxi passes.
import { createWindowGhost, createCreatureHumanoid, CREATURE_SPECS } from '../../../creatures/index.js';
import { S, THREE, rand, goldGlow } from '../helpers.js';

export async function run(E) {
  const chant = E.track(S.sfxLoop('monk_chant', { object: E.taxi?.anchors?.rearLeftSeat || E.taxi?.root, volume: 0.7 }));
  void chant;
  const pf = E.g.postfx?.params;
  const amulet0 = pf?.amulet ?? 0;
  E.cleanup(() => pf && (pf.amulet = amulet0));
  const specs = [CREATURE_SPECS.windowWoman, CREATURE_SPECS.phiTaiHongM, { ...(S.CHARACTERS.boyM?.appearance || CREATURE_SPECS.windowWoman), id: 'boyM_bless' }, CREATURE_SPECS.tallMan, { ...(S.CHARACTERS.womanWhite?.appearance || CREATURE_SPECS.windowWoman), id: 'ww_bless' }];
  const ghosts = [];
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1;
    const r = S.roadAhead(25 + i * 22 + rand(-4, 4), side * rand(4.8, 7));
    const h = E.track(createCreatureHumanoid(specs[i % specs.length]));
    S.engine.scene.add(h.root);
    h.root.position.copy(r.pos);
    h.root.rotation.y = Math.atan2(side * r.right.x, side * r.right.z); // facing the road
    h.setGhost({ stare: 0.3, levitate: 0.05 }, 100);
    h.setOpacity(0);
    ghosts.push({ h, pos: r.pos.clone(), wai: false, a: 0 });
  }
  E.event('encounter:monkBlessing');
  const lines = E.def.whispers || [];
  let li = 0;
  E.frame((dt, el) => {
    if (pf) pf.amulet = Math.min(0.35, el * 0.12) * (el < E.duration - 1 ? 1 : 0);
    for (const g of ghosts) {
      const d = S.distTo(g.pos);
      const want = d < 60 ? 1 : 0;
      g.a += (want - g.a) * (1 - Math.exp(-dt * 1.2));
      g.h.setOpacity(g.a * 0.85);
      goldGlow(g.h, g.a);
      if (!g.wai && d < 22) {
        g.wai = true;
        g.h.play('wai', { level: 'face' });
        if (li < lines.length) E.whisper(lines[li++], g.pos.clone().add(new THREE.Vector3(0, 1.5, 0)));
      }
    }
  });
  await E.wait(E.duration);
  for (const g of ghosts) g.h.setOpacity(0);
}
