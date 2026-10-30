// Rule 15: DJ Nok's cheerful voice slows and drops an octave mid-sentence and says your name.
// Retune within five seconds. Switching off, answering, or doing nothing: the same voice goes on
// from the back seat — "ต้น… หันมาสิ" — and that is a rule-3 test.
import { RULE_PARAMS } from '../../data/rules.js';
import { S, THREE, onControl } from '../helpers.js';

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  if (!t.state?.radioOn) await t.setControl?.('radio', true, { source: 'ghost' });
  const radioObj = t.anchors?.radioKnob || t.root;
  E.arm({ tuneSeconds: RULE_PARAMS.radioNameTuneSeconds });
  if (!E.managed) {
    onControl(E, 'radioTune', () => !E.outcomeKey && E.outcome('retuned'));
    onControl(E, 'radio', (v) => !v && !E.outcomeKey && E.outcome('switchedOff'));
  }
  try {
    E.g.audio?.radio?.setStatic?.(0.35);
  } catch (e) { /* optional */ }
  E.cleanup(() => {
    try {
      E.g.audio?.radio?.setStatic?.(0);
    } catch (e) { /* optional */ }
  });
  const lines = E.resolve(E.def.lines);
  await E.say(lines, { object: radioObj });
  if (!E.alive) return;
  E.event('encounter:radioName');
  const rest = null;
  const tuned = await E.until(() => !!E.outcomeKey, RULE_PARAMS.radioNameTuneSeconds + 3);
  if (!E.alive) return;
  if (!tuned && !E.outcomeKey) {
    const key = await E.ask();
    if (key === 'answer' && !E.outcomeKey) E.outcome('answer');
    if (!E.outcomeKey && !E.managed) E.outcome('ignored');
  }
  void rest;
  if (E.managed) {
    // B decides retuned / switchedOff / ignored and runs the back-seat escalation itself
    await E.until(() => !!E.outcomeKey, 8);
    await E._outcomeP;
    return;
  }
  await E._outcomeP;
  if (E.outcomeKey === 'retuned' || !E.alive) return;
  // escalate: backSeatVoice — rule 3
  const seat = t.seats?.rearRight || t.anchors?.rearRightSeat;
  const voice = new THREE.Object3D();
  (t.bodyInner || t.root).add(voice);
  voice.position.set(0.32, 1.05, 0.95);
  E.track(voice);
  E.report('warn', { stage: 'backSeatVoice', ruleId: 'r3' });
  E.g.rules?.arm?.('r3', { encounter: E.id, until: E.done, params: { backSeatEvent: true } });
  const call = [
    { who: 'voice', th: 'ต้น…', en: 'Ton…', tone: 'whisper' },
    { who: 'voice', th: 'ต้น… หันมาสิ', en: 'Ton… turn around.', tone: 'whisper' },
  ];
  let looked = false;
  E.frame(() => {
    if (!looked && S.lookingBack()) looked = true;
    void seat;
  });
  for (const l of call) {
    if (!E.alive || looked) break;
    await E.whisper(l, voice.getWorldPosition(new THREE.Vector3()));
    await E.wait(1.2);
  }
  await E.until(() => looked, 6);
  if (!E.alive) return;
  if (looked) E.violate('lookBack', 'backSeatVoice');
  else E.report('resolved', { stage: 'backSeatVoice', ruleId: 'r3' });
}
