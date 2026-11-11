// The radio reads your licence plate (rule 15): it clicks on by itself and sweeps through static to a
// flat announcer: this taxi's plate, a crash at the Hundred Corpses Curve tonight at 04:44, the driver
// dead at the scene — "ชื่อต้น". The radio has said your name: retune at once, never switch it off.
import { RULE_PARAMS } from '../../data/rules.js';
import { S, onControl, rand, g } from '../helpers.js';

export function canStart() {
  return S.cameraInside();
}

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  const knob = t.anchors?.radioKnob || t.root;
  if (!t.state?.radioOn) await t.setControl?.('radio', true, { source: 'ghost' });
  const radio = g.audio?.radio;
  E.cleanup(() => radio?.setStatic?.(0));
  // tuning itself: the dial sweeps, static swells
  for (let i = 0; i < 4 && E.alive; i++) {
    S.sfx('radio_tune', { object: knob, volume: 0.6, rate: rand(0.8, 1.2) });
    radio?.setStatic?.(0.5 + i * 0.12);
    await E.wait(rand(0.35, 0.6));
  }
  if (!E.alive) return;
  radio?.setStatic?.(0.35);
  E.event('encounter:plateRadio');
  await E.say(E.def.lines, { object: knob });
  if (!E.alive) return;
  // the name was said: rule 15
  E.arm({});
  radio?.setStatic?.(0.6);
  if (E.managed) {
    await E.until(() => !!E.outcomeKey, RULE_PARAMS.radioNameTuneSeconds + 8);
    return;
  }
  let retuned = false, off = false;
  onControl(E, 'radioTune', () => (retuned = true));
  onControl(E, 'radio', (v) => !v && (off = true));
  await E.until(() => retuned || off, RULE_PARAMS.radioNameTuneSeconds);
  if (!E.alive) return;
  if (retuned) E.report('resolved', { outcome: 'retuned' });
  else E.violate('lookBack', off ? 'switchedOff' : 'ignored');
}
