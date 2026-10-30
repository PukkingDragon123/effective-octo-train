// Rule 11: the meter rolls to ๔๔๔ and freezes, digits glowing red. Stop within the grace time; then
// for ten seconds keep your eyes off every mirror and window (looking down at the dash is safe)
// while a voice outside counts along the car, window to window. At four it asks how far YOU have
// got. Count in your head. After midnight something taps on the glass meanwhile (windowKnock).
// Exception: with the monk aboard the number is just a number.
import { RULE_PARAMS } from '../../data/rules.js';
import { checkCond } from '../../data/logic.js';
import { S, THREE } from '../helpers.js';

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  t.setMeterGlitch?.({ mode: 'text', text: '444.00' });
  E.cleanup(() => t.setMeterGlitch?.(null));
  E.event('meter444');
  E.event('meterGlitch');
  if (E.passengerId === 'monk') {
    E.report('start', { exception: true });
    E.event('encounter:meter444');
    await E.wait(4);
    E.outcome('monkAboard');
    return;
  }
  E.arm({ stopWithinSeconds: RULE_PARAMS.meter444StopWithinSeconds, stopSpeedKmh: RULE_PARAMS.meter444StopSpeedKmh, countSeconds: RULE_PARAMS.meter444CountSeconds, lookDownPitchDeg: RULE_PARAMS.meter444LookDownPitchDeg });
  E.event('encounter:meter444');
  S.sfx('meter_beep', { object: t.anchors?.meter || t.root, volume: 0.8, count: 3, interval: 0.25 });
  // 1. stop in time
  const stopped = await E.until(() => t.speedKmh < RULE_PARAMS.meter444StopSpeedKmh, RULE_PARAMS.meter444StopWithinSeconds);
  if (!E.alive) return;
  if (!stopped) {
    E.outcome('didntStop');
    await E._outcomeP;
    return;
  }
  // 2. the count (eyes off the glass); chains windowKnock after midnight
  const cs = E.def.chains || [];
  const t0 = E.elapsed;
  for (const c of cs) {
    E.wait(c.atSecond).then(() => {
      if (!E.alive || E.outcomeKey) return;
      if (c.if && !checkCond(c.if, { save: E.g.save, hour: S.hour() })) return;
      E.director.start(c.id, { ride: E.ride, passenger: E.ctx.passenger, scheduled: true, chained: true });
    });
  }
  const voice = new THREE.Object3D();
  S.engine.scene.add(voice);
  E.track(voice);
  const spots = [[-1.4, 1.2, -0.3], [-1.4, 1.2, 0.8], [0, 1.1, 2.6], [1.4, 1.2, 0.8]];
  let looked = false, lookT = 0;
  E.frame((dt) => {
    if (E.outcomeKey) return;
    const glass = S.lookingAtGlass(true) && !S.lookingDown();
    if (glass) lookT += dt;
    else lookT = Math.max(0, lookT - dt);
    if (lookT > 0.25 && !E._warned) {
      E._warned = true;
      E.report('warn');
    }
    if (lookT > 0.7) looked = true;
    if (looked) E.outcome('lookedAtGlass');
    // moving off again counts as not stopping
    if (t.speedKmh > 12) E.outcome('didntStop');
  });
  const lines = E.resolve(E.def.countLines || []);
  for (let i = 0; i < lines.length && E.alive && !E.outcomeKey; i++) {
    voice.position.copy(S.fromTaxi(...spots[i % spots.length]));
    S.sfx('footstep_gravel', { position: voice.position, volume: 0.4 });
    E.whisper(lines[i], voice.position.clone());
    await E.wait(Math.max(0.9, (RULE_PARAMS.meter444CountSeconds * 0.55) / lines.length));
  }
  if (!E.alive || E.outcomeKey) {
    await E._outcomeP;
    return;
  }
  const key = await E.ask();
  if (key && !E.outcomeKey) E.outcome(key);
  // the rest of the ten seconds
  await E.until(() => !!E.outcomeKey, Math.max(0.5, RULE_PARAMS.meter444CountSeconds - (E.elapsed - t0)));
  if (!E.outcomeKey) E.outcome('silent');
  await E._outcomeP;
}
