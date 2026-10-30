// Rule 7: a voice outside calls "ต้น..." — first sweet (Mum's voice), then wrong — moving around the
// car. Don't answer. Stopping and opening a window while it calls is answering too.
import { RULE_PARAMS } from '../../data/rules.js';
import { S, THREE, rand } from '../helpers.js';

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  E.arm({ stopSpeedKmh: RULE_PARAMS.nameCallStopSpeedKmh });
  // the voice circles the car outside
  const orbit = new THREE.Object3D();
  S.engine.scene.add(orbit);
  E.track(orbit);
  let ang = rand(0, Math.PI * 2);
  E.frame((dt) => {
    ang += dt * 0.55;
    orbit.position.copy(S.fromTaxi(Math.cos(ang) * 2.6, 1.3, Math.sin(ang) * 3.2));
  });
  // a breath of fog on whichever pane it passes
  let fogT = 0;
  E.frame((dt) => {
    fogT -= dt;
    if (fogT > 0) return;
    fogT = 0.6;
    const panes = ['fl', 'rl', 'rear', 'rr', 'fr', 'windshield'];
    const i = ((((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * panes.length;
    t.addBreathFog?.(panes[Math.min(panes.length - 1, i | 0)], orbit.position, 0.45);
  });
  // watch for the window: stopped + a window open = answering
  E.frame(() => {
    if (E.outcomeKey || E.managed) return;
    const w = t.state?.windows || {};
    const open = Object.values(w).some((a) => a > RULE_PARAMS.windowOpenFailAmount);
    if (open && t.speedKmh < RULE_PARAMS.nameCallStopSpeedKmh) E.outcome('windowOpened');
  });
  for (const line of E.resolve(E.def.lines)) {
    if (!E.alive || E.outcomeKey) break;
    await E.say([line], { object: orbit });
    await E.wait(rand(0.6, 1.4));
  }
  if (!E.alive) return;
  E.event('encounter:nameCall'); // the ride's beat after the voice's own lines
  if (!E.outcomeKey) {
    const key = await E.ask();
    if (key && !E.outcomeKey) E.outcome(key);
  }
  if (!E.outcomeKey) {
    await E.until(() => !!E.outcomeKey, Math.max(2, E.duration - E.elapsed));
    if (!E.outcomeKey) E.outcome('silent');
  }
  if (!E.managed) E.event(E.outcomeKey === 'answer' || E.outcomeKey === 'windowOpened' ? 'nameCallAnswered' : 'nameCallIgnored');
  await E.outcomeSet;
  await E._outcomeP;
}
