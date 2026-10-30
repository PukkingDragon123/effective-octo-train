// Rule 15's exception (03:00, station 3): an announcer reads one old request — from Somchai, for
// his son ต้น. The radio says your name, and this is the one time you do not retune: listen to the
// end ("ทางกลับบ้าน", memory m_song). Retuning or switching off is safe, only a loss.
import { SPECIAL_BROADCASTS } from '../../data/radio.js';
import { S, onControl, bus } from '../helpers.js';

export function canStart() {
  return (S.taxi()?.state?.radioStation ?? 0) === 3;
}

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  if (!t.state?.radioOn) await t.setControl?.('radio', true, { source: 'ghost' });
  if ((t.state?.radioStation ?? 0) !== 3) await t.setControl?.('radioTune', 3, { source: 'ghost' });
  const bc = (SPECIAL_BROADCASTS || []).find((b) => b.id === E.def.broadcast) || null;
  const radioObj = t.anchors?.radioKnob || t.root;
  E.report('start', { exception: true });
  E.event('encounter:fatherDedication');
  onControl(E, 'radioTune', () => !E.outcomeKey && E.outcome('retuned'));
  onControl(E, 'radio', (v) => !v && !E.outcomeKey && E.outcome('retuned'));
  if (bc?.lines?.length) await E.say(bc.lines, { object: radioObj });
  if (!E.alive) return;
  const ok = await E.until(() => !!E.outcomeKey, Math.max(8, E.duration - E.elapsed));
  if (!E.alive) return;
  if (!ok && !E.outcomeKey) {
    E.outcome('listened');
    const mem = bc?.memory || 'm_song';
    bus.emit('memory:found', { id: mem, source: E.id });
    try {
      (E.g.knowledge?.addMemory || E.g.knowledge?.found || E.g.knowledge?.collect)?.call(E.g.knowledge, mem);
    } catch (e) { /* B's knowledge API */ }
  }
}
