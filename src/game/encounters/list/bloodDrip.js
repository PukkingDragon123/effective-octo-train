// Rule 13: dark drops fall from the roof edge onto the top of the windshield, then thin runnels.
// Wipers OFF within the grace time; let it run. Each wipe smears it and shows more of what hangs
// from the roof (wet hair, a hand); wipe long enough and it slides down onto the glass.
import { RULE_PARAMS } from '../../data/rules.js';
import { createWindowGhost, CREATURE_SPECS, paneFrame, panePoint, toBody, bodyOf } from '../../../creatures/index.js';
import { S, THREE, rand } from '../helpers.js';

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  if (E.g.save?.flags) E.g.save.flags.bloodOnGlass = true;
  E.cleanup(() => E.g.save?.flags && delete E.g.save.flags.bloodOnGlass);
  E.arm({ wiperGraceSeconds: RULE_PARAMS.bloodWiperGraceSeconds, wipeFailSeconds: RULE_PARAMS.bloodWipeFailSeconds });
  E.event('encounter:bloodDrip');
  const drip = (u, s = 1) => {
    try {
      t.addGlassMark('windshield', 'blood_drip', new THREE.Vector2(u, 0.97), { size: s });
    } catch (e) { /* optional */ }
    S.sfx('splash', { object: t.anchors?.roofTop || t.root, volume: 0.12, rate: 2.2 });
  };
  // what hangs from the roof: hair and a hand, lowered a little more with every wipe
  const w = E.track(createWindowGhost({ spec: CREATURE_SPECS.roofCrawler }));
  const h = w.humanoid;
  const body = bodyOf(t);
  body.add(w.root);
  const ws = paneFrame(t, 'windshield');
  const top = toBody(t, panePoint(ws, 0.12, 0.5, 0, new THREE.Vector3()), new THREE.Vector3());
  const shoulders = (h.look?.height ?? 1.75) * 0.82;
  h.root.rotation.set(-Math.PI / 2, 0, 0);
  const zHide = top.z + shoulders + 0.45;
  h.root.position.set(top.x, top.y + 0.14, zHide);
  h.setGhost({ headPitch: 0.6, stare: 1, unlimited: 1 }, 100);
  h.lookAt(S.engine.camera, { speed: 1, unlimited: true });
  let reveal = 0;
  E.frame((dt) => {
    h.root.position.z = zHide - reveal * 0.55;
    h.setGhost({ headPitch: 0.6 + reveal * 1.0 }, 10);
  });
  // the drops come, slowly at first
  let wipe = 0, first = E.elapsed;
  const u0 = rand(0.35, 0.7);
  drip(u0, 1.1);
  first = E.elapsed;
  let nextDrip = 0.7;
  const res = await E.until((dt, el) => {
    nextDrip -= dt;
    if (nextDrip <= 0) {
      nextDrip = rand(0.5, 1.4);
      drip(u0 + rand(-0.18, 0.18), rand(0.8, 1.3));
      if (Math.random() < 0.35) E.whisperRandom(S.fromTaxi(0.2, 1.45, -0.6));
    }
    const wipers = (t.state?.wipers ?? 0) > 0;
    if (wipers && el - first > RULE_PARAMS.bloodWiperGraceSeconds) {
      if (wipe === 0) E.event('wipersOn');
      wipe += dt;
      reveal = Math.min(1, wipe / RULE_PARAMS.bloodWipeFailSeconds);
      if (wipe > RULE_PARAMS.bloodWipeFailSeconds * 0.5 && !E._warned) {
        E._warned = true;
        E.report('warn');
        S.sfx('thump_roof', { object: t.root, volume: 0.6 });
      }
    }
    return wipe > RULE_PARAMS.bloodWipeFailSeconds;
  }, E.duration);
  if (!E.alive) return;
  if (res) {
    E.outcome('wiped');
    await E._outcomeP;
    return;
  }
  E.outcome('letRun');
}
