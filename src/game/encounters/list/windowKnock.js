// Rule 14 (after midnight): three soft knocks on the window. Through the fogged glass, a dark shape
// with an unlit cigarette, too tall, its face never in focus. It asks for a lighter. Rolling the
// window down past 30 % while it waits = a long grey arm reaches in. Saying "แป๊บนึงครับ" is an
// invitation: the window starts winding itself down until you crank it back up.
import { RULE_PARAMS } from '../../data/rules.js';
import { createWindowGhost, CREATURE_SPECS } from '../../../creatures/index.js';
import { S } from '../helpers.js';

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  const pane = E.ctx.pane || (E.passengerId && S.passengerSeat(E.ctx) === 'frontPassenger' ? 'fl' : 'fr');
  const win = pane;
  E.deathCtx = { pane };
  E.arm({ window: win, openFailAmount: RULE_PARAMS.windowOpenFailAmount });
  const w = E.track(createWindowGhost({ spec: CREATURE_SPECS.tallMan }));
  const perf = w.perform('knockWindow', { taxi: t, pane, duration: E.duration + 6, onKnock: (i) => i === 0 && E.event('encounter:windowKnock') });
  void perf;
  // opening the window while it waits
  const open0 = t.state?.windows?.[win] ?? 0;
  E.frame(() => {
    if (E.outcomeKey && E.outcomeKey !== 'invite') return;
    const a = t.state?.windows?.[win] ?? 0;
    if (!E._creeping && !E.managed && a > Math.max(open0, RULE_PARAMS.windowOpenFailAmount)) E.outcome('windowOpened');
  });
  await E.wait(2.2);
  if (!E.alive) return;
  for (const l of E.resolve(E.def.lines)) {
    if (!E.alive || E.outcomeKey) break;
    await E.whisper(l, S.fromTaxi(pane === 'fl' ? -1.1 : 1.1, 1.3, -0.1));
    await E.wait(0.4);
  }
  if (!E.alive) return;
  if (!E.outcomeKey) {
    const key = await E.ask();
    if (key && !E.outcomeKey) E.outcome(key);
  }
  await E.until(() => !!E.outcomeKey, Math.max(2, E.duration - E.elapsed));
  if (!E.outcomeKey) E.outcome('silent');
  if (E.outcomeKey === 'invite' && !E.managed) {
    // escalate: windowCreep — the window winds itself down until it is cranked back up
    E._creeping = true;
    let maxAmt = t.state?.windows?.[win] ?? 0;
    let cranked = false;
    E.report('warn', { stage: 'windowCreep' });
    await t.setControl?.('window', { window: win, amount: 1 }, { source: 'ghost', speed: RULE_PARAMS.windowCreepPerSec });
    const limit = RULE_PARAMS.windowCreepCrankSeconds + RULE_PARAMS.windowOpenFailAmount / RULE_PARAMS.windowCreepPerSec;
    const ok = await E.until(() => {
      const a = t.state?.windows?.[win] ?? 0;
      if (a > maxAmt) maxAmt = a;
      if (a < maxAmt - 0.03) cranked = true;
      return cranked;
    }, limit);
    if (!E.alive) return;
    if (!ok && !cranked) {
      E.violate('windowArm', 'invite');
      return;
    }
    E.report('resolved', { outcome: 'cranked' });
  }
  await E._outcomeP;
  await E.wait(2);
}
