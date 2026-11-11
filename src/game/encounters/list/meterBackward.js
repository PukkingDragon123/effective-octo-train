// The meter runs backwards (rule 2, ghost rides): the digits roll down to 0.00 and then show a date
// long past: the fare was used up long ago, she is already dead. "จอดตรงนี้แหละ ฉันลงตรงนี้".
// Rule 2: every road ends at Ma Ruay Shrine. Let her off here and the door opens by itself, and she
// takes you with her (death dragBack). Keep driving, or tell her the shrine, and the meter comes back.
import { S, rand, g } from '../helpers.js';

export function canStart() {
  return !!S.taxi()?.state?.meterOn && g.ride?.phase === 'riding';
}

const GLITCH = { glitch: { mode: 'glitch' }, backward: { mode: 'backward' }, oldDate: { mode: 'date' }, normal: null };

export async function run(E) {
  const t = E.taxi;
  if (!t?.controls) return;
  const clue = E.ride?.data?.clues?.meter || 'normal';
  const fare0 = Math.max(35, t.controls.fare || 35);
  t.setMeterGlitch?.({ mode: 'backward' });
  E.cleanup(() => {
    t.setMeterGlitch?.(GLITCH[clue] ?? null);
    if (t.controls) t.controls.fare = Math.max(t.controls.fare, fare0);
  });
  S.sfx('meter_beep', { object: t.anchors?.meter || t.root, volume: 0.6, rate: 0.7 });
  // rolling down fast, beeping lower and lower
  let beep = 0;
  const zero = await E.until((dt) => {
    t.controls.fare = Math.max(0, t.controls.fare - dt * (fare0 / 7));
    beep -= dt;
    if (beep <= 0) {
      beep = 0.9;
      S.sfx('meter_beep', { object: t.anchors?.meter || t.root, volume: 0.35, rate: 0.5 + (t.controls.fare / fare0) * 0.5 });
    }
    return t.controls.fare <= 0;
  }, 12);
  if (!E.alive || !zero) return;
  // a date long past
  t.setMeterGlitch?.({ mode: 'date', date: E.ctx.date || '04-11-2547' });
  E.event('encounter:meterBackward');
  E.report('start');
  await E.say(E.def.lines);
  if (!E.alive) return;
  // her request: stopping counts as letting her off
  let still = 0;
  E.frame((dt) => {
    if (E.outcomeKey) return;
    still = S.speedKmh() < 3 ? still + dt : 0;
    if (still > 2.5) E.outcome('stopped');
  });
  const key = await E.ask();
  if (key && !E.outcomeKey) E.outcome(key);
  await E.until(() => !!E.outcomeKey, Math.max(4, E.duration - E.elapsed));
  if (!E.outcomeKey) E.outcome('silent');
  await E._outcomeP;
  if (!E.alive) return;
  if (E.outcomeKey === 'stop' || E.outcomeKey === 'stopped') {
    // the door opens on its own; cold pours in
    const door = { rearLeft: 'rl', rearRight: 'rr', frontPassenger: 'fl' }[S.passengerSeat(E.ctx)] || 'rl';
    t.openDoor?.(door, 0.6, 1.4);
    S.sfx('door_open', { object: t.root, volume: 0.6, rate: 0.8 });
    await E.wait(10);
    return;
  }
  S.sfx('meter_beep', { object: t.anchors?.meter || t.root, volume: 0.5, rate: 1.1 });
  E.report('resolved', { outcome: E.outcomeKey });
  await E.wait(rand(1, 2));
}
