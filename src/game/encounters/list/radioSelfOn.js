// Ride 4, rule 6: the radio switches itself on: static, then a warped children's counting song.
// Boy M asks for it off. Turn it off within the grace time; leave it and it escalates (his
// reflection's neck twists), then "Off... off... OFF...".
import { RULE_PARAMS } from '../../data/rules.js';
import { S, onControl } from '../helpers.js';

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  if (!t.state?.radioOn) await t.setControl?.('radio', true, { source: 'ghost' });
  try {
    E.g.audio?.radio?.setStatic?.(0.75);
  } catch (e) { /* optional */ }
  E.cleanup(() => {
    try {
      E.g.audio?.radio?.setStatic?.(0);
    } catch (e) { /* optional */ }
  });
  E.arm({ graceSeconds: RULE_PARAMS.radioGraceSeconds, escalateSeconds: RULE_PARAMS.radioEscalateSeconds });
  E.event('radioOn');
  E.event('encounter:radioSelfOn');
  onControl(E, 'radio', (v) => {
    if (!v && !E.outcomeKey) E.outcome('off');
  });
  E.say(E.def.lines);
  const off = await E.until(() => !!E.outcomeKey || !t.state?.radioOn, RULE_PARAMS.radioGraceSeconds);
  if (!E.alive) return;
  if (off || !t.state?.radioOn) {
    if (!E.outcomeKey) E.outcome('off');
    return;
  }
  // grace expired: escalation
  E.event('radioIgnored');
  E.report('warn', { stage: 'escalate' });
  if (E.passengerId === 'boyM' && !E.director.isRunning('twistedNeckReflection')) E.director.start('twistedNeckReflection', { ride: E.ride, passenger: E.ctx.passenger, scheduled: true, duration: RULE_PARAMS.radioEscalateSeconds });
  try {
    E.g.audio?.radio?.setStatic?.(1);
  } catch (e) { /* optional */ }
  const off2 = await E.until(() => !!E.outcomeKey || !t.state?.radioOn, RULE_PARAMS.radioEscalateSeconds);
  if (!E.alive) return;
  if (off2 || !t.state?.radioOn) {
    if (!E.outcomeKey) E.outcome('off');
    return;
  }
  E.outcome('ignored');
  await E.wait(1);
}
